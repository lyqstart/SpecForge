import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReconnectingDaemonClient as WorkspaceClient } from "../../src/plugin/reconnecting-daemon-client";
import { ReconnectingDaemonClient as DeployedClient } from "../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client";

describe.each([
  ["workspace", WorkspaceClient],
  ["deployable", DeployedClient],
] as const)("%s registration refusal contract", (_label, Client) => {
  let directory: string, client: InstanceType<typeof Client>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sf-register-error-"));
    const handshake = join(directory, "handshake.json");
    await writeFile(
      handshake,
      JSON.stringify({
        schema_version: "1.0",
        pid: 1,
        port: 9,
        token: "synthetic-secret-never-log",
        bound_to: "127.0.0.1",
        startedAt: 0,
        version: "1.0.25",
        serviceMode: false,
        artifact_contract_versions: { task_document: "task-document/v1" },
      }),
    );
    client = new Client({ handshakePath: handshake });
  });
  afterEach(async () => {
    client.dispose();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    { error: "PROJECT_NOT_INITIALIZED" },
    { error: { code: "PROJECT_NOT_INITIALIZED" } },
  ])(
    "preserves status and a validated structured business code",
    async (body) => {
      const fetch = vi.fn(
        async () => new Response(JSON.stringify(body), { status: 409 }),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(client.register("/owned/synthetic")).rejects.toMatchObject({
        name: "DaemonRegistrationError",
        status: 409,
        code: "PROJECT_NOT_INITIALIZED",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 429, 503])(
    "preserves HTTP%s without inventing an initialization refusal",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        async () => new Response("unstructured failure", { status }),
      );
      await expect(client.register("/owned/synthetic")).rejects.toMatchObject({
        status,
        code: "REGISTER_FAILED",
      });
    },
  );

  it.each([null, [], { success: true, data: {} }, { success: true, data: { sessionId: 1, projectId: "p", mode: "personal" } }, { success: true, data: { sessionId: "s", projectId: "p", mode: "unknown" } }])("rejects malformed registration success bodies without exposing raw data", async body => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body)));
    await expect(client.register("/owned/synthetic")).rejects.toThrow("Register returned unexpected response");
  });

  it("accepts the exact owner registration identity", async () => {
    const identity = { sessionId: "accepted", projectId: "owned-project", mode: "personal" };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ success: true, data: identity })));
    await expect(client.register("/owned/synthetic")).resolves.toEqual(identity);
  });

  if (_label === "deployable") {
    it.each([null, {}, { success: true, data: { allowed: "true" } }])("fails closed for malformed native guard responses", async body => {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body)));
      if (!("checkNativeTool" in client)) throw new Error("DEPLOYABLE_GUARD_REQUIRED");
      await expect(client.checkNativeTool("/owned/synthetic", "write", {})).rejects.toThrow("WRITE_GUARD_DENIED");
    });
  }

  it("does not echo raw response bodies or unvalidated codes into diagnostic errors", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: "BAD\nCODE synthetic-secret-never-log",
            details: "synthetic-secret-never-log",
          }),
          { status: 409 },
        ),
    );
    try {
      await client.register("/owned/synthetic");
      throw new Error("EXPECTED_REFUSAL");
    } catch (error) {
      expect(error).toMatchObject({ code: "REGISTER_FAILED", status: 409 });
      expect(String(error)).not.toContain("synthetic-secret-never-log");
    }
  });
});

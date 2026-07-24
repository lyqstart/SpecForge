/**
 * sf_work_item_repair_closure handler unit tests
 *
 * Verifies the fail-closed repair of a Work Item's root-level closure skeleton
 * (tasks.md / trace_delta.md):
 *  - restores root markers only when the authoritative candidate exists non-empty
 *  - refuses (fail-closed) when the candidate is missing/empty
 *  - never overwrites an existing root file (idempotent)
 *  - never advances state / never touches project truth source
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { getHandler } from "../../src/tools/ToolDispatcher";
import "../../src/tools/handlers/sf-work-item-repair-closure";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("sf_work_item_repair_closure", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_work_item_repair_closure")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-repair-closure-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const wiDir = (wiId: string) => path.join(tempDir, ".specforge", "work-items", wiId);
  const candidates = (wiId: string) => path.join(wiDir(wiId), "candidates");

  async function seedWorkItem(
    wiId: string,
    opts: { tasksCandidate?: string | null; traceCandidate?: string | null } = {},
  ): Promise<void> {
    await fs.mkdir(wiDir(wiId), { recursive: true });
    await fs.writeFile(
      path.join(wiDir(wiId), "work_item.json"),
      JSON.stringify({ work_item_id: wiId, workflow_type: "feature_spec" }),
    );
    await fs.mkdir(candidates(wiId), { recursive: true });
    if (opts.tasksCandidate !== null && opts.tasksCandidate !== undefined) {
      await fs.writeFile(path.join(candidates(wiId), "tasks.md"), opts.tasksCandidate);
    }
    if (opts.traceCandidate !== null && opts.traceCandidate !== undefined) {
      await fs.writeFile(path.join(candidates(wiId), "trace_delta.md"), opts.traceCandidate);
    }
  }

  it("restores root tasks.md and trace_delta.md when candidates exist non-empty", async () => {
    await seedWorkItem("WI-0001", {
      tasksCandidate: "# Tasks\n\nTASK-1 real content",
      traceCandidate: "# Trace Delta\n\nTrace Impact: REQ-1 -> TASK-1",
    });

    const result = await handler({ work_item_id: "WI-0001" }, { directory: tempDir }, {});

    expect(result.success).toBe(true);
    expect(result.state_changed).toBe(false);
    expect(result.repaired).toEqual(expect.arrayContaining(["tasks.md", "trace_delta.md"]));

    const rootTasks = path.join(wiDir("WI-0001"), "tasks.md");
    const rootTrace = path.join(wiDir("WI-0001"), "trace_delta.md");
    await expect(fs.access(rootTasks)).resolves.toBeUndefined();
    await expect(fs.access(rootTrace)).resolves.toBeUndefined();

    // trace_delta marker must retain a "Trace Impact" line so validators tolerate it
    const traceContent = await fs.readFile(rootTrace, "utf-8");
    expect(traceContent).toContain("Trace Impact");
  });

  it("is idempotent: never overwrites an existing root file", async () => {
    await seedWorkItem("WI-0002", {
      tasksCandidate: "# Tasks\n\nreal",
      traceCandidate: "# Trace Delta\n\nTrace Impact: none",
    });
    const rootTasks = path.join(wiDir("WI-0002"), "tasks.md");
    const original = "# Tasks\n\nPRE-EXISTING ROOT CONTENT";
    await fs.writeFile(rootTasks, original);

    const result = await handler({ work_item_id: "WI-0002" }, { directory: tempDir }, {});

    expect(result.success).toBe(true);
    expect(result.present).toContain("tasks.md");
    expect(result.repaired).toContain("trace_delta.md");
    expect(await fs.readFile(rootTasks, "utf-8")).toBe(original);
  });

  it("fail-closed: refuses to restore when the authoritative candidate is missing", async () => {
    // trace_delta candidate present, tasks candidate absent
    await seedWorkItem("WI-0003", {
      tasksCandidate: null,
      traceCandidate: "# Trace Delta\n\nTrace Impact: none",
    });

    const result = await handler({ work_item_id: "WI-0003" }, { directory: tempDir }, {});

    expect(result.success).toBe(false);
    const refusedFiles = result.refused.map((r: any) => r.file);
    expect(refusedFiles).toContain("tasks.md");
    // root tasks.md must NOT have been created
    await expect(fs.access(path.join(wiDir("WI-0003"), "tasks.md"))).rejects.toBeTruthy();
    // trace_delta was repairable and should exist
    expect(result.repaired).toContain("trace_delta.md");
  });

  it("fail-closed: refuses when candidate exists but is empty", async () => {
    await seedWorkItem("WI-0004", {
      tasksCandidate: "   \n  ",
      traceCandidate: "   ",
    });

    const result = await handler({ work_item_id: "WI-0004" }, { directory: tempDir }, {});

    expect(result.success).toBe(false);
    const refusedFiles = result.refused.map((r: any) => r.file);
    expect(refusedFiles).toEqual(expect.arrayContaining(["tasks.md", "trace_delta.md"]));
    await expect(fs.access(path.join(wiDir("WI-0004"), "tasks.md"))).rejects.toBeTruthy();
    await expect(fs.access(path.join(wiDir("WI-0004"), "trace_delta.md"))).rejects.toBeTruthy();
  });

  it("refuses an unknown Work Item (no work_item.json)", async () => {
    // create only the dir, no work_item.json
    await fs.mkdir(wiDir("WI-0005"), { recursive: true });

    const result = await handler({ work_item_id: "WI-0005" }, { directory: tempDir }, {});

    expect(result.success).toBe(false);
    expect(result.code).toBe("WORK_ITEM_NOT_FOUND");
  });

  it("requires work_item_id", async () => {
    const result = await handler({}, { directory: tempDir }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("work_item_id");
  });
});

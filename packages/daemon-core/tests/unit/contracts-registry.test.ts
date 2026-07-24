/**
 * contracts-registry read helper — unit tests.
 *
 * Verifies brownfield-safe reading of the `contracts` block inside
 * .specforge/project/extension_registry.json and the membership helpers.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readContractsRegistry,
  hasAnyContracts,
  findSharedEnum,
  isRegisteredEnumValue,
  getEnumOwner,
} from "../../src/tools/lib/contracts-registry";

describe("contracts-registry read helper", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sf-contracts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(path.join(tempDir, ".specforge", "project"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function writeRegistry(obj: unknown): Promise<void> {
    await fs.writeFile(
      path.join(tempDir, ".specforge", "project", "extension_registry.json"),
      JSON.stringify(obj, null, 2),
    );
  }

  it("returns empty registry when the registry file does not exist (brownfield-safe)", () => {
    const reg = readContractsRegistry(tempDir);
    expect(reg.shared_enums).toEqual([]);
    expect(reg.invariants).toEqual([]);
    expect(reg.public_interfaces).toEqual([]);
    expect(reg.extension_points).toEqual([]);
    expect(hasAnyContracts(reg)).toBe(false);
  });

  it("returns empty registry when a legacy registry has no contracts block (backward-compat)", async () => {
    await writeRegistry({
      schema_version: "1.0",
      project_spec_version: "PSV-0001",
      namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
      updated_by_work_item: null,
      updated_at: null,
    });
    const reg = readContractsRegistry(tempDir);
    expect(hasAnyContracts(reg)).toBe(false);
  });

  it("never throws on malformed JSON — yields empty registry", async () => {
    await fs.writeFile(
      path.join(tempDir, ".specforge", "project", "extension_registry.json"),
      "{ this is not valid json",
    );
    const reg = readContractsRegistry(tempDir);
    expect(hasAnyContracts(reg)).toBe(false);
  });

  it("reads registered shared enums and resolves membership + owner", async () => {
    await writeRegistry({
      schema_version: "1.0",
      project_spec_version: "PSV-0001",
      namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
      updated_by_work_item: "WI-0001",
      updated_at: "2026-07-24T00:00:00Z",
      contracts: {
        shared_enums: [
          { id: "PhotoStatus", owner_module: "CORE", values: ["pending", "uploaded", "failed"] },
        ],
        invariants: [
          { id: "MUST_USE_PATH_SERVICE", rule: "all file writes via PathService", scope: "global", owner_module: "CORE" },
        ],
        public_interfaces: [],
        extension_points: [
          { id: "CameraPort", owner_module: "CORE", interface: "CameraProvider", extend_by: "implement + inject via CameraPortProvider" },
        ],
      },
    });

    const reg = readContractsRegistry(tempDir);
    expect(hasAnyContracts(reg)).toBe(true);
    expect(reg.shared_enums).toHaveLength(1);
    expect(reg.invariants).toHaveLength(1);
    expect(reg.extension_points).toHaveLength(1);

    expect(findSharedEnum(reg, "PhotoStatus")?.owner_module).toBe("CORE");
    expect(isRegisteredEnumValue(reg, "PhotoStatus", "uploaded")).toBe(true);
    expect(isRegisteredEnumValue(reg, "PhotoStatus", "invented_value")).toBe(false);
    expect(isRegisteredEnumValue(reg, "UnknownEnum", "x")).toBe(false);
    expect(getEnumOwner(reg, "PhotoStatus")).toBe("CORE");
    expect(getEnumOwner(reg, "UnknownEnum")).toBeUndefined();
  });

  it("tolerates a contracts block with missing/partial arrays", async () => {
    await writeRegistry({
      schema_version: "1.0",
      project_spec_version: "PSV-0001",
      namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
      updated_by_work_item: null,
      updated_at: null,
      contracts: { shared_enums: [{ id: "S", owner_module: "CORE", values: ["a"] }] },
    });
    const reg = readContractsRegistry(tempDir);
    expect(reg.shared_enums).toHaveLength(1);
    expect(reg.invariants).toEqual([]);
    expect(reg.public_interfaces).toEqual([]);
    expect(reg.extension_points).toEqual([]);
  });
});

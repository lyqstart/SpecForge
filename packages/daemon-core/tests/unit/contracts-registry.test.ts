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
  readUnifiedContracts,
  resolveCodePathModules,
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

  it("reads numeric shared enums without coercing their values", async () => {
    await writeRegistry({
      schema_version: "1.0",
      project_spec_version: "PSV-0001",
      namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
      updated_by_work_item: "WI-0009",
      updated_at: "2026-07-26T00:00:00Z",
      contracts: {
        shared_enums: [
          {
            id: "SyncErrorCode",
            owner_module: "SYNC",
            value_type: "number",
            values: [4004, 4006, 4007, 4008],
          },
        ],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    });

    const reg = readContractsRegistry(tempDir);
    expect(findSharedEnum(reg, "SyncErrorCode")?.values).toEqual([4004, 4006, 4007, 4008]);
    expect(isRegisteredEnumValue(reg, "SyncErrorCode", 4004)).toBe(true);
    expect(isRegisteredEnumValue(reg, "SyncErrorCode", "4004")).toBe(false);
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

describe('unified Project and Module Contract registry', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('reads both governance levels without creating a consumer registry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-unified-contracts-'));
    roots.push(root);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      modules: [
        {
          module_code: 'ORDER',
          contracts: '.specforge/project/modules/ORDER/contracts.json',
          code_paths: ['src/order/**'],
        },
      ],
    });
    await writeJson(path.join(project, 'extension_registry.json'), {
      contracts: {
        shared_enums: [
          {
            id: 'PCON-STATUS-001',
            owner_module: 'CORE',
            values: ['ready'],
            source_refs: ['DD-CORE-001'],
            enforcement: 'unit_test',
          },
        ],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    });
    await writeJson(path.join(project, 'modules', 'ORDER', 'contracts.json'), {
      schema_version: '1.0',
      owner_module: 'ORDER',
      contracts: {
        shared_enums: [],
        invariants: [
          {
            id: 'MCON-ORDER-001',
            owner_module: 'ORDER',
            rule: 'total >= 0',
            source_refs: ['DD-ORDER-001'],
            enforcement: 'unit_test',
          },
        ],
        public_interfaces: [],
        extension_points: [],
      },
    });

    const result = readUnifiedContracts(root);

    expect(result.errors).toEqual([]);
    expect(result.contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'PCON-STATUS-001',
          governance_level: 'project',
          owner_module: 'CORE',
        }),
        expect.objectContaining({
          id: 'MCON-ORDER-001',
          governance_level: 'module',
          owner_module: 'ORDER',
        }),
      ]),
    );
    expect(result.contracts.every(contract => !('consumers' in contract))).toBe(true);
    expect(resolveCodePathModules(root, 'src/order/service.ts')).toEqual(['ORDER']);
  });

  it('fails closed when one Contract ID has multiple formal definitions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-duplicate-contracts-'));
    roots.push(root);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      modules: [
        {
          module_code: 'ORDER',
          contracts: '.specforge/project/modules/ORDER/contracts.json',
          code_paths: ['src/order/**'],
        },
      ],
    });
    const duplicate = {
      id: 'PCON-DUP-001',
      owner_module: 'ORDER',
      values: ['ready'],
      source_refs: ['DD-ORDER-001'],
      enforcement: 'unit_test',
    };
    await writeJson(path.join(project, 'extension_registry.json'), {
      contracts: {
        shared_enums: [duplicate],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    });
    await writeJson(path.join(project, 'modules', 'ORDER', 'contracts.json'), {
      schema_version: '1.0',
      owner_module: 'ORDER',
      contracts: {
        shared_enums: [duplicate],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
      },
    });

    const result = readUnifiedContracts(root);
    expect(result.errors.join('\n')).toContain('multiple formal definitions');
  });

  it('keeps an undeclared missing legacy Module Contract file compatibility-safe', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-legacy-contracts-'));
    roots.push(root);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      modules: [{ module_code: 'LEGACY', code_paths: ['src/legacy/**'] }],
    });
    await writeJson(path.join(project, 'extension_registry.json'), { contracts: {} });

    const result = readUnifiedContracts(root);
    expect(result.errors).toEqual([]);
    expect(result.module_registries.LEGACY).toBeDefined();
  });

  it('blocks an explicitly declared missing Module Contract file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-missing-contracts-'));
    roots.push(root);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      modules: [
        {
          module_code: 'ORDER',
          contracts: '.specforge/project/modules/ORDER/contracts.json',
          code_paths: ['src/order/**'],
        },
      ],
    });
    await writeJson(path.join(project, 'extension_registry.json'), { contracts: {} });

    const result = readUnifiedContracts(root);
    expect(result.errors.join('\n')).toContain('modules/ORDER/contracts.json');
  });
});

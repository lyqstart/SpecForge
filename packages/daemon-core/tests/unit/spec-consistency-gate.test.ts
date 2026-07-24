/**
 * spec_consistency_gate (step 3a) — unit tests.
 *
 * The gate reconciles `[contract:KIND:ID( owner=OWNER)?]` references declared in
 * the design candidate against the registered contracts in
 * .specforge/project/extension_registry.json. Brownfield-safe: no registered
 * contracts -> skip/pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runGate } from "../../src/tools/lib/gate-runner-v11";

describe("spec_consistency_gate — contract reference reconciliation", () => {
  let projectRoot: string;
  const workItemId = "WI-0001";

  beforeEach(async () => {
    projectRoot = path.join(os.tmpdir(), `sf-scg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(path.join(projectRoot, ".specforge", "project"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function writeRegistry(contracts: unknown): Promise<void> {
    const data: Record<string, unknown> = {
      schema_version: "1.0",
      project_spec_version: "PSV-0001",
      namespaces: { requirement_types: [], design_types: [], task_types: [], verification_types: [], gate_types: [] },
      updated_by_work_item: null,
      updated_at: null,
    };
    if (contracts !== undefined) data.contracts = contracts;
    await fs.writeFile(
      path.join(projectRoot, ".specforge", "project", "extension_registry.json"),
      JSON.stringify(data, null, 2),
    );
  }

  async function writeDesign(content: string): Promise<void> {
    const dir = path.join(projectRoot, ".specforge", "work-items", workItemId, "candidates", "project", "modules", "CORE");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "design.candidate.md"), content);
  }

  const ctx = () => ({
    workItemId,
    workItemDir: path.join(projectRoot, ".specforge", "work-items", workItemId),
    projectRoot,
  });

  const withEnum = {
    shared_enums: [{ id: "PhotoStatus", owner_module: "CORE", values: ["pending", "uploaded"] }],
    invariants: [],
    public_interfaces: [],
    extension_points: [{ id: "CameraPort", owner_module: "CORE", interface: "CameraProvider", extend_by: "impl+inject" }],
  };

  it("passes (brownfield) when no contracts are registered", async () => {
    await writeRegistry({ shared_enums: [], invariants: [], public_interfaces: [], extension_points: [] });
    await writeDesign("# Design\n\nuses [contract:shared_enum:PhotoStatus owner=CORE]");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("passed");
  });

  it("passes (brownfield) when registry has no contracts block at all", async () => {
    await writeRegistry(undefined);
    await writeDesign("# Design\n\nsome design");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("passed");
  });

  it("passes when design declares no contract references", async () => {
    await writeRegistry(withEnum);
    await writeDesign("# Design\n\nno references here");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("passed");
  });

  it("passes when a declared reference resolves with matching owner", async () => {
    await writeRegistry(withEnum);
    await writeDesign("# Design\n\nDD-1 uses [contract:shared_enum:PhotoStatus owner=CORE] and [contract:extension_point:CameraPort]");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("passed");
  });

  it("fails when a referenced contract does not exist (do not invent)", async () => {
    await writeRegistry(withEnum);
    await writeDesign("# Design\n\nuses [contract:shared_enum:InventedStatus owner=CORE]");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("failed");
    expect(report.blocking_issues.join(" ")).toContain("InventedStatus");
  });

  it("fails when the declared owner does not match the registry", async () => {
    await writeRegistry(withEnum);
    await writeDesign("# Design\n\nuses [contract:shared_enum:PhotoStatus owner=OTHER]");
    const report = await runGate("spec_consistency_gate", ctx());
    expect(report.status).toBe("failed");
    expect(report.blocking_issues.join(" ")).toContain("owner");
  });
});

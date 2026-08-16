/**
 * sf_state_transition handler unit tests
 *
 * Covers the current v1.1/v1.2 architecture:
 *  - project initialization guard (manifest.json) on the create transition
 *  - StateManager authority: transitions route through
 *    projectManager.getProjectStateManager().transition() (NOT
 *    workflowEngine.transitionFull, which was removed to avoid a dual state writer)
 *  - forbidden / invalid transition rejection
 *  - implementation_running -> implementation_done audit guard
 *  - verification_done -> closed seal + close-gate evidence enforcement
 *  - closure-file skeleton initialization on the create path
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { getHandler } from "../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect
import "../../src/tools/handlers/sf-state-transition";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { captureSemanticClosureProvenance } from "../../src/tools/lib/semantic-closure-provenance";

/**
 * Build a deps object whose ProjectManager returns a StateManager with a
 * spy-able transition(). This mirrors the real execution path
 * (transitionWithEvidence -> projectManager.getProjectStateManager().transition()).
 */
function makeStateManagerDeps(options?: {
  transitionError?: Error;
  currentState?: string | null;
}) {
  const smTransition = options?.transitionError
    ? vi.fn().mockRejectedValue(options.transitionError)
    : vi.fn().mockResolvedValue(undefined);
  const stateManager: Record<string, any> = { transition: smTransition };
  if (options && Object.prototype.hasOwnProperty.call(options, "currentState")) {
    stateManager.getState = vi.fn().mockResolvedValue(options.currentState);
    stateManager.rebuildFromEventsFile = vi.fn().mockResolvedValue({ replayed: true });
  }
  const getProjectStateManager = vi.fn().mockResolvedValue(stateManager);
  // transitionFull is intentionally provided to prove it is NEVER called.
  const transitionFull = vi.fn().mockResolvedValue({});
  return {
    deps: {
      workflowEngine: { transitionFull },
      projectManager: { getProjectStateManager },
    },
    smTransition,
    getProjectStateManager,
    transitionFull,
    stateManager,
  };
}

async function writeManifest(
  dir: string,
  projectSpecVersion = "PSV-0001",
): Promise<void> {
  const specforgeDir = path.join(dir, ".specforge");
  const projectDir = path.join(specforgeDir, "project");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(specforgeDir, "manifest.json"), "{}");
  await fs.writeFile(
    path.join(projectDir, "spec_manifest.json"),
    JSON.stringify(
      {
        schema_version: "1.0",
        project_spec_version: projectSpecVersion,
        modules: [],
      },
      null,
      2,
    ) + "\n",
  );
}

function wiDirFor(root: string, wiId: string): string {
  return path.join(root, ".specforge", "work-items", wiId);
}

// =========================================================================
// Project initialization guard
// =========================================================================

describe("sf_state_transition - project initialization guard", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns PROJECT_NOT_INITIALIZED when creating a WI (from=''->created) without manifest.json", async () => {
    const { deps } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "", to_state: "created", workflow_type: "feature_spec" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("PROJECT_NOT_INITIALIZED");
    expect(result.recovery_action).toBe("execute_startup_flow");
  });

  it("rejects the legacy from=''->intake transition (v1.1 uses 'created')", async () => {
    const { deps } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "", to_state: "intake" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("LEGACY_INTAKE_STATE_FORBIDDEN");
  });

  it("does NOT apply the init guard to a non-create transition (guard is create-only)", async () => {
    // No manifest.json; a non-empty fromState must skip the manifest guard.
    const { deps, smTransition } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "intake_ready", to_state: "impact_analyzing" },
      { directory: tempDir },
      deps,
    );

    expect(result.error).not.toBe("PROJECT_NOT_INITIALIZED");
    expect(result.success).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
  });

  it("proceeds with creation when manifest.json exists", async () => {
    await writeManifest(tempDir);
    const { deps, smTransition } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "", to_state: "created", workflow_type: "feature_spec" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
  });


});

// =========================================================================
// StateManager authority + transition contract
// =========================================================================

describe("sf_state_transition - StateManager authority and transition contract", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    await writeManifest(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("routes transitions through StateManager, never workflowEngine.transitionFull", async () => {
    const { deps, smTransition, transitionFull } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "intake_ready", to_state: "impact_analyzing" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.state_authority).toBe("StateManager");
    expect(result.workflow_engine_transition_full_used).toBe(false);
    expect(smTransition).toHaveBeenCalledTimes(1);
    expect(transitionFull).not.toHaveBeenCalled();
  });

  it("passes correct from/to/workItemId to StateManager.transition", async () => {
    const { deps, smTransition } = makeStateManagerDeps();

    await handler(
      { work_item_id: "WI-0007", from_state: "intake_ready", to_state: "impact_analyzing" },
      { directory: tempDir },
      deps,
    );

    expect(smTransition).toHaveBeenCalledTimes(1);
    const callArgs = smTransition.mock.calls[0];
    // signature: transition(workItemId, fromState, toState, actorRole, workflowType, meta)
    expect(callArgs[0]).toBe("WI-0007");
    expect(callArgs[1]).toBe("intake_ready");
    expect(callArgs[2]).toBe("impact_analyzing");
  });

  it("rejects a forbidden transition (created -> implementation_running)", async () => {
    const { deps, smTransition } = makeStateManagerDeps();

    const result = await handler(
      {
        work_item_id: "WI-0002",
        from_state: "created",
        to_state: "implementation_running",
        use_v11_state_machine: true,
      },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.forbidden).toBe(true);
    expect(smTransition).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition (intake_ready -> closed)", async () => {
    const { deps, smTransition } = makeStateManagerDeps();

    const result = await handler(
      {
        work_item_id: "WI-0003",
        from_state: "intake_ready",
        to_state: "closed",
        use_v11_state_machine: true,
      },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid v1.1 transition");
    expect(smTransition).not.toHaveBeenCalled();
  });

  it("rejects an invalid work_item_id format (must be WI-NNNN)", async () => {
    const { deps } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-1", from_state: "intake_ready", to_state: "impact_analyzing" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_WORK_ITEM_ID");
  });

  it("returns projectPath error when context has no directory/worktree", async () => {
    const { deps } = makeStateManagerDeps();

    const result = await handler(
      { work_item_id: "WI-0001", from_state: "intake_ready", to_state: "impact_analyzing" },
      {}, // no directory / worktree
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("projectPath");
  });

  it("returns 'ProjectManager not available' when deps has no projectManager", async () => {
    const result = await handler(
      { work_item_id: "WI-0001", from_state: "intake_ready", to_state: "impact_analyzing" },
      { directory: tempDir },
      {}, // no projectManager
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("ProjectManager not available");
  });

  it("blocks implementation_running -> implementation_done without a passing changed_files_audit.md", async () => {
    const { deps, smTransition } = makeStateManagerDeps();
    // WI dir exists but has no changed_files_audit.md
    await fs.mkdir(wiDirFor(tempDir, "WI-0004"), { recursive: true });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "implementation_running",
        to_state: "implementation_done",
        use_v11_state_machine: true,
      },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("IMPLEMENTATION_AUDIT_NOT_PASSED");
    expect(smTransition).not.toHaveBeenCalled();
  });
});

// =========================================================================
// spec_migration verification recovery: verification_done -> post_merge_verified
// =========================================================================

describe("sf_state_transition - spec_migration verification recovery", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-spec-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    await writeManifest(tempDir, "PSV-0003");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeSpecMigrationRecoveryFixture(workItemId: string): Promise<string> {
    const wiDir = wiDirFor(tempDir, workItemId);
    await fs.mkdir(path.join(wiDir, "candidates", "project", "modules", "CORE"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(wiDir, "work_item.json"),
      JSON.stringify(
        {
          work_item_id: workItemId,
          status: "verification_done",
          workflow_type: "spec_migration",
          workflow_path: "spec_migration_path",
        },
        null,
        2,
      ) + "\n",
    );
    await fs.writeFile(
      path.join(wiDir, "candidate_manifest.json"),
      JSON.stringify(
        {
          schema_version: "1.1",
          work_item_id: workItemId,
          workflow_type: "spec_migration",
          workflow_path: "spec_migration_path",
          base_spec_version: "PSV-0002",
          project_spec_precondition_sha256: `sha256:${"a".repeat(64)}`,
          repair_evidence_paths: [".specforge/project/architecture.md"],
          merge_required: true,
          entries: [
            {
              type: "module_definition",
              candidate_path: "candidates/project/modules/CORE/module.candidate.json",
              target_path: ".specforge/project/modules/CORE/module.json",
              operation: "replace",
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    const closure: any = {
      schema_version: "1.0",
      work_item_id: workItemId,
      outcomes: [],
      requirements: [],
      design_decisions: [],
      tasks: [],
      evidence: [],
      project_integration: { status: "merged" },
    };
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir: wiDir,
      source: "test",
      manifest: closure,
    });
    await fs.writeFile(
      path.join(wiDir, ".semantic_closure.json"),
      JSON.stringify(closure, null, 2) + "\n",
    );
    return wiDir;
  }

  it("allows only stale-provenance spec_migration recovery and rejects recovery while provenance is current", async () => {
    const workItemId = "WI-9010";
    const wiDir = await writeSpecMigrationRecoveryFixture(workItemId);
    const { deps, smTransition } = makeStateManagerDeps({ currentState: "verification_done" });

    const currentResult = await handler(
      {
        work_item_id: workItemId,
        from_state: "verification_done",
        to_state: "post_merge_verified",
        workflow_type: "spec_migration",
        workflow_path: "spec_migration_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );
    expect(currentResult.success).toBe(false);
    expect(currentResult.error).toContain("provenance is current");
    expect(smTransition).not.toHaveBeenCalled();

    await fs.writeFile(
      path.join(wiDir, "candidates", "trace_delta.md"),
      "# Trace Delta\n\nADD_EDGES=0\nREMOVE_EDGES=0\n",
    );

    const staleResult = await handler(
      {
        work_item_id: workItemId,
        from_state: "verification_done",
        to_state: "post_merge_verified",
        workflow_type: "spec_migration",
        workflow_path: "spec_migration_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );
    expect(staleResult.success).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
    expect(smTransition.mock.calls[0]?.[1]).toBe("verification_done");
    expect(smTransition.mock.calls[0]?.[2]).toBe("post_merge_verified");
    expect(smTransition.mock.calls[0]?.[4]).toBe("spec_migration");
  });
});

// =========================================================================
// verification_done -> closed: seal transition + close-gate evidence
// =========================================================================

describe("sf_state_transition - close (verification_done -> closed)", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-close-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    await writeManifest(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function writeAllCloseEvidence(wiDir: string): Promise<void> {
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "verification_report.md"), "# VR\nevidence");
    await fs.writeFile(path.join(wiDir, "changed_files_audit.md"), "# Audit");
    await fs.writeFile(path.join(wiDir, "close_gate.md"), "# Close Gate");
  }

  const closeArgs = (wiId: string) => ({
    work_item_id: wiId,
    from_state: "verification_done",
    to_state: "closed",
    use_v11_state_machine: true,
  });

  it("rejects close when verification_report.md is missing", async () => {
    const { deps, smTransition } = makeStateManagerDeps();
    const wiDir = wiDirFor(tempDir, "WI-0001");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "changed_files_audit.md"), "# Audit");
    await fs.writeFile(path.join(wiDir, "close_gate.md"), "# Close Gate");

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Close gate evidence requirements not met");
    expect(result.missing_evidence).toContain("verification_report.md");
    expect(smTransition).not.toHaveBeenCalled();
  });

  it("rejects close when changed_files_audit.md is missing", async () => {
    const { deps } = makeStateManagerDeps();
    const wiDir = wiDirFor(tempDir, "WI-0001");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "verification_report.md"), "# VR");
    await fs.writeFile(path.join(wiDir, "close_gate.md"), "# Close Gate");

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(false);
    expect(result.missing_evidence).toContain("changed_files_audit.md");
  });

  it("rejects close when neither close_gate.md nor close_gate.json exists", async () => {
    const { deps } = makeStateManagerDeps();
    const wiDir = wiDirFor(tempDir, "WI-0001");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "verification_report.md"), "# VR");
    await fs.writeFile(path.join(wiDir, "changed_files_audit.md"), "# Audit");

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(false);
    expect(result.missing_evidence).toContain("close_gate.md");
  });

  it("reports all three files missing when the WI dir is empty", async () => {
    const { deps } = makeStateManagerDeps();
    await fs.mkdir(wiDirFor(tempDir, "WI-0001"), { recursive: true });

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(false);
    expect(result.missing_evidence).toHaveLength(3);
    expect(result.missing_evidence).toEqual(
      expect.arrayContaining(["verification_report.md", "changed_files_audit.md", "close_gate.md"]),
    );
  });

  it("accepts close_gate.json as an alternative to close_gate.md", async () => {
    const { deps, smTransition } = makeStateManagerDeps();
    const wiDir = wiDirFor(tempDir, "WI-0001");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "verification_report.md"), "# VR");
    await fs.writeFile(path.join(wiDir, "changed_files_audit.md"), "# Audit");
    await fs.writeFile(path.join(wiDir, "close_gate.json"), '{"status":"passed"}');

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
  });

  it("succeeds when all evidence is present and actor is close_gate", async () => {
    const { deps, smTransition } = makeStateManagerDeps();
    await writeAllCloseEvidence(wiDirFor(tempDir, "WI-0001"));

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "close_gate" }, deps);

    expect(result.success).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
  });

  it("rejects close by a non-close_gate actor (seal transition)", async () => {
    const { deps, smTransition } = makeStateManagerDeps();
    await writeAllCloseEvidence(wiDirFor(tempDir, "WI-0001"));

    const result = await handler(closeArgs("WI-0001"), { directory: tempDir, agent: "sf-orchestrator" }, deps);

    expect(result.success).toBe(false);
    expect(result.seal_transition).toBe(true);
    expect(result.required_actor).toBe("close_gate");
    expect(smTransition).not.toHaveBeenCalled();
  });
});

// =========================================================================
// Regression: sf_state_transition create path (from=""->created) must
// initialize lifecycle files without synthesizing duplicate root tasks/trace
// placeholders. Those artifacts are authored only under candidates/.
// =========================================================================

describe("sf_state_transition - closure file initialization on create", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-closure-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    // Simulate an initialized project (manifest.json present)
    await writeManifest(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Non-Candidate lifecycle files initialized at the WI root.
  const REQUIRED_ROOT_FILES = [
    "work_item.json",
    "change_classification.md",
    "impact_analysis.md",
    "trigger_result.json",
    "candidate_manifest.json",
    "gate_summary.md",
    "merge_report.md",
  ];

  it("creates lifecycle files without duplicate root tasks/trace placeholders", async () => {
    const { deps } = makeStateManagerDeps();

    await handler(
      { work_item_id: "WI-0001", from_state: "", to_state: "created", workflow_type: "feature_spec" },
      { directory: tempDir },
      deps,
    );

    const wiDir = wiDirFor(tempDir, "WI-0001");
    for (const f of REQUIRED_ROOT_FILES) {
      await fs.access(path.join(wiDir, f));
    }
    await expect(fs.access(path.join(wiDir, "tasks.md"))).rejects.toBeTruthy();
    await expect(fs.access(path.join(wiDir, "trace_delta.md"))).rejects.toBeTruthy();
    await expect(fs.access(path.join(wiDir, "verification_report.md"))).rejects.toBeTruthy();
    await expect(
      fs.access(path.join(wiDir, "evidence", "evidence_manifest.json")),
    ).rejects.toBeTruthy();
  });

  it("backfills lifecycle files without synthesizing Candidate artifacts", async () => {
    const wiDir = wiDirFor(tempDir, "WI-0002");
    await fs.mkdir(wiDir, { recursive: true });
    // Pre-existing work_item.json but NO closure files — reproduces the defect
    // (and the manual-deletion recovery scenario).
    await fs.writeFile(
      path.join(wiDir, "work_item.json"),
      JSON.stringify({ work_item_id: "WI-0002", workflow_type: "feature_spec" }),
    );

    const { deps } = makeStateManagerDeps();

    await handler(
      { work_item_id: "WI-0002", from_state: "", to_state: "created", workflow_type: "feature_spec" },
      { directory: tempDir },
      deps,
    );

    await expect(fs.access(path.join(wiDir, "tasks.md"))).rejects.toBeTruthy();
    await expect(fs.access(path.join(wiDir, "trace_delta.md"))).rejects.toBeTruthy();
  });

  it("must NOT overwrite existing real closure content (create-if-missing)", async () => {
    const wiDir = wiDirFor(tempDir, "WI-0003");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(
      path.join(wiDir, "work_item.json"),
      JSON.stringify({ work_item_id: "WI-0003" }),
    );
    const realTasks = "# Tasks\n\nTASK-1 real authored content";
    await fs.writeFile(path.join(wiDir, "tasks.md"), realTasks);

    const { deps } = makeStateManagerDeps();

    await handler(
      { work_item_id: "WI-0003", from_state: "", to_state: "created", workflow_type: "feature_spec" },
      { directory: tempDir },
      deps,
    );

    const after = await fs.readFile(path.join(wiDir, "tasks.md"), "utf-8");
    expect(after).toBe(realTasks);
  });
});

// =========================================================================
// Runtime-owned Candidate Manifest materialization at the phase boundary.
// =========================================================================

describe("sf_state_transition - Candidate Manifest materialization", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    await writeManifest(tempDir, "PSV-0002");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeCandidate(relative: string, content = "# Candidate\n"): Promise<void> {
    const target = path.join(wiDirFor(tempDir, "WI-0004"), relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf-8");
  }
  function hashText(content: string): string {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`;
  }

  async function writeRepairPlanBoundToCurrentManifest(
    candidateManifestHashOverride?: string,
  ): Promise<{ path: string; text: string }> {
    const wiDir = wiDirFor(tempDir, "WI-0004");
    const manifestText = await fs.readFile(
      path.join(wiDir, "candidate_manifest.json"),
      "utf-8",
    );
    const repairPlanPath = path.join(wiDir, "project_spec_repair_plan.json");
    const repairPlanText =
      JSON.stringify(
        {
          schema_version: "1.0",
          work_item_id: "WI-0004",
          action: "project_spec_repair",
          manifest_sha256_before: "sha256:project-spec-before",
          project_spec_version_before: "PSV-0002",
          modules: ["DOMAIN"],
          evidence_paths: [".specforge/project/architecture.md"],
          candidate_manifest_sha256:
            candidateManifestHashOverride ?? hashText(manifestText),
          prepared_at: "2026-08-08T00:00:00.000Z",
        },
        null,
        2,
      ) + "\n";
    await fs.writeFile(repairPlanPath, repairPlanText, "utf-8");
    return { path: repairPlanPath, text: repairPlanText };
  }

  async function writeCandidateContext(options?: { includeDesign?: boolean; includeNewModule?: boolean; projectContractChanged?: boolean }): Promise<void> {
    const wiDir = wiDirFor(tempDir, "WI-0004");
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(
      path.join(wiDir, "work_item.json"),
      JSON.stringify({
        schema_version: "1.1",
        work_item_id: "WI-0004",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      }),
    );
    await fs.writeFile(
      path.join(wiDir, "trigger_result.json"),
      JSON.stringify({
        schema_version: "1.0",
        work_item_id: "WI-0004",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
        classification: {
          requirement_changed: false,
          acceptance_criteria_changed: false,
          business_rule_changed: false,
          architecture_changed: true,
          data_model_changed: false,
          design_changed: true,
          module_contract_changed: true,
          module_boundary_changed: options?.includeNewModule === true,
          project_contract_changed: options?.projectContractChanged === true,
          api_contract_changed: options?.projectContractChanged !== true,
        },
      }),
    );
    await fs.writeFile(
      path.join(wiDir, "candidate_manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        work_item_id: "WI-0004",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
        base_spec_version: "PSV-0002",
        entries: [
          {
            candidate_path: "candidates/project/extension_registry.json",
            target_path: ".specforge/project/extension_registry.json",
            operation: "replace",
            type: "extension_registry",
          },
        ],
      }),
    );
    await writeCandidate(
      "candidates/project/extension_registry.json",
      '{"contracts":{"shared_enums":[]}}\n',
    );
    await writeCandidate("candidates/project/architecture.candidate.md");
    await writeCandidate("candidates/project/data_model.candidate.md");
    if (options?.includeNewModule) {
      await writeCandidate(
        "candidates/project/modules/DOMAIN/module.candidate.json",
        '{"schema_version":"1.0","module_code":"DOMAIN","code_paths":["src/domain/**"]}\n',
      );
    }
    await writeCandidate("candidates/project/modules/DOMAIN/requirements.candidate.md");
    if (options?.includeDesign !== false) {
      await writeCandidate("candidates/project/modules/DOMAIN/design.candidate.md");
    }
    await writeCandidate(
      "candidates/project/modules/DOMAIN/contracts.candidate.json",
      '{"schema_version":"1.0","module_code":"DOMAIN","contracts":{}}\n',
    );
    if (options?.includeNewModule) {
      await writeCandidate("candidates/project/modules/DOMAIN/trace.candidate.md");
    }
    await writeCandidate("candidates/trace_delta.md");
  }

  it("materializes the complete Classification-driven manifest before advancing state", async () => {
    await writeCandidateContext();
    const { deps, smTransition } = makeStateManagerDeps({ currentState: "candidate_preparing" });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.candidate_manifest_materialization.entry_count).toBe(5);
    expect(smTransition).toHaveBeenCalledTimes(1);

    const manifest = JSON.parse(
      await fs.readFile(
        path.join(wiDirFor(tempDir, "WI-0004"), "candidate_manifest.json"),
        "utf-8",
      ),
    );
    expect(manifest.base_spec_version).toBe("PSV-0002");
    expect(manifest.entries.map((entry: any) => entry.type)).toEqual([
      "extension_registry",
      "architecture",
      "design",
      "module_contract",
      "trace_delta",
    ]);
    expect(
      manifest.entries.some((entry: any) => entry.type === "requirements"),
    ).toBe(false);
    expect(
      manifest.entries.some((entry: any) => entry.type === "data_model"),
    ).toBe(false);
  });

  it("materializes new-module requirements, trace and Project Contract before advancing", async () => {
    await writeCandidateContext({ includeNewModule: true, projectContractChanged: true });
    const { deps, smTransition } = makeStateManagerDeps({ currentState: "candidate_preparing" });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.candidate_manifest_materialization.entry_count).toBe(8);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(wiDirFor(tempDir, "WI-0004"), "candidate_manifest.json"),
        "utf-8",
      ),
    );
    expect(manifest.entries.map((entry: any) => entry.type)).toEqual(
      expect.arrayContaining([
        "extension_registry",
        "architecture",
        "module_definition",
        "requirements",
        "design",
        "module_contract",
        "module_trace",
        "trace_delta",
      ]),
    );
    expect(smTransition).toHaveBeenCalledTimes(1);
  });

  it("does not advance when a required Candidate is missing", async () => {
    await writeCandidateContext({ includeDesign: false });
    const { deps, smTransition } = makeStateManagerDeps({ currentState: "candidate_preparing" });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CANDIDATE_MANIFEST_MATERIALIZATION_FAILED");
    expect(result.error).toContain("CANDIDATE_MANIFEST_REQUIRED_ENTRY_MISSING");
    expect(result.state_advanced).toBe(false);
    expect(smTransition).not.toHaveBeenCalled();
  });
  it("rejects a missing authoritative state before changing the Manifest", async () => {
    await writeCandidateContext();
    const manifestPath = path.join(
      wiDirFor(tempDir, "WI-0004"),
      "candidate_manifest.json",
    );
    const before = await fs.readFile(manifestPath, "utf-8");
    const { deps, smTransition } = makeStateManagerDeps({
      currentState: null,
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CANDIDATE_MANIFEST_STATE_MISMATCH");
    expect(smTransition).not.toHaveBeenCalled();
    expect(await fs.readFile(manifestPath, "utf-8")).toBe(before);
  });

  it("rejects an authoritative-state mismatch before changing the Manifest", async () => {
    await writeCandidateContext();
    const manifestPath = path.join(
      wiDirFor(tempDir, "WI-0004"),
      "candidate_manifest.json",
    );
    const before = await fs.readFile(manifestPath, "utf-8");
    const { deps, smTransition } = makeStateManagerDeps({
      currentState: "gates_failed",
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CANDIDATE_MANIFEST_STATE_MISMATCH");
    expect(smTransition).not.toHaveBeenCalled();
    expect(await fs.readFile(manifestPath, "utf-8")).toBe(before);
  });

  it("rebinds a Project Spec repair plan to the final frozen Candidate Manifest", async () => {
    await writeCandidateContext();
    const repairPlanBefore = await writeRepairPlanBoundToCurrentManifest();
    const { deps, smTransition } = makeStateManagerDeps({
      currentState: "candidate_preparing",
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(true);
    expect(
      result.candidate_manifest_materialization.repair_plan_binding_updated,
    ).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);

    const manifestText = await fs.readFile(
      path.join(wiDirFor(tempDir, "WI-0004"), "candidate_manifest.json"),
      "utf-8",
    );
    const repairPlanAfter = JSON.parse(
      await fs.readFile(repairPlanBefore.path, "utf-8"),
    );
    expect(repairPlanAfter.candidate_manifest_sha256).toBe(hashText(manifestText));
    expect(repairPlanAfter.prepared_at).toBe("2026-08-08T00:00:00.000Z");
    expect(repairPlanAfter.manifest_sha256_before).toBe(
      "sha256:project-spec-before",
    );
  });

  it("fails closed before state advance when the repair plan was already stale before Candidate freeze", async () => {
    await writeCandidateContext();
    const manifestPath = path.join(
      wiDirFor(tempDir, "WI-0004"),
      "candidate_manifest.json",
    );
    const manifestBefore = await fs.readFile(manifestPath, "utf-8");
    const repairPlanBefore = await writeRepairPlanBoundToCurrentManifest(
      "sha256:already-stale",
    );
    const { deps, smTransition } = makeStateManagerDeps({
      currentState: "candidate_preparing",
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("CANDIDATE_MANIFEST_MATERIALIZATION_FAILED");
    expect(result.error).toContain(
      "PROJECT_SPEC_REPAIR_PLAN_PRE_FREEZE_BINDING_STALE",
    );
    expect(smTransition).not.toHaveBeenCalled();
    expect(await fs.readFile(manifestPath, "utf-8")).toBe(manifestBefore);
    expect(await fs.readFile(repairPlanBefore.path, "utf-8")).toBe(
      repairPlanBefore.text,
    );
  });

  it("rolls back both Candidate Manifest and repair-plan binding when StateManager transition fails", async () => {
    await writeCandidateContext();
    const manifestPath = path.join(
      wiDirFor(tempDir, "WI-0004"),
      "candidate_manifest.json",
    );
    const manifestBefore = await fs.readFile(manifestPath, "utf-8");
    const repairPlanBefore = await writeRepairPlanBoundToCurrentManifest();
    const { deps, smTransition } = makeStateManagerDeps({
      transitionError: new Error("simulated StateManager failure"),
      currentState: "candidate_preparing",
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.candidate_manifest_rolled_back).toBe(true);
    expect(result.repair_plan_rolled_back).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(manifestPath, "utf-8")).toBe(manifestBefore);
    expect(await fs.readFile(repairPlanBefore.path, "utf-8")).toBe(
      repairPlanBefore.text,
    );
  });

  it("restores the previous Manifest when the authoritative transition fails", async () => {
    await writeCandidateContext();
    const manifestPath = path.join(
      wiDirFor(tempDir, "WI-0004"),
      "candidate_manifest.json",
    );
    const before = await fs.readFile(manifestPath, "utf-8");
    const { deps, smTransition } = makeStateManagerDeps({
      transitionError: new Error("simulated StateManager failure"),
      currentState: "candidate_preparing",
    });

    const result = await handler(
      {
        work_item_id: "WI-0004",
        from_state: "candidate_preparing",
        to_state: "candidate_prepared",
        workflow_type: "architecture_change",
        workflow_path: "architecture_change_path",
      },
      { directory: tempDir, agent: "sf-orchestrator" },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.candidate_manifest_rolled_back).toBe(true);
    expect(smTransition).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(manifestPath, "utf-8")).toBe(before);
  });

});

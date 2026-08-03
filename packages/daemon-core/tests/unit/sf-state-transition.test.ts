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
import { getHandler } from "../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect
import "../../src/tools/handlers/sf-state-transition";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Build a deps object whose ProjectManager returns a StateManager with a
 * spy-able transition(). This mirrors the real execution path
 * (transitionWithEvidence -> projectManager.getProjectStateManager().transition()).
 */
function makeStateManagerDeps() {
  const smTransition = vi.fn().mockResolvedValue(undefined);
  const getProjectStateManager = vi.fn().mockResolvedValue({ transition: smTransition });
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

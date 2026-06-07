/**
 * sf_state_transition handler unit tests
 * Focus: project initialization guard (manifest.json check) + v1.1 evidence guard workItemDir
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { getHandler } from "../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect
import "../../src/tools/handlers/sf-state-transition";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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
      `sf-state-transition-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  it("should return PROJECT_NOT_INITIALIZED when from='' and manifest.json does not exist", async () => {
    // No manifest.json created - simulate uninitialized project

    const result = await handler(
      { work_item_id: "WI-001", from_state: "", to_state: "intake" },
      { directory: tempDir },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("PROJECT_NOT_INITIALIZED");
    expect(result.hint).toContain("初始化");
    expect(result.recovery_action).toBe("execute_startup_flow");
  });

  it("should NOT trigger guard when from='intake' and manifest.json does not exist", async () => {
    // No manifest.json, but fromState ≠ '' so guard is skipped
    // Must mock workflowEngine since guard passes
    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-001",
      currentState: "requirements",
    });
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: vi.fn().mockResolvedValue(undefined),
    });

    const result = await handler(
      { work_item_id: "WI-001", from_state: "intake", to_state: "requirements" },
      { directory: tempDir },
      { workflowEngine: { transitionFull: mockTransitionFull }, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });

  it("should proceed normally when from='' and manifest.json exists", async () => {
    // Create manifest.json to simulate an initialized project
    const specforgeDir = path.join(tempDir, ".specforge");
    await fs.mkdir(specforgeDir, { recursive: true });
    await fs.writeFile(path.join(specforgeDir, "manifest.json"), "{}");

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-001",
      currentState: "intake",
    });
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: vi.fn().mockResolvedValue(undefined),
    });

    const result = await handler(
      { work_item_id: "WI-001", from_state: "", to_state: "intake" },
      { directory: tempDir },
      { workflowEngine: { transitionFull: mockTransitionFull }, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================
// v1.1 Evidence Guard: workItemDir propagation to transitionFull
// =========================================================================

describe("sf_state_transition - v1.1 evidence guard workItemDir", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-st-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  /**
   * Helper: create a mock deps object that captures transitionFull calls
   */
  function makeMockDeps(transitionFullImpl?: (input: any) => Promise<any>) {
    const mockTransitionFull = vi.fn(transitionFullImpl ?? (async (input: any) => ({
      workItemId: input.workItemId,
      previousState: input.fromState,
      currentState: input.toState,
      timestamp: new Date().toISOString(),
    })));
    const mockSmTransition = vi.fn().mockResolvedValue(undefined);
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: mockSmTransition,
    });
    return {
      deps: {
        workflowEngine: { transitionFull: mockTransitionFull },
        projectManager: { getProjectStateManager: mockGetProjectStateManager },
      },
      mockTransitionFull,
      mockSmTransition,
      mockGetProjectStateManager,
    };
  }

  // --- ST-EV-1: transitionFull receives workItemDir for critical states ---
  it("ST-EV-1: must pass workItemDir to transitionFull for approval_required", async () => {
    const { deps, mockTransitionFull } = makeMockDeps();

    await handler(
      { work_item_id: "WI-001", from_state: "gates_running", to_state: "approval_required" },
      { directory: tempDir },
      deps,
    );

    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
    const callArgs = mockTransitionFull.mock.calls[0][0];
    expect(callArgs.workItemDir).toBeDefined();
    expect(callArgs.workItemDir).toContain(".specforge");
    expect(callArgs.workItemDir).toContain("work-items");
    expect(callArgs.workItemDir).toContain("WI-001");
    // Exact path: {tempDir}/.specforge/work-items/WI-001
    expect(callArgs.workItemDir).toBe(path.join(tempDir, ".specforge", "work-items", "WI-001"));
  });

  // --- ST-EV-2: transitionFull receives workItemDir for implementation_ready ---
  it("ST-EV-2: must pass workItemDir to transitionFull for implementation_ready", async () => {
    const { deps, mockTransitionFull } = makeMockDeps();

    await handler(
      { work_item_id: "WI-002", from_state: "post_merge_verified", to_state: "implementation_ready" },
      { directory: tempDir },
      deps,
    );

    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
    const callArgs = mockTransitionFull.mock.calls[0][0];
    expect(callArgs.workItemDir).toBe(path.join(tempDir, ".specforge", "work-items", "WI-002"));
  });

  // --- ST-EV-3: transitionFull failure blocks StateManager.transition ---
  it("ST-EV-3: when transitionFull throws, StateManager.transition must NOT be called", async () => {
    const { deps, mockTransitionFull, mockSmTransition } = makeMockDeps(async () => {
      throw new Error("Transition evidence prerequisite missing: gates/gate_summary_gate.json");
    });

    const result = await handler(
      { work_item_id: "WI-001", from_state: "gates_running", to_state: "approval_required" },
      { directory: tempDir },
      deps,
    );

    // Handler should return failure
    expect(result.success).toBe(false);
    // StateManager.transition must NOT have been called
    expect(mockSmTransition).not.toHaveBeenCalled();
  });

  // --- ST-EV-4: success path calls both transitionFull and StateManager ---
  it("ST-EV-4: success path calls transitionFull then StateManager.transition", async () => {
    const { deps, mockTransitionFull, mockSmTransition } = makeMockDeps();

    const result = await handler(
      { work_item_id: "WI-001", from_state: "intake", to_state: "requirements" },
      { directory: tempDir },
      deps,
    );

    expect(result.success).toBe(true);
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
    expect(mockSmTransition).toHaveBeenCalledTimes(1);
    // transitionFull must be called before StateManager.transition
    // (implicit: if transitionFull threw, mockSmTransition wouldn't be called)
  });

  // --- ST-EV-5: workItemDir undefined when no projectPath ---
  it("ST-EV-5: workItemDir must be undefined when context has no directory/worktree", async () => {
    const { deps, mockTransitionFull } = makeMockDeps();

    const result = await handler(
      { work_item_id: "WI-001", from_state: "intake", to_state: "requirements" },
      {},  // No directory or worktree
      deps,
    );

    // Without projectPath, StateManager can't be called → should fail
    // But transitionFull IS called (and succeeds with workItemDir=undefined)
    // Then it fails on "projectPath required"
    expect(result.success).toBe(false);
    expect(result.error).toContain("projectPath");
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
    const callArgs = mockTransitionFull.mock.calls[0][0];
    expect(callArgs.workItemDir).toBeUndefined();
  });

  // --- ST-EV-6: real WorkflowEngine integration — missing gate blocks approval_required ---
  it("ST-EV-6: real engine — missing gate_summary_gate.json blocks approval_required", async () => {
    // Use real WorkflowEngine to test end-to-end evidence guard
    const { WorkflowEngine } = await import("@specforge/workflow-runtime");
    const engine = new WorkflowEngine();

    // Load a minimal workflow with approval_required as a critical target
    engine.loadWorkflow({
      id: 'test-wf',
      displayName: 'Test WF',
      intent: 'test',
      stateMachine: {
        initial: 'created',
        states: {
          created: { agent: '', gate: null, skills: [], next: 'gates_running' },
          gates_running: {
            agent: '',
            gate: { type: 'simple', id: 'gate_summary_gate', name: 'Gate Summary Gate', checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'ok' }) },
            skills: [],
            next: { pass: 'approval_required', fail: 'blocked' },
          },
          approval_required: { agent: '', gate: null, skills: [], next: { pass: 'merge_ready', fail: 'rejected' } },
          blocked: { agent: '', gate: null, skills: [] },
          rejected: { agent: '', gate: null, skills: [] },
          merge_ready: { agent: '', gate: null, skills: [], next: 'merging' },
          merging: { agent: '', gate: null, skills: [] },
        },
      },
      artifacts: [],
    });

    // Create an instance and force to gates_running
    const inst = engine.createInstance('test-wf');
    (inst as Record<string, unknown>).currentState = 'gates_running';

    // Create WI dir without gate_summary_gate.json
    const wiDir = path.join(tempDir, ".specforge", "work-items", inst.id);
    await fs.mkdir(wiDir, { recursive: true });

    const mockSmTransition = vi.fn().mockResolvedValue(undefined);
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: mockSmTransition,
    });

    const result = await handler(
      { work_item_id: inst.id, from_state: "gates_running", to_state: "approval_required" },
      { directory: tempDir },
      { workflowEngine: engine, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    // Should fail because gate_summary.md or gate_summary_gate.json is missing
    expect(result.success).toBe(false);
    // StateManager must NOT be called
    expect(mockSmTransition).not.toHaveBeenCalled();
  });

  // --- ST-EV-7: real WorkflowEngine — all evidence present, approval_required succeeds ---
  it("ST-EV-7: real engine — gate evidence present, approval_required succeeds", async () => {
    const { WorkflowEngine } = await import("@specforge/workflow-runtime");
    const engine = new WorkflowEngine();

    engine.loadWorkflow({
      id: 'test-wf',
      displayName: 'Test WF',
      intent: 'test',
      stateMachine: {
        initial: 'created',
        states: {
          created: { agent: '', gate: null, skills: [], next: 'gates_running' },
          gates_running: {
            agent: '',
            gate: { type: 'simple', id: 'gate_summary_gate', name: 'Gate Summary Gate', checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'ok' }) },
            skills: [],
            next: { pass: 'approval_required', fail: 'blocked' },
          },
          approval_required: { agent: '', gate: null, skills: [], next: { pass: 'merge_ready', fail: 'rejected' } },
          blocked: { agent: '', gate: null, skills: [] },
          rejected: { agent: '', gate: null, skills: [] },
          merge_ready: { agent: '', gate: null, skills: [], next: 'merging' },
          merging: { agent: '', gate: null, skills: [] },
        },
      },
      artifacts: [],
    });

    const inst = engine.createInstance('test-wf');
    (inst as Record<string, unknown>).currentState = 'gates_running';

    // Create WI dir WITH gate evidence
    const wiDir = path.join(tempDir, ".specforge", "work-items", inst.id);
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "gate_summary.md"), "# Gate Summary\nAll passed.");
    await fs.mkdir(path.join(wiDir, "gates"), { recursive: true });
    await fs.writeFile(path.join(wiDir, "gates", "gate_summary_gate.json"), JSON.stringify({ status: "passed" }));

    const mockSmTransition = vi.fn().mockResolvedValue(undefined);
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: mockSmTransition,
    });

    const result = await handler(
      { work_item_id: inst.id, from_state: "gates_running", to_state: "approval_required" },
      { directory: tempDir },
      { workflowEngine: engine, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    expect(result.success).toBe(true);
    expect(result.currentState).toBe("approval_required");
    // StateManager.transition IS called after transitionFull succeeds
    expect(mockSmTransition).toHaveBeenCalledTimes(1);
  });

  // --- ST-EV-8: real engine — missing code_permission_release_gate blocks implementation_ready ---
  it("ST-EV-8: real engine — missing code_permission_release_gate blocks implementation_ready", async () => {
    const { WorkflowEngine } = await import("@specforge/workflow-runtime");
    const engine = new WorkflowEngine();

    engine.loadWorkflow({
      id: 'test-wf',
      displayName: 'Test WF',
      intent: 'test',
      stateMachine: {
        initial: 'created',
        states: {
          created: { agent: '', gate: null, skills: [], next: 'post_merge_verified' },
          post_merge_verified: { agent: '', gate: null, skills: [], next: 'implementation_ready' },
          implementation_ready: {
            agent: '',
            gate: { type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'ok' }) },
            skills: [],
            next: { pass: 'implementation_running', fail: 'blocked' },
          },
          implementation_running: { agent: '', gate: null, skills: [] },
          blocked: { agent: '', gate: null, skills: [] },
        },
      },
      artifacts: [],
    });

    const inst = engine.createInstance('test-wf');
    (inst as Record<string, unknown>).currentState = 'post_merge_verified';

    // Create WI dir with tasks.md and work_item.json but NO gate file
    const wiDir = path.join(tempDir, ".specforge", "work-items", inst.id);
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "tasks.md"), "# Tasks");
    await fs.writeFile(path.join(wiDir, "work_item.json"), JSON.stringify({ allowed_write_files: ["src/a.ts"] }));
    // Deliberately NOT creating gates/code_permission_release_gate.json

    const mockSmTransition = vi.fn().mockResolvedValue(undefined);
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: mockSmTransition,
    });

    const result = await handler(
      { work_item_id: inst.id, from_state: "post_merge_verified", to_state: "implementation_ready" },
      { directory: tempDir },
      { workflowEngine: engine, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    expect(result.success).toBe(false);
    expect(mockSmTransition).not.toHaveBeenCalled();
  });

  // --- ST-EV-9: real engine — all evidence present, implementation_ready succeeds ---
  it("ST-EV-9: real engine — all evidence present, implementation_ready succeeds", async () => {
    const { WorkflowEngine } = await import("@specforge/workflow-runtime");
    const engine = new WorkflowEngine();

    engine.loadWorkflow({
      id: 'test-wf',
      displayName: 'Test WF',
      intent: 'test',
      stateMachine: {
        initial: 'created',
        states: {
          created: { agent: '', gate: null, skills: [], next: 'post_merge_verified' },
          post_merge_verified: { agent: '', gate: null, skills: [], next: 'implementation_ready' },
          implementation_ready: {
            agent: '',
            gate: { type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', checkFn: async () => ({ schema_version: '1.0', passed: true, reason: 'ok' }) },
            skills: [],
            next: { pass: 'implementation_running', fail: 'blocked' },
          },
          implementation_running: { agent: '', gate: null, skills: [] },
          blocked: { agent: '', gate: null, skills: [] },
        },
      },
      artifacts: [],
    });

    const inst = engine.createInstance('test-wf');
    (inst as Record<string, unknown>).currentState = 'post_merge_verified';

    // Create WI dir with ALL evidence
    const wiDir = path.join(tempDir, ".specforge", "work-items", inst.id);
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, "tasks.md"), "# Tasks");
    await fs.writeFile(path.join(wiDir, "work_item.json"), JSON.stringify({ allowed_write_files: ["src/a.ts"] }));
    await fs.mkdir(path.join(wiDir, "gates"), { recursive: true });
    await fs.writeFile(path.join(wiDir, "gates", "code_permission_release_gate.json"), JSON.stringify({ status: "passed" }));

    const mockSmTransition = vi.fn().mockResolvedValue(undefined);
    const mockGetProjectStateManager = vi.fn().mockResolvedValue({
      transition: mockSmTransition,
    });

    const result = await handler(
      { work_item_id: inst.id, from_state: "post_merge_verified", to_state: "implementation_ready" },
      { directory: tempDir },
      { workflowEngine: engine, projectManager: { getProjectStateManager: mockGetProjectStateManager } },
    );

    expect(result.success).toBe(true);
    expect(result.currentState).toBe("implementation_ready");
    expect(mockSmTransition).toHaveBeenCalledTimes(1);
  });
});

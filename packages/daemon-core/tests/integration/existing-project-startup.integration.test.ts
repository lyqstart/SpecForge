/**
 * CP-3 Integration Test — Existing Project Startup (已有项目不受影响)
 *
 * Verifies that existing projects (with .specforge/ + manifest.json) are
 * unaffected by the DD-2 guard added to sf_state_transition.
 *
 * Tests:
 *  - manifest.json exists → DD-2 guard does not trigger, transitionFull is called normally
 *  - fromState ≠ "" → guard is completely skipped
 *  - Simulated existing project structure (.specforge/ + manifest.json + runtime/state.json)
 *    → behaviour unchanged
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { getHandler } from "../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect
import "../../src/tools/handlers/sf-state-transition";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `specforge-cp3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmRf(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a simulated existing project structure:
 *   <projectPath>/
 *     .specforge/
 *       manifest.json
 *       runtime/
 *         state.json
 */
async function createExistingProjectStructure(
  projectPath: string,
  manifestContent?: object,
): Promise<void> {
  const specforgeDir = path.join(projectPath, ".specforge");
  const runtimeDir = path.join(specforgeDir, "runtime");

  await fs.mkdir(specforgeDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });

  // Create manifest.json
  const manifest = manifestContent ?? {
    schema_version: "6.0",
    install_mode: "user_level",
    initialized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(specforgeDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  // Create runtime/state.json with some existing Work Items
  await fs.writeFile(
    path.join(runtimeDir, "state.json"),
    JSON.stringify({ workItems: [] }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CP-3: Existing project startup — DD-2 guard does not interfere", () => {
  let projectPath: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    projectPath = await makeTempDir();
  });

  afterEach(async () => {
    await rmRf(projectPath);
  });

  // ── Scenario 1: manifest.json exists → guard does not trigger ──

  it("should create Work Item normally when manifest.json exists and fromState=''", async () => {
    await createExistingProjectStructure(projectPath);

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-CP3-001",
      currentState: "intake",
    });

    const result = await handler(
      { work_item_id: "WI-CP3-001", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);

    // Verify transitionFull was called with correct args
    const callArgs = mockTransitionFull.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.workItemId).toBe("WI-CP3-001");
    expect(callArgs.fromState).toBe("");
    expect(callArgs.toState).toBe("intake");
  });

  it("should create Work Item normally when manifest.json exists with different fromState/toState pairs", async () => {
    await createExistingProjectStructure(projectPath);

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-CP3-002",
      currentState: "requirements",
    });

    const result = await handler(
      { work_item_id: "WI-CP3-002", from_state: "intake", to_state: "requirements" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });

  // ── Scenario 2: fromState ≠ "" → guard completely skipped ──

  it("should skip guard entirely when fromState ≠ '' (even without manifest.json)", async () => {
    // No manifest.json, no .specforge/ — but fromState ≠ ''
    // Guard must not fire because it only applies when fromState === ''

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-CP3-003",
      currentState: "design",
    });

    const result = await handler(
      { work_item_id: "WI-CP3-003", from_state: "requirements", to_state: "design" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);

    // Check the handler didn't even attempt manifest.json check
    // (indirectly verified by success + transitionFull called)
    const callArgs = mockTransitionFull.mock.calls[0]?.[0];
    expect(callArgs.fromState).toBe("requirements");
    expect(callArgs.toState).toBe("design");
  });

  it("should skip guard for all non-empty fromState values", async () => {
    const nonEmptyStates = ["intake", "requirements", "design", "tasks", "development", "completed"];
    const mockTransitionFull = vi.fn().mockResolvedValue({ workItemId: "WI-CP3-ALL", currentState: "intake" });

    for (const fromState of nonEmptyStates) {
      const toState = fromState === "completed" ? "archived" : "requirements";

      const result = await handler(
        { work_item_id: `WI-CP3-${fromState}`, from_state: fromState, to_state: toState },
        { directory: projectPath },
        { workflowEngine: { transitionFull: mockTransitionFull } },
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    }

    // Each call should have gone through transitionFull
    expect(mockTransitionFull).toHaveBeenCalledTimes(nonEmptyStates.length);
  });

  // ── Scenario 3: Multiple Work Items in existing project ──

  it("should support creating multiple Work Items in an existing project", async () => {
    await createExistingProjectStructure(projectPath);

    const mockTransitionFull = vi.fn()
      .mockResolvedValueOnce({ workItemId: "WI-A", currentState: "intake" })
      .mockResolvedValueOnce({ workItemId: "WI-B", currentState: "intake" })
      .mockResolvedValueOnce({ workItemId: "WI-A", currentState: "requirements" });

    // Create first WI
    const result1 = await handler(
      { work_item_id: "WI-A", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );
    expect(result1.success).toBe(true);

    // Create second WI
    const result2 = await handler(
      { work_item_id: "WI-B", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );
    expect(result2.success).toBe(true);

    // Transition first WI
    const result3 = await handler(
      { work_item_id: "WI-A", from_state: "intake", to_state: "requirements" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );
    expect(result3.success).toBe(true);

    expect(mockTransitionFull).toHaveBeenCalledTimes(3);
  });

  // ── Scenario 4: Session resume path (existing project with in-progress WI) ──

  it("should allow normal state transitions for in-progress Work Items in existing project", async () => {
    await createExistingProjectStructure(projectPath);

    // Simulate an in-progress WI: WI was created in a previous session at "design"
    // Now orchestrator is resuming and transitions to the next phase
    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-RESUME",
      currentState: "development",
    });

    const result = await handler(
      { work_item_id: "WI-RESUME", from_state: "design", to_state: "development" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);

    // Guard was NOT triggered (fromState ≠ "")
    const callArgs = mockTransitionFull.mock.calls[0]?.[0];
    expect(callArgs.workItemId).toBe("WI-RESUME");
    expect(callArgs.fromState).toBe("design");
    expect(callArgs.toState).toBe("development");
  });

  // ── Scenario 5: manifest.json with different valid contents ──

  it("should work with manifest.json containing only required fields", async () => {
    await createExistingProjectStructure(projectPath, {
      schema_version: "6.0",
      initialized_at: new Date().toISOString(),
    });

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-MIN",
      currentState: "intake",
    });

    const result = await handler(
      { work_item_id: "WI-MIN", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });

  it("should work with manifest.json having extra fields", async () => {
    await createExistingProjectStructure(projectPath, {
      schema_version: "7.0",
      install_mode: "user_level",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      custom_field: "anything",
      nested: { foo: "bar" },
    });

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-EXTRA",
      currentState: "intake",
    });

    const result = await handler(
      { work_item_id: "WI-EXTRA", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });

  // ── Edge case: fromState="" guard returns PROJECT_NOT_INITIALIZED properly ──

  it("should return PROJECT_NOT_INITIALIZED when manifest.json is missing and fromState=''", async () => {
    // No project structure at all — this is the "new uninitialized project" path
    // This verifies the guard still works correctly even in integration context

    const result = await handler(
      { work_item_id: "WI-NEW", from_state: "", to_state: "intake" },
      { directory: projectPath },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("PROJECT_NOT_INITIALIZED");
    expect(result.hint).toContain("初始化");
    expect(result.recovery_action).toBe("execute_startup_flow");
  });
});

// ---------------------------------------------------------------------------
// Scenario: Simulated real existing project structure
// ---------------------------------------------------------------------------

describe("CP-3: Existing project file structure simulation", () => {
  let projectPath: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_transition")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    projectPath = await makeTempDir();
  });

  afterEach(async () => {
    await rmRf(projectPath);
  });

  it("should verify simulated project structure is complete", async () => {
    await createExistingProjectStructure(projectPath);

    // Verify the directory structure matches what a real existing project would have
    const specforgeDir = path.join(projectPath, ".specforge");
    const manifestPath = path.join(specforgeDir, "manifest.json");
    const runtimeDir = path.join(specforgeDir, "runtime");
    const statePath = path.join(runtimeDir, "state.json");

    expect(await fileExists(specforgeDir)).toBe(true);
    expect(await fileExists(manifestPath)).toBe(true);
    expect(await fileExists(runtimeDir)).toBe(true);
    expect(await fileExists(statePath)).toBe(true);

    // Verify manifest.json content is valid JSON
    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.schema_version).toBeDefined();

    // Verify state.json content is valid JSON
    const stateRaw = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(stateRaw);
    expect(state.workItems).toBeDefined();
  });

  it("should pass through transitionFull with project context from directory", async () => {
    await createExistingProjectStructure(projectPath);

    const mockTransitionFull = vi.fn().mockResolvedValue({
      workItemId: "WI-CTX",
      currentState: "intake",
    });

    const result = await handler(
      { work_item_id: "WI-CTX", from_state: "", to_state: "intake" },
      { directory: projectPath, agent: "sf-orchestrator", sessionID: "sess-123" },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);

    // Verify actor context was passed through
    const callArgs = mockTransitionFull.mock.calls[0]?.[0];
    expect(callArgs.actor).toBeDefined();
    expect(callArgs.actor.agentRole).toBe("sf-orchestrator");
    expect(callArgs.actor.sessionId).toBe("sess-123");
  });

  it("should behave identically for existing project regardless of call count", async () => {
    await createExistingProjectStructure(projectPath);

    const mockTransitionFull = vi.fn()
      .mockResolvedValue({ workItemId: "WI-IDEM", currentState: "intake" });

    // Call 1
    const r1 = await handler(
      { work_item_id: "WI-IDEM", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );
    expect(r1.success).toBe(true);

    // Call 2 (same args) — should still work, guard doesn't change
    const r2 = await handler(
      { work_item_id: "WI-IDEM", from_state: "", to_state: "intake" },
      { directory: projectPath },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );
    expect(r2.success).toBe(true);

    expect(mockTransitionFull).toHaveBeenCalledTimes(2);
  });
});

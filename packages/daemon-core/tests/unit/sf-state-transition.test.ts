/**
 * sf_state_transition handler unit tests
 * Focus: project initialization guard (manifest.json check)
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

    const result = await handler(
      { work_item_id: "WI-001", from_state: "intake", to_state: "requirements" },
      { directory: tempDir },
      { workflowEngine: { transitionFull: mockTransitionFull } },
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

    const result = await handler(
      { work_item_id: "WI-001", from_state: "", to_state: "intake" },
      { directory: tempDir },
      { workflowEngine: { transitionFull: mockTransitionFull } },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockTransitionFull).toHaveBeenCalledTimes(1);
  });
});

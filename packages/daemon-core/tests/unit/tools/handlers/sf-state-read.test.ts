/**
 * Bug condition exploration test — P10: `rebuilt_from_events` reflects reality
 *
 * Spec: .kiro/specs/investigation-gate-contract-fix
 * Property 5 (Bug Condition): For any `sf_state_read(all)` call in a project with
 * NO existing project-level event log, the handler SHALL report
 * `rebuilt_from_events: false` so the flag reflects whether an event log actually
 * existed and was replayed.
 *
 * Validates: Requirements 2.6
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CRITICAL: This is an EXPLORATION test. It encodes the EXPECTED (fixed) behavior
 * and is EXPECTED TO FAIL on the UNFIXED code. The failure confirms the bug:
 * `sf-state-read.ts` derives the authority flag from
 * `typeof sm.rebuildFromEventsFile === 'function'` (a capability check) rather
 * than from whether an event log actually existed and was replayed. When the fix
 * threads a real replayed signal through, this test will pass.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { getHandler } from "../../../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect for sf_state_read
import "../../../../src/tools/handlers/sf-state-read";
import { StateManager } from "../../../../src/state/StateManager";
import { PersonalPathResolver } from "../../../../src/daemon/path-resolver";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("sf_state_read - P10 rebuilt_from_events reflects reality", () => {
  let tempDir: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler("sf_state_read")!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `sf-state-read-p10-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
   * Build a minimal projectManager backed by a REAL StateManager (no mocks that
   * fake the flag) so the handler exercises the genuine authority-flag logic.
   *
   * NOTE: we intentionally do NOT call sm.initialize() — WAL.initialize() would
   * create an empty events.jsonl as a side effect, which would blur the "no
   * event log existed" premise. We only pre-create the runtime directory so the
   * handler's rebuildFromEventsFile()→persistState() can write state.json.
   */
  function makeDeps() {
    const resolver = new PersonalPathResolver();
    return {
      projectManager: {
        getProjectStateManager: async (projectPath: string) => {
          const statePath = resolver.resolveStatePath(projectPath);
          await fs.mkdir(path.dirname(statePath), { recursive: true });
          return new StateManager(resolver, projectPath);
        },
      },
    };
  }

  it("must report rebuilt_from_events === false when NO project-level event log exists", async () => {
    const resolver = new PersonalPathResolver();
    const eventsPath = resolver.resolveEventsPath(tempDir);
    const statePath = resolver.resolveStatePath(tempDir);

    // Precondition: the temp project has NO runtime/events.jsonl and NO
    // runtime/state.json — no event log ever existed, so nothing can be replayed.
    await expect(fs.access(eventsPath)).rejects.toBeTruthy();
    await expect(fs.access(statePath)).rejects.toBeTruthy();

    const result = await handler(
      { work_item_id: "all" },
      { directory: tempDir },
      makeDeps(),
    );

    // The read itself succeeds and there are no work items…
    expect(result.success).toBe(true);
    expect(result.work_items).toEqual({});

    // No events.jsonl was ever created, confirming no event log existed.
    await expect(fs.access(eventsPath)).rejects.toBeTruthy();

    // …therefore the authority flag MUST reflect reality. On UNFIXED code this
    // is `true` (derived from `typeof sm.rebuildFromEventsFile === 'function'`),
    // which is the counterexample this exploration test surfaces.
    expect(result.rebuilt_from_events).toBe(false);
  });
});

/**
 * Preservation property test — P15: state read WITH a real event log
 *
 * Spec: .kiro/specs/investigation-gate-contract-fix
 * Property 15 (Preservation): For any `sf_state_read(all)` call in a project that
 * DOES have a project-level event log, the handler SHALL replay that log and
 * report `rebuilt_from_events: true` with correct `work_items`.
 *
 * Validates: Requirements 3.9
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OBSERVATION-FIRST / PRESERVATION BASELINE:
 * This test captures behavior that MUST NOT change. It is EXPECTED TO PASS on the
 * current UNFIXED code and must keep passing after the P10 fix (which only corrects
 * the *no-log* case). A real event log must still report replay == true with the
 * replayed work items.
 *
 * Setup follows the task 5 test at tests/unit/tools/handlers/sf-state-read.test.ts:
 * PersonalPathResolver + a real StateManager + getHandler("sf_state_read").
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as fc from "fast-check";
import { getHandler } from "../../src/tools/ToolDispatcher";
// Import triggers registerHandler side-effect for sf_state_read
import "../../src/tools/handlers/sf-state-read";
import { StateManager } from "../../src/state/StateManager";
import { PersonalPathResolver } from "../../src/daemon/path-resolver";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Valid, NON-critical workflow states. Non-critical states avoid the dev-only
 * CRITICAL_STATES warning in StateManager.transition() and are legal state names
 * accepted by the optimistic-lock transition path (which validates the name and
 * the from_state, not the workflow edge).
 */
const NON_CRITICAL_STATES = [
  "created",
  "intake_ready",
  "impact_analyzing",
  "impact_analyzed",
  "workflow_selected",
  "candidate_preparing",
  "candidate_prepared",
  "gates_running",
  "gates_failed",
  "blocked",
] as const;

interface WorkItemPlan {
  id: string;
  /** Ordered chain of state transitions applied from '' → … → final. */
  chain: string[];
}

describe("sf_state_read - P15 preservation: real event log replays and reports true", () => {
  let handler: (...args: any[]) => Promise<any>;
  const tempDirs: string[] = [];

  beforeAll(() => {
    handler = getHandler("sf_state_read")!;
    expect(handler).toBeDefined();
  });

  afterEach(async () => {
    // Clean up all temp project dirs created during the property runs.
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * Deps whose projectManager returns a REAL StateManager (no mocks that fake the
   * flag), so the handler exercises the genuine replay + authority-flag logic.
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

  async function makeTempProject(): Promise<string> {
    const dir = path.join(
      os.tmpdir(),
      `sf-state-read-p15-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    return dir;
  }

  /**
   * Write a REAL project-level event log by driving a StateManager through the
   * generated transitions. This produces runtime/events.jsonl with genuine
   * state.transition events (the authoritative source the handler replays).
   *
   * Returns the expected final state per work item id.
   */
  async function seedEventLog(
    projectPath: string,
    plans: WorkItemPlan[],
  ): Promise<Record<string, string>> {
    const resolver = new PersonalPathResolver();
    const sm = new StateManager(resolver, projectPath);
    await sm.initialize();

    const expectedFinalState: Record<string, string> = {};
    for (const plan of plans) {
      let prev = "";
      for (const next of plan.chain) {
        await sm.transition(plan.id, prev, next, "p15-tester");
        prev = next;
      }
      expectedFinalState[plan.id] = plan.chain[plan.chain.length - 1]!;
    }
    return expectedFinalState;
  }

  // Generator: 1..5 unique work items, each with a 1..3 step transition chain.
  const workItemPlansArb = fc
    .uniqueArray(
      fc.record({
        idNum: fc.integer({ min: 1, max: 9999 }),
        chain: fc.array(fc.constantFrom(...NON_CRITICAL_STATES), {
          minLength: 1,
          maxLength: 3,
        }),
      }),
      { minLength: 1, maxLength: 5, selector: (item) => item.idNum },
    )
    .map((items): WorkItemPlan[] =>
      items.map((item) => ({
        id: `WI-${String(item.idNum).padStart(4, "0")}`,
        chain: item.chain,
      })),
    );

  it("replays a real event log: rebuilt_from_events === true and work_items match", async () => {
    await fc.assert(
      fc.asyncProperty(workItemPlansArb, async (plans) => {
        const projectPath = await makeTempProject();
        const resolver = new PersonalPathResolver();
        const eventsPath = resolver.resolveEventsPath(projectPath);

        // Seed a genuine event log via real transitions.
        const expectedFinalState = await seedEventLog(projectPath, plans);

        // Precondition: a real project-level event log now exists.
        await fs.access(eventsPath);

        const result = await handler(
          { work_item_id: "all" },
          { directory: projectPath },
          makeDeps(),
        );

        // The read succeeds.
        expect(result.success).toBe(true);

        // A real log existed and was replayed → authority flag reflects reality.
        expect(result.rebuilt_from_events).toBe(true);

        // work_items are replayed correctly: exactly the seeded ids with their
        // final states derived from the replayed event chains.
        const workItems = result.work_items as Record<
          string,
          { current_state: string }
        >;
        expect(Object.keys(workItems).sort()).toEqual(
          Object.keys(expectedFinalState).sort(),
        );
        for (const [id, finalState] of Object.entries(expectedFinalState)) {
          expect(workItems[id]).toBeDefined();
          expect(workItems[id]!.current_state).toBe(finalState);
        }
      }),
      { numRuns: 25 },
    );
  });
});

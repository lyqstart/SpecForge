import { describe, expect, it } from 'vitest';
import { V11_WORKFLOW_DEFINITIONS } from '../../packages/workflow-runtime/src/workflows/v11-definitions';

type Next = string | Record<string, string> | undefined;

function nextTargets(next: Next): string[] {
  if (!next) return [];
  if (typeof next === 'string') return [next];
  return Object.values(next);
}

function reachableStates(definition: any): Set<string> {
  const visited = new Set<string>();
  const queue = [definition.stateMachine.initial];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const state = definition.stateMachine.states[current];
    for (const target of nextTargets(state?.next)) {
      if (!visited.has(target)) queue.push(target);
    }
  }

  return visited;
}

describe('v1.1 workflow path reachability', () => {
  it('loads every built-in v1.1 workflow definition from the current runtime source', () => {
    const ids = V11_WORKFLOW_DEFINITIONS.map((definition) => definition.id).sort();

    expect(ids).toEqual([
      'bugfix_spec',
      'change_request',
      'feature_spec',
      'investigation',
      'ops_task',
      'quick_change',
      'refactor',
    ]);
  });

  it('all v1.1 workflows start at created and can reach closed', () => {
    for (const definition of V11_WORKFLOW_DEFINITIONS) {
      const visited = reachableStates(definition);

      expect(definition.stateMachine.initial, definition.id).toBe('created');
      expect(visited.has('closed'), `${definition.id} should reach closed`).toBe(true);
    }
  });

  it('spec-changing workflows include the candidate approval and merge chain', () => {
    const specChangingIds = new Set(['feature_spec', 'change_request']);

    for (const definition of V11_WORKFLOW_DEFINITIONS.filter((item) => specChangingIds.has(item.id))) {
      const visited = reachableStates(definition);

      expect(visited.has('candidate_preparing'), `${definition.id} should prepare candidates`).toBe(true);
      expect(visited.has('gates_running'), `${definition.id} should run gates`).toBe(true);
      expect(visited.has('approval_required'), `${definition.id} should require user approval`).toBe(true);
      expect(visited.has('approved'), `${definition.id} should record approval`).toBe(true);
      expect(visited.has('merge_ready'), `${definition.id} should enter merge_ready`).toBe(true);
      expect(visited.has('merged'), `${definition.id} should enter merged`).toBe(true);
    }
  });

  it('implementation workflows include implementation, verification, and close states', () => {
    for (const definition of V11_WORKFLOW_DEFINITIONS) {
      const visited = reachableStates(definition);

      expect(visited.has('implementation_ready'), `${definition.id} should enter implementation_ready`).toBe(true);
      expect(visited.has('implementation_running'), `${definition.id} should enter implementation_running`).toBe(true);
      expect(visited.has('verification_running'), `${definition.id} should enter verification_running`).toBe(true);
      expect(visited.has('verification_done'), `${definition.id} should enter verification_done`).toBe(true);
      expect(visited.has('closed'), `${definition.id} should enter closed`).toBe(true);
    }
  });
});

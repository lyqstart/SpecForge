import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { getHandler } from '../../src/tools/ToolDispatcher';

/** Synthetic state precondition only; recovery still consumes the real WAL. */
export async function seedRecoveryState(root: string, state = 'created', workItemId = 'WI-0001') {
  const manager = new StateManager(new PersonalPathResolver(), root);
  await manager.initialize();
  await manager.transition(workItemId, '', state, 'test', 'feature_spec');
}

export function recoveryStateDeps(root: string) {
  return {
    projectManager: {
      getProjectStateManager: async (requested: string) => {
        if (requested !== root) throw new Error('FIXTURE_PROJECT_MISMATCH');
        return new StateManager(new PersonalPathResolver(), root);
      },
    },
  };
}

export function getRecoveryHandlerForFixture(tool: string): ReturnType<typeof getHandler> {
  const handler = getHandler(tool);
  return handler
    ? (args, context, deps) =>
        handler(args, context, {
          ...recoveryStateDeps(context.directory!),
          ...deps,
        })
    : undefined;
}

/** Advance a synthetic fixture through the real event owner, preserving prior history. */
export async function advanceRecoveryState(root: string, state: string, workItemId = 'WI-0001') {
  const manager = new StateManager(new PersonalPathResolver(), root);
  await manager.initialize();
  const previous = manager.getState(workItemId)?.current_state ?? '';
  await manager.transition(workItemId, previous, state, 'test-fixture', 'feature_spec');
}

import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { getHandler } from '../../src/tools/ToolDispatcher';

/** Synthetic state precondition only; recovery still consumes the real WAL. */
export async function seedRecoveryState(root: string, state = 'created') {
  const manager = new StateManager(new PersonalPathResolver(), root);
  await manager.initialize();
  await manager.transition('WI-0001', '', state, 'test', 'feature_spec');
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

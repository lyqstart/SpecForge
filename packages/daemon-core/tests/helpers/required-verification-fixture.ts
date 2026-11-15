import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { RequiredVerificationOwner } from '../../src/tools/lib/required-verification-owner';
import path from 'node:path';
import { runGate, runRequiredGates } from '../../src/tools/lib/gate-runner-v11';
import type { GateIdV11, GateContext } from '../../src/tools/lib/gate-runner-v11';
import { executeMerge, type MergeInput } from '../../src/tools/lib/merge-runner-v11';
import { recordUserDecision, type RecordDecisionInput } from '../../src/tools/lib/user-decision-recorder-v11';
import { canonicalVerificationJson, verificationId } from '../../src/verification/owner-store';
import type { RequiredVerificationSourceRequest } from '@specforge/types/trusted-tool-invocation';
import { getHandler } from '../../src/tools/ToolDispatcher';

/** Explicit dependency for synthetic fixtures without declared requirements.
 * Uses the real retained WAL reader: missing/corrupt history must not be replaced
 * by a hard-coded empty result. This helper never grants approval or permissions. */
export function requiredVerificationForFixture(projectRoot: string): RequiredVerificationOwner {
  let initialized: Promise<StateManager> | undefined;
  return new RequiredVerificationOwner({ projectManager: {
    getProjectStateManager: async (requestedRoot: string) => {
      if (requestedRoot !== projectRoot) throw new Error('FIXTURE_PROJECT_MISMATCH');
      initialized ??= (async () => {
        const manager = new StateManager(new PersonalPathResolver(), projectRoot);
        // readRequiredVerificationHistory validates retained WAL/witnesses
        // directly; an empty-history fixture must not initialize state.json.
        return manager;
      })();
      return initialized;
    },
  } });
}

/** Legacy synthetic consumers now explicitly supply the new Runtime dependency.
 * Production functions and all their preconditions still run unchanged. */
export function runGateForFixture(gate: GateIdV11, context: GateContext) {
  return runGate(gate, { ...context, requiredVerification: context.requiredVerification ?? requiredVerificationForFixture(context.projectRoot) });
}
export function runRequiredGatesForFixture(gates: GateIdV11[], context: GateContext) {
  return runRequiredGates(gates, { ...context, requiredVerification: context.requiredVerification ?? requiredVerificationForFixture(context.projectRoot) });
}
export function executeMergeForFixture(input: MergeInput) {
  return executeMerge({ ...input, requiredVerification: input.requiredVerification ?? requiredVerificationForFixture(input.projectRoot) });
}
export function recordUserDecisionForFixture(input: Omit<RecordDecisionInput, 'projectRoot'> & { projectRoot?: string }) {
  const parent = path.dirname(path.resolve(input.workItemDir));
  const projectRoot = input.projectRoot ?? (path.basename(parent) === 'work-items' && path.basename(path.dirname(parent)) === '.specforge'
    ? path.dirname(path.dirname(parent)) : parent);
  return recordUserDecision({ ...input, projectRoot,
    requiredVerification: input.requiredVerification ?? requiredVerificationForFixture(projectRoot) });
}

/** Source adapter is deliberately synthetic; original handler/dispatcher tests
 * do not claim to exercise the OpenCode HTTP reader. Requests must still carry
 * valid explicit host identities; this adapter never inserts identities. */
export function requiredVerificationDepsForFixture<T extends Record<string, any>>(deps: T): T {
  const managers = new Map<string, Promise<StateManager>>();
  const projectManager = deps.projectManager;
  return { ...deps,
    toolInvocationVerifier: { ...deps.toolInvocationVerifier,
      readRequiredVerificationSource: deps.toolInvocationVerifier?.readRequiredVerificationSource ?? (async (input: RequiredVerificationSourceRequest) => ({
        source: 'required-verification-source/v1', sessionId: input.sessionId, callId: input.callId,
        messageId: 'msg_fixturecall', tool: input.tool, inputSha256: verificationId(canonicalVerificationJson(input.args)),
        agent: 'sf-orchestrator', directory: input.directory, userSessionId: input.sessionId,
        userMessageId: 'msg_fixtureuser', userTextSha256: verificationId('synthetic fixture: no declaration'),
        userCreatedAt: Date.now() - 1, observedAt: new Date().toISOString(), declaration: null,
        chainSha256: verificationId('synthetic fixture source chain'),
      })),
    },
    projectManager: !projectManager?.getProjectStateManager ? projectManager : new Proxy(projectManager, {
      get(target, property) {
        if (property !== 'getProjectStateManager') {
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (root: string) => {
        const original = await projectManager.getProjectStateManager(root);
        if (typeof original.readRequiredVerificationHistory === 'function') return original;
        return new Proxy(original, { get(target, property) {
          if (property === 'readRequiredVerificationHistory' || property === 'appendRequiredVerificationEvent')
            return async (...args: unknown[]) => {
              let initialized = managers.get(root);
              if (!initialized) {
                initialized = Promise.resolve(new StateManager(new PersonalPathResolver(), root));
                managers.set(root, initialized);
              }
              const requiredOwner = await initialized;
              return Reflect.apply(requiredOwner[property], requiredOwner, args);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        };
      },
    }),
  } as T;
}

export function getHandlerForFixture(tool: string): ReturnType<typeof getHandler> {
  const handler = getHandler(tool);
  return handler ? (args, context, deps) => handler(args, context, requiredVerificationDepsForFixture(deps)) : undefined;
}

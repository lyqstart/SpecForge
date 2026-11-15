import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ToolDispatcher, registerHandler } from '../../src/tools/ToolDispatcher';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';

describe('required verification source cannot be omitted at transport boundaries', () => {
  it.each(['task', 'write', 'edit', 'sf_handoff', 'sf_gate_run', 'sf_v11_gate_run', 'sf_merge_run', 'sf_v11_merge', 'sf_user_decision_record'])(
    'rejects %s before touching a project when host identity is absent', async tool => {
      const deps = { projectManager: { getProjectStateManager: async () => { throw new Error('MUST_NOT_TOUCH_PROJECT'); } } };
      expect(await checkNativeTool(deps, path.resolve('omission-fixture'), tool, {})).toEqual({
        allowed: false, reason: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED',
      });
    });
  it.each(['sf_handoff', 'sf_v11_handoff', 'sf_state_transition', 'sf_gate_run', 'sf_v11_gate_run', 'sf_merge_run', 'sf_v11_merge', 'sf_user_decision_record', 'sf_v11_decision'])(
    'rejects raw direct dispatch of %s without a real invocation', async tool => {
      let handlerCalls = 0;
      registerHandler(tool, async () => { handlerCalls++; return { success: true }; });
      const dispatcher = new ToolDispatcher({ projectManager: { getProjectStateManager: async () => ({ listWorkItems: () => [] }) } } as never);
      expect(await dispatcher.dispatch({ tool, args: {}, context: { directory: path.resolve('omission-fixture') } })).toEqual({
        success: false, error: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED',
      });
      expect(handlerCalls).toBe(0);
    });
  it('preserves read-only native diagnostics without inventing a source', async () => {
    expect(await checkNativeTool({}, path.resolve('omission-fixture'), 'read', {})).toEqual({ allowed: true });
  });
  it.each(['validate', 'required_status'])('does not register evidence for the finite %s query', async action => {
    const deps = { toolInvocationVerifier: { readRequiredVerificationSource: () => { throw new Error('QUERY_MUST_NOT_CAPTURE'); } } };
    expect(await checkNativeTool(deps, path.resolve('omission-fixture'), 'sf_handoff', { action })).toEqual({ allowed: true });
  });
  it.each(['write', 'validate_all', 'verify_required'])('still requires a real source for dependent handoff %s', async action => {
    expect(await checkNativeTool({}, path.resolve('omission-fixture'), 'sf_handoff', { action })).toEqual({
      allowed: false, reason: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED',
    });
  });
});

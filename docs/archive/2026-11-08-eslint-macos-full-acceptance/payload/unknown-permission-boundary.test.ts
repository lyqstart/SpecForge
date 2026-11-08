import { describe, expect, it } from 'vitest';
import { HardRuleEvaluator } from '../../src/hard-rules';
import { PermissionEngine } from '../../src/index';

describe('unknown permission inputs retain fail-closed boundaries', () => {
  it('keeps valid actor/resource decisions and rejects malformed actor fields', () => {
    const evaluator = new HardRuleEvaluator();
    expect(evaluator.evaluate('sf-executor', 'sf_state_transition', { type: 'tool' }).allowed).toBe(false);
    expect(evaluator.evaluate('sf-orchestrator', 'read', { type: 'code', path: 'src/index.ts' }).allowed).toBe(true);
    expect(() => evaluator.evaluate({ agentRole: 7 }, 'read', { type: 'code' })).toThrow('PERMISSION_STRING_FIELD_REQUIRED:agentRole');
  });
  it('rejects malformed config rule values instead of treating them as ordinary text', () => {
    const evaluator = new HardRuleEvaluator();
    expect(() => evaluator.detectConflicts({ rules: {} })).toThrow('PERMISSION_RULES_ARRAY_REQUIRED');
    expect(() => evaluator.detectConflicts({ rules: [{ effect: 4 }] })).toThrow('PERMISSION_STRING_FIELD_REQUIRED:effect');
  });
  it('keeps invalid resource/config objects outside normal permission evaluation', async () => {
    const engine = new PermissionEngine({ eventLoggingEnabled: false, projectId: 'unknown-boundary-fixture' });
    await expect(engine.checkPermission('sf-orchestrator', 'read', { type: 4 })).rejects.toThrow('PERMISSION_STRING_FIELD_REQUIRED:type');
    await expect(engine.validatePermissionConfig('not-an-object')).rejects.toThrow('PERMISSION_CONFIG_OBJECT_REQUIRED');
  });
});

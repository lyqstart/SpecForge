import { describe, expect, test } from 'vitest';
import {
  generateTriggerResult,
  normalizeImpactScope,
  validateImpactScopeFieldKinds,
} from '../../src/tools/lib/impact-analysis.js';
import {
  validateArtifactJson,
  validateTriggerResultJson,
} from '../../src/tools/lib/artifact-schema-validation.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const classification = {
  requirement_changed: true,
  acceptance_criteria_changed: false,
  business_rule_changed: false,
  user_visible_behavior_changed: false,
  data_semantics_changed: false,
  design_changed: true,
  module_boundary_changed: false,
  api_contract_changed: false,
  architecture_changed: true,
  data_model_changed: true,
  module_contract_changed: true,
  unknowns: [],
};

const baseScope = {
  affected_modules: ['CORE'],
  architecture_refs: ['ARCH-CORE-001'],
  data_model_refs: ['DATA-CORE-001'],
  design_refs: ['DD-CORE-001'],
  project_contract_refs: [],
  module_contract_refs: ['INV-CORE-001', 'PI-CORE-001', 'shared_enum:MovementType'],
  planned_code_paths: ['src/index.ts'],
};

function trigger(scope: unknown) {
  return JSON.stringify({
    schema_version: '1.1',
    work_item_id: 'WI-0001',
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    classification,
    match_results: [],
    impact_scope: scope,
    selected_at: '2026-08-14T00:00:00.000Z',
  });
}

describe('Phase 11 Impact Scope field-kind contract', () => {
  test('accepts Module code only in affected_modules and real Contract IDs in module_contract_refs', () => {
    const scope = normalizeImpactScope(baseScope);
    expect(validateImpactScopeFieldKinds(scope)).toEqual([]);
    expect(validateTriggerResultJson(trigger(baseScope), 'WI-0001')).toEqual({
      valid: true,
      errors: [],
    });
  });

  test('rejects Fresh-04 failure shape module_contract_refs=["CORE"]', () => {
    const invalid = { ...baseScope, module_contract_refs: ['CORE'] };
    const errors = validateImpactScopeFieldKinds(normalizeImpactScope(invalid));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('IMPACT_SCOPE_MODULE_CODE_USED_AS_REFERENCE');
    expect(errors[0]).toContain('impact_scope.module_contract_refs');
  });

  test('generateTriggerResult fails before persisting a Module-code-as-reference collision', () => {
    expect(() =>
      generateTriggerResult(
        'WI-0001',
        classification as any,
        [],
        { ...baseScope, module_contract_refs: ['CORE'] },
      ),
    ).toThrow('IMPACT_SCOPE_FIELD_KIND_INVALID');
  });

  test('controlled trigger_result writer schema dispatch rejects the collision', () => {
    const result = validateArtifactJson(
      'trigger_result.json',
      trigger({ ...baseScope, module_contract_refs: ['CORE'] }),
      'WI-0001',
      'requirement_change_path',
    );
    expect(result?.valid).toBe(false);
    expect(result?.errors.join('\n')).toContain('IMPACT_SCOPE_MODULE_CODE_USED_AS_REFERENCE');
  });

  test('rejects a trigger_result that completely omits the authoritative impact_scope object', () => {
    const missingImpactScope = JSON.stringify({
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      classification,
      match_results: [],
      selected_at: '2026-08-14T00:00:00.000Z',
    });
    const result = validateTriggerResultJson(missingImpactScope, 'WI-0001');
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'INVALID_IMPACT_SCOPE: impact_scope must be a JSON object',
    );
  });

  test('requires the seven fixed Impact Scope array fields and string entries', () => {
    const result = validateTriggerResultJson(
      trigger({
        affected_modules: ['CORE'],
        module_contract_refs: [],
        planned_code_paths: [42],
      }),
      'WI-0001',
    );
    expect(result.valid).toBe(false);
    const text = result.errors.join('\n');
    expect(text).toContain('impact_scope.architecture_refs must be an array');
    expect(text).toContain('impact_scope.planned_code_paths[0] must be a non-empty string');
  });

  test('sf-orchestrator documents the same field-kind producer contract', async () => {
    const content = await fs.readFile(
      path.resolve(process.cwd(), 'setup/userlevel-opencode/agents/sf-orchestrator.md'),
      'utf-8',
    );
    expect(content).toContain('### Impact Scope Field-Kind Producer Contract');
    expect(content).toContain('module_contract_refs');
    expect(content).toContain('禁止');
    expect(content).toContain('Module code');
    expect(content).toContain('sf_artifact_write(file_type=trigger_result)');
  });
});

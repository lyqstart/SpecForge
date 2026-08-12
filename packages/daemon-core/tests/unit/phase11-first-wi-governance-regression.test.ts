import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateTriggerResultJson } from '../../src/tools/lib/artifact-schema-validation';
import { authorContractCandidate } from '../../src/tools/lib/contract-authoring';
import { resolveModuleContractsPathValue } from '../../src/tools/lib/project-governance-v2';

const fullClassification = {
  requirement_changed: true,
  acceptance_criteria_changed: true,
  business_rule_changed: true,
  user_visible_behavior_changed: true,
  data_semantics_changed: true,
  design_changed: true,
  module_boundary_changed: true,
  api_contract_changed: true,
  architecture_changed: true,
  data_model_changed: true,
  module_contract_changed: true,
  unknowns: [],
};

function trigger(classification: Record<string, unknown>) {
  return JSON.stringify({
    schema_version: '1.0',
    work_item_id: 'WI-0001',
    workflow_path: 'requirement_change_path',
    classification,
  });
}

describe('Phase 11 first-WI governance regression', () => {
  it('requires the authoritative data_model_changed and module_contract_changed classification fields', () => {
    const valid = validateTriggerResultJson(trigger(fullClassification), 'WI-0001');
    expect(valid.valid, valid.errors.join('; ')).toBe(true);

    const missingDataModel = { ...fullClassification } as Record<string, unknown>;
    delete missingDataModel.data_model_changed;
    const dataResult = validateTriggerResultJson(trigger(missingDataModel), 'WI-0001');
    expect(dataResult.valid).toBe(false);
    expect(dataResult.errors.join('; ')).toContain('classification.data_model_changed must be boolean');

    const aliasOnly = { ...fullClassification, interface_contract_changed: true } as Record<string, unknown>;
    delete aliasOnly.module_contract_changed;
    const moduleResult = validateTriggerResultJson(trigger(aliasOnly), 'WI-0001');
    expect(moduleResult.valid).toBe(false);
    expect(moduleResult.errors.join('; ')).toContain('classification.module_contract_changed must be boolean');
  });

  it('keeps object-valued module contract metadata out of gate input paths', () => {
    expect(
      resolveModuleContractsPathValue(
        { schema: 'inline' },
        { schema: 'inline' },
        '.specforge/project/modules/CORE',
      ),
    ).toBe('.specforge/project/modules/CORE/contracts.json');
    expect(
      resolveModuleContractsPathValue(
        '.specforge/project/modules/CORE/custom-contracts.json',
        undefined,
        '.specforge/project/modules/CORE',
      ),
    ).toBe('.specforge/project/modules/CORE/custom-contracts.json');
    expect(
      resolveModuleContractsPathValue(
        undefined,
        '.specforge/project/modules/CORE/from-module.json',
        '.specforge/project/modules/CORE',
      ),
    ).toBe('.specforge/project/modules/CORE/from-module.json');
  });

  it('rejects DD-sourced Module Contract content at the Project Contract writer boundary', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-phase11-contract-'));
    try {
      const result = await authorContractCandidate({
        projectRoot,
        workItemId: 'WI-0001',
        workflowPath: 'requirement_change_path',
        kind: 'invariant',
        entry: {
          id: 'CORE-INV-001',
          owner_module: 'CORE',
          source_refs: ['DD-CORE-001'],
          enforcement: 'runtime',
          rule: 'available must never be negative',
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Project Contract source_refs must contain only ARCH-/DATA- IDs');
      await expect(
        fs.access(
          path.join(
            projectRoot,
            '.specforge',
            'work-items',
            'WI-0001',
            'candidates',
            'project',
            'extension_registry.json',
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });
});

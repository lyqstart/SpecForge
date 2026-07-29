import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { selectWorkflowPath } from './impact-analysis';
import { isGovernedNewModuleAdmission as mergeAdmission } from './merge-runner-v11';
import { resolveDeclaredCandidateModuleId } from '../handlers/sf-artifact-write';

const roots: string[] = [];

function createProject(): { root: string; wiDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-greenfield-'));
  roots.push(root);
  const projectDir = path.join(root, '.specforge', 'project');
  const wiDir = path.join(root, '.specforge', 'work-items', 'WI-0001');
  fs.mkdirSync(path.join(projectDir, 'modules', 'CORE'), { recursive: true });
  fs.mkdirSync(wiDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'spec_manifest.json'),
    JSON.stringify(
      {
        schema_version: '6.0',
        project_spec_version: 'PSV-0001',
        default_module: 'CORE',
        modules: [
          {
            module_code: 'CORE',
            module_file: '.specforge/project/modules/CORE/module.json',
            requirements: '.specforge/project/modules/CORE/requirements.md',
            design: '.specforge/project/modules/CORE/design.md',
            contracts: '.specforge/project/modules/CORE/contracts.json',
            trace: '.specforge/project/modules/CORE/trace.md',
          },
        ],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify({
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    })
  );
  fs.writeFileSync(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      classification: {
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
        contract_registry_only: false,
        unknowns: [],
      },
    })
  );
  return { root, wiDir };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('greenfield multi-module governance', () => {
  it('keeps Requirement ownership when Architecture and module boundaries also change', () => {
    expect(
      selectWorkflowPath({
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
        contract_registry_only: false,
        unknowns: [],
      })
    ).toBe('requirement_change_path');
  });

  it('routes a new module Candidate by explicit module_id in a governed Requirement WI', () => {
    const { root } = createProject();
    const result = resolveDeclaredCandidateModuleId(
      '---\nanalysis_scope: solution_design\n---\nREQ-001',
      root,
      'WI-0001',
      'DOMAIN'
    );
    expect(result.error).toBeUndefined();
    expect(result.moduleId).toBe('DOMAIN');
  });

  it('authorizes merge admission for a Requirement WI with explicit module-boundary impact', async () => {
    const { wiDir } = createProject();
    await expect(mergeAdmission(wiDir, 'requirement_change_path')).resolves.toBe(true);
    await expect(mergeAdmission(wiDir, 'task_change_path')).resolves.toBe(false);
  });
});

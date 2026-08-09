import { describe, expect, test } from 'bun:test';
import { validateSemanticClosure } from '../../src/tools/lib/semantic-closure-core.js';
import {
  buildSemanticClosureFromArtifacts,
  parseSemanticClosureManifest,
} from '../../src/tools/lib/semantic-closure-builder.js';
import { closeSpecArtifactRequirements } from '../../src/tools/lib/close-gate.js';
import { isSpecMigrationNoCodeWorkflow } from '../../src/tools/lib/project-governance-v2.js';
import { isNoCodeWorkflow as changedFilesNoCodeWorkflow } from '../../src/tools/handlers/sf-changed-files-audit.js';

function validSpecMigrationManifest(): any {
  return {
    schema_version: '1.0',
    closure_profile: 'spec_migration',
    workflow_type: 'spec_migration',
    work_item_id: 'WI-0004',
    outcomes: [],
    requirements: [],
    design_decisions: [],
    tasks: [],
    evidence: [
      {
        id: 'EV-SPEC-MIGRATION-VERIFY',
        status: 'passed',
        level: 'L4',
        evidence_type: 'behavioral_verification',
      },
    ],
    project_integration: { required: true, status: 'merged' },
    spec_migration: {
      project_spec_version: 'PSV-0004',
      atomic_spec_merge_status: 'success',
      post_merge_gate_status: 'passed',
      changed_files_audit_status: 'passed',
      verification_status: 'passed',
      trace_contract_status: 'passed',
    },
  };
}

describe('spec_migration no-code lifecycle contract', () => {
  test('recognizes spec_migration as no-code across consumers', () => {
    expect(isSpecMigrationNoCodeWorkflow('spec_migration', 'spec_migration_path')).toBe(true);
    expect(isSpecMigrationNoCodeWorkflow('feature_spec', 'requirement_change_path')).toBe(false);
    expect(
      changedFilesNoCodeWorkflow({
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
      }),
    ).toBe(true);
    expect(closeSpecArtifactRequirements('spec_migration_path', 'spec_migration')).toEqual({
      tasks: false,
      traceDelta: true,
    });
  });

  test('validates typed spec_migration semantic closure without fabricated Task chain', () => {
    const result = validateSemanticClosure(validSpecMigrationManifest());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects fabricated implementation entities in spec_migration semantic closure', () => {
    const manifest = validSpecMigrationManifest();
    manifest.tasks = [{ id: 'TASK-FAKE' }];
    const result = validateSemanticClosure(manifest);
    expect(result.passed).toBe(false);
    expect(
      result.errors.some(
        item => item.check_id === 'spec_migration_no_fabricated_implementation_chain',
      ),
    ).toBe(true);
  });

  test('builder accepts curated typed spec_migration profile as formal producer input', () => {
    const supplied = validSpecMigrationManifest();
    const parsed = parseSemanticClosureManifest(supplied);
    expect(parsed?.closure_profile).toBe('spec_migration');
    const built = buildSemanticClosureFromArtifacts({
      workItemId: 'WI-0004',
      workItem: {
        work_item_id: 'WI-0004',
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
      },
      curatedSemanticClosure: supplied,
      mergeReportMd: 'Status: success\nProject Spec Version: PSV-0004\n',
    });
    expect(built.source).toBe('tool_argument');
    expect(built.validation.passed).toBe(true);
    expect(built.manifest.tasks ?? []).toHaveLength(0);
  });
});

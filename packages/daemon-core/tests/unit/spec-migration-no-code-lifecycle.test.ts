import { describe, expect, test } from 'bun:test';
import { validateSemanticClosure } from '../../src/tools/lib/semantic-closure-core.js';
import {
  buildSemanticClosureFromArtifacts,
  parseSemanticClosureManifest,
} from '../../src/tools/lib/semantic-closure-builder.js';
import { closeSpecArtifactRequirements } from '../../src/tools/lib/close-gate.js';
import { isSpecMigrationNoCodeWorkflow } from '../../src/tools/lib/project-governance-v2.js';
import { isNoCodeWorkflow as changedFilesNoCodeWorkflow } from '../../src/tools/handlers/sf-changed-files-audit.js';
import {
  defaultGateAliasForState,
  evaluateVerificationGateAutoAdvanceEligibility,
  isVerificationRecoverableState,
  normalizeGateIds,
} from '../../src/tools/handlers/sf-v11-gate-run.js';
import { getRequiredGates } from '../../src/tools/lib/required-gates.js';
import { isCanonicalNoCodeVerificationCandidateManifest } from '../../src/tools/lib/state-coordinator-v11.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

  test('routes spec_migration verification through Verification + Formal Version and permits no-code state recovery', () => {
    expect(defaultGateAliasForState('post_merge_verified', 'spec_migration')).toBe('verification');
    expect(
      getRequiredGates('spec_migration_path', 'post_implementation', 'full', 'spec_migration'),
    ).toEqual(['verification_gate', 'formal_version_gate']);
    expect(
      getRequiredGates('spec_migration_path', 'all', 'full', 'spec_migration'),
    ).toContain('formal_version_gate');
    expect(
      normalizeGateIds(
        undefined,
        'verification',
        'spec_migration_path',
        'post_merge_verified',
        'full',
        'spec_migration',
      ).gateIds,
    ).toEqual(['verification_gate', 'formal_version_gate']);
    expect(isVerificationRecoverableState('post_merge_verified', 'spec_migration')).toBe(true);
    expect(isVerificationRecoverableState('post_merge_verified', 'architecture_change')).toBe(false);
    expect(
      evaluateVerificationGateAutoAdvanceEligibility({
        reports: [
          { gate_id: 'verification_gate', status: 'passed' },
          { gate_id: 'formal_version_gate', status: 'passed' },
        ],
        summaryStatus: 'passed',
      }),
    ).toEqual({
      allowed: true,
      reason: 'verification_and_formal_version_gates_passed',
      failed_gate_ids: [],
      missing_gate_ids: [],
    });
  });

  test('accepts the exact frozen mixed-scope WI-0004 spec_migration Candidate and rejects identity/path drift', () => {
    const manifest = {
      schema_version: '1.1',
      work_item_id: 'WI-0004',
      workflow_path: 'spec_migration_path',
      base_spec_version: 'PSV-0003',
      project_spec_precondition_sha256:
        'sha256:44ff476f4d111f9e9c7c92c56e8627a05278c9a55b6c56ebb840319327ec25fc',
      repair_evidence_paths: [
        '.specforge/project/architecture.md',
        '.specforge/project/modules/REPORTING/design.md',
        '.specforge/project/modules/CLI/design.md',
      ],
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/modules/REPORTING/design.candidate.md',
          target_path: '.specforge/project/modules/REPORTING/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'REPORTING',
          inferred: false,
          normalized: true,
        },
        {
          candidate_path: 'candidates/project/modules/CLI/design.candidate.md',
          target_path: '.specforge/project/modules/CLI/design.md',
          operation: 'replace',
          type: 'design',
          module_id: 'CLI',
          inferred: false,
          normalized: true,
        },
        {
          candidate_path: 'candidates/project/extension_registry.json',
          target_path: '.specforge/project/extension_registry.json',
          operation: 'replace',
          type: 'extension_registry',
          inferred: false,
          normalized: true,
        },
        {
          candidate_path: 'candidates/project/modules/REPORTING/contracts.candidate.json',
          target_path: '.specforge/project/modules/REPORTING/contracts.json',
          operation: 'replace',
          type: 'module_contract',
          module_id: 'REPORTING',
          inferred: false,
          normalized: true,
        },
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          type: 'trace_delta',
          operation: 'replace',
          inferred: true,
          normalized: true,
        },
      ],
      workflow_type: 'spec_migration',
    };
    expect(
      isCanonicalNoCodeVerificationCandidateManifest({
        manifest,
        workItemId: 'WI-0004',
        workflowType: 'spec_migration',
      }),
    ).toBe(true);
    expect(
      isCanonicalNoCodeVerificationCandidateManifest({
        manifest: { ...manifest, workflow_path: 'contract_change_path' },
        workItemId: 'WI-0004',
        workflowType: 'spec_migration',
      }),
    ).toBe(false);
    expect(
      isCanonicalNoCodeVerificationCandidateManifest({
        manifest: {
          ...manifest,
          entries: [
            ...manifest.entries.slice(0, -1),
            {
              ...manifest.entries.at(-1),
              target_path: '.specforge/project/../outside.md',
            },
          ],
        },
        workItemId: 'WI-0004',
        workflowType: 'spec_migration',
      }),
    ).toBe(false);
  });
  test('pins sf-verifier and spec-migration Skill to the no-code evidence/output contract', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const verifier = await readFile(
      join(repoRoot, 'setup/userlevel-opencode/agents/sf-verifier.md'),
      'utf-8',
    );
    const skill = await readFile(
      join(repoRoot, 'setup/userlevel-opencode/skills/sf-workflow-spec-migration/SKILL.md'),
      'utf-8',
    );
    const authority = await readFile(
      join(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md'),
      'utf-8',
    );
    expect(authority).toContain('Verification reconciliation');
    expect(authority).toContain('最终冻结且已通过 Candidate / Atomic Spec Merge / Post-Spec-Merge Gate 的 Candidate manifest');
    expect(authority).toContain('reconciliation_phase=candidate|verification');
    for (const token of [
      'spec_migration 专用 Required Output',
      '"outcomes": []',
      '"requirements": []',
      '"design_decisions": []',
      '"tasks": []',
      'id/status/level/evidence_type/supports',
    ]) {
      expect(verifier).toContain(token);
    }
    expect(skill).toContain('sf_gate_run(gate_type="verification")');
    expect(skill).toContain('sf_gate_run(reconcile_attempt_id="<latest-passed-attempt>")');
    expect(skill).toContain('id/status/level/evidence_type/supports');
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

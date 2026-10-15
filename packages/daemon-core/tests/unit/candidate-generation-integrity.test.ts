import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  candidateSealInputPaths,
  readCurrentProjectSpecBinding,
  validateCandidateProjectSpecBinding,
  validatePassingCandidateGateAttempt,
} from '../../src/tools/lib/candidate-generation-integrity';
import { buildGateAttemptInputSnapshot } from '../../src/tools/lib/gate-chain';
import type { GateReportV11 } from '../../src/tools/lib/gate-runner-v11';
import {
  resolveFrozenManifestArtifacts,
  resolveWorkItemSpecArtifacts,
  validateDecisionRecordPreconditions,
} from '../../src/tools/lib/governance-invariants-v11';
import { validateFormalRequirementBodies } from '../../src/tools/lib/sf_requirements_gate_core';
import {
  materializeImplementationBaseline,
  validateImplementationTruthBeforeSeal,
} from '../../src/tools/lib/implementation-baseline';
import { validateCandidateRequirementReferences } from '../../src/tools/lib/candidate-requirement-reference-integrity';
import {
  deduplicateResolvedPaths,
  isSameOrDescendantResolvedPath,
  resolvedPathIdentity,
} from '../../src/tools/lib/path-identity';

const roots: string[] = [];

function hash(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function passedCandidateManifestReport(workItemId: string): GateReportV11 {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: 'candidate_manifest_gate',
    gate_type: 'hard_gate',
    required: true,
    status: 'passed',
    input_files: [],
    checks: [{ check_id: 'ok', description: 'ok', passed: true }],
    blocking_issues: [],
    warnings: [],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-10-15T00:00:00.000Z',
    finished_at: '2026-10-15T00:00:01.000Z',
    runner: 'gate_runner',
  };
}

async function makeProject(): Promise<{
  projectRoot: string;
  workItemDir: string;
  specManifestBytes: Buffer;
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-generation-integrity-'));
  roots.push(projectRoot);
  const projectDir = join(projectRoot, '.specforge', 'project');
  const workItemDir = join(projectRoot, '.specforge', 'work-items', 'WI-0001');
  await mkdir(join(workItemDir, 'candidates', 'project', 'modules', 'CORE'), { recursive: true });
  await mkdir(projectDir, { recursive: true });
  const specManifestBytes = Buffer.from(
    JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0002' }, null, 2) + '\n',
  );
  await writeFile(join(projectDir, 'spec_manifest.json'), specManifestBytes);
  await writeFile(
    join(workItemDir, 'candidate_manifest.json'),
    JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0002',
      project_spec_precondition_sha256: hash(specManifestBytes),
      merge_required: true,
      entries: [{
        type: 'requirements',
        candidate_path: 'candidates/project/modules/CORE/requirements.candidate.md',
        target_path: '.specforge/project/modules/CORE/requirements.md',
        operation: 'replace',
      }],
    }, null, 2) + '\n',
  );
  await writeFile(join(workItemDir, 'change_classification.md'), '# Classification\n');
  await writeFile(join(workItemDir, 'impact_analysis.md'), '# Impact\n');
  await writeFile(join(workItemDir, 'trigger_result.json'), '{}\n');
  await writeFile(
    join(workItemDir, 'implementation_baseline.json'),
    JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      captured_at: '2026-10-15T00:00:00.000Z',
      snapshot_id: hash('empty implementation baseline'),
      planned_code_paths: [],
      current_file_count: 0,
      all_planned_paths_missing: true,
      entries: [],
    }, null, 2) + '\n',
  );
  await writeFile(
    join(workItemDir, 'candidates', 'project', 'modules', 'CORE', 'requirements.candidate.md'),
    '# Requirements\n',
  );
  return { projectRoot, workItemDir, specManifestBytes };
}

async function writePassingAttempt(input: {
  projectRoot: string;
  workItemDir: string;
  omitCandidateFile?: boolean;
}): Promise<string> {
  const attemptId = 'attempt-0001';
  const attemptPath = join(input.workItemDir, 'gate_attempts', attemptId);
  await mkdir(join(attemptPath, 'gates'), { recursive: true });
  const summary = '# Gate Summary\n\nWork Item: WI-0001\nOverall Status: passed\n';
  await writeFile(join(input.workItemDir, 'gate_summary.md'), summary);
  await writeFile(join(attemptPath, 'gate_summary.md'), summary);
  const report = passedCandidateManifestReport('WI-0001');
  const sealPaths = await candidateSealInputPaths(input.workItemDir);
  const candidatePath = join(
    input.workItemDir,
    'candidates',
    'project',
    'modules',
    'CORE',
    'requirements.candidate.md',
  );
  const effectiveSealPaths = input.omitCandidateFile
    ? sealPaths.filter(value => value !== candidatePath)
    : sealPaths;
  const snapshot = await buildGateAttemptInputSnapshot(
    input.projectRoot,
    [report],
    process.platform,
    effectiveSealPaths,
  );
  await writeFile(
    join(attemptPath, 'attempt-result.json'),
    JSON.stringify({
      schema_version: '1.0',
      attempt_id: attemptId,
      work_item_id: 'WI-0001',
      source: 'gate_run',
      started_at: '2026-10-15T00:00:00.000Z',
      completed_at: '2026-10-15T00:00:01.000Z',
      requested_gate_ids: ['candidate_manifest_gate'],
      current_report_gate_ids: ['candidate_manifest_gate'],
      summary_report_gate_ids: ['candidate_manifest_gate'],
      summary_status: 'passed',
      input_snapshot: 'input-snapshot.json',
    }, null, 2),
  );
  await writeFile(
    join(attemptPath, 'input-snapshot.json'),
    JSON.stringify({
      schema_version: '1.0',
      attempt_id: attemptId,
      work_item_id: 'WI-0001',
      captured_at: '2026-10-15T00:00:01.000Z',
      inputs: snapshot,
    }, null, 2),
  );
  return hash(summary);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Candidate generation integrity', () => {
  it('uses target-platform resolved path identity without weakening POSIX case semantics', () => {
    const upper = join('fixture', 'project', 'modules', 'CORE', 'requirements.candidate.md');
    const lower = join('fixture', 'project', 'modules', 'core', 'requirements.candidate.md');

    expect(resolvedPathIdentity(upper, 'win32')).toBe(resolvedPathIdentity(lower, 'win32'));
    expect(deduplicateResolvedPaths([upper, lower], 'win32')).toHaveLength(1);
    expect(isSameOrDescendantResolvedPath(upper, join('fixture', 'PROJECT'), 'win32')).toBe(true);

    expect(resolvedPathIdentity(upper, 'linux')).not.toBe(resolvedPathIdentity(lower, 'linux'));
    expect(deduplicateResolvedPaths([upper, lower], 'linux')).toHaveLength(2);
    expect(isSameOrDescendantResolvedPath(upper, join('fixture', 'PROJECT'), 'linux')).toBe(false);
  });

  it('counts a Windows CORE/core Candidate alias once while preserving real noncanonical REQ failures', async () => {
    const { projectRoot, workItemDir } = await makeProject();
    const requirementsPath = join(
      workItemDir,
      'candidates',
      'project',
      'modules',
      'CORE',
      'requirements.candidate.md',
    );
    await writeFile(
      requirementsPath,
      [
        '# Requirements',
        '## REQ-CORE-001 Board',
        'User Story: render a board.',
        '### Acceptance Criteria',
        '- board visible',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(workItemDir, 'requirements_delta.md'),
      '# Delta\n\nReferences the noncanonical identifier REQ-CORE-0001.\n',
    );

    const artifacts = await resolveWorkItemSpecArtifacts({
      projectRoot,
      workItemId: 'WI-0001',
      kind: 'requirements',
    });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe(requirementsPath);

    const result = await validateCandidateRequirementReferences({
      workItemDir,
      requirementArtifacts: artifacts,
    });
    expect(result.errors.join('\n')).not.toContain('REQUIREMENT_DEFINITION_DUPLICATE');
    expect(result.errors.join('\n')).toContain('REQUIREMENT_REFERENCE_NONCANONICAL');
    expect(result.errors.join('\n')).toContain('REQ-CORE-0001');
  });

  it.runIf(process.platform === 'win32')(
    'deduplicates case aliases declared twice by a frozen Windows Candidate Manifest',
    async () => {
      const { projectRoot, workItemDir } = await makeProject();
      const manifestPath = join(workItemDir, 'candidate_manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      manifest.entries.push({
        ...manifest.entries[0],
        candidate_path: 'candidates/project/modules/core/requirements.candidate.md',
      });
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

      const artifacts = await resolveFrozenManifestArtifacts({
        projectRoot,
        workItemId: 'WI-0001',
        artifactTypes: ['requirements'],
      });
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].path.replace(/\\/g, '/')).toContain(
        'candidates/project/modules/CORE/requirements.candidate.md',
      );
    },
  );

  it('binds Candidate baseline to current Project Spec version and raw bytes', async () => {
    const { projectRoot, specManifestBytes } = await makeProject();
    const binding = await readCurrentProjectSpecBinding(projectRoot);
    expect(binding.version).toBe('PSV-0002');
    expect(binding.sha256).toBe(hash(specManifestBytes));

    const stale = await validateCandidateProjectSpecBinding({
      projectRoot,
      manifest: {
        base_spec_version: 'PSV-0001',
        project_spec_precondition_sha256: hash(specManifestBytes),
      },
    });
    expect(stale.valid).toBe(false);
    expect(stale.errors.join('\n')).toContain('CANDIDATE_BASE_SPEC_VERSION_STALE');
  });

  it('accepts a passing Attempt only when every sealed Candidate input is snapshotted and fresh', async () => {
    const { projectRoot, workItemDir } = await makeProject();
    const gateSummaryHash = await writePassingAttempt({ projectRoot, workItemDir });
    const valid = await validatePassingCandidateGateAttempt({
      projectRoot,
      workItemDir,
      gateSummaryHash,
      requireLatestAttempt: true,
    });
    expect(valid).toEqual({ valid: true, errors: [], attemptId: 'attempt-0001' });

    await writeFile(
      join(workItemDir, 'candidates', 'project', 'modules', 'CORE', 'requirements.candidate.md'),
      '# Changed after Gate\n',
    );
    const stale = await validatePassingCandidateGateAttempt({
      projectRoot,
      workItemDir,
      gateSummaryHash,
      requireLatestAttempt: true,
    });
    expect(stale.valid).toBe(false);
    expect(stale.errors.join('\n')).toContain('GATE_ATTEMPT_INPUT_HASH_CHANGED');
  });

  it('rejects a passing Attempt whose snapshot omits one Candidate file', async () => {
    const { projectRoot, workItemDir } = await makeProject();
    const gateSummaryHash = await writePassingAttempt({
      projectRoot,
      workItemDir,
      omitCandidateFile: true,
    });
    const result = await validatePassingCandidateGateAttempt({
      projectRoot,
      workItemDir,
      gateSummaryHash,
      requireLatestAttempt: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('GATE_ATTEMPT_CANDIDATE_SEAL_INPUT_MISSING');
  });

  it('allows approval preconditions only when the latest passing Attempt binds the complete current generation', async () => {
    const { projectRoot, workItemDir } = await makeProject();
    await writePassingAttempt({ projectRoot, workItemDir });
    const valid = await validateDecisionRecordPreconditions({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
      requestedWorkflowPath: 'requirement_change_path',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'user',
      currentState: 'approval_required',
    });
    expect(valid.valid).toBe(true);

    const manifestPath = join(workItemDir, 'candidate_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.base_spec_version = 'PSV-0001';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const stale = await validateDecisionRecordPreconditions({
      projectRoot,
      workItemDir,
      workItemId: 'WI-0001',
      requestedWorkflowPath: 'requirement_change_path',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'user',
      currentState: 'approval_required',
    });
    expect(stale.valid).toBe(false);
    expect(stale.errors.join('\n')).toContain('CANDIDATE_BASE_SPEC_VERSION_STALE');
  });

  it('rejects indexed REQ identifiers without unique bodies and acceptance criteria', () => {
    const incomplete = `# Requirements

| ID | Summary |
| --- | --- |
| REQ-CORE-0001 | board |
| REQ-CORE-0002 | undo |

## REQ-CORE-0001 Board

User Story: render the board.

### Acceptance Criteria

- The board is visible.
`;
    expect(validateFormalRequirementBodies(incomplete)).toEqual([
      'REQ-CORE-0001: requirement ID must use canonical REQ-<MODULE_CODE>-<NNN> format',
      'REQ-CORE-0002: requirement ID must use canonical REQ-<MODULE_CODE>-<NNN> format',
      'REQ-CORE-0002: formal requirement body missing',
    ]);

    const missingAcceptance = `# Requirements

## REQ-CORE-0001 Board

User Story: render the board.
`;
    expect(validateFormalRequirementBodies(missingAcceptance)).toEqual([
      'REQ-CORE-0001: requirement ID must use canonical REQ-<MODULE_CODE>-<NNN> format',
      'REQ-CORE-0001: acceptance criteria missing from formal requirement body',
    ]);
  });

  it('captures the real planned implementation and rejects stale greenfield Candidate claims', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-implementation-baseline-'));
    roots.push(projectRoot);
    const workItemDir = join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await mkdir(join(workItemDir, 'candidates'), { recursive: true });
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(join(projectRoot, 'src', 'main.ts'), 'export const value = 1;\n');
    await writeFile(
      join(workItemDir, 'trigger_result.json'),
      JSON.stringify({
        impact_scope: { planned_code_paths: ['src/main.ts', 'src/new.ts'] },
      }),
    );
    await writeFile(
      join(workItemDir, 'impact_analysis.md'),
      '# Impact\n\n```json\n{"all_files_new":true}\n```\n',
    );

    const materialized = await materializeImplementationBaseline(projectRoot, 'WI-0001');
    expect(materialized.baseline.current_file_count).toBe(1);
    expect(materialized.baseline.entries[0].matched_files[0].path).toBe('src/main.ts');
    await writeFile(
      join(workItemDir, 'candidates', 'design.candidate.md'),
      `implementation_baseline_id: ${materialized.baseline.snapshot_id}\n\n当前业务实现不存在。\n`,
    );
    await writeFile(
      join(workItemDir, 'candidates', 'tasks.md'),
      `implementation_baseline_id: ${materialized.baseline.snapshot_id}\n\n- **Current Implementation**: none\n`,
    );

    const invalid = await validateImplementationTruthBeforeSeal({ projectRoot, workItemId: 'WI-0001' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join('\n')).toContain('IMPLEMENTATION_BASELINE_CONTRADICTION');
    expect(invalid.errors.join('\n')).toContain('all_files_new');

    await writeFile(
      join(workItemDir, 'impact_analysis.md'),
      '# Impact\n\n```json\n{"all_files_new":false}\n```\n',
    );
    await writeFile(
      join(workItemDir, 'candidates', 'design.candidate.md'),
      `implementation_baseline_id: ${materialized.baseline.snapshot_id}\n\n现有入口位于 src/main.ts。\n`,
    );
    await writeFile(
      join(workItemDir, 'candidates', 'tasks.md'),
      `implementation_baseline_id: ${materialized.baseline.snapshot_id}\n\n- **Current Implementation**: src/main.ts 已存在，执行修改。\n`,
    );
    expect(
      await validateImplementationTruthBeforeSeal({ projectRoot, workItemId: 'WI-0001' }),
    ).toMatchObject({ valid: true, errors: [] });

    await writeFile(join(projectRoot, 'src', 'main.ts'), 'export const value = 2;\n');
    const stale = await validateImplementationTruthBeforeSeal({ projectRoot, workItemId: 'WI-0001' });
    expect(stale.valid).toBe(false);
    expect(stale.errors.join('\n')).toContain('IMPLEMENTATION_BASELINE_STALE');
  });

  it('requires every Candidate REQ reference to resolve exactly to a canonical definition', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'sf-requirement-reference-'));
    roots.push(projectRoot);
    const workItemDir = join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    const candidatesDir = join(workItemDir, 'candidates');
    await mkdir(candidatesDir, { recursive: true });
    const requirementsPath = join(candidatesDir, 'requirements.candidate.md');
    const requirementsContent = [
      '# Requirements',
      '## REQ-CORE-001 Board',
      'User Story: board.',
      '### Acceptance Criteria',
      '- board visible',
      '',
    ].join('\n');
    await writeFile(requirementsPath, requirementsContent);
    await writeFile(
      join(candidatesDir, 'design.candidate.md'),
      '# Design\n\nRefs: REQ-CORE-001, REQ-CORE-002, REQ-CORE-0001\n',
    );

    const invalid = await validateCandidateRequirementReferences({
      workItemDir,
      requirementArtifacts: [{ path: requirementsPath, content: requirementsContent }],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join('\n')).toContain('REQUIREMENT_REFERENCE_UNRESOLVED');
    expect(invalid.errors.join('\n')).toContain('REQ-CORE-002');
    expect(invalid.errors.join('\n')).toContain('REQUIREMENT_REFERENCE_NONCANONICAL');
    expect(invalid.errors.join('\n')).toContain('REQ-CORE-0001');

    await writeFile(
      join(candidatesDir, 'design.candidate.md'),
      '# Design\n\nRefs: REQ-CORE-001\n',
    );
    expect(
      await validateCandidateRequirementReferences({
        workItemDir,
        requirementArtifacts: [{ path: requirementsPath, content: requirementsContent }],
      }),
    ).toMatchObject({ valid: true, errors: [], declared_requirement_ids: ['REQ-CORE-001'] });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveCanonicalCandidateWorkflowPath,
  validateCandidateManifestJson,
} from '../../src/tools/lib/artifact-schema-validation';
import { runChangedFilesAudit } from '../../src/tools/lib/changed-files-audit';
import {
  readTrustedGitGovernanceProjectWrites,
  recordGitGovernanceProjectWrites,
} from '../../src/tools/lib/git-governance-write-provenance';
import { gitIgnoreDecisionRecord } from '../../src/tools/lib/git-governance-stage3';

describe('Phase 11 Fresh-03 governance regressions', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fsp.rm(root, { recursive: true, force: true })));
  });

  it('rejects unknown and canonical-workflow mismatches in candidate_manifest', () => {
    const unknown = validateCandidateManifestJson(
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        workflow_path: 'unknown',
        entries: [],
      }),
      'WI-0001',
      'requirement_change_path',
    );
    expect(unknown.valid).toBe(false);
    expect(unknown.errors.join('; ')).toContain('INVALID_WORKFLOW_PATH');

    const mismatch = validateCandidateManifestJson(
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        workflow_path: 'design_change_path',
        entries: [],
      }),
      'WI-0001',
      'requirement_change_path',
    );
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.join('; ')).toContain('WORKFLOW_PATH_MISMATCH');
  });

  it('canonicalizes only missing/unknown transient workflow placeholders', () => {
    expect(resolveCanonicalCandidateWorkflowPath('unknown', 'requirement_change_path'))
      .toBe('requirement_change_path');
    expect(resolveCanonicalCandidateWorkflowPath(undefined, 'requirement_change_path'))
      .toBe('requirement_change_path');
    expect(() =>
      resolveCanonicalCandidateWorkflowPath('design_change_path', 'requirement_change_path')
    ).toThrow('CANDIDATE_MANIFEST_WORKFLOW_PATH_CONFLICT');
  });

  it('accepts only hash-current controlled Git governance metadata', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sf-git-provenance-'));
    roots.push(root);
    const target = path.join(root, '.specforge', 'project', 'git_policy.json');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, '{"schema_version":"git_governance.v1"}\n', 'utf-8');

    recordGitGovernanceProjectWrites(root, 'sf_git_project_adopt', [
      '.specforge/project/git_policy.json',
    ]);
    const trusted = readTrustedGitGovernanceProjectWrites(root);
    expect(trusted).toEqual([
      expect.objectContaining({
        path: '.specforge/project/git_policy.json',
        producer: 'sf_git_project_adopt',
      }),
    ]);

    const accepted = runChangedFilesAudit(
      [{ path: '.specforge/project/git_policy.json', operation: 'create' }],
      [],
      'agent',
      trusted,
    );
    expect(accepted.passed, accepted.violations.join('; ')).toBe(true);
    expect(accepted.trusted_control_plane_files).toBe(1);
    expect(accepted.in_scope).toBe(0);

    fs.writeFileSync(target, '{"schema_version":"tampered"}\n', 'utf-8');
    const stale = readTrustedGitGovernanceProjectWrites(root);
    expect(stale).toEqual([]);
    const rejected = runChangedFilesAudit(
      [{ path: '.specforge/project/git_policy.json', operation: 'create' }],
      [],
      'agent',
      stale,
    );
    expect(rejected.passed).toBe(false);
    expect(rejected.violations.join('; ')).toContain('spec_write_by_non_merge_runner');
  });

  it('records provenance for sf_git_ignore_decision_record', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sf-git-ignore-provenance-'));
    roots.push(root);
    const result = await gitIgnoreDecisionRecord({
      projectRoot: root,
      confirmed: true,
      decisions: [{ path: '.pytest_cache/', decision: 'ignore', reason: 'generated cache' }],
    });
    expect(result.success).toBe(true);
    expect(readTrustedGitGovernanceProjectWrites(root)).toEqual([
      expect.objectContaining({
        path: '.specforge/project/git_ignore_decisions.json',
        producer: 'sf_git_ignore_decision_record',
      }),
    ]);
  });
});

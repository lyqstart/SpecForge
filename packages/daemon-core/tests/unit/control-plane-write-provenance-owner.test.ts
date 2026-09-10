import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readTrustedAtomicSpecMergeProjectWrites,
  recordAtomicSpecMergeProjectWrites,
} from '../../src/tools/lib/atomic-spec-merge-write-provenance.js';
import {
  readTrustedGitGovernanceProjectWrites,
  recordGitGovernanceProjectWrites,
} from '../../src/tools/lib/git-governance-write-provenance.js';
import { gitIgnoreDecisionRecord } from '../../src/tools/lib/git-governance-stage3.js';

describe('control-plane write provenance persistent owners', () => {
  const roots: string[] = [];

  async function projectRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-control-plane-provenance-'));
    roots.push(root);
    await mkdir(path.join(root, '.specforge', 'runtime'), { recursive: true });
    return root;
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('fails closed on malformed Atomic Spec Merge provenance and preserves bytes', async () => {
    const root = await projectRoot();
    const provenancePath = path.join(root, '.specforge', 'runtime', 'atomic_spec_merge_controlled_writes.json');
    const bytes = '{broken-atomic-provenance\n';
    await writeFile(provenancePath, bytes, 'utf8');

    expect(() => readTrustedAtomicSpecMergeProjectWrites(root)).toThrow(
      'ATOMIC_SPEC_MERGE_PROVENANCE_INVALID',
    );
    expect(await readFile(provenancePath, 'utf8')).toBe(bytes);
  });

  it('does not reconstruct trusted Atomic Spec Merge provenance from legacy artifacts', async () => {
    const root = await projectRoot();
    const projectDir = path.join(root, '.specforge', 'project');
    const workItemDir = path.join(root, '.specforge', 'work-items', 'WI-0002');
    await mkdir(projectDir, { recursive: true });
    await mkdir(workItemDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'spec_manifest.json'),
      JSON.stringify({
        project_spec_version: 'PSV-0003',
        last_merged_work_item: 'WI-0002',
        last_merged_at: '2026-08-16T00:00:00.000Z',
        last_merged_targets: [],
      }) + '\n',
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'candidate_manifest.json'),
      JSON.stringify({ work_item_id: 'WI-0002', entries: [] }) + '\n',
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'user_decision.json'),
      JSON.stringify({ work_item_id: 'WI-0002', decision_status: 'approved' }) + '\n',
      'utf8',
    );
    await writeFile(
      path.join(workItemDir, 'merge_report.md'),
      '# Merge Report\n\nWork Item: WI-0002\nStatus: success\n\n- Spec Manifest Updated: true\n- Project Spec Version: PSV-0003\n',
      'utf8',
    );

    expect(readTrustedAtomicSpecMergeProjectWrites(root)).toEqual([]);
  });

  it('fails closed on unknown Git provenance schema and preserves bytes', async () => {
    const root = await projectRoot();
    const provenancePath = path.join(root, '.specforge', 'runtime', 'git_governance_controlled_writes.json');
    const bytes = '{"schema_version":"git_governance_controlled_writes.v9","writes":[]}\n';
    await writeFile(provenancePath, bytes, 'utf8');

    expect(() => readTrustedGitGovernanceProjectWrites(root)).toThrow(
      'GIT_GOVERNANCE_PROVENANCE_INVALID',
    );
    expect(await readFile(provenancePath, 'utf8')).toBe(bytes);
  });

  it('does not overwrite malformed Git provenance when recording a current write', async () => {
    const root = await projectRoot();
    const target = path.join(root, '.specforge', 'project', 'git_policy.json');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '{"schema_version":"git_governance.v1"}\n', 'utf8');
    const provenancePath = path.join(root, '.specforge', 'runtime', 'git_governance_controlled_writes.json');
    const bytes = '{broken-git-provenance\n';
    await writeFile(provenancePath, bytes, 'utf8');

    expect(() =>
      recordGitGovernanceProjectWrites(root, 'sf_git_project_adopt', [
        '.specforge/project/git_policy.json',
      ]),
    ).toThrow('GIT_GOVERNANCE_PROVENANCE_INVALID');
    expect(await readFile(provenancePath, 'utf8')).toBe(bytes);
  });

  it('does not mutate Git governance metadata when existing provenance is malformed', async () => {
    const root = await projectRoot();
    const decisionsPath = path.join(root, '.specforge', 'project', 'git_ignore_decisions.json');
    await mkdir(path.dirname(decisionsPath), { recursive: true });
    const originalDecisions = '{"schema_version":"git_ignore_decisions.v1","decisions":[]}\n';
    await writeFile(decisionsPath, originalDecisions, 'utf8');
    const provenancePath = path.join(root, '.specforge', 'runtime', 'git_governance_controlled_writes.json');
    const malformed = '{broken-git-provenance\n';
    await writeFile(provenancePath, malformed, 'utf8');

    await expect(
      gitIgnoreDecisionRecord({
        projectRoot: root,
        confirmed: true,
        decisions: [{ path: '.cache/', decision: 'ignore', reason: 'generated cache' }],
      }),
    ).rejects.toThrow('GIT_GOVERNANCE_PROVENANCE_INVALID');
    expect(await readFile(decisionsPath, 'utf8')).toBe(originalDecisions);
    expect(await readFile(provenancePath, 'utf8')).toBe(malformed);
  });
});

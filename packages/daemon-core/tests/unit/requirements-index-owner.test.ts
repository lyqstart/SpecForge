import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import '../../src/tools/handlers/sf-artifact-write';
import { getHandler } from '../../src/tools/ToolDispatcher';
import { ensureProjectInit } from '../../src/tools/lib/sf_project_init_core';
import { materializeCandidateManifestEntries } from '../../src/tools/lib/governance-invariants-v11';
import { inspectRequirementsGeneration } from '../../src/tools/lib/requirements-generation';
import {
  resolveRequirementsAuthority,
  captureRequirementsInputBinding,
  assertRequirementsInputBinding,
} from '../../src/tools/lib/requirements-authority';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-index-owner-'));
  roots.push(root);
  const wi = path.join(root, '.specforge/work-items/WI-0001');
  await mkdir(wi, { recursive: true });
  await writeFile(
    path.join(wi, 'work_item.json'),
    JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001' })
  );
  const formal = path.join(root, '.specforge/project/requirements_index.md');
  await mkdir(path.dirname(formal), { recursive: true });
  await writeFile(formal, '> TODO: legacy index\n');
  const write = (content: string, agent = 'sf-requirements', state = 'candidate_preparing') =>
    getHandler('sf_artifact_write')!(
      { work_item_id: 'WI-0001', file_type: 'candidate_requirements_index', content },
      { directory: root, agent },
      {
        projectManager: { getProjectStateManager: async () => ({ getState: async () => state }) },
      } as never
    );
  return {
    root,
    wi,
    formal,
    write,
    candidate: path.join(wi, 'candidates/project/requirements_index.md'),
  };
}
const index = '---\nrequirements_role: reference_context\n---\n# Requirements Index\nREQ-AA-001\n';
describe('D28 controlled requirements index lifecycle', () => {
  it('writes a separate owned Candidate and includes it in manifest materialization', async () => {
    const f = await fixture();
    const result: any = await f.write(index);
    expect(result.success).toBe(true);
    expect(await readFile(f.candidate, 'utf8')).toBe(index);
    expect(await readFile(f.formal, 'utf8')).toBe('> TODO: legacy index\n');
    await mkdir(path.join(f.wi, 'candidates/project/modules/AA'), { recursive: true });
    await writeFile(
      path.join(f.wi, 'candidates/project/modules/AA/requirements.candidate.md'),
      '## REQ-AA-001\nAcceptance Criteria: substantive.\n'
    );
    const resultManifest = materializeCandidateManifestEntries(
      { entries: [], workflow_path: 'requirement_change_path' },
      f.wi,
      { requirement_changed: true }
    );
    expect(resultManifest.entries).toContainEqual(
      expect.objectContaining({
        type: 'requirements_index',
        candidate_path: 'candidates/project/requirements_index.md',
        target_path: '.specforge/project/requirements_index.md',
      })
    );
    await writeFile(
      path.join(f.root, '.specforge/project/spec_manifest.json'),
      JSON.stringify({ modules: [{ module_code: 'AA' }] })
    );
    await writeFile(
      path.join(f.wi, 'candidate_manifest.json'),
      JSON.stringify({ entries: resultManifest.entries })
    );
    const input = { projectRoot: f.root, workItemId: 'WI-0001' };
    const authority = await resolveRequirementsAuthority(input);
    expect(inspectRequirementsGeneration(authority.artifacts).errors).toEqual([]);
    expect(authority.artifacts.some(a => a.path === f.candidate)).toBe(true);
    expect(authority.artifacts.some(a => a.path === f.formal)).toBe(false);
    const binding = await captureRequirementsInputBinding(input);
    await writeFile(f.candidate, index + 'REQ-ZZ-001\n');
    await expect(assertRequirementsInputBinding(input, binding)).rejects.toThrow('INPUT_DRIFT');
    expect(
      inspectRequirementsGeneration(
        (await resolveRequirementsAuthority(input)).artifacts
      ).errors.join('\n')
    ).toContain('REQ-ZZ-001');
  });
  it.each(['sf-design', 'sf-orchestrator', 'sf-executor'])(
    'denies wrong owner %s without replacing formal bytes',
    async agent => {
      const f = await fixture();
      expect(((await f.write(index, agent)) as any).success).toBe(false);
      await expect(readFile(f.candidate)).rejects.toThrow();
      expect(await readFile(f.formal, 'utf8')).toBe('> TODO: legacy index\n');
    }
  );
  it('denies frozen writes and context-owned obligations', async () => {
    const f = await fixture();
    expect(((await f.write(index, 'sf-requirements', 'candidate_prepared')) as any).error).toBe(
      'CANDIDATE_FROZEN'
    );
    for (const content of [
      '# Index\nREQ-AA-001',
      index + '\n## REQ-AA-002\nAcceptance Criteria: hidden',
      index + '\n- AC-AA-001-1: hidden',
    ]) {
      expect(((await f.write(content)) as any).error).toBe('INVALID_REQUIREMENTS_INDEX_CONTEXT');
    }
    await expect(readFile(f.candidate)).rejects.toThrow();
  });
  it('initializes an explicit zero-coverage context and never rewrites a legacy index', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-index-init-'));
    roots.push(root);
    expect(
      (await ensureProjectInit(root, 'Synthetic', { ensureHostProfile: async () => {} })).success
    ).toBe(true);
    const file = path.join(root, '.specforge/project/requirements_index.md');
    const content = await readFile(file, 'utf8');
    expect(content).toContain('requirements_role: reference_context');
    expect(inspectRequirementsGeneration([{ path: file, content }]).declaredIds).toEqual([]);
    await writeFile(file, '> TODO: preserve legacy\n');
    await ensureProjectInit(root, 'Synthetic', { ensureHostProfile: async () => {} });
    expect(await readFile(file, 'utf8')).toBe('> TODO: preserve legacy\n');
  });
});

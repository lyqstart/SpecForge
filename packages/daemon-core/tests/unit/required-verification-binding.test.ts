import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { readRequiredVerificationBinding, assertRequiredVerificationScope } from '../../src/tools/lib/required-verification-binding';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('sf-required-binding-')) throw new Error('UNSAFE_TEST_CLEANUP');
  await fs.rm(resolved, { recursive: true, force: true });
} });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-required-binding-')); roots.push(root);
  const wi = path.join(root, SPEC_DIR_NAME, 'work-items', 'WI-0001');
  const project = path.join(root, SPEC_DIR_NAME, 'project');
  await fs.mkdir(wi, { recursive: true }); await fs.mkdir(project, { recursive: true });
  const spec = JSON.stringify({ project_spec_version: 'PSV-0001' });
  await fs.writeFile(path.join(project, 'spec_manifest.json'), spec);
  const manifest = { schema_version: '1.0', work_item_id: 'WI-0001', workflow_path: 'requirement_change_path', base_spec_version: 'PSV-0001', merge_required: true,
    project_spec_precondition_sha256: 'sha256:' + createHash('sha256').update(spec).digest('hex'),
    entries: [{ candidate_path: 'candidates/trace_delta.md', target_path: '.specforge/project/trace_matrix.md', operation: 'replace', type: 'trace_delta', candidate_hash: 'old' }], manifest_hash: 'derived-old' };
  const writeManifest = () => fs.writeFile(path.join(wi, 'candidate_manifest.json'), JSON.stringify(manifest));
  await writeManifest();
  await fs.writeFile(path.join(wi, 'implementation_baseline.json'), JSON.stringify({ schema_version: '1.0', work_item_id: 'WI-0001', snapshot_id: 'sha256:' + 'b'.repeat(64), captured_at: 'original-time' }));
  for (const name of ['change_classification.md', 'impact_analysis.md', 'trigger_result.json']) await fs.writeFile(path.join(wi, name), 'finite owned fixture');
  return { root, wi, project, manifest, writeManifest };
}
function declaration(binding: Awaited<ReturnType<typeof readRequiredVerificationBinding>>) {
  return { schema_version: '1.0' as const, profile: 'candidate-exact-file-sha256/v1' as const, work_item_id: 'WI-0001', project_spec_manifest_sha256: binding.specSha256, candidate_generation: binding.generation,
    requirements: [{ id: 'RV-trace', path: 'candidates/trace_delta.md', owner: 'sf-task-planner' as const, expected_sha256: 'c'.repeat(64) }] };
}

describe('required verification actual authority binding', () => {
  it('allows content repair without changing the scope generation, while preserving owner identity', async () => {
    const f = await fixture(); const first = await readRequiredVerificationBinding(f.root, 'WI-0001');
    f.manifest.entries[0]!.candidate_hash = 'repaired'; f.manifest.manifest_hash = 'derived-repaired'; await f.writeManifest();
    const current = await readRequiredVerificationBinding(f.root, 'WI-0001');
    expect(current.generation).toBe(first.generation);
    expect(() => assertRequiredVerificationScope(declaration(first), current)).not.toThrow();
  });
  it('does not allow a changed authority input to silently clear the old binding', async () => {
    const f = await fixture(); const first = await readRequiredVerificationBinding(f.root, 'WI-0001');
    await fs.appendFile(path.join(f.wi, 'impact_analysis.md'), '\nchanged scope');
    const current = await readRequiredVerificationBinding(f.root, 'WI-0001');
    expect(current.generation).not.toBe(first.generation);
    expect(() => assertRequiredVerificationScope(declaration(first), current)).toThrow('GENERATION_MISMATCH');
  });
  it('rejects files not registered by the Candidate owner and wrong professional ownership', async () => {
    const f = await fixture(); const binding = await readRequiredVerificationBinding(f.root, 'WI-0001');
    const missing = declaration(binding); missing.requirements[0]!.path = 'candidates/extra.md';
    expect(() => assertRequiredVerificationScope(missing, binding)).toThrow('SCOPE_OR_OWNER');
    f.manifest.entries[0]!.type = 'design'; await f.writeManifest();
    const changed = await readRequiredVerificationBinding(f.root, 'WI-0001');
    expect(() => assertRequiredVerificationScope(declaration(changed), changed)).toThrow('SCOPE_OR_OWNER');
  });
  it('rejects ambiguous aliases and deleted candidate entries', async () => {
    const f = await fixture(); f.manifest.entries.push({ ...f.manifest.entries[0]!, candidate_path: 'candidates/TRACE_DELTA.md' }); await f.writeManifest();
    const ambiguous = await readRequiredVerificationBinding(f.root, 'WI-0001');
    if (process.platform === 'win32') expect(() => assertRequiredVerificationScope(declaration(ambiguous), ambiguous)).toThrow('SCOPE_OR_OWNER');
    else expect(() => assertRequiredVerificationScope(declaration(ambiguous), ambiguous)).not.toThrow();
    f.manifest.entries.pop(); f.manifest.entries[0]!.operation = 'delete'; await f.writeManifest();
    const deleted = await readRequiredVerificationBinding(f.root, 'WI-0001');
    expect(() => assertRequiredVerificationScope(declaration(deleted), deleted)).toThrow('SCOPE_OR_OWNER');
  });
  it('rejects a stale formal baseline and hardlinked authority input', async () => {
    const f = await fixture(); f.manifest.base_spec_version = 'PSV-0002'; await f.writeManifest();
    await expect(readRequiredVerificationBinding(f.root, 'WI-0001')).rejects.toThrow('BASELINE_MISMATCH');
    f.manifest.base_spec_version = 'PSV-0001'; await f.writeManifest();
    await fs.link(path.join(f.project, 'spec_manifest.json'), path.join(f.root, 'alias.json'));
    await expect(readRequiredVerificationBinding(f.root, 'WI-0001')).rejects.toThrow('HARDLINK');
  });
});

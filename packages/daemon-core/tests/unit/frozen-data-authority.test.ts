import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { approvedFrozenDataPaths } from '../../src/verification/frozen-data-authority';
import { verificationId } from '../../src/verification/owner-store';
import type { VerificationAuthoritySnapshot } from '../../src/verification/verification-plan';

const roots: string[] = [];
async function fixture(patch: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-utf8-authority-'));
  roots.push(root);
  const scopePath = '.specforge/work-items/WI-9002/governance_scope.json';
  const taskPath = '.specforge/work-items/WI-9002/candidates/tasks.md';
  const scope = {
    schema_version: '1.0',
    work_item_id: 'WI-9002',
    project_spec_version: 'PSV-0002',
    frozen_at: '2026-01-01T00:00:00.000Z',
    allowed_write_files: ['docs/a.md', 'docs/c.md'],
    ...patch,
  };
  const task =
    '### TASK-WI-9002-001 Verify\n\n- **refs**: [DD-TEST-001, REQ-TEST-001]\n- **allowed_write_files**: [docs/a.md, docs/b.md]\n- **verification_commands**:\n  - unit:\n    - `node -e "console.log(\'ok\')"`\n';
  const files: Record<string, string> = {};
  for (const [relative, text] of [
    [scopePath, JSON.stringify(scope)],
    [taskPath, task],
  ]) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, text);
    files[relative] = verificationId(text);
  }
  // This unit fixture supplies authenticated-byte bindings only; real approval capture is covered by Runtime tests.
  const authority = {
    workItemId: 'WI-9002',
    psv: 'PSV-0002',
    taskPath,
    files,
    command: `node -e "const fs=require('fs');const t=fs.readFileSync('docs/a.md','utf8');console.log(t)"`,
  } as VerificationAuthoritySnapshot;
  return { root, scopePath, taskPath, authority };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (
      path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('sf-utf8-authority-')
    )
      throw Error('UNSAFE_CLEANUP');
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe('frozen data permission derivation', () => {
  it('uses exact intersection, never the Task union or scope alone', async () => {
    const f = await fixture();
    expect(await approvedFrozenDataPaths(f.root, f.authority)).toEqual(['docs/a.md']);
  });
  it.each([
    { schema_version: '2.0' },
    { work_item_id: 'WI-9003' },
    { project_spec_version: 'PSV-0003' },
    { frozen_at: '' },
    { allowed_write_files: ['../a.md'] },
    { allowed_write_files: ['docs/*.md'] },
    { allowed_write_files: ['docs/a.md', 'DOCS/A.MD'] },
    { allowed_write_files: ['docs/a.md', 'docs/a.md'] },
    { allowed_write_files: [true] },
    { allowed_write_files: null },
  ])('rejects malformed frozen scope %j', async patch => {
    const f = await fixture(patch);
    await expect(approvedFrozenDataPaths(f.root, f.authority)).rejects.toThrow();
  });
  it.each(['scopePath', 'taskPath'] as const)('rejects changed authority bytes: %s', async key => {
    const f = await fixture();
    await fs.appendFile(path.join(f.root, f[key]), '\n');
    await expect(approvedFrozenDataPaths(f.root, f.authority)).rejects.toThrow('AUTHORITY_INVALID');
  });
  it('requires hash bindings and does not upgrade old command authority', async () => {
    const f = await fixture();
    delete f.authority.files[f.scopePath];
    await expect(approvedFrozenDataPaths(f.root, f.authority)).rejects.toThrow('AUTHORITY_INVALID');
    f.authority.command = 'node -e "console.log(\'ok\')"';
    expect(await approvedFrozenDataPaths(f.root, f.authority)).toEqual([]);
  });
});

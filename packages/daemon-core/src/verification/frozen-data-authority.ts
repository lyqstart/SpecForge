/** Data permissions are derived from already authenticated governance bytes, never tool arguments. */
import path from 'node:path';
import { workItemRoot } from '@specforge/types/directory-layout';
import { validateTaskArtifactContract } from '../tools/lib/sf_markdown_verification_parser';
import { readVerificationFile, verificationId } from './owner-store';
import { assertVerificationRelativePath } from './source-snapshot';
import { hasFrozenUtf8Dependency } from './frozen-utf8-proof';
import { tokenizeNodeDeclaration } from './node-command-contract';
import { isStaticTaskDeclaration } from './static-task-command';
import type { VerificationAuthoritySnapshot } from './verification-plan';

export async function approvedFrozenDataPaths(
  root: string,
  authority: VerificationAuthoritySnapshot
): Promise<string[]> {
  if (isStaticTaskDeclaration(authority.command)) return [];
  const args = tokenizeNodeDeclaration(authority.command);
  if (
    args.length !== 3 ||
    args[0] !== 'node' ||
    args[1] !== '-e' ||
    !hasFrozenUtf8Dependency(args[2])
  )
    return [];
  const fail = (): never => {
    throw Error('VERIFICATION_FROZEN_DATA_AUTHORITY_INVALID');
  };
  async function bound(relative: string): Promise<Buffer> {
    assertVerificationRelativePath(relative);
    const bytes = await readVerificationFile(path.join(root, relative), 16 * 1024 * 1024);
    if (verificationId(bytes) !== authority.files[relative]) fail();
    if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) fail();
    return bytes;
  }
  const scopePath = path
    .relative(root, path.join(workItemRoot(root, authority.workItemId), 'governance_scope.json'))
    .replace(/\\/g, '/');
  const scope = JSON.parse((await bound(scopePath)).toString('utf8')) as Record<string, unknown>;
  if (
    !scope ||
    scope.schema_version !== '1.0' ||
    scope.work_item_id !== authority.workItemId ||
    scope.project_spec_version !== authority.psv ||
    typeof scope.frozen_at !== 'string' ||
    !Number.isFinite(Date.parse(scope.frozen_at)) ||
    !Array.isArray(scope.allowed_write_files) ||
    !scope.allowed_write_files.every(p => typeof p === 'string')
  )
    fail();
  const allowed = scope.allowed_write_files as string[];
  const aliases = new Set<string>();
  for (const name of allowed) {
    assertVerificationRelativePath(name);
    if (aliases.has(name.toLowerCase())) fail();
    aliases.add(name.toLowerCase());
  }
  const tasks = validateTaskArtifactContract((await bound(authority.taskPath)).toString('utf8'), {
    requireAllowedWriteFiles: true,
  });
  if (!tasks.valid) fail();
  const frozen = new Set(allowed),
    approved = new Set<string>();
  for (const task of tasks.tasks)
    for (const name of task.allowed_write_files) {
      assertVerificationRelativePath(name);
      if (frozen.has(name)) approved.add(name);
    }
  return [...approved].sort();
}

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { readWorkItemMetadata } from './work-item-metadata';
import { readAuthoritativeProjectSpecVersion } from './work-item-lifecycle-v11';
import { assertVerificationPath, readVerificationFile } from '../../verification/owner-store';
import type { CurrentContractSubject } from './contract-authoring';

/** Recognize only the historical Runtime bootstrap, never a malformed full Candidate. */
export async function prepareContractBootstrapManifest(input: {
  projectRoot: string;
  workItemId: string;
  manifest: Record<string, unknown>;
  subject: CurrentContractSubject;
}): Promise<{ original: Buffer; file: string; archive: string } | null> {
  const m = input.manifest;
  if (Object.hasOwn(m, 'workflow_type')) return null;
  const wi = path.join(input.projectRoot, SPEC_DIR_NAME, 'work-items', input.workItemId);
  const metadata = await readWorkItemMetadata(wi, input.workItemId);
  const psv = await readAuthoritativeProjectSpecVersion(input.projectRoot);
  const keys = [
    'schema_version',
    'work_item_id',
    'workflow_path',
    'base_spec_version',
    'merge_required',
    'entries',
  ].sort();
  if (
    Object.keys(m).sort().join(',') !== keys.join(',') ||
    m.schema_version !== '1.0' ||
    m.work_item_id !== input.workItemId ||
    m.workflow_path !== input.subject.workflow_path ||
    metadata.workflow_type !== input.subject.workflow_type ||
    metadata.workflow_path !== m.workflow_path ||
    metadata.code_change_allowed !== false ||
    !Array.isArray(metadata.allowed_write_files) ||
    metadata.allowed_write_files.length !== 0 ||
    m.base_spec_version !== psv ||
    m.merge_required !== (m.workflow_path !== 'code_only_fast_path') ||
    !Array.isArray(m.entries) ||
    m.entries.length !== 0
  ) {
    throw new Error('CURRENT_CONTRACT_BOOTSTRAP_SUBJECT_INVALID');
  }
  const file = path.join(wi, 'candidate_manifest.json');
  const original = await readVerificationFile(file);
  if (JSON.stringify(JSON.parse(original.toString('utf8'))) !== JSON.stringify(m)) {
    throw new Error('CURRENT_CONTRACT_BOOTSTRAP_CHANGED');
  }
  const digest = createHash('sha256').update(original).digest('hex');
  const archive = path.join(wi, 'candidate_manifest_bootstrap_history', digest + '.json');
  await assertVerificationPath(archive, true);
  // Materialization is in-memory until the complete Contract proposal has passed validation.
  m.workflow_type = metadata.workflow_type;
  return { original, file, archive };
}

export async function preserveContractBootstrapManifest(prepared: {
  original: Buffer;
  file: string;
  archive: string;
}): Promise<void> {
  if (!(await readVerificationFile(prepared.file)).equals(prepared.original)) {
    throw new Error('CURRENT_CONTRACT_BOOTSTRAP_CHANGED');
  }
  await assertVerificationPath(prepared.archive, true);
  await fs.mkdir(path.dirname(prepared.archive), { recursive: true });
  try {
    await fs.writeFile(prepared.archive, prepared.original, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!(await readVerificationFile(prepared.archive)).equals(prepared.original)) {
      throw new Error('CURRENT_CONTRACT_BOOTSTRAP_HISTORY_CHANGED');
    }
  }
}

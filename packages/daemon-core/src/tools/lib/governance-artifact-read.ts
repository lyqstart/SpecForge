import path from 'node:path';
import { CandidateManifestSchema } from '@specforge/types';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import {
  readVerificationFileSnapshot,
  verificationId,
  canonicalVerificationJson,
} from '../../verification/owner-store';

export const GOVERNANCE_READ_CONTRACT = 'governance-artifact-read/v1' as const;
export const GOVERNANCE_READ_FILE_LIMIT = 1024 * 1024;
// JSON escaping can expand every character sixfold. Keep each response below
// native tool display budgets even for one long line of control characters.
export const GOVERNANCE_READ_CHUNK_BYTES = 2048;

export interface GovernanceReadInput {
  work_item_id: string;
  artifact: string;
  offset?: number;
  version?: string;
}

/** Exact original bytes, never a Gate echo, formatted JSON, or reconstructed document. */
export async function readGovernanceArtifact(projectRoot: string, input: GovernanceReadInput) {
  if (!path.isAbsolute(projectRoot) || !/^WI-\d{4,}$/.test(input.work_item_id))
    throw new Error('GOVERNANCE_READ_IDENTITY_INVALID');
  const artifact = input.artifact;
  if (
    typeof artifact !== 'string' ||
    artifact.length > 512 ||
    !/^[A-Za-z0-9_./-]+$/.test(artifact) ||
    artifact.split('/').some(part => !part || part === '.' || part === '..') ||
    path.isAbsolute(artifact)
  )
    throw new Error('GOVERNANCE_READ_PATH_INVALID');
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error('GOVERNANCE_READ_OFFSET_INVALID');
  if (
    (offset > 0 && typeof input.version !== 'string') ||
    (input.version !== undefined && !/^[a-f0-9]{64}$/.test(input.version))
  )
    throw new Error('GOVERNANCE_READ_VERSION_REQUIRED');
  const wiRoot = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', input.work_item_id);
  const manifestFile = path.join(wiRoot, 'candidate_manifest.json');
  const manifestSnapshot = await readVerificationFileSnapshot(
    manifestFile,
    GOVERNANCE_READ_FILE_LIMIT
  );
  const manifest = CandidateManifestSchema.parse(
    JSON.parse(manifestSnapshot.bytes.toString('utf8'))
  );
  if (manifest.work_item_id !== input.work_item_id)
    throw new Error('GOVERNANCE_READ_WORK_ITEM_MISMATCH');
  if (artifact !== 'implementation_baseline.json') {
    const matches = manifest.entries.filter(entry => entry.candidate_path === artifact);
    if (
      !artifact.startsWith('candidates/') ||
      matches.length !== 1 ||
      matches[0].operation === 'delete'
    )
      throw new Error('GOVERNANCE_READ_UNREGISTERED_ARTIFACT');
  }
  const snapshot = await readVerificationFileSnapshot(
    path.join(wiRoot, artifact),
    GOVERNANCE_READ_FILE_LIMIT
  );
  // Decode the whole source first: no replacement characters or split UTF-8 code points.
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(snapshot.bytes);
  const raw = snapshot.bytes;
  if (offset > raw.length || (offset < raw.length && (raw[offset] & 0xc0) === 0x80))
    throw new Error('GOVERNANCE_READ_OFFSET_INVALID');
  const sha256 = verificationId(raw);
  const version = verificationId(
    canonicalVerificationJson({
      work_item_id: input.work_item_id,
      artifact,
      identity: snapshot.identity,
      sha256,
      manifest_sha256: verificationId(manifestSnapshot.bytes),
    })
  );
  if (input.version !== undefined && input.version !== version)
    throw new Error('GOVERNANCE_READ_SOURCE_CHANGED');
  let end = Math.min(raw.length, offset + GOVERNANCE_READ_CHUNK_BYTES);
  while (end < raw.length && (raw[end] & 0xc0) === 0x80) end--;
  const chunk = raw.subarray(offset, end);
  const manifestAfter = await readVerificationFileSnapshot(
    manifestFile,
    GOVERNANCE_READ_FILE_LIMIT
  );
  if (verificationId(manifestAfter.bytes) !== verificationId(manifestSnapshot.bytes))
    throw new Error('GOVERNANCE_READ_MANIFEST_CHANGED');
  return {
    success: true,
    contract: GOVERNANCE_READ_CONTRACT,
    work_item_id: input.work_item_id,
    artifact,
    version,
    sha256,
    chunk_sha256: verificationId(chunk),
    total_bytes: raw.length,
    offset,
    next_offset: end,
    eof: end === raw.length,
    truncated: false,
    content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(chunk),
    evidence_scope: 'Exact source bytes only; not semantic verification or Candidate approval.',
  };
}

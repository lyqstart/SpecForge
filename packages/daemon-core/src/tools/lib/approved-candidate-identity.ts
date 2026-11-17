import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateCurrentUserDecisionValue } from '@specforge/types';
import { candidateManifestContentBlockCode } from './candidate-manifest-owner';
import {
  computeCandidateHash,
  validateApprovedUserDecisionForClose,
} from './governance-invariants-v11';
import { assertVerificationPath, readVerificationFile } from '../../verification/owner-store';

/** D32 requires the precise approved subject, not only a successful status word. */
export async function assertApprovedCandidateIdentity(
  projectRoot: string,
  workItemDir: string,
  workItemId: string
) {
  const manifestPath = path.join(workItemDir, 'candidate_manifest.json'),
    decisionPath = path.join(workItemDir, 'user_decision.json');
  const bytes = await readVerificationFile(manifestPath);
  if (candidateManifestContentBlockCode(bytes.toString('utf8'), workItemId))
    throw new Error('APPROVED_CANDIDATE_MANIFEST_INVALID');
  const manifest = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  const decision = JSON.parse(
    (await readVerificationFile(decisionPath)).toString('utf8')
  ) as Record<string, unknown>;
  const validation = await validateApprovedUserDecisionForClose({
    projectRoot,
    workItemDir,
    workItemId,
    candidateManifestPath: manifestPath,
    userDecisionPath: decisionPath,
  });
  if (
    !validation.valid ||
    !validateCurrentUserDecisionValue(decision, workItemId).valid ||
    decision.work_item_id !== workItemId ||
    decision.base_spec_version !== manifest.base_spec_version ||
    decision.manifest_hash !== 'sha256:' + createHash('sha256').update(bytes).digest('hex')
  )
    throw new Error('APPROVED_CANDIDATE_SUBJECT_CHANGED');
  const inputFiles = [manifestPath, decisionPath];
  let size = 0;
  async function walk(directory: string) {
    await assertVerificationPath(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      await assertVerificationPath(target);
      if (entry.isDirectory()) await walk(target);
      else {
        size += (await readVerificationFile(target)).length;
        if (size > 32 * 1024 * 1024 || inputFiles.length >= 2048)
          throw new Error('APPROVED_CANDIDATE_INPUT_BUDGET');
        inputFiles.push(target);
      }
    }
  }
  await walk(path.join(workItemDir, 'candidates'));
  if (decision.candidate_hash !== (await computeCandidateHash(workItemDir)))
    throw new Error('APPROVED_CANDIDATE_CONTENT_CHANGED');
  return { inputFiles };
}

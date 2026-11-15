import path from 'node:path';
import { CandidateManifestSchema } from '@specforge/types';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type { RequiredVerificationDeclaration } from '@specforge/types/required-verification-contract';
import {
  readVerificationFile,
  canonicalVerificationJson,
  verificationId,
} from '../../verification/owner-store';
import { PROFESSIONAL_ARTIFACT_OWNERS } from './professional-artifact-owners';

/** Scope identity deliberately excludes the candidate content being repaired. */
export async function readRequiredVerificationBinding(projectRoot: string, workItemId: string) {
  if (!path.isAbsolute(projectRoot) || !/^WI-\d{4,}$/.test(workItemId))
    throw new Error('REQUIRED_VERIFICATION_BINDING_IDENTITY');
  const workItemDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const read = (file: string) => readVerificationFile(file, 2 * 1024 * 1024);
  const manifestRaw = await read(path.join(workItemDir, 'candidate_manifest.json'));
  const manifest = CandidateManifestSchema.parse(JSON.parse(manifestRaw.toString('utf8')));
  const specRaw = await read(
    path.join(projectRoot, SPEC_DIR_NAME, 'project', 'spec_manifest.json')
  );
  const spec: unknown = JSON.parse(specRaw.toString('utf8'));
  const specVersion =
    spec && typeof spec === 'object' && !Array.isArray(spec)
      ? (spec as Record<string, unknown>).project_spec_version
      : undefined;
  const specSha256 = verificationId(specRaw);
  if (
    manifest.work_item_id !== workItemId ||
    typeof specVersion !== 'string' ||
    !/^PSV-\d{4,}$/.test(specVersion) ||
    manifest.base_spec_version !== specVersion ||
    manifest.project_spec_precondition_sha256 !== 'sha256:' + specSha256
  )
    throw new Error('REQUIRED_VERIFICATION_BASELINE_MISMATCH');
  const baseline: unknown = JSON.parse(
    (await read(path.join(workItemDir, 'implementation_baseline.json'))).toString('utf8')
  );
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline))
    throw new Error('REQUIRED_VERIFICATION_IMPLEMENTATION_BINDING');
  const implementation = baseline as Record<string, unknown>;
  if (
    implementation.work_item_id !== workItemId ||
    implementation.schema_version !== '1.0' ||
    typeof implementation.snapshot_id !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(implementation.snapshot_id)
  )
    throw new Error('REQUIRED_VERIFICATION_IMPLEMENTATION_BINDING');
  const inputs: Record<string, string> = {};
  for (const name of ['change_classification.md', 'impact_analysis.md', 'trigger_result.json'])
    inputs[name] = verificationId(await read(path.join(workItemDir, name)));
  const { manifest_hash: _manifestHash, entries, ...manifestScope } = manifest;
  const scopeEntries = entries
    .map(({ candidate_hash: _contentHash, ...entry }) => entry)
    .sort((a, b) => {
      const left = canonicalVerificationJson(a),
        right = canonicalVerificationJson(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const generation = verificationId(
    canonicalVerificationJson({
      contract: 'required-verification-generation/v1',
      work_item_id: workItemId,
      project_spec_manifest_sha256: specSha256,
      implementation_snapshot_id: implementation.snapshot_id,
      manifest_scope: { ...manifestScope, entries: scopeEntries },
      inputs,
    })
  );
  return { generation, specSha256, workItemDir, manifest };
}

export function assertRequiredVerificationScope(
  declaration: RequiredVerificationDeclaration,
  binding: Awaited<ReturnType<typeof readRequiredVerificationBinding>>
): void {
  if (
    declaration.work_item_id !== binding.manifest.work_item_id ||
    declaration.project_spec_manifest_sha256 !== binding.specSha256 ||
    declaration.candidate_generation !== binding.generation
  )
    throw new Error('REQUIRED_VERIFICATION_GENERATION_MISMATCH');
  for (const requirement of declaration.requirements) {
    const matches = binding.manifest.entries.filter(
      entry => entry.candidate_path.toLowerCase() === requirement.path.toLowerCase()
    );
    if (
      matches.length !== 1 ||
      matches[0].candidate_path !== requirement.path ||
      matches[0].operation === 'delete' ||
      matches[0].type === 'tasks' ||
      PROFESSIONAL_ARTIFACT_OWNERS.get('candidate_' + matches[0].type) !== requirement.owner
    )
      throw new Error('REQUIRED_VERIFICATION_SCOPE_OR_OWNER_MISMATCH');
  }
}

/**
 * semantic-closure-provenance.ts
 *
 * Binds a generated semantic closure manifest to the governed Work Item
 * artifacts that were used to verify it. Verification and close gates use this
 * record to reject a closure after any upstream verification artifact changes.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  SemanticClosureManifest,
  SemanticClosureProvenance,
} from './semantic-closure-core.js';

export const SEMANTIC_CLOSURE_CONTRACT_ID = 'semantic-closure/v1';

export const SEMANTIC_CLOSURE_ACCEPTED_SOURCES = [
  'typed semantic_closure argument (preferred)',
  'verification_report.md fenced JSON containing semantic_closure',
  'evidence/evidence_manifest.json semantic sections',
  'trace_delta.md explicit OUT -> REQ -> DD -> TASK -> EV chains',
] as const;

// work_item.json is deliberately excluded: state transitions and permission
// revocation mutate lifecycle metadata after verification without changing the
// semantic claim. Binding it would make the normal gate/close path self-invalidating.
export const SEMANTIC_CLOSURE_PROVENANCE_INPUTS = [
  'trace_delta.md',
  'verification_report.md',
  'evidence/evidence_manifest.json',
  'merge_report.md',
  'changed_files_audit.md',
] as const;

export interface SemanticClosureProvenanceValidation {
  passed: boolean;
  errors: string[];
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

function semanticPayload(manifest: SemanticClosureManifest): SemanticClosureManifest {
  const payload = { ...manifest };
  delete payload.provenance;
  return payload;
}

export function semanticClosurePayloadSha256(manifest: SemanticClosureManifest): string {
  return sha256(JSON.stringify(semanticPayload(manifest)));
}

async function currentInputFingerprints(
  workItemDir: string
): Promise<Array<{ path: string; sha256: string }>> {
  const inputs: Array<{ path: string; sha256: string }> = [];
  for (const relativePath of SEMANTIC_CLOSURE_PROVENANCE_INPUTS) {
    try {
      const content = await fs.readFile(path.join(workItemDir, relativePath), 'utf-8');
      inputs.push({ path: relativePath, sha256: sha256(content) });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return inputs;
}

export async function captureSemanticClosureProvenance(input: {
  workItemDir: string;
  source: string;
  manifest: SemanticClosureManifest;
}): Promise<SemanticClosureProvenance> {
  return {
    contract_id: SEMANTIC_CLOSURE_CONTRACT_ID,
    generated_at: new Date().toISOString(),
    source: input.source,
    semantic_payload_sha256: semanticClosurePayloadSha256(input.manifest),
    inputs: await currentInputFingerprints(input.workItemDir),
  };
}

export async function validateSemanticClosureProvenance(
  workItemDir: string,
  manifest: SemanticClosureManifest | null
): Promise<SemanticClosureProvenanceValidation> {
  const errors: string[] = [];
  const provenance = manifest?.provenance;
  if (!provenance) {
    return {
      passed: false,
      errors: [
        'SEMANTIC_CLOSURE_PROVENANCE_MISSING: regenerate with sf_semantic_closure_run(force=true).',
      ],
    };
  }

  if (provenance.contract_id !== SEMANTIC_CLOSURE_CONTRACT_ID) {
    errors.push(
      `SEMANTIC_CLOSURE_CONTRACT_MISMATCH: expected ${SEMANTIC_CLOSURE_CONTRACT_ID}, got ${String(provenance.contract_id ?? 'missing')}.`
    );
  }

  const expectedPayloadHash = semanticClosurePayloadSha256(manifest as SemanticClosureManifest);
  if (provenance.semantic_payload_sha256 !== expectedPayloadHash) {
    errors.push(
      'SEMANTIC_CLOSURE_PAYLOAD_STALE: semantic closure payload changed after generation.'
    );
  }

  const declaredInputs = new Map(
    (Array.isArray(provenance.inputs) ? provenance.inputs : []).map(item => [
      String(item.path ?? ''),
      String(item.sha256 ?? ''),
    ])
  );
  const currentInputs = new Map(
    (await currentInputFingerprints(workItemDir)).map(item => [item.path, item.sha256])
  );

  for (const relativePath of new Set([...declaredInputs.keys(), ...currentInputs.keys()])) {
    const declaredHash = declaredInputs.get(relativePath);
    const currentHash = currentInputs.get(relativePath);
    if (!declaredHash) {
      errors.push(
        `SEMANTIC_CLOSURE_INPUT_STALE: ${relativePath} now exists but was not part of the closure provenance.`
      );
    } else if (!currentHash) {
      errors.push(
        `SEMANTIC_CLOSURE_INPUT_STALE: ${relativePath} was removed after closure generation.`
      );
    } else if (declaredHash !== currentHash) {
      errors.push(
        `SEMANTIC_CLOSURE_INPUT_STALE: ${relativePath} changed after closure generation.`
      );
    }
  }

  return { passed: errors.length === 0, errors };
}

/**
 * evidence-manifest — §13.4 Evidence Manifest types and validation
 *
 * Extracted from verification-evidence-v11.ts (TASK-6).
 */

import { TraceValidationResult } from './evidence.js';
import {
  precheckSchemaDescriptors,
  type PersistentFileSchemaDescriptor,
  type SchemaDescriptorPrecheckResult,
} from '@specforge/types/schema-contract';

export interface EvidenceManifest {
  schema_version: '1.0';
  work_item_id: string;
  entries: Array<{
    evidence_id: string;
    type: string;
    path: string;
    description?: string;
    hash?: string;
    created_at?: string;
  }>;
}

function validateEvidenceManifestValue(
  manifest: unknown,
  expectedWorkItemId?: string,
): TraceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['evidence_manifest must be an object'], warnings };
  }
  const obj = manifest as Record<string, unknown>;
  if (obj.schema_version !== '1.0') {
    errors.push('evidence_manifest.schema_version must be "1.0"');
  }
  if (typeof obj.work_item_id !== 'string' || !obj.work_item_id.trim()) {
    errors.push('evidence_manifest.work_item_id is required');
  } else if (expectedWorkItemId && obj.work_item_id !== expectedWorkItemId) {
    errors.push(`evidence_manifest.work_item_id must be "${expectedWorkItemId}"`);
  }
  if (!Array.isArray(obj.entries)) {
    errors.push('evidence_manifest.entries must be an array');
  } else {
    obj.entries.forEach((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`entries[${index}] must be an object`);
        return;
      }
      const entry = value as Record<string, unknown>;
      for (const field of ['evidence_id', 'path']) {
        if (typeof entry[field] !== 'string' || !String(entry[field]).trim()) {
          errors.push(`entries[${index}].${field} is required`);
        }
      }
      if (typeof entry.type !== 'string' || !entry.type.trim()) {
        errors.push(`entries[${index}].type is required`);
      }
      if (typeof entry.hash !== 'string' || !entry.hash.trim()) {
        warnings.push(`entries[${index}].hash is recommended`);
      }
    });
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 校验 evidence_manifest.json 结构。
 */
export function validateEvidenceManifest(
  manifest: unknown,
  expectedWorkItemId?: string,
): TraceValidationResult {
  return validateEvidenceManifestValue(manifest, expectedWorkItemId);
}

export function validateCurrentEvidenceManifestJson(
  content: string,
  expectedWorkItemId: string,
): TraceValidationResult {
  try {
    return validateEvidenceManifestValue(JSON.parse(content), expectedWorkItemId);
  } catch {
    return { valid: false, errors: ['evidence_manifest must be valid JSON'], warnings: [] };
  }
}

export function createEvidenceManifestSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `evidence-manifest-${workItemId}`,
    owner: '@specforge/daemon-core/evidence-manifest',
    relativePath: 'evidence/evidence_manifest.json',
    format: 'json',
    required: false,
    currentSchemaId: '1.0',
    validateCurrent: (value: unknown): boolean =>
      validateEvidenceManifestValue(value, workItemId).valid,
  };
}

export async function precheckEvidenceManifestSchema(
  workItemDir: string,
  workItemId: string,
): Promise<SchemaDescriptorPrecheckResult> {
  return precheckSchemaDescriptors(workItemDir, [
    createEvidenceManifestSchemaDescriptor(workItemId),
  ]);
}

export function evidenceManifestSchemaBlockCode(
  result: SchemaDescriptorPrecheckResult,
): string | undefined {
  if (result.ok) return undefined;
  return result.checks[0]?.errorCode ?? 'SCHEMA_VERSION_MISMATCH';
}

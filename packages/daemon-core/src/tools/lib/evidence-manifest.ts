/**
 * evidence-manifest — §13.4 Evidence Manifest types and validation
 *
 * Extracted from verification-evidence-v11.ts (TASK-6).
 */

import { TraceValidationResult } from './evidence.js';

export interface EvidenceManifest {
  schema_version: '1.0';
  work_item_id: string;
  entries: Array<{
    evidence_id: string;
    type: 'test_output' | 'command_output' | 'file_snapshot' | 'log' | 'screenshot' | 'other';
    path: string;
    description: string;
    hash: string;
    created_at: string;
  }>;
}

/**
 * 校验 evidence_manifest.json 结构。
 */
export function validateEvidenceManifest(manifest: unknown): TraceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['evidence_manifest must be an object'], warnings };
  }

  const obj = manifest as Record<string, unknown>;

  if (obj.schema_version !== '1.0') {
    errors.push('evidence_manifest.schema_version must be "1.0"');
  }

  if (!obj.work_item_id) {
    errors.push('evidence_manifest.work_item_id is required');
  }

  if (!Array.isArray(obj.entries)) {
    errors.push('evidence_manifest.entries must be an array');
  } else {
    for (let i = 0; i < obj.entries.length; i++) {
      const entry = obj.entries[i] as Record<string, unknown>;
      if (!entry.evidence_id) errors.push(`entries[${i}].evidence_id is required`);
      if (!entry.type) errors.push(`entries[${i}].type is required`);
      if (!entry.path) errors.push(`entries[${i}].path is required`);
      if (!entry.hash) warnings.push(`entries[${i}].hash is recommended`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

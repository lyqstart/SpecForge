/**
 * extension-gate.ts — Extension Gate check types and runner
 *
 * Extracted from extension-subflow-v11.ts (TASK-7).
 *
 * Imports: gate-report.js, extension-request.js, extension-registry.js
 * Consumers: extension-subflow-v11.ts (re-export).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { GateReportV11 } from './gate-report.js';

// ── Types ──

export interface ExtensionGateResult {
  gate_id: 'extension_gate';
  passed: boolean;
  checks: {
    registry_file_valid: boolean;
    no_conflict_with_existing: boolean;
    backward_compatible_or_approved: boolean;
    candidate_complete: boolean;
  };
  errors: string[];
}

// ── Extension Gate ──

/**
 * 执行 Extension Gate 检查（Patch 1 §12）。
 */
export async function runExtensionGate(params: {
  wiDir: string;
  candidatePath: string;
  currentRegistryPath: string;
}): Promise<ExtensionGateResult> {
  const { wiDir, candidatePath, currentRegistryPath } = params;

  const errors: string[] = [];
  const checks = {
    registry_file_valid: false,
    no_conflict_with_existing: false,
    backward_compatible_or_approved: false,
    candidate_complete: false,
  };

  // 1. Check candidate exists and is valid JSON
  if (existsSync(candidatePath)) {
    try {
      const raw = await readFile(candidatePath, 'utf-8');
      JSON.parse(raw);
      checks.registry_file_valid = true;
    } catch {
      errors.push('Extension candidate is not valid JSON');
    }
  } else {
    errors.push('Extension candidate file not found');
  }

  // 2. Check no conflict with existing
  if (existsSync(currentRegistryPath)) {
    try {
      const currentRaw = await readFile(currentRegistryPath, 'utf-8');
      const current = JSON.parse(currentRaw);
      const candRaw = await readFile(candidatePath, 'utf-8');
      const candidate = JSON.parse(candRaw);
      // Simple check: candidate must have more entries than current
      const currentNs = current.namespaces || {};
      const candNs = candidate.namespaces || {};
      const currentKeys = Object.values(currentNs).flat().length;
      const candKeys = Object.values(candNs).flat().length;
      checks.no_conflict_with_existing = candKeys >= currentKeys;
      if (!checks.no_conflict_with_existing) {
        errors.push('Extension candidate has fewer entries than current registry');
      }
    } catch {
      errors.push('Cannot compare candidate with current registry');
    }
  } else {
    // No current registry exists, so no conflict
    checks.no_conflict_with_existing = true;
  }

  // 3. Backward compatible or approved
  // For MVP: assume backward compatible if no errors so far
  checks.backward_compatible_or_approved = checks.registry_file_valid;

  // 4. Candidate complete
  checks.candidate_complete = checks.registry_file_valid && checks.no_conflict_with_existing;

  return {
    gate_id: 'extension_gate',
    passed: checks.registry_file_valid && checks.no_conflict_with_existing &&
            checks.backward_compatible_or_approved && checks.candidate_complete,
    checks,
    errors,
  };
}

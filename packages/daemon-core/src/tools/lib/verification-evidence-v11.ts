/**
 * verification-evidence-v11 — §13 Trace、Verification 与 Evidence
 *
 * §13.1 Trace 必须贯穿：REQ → AC → DD → TASK → FILE → TEST → EVIDENCE
 * §13.2 trace_delta.md：说明 WI 对 Trace 的影响
 * §13.3 verification_report.md：证明验证结论，不得只写"已验证"
 * §13.4 evidence_manifest.json：Evidence 清单
 *
 * 本模块提供：
 *   - trace_delta.md 校验
 *   - verification_report.md 校验（via verification-report.ts）
 *   - evidence_manifest.json 校验（via evidence-manifest.ts）
 *   - trace 完整性检查
 *
 * Re-exports from extracted sub-modules (TASK-6):
 *   - evidence.ts: core trace types (TraceEntry, TraceDelta, TraceValidationResult)
 *   - verification-report.ts: VerificationReport + validateVerificationReport
 *   - evidence-manifest.ts: EvidenceManifest + validateEvidenceManifest
 *
 * Re-exports from extracted sub-modules (TASK-3):
 *   - close-gate.ts: CloseGateResult, runCloseGate
 */

export * from './verification-report.js'
export * from './evidence-manifest.js'
export * from './evidence.js'
export { CloseGateResult, runCloseGate } from './close-gate.js'

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceEntry, TraceDelta, TraceValidationResult } from './evidence.js';
import type { EvidenceManifest } from './evidence-manifest.js';

// Re-export types locally so existing consumers see no breakage
// (already covered by `export *` above, but kept for documentation clarity)

// ── Trace Delta Validation ──

/**
 * 校验 trace_delta.md 内容。
 * §13.1: Trace 不变也必须写 "Trace Impact: none"。
 */
export function validateTraceDelta(content: string): TraceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['trace_delta.md must not be empty (§13.1)'], warnings };
  }

  const lower = content.toLowerCase();

  // Must have Trace Impact section
  if (!lower.includes('trace impact') && !lower.includes('impact')) {
    errors.push('trace_delta.md must include Trace Impact section (§13.1)');
  }

  // "none" is a valid impact type
  if (lower.includes('trace impact: none') || lower.includes('impact: none')) {
    // Valid: explicitly stated no impact
    if (!lower.includes('reason')) {
      warnings.push('Trace Impact is none but no Reason provided (§13.2: must state reason)');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Full Trace Chain Check ──

export interface TraceChainResult {
  complete: boolean;
  coverage: Record<string, 'covered' | 'partial' | 'missing'>;
  gaps: string[];
}

/**
 * 检查 Trace 链路完整性（§13.1: REQ→AC→DD→TASK→FILE→TEST→EVIDENCE）。
 */
export function checkTraceChain(entries: TraceEntry[]): TraceChainResult {
  const gaps: string[] = [];
  const coverage: Record<string, 'covered' | 'partial' | 'missing'> = {
    req_to_ac: 'covered',
    ac_to_dd: 'covered',
    dd_to_task: 'covered',
    task_to_file: 'covered',
    file_to_test: 'covered',
    test_to_evidence: 'covered',
  };

  for (const entry of entries) {
    if (entry.ac_ids.length === 0) {
      coverage.req_to_ac = 'partial';
      gaps.push(`${entry.req_id}: no AC linked`);
    }
    if (entry.dd_ids.length === 0) {
      coverage.ac_to_dd = 'partial';
      gaps.push(`${entry.req_id}: no DD linked`);
    }
    if (entry.task_ids.length === 0) {
      coverage.dd_to_task = 'partial';
      gaps.push(`${entry.req_id}: no TASK linked`);
    }
    if (entry.file_paths.length === 0) {
      coverage.task_to_file = 'partial';
      gaps.push(`${entry.req_id}: no file linked`);
    }
    if (entry.test_ids.length === 0) {
      coverage.file_to_test = 'partial';
      gaps.push(`${entry.req_id}: no test linked`);
    }
    if (entry.evidence_ids.length === 0) {
      coverage.test_to_evidence = 'partial';
      gaps.push(`${entry.req_id}: no evidence linked`);
    }
  }

  const complete = gaps.length === 0;

  return { complete, coverage, gaps };
}

// ── File Writers ──

/**
 * 生成 trace_delta.md 模板。
 */
export async function writeTraceDeltaTemplate(
  wiDir: string,
  workItemId: string,
  impact: TraceDelta['impact'],
  reason: string,
): Promise<string> {
  const lines: string[] = [
    '# Trace Delta',
    '',
    `**Work Item**: ${workItemId}`,
    '',
    '## Trace Impact',
    '',
    impact === 'none' ? 'none' : impact,
    '',
    '## Reason',
    '',
    reason,
    '',
    '## Trace Entries',
    '',
    '| REQ | AC | DD | TASK | FILE | TEST | EVIDENCE |',
    '|-----|----|----|------|------|------|----------|',
    '| (to be filled) | | | | | | |',
    '',
    `## Module Trace Update Required: ${impact !== 'none' ? 'Yes' : 'No'}`,
    `## Project Trace Matrix Update Required: ${impact !== 'none' ? 'Yes' : 'No'}`,
    '',
  ];

  await mkdir(wiDir, { recursive: true });
  const filePath = join(wiDir, 'trace_delta.md');
  await writeFile(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

/**
 * 生成 evidence_manifest.json 模板。
 */
export async function writeEvidenceManifestTemplate(
  wiDir: string,
  workItemId: string,
): Promise<string> {
  const manifest: EvidenceManifest = {
    schema_version: '1.0',
    work_item_id: workItemId,
    entries: [],
  };

  await mkdir(wiDir, { recursive: true });
  const evidenceDir = join(wiDir, 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  const filePath = join(evidenceDir, 'evidence_manifest.json');
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  return filePath;
}

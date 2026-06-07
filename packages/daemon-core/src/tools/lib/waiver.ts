/**
 * waiver.ts — §10.6 Waiver 记录与验证
 *
 * Waiver 是 User Decision 中对特定 Gate 的豁免声明。
 * - soft_gate waiver: 需要全部 4 个字段（reason, risk, expires_at, follow_up_wi）
 * - hard_gate waiver: 不允许
 */

import type { UserDecisionStatus } from './user-decision.js';

// ---------------------------------------------------------------------------
// §10.6 WaiverRecord
// ---------------------------------------------------------------------------

export interface WaiverRecord {
  waiver_id: string;
  gate_id: string;
  gate_type: 'soft_gate' | 'hard_gate';
  reason: string;
  risk: string;
  expires_at?: string;
  follow_up_wi?: string;
}

// ---------------------------------------------------------------------------
// §10.6 validateWaiver
// ---------------------------------------------------------------------------

export interface WaiverValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证 Waiver 是否符合 §10.6 规则。
 *
 * - hard_gate 的 waiver 不被允许。
 * - soft_gate 的 waiver 必须填写全部 4 个字段：
 *     reason, risk, expires_at, follow_up_wi
 */
export function validateWaiver(waiver: WaiverRecord): WaiverValidationResult {
  const errors: string[] = [];

  // hard_gate waiver 不允许
  if (waiver.gate_type === 'hard_gate') {
    errors.push('hard_gate waiver is not allowed (§10.6)');
  }

  // soft_gate waiver 必须提供全部 4 个字段
  if (waiver.gate_type === 'soft_gate') {
    if (!waiver.reason) {
      errors.push('soft_gate waiver requires "reason" (§10.6)');
    }
    if (!waiver.risk) {
      errors.push('soft_gate waiver requires "risk" (§10.6)');
    }
    if (!waiver.expires_at) {
      errors.push('soft_gate waiver requires "expires_at" (§10.6)');
    }
    if (!waiver.follow_up_wi) {
      errors.push('soft_gate waiver requires "follow_up_wi" (§10.6)');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Re-export for convenience (one-way dependency on user-decision)
// ---------------------------------------------------------------------------

export type { UserDecisionStatus } from './user-decision.js';

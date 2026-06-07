/**
 * user-decision.ts — §10.2–10.5 User Decision 类型定义
 *
 * 从 user-decision-recorder-v11.ts 提取的类型：
 *   - UserDecisionStatus（§10.3 状态枚举）
 *   - UserDecisionV11（§10.2 结构）
 */

// ---------------------------------------------------------------------------
// §10.3 状态枚举
// ---------------------------------------------------------------------------

export type UserDecisionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'request_changes'
  | 'waived'
  | 'expired'
  | 'invalidated';

// ---------------------------------------------------------------------------
// §10.2 User Decision 结构
// ---------------------------------------------------------------------------

export interface UserDecisionV11 {
  schema_version: '1.0';
  decision_id: string;
  work_item_id: string;
  workflow_path: string;
  base_spec_version: string;
  candidate_manifest_path: string;
  manifest_hash: string;
  candidate_hash: string;
  gate_summary_path: string;
  gate_summary_hash: string;
  decision_status: UserDecisionStatus;
  decision_type: 'auto_approved' | 'user_approved' | 'waived' | 'rejected';
  decided_by: string;
  decided_at: string;
  expires_at?: string;
  decision_scope: string;
  waivers: Array<{
    waiver_id: string;
    gate_id: string;
    reason: string;
    risk: string;
    expires_at?: string;
    follow_up_wi?: string;
  }>;
}

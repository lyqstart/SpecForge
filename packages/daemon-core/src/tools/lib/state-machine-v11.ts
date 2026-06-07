/**
 * state-machine-v11.ts — v1.1 标准 WI 状态机引擎（§5）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 职责：
 * - §5.1 主状态枚举（24 个状态）
 * - §5.2 禁止跳转规则
 * - §5.3 状态推进主体校验
 * - §5.4 恢复检查
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// §5.1 主状态枚举
// ---------------------------------------------------------------------------

export const WI_STATUSES_V11 = [
  'created',
  'intake_ready',
  'impact_analyzing',
  'impact_analyzed',
  'workflow_selected',
  'candidate_preparing',
  'candidate_prepared',
  'gates_running',
  'gates_failed',
  'approval_required',
  'approved',
  'merge_ready',
  'merging',
  'merged',
  'post_merge_verified',
  'implementation_ready',
  'implementation_running',
  'implementation_done',
  'verification_running',
  'verification_done',
  'closed',
  'blocked',
  'rejected',
  'superseded',
] as const;

export type WIStatusV11 = (typeof WI_STATUSES_V11)[number];

// ---------------------------------------------------------------------------
// §5.2 禁止跳转
// ---------------------------------------------------------------------------

const FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['created', 'implementation_running'],
  ['intake_ready', 'implementation_running'],
  ['impact_analyzing', 'implementation_running'],
  ['impact_analyzed', 'implementation_running'],
  ['workflow_selected', 'implementation_running'],
  ['candidate_prepared', 'merging'],
  ['approval_required', 'merging'],
  ['approval_required', 'closed'],
  ['merged', 'closed'],
  ['blocked', 'closed'],
  ['rejected', 'closed'],
];

/**
 * 校验状态跳转是否被禁止（§5.2）。
 * 注意：closed → any 也是禁止的。
 */
export function isForbiddenTransition(from: string, to: string): boolean {
  if (from === 'closed') return true;
  return FORBIDDEN.some(([f, t]) => f === from && t === to);
}

// ---------------------------------------------------------------------------
// §5.3 状态推进主体
// ---------------------------------------------------------------------------

export const STATE_ADVANCEMENT_SUBJECTS = new Set([
  'sf-orchestrator',
  'Runtime State Machine',
  'Gate Runner',
  'User Decision Recorder',
  'Merge Runner',
  'code_permission_service',
  'close_gate',
]);

/**
 * 校验主体是否有权推进 WI 状态（§5.3）。
 */
export function isAuthorizedAdvancementSubject(subject: string): boolean {
  return STATE_ADVANCEMENT_SUBJECTS.has(subject);
}

// ---------------------------------------------------------------------------
// v1.1 合法跳转表
// ---------------------------------------------------------------------------

/**
 * v1.1 标准 WI 主链路合法跳转表。
 */
export const V11_TRANSITIONS = new Map<string, readonly string[]>([
  ['created', ['intake_ready']],
  ['intake_ready', ['impact_analyzing']],
  ['impact_analyzing', ['impact_analyzed']],
  ['impact_analyzed', ['workflow_selected']],
  ['workflow_selected', ['candidate_preparing', 'implementation_ready']],
  ['candidate_preparing', ['candidate_prepared']],
  ['candidate_prepared', ['gates_running']],
  ['gates_running', ['gates_failed', 'approval_required']],
  ['gates_failed', ['candidate_preparing', 'gates_running']],
  ['approval_required', ['approved', 'rejected']],
  ['approved', ['merge_ready']],
  ['merge_ready', ['merging']],
  ['merging', ['merged', 'gates_failed']],
  ['merged', ['post_merge_verified']],
  ['post_merge_verified', ['implementation_ready']],
  ['implementation_ready', ['implementation_running']],
  ['implementation_running', ['implementation_done']],
  ['implementation_done', ['verification_running']],
  ['verification_running', ['verification_done', 'implementation_running']],
  ['verification_done', ['closed']],
  // blocked 可以回退到多个前序状态
  ['blocked', ['candidate_preparing', 'gates_running', 'implementation_ready', 'workflow_selected']],
  // rejected 终态
  ['rejected', []],
  // superseded 终态
  ['superseded', []],
  // closed 终态
  ['closed', []],
]);

/**
 * 校验 v1.1 状态跳转是否合法。
 */
export function isValidV11Transition(from: string, to: string): boolean {
  // 先检查禁止列表
  if (isForbiddenTransition(from, to)) return false;
  // 再检查合法列表
  const targets = V11_TRANSITIONS.get(from);
  if (!targets) return false;
  return targets.includes(to);
}

// ---------------------------------------------------------------------------
// §5.4 恢复机制
// ---------------------------------------------------------------------------

export interface ResumeCheckResult {
  currentStatus: string;
  requiredFilesExist: boolean;
  missingFiles: string[];
  artifactsValid: boolean;
  codePermissionValid: boolean;
  noOutOfBoundsWrites: boolean;
  needsRollback: boolean;
  rollbackTarget?: string;
  canResume: boolean;
}

/**
 * v1.1 WI 必需文件列表（§4.3）。
 */
export const V11_REQUIRED_FILES = [
  'work_item.json',
  'intake.md',
  'change_classification.md',
  'impact_analysis.md',
  'trigger_result.json',
  'tasks.md',
  'trace_delta.md',
  'candidate_manifest.json',
  'gate_summary.md',
  'verification_report.md',
  'merge_report.md',
  'evidence/evidence_manifest.json',
];

/**
 * 执行恢复检查（§5.4）。
 */
export async function performResumeCheck(
  workItemDir: string,
): Promise<ResumeCheckResult> {
  const missingFiles: string[] = [];

  for (const file of V11_REQUIRED_FILES) {
    const fullPath = path.join(workItemDir, file);
    try {
      await fs.access(fullPath);
    } catch {
      missingFiles.push(file);
    }
  }

  const requiredFilesExist = missingFiles.length === 0;

  // 读取 work_item.json 获取当前状态
  let currentStatus = 'unknown';
  try {
    const content = await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf-8');
    const json = JSON.parse(content);
    currentStatus = json.status ?? 'unknown';
  } catch {
    // 无法读取状态
  }

  // 简化的恢复判断逻辑
  const needsRollback = !requiredFilesExist && currentStatus !== 'created' && currentStatus !== 'intake_ready';
  let rollbackTarget: string | undefined;
  if (needsRollback) {
    // 根据缺失文件决定回退目标
    if (missingFiles.includes('candidate_manifest.json')) {
      rollbackTarget = 'candidate_preparing';
    } else if (missingFiles.includes('gate_summary.md')) {
      rollbackTarget = 'gates_running';
    } else if (missingFiles.includes('verification_report.md')) {
      rollbackTarget = 'implementation_ready';
    } else {
      rollbackTarget = 'workflow_selected';
    }
  }

  const canResume = !needsRollback && currentStatus !== 'closed' && currentStatus !== 'rejected' && currentStatus !== 'superseded';

  return {
    currentStatus,
    requiredFilesExist,
    missingFiles,
    artifactsValid: requiredFilesExist,
    codePermissionValid: true, // 需要外部检查
    noOutOfBoundsWrites: true, // 需要 Write Guard 检查
    needsRollback,
    rollbackTarget,
    canResume,
  };
}

// ---------------------------------------------------------------------------
// §5.3 Evidence Prerequisites for Key States
// ---------------------------------------------------------------------------

/**
 * Key states that require specific evidence files before transition.
 */
export const STATE_EVIDENCE_REQUIREMENTS: Record<string, { requiredFile: string; description: string }> = {
  'approval_required': { requiredFile: 'gate_summary.md', description: 'Gate Summary must exist before approval' },
  'merge_ready': { requiredFile: 'user_decision.json', description: 'User Decision must exist before merge' },
  'merging': { requiredFile: 'gate_summary.md', description: 'merge_ready_gate must have passed' },
  'closed': { requiredFile: 'verification_report.md', description: 'close_gate verification report must exist' },
};

/**
 * Check if a state transition's target has evidence prerequisites, and verify them.
 * Returns { met: true } if no prerequisites or all files exist.
 * Returns { met: false, missing } if prerequisites are not satisfied.
 */
export async function checkStateEvidenceRequirement(
  targetStatus: string,
  workItemDir: string,
): Promise<{ met: boolean; missing?: string; description?: string }> {
  const req = STATE_EVIDENCE_REQUIREMENTS[targetStatus];
  if (!req) {
    return { met: true };
  }

  const fullPath = path.join(workItemDir, req.requiredFile);
  try {
    await fs.access(fullPath);
    return { met: true };
  } catch {
    return { met: false, missing: req.requiredFile, description: req.description };
  }
}

/**
 * user-decision-recorder-v11.ts — v1.1 标准 User Decision Recorder（§10）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * User Decision 是 Gate Summary 之后、Merge Runner 之前的结构化审批事实。
 * 只有 User Decision Recorder 可以写入 user_decision.json。
 * 普通 Agent 禁止创建、修改、删除 user_decision.json。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

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

// ---------------------------------------------------------------------------
// User Decision Recorder
// ---------------------------------------------------------------------------

export interface RecordDecisionInput {
  workItemDir: string;
  workItemId: string;
  workflowPath: string;
  baseSpecVersion: string;
  candidateManifestPath: string;
  gateSummaryPath: string;
  decisionStatus: UserDecisionStatus;
  decisionType: 'auto_approved' | 'user_approved' | 'waived' | 'rejected';
  decidedBy: string;
  decisionScope: string;
  waivers?: Array<{
    waiver_id: string;
    gate_id: string;
    reason: string;
    risk: string;
    expires_at?: string;
    follow_up_wi?: string;
  }>;
}

/**
 * 记录 User Decision（§10）。
 * 只有此函数可以生成 user_decision.json。
 */
export async function recordUserDecision(input: RecordDecisionInput): Promise<UserDecisionV11> {
  // 计算 hash
  const manifestHash = await computeFileHash(path.join(input.workItemDir, input.candidateManifestPath));
  const gateSummaryHash = await computeFileHash(path.join(input.workItemDir, input.gateSummaryPath));

  // 计算 candidate hash（所有 candidate 文件的聚合 hash）
  const candidateHash = await computeCandidateHash(input.workItemDir);

  const decision: UserDecisionV11 = {
    schema_version: '1.0',
    decision_id: `UD-${input.workItemId}-${Date.now()}`,
    work_item_id: input.workItemId,
    workflow_path: input.workflowPath,
    base_spec_version: input.baseSpecVersion,
    candidate_manifest_path: input.candidateManifestPath,
    manifest_hash: manifestHash,
    candidate_hash: candidateHash,
    gate_summary_path: input.gateSummaryPath,
    gate_summary_hash: gateSummaryHash,
    decision_status: input.decisionStatus,
    decision_type: input.decisionType,
    decided_by: input.decidedBy,
    decided_at: new Date().toISOString(),
    decision_scope: input.decisionScope,
    waivers: input.waivers ?? [],
  };

  // 写入 user_decision.json
  const decisionPath = path.join(input.workItemDir, 'user_decision.json');
  await fs.writeFile(decisionPath, JSON.stringify(decision, null, 2) + '\n', 'utf-8');

  return decision;
}

/**
 * 使 User Decision 失效（§10.4）。
 * 当 Candidate 或 base_spec_version 变化时调用。
 */
export async function invalidateUserDecision(
  workItemDir: string,
  reason: string,
): Promise<void> {
  const decisionPath = path.join(workItemDir, 'user_decision.json');
  try {
    const content = await fs.readFile(decisionPath, 'utf-8');
    const decision = JSON.parse(content) as UserDecisionV11;
    decision.decision_status = 'invalidated';
    await fs.writeFile(decisionPath, JSON.stringify(decision, null, 2) + '\n', 'utf-8');
  } catch {
    // 文件不存在，无法失效
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

async function computeCandidateHash(workItemDir: string): Promise<string> {
  const candidatesDir = path.join(workItemDir, 'candidates');
  const hash = crypto.createHash('sha256');

  try {
    const files = await walkDir(candidatesDir);
    for (const file of files.sort()) {
      try {
        const content = await fs.readFile(file);
        hash.update(content);
      } catch {
        // skip
      }
    }
  } catch {
    // candidates/ 不存在
  }

  return 'sha256:' + hash.digest('hex');
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

// ---------------------------------------------------------------------------
// Re-export from extracted modules
// ---------------------------------------------------------------------------

export * from './user-decision.js';
export * from './waiver.js';

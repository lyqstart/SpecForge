/**
 * work-item-lifecycle-v11.ts — v1.1 标准 Work Item 生命周期管理
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 负责：
 * - §4.2 WI 目录创建
 * - §4.4 work_item.json 初始化
 * - §4.5 intake.md 生成
 * - 完整闭环文件初始化
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Work Item 创建
// ---------------------------------------------------------------------------

export interface CreateWorkItemInput {
  projectRoot: string;
  workItemId: string;
  userRequest: string;
  createdBy?: string;
}

/**
 * 创建一个新的 Work Item 目录和初始文件（§4.2, §4.4, §4.5）。
 */
export async function createWorkItem(input: CreateWorkItemInput): Promise<string> {
  const wiDir = path.join(input.projectRoot, '.specforge', 'work-items', input.workItemId);

  // 创建目录结构
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });

  const now = new Date().toISOString();

  // §4.4 work_item.json
  const workItemJson = {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    status: 'created',
    workflow_path: null,
    code_change_allowed: false,
    allowed_write_files: [],
    created_at: now,
    updated_at: now,
    created_by: input.createdBy ?? 'sf-orchestrator',
  };
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(workItemJson, null, 2) + '\n',
    'utf-8',
  );

  // §4.5 intake.md（必须原样保存用户原始请求）
  const intakeContent = [
    '# Intake',
    '',
    `Work Item: ${input.workItemId}`,
    `Created: ${now}`,
    '',
    '## Original User Request',
    '',
    input.userRequest,
    '',
    '## Normalized Summary',
    '',
    '> TODO: 由 Agent 填充',
    '',
  ].join('\n');
  await fs.writeFile(path.join(wiDir, 'intake.md'), intakeContent, 'utf-8');

  return wiDir;
}

/**
 * 初始化 WI 的闭环文件骨架（§4.3）。
 * 这些文件在实际流程中逐步填充，但可以先创建占位。
 */
export async function initializeClosureFiles(
  workItemDir: string,
  workItemId: string,
  workflowPath: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const isCodeOnly = workflowPath === 'code_only_fast_path';
  const isTaskChange = workflowPath === 'task_change_path';

  // change_classification.md
  await ensureFile(path.join(workItemDir, 'change_classification.md'), [
    '# Change Classification', '',
    `Work Item: ${workItemId}`, '',
    '> TODO: 由 Agent 填充', '',
  ].join('\n'));

  // impact_analysis.md
  await ensureFile(path.join(workItemDir, 'impact_analysis.md'), [
    '# Impact Analysis', '',
    `Work Item: ${workItemId}`, '',
    '## Existing Spec Match', '',
    '> TODO: 由 Agent 填充', '',
  ].join('\n'));

  // trigger_result.json
  await ensureFile(path.join(workItemDir, 'trigger_result.json'), JSON.stringify({
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: workflowPath,
    classification: {},
    match_results: [],
    selected_at: now,
  }, null, 2) + '\n');

  // tasks.md
  await ensureFile(path.join(workItemDir, 'tasks.md'), [
    '# Tasks', '',
    `Work Item: ${workItemId}`, '',
    '> TODO: 由 Agent 填充', '',
  ].join('\n'));

  // trace_delta.md
  await ensureFile(path.join(workItemDir, 'trace_delta.md'), [
    '# Trace Delta', '',
    `Work Item: ${workItemId}`, '',
    'Trace Impact: none', '',
    'Reason: Not yet analyzed', '',
  ].join('\n'));

  // candidate_manifest.json
  await ensureFile(path.join(workItemDir, 'candidate_manifest.json'), JSON.stringify({
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: workflowPath ?? 'unknown',
    base_spec_version: 'PSV-0001',
    merge_required: !isCodeOnly,
    entries: [],
  }, null, 2) + '\n');

  // gate_summary.md
  await ensureFile(path.join(workItemDir, 'gate_summary.md'), [
    '# Gate Summary', '',
    `Work Item: ${workItemId}`,
    'Overall Status: pending', '',
    '> TODO: 由 Gate Runner 生成', '',
  ].join('\n'));

  // verification_report.md
  await ensureFile(path.join(workItemDir, 'verification_report.md'), [
    '# Verification Report', '',
    `Work Item: ${workItemId}`, '',
    '> TODO: 由 Verifier 生成', '',
  ].join('\n'));

  // merge_report.md
  const mergeStatus = isCodeOnly || isTaskChange ? 'not_applicable' : 'pending';
  await ensureFile(path.join(workItemDir, 'merge_report.md'), [
    '# Merge Report', '',
    `Work Item: ${workItemId}`,
    `Merge Status: ${mergeStatus}`, '',
    isCodeOnly ? 'Reason: This WI does not change project specs (code_only_fast_path).' : '',
    isTaskChange ? 'Reason: This WI does not change formal specs (task_change_path).' : '',
    '',
  ].filter(Boolean).join('\n'));

  // evidence/evidence_manifest.json
  await ensureFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
    schema_version: '1.0',
    work_item_id: workItemId,
    entries: [],
  }, null, 2) + '\n');
}

/**
 * v1.1: States that MUST NOT be set via updateWorkItemStatus().
 * These require the full state machine path: WorkflowEngine.transitionFull() + StateManager.transition().
 */
const BLOCKED_STATUS_UPDATES = new Set([
  'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
  'implementation_ready', 'verification_done', 'closed',
]);

/**
 * 更新 work_item.json 中的状态。
 *
 * v1.1: Only allowed for initial/non-critical states (e.g. 'intake_ready', 'created').
 * Critical states MUST go through the full state machine path.
 */
export async function updateWorkItemStatus(
  workItemDir: string,
  newStatus: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  // v1.1: Block critical states from being set via filesystem bypass
  if (BLOCKED_STATUS_UPDATES.has(newStatus)) {
    throw new Error(
      `Cannot set status '${newStatus}' via updateWorkItemStatus() — ` +
      `critical states must go through WorkflowEngine.transitionFull() + StateManager.transition()`
    );
  }

  const wiPath = path.join(workItemDir, 'work_item.json');
  const content = await fs.readFile(wiPath, 'utf-8');
  const wi = JSON.parse(content);
  wi.status = newStatus;
  wi.updated_at = new Date().toISOString();
  if (extra) {
    Object.assign(wi, extra);
  }
  await fs.writeFile(wiPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

async function ensureFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

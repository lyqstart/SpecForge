/**
 * rollback-runner-v11 — §16 回滚与 superseded
 *
 * 规则：
 * 1. 回滚必须通过新的 rollback WI 完成，不得原地修改旧 WI。
 * 2. 必须引用被回滚的 work_item_id / project_spec_version。
 * 3. 必须生成 rollback_plan / rollback_delta / rollback Candidate。
 * 4. 必须经过 Gate、User Decision、Merge Runner。
 * 5. project_spec_version 必须递增（不得回退版本）。
 * 6. 必须修复 Trace。
 * 7. superseded WI 标记 status=superseded + superseded_by=<WI-ID>。
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ── Types ──

export interface RollbackPlan {
  /** 新建的 rollback WI ID */
  rollbackWorkItemId: string;
  /** 被回滚的 WI ID */
  originalWorkItemId: string;
  /** 被回滚的 project_spec_version */
  originalSpecVersion: string;
  /** 回滚目标版本（必须递增） */
  targetSpecVersion: string;
  /** 回滚步骤 */
  steps: Array<{
    /** 要恢复的 project 文件路径 */
    targetPath: string;
    /** 回滚方式 */
    operation: 'restore_from_candidate' | 'restore_from_backup' | 'delete' | 'manual';
    /** 说明 */
    description: string;
  }>;
  /** 是否可以自动回滚 */
  canAutoRollback: boolean;
  /** 风险说明 */
  risks: string[];
}

export interface RollbackDelta {
  workItemId: string;
  originalWorkItemId: string;
  changes: Array<{
    path: string;
    type: 'restored' | 'deleted' | 'modified' | 'unreachable';
    description: string;
  }>;
  traceImpact: 'modified' | 'restored' | 'unreachable';
  traceDescription: string;
}

export interface SupersedeResult {
  originalWorkItemId: string;
  supersededByWorkItemId: string;
  status: 'superseded';
  supersededAt: string;
}

// ── Rollback Plan Generation ──

/**
 * 生成回滚计划。
 * 读取被回滚 WI 的 merge_report 和 candidate_manifest，生成反向操作。
 */
export async function generateRollbackPlan(params: {
  rollbackWorkItemId: string;
  originalWorkItemId: string;
  workItemsRoot: string;
  projectRoot: string;
}): Promise<RollbackPlan> {
  const { rollbackWorkItemId, originalWorkItemId, workItemsRoot, projectRoot } = params;

  const originalWiDir = join(workItemsRoot, originalWorkItemId);
  const steps: RollbackPlan['steps'] = [];
  const risks: string[] = [];

  // 读取原 WI 的 merge_report
  const mergeReportPath = join(originalWiDir, 'merge_report.md');
  if (!existsSync(mergeReportPath)) {
    risks.push('原 WI 没有 merge_report.md，无法确定合并了哪些文件');
  }

  // 读取原 WI 的 candidate_manifest
  const candidateManifestPath = join(originalWiDir, 'candidate_manifest.json');
  let entries: any[] = [];
  if (existsSync(candidateManifestPath)) {
    try {
      const raw = await readFile(candidateManifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      entries = manifest.entries || [];
    } catch {
      risks.push('candidate_manifest.json 解析失败');
    }
  } else {
    risks.push('原 WI 没有 candidate_manifest.json');
  }

  // 读取当前 spec_manifest 获取版本号
  const specManifestPath = join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
  let currentVersion = 'PSV-0001';
  if (existsSync(specManifestPath)) {
    try {
      const raw = await readFile(specManifestPath, 'utf-8');
      const sm = JSON.parse(raw);
      currentVersion = sm.project_spec_version || 'PSV-0001';
    } catch {
      // fallback
    }
  }

  // 为每个合并过的文件生成反向步骤
  for (const entry of entries) {
    const targetPath = entry.target_path as string;
    if (!targetPath) continue;

    // 检查 target 是否有 base hash（合并前的版本）
    if (entry.target_base_hash) {
      steps.push({
        targetPath,
        operation: 'restore_from_candidate',
        description: `恢复 ${targetPath} 到合并前版本 (base hash: ${entry.target_base_hash})`,
      });
    } else {
      steps.push({
        targetPath,
        operation: 'manual',
        description: `${targetPath} 没有合并前 hash，需要手动确认恢复方式`,
      });
      risks.push(`${targetPath} 缺少 base hash，无法自动恢复`);
    }
  }

  // 计算目标版本号（递增）
  const versionNum = parseInt(currentVersion.replace('PSV-', ''), 10);
  const targetVersion = `PSV-${String(versionNum + 1).padStart(4, '0')}`;

  const canAutoRollback = risks.length === 0 &&
    steps.length > 0 &&
    steps.every(s => s.operation !== 'manual');

  return {
    rollbackWorkItemId,
    originalWorkItemId,
    originalSpecVersion: currentVersion,
    targetSpecVersion: targetVersion,
    steps,
    canAutoRollback,
    risks,
  };
}

// ── Rollback Delta Generation ──

/**
 * 生成回滚 delta。
 */
export async function generateRollbackDelta(params: {
  rollbackWorkItemId: string;
  originalWorkItemId: string;
  rollbackPlan: RollbackPlan;
}): Promise<RollbackDelta> {
  const { rollbackWorkItemId, originalWorkItemId, rollbackPlan } = params;

  const changes: RollbackDelta['changes'] = rollbackPlan.steps.map(step => ({
    path: step.targetPath,
    type: step.operation === 'delete' ? 'deleted' as const :
          step.operation === 'restore_from_candidate' ? 'restored' as const :
          step.operation === 'restore_from_backup' ? 'restored' as const :
          'modified' as const,
    description: step.description,
  }));

  return {
    workItemId: rollbackWorkItemId,
    originalWorkItemId,
    changes,
    traceImpact: 'modified',
    traceDescription: `Rollback WI ${rollbackWorkItemId} 回滚 ${originalWorkItemId} 的合并操作。` +
      `影响 ${changes.length} 个文件。` +
      `project_spec_version 从 ${rollbackPlan.originalSpecVersion} 递增到 ${rollbackPlan.targetSpecVersion}。`,
  };
}

// ── Supersede Original WI ──

/**
 * 将原 WI 标记为 superseded。
 * 不得删除原 WI，不得把原 WI 当作成功 closed。
 */
export async function markOriginalSuperseded(params: {
  originalWiDir: string;
  originalWorkItemId: string;
  supersededByWorkItemId: string;
}): Promise<SupersedeResult> {
  const { originalWiDir, originalWorkItemId, supersededByWorkItemId } = params;

  const workItemJsonPath = join(originalWiDir, 'work_item.json');
  if (!existsSync(workItemJsonPath)) {
    throw new Error(`原 WI 没有 work_item.json: ${originalWiDir}`);
  }

  const raw = await readFile(workItemJsonPath, 'utf-8');
  const wi = JSON.parse(raw);

  // 检查原 WI 是否已 closed
  if (wi.status === 'closed') {
    throw new Error(`原 WI ${originalWorkItemId} 已经 closed，不能 superseded。必须创建 repair WI。`);
  }

  // 标记为 superseded
  wi.status = 'superseded';
  wi.superseded_by = supersededByWorkItemId;
  wi.superseded_at = new Date().toISOString();

  await writeFile(workItemJsonPath, JSON.stringify(wi, null, 2) + '\n', 'utf-8');

  return {
    originalWorkItemId,
    supersededByWorkItemId,
    status: 'superseded',
    supersededAt: wi.superseded_at,
  };
}

// ── Rollback Plan Writer ──

/**
 * 将回滚计划写入 WI 目录。
 */
export async function writeRollbackPlan(
  rollbackWiDir: string,
  plan: RollbackPlan,
): Promise<string> {
  await mkdir(rollbackWiDir, { recursive: true });

  const lines: string[] = [
    '# Rollback Plan',
    '',
    `**Rollback WI**: ${plan.rollbackWorkItemId}`,
    `**Original WI**: ${plan.originalWorkItemId}`,
    `**Original Spec Version**: ${plan.originalSpecVersion}`,
    `**Target Spec Version**: ${plan.targetSpecVersion} (§16.1: must increment)`,
    `**Can Auto Rollback**: ${plan.canAutoRollback}`,
    '',
    '## Steps',
    '',
  ];

  for (const step of plan.steps) {
    lines.push(`- [${step.operation.toUpperCase()}] ${step.targetPath}`);
    lines.push(`  ${step.description}`);
  }

  if (plan.risks.length > 0) {
    lines.push('', '## Risks', '');
    for (const risk of plan.risks) {
      lines.push(`- ⚠️ ${risk}`);
    }
  }

  lines.push('', '## Rules (§16.1)', '',
    '1. Must reference original work_item_id and project_spec_version.',
    '2. Must generate rollback_plan, rollback_delta, and rollback Candidate.',
    '3. Must go through Gate → User Decision → Merge Runner.',
    '4. project_spec_version must increment (never decrement).',
    '5. Trace must be repaired.',
    '6. Original WI marked as superseded (not deleted, not closed).',
    '',
  );

  const planPath = join(rollbackWiDir, 'rollback_plan.md');
  await writeFile(planPath, lines.join('\n'), 'utf-8');
  return planPath;
}

/**
 * 将回滚 delta 写入 WI 目录。
 */
export async function writeRollbackDelta(
  rollbackWiDir: string,
  delta: RollbackDelta,
): Promise<string> {
  await mkdir(rollbackWiDir, { recursive: true });

  const lines: string[] = [
    '# Rollback Delta',
    '',
    `**Rollback WI**: ${delta.workItemId}`,
    `**Original WI**: ${delta.originalWorkItemId}`,
    '',
    '## Changes',
    '',
  ];

  for (const change of delta.changes) {
    lines.push(`- [${change.type.toUpperCase()}] ${change.path}`);
    lines.push(`  ${change.description}`);
  }

  lines.push('', '## Trace Impact', '',
    `**Type**: ${delta.traceImpact}`,
    `**Description**: ${delta.traceDescription}`,
    '',
  );

  const deltaPath = join(rollbackWiDir, 'rollback_delta.md');
  await writeFile(deltaPath, lines.join('\n'), 'utf-8');
  return deltaPath;
}

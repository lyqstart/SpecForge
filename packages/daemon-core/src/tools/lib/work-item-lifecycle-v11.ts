/**
 * work-item-lifecycle-v11.ts — v1.1 标准 Work Item 生命周期管理
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 负责：
 * - §4.2 WI 目录创建
 * - §4.4 work_item.json 初始化
 * - §4.5 intake.md 生成
 * - 非 Candidate 闭环文件初始化
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WORK_ITEM_METADATA_SCHEMA_VERSION } from './artifact-schema-validation';
import { formatWorkItemId, parseWorkItemSequence } from './work-item-id-validator';

// ---------------------------------------------------------------------------
// Work Item 创建
// ---------------------------------------------------------------------------

export interface CreateWorkItemInput {
  projectRoot: string;
  workItemId: string;
  userRequest: string;
  createdBy?: string;
  workflowType?: string;
  workflowPath?: string | null;
}

/** Allocate the next current Work Item identity inside the single Daemon owner. */
export async function allocateNextWorkItemId(projectRoot: string): Promise<string> {
  const workItemsRoot = path.join(projectRoot, '.specforge', 'work-items');
  await fs.mkdir(workItemsRoot, { recursive: true });

  let maxSequence = 0;
  for (const entry of await fs.readdir(workItemsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sequence = parseWorkItemSequence(entry.name);
    if (sequence !== null && sequence > maxSequence) maxSequence = sequence;
  }
  return formatWorkItemId(maxSequence + 1);
}

/**
 * 创建一个新的 Work Item 目录和初始文件（§4.2, §4.4, §4.5）。
 */
export async function createWorkItem(input: CreateWorkItemInput): Promise<string> {
  const wiDir = path.join(input.projectRoot, '.specforge', 'work-items', input.workItemId);

  // The Work Item root is allocated exactly once. Reusing recursive mkdir here
  // would let a duplicate create overwrite governed metadata and intake history.
  await fs.mkdir(path.dirname(wiDir), { recursive: true });
  try {
    await fs.mkdir(wiDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`WORK_ITEM_ALREADY_EXISTS: ${input.workItemId}`);
    }
    throw error;
  }
  await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });

  const now = new Date().toISOString();

  // §4.4 work_item.json
  const workItemJson = {
    schema_version: WORK_ITEM_METADATA_SCHEMA_VERSION,
    work_item_id: input.workItemId,
    workflow_type: input.workflowType ?? 'quick_change',
    workflow_path: input.workflowPath ?? null,
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

const PROJECT_SPEC_VERSION_PATTERN = /^PSV-[0-9]{4,}$/;

/**
 * Read the authoritative Project Spec version for Work Item creation.
 *
 * candidate_manifest.base_spec_version is a merge precondition, so production
 * creation must never guess or silently fall back to PSV-0001 for an existing
 * project. The sole authority is project/spec_manifest.json.
 */
export async function readAuthoritativeProjectSpecVersion(
  projectRoot: string,
): Promise<string> {
  const manifestPath = path.join(
    projectRoot,
    '.specforge',
    'project',
    'spec_manifest.json',
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PROJECT_SPEC_VERSION_UNAVAILABLE: cannot read ${manifestPath}: ${detail}`,
    );
  }

  const version =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).project_spec_version
      : undefined;

  if (
    typeof version !== 'string' ||
    !PROJECT_SPEC_VERSION_PATTERN.test(version)
  ) {
    throw new Error(
      `PROJECT_SPEC_VERSION_UNAVAILABLE: ${manifestPath} must contain a valid project_spec_version`,
    );
  }

  return version;
}

/**
 * 初始化 WI 的非 Candidate 闭环文件骨架（§4.3）。
 *
 * tasks.md 与 trace_delta.md 的新写入权威路径位于 candidates/。不得在
 * Work Item 顶层预建同名占位。verification_report.md 与
 * evidence/evidence_manifest.json 也不得预建空壳；它们只能由 Verifier
 * 在真实验证阶段写入。旧顶层 tasks/trace 仍由 Path Service 只读兼容。
 */
export async function initializeClosureFiles(
  workItemDir: string,
  workItemId: string,
  workflowPath: string | null,
  baseSpecVersion: string,
): Promise<void> {
  if (!PROJECT_SPEC_VERSION_PATTERN.test(baseSpecVersion)) {
    throw new Error(
      `PROJECT_SPEC_VERSION_INVALID: ${baseSpecVersion}`,
    );
  }
  const now = new Date().toISOString();
  const isCodeOnly = workflowPath === 'code_only_fast_path';
  const isTaskChange = workflowPath === 'task_change_path';
  await Promise.all([
    fs.mkdir(path.join(workItemDir, 'candidates'), { recursive: true }),
    fs.mkdir(path.join(workItemDir, 'gates'), { recursive: true }),
    fs.mkdir(path.join(workItemDir, 'evidence'), { recursive: true }),
  ]);

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

  // candidate_manifest.json
  await ensureFile(path.join(workItemDir, 'candidate_manifest.json'), JSON.stringify({
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: workflowPath ?? 'unknown',
    base_spec_version: baseSpecVersion,
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

  // merge_report.md
  const mergeStatus = isCodeOnly || isTaskChange ? 'not_applicable' : 'pending';
  await ensureFile(path.join(workItemDir, 'merge_report.md'), [
    '# Merge Report', '',
    `Work Item: ${workItemId}`,
    `Status: ${mergeStatus}`, '',
    isCodeOnly ? 'Reason: This WI does not change project specs (code_only_fast_path).' : '',
    isTaskChange ? 'Reason: This WI does not change formal specs (task_change_path).' : '',
    '',
  ].filter(Boolean).join('\n'));

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

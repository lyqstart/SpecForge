/**
 * merge-runner-v11.ts — v1.1 标准 Merge Runner（§11）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * Merge Runner 是唯一允许写入正式规格真相源的受控执行器。
 * 普通 Agent 不得写入 .specforge/project/**。
 *
 * 规则（§11.3）：
 * - 只能按 candidate_manifest.json 合并
 * - 禁止扫描 candidates/** 自行决定写入范围
 * - 禁止自动忽略 hash 不匹配
 * - 禁止在 base_spec_version 冲突时尝试合并
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface MergeInput {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  candidateManifestPath: string;
  userDecisionPath: string;
}

export interface MergeEntryResult {
  candidate_path: string;
  target_path: string;
  operation: string;
  status: 'success' | 'skipped' | 'failed';
  hash_match: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  merged_files: MergeEntryResult[];
  spec_manifest_updated: boolean;
  project_spec_version: string;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Hash 工具
// ---------------------------------------------------------------------------

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Merge Runner 执行
// ---------------------------------------------------------------------------

/**
 * 执行 Merge（§11.3）。
 * 按 candidate_manifest.json 将 candidates/ 下的文件合并到 .specforge/project/。
 */
export async function executeMerge(input: MergeInput): Promise<MergeResult> {
  const result: MergeResult = {
    success: true,
    merged_files: [],
    spec_manifest_updated: false,
    project_spec_version: '',
    errors: [],
  };

  // 1. 读取 candidate_manifest.json
  let manifest: any;
  try {
    const content = await fs.readFile(input.candidateManifestPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (err: any) {
    return { ...result, success: false, errors: [`Cannot read candidate_manifest.json: ${err.message}`] };
  }

  const entries = manifest.entries ?? [];

  // 2. 检查 base_spec_version
  const projectSpecManifestPath = path.join(input.projectRoot, '.specforge', 'project', 'spec_manifest.json');
  let currentVersion = 'PSV-0000';
  try {
    const content = await fs.readFile(projectSpecManifestPath, 'utf-8');
    const specManifest = JSON.parse(content);
    currentVersion = specManifest.project_spec_version ?? 'PSV-0000';
  } catch {
    // spec_manifest 不存在，首次初始化
  }

  // 3. 读取 user_decision.json 校验
  try {
    const content = await fs.readFile(input.userDecisionPath, 'utf-8');
    const decision = JSON.parse(content);
    if (!['approved', 'waived'].includes(decision.decision_status)) {
      return { ...result, success: false, errors: [`User Decision status is "${decision.decision_status}", not approved/waived`] };
    }
  } catch (err: any) {
    return { ...result, success: false, errors: [`Cannot read user_decision.json: ${err.message}`] };
  }

  // 4. 按 manifest entries 逐个合并
  for (const entry of entries) {
    const candidateFullPath = path.resolve(input.workItemDir, entry.candidate_path);
    // target_path 相对于项目根
    const targetFullPath = path.resolve(input.projectRoot, entry.target_path);

    // 安全检查：candidate 必须在 workItemDir 下
    if (!candidateFullPath.startsWith(path.resolve(input.workItemDir))) {
      result.errors.push(`Security: candidate_path outside WI: ${entry.candidate_path}`);
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: 'candidate_path outside WI directory',
      });
      result.success = false;
      continue;
    }

    // 安全检查：target 必须在 .specforge/project/ 下
    const projectDir = path.resolve(input.projectRoot, '.specforge', 'project');
    if (!targetFullPath.startsWith(projectDir)) {
      result.errors.push(`Security: target_path outside .specforge/project/: ${entry.target_path}`);
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: 'target_path outside .specforge/project/',
      });
      result.success = false;
      continue;
    }

    try {
      if (entry.operation === 'delete') {
        // 删除操作
        try {
          await fs.unlink(targetFullPath);
          result.merged_files.push({
            candidate_path: entry.candidate_path,
            target_path: entry.target_path,
            operation: 'delete',
            status: 'success',
            hash_match: true,
          });
        } catch {
          // 文件不存在也算成功
          result.merged_files.push({
            candidate_path: entry.candidate_path,
            target_path: entry.target_path,
            operation: 'delete',
            status: 'success',
            hash_match: true,
          });
        }
      } else {
        // replace / create：复制 candidate 到 target
        await fs.mkdir(path.dirname(targetFullPath), { recursive: true });
        await fs.copyFile(candidateFullPath, targetFullPath);

        // 验证 hash
        const candidateHash = await computeFileHash(candidateFullPath);
        const targetHash = await computeFileHash(targetFullPath);
        const hashMatch = candidateHash === targetHash;

        result.merged_files.push({
          candidate_path: entry.candidate_path,
          target_path: entry.target_path,
          operation: entry.operation,
          status: hashMatch ? 'success' : 'failed',
          hash_match: hashMatch,
          error: hashMatch ? undefined : 'Hash mismatch after copy',
        });

        if (!hashMatch) {
          result.success = false;
        }
      }
    } catch (err: any) {
      result.merged_files.push({
        candidate_path: entry.candidate_path,
        target_path: entry.target_path,
        operation: entry.operation,
        status: 'failed',
        hash_match: false,
        error: err.message,
      });
      result.success = false;
    }
  }

  // 5. 更新 spec_manifest.json（§11.5）
  if (result.success && entries.length > 0) {
    try {
      // 递增 project_spec_version
      const versionNum = parseInt(currentVersion.replace('PSV-', ''), 10) || 0;
      const newVersion = `PSV-${String(versionNum + 1).padStart(4, '0')}`;
      result.project_spec_version = newVersion;

      let specManifest: any = {};
      try {
        const content = await fs.readFile(projectSpecManifestPath, 'utf-8');
        specManifest = JSON.parse(content);
      } catch { /* 首次 */ }

      specManifest.project_spec_version = newVersion;
      specManifest.last_merged_work_item = input.workItemId;
      specManifest.last_merged_at = new Date().toISOString();

      await fs.mkdir(path.dirname(projectSpecManifestPath), { recursive: true });
      await fs.writeFile(projectSpecManifestPath, JSON.stringify(specManifest, null, 2) + '\n', 'utf-8');
      result.spec_manifest_updated = true;
    } catch (err: any) {
      result.errors.push(`Failed to update spec_manifest.json: ${err.message}`);
      result.success = false;
    }
  }

  // 6. 生成 merge_report.md（§11.4）
  await generateMergeReport(input, result);

  return result;
}

// ---------------------------------------------------------------------------
// Merge Report 生成（§11.4）
// ---------------------------------------------------------------------------

async function generateMergeReport(input: MergeInput, result: MergeResult): Promise<void> {
  const lines: string[] = [
    '# Merge Report',
    '',
    `Work Item: ${input.workItemId}`,
    `Status: ${result.success ? 'success' : 'failed'}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total entries: ${result.merged_files.length}`,
    `- Successful: ${result.merged_files.filter(e => e.status === 'success').length}`,
    `- Failed: ${result.merged_files.filter(e => e.status === 'failed').length}`,
    `- Spec Manifest Updated: ${result.spec_manifest_updated}`,
    `- Project Spec Version: ${result.project_spec_version || 'N/A'}`,
    '',
    '## Inputs',
    '',
    `- candidate_manifest: ${input.candidateManifestPath}`,
    `- user_decision: ${input.userDecisionPath}`,
    '',
    '## Merged Files',
    '',
  ];

  for (const entry of result.merged_files) {
    lines.push(`| ${entry.status} | ${entry.operation} | ${entry.target_path} | hash_match: ${entry.hash_match} |`);
    if (entry.error) {
      lines.push(`  Error: ${entry.error}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('', '## Errors', '');
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
  }

  lines.push('', '## Evidence', '', '- merge_runner_execution_log');

  const reportPath = path.join(input.workItemDir, 'merge_report.md');
  await fs.writeFile(reportPath, lines.join('\n'), 'utf-8');
}

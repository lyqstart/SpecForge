/**
 * sf_tasks_gate 核心逻辑
 * 检查 tasks.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.6, REQ-3 AC-6, REQ-3 AC-7, REQ-3 AC-8, REQ-3 AC-9, REQ-3 AC-10
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { resolveWorkItemSpecArtifacts } from './governance-invariants-v11';
import type { GateResult } from './sf_gate_types';
import { getTaskSections } from './sf_doc_lint_core';
import { syncFromSpec, isKGEnabled } from './sf_knowledge_graph_core';
import { tryCheckCompatibility, logErrorToFile } from './utils';
import type { SyncSummary } from './sf_knowledge_graph_core';
import {
  parseTaskVerification,
  validateTaskArtifactContract,
} from './sf_markdown_verification_parser';
import {
  isTaskCorrectnessPropertyRef,
  isTaskRequirementRef,
} from '@specforge/types';
import {
  parseAllVerificationStrategies,
} from './sf_verification_types';
import type { VerificationType, ParsedTaskVerification } from './sf_verification_types';

// Re-export GateResult for convenience
export type { GateResult };

// ============================================================
// Helper: Extract task ID from section title
// ============================================================

/**
 * 从任务标题中提取 task ID
 * 支持格式：
 * - "TASK-1 ..." → "TASK-1"
 * - "Task 1: ..." → "TASK-1"
 * - "任务 1: ..." → "TASK-1"
 */
function extractTaskId(title: string): string {
  // Canonical TASK-WI-NNNN-NNN, with TASK-N as read-only compatibility.
  const taskIdMatch = title.match(/TASK-(?:WI-[0-9]{4}-[0-9]{3}|[0-9]+)/i);
  if (taskIdMatch) {
    return taskIdMatch[0].toUpperCase();
  }

  // Try "Task N" or "任务 N" format
  const legacyMatch = title.match(/(?:Task|任务)\s*(\d+)/i);
  if (legacyMatch) {
    return `TASK-${legacyMatch[1]}`;
  }

  // Fallback: use the title itself
  return title;
}

// ============================================================
// Helper: Normalize TypedCommandEntry to array
// ============================================================

function normalizeToArray(entry: string | string[] | undefined): string[] {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  return [entry];
}

// ============================================================
// crossValidateTask — V3.7 交叉验证
// ============================================================

/**
 * 执行 V3.7 交叉验证
 * 前提：task 使用类型化 verification_commands
 *
 * 5 个场景（REQ-3 AC-9）：
 * A: typed task 无 refs → fail
 * B: refs 指向的 REQ 无 verification_strategy → 忽略，不 fail
 * C: refs 指向多个 REQ，部分有 strategy → 取并集
 * D: Planned_Verification_Types 未覆盖 Declared_Required_Types → fail
 * E: typed task 包含 property 命令但 refs 中无规范 CP 引用 → fail
 */
export function crossValidateTask(
  taskId: string,
  taskVerification: ParsedTaskVerification,
  requirementsContent: string,
  designContent: string | null
): { blockingIssues: string[]; warnings: string[] } {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  // 场景 A: typed task 无 refs
  if (!taskVerification.refs || taskVerification.refs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} uses typed verification_commands but lacks REQ refs; cannot verify strategy coverage.`
    );
    return { blockingIssues, warnings };
  }

  // 提取规范或读取兼容的 REQ / CP refs
  const reqRefs = taskVerification.refs.filter(isTaskRequirementRef);
  const cpRefs = taskVerification.refs.filter(isTaskCorrectnessPropertyRef);

  // 场景 A 增强：refs 存在但无 REQ（如只有 CP 引用）
  if (reqRefs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} uses typed verification_commands but lacks REQ refs; cannot verify strategy coverage.`
    );
    return { blockingIssues, warnings };
  }

  // 场景 B/C: 从 refs 指向的 REQ 收集 Declared_Required_Types
  const allStrategies = parseAllVerificationStrategies(requirementsContent);
  const declaredTypes = new Set<VerificationType>();

  for (const reqRef of reqRefs) {
    const strategyResult = allStrategies.get(reqRef.toUpperCase());
    if (strategyResult && strategyResult.errors.length === 0 && strategyResult.types.length > 0) {
      // 场景 B: 无 verification_strategy 的 REQ 被忽略（不贡献 declaredTypes）
      // 场景 C: 有 verification_strategy 的 REQ 贡献其类型到并集
      for (const t of strategyResult.types) {
        declaredTypes.add(t);
      }
    }
  }

  // 场景 D: 检查 Planned_Verification_Types 是否覆盖 Declared_Required_Types
  if (declaredTypes.size > 0 && taskVerification.typedCommands) {
    const plannedTypes = new Set(Object.keys(taskVerification.typedCommands) as VerificationType[]);
    const missingTypes = [...declaredTypes].filter(t => !plannedTypes.has(t));

    if (missingTypes.length > 0) {
      const missingStr = missingTypes.join(', ');
      const reqRefsStr = reqRefs.join(', ');
      blockingIssues.push(
        `Task ${taskId} missing verification type(s) [${missingStr}] required by refs [${reqRefsStr}]`
      );
    }
  }

  // 场景 E: typed task 包含 property 命令但 refs 中无 CP
  if (taskVerification.typedCommands?.property !== undefined && cpRefs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} has property verification_commands but no canonical CP ref; property test without Correctness_Property traceability is not allowed.`
    );
  }

  // REQ-3 AC-10: property 命令路径与 CP test_file 一致性检查（warning 级别）
  if (
    taskVerification.typedCommands?.property !== undefined &&
    cpRefs.length > 0 &&
    designContent
  ) {
    const propertyCommands = normalizeToArray(taskVerification.typedCommands.property);
    for (const cpRef of cpRefs) {
      const testFile = extractCPTestFile(designContent, cpRef);
      if (testFile) {
        const pathMatches = propertyCommands.some(cmd => cmd.includes(testFile));
        if (!pathMatches) {
          warnings.push(
            `Task ${taskId}: property command path does not match CP ${cpRef} test_file "${testFile}" (warning only)`
          );
        }
      }
      // 若 CP 未声明 test_file，接受约定路径 tests/property/{cp_id}.property.test.ts（pass，无 warning）
    }
  }

  return { blockingIssues, warnings };
}

// ============================================================
// extractCPTestFile — 从 design.md 提取 CP 的 test_file
// ============================================================

/**
 * 从 design.md 内容中提取指定 CP ID 的 test_file 字段值
 * 返回 null 表示 CP 不存在或未声明 test_file
 */
export function extractCPTestFile(designContent: string, cpRef: string): string | null {
  // 匹配 CP 标题（如 #### CP-CORE-001 配置解析的往返一致性）
  const escapedRef = cpRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cpPattern = new RegExp(`^#{1,6}\\s+${escapedRef}[^\\n]*`, 'im');
  const cpMatch = cpPattern.exec(designContent);
  if (!cpMatch) return null;

  // 提取 CP 段落内容（到下一个同级或更高级标题为止）
  const afterCP = designContent.slice(cpMatch.index + cpMatch[0].length);
  const nextHeading = /^#{1,6}\s/m.exec(afterCP);
  const cpSection = nextHeading ? afterCP.slice(0, nextHeading.index) : afterCP;

  // 查找 test_file 字段
  const testFileMatch = /\*\*test_file\*\*\s*:\s*(.+)/i.exec(cpSection);
  return testFileMatch ? testFileMatch[1].trim() : null;
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 tasks gate 检查
 *
 * 检查项：
 * 1. tasks.md 是否存在
 * 2. 每个 task 章节是否包含 verification_commands 字段
 * 3. V3.7: 对 typed 格式执行类型键合法性检查和交叉验证
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
type SpecArtifact = { content: string; path: string };
type RequirementClassificationKey =
  | 'requirement_changed'
  | 'acceptance_criteria_changed'
  | 'business_rule_changed';
type RequirementSource = 'candidate' | 'formal_module_requirements';

type RequirementResolution = {
  source: RequirementSource;
  artifacts: SpecArtifact[];
  classification: Record<RequirementClassificationKey, boolean | null>;
  classification_status: 'changed' | 'unchanged' | 'unknown_fail_closed';
  classification_files: string[];
};

const REQUIREMENT_CLASSIFICATION_KEYS: RequirementClassificationKey[] = [
  'requirement_changed',
  'acceptance_criteria_changed',
  'business_rule_changed',
];

function findBooleanRecursively(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record[key] === 'boolean') return record[key] as boolean;
    for (const nested of Object.values(record)) {
      const found = findBooleanRecursively(nested, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const nested of value) {
    const found = findBooleanRecursively(nested, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findMarkdownBoolean(content: string, key: string): boolean | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*(?:[-*|]\\s*)?${escaped}\\s*(?::|=|\\|)\\s*(true|false)\\b`, 'i').exec(content);
  return match ? match[1].toLowerCase() === 'true' : undefined;
}

async function readRequirementClassification(baseDir: string, workItemId: string): Promise<{
  values: Record<RequirementClassificationKey, boolean | null>;
  files: string[];
}> {
  const workItemDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  const jsonPath = path.join(workItemDir, 'trigger_result.json');
  const markdownPath = path.join(workItemDir, 'change_classification.md');
  const values = Object.fromEntries(
    REQUIREMENT_CLASSIFICATION_KEYS.map(key => [key, null]),
  ) as Record<RequirementClassificationKey, boolean | null>;
  const files: string[] = [];

  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as unknown;
    files.push(jsonPath);
    for (const key of REQUIREMENT_CLASSIFICATION_KEYS) {
      const found = findBooleanRecursively(parsed, key);
      if (found !== undefined) values[key] = found;
    }
  } catch {
    // Markdown fallback below. Unknown classification remains fail-closed.
  }

  if (REQUIREMENT_CLASSIFICATION_KEYS.some(key => values[key] === null)) {
    try {
      const content = await fs.readFile(markdownPath, 'utf-8');
      files.push(markdownPath);
      for (const key of REQUIREMENT_CLASSIFICATION_KEYS) {
        if (values[key] !== null) continue;
        const found = findMarkdownBoolean(content, key);
        if (found !== undefined) values[key] = found;
      }
    } catch {
      // Unknown classification remains fail-closed.
    }
  }
  return { values, files };
}

async function collectFormalModuleRequirements(baseDir: string): Promise<SpecArtifact[]> {
  const modulesRoot = path.join(baseDir, SPEC_DIR_NAME, 'project', 'modules');
  const result: SpecArtifact[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name === 'requirements.md') {
        result.push({ content: await fs.readFile(absolute, 'utf-8'), path: absolute });
      }
    }
  };
  await visit(modulesRoot);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

export async function resolveTaskRequirementArtifacts(
  baseDir: string,
  workItemId: string,
): Promise<RequirementResolution> {
  const classification = await readRequirementClassification(baseDir, workItemId);
  const values = classification.values;
  const anyChanged = REQUIREMENT_CLASSIFICATION_KEYS.some(key => values[key] === true);
  const allUnchanged = REQUIREMENT_CLASSIFICATION_KEYS.every(key => values[key] === false);
  const source: RequirementSource = allUnchanged ? 'formal_module_requirements' : 'candidate';
  const artifacts =
    source === 'candidate'
      ? await resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: 'requirements' })
      : await collectFormalModuleRequirements(baseDir);
  return {
    source,
    artifacts,
    classification: values,
    classification_status: anyChanged
      ? 'changed'
      : allUnchanged
        ? 'unchanged'
        : 'unknown_fail_closed',
    classification_files: classification.files,
  };
}

export async function checkTasksGate(workItemId: string, baseDir: string): Promise<GateResult> {
  try {
    await tryCheckCompatibility(baseDir, 'sf_tasks_gate_core');
    let taskArtifacts: SpecArtifact[];
    let requirementResolution: RequirementResolution;
    let designArtifacts: SpecArtifact[];
    try {
      [taskArtifacts, requirementResolution, designArtifacts] = await Promise.all([
        resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: 'tasks' }),
        resolveTaskRequirementArtifacts(baseDir, workItemId),
        resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: 'design' }),
      ]);
    } catch (err: unknown) {
      return {
        status: 'blocked',
        blocking_issues: [`Failed to read task planning inputs: ${(err as Error).message}`],
        warnings: [],
        next_action: 'ask_user',
      };
    }

    const requirementArtifacts = requirementResolution.artifacts;
    const buildDetails = () => ({
      task_candidate_paths: taskArtifacts.map(artifact => artifact.path),
      requirements_source: requirementResolution.source,
      requirements_paths: requirementArtifacts.map(artifact => artifact.path),
      requirements_candidate_paths:
        requirementResolution.source === 'candidate'
          ? requirementArtifacts.map(artifact => artifact.path)
          : [],
      formal_module_requirements_paths:
        requirementResolution.source === 'formal_module_requirements'
          ? requirementArtifacts.map(artifact => artifact.path)
          : [],
      requirements_change_classification: requirementResolution.classification,
      requirements_classification_status: requirementResolution.classification_status,
      requirements_classification_files: requirementResolution.classification_files,
      design_candidate_paths: designArtifacts.map(artifact => artifact.path),
    });

    if (taskArtifacts.length === 0) {
      return {
        status: 'fail',
        blocking_issues: ['tasks candidate not found'],
        warnings: [],
        next_action: 'revise',
        details: buildDetails(),
      };
    }

    const requirementsContent =
      requirementArtifacts.map(artifact => artifact.content).join('\n\n') || null;
    const designContent = designArtifacts.map(artifact => artifact.content).join('\n\n') || null;
    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    for (const artifact of taskArtifacts) {
      const content = artifact.content;
      const label = artifact.path.replace(/\\/g, '/');
      const taskSections = getTaskSections(content);
      if (taskSections.length === 0) {
        blockingIssues.push(`${label}: tasks candidate 中未找到任何任务章节`);
        continue;
      }
      const contractValidation = validateTaskArtifactContract(content, {
        allowLegacyCommands: true,
        allowLegacyIds: true,
      });
      for (const issue of contractValidation.issues) {
        const message = `${label}${issue.task_id ? `#${issue.task_id}` : ''}: ${issue.message}`;
        if (issue.severity === 'error') blockingIssues.push(message);
        else warnings.push(message);
      }
      for (const section of taskSections) {
        const taskVerification = parseTaskVerification(section.content);
        if (taskVerification.format !== 'typed') continue;
        const taskId = extractTaskId(section.title);
        if (!requirementsContent) {
          blockingIssues.push(
            `${label}: Task ${taskId} uses typed verification_commands but ${requirementResolution.source} requirements are missing or unreadable; cannot verify strategy coverage.`,
          );
          continue;
        }
        const refs = taskVerification.refs ?? [];
        const propertyIsTraceable =
          taskVerification.typedCommands?.property === undefined ||
          refs.some(isTaskCorrectnessPropertyRef);
        if (!refs.some(isTaskRequirementRef) || !propertyIsTraceable) continue;
        const crossResult = crossValidateTask(
          taskId,
          taskVerification,
          requirementsContent,
          designContent,
        );
        blockingIssues.push(...crossResult.blockingIssues.map(issue => `${label}: ${issue}`));
        warnings.push(...crossResult.warnings.map(warning => `${label}: ${warning}`));
      }
    }

    if (blockingIssues.length > 0) {
      return {
        status: 'fail',
        blocking_issues: blockingIssues,
        warnings,
        next_action: 'revise',
        details: buildDetails(),
      };
    }

    let kgSync: SyncSummary | null = null;
    try {
      if (await isKGEnabled(baseDir)) {
        const kgResult = await syncFromSpec(workItemId, baseDir, 'tasks');
        if (kgResult.success && kgResult.summary) kgSync = kgResult.summary;
        else if (kgResult.error) warnings.push(`KG sync warning: ${kgResult.error}`);
      }
    } catch (err) {
      warnings.push(`KG sync failed: ${(err as Error).message}`);
    }
    return {
      status: 'pass',
      blocking_issues: [],
      warnings,
      next_action: 'continue',
      kg_sync: kgSync,
      details: buildDetails(),
    };
  } catch (err) {
    await logErrorToFile(baseDir, 'sf_tasks_gate_core', 'checkTasksGate', err);
    throw err;
  }
}

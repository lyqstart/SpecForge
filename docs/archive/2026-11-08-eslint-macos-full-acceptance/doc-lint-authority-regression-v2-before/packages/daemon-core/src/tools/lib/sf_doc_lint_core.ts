/**
 * sf_doc_lint 核心逻辑
 * 检查规格文档的结构合规性
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, REQ-3 AC-8, REQ-8 AC-6
 */

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { workItemRoot } from '@specforge/types/directory-layout';
import { resolveWorkItemSpecArtifacts } from './governance-invariants-v11';
import {
  parseTaskSections,
  parseTaskVerification,
  validateTaskArtifactContract,
} from './sf_markdown_verification_parser';
import { logErrorToFile } from './utils';

// ============================================================
// Types
// ============================================================

export type DocType = 'requirements' | 'design' | 'tasks' | 'bugfix';

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  location: string;
  errorCode?: string;
}

export interface DocLintResult {
  status: 'pass' | 'fail';
  issues: LintIssue[];
}

// ============================================================
// Candidate path resolution
// ============================================================

async function readBugfixDocument(
  workItemId: string,
  baseDir: string
): Promise<Array<{ path: string; content: string }>> {
  const paths = [join(workItemRoot(baseDir, workItemId), 'bugfix.md')];
  for (const candidatePath of paths) {
    try {
      return [{ path: candidatePath, content: await readFile(candidatePath, 'utf-8') }];
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return [];
}

async function getDocuments(
  workItemId: string,
  docType: DocType,
  baseDir: string
): Promise<Array<{ path: string; content: string }>> {
  if (docType === 'bugfix') return readBugfixDocument(workItemId, baseDir);
  return resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: docType });
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行文档 lint 检查
 *
 * @param workItemId - Work Item ID
 * @param docType - 文档类型
 * @param baseDir - 项目根目录路径
 * @returns lint 检查结果
 */
export async function lintDocument(
  workItemId: string,
  docType: DocType,
  baseDir: string
): Promise<DocLintResult> {
  try {
    const docFileName = getDocFileName(docType);
    const documents = await getDocuments(workItemId, docType, baseDir);

    if (documents.length === 0) {
      return {
        status: 'fail',
        issues: [
          {
            severity: 'error',
            message: `File not found: ${docFileName}`,
            location: docFileName,
          },
        ],
      };
    }

    const results = documents.map(document => {
      const location = relative(baseDir, document.path).replace(/\\/g, '/') || docFileName;
      switch (docType) {
        case 'requirements':
          return lintRequirements(document.content, location);
        case 'design':
          return lintDesign(document.content, location);
        case 'tasks':
          return lintTasks(document.content, location);
        case 'bugfix':
          return lintBugfix(document.content, location);
      }
    });
    const issues = results.flatMap(result => result.issues);
    return {
      status: issues.some(issue => issue.severity === 'error') ? 'fail' : 'pass',
      issues,
    };
  } catch (err) {
    await logErrorToFile(baseDir, 'sf_doc_lint_core', 'lintDocument', err);
    throw err;
  }
}

// ============================================================
// Document-specific lint logic
// ============================================================

/**
 * 检查 requirements.md 的结构
 * 必须包含: 简介/Introduction, 术语表/Glossary, 需求/Requirements 章节
 * 警告: 需求标题应使用 REQ-MODULE-NNN 规范格式
 */
function lintRequirements(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = [];

  // Check for Introduction section (case-insensitive heading)
  if (!hasHeading(content, ['简介', 'introduction'])) {
    issues.push({
      severity: 'error',
      message: '缺少"简介"/"Introduction"章节',
      location: fileName,
    });
  }

  // Check for Glossary section
  if (!hasHeading(content, ['术语表', 'glossary'])) {
    issues.push({
      severity: 'error',
      message: '缺少"术语表"/"Glossary"章节',
      location: fileName,
    });
  }

  // Check for Requirements section
  if (!hasHeading(content, ['需求', 'requirements'])) {
    issues.push({
      severity: 'error',
      message: '缺少"需求"/"Requirements"章节',
      location: fileName,
    });
  }

  // Check for canonical REQ-MODULE-NNN marker format (warning level)
  if (!hasStandardizedMarkers(content, 'requirements')) {
    issues.push({
      severity: 'warning',
      message: '需求标题未使用规范格式"### REQ-<MODULE_CODE>-<NNN> 标题"，治理追溯解析可能失败',
      location: fileName,
    });
  }

  // V6 架构: 仅对包含对应 REQ 节的文档检查对应规则
  // 检查文档是否包含V6相关关键词
  /* Historical V6 content algorithms are retained below, but are not current product lint policy. */

  /* Historical V6 content algorithms are retained below, but are not current product lint policy. */

  return {
    status: issues.filter(i => i.severity === 'error').length === 0 ? 'pass' : 'fail',
    issues,
  };
}

/**
 * 检查 design.md 的结构
 * - 检查是否包含设计相关章节
 * - 检查是否不包含任务拆分内容
 * - 警告: 设计决策标题应使用 DD-MODULE-NNN 规范格式
 * - V6 架构: 检查核心设计原则节
 */
function lintDesign(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = [];

  // Check for design-related sections (架构/Architecture, 设计/Design, 接口/Interface)
  const hasDesignSection =
    hasHeading(content, ['架构', 'architecture']) ||
    hasHeading(content, ['设计', 'design']) ||
    hasHeading(content, ['接口', 'interface', 'interfaces']) ||
    hasHeading(content, ['组件', 'component', 'components']);

  if (!hasDesignSection) {
    issues.push({
      severity: 'error',
      message: '缺少设计相关章节（架构/设计/接口/组件）',
      location: fileName,
    });
  }

  // Check that design doc does NOT contain task breakdown content
  if (hasTaskBreakdownContent(content)) {
    issues.push({
      severity: 'error',
      message: '设计文档不应包含任务拆分内容',
      location: fileName,
    });
  }

  // Check for canonical DD-MODULE-NNN marker format (warning level)
  if (!hasStandardizedMarkers(content, 'design')) {
    issues.push({
      severity: 'warning',
      message: '设计决策标题未使用规范格式"### DD-<MODULE_CODE>-<NNN> 标题"，治理追溯解析可能失败',
      location: fileName,
    });
  }

  // V6 架构: 检查核心设计原则节（仅对V6架构文档）
  // 检查文档是否包含V6相关关键词或核心设计原则节
  /* Historical V6 content algorithms are retained below, but are not current product lint policy. */

  /* Historical V6 content algorithms are retained below, but are not current product lint policy. */

  return {
    status: issues.filter(i => i.severity === 'error').length === 0 ? 'pass' : 'fail',
    issues,
  };
}

/**
 * 检查 V6 架构设计原则节
 * 校验 design.md "核心设计原则" 节存在 5 条且编号顺序为 1–5，文本匹配 REQ-1.2 列表
 */

/**
 * 检查 V6 架构不做边界节
 * 校验 requirements.md REQ-2 与 design.md "V6 不做边界" 节各自包含 6 项架构层边界
 */

/**
 * 检查 V6 架构北极星目标节
 * 校验"北极星目标"声明存在且列出 10 类排障场景
 */

/**
 * 检查 tasks.md 的结构
 * 每个 task 必须包含 verification_commands 字段
 * V3.7: 对 typed 格式验证类型键合法性，对 legacy 格式添加非阻塞警告
 * 警告: 任务标题应使用 TASK-WI-NNNN-NNN 规范格式
 */
function lintTasks(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = [];

  // Split content into task sections (## headings)
  const taskSections = getTaskSections(content);

  if (taskSections.length === 0) {
    issues.push({
      severity: 'error',
      message: '未找到任何任务章节',
      location: fileName,
    });
    return { status: 'fail', issues };
  }

  const contractValidation = validateTaskArtifactContract(content, {
    allowLegacyCommands: true,
    allowLegacyIds: true,
  });
  for (const issue of contractValidation.issues) {
    issues.push({
      severity: issue.severity,
      message: issue.message,
      location: issue.task_id ? `${fileName}#${issue.task_id}` : fileName,
      errorCode: issue.code,
    });
  }

  // Manual checks are outside task-document/v1 and retain their existing lint.
  for (const section of taskSections) {
    const taskVerification = parseTaskVerification(section.content);

    // Validate manual_verification_checks structure (must be string list)
    if (taskVerification.manualChecks !== undefined) {
      // Accept the field — only validate structure
      if (!Array.isArray(taskVerification.manualChecks)) {
        issues.push({
          severity: 'error',
          message: `任务"${section.title}"的 manual_verification_checks 必须为字符串列表`,
          location: `${fileName}#${section.title}`,
        });
      } else {
        for (let i = 0; i < taskVerification.manualChecks.length; i++) {
          if (typeof taskVerification.manualChecks[i] !== 'string') {
            issues.push({
              severity: 'error',
              message: `任务"${section.title}"的 manual_verification_checks[${i}] 不是字符串`,
              location: `${fileName}#${section.title}`,
            });
          }
        }
      }
    }
  }

  // Check for canonical TASK-WI-NNNN-NNN marker format (warning level)
  if (!hasStandardizedMarkers(content, 'tasks')) {
    issues.push({
      severity: 'warning',
      message: '任务标题未使用规范格式"### TASK-WI-<NNNN>-<NNN> 标题"，治理追溯解析可能失败',
      location: fileName,
    });
  }

  return {
    status: issues.filter(i => i.severity === 'error').length === 0 ? 'pass' : 'fail',
    issues,
  };
}

/**
 * 检查 bugfix.md 的结构
 * 必须包含: 当前行为/Current Behavior, 预期行为/Expected Behavior,
 *           不变行为/Unchanged Behavior, 根因分析/Root Cause Analysis
 */
function lintBugfix(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = [];

  if (!hasHeading(content, ['当前行为', 'current behavior'])) {
    issues.push({
      severity: 'error',
      message: '缺少"当前行为"/"Current Behavior"章节',
      location: fileName,
    });
  }

  if (!hasHeading(content, ['预期行为', 'expected behavior'])) {
    issues.push({
      severity: 'error',
      message: '缺少"预期行为"/"Expected Behavior"章节',
      location: fileName,
    });
  }

  if (!hasHeading(content, ['不变行为', 'unchanged behavior'])) {
    issues.push({
      severity: 'error',
      message: '缺少"不变行为"/"Unchanged Behavior"章节',
      location: fileName,
    });
  }

  if (!hasHeading(content, ['根因分析', 'root cause analysis'])) {
    issues.push({
      severity: 'error',
      message: '缺少"根因分析"/"Root Cause Analysis"章节',
      location: fileName,
    });
  }

  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    issues,
  };
}

// ============================================================
// Helper functions
// ============================================================

function getDocFileName(docType: DocType): string {
  switch (docType) {
    case 'requirements':
      return 'requirements.md';
    case 'design':
      return 'design.md';
    case 'tasks':
      return 'tasks.md';
    case 'bugfix':
      return 'bugfix.md';
  }
}

/**
 * 检查文档中是否包含指定标题（case-insensitive heading search）
 * 匹配 markdown heading 格式: # Title, ## Title, ### Title 等
 */
export function hasHeading(content: string, keywords: string[]): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    // Match markdown headings (# to ######)
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/i);
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase();
      for (const keyword of keywords) {
        if (headingText.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 检查文档是否包含任务拆分内容
 * 匹配: "任务拆分", "Task Breakdown", "## Task" 模式
 */
export function hasTaskBreakdownContent(content: string): boolean {
  const patterns = [/任务拆分/i, /task\s+breakdown/i, /^##\s+task\s/im];
  return patterns.some(pattern => pattern.test(content));
}

/**
 * 从 tasks.md 中提取任务章节
 */
export interface TaskSection {
  title: string;
  content: string;
}

export function getTaskSections(content: string): TaskSection[] {
  return parseTaskSections(content).map(section => ({
    title: section.title,
    content: section.content,
  }));
}

/**
 * 检查任务内容是否包含 verification_commands
 */
export function hasVerificationCommands(content: string): boolean {
  return /verification_commands/i.test(content);
}

/**
 * 检查文档是否包含标准化标记格式
 * - requirements: 至少一个 ### REQ-MODULE-NNN 标题
 * - design: 至少一个 ### DD-MODULE-NNN 标题
 * - tasks: 至少一个 ### TASK-WI-NNNN-NNN 标题
 *
 * 也接受兼容的旧格式（不报 warning）：
 * - requirements: ### 需求 N 或 ### Requirement N
 * - design: ### N.N 标题（数字章节号）
 * - tasks: ## Task N: 或 - [ ] N.
 */
export function hasStandardizedMarkers(
  content: string,
  docType: 'requirements' | 'design' | 'tasks'
): boolean {
  switch (docType) {
    case 'requirements':
      // Canonical REQ-MODULE-NNN, plus read compatibility aliases.
      return /^#{1,6}\s+(?:REQ-(?:[A-Z][A-Z0-9]{1,11}-[0-9]{3}|[0-9]+)|(?:需求|Requirement)\s+\d+)/m.test(
        content
      );
    case 'design':
      // Canonical DD-MODULE-NNN, plus read compatibility aliases.
      return /^#{1,6}\s+(?:DD-(?:[A-Z][A-Z0-9]{1,11}-[0-9]{3}|[0-9]+)|\d+(?:\.\d+)?[.、：:\s]+.+)/m.test(
        content
      );
    case 'tasks':
      // Canonical TASK-WI-NNNN-NNN, plus read compatibility aliases.
      return /(?:^#{1,6}\s+(?:TASK-(?:WI-[0-9]{4}-[0-9]{3}|[0-9]+)|Task\s+\d+)|^-\s+\[[ x~-]\]\s+\d+\.)/m.test(
        content
      );
  }
}

/**
 * 检查 V6 架构发版门槛节
 * 校验 REQ-27.1 的 6 条发版门槛在 requirements.md 与 design.md Testing Strategy §3 中同步存在
 */

/**
 * 检查 V6 架构平台声明节
 * 校验 REQ-28 中 OS 列表、OpenCode 最低版本、运行时、最低/推荐硬件齐全
 */

/**
 * 检查 V6 架构范围列表节
 * 校验 REQ-25 的 P0 列表条目数 = 27、P1 列表条目数 = 15、P2 列表非空
 */
export function checkV6ArchScopeLists(
  content: string,
  fileName: string,
  docType: 'requirements' | 'design'
): DocLintResult {
  const issues: LintIssue[] = [];

  const lines = content.split('\n');

  if (docType === 'requirements') {
    // 在 requirements.md 中查找 REQ-25 节
    let inReq25Section = false;
    let foundReq25Heading = false;

    let currentListType: 'p0' | 'p1' | 'p2' | null = null;
    const p0Items: string[] = [];
    const p1Items: string[] = [];
    const p2Items: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否进入 REQ-25 节
      if (
        line.match(
          /^#{1,6}\s+(?:REQ-25|Requirement\s+25|需求\s*25)[:：]?\s*(?:V6\.0\s+)?开发范围边界.*P0.*P1.*P2/i
        )
      ) {
        foundReq25Heading = true;
        inReq25Section = true;
        continue;
      }

      // 如果找到了 REQ-25 标题但还没进入节，继续查找
      if (!inReq25Section && foundReq25Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inReq25Section = true;
          continue;
        }
      }

      // 如果不在 REQ-25 节中，继续查找
      if (!inReq25Section) {
        continue;
      }

      // 如果遇到下一个同级或更高级标题，退出该节
      if (
        line.match(/^#{1,6}\s+/) &&
        !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)
      ) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/);
        if (currentHeadingMatch) {
          // 假设 REQ-25 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq25Section = false;
            break;
          }
        }
      }

      // 检查 P0/P1/P2 列表标题
      if (line.includes('P0') && line.includes('必做项') && line.includes('27')) {
        currentListType = 'p0';
        continue;
      } else if (line.includes('P1') && line.includes('15')) {
        currentListType = 'p1';
        continue;
      } else if (line.includes('P2') && line.includes('非空')) {
        currentListType = 'p2';
        continue;
      }

      // 在节内查找列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (listItemMatch && currentListType) {
        const itemText = listItemMatch[1].trim();

        // 解析复合列表项：检查是否包含括号和子项计数
        // 例如："基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。"
        const subItemsMatch = itemText.match(/（([^）]+)，共\s*(\d+)\s*项[）)]/);
        if (subItemsMatch) {
          // 提取子项数量
          const subItemCount = parseInt(subItemsMatch[2], 10);
          // 根据当前列表类型添加相应数量的项
          if (currentListType === 'p0') {
            for (let i = 0; i < subItemCount; i++) {
              p0Items.push(`${itemText} [子项 ${i + 1}/${subItemCount}]`);
            }
          } else if (currentListType === 'p1') {
            for (let i = 0; i < subItemCount; i++) {
              p1Items.push(`${itemText} [子项 ${i + 1}/${subItemCount}]`);
            }
          } else if (currentListType === 'p2') {
            for (let i = 0; i < subItemCount; i++) {
              p2Items.push(`${itemText} [子项 ${i + 1}/${subItemCount}]`);
            }
          }
        } else {
          // 普通列表项
          // P1/P2 的每一行列表项计为 1 项（括号内的描述不拆分）
          // P0 的普通列表项（无"共 N 项"标记）也计为 1 项
          if (currentListType === 'p0') {
            p0Items.push(itemText);
          } else if (currentListType === 'p1') {
            p1Items.push(itemText);
          } else if (currentListType === 'p2') {
            p2Items.push(itemText);
          }
        }
      }

      // 检查分组标题（如"基础设施"、"核心能力"等）并重置计数
      // 这些标题通常以" - "开头或包含括号
      if (
        line.includes('基础设施') ||
        line.includes('核心能力') ||
        line.includes('可观测性基础') ||
        line.includes('扩展机制骨架') ||
        line.includes('分发')
      ) {
        // 这些是 P0 的分组标题，不重置 currentListType
        continue;
      }

      // 如果遇到空行，可能表示列表结束，但不重置 currentListType
      // 因为 P0/P1/P2 列表可能包含多个分组
    }

    // 检查是否找到 REQ-25 节
    if (!foundReq25Heading) {
      issues.push({
        severity: 'error',
        message: '缺少 REQ-25 "V6.0 开发范围边界（P0 / P1 / P2）" 节',
        location: fileName,
        errorCode: 'v6_arch_missing_scope_lists',
      });
      return { status: 'fail', issues };
    }

    // 检查 P0 列表条目数是否为 27
    if (p0Items.length !== 27) {
      issues.push({
        severity: 'error',
        message: `REQ-25 P0 列表应包含27项，实际找到${p0Items.length}项`,
        location: fileName,
        errorCode: 'v6_arch_missing_scope_lists',
      });
    }

    // 检查 P1 列表条目数是否为 15
    if (p1Items.length !== 15) {
      issues.push({
        severity: 'error',
        message: `REQ-25 P1 列表应包含15项，实际找到${p1Items.length}项`,
        location: fileName,
        errorCode: 'v6_arch_missing_scope_lists',
      });
    }

    // 检查 P2 列表是否非空
    if (p2Items.length === 0) {
      issues.push({
        severity: 'error',
        message: 'REQ-25 P2 列表应为非空',
        location: fileName,
        errorCode: 'v6_arch_missing_scope_lists',
      });
    }

    if (issues.length > 0) {
      return { status: 'fail', issues };
    }
  } else if (docType === 'design') {
    // 在 design.md 中，REQ-25 的验证可能在不同位置
    // 根据 design.md 的"本文档自身的验收检查"节，REQ-25 应该被引用
    let foundReq25Reference = false;
    let inSelfCheckSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否进入"本文档自身的验收检查"节
      if (line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        inSelfCheckSection = true;
        continue;
      }

      // 如果不在该节中，继续查找
      if (!inSelfCheckSection) {
        continue;
      }

      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/);
        if (currentHeadingMatch) {
          // 假设该节是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inSelfCheckSection = false;
            break;
          }
        }
      }

      // 检查是否包含 REQ-25 引用
      if (
        line.includes('REQ-25') ||
        line.includes('P0') ||
        line.includes('P1') ||
        line.includes('P2') ||
        line.includes('范围边界')
      ) {
        foundReq25Reference = true;
        // 检查是否包含关键要素关键词
        let hasKeyElements = line.includes('27') || line.includes('15') || line.includes('非空');

        if (!hasKeyElements) {
          // 检查后续行是否包含要素
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j];
            if (nextLine.includes('27') || nextLine.includes('15') || nextLine.includes('非空')) {
              hasKeyElements = true;
              break;
            }
          }
        }

        if (!hasKeyElements) {
          issues.push({
            severity: 'warning',
            message: 'design.md 中 REQ-25 引用缺少具体的范围边界细节（P0=27项、P1=15项、P2非空）',
            location: fileName,
            errorCode: 'v6_arch_missing_scope_lists',
          });
        }
        break;
      }
    }

    // 检查是否找到 REQ-25 引用（非强制，因为 design.md 可能不直接包含范围列表）
    if (!foundReq25Reference) {
      issues.push({
        severity: 'warning',
        message: 'design.md 中未找到 REQ-25 "V6.0 开发范围边界" 的明确引用',
        location: fileName,
        errorCode: 'v6_arch_missing_scope_lists',
      });
    }
  }

  return { status: 'pass', issues };
}
/**
 * 检查 V6 架构里程碑节
 * 校验 REQ-29 中每个里程碑有明确主题；允许数量偏离 9 但必须文档化
 */

/**
 * 检查 V6 架构 Agent Constitution 节
 * 校验 requirements.md Glossary 引用 Agent Constitution 9 条底线（或 design.md §4 "Agent Constitution 9 条"），
 * 且至少显式包含"不得绕过 Gate"与"不得伪造验证"
 */
export function checkV6ArchAgentConstitution(
  content: string,
  fileName: string,
  docType: 'requirements' | 'design'
): DocLintResult {
  const issues: LintIssue[] = [];

  const lines = content.split('\n');

  // 必须包含的两条底线
  const requiredRules = ['不得绕过 Gate', '不得伪造验证'];

  // design.md 中实际的规则文本（第二条是"不得伪造验证结果"）
  const designRequiredRules = ['不得绕过 Gate', '不得伪造验证结果'];

  if (docType === 'requirements') {
    // 在 requirements.md 中，检查 Glossary 部分是否引用 Agent Constitution
    let inGlossarySection = false;
    let foundAgentConstitutionEntry = false;
    const foundRequiredRules: string[] = [];
    let mentionsNineRules = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否进入 Glossary 节
      if (line.match(/^#{1,6}\s+(?:术语表|Glossary)/i)) {
        inGlossarySection = true;
        continue;
      }

      // 如果不在 Glossary 节中，继续查找
      if (!inGlossarySection) {
        continue;
      }

      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:术语表|Glossary)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/);
        if (currentHeadingMatch) {
          // 假设 Glossary 是二级标题（##），如果遇到二级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 2) {
            inGlossarySection = false;
            break;
          }
        }
      }

      // 检查是否包含 Agent Constitution 词条
      if (line.includes('Agent Constitution') || line.includes('Agent Constitution')) {
        foundAgentConstitutionEntry = true;

        // 检查是否提到"9条"或"9 条"
        if (
          line.includes('9条') ||
          line.includes('9 条') ||
          line.includes('9条底线') ||
          line.includes('9 条底线')
        ) {
          mentionsNineRules = true;
        }

        // 检查是否包含必须的两条底线
        for (const rule of requiredRules) {
          if (line.includes(rule)) {
            foundRequiredRules.push(rule);
          }
        }

        // 检查后续行是否包含底线和"9条"引用
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];

          // 检查是否提到"9条"
          if (
            !mentionsNineRules &&
            (nextLine.includes('9条') ||
              nextLine.includes('9 条') ||
              nextLine.includes('9条底线') ||
              nextLine.includes('9 条底线'))
          ) {
            mentionsNineRules = true;
          }

          for (const rule of requiredRules) {
            if (nextLine.includes(rule) && !foundRequiredRules.includes(rule)) {
              foundRequiredRules.push(rule);
            }
          }
        }
      }
    }

    // 检查是否找到 Agent Constitution 词条
    if (!foundAgentConstitutionEntry) {
      issues.push({
        severity: 'error',
        message: 'Glossary 中缺少 "Agent Constitution" 词条引用',
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }

    // 检查是否提到"9条"底线
    if (!mentionsNineRules) {
      issues.push({
        severity: 'error',
        message: 'Agent Constitution 词条未明确引用"9条"或"9 条"底线',
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }

    // 检查是否包含所有必须的底线
    const missingRules = requiredRules.filter(rule => !foundRequiredRules.includes(rule));
    if (missingRules.length > 0) {
      issues.push({
        severity: 'error',
        message: `Agent Constitution 引用缺少必须的底线：${missingRules.join('、')}`,
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }
  } else if (docType === 'design') {
    // 在 design.md 中，检查 §4 "Agent Constitution 9 条" 节
    let inAgentConstitutionSection = false;
    let foundSectionHeading = false;
    const foundRequiredRules: string[] = [];
    const rulesFound: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否进入 "Agent Constitution 9 条" 节
      // 设计文档中该节可能以加粗文本形式出现：**Agent Constitution 9 条**
      if (
        line.match(/\*\*Agent\s+Constitution\s+9\s+条\*\*/i) ||
        line.match(/^#{1,6}\s+Agent\s+Constitution\s+9\s+条/i) ||
        line.match(/^#{1,6}\s+.*Agent\s+Constitution.*/i)
      ) {
        foundSectionHeading = true;
        inAgentConstitutionSection = true;
        continue;
      }

      // 如果不在该节中，继续查找
      if (!inAgentConstitutionSection) {
        continue;
      }

      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+Agent\s+Constitution/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/);
        if (currentHeadingMatch) {
          // 假设 "Agent Constitution 9 条" 是四级标题（####），如果遇到四级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 4) {
            inAgentConstitutionSection = false;
            break;
          }
        }
      }

      // 在节内查找编号列表项（1. 2. 3. ...，允许行首有空格）
      const listItemMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (listItemMatch) {
        const ruleText = listItemMatch[2].trim();
        rulesFound.push(ruleText);

        // 检查是否包含必须的底线（使用design.md中的实际文本）
        for (const rule of designRequiredRules) {
          if (ruleText.includes(rule) && !foundRequiredRules.includes(rule)) {
            foundRequiredRules.push(rule);
          }
        }
      } else if (rulesFound.length > 0 && line.trim() !== '' && !line.match(/^#{1,6}\s+/)) {
        // 继续收集多行规则文本（如果当前行不是空行也不是标题）
        const lastRuleIndex = rulesFound.length - 1;
        rulesFound[lastRuleIndex] += ' ' + line.trim();

        // 再次检查是否包含必须的底线（针对多行规则，使用design.md中的实际文本）
        for (const rule of designRequiredRules) {
          if (rulesFound[lastRuleIndex].includes(rule) && !foundRequiredRules.includes(rule)) {
            foundRequiredRules.push(rule);
          }
        }
      }
    }

    // 检查是否找到 "Agent Constitution 9 条" 节
    if (!foundSectionHeading) {
      issues.push({
        severity: 'error',
        message: '缺少 "Agent Constitution 9 条" 节',
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }

    // 检查是否找到至少一条规则
    if (rulesFound.length === 0) {
      issues.push({
        severity: 'error',
        message: '"Agent Constitution 9 条" 节中未找到任何规则定义',
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }

    // 检查规则数量是否为9（可选检查，根据设计文档应该有9条）
    if (rulesFound.length !== 9) {
      issues.push({
        severity: 'warning',
        message: `"Agent Constitution 9 条" 节中找到 ${rulesFound.length} 条规则，预期为9条`,
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
    }

    // 检查是否包含所有必须的底线（对于design.md，使用designRequiredRules）
    const missingRules = designRequiredRules.filter(rule => !foundRequiredRules.includes(rule));
    if (missingRules.length > 0) {
      // 将"不得伪造验证结果"转换为更通用的"不得伪造验证"用于错误消息
      const displayMissingRules = missingRules.map(rule =>
        rule === '不得伪造验证结果' ? '不得伪造验证' : rule
      );
      issues.push({
        severity: 'error',
        message: `Agent Constitution 缺少必须的底线：${displayMissingRules.join('、')}`,
        location: fileName,
        errorCode: 'v6_arch_missing_agent_constitution',
      });
      return { status: 'fail', issues };
    }
  }

  return { status: 'pass', issues };
}

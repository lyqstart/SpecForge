/**
 * sf_requirements_gate 核心逻辑
 * 检查 requirements.md 或 bugfix.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 1.5, 8.3, 8.4, 20.1, 20.2, 20.4, 11.1, 11.5, 11.6, 2.6, 3.6, 5.6
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core";
import { tryCheckCompatibility, logErrorToFile } from "./utils";
import { parseAllVerificationStrategies } from "./sf_verification_types";
import { resolveRequirementsPath, checkEarsCompliance } from "./sf_ears_parser";
import { FILE_SIZE_LIMIT } from "./sf_ears_types";
import type { SyncSummary } from "./sf_knowledge_graph_core";
import type { GateResult, GateModeSpec } from "./sf_gate_types";

const SPEC_DIR_NAME = ".specforge" as const;

// 向后兼容 re-export：现有消费方可继续从此文件导入
export type { GateResult, SyncSummary } from "./sf_gate_types";
export type { GateModeSpec } from "./sf_gate_types";

/**
 * Requirements Gate 支持的 mode 类型
 */
export type RequirementsGateMode =
  | "change_request"
  | "refactor"
  | "investigation";

async function readFirstAvailable(paths: string[]): Promise<string | null> {
  for (const candidatePath of paths) {
    try {
      return await readFile(candidatePath, "utf-8");
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

// ============================================================
// Gate Mode Strategy Table
// ============================================================

/**
 * 检查 impact_analysis.md 内容（change_request mode）
 * pass 条件：所有 section 非空，风险评估为合法值（高/中/低）
 */
export function checkImpactAnalysisContent(
  _content: string,
  sections: Record<string, string>,
): GateResult {
  const validRiskLevels = ["高", "中", "低"];
  const riskValue = sections["风险评估"]?.trim();
  if (!validRiskLevels.includes(riskValue)) {
    return {
      status: "fail",
      blocking_issues: [
        `风险评估值不合法（当前值: "${riskValue}"），合法值: 高/中/低`,
      ],
      warnings: [],
      next_action: "revise",
    };
  }
  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  };
}

/**
 * 检查 refactor_analysis.md 内容（refactor mode）
 * pass 条件：所有 section 非空，不变行为声明明确（非模糊表述）
 */
export function checkRefactorAnalysisContent(
  _content: string,
  sections: Record<string, string>,
): GateResult {
  const invariantDeclaration = sections["不变行为声明"]?.trim();
  // 不变行为声明必须明确：不能只是"无"、"N/A"、"待定"等模糊表述
  const vaguePatterns = [
    /^无$/i,
    /^n\/?a$/i,
    /^待定$/i,
    /^tbd$/i,
    /^none$/i,
    /^未定$/i,
  ];
  if (vaguePatterns.some((p) => p.test(invariantDeclaration))) {
    return {
      status: "fail",
      blocking_issues: [
        '不变行为声明不明确（不能为"无"、"N/A"、"待定"等模糊表述）',
      ],
      warnings: [],
      next_action: "revise",
    };
  }
  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  };
}

/**
 * 检查 investigation_plan.md 内容（investigation mode）
 * pass 条件：所有 section 非空（轻量级检查）
 */
export function checkInvestigationPlanContent(
  content: string,
  sections: Record<string, string>,
): GateResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const hypothesisSection = sections["候选假设"] ?? "";
  const hypothesisIds = Array.from(
    new Set(
      Array.from(hypothesisSection.matchAll(/\bH\d+\b/gi), (match) =>
        match[0].toUpperCase(),
      ),
    ),
  );

  if (
    hypothesisIds.length < 2 &&
    !/不存在第二个合理假设|single[- ]hypothesis exception/i.test(
      hypothesisSection,
    )
  ) {
    blockingIssues.push(
      "调查计划必须包含至少两个合理竞争假设，或明确证明客观上不存在第二个合理假设",
    );
  }

  const currentState = sections["当前状态与调用链"] ?? "";
  if (
    !/(入口|调用链|caller|callee|状态权威|数据流)/i.test(currentState) ||
    !/(→|->|=>|\|)/.test(currentState)
  ) {
    blockingIssues.push(
      "当前状态与调用链必须给出真实入口、调用关系或状态流转，而不是只列文件名",
    );
  }

  const facts = sections["已知事实与未知项"] ?? "";
  if (
    !/CODE_OBSERVED/.test(facts) ||
    !/(RUNTIME_OBSERVED|ENV_OBSERVED|HISTORY_OBSERVED)/.test(facts)
  ) {
    blockingIssues.push(
      "已知事实与未知项必须使用 CODE_OBSERVED，并至少包含一种运行时、环境或历史观察证据",
    );
  }
  if (!/(ASSUMPTION|UNKNOWN)/.test(facts)) {
    blockingIssues.push(
      "已知事实与未知项必须显式标注 ASSUMPTION 或 UNKNOWN，禁止把未验证内容写成事实",
    );
  }

  const premise = sections["问题前提与观察者影响"] ?? "";
  const premiseStatuses = Array.from(
    new Set(
      Array.from(
        premise.matchAll(
          /\b(PREMISE_REPRODUCED|PREMISE_HISTORICALLY_EVIDENCED|PREMISE_CONTRADICTED|PREMISE_NOT_REPRODUCED)\b/g,
        ),
        (match) => match[1],
      ),
    ),
  );
  if (premiseStatuses.length !== 1) {
    blockingIssues.push(
      "问题前提与观察者影响必须且只能声明一个合法 PREMISE 状态",
    );
  }
  const observerEffectStatuses = Array.from(
    new Set(
      Array.from(
        premise.matchAll(
          /\b(OBSERVER_EFFECT_NONE|OBSERVER_EFFECT_CONTROLLED|OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE|OBSERVER_EFFECT_UNKNOWN)\b/g,
        ),
        (match) => match[1],
      ),
    ),
  );
  if (observerEffectStatuses.length !== 1) {
    blockingIssues.push(
      "问题前提与观察者影响必须且只能声明一个合法 OBSERVER_EFFECT 状态",
    );
  }

  const originalEvidence = sections["原始证据来源"] ?? "";
  if (
    /(AGENT_CLAIM|UNVERIFIED_REPORT|INVESTIGATION_LEAD)/.test(
      originalEvidence,
    ) &&
    !/(源码|配置|原始日志|调用栈|命令输出|events\.jsonl|commit|diff|tag|文件系统|截图|完整会话|一级原始证据|primary evidence)/i.test(
      originalEvidence,
    )
  ) {
    blockingIssues.push(
      "其他 Agent 的转述只能作为线索；原始证据来源必须包含独立读取的一级证据或可回溯派生证据",
    );
  }
  if (
    !/(源码|配置|原始日志|调用栈|命令输出|events\.jsonl|commit|diff|tag|文件系统|截图|完整会话|一级原始证据|primary evidence)/i.test(
      originalEvidence,
    )
  ) {
    blockingIssues.push(
      "原始证据来源必须列出源码、配置、原始日志/调用栈、命令输出、StateManager events、Git 对象、文件系统现场或用户原始材料",
    );
  }

  const methods = sections["验证与反证方法"] ?? "";
  if (
    !/(验证|experiment|check|test)/i.test(methods) ||
    !/(反证|推翻|排除|falsif)/i.test(methods)
  ) {
    blockingIssues.push("验证与反证方法必须同时说明如何支持和如何推翻主要假设");
  }
  for (const id of hypothesisIds) {
    if (!new RegExp(`\\b${id}\\b`, "i").test(methods)) {
      blockingIssues.push(`验证与反证方法未覆盖候选假设 ${id}`);
    }
  }

  const evidencePlan = sections["证据计划"] ?? "";
  if (
    !/(命令|日志|调用栈|状态快照|Git|提交|路径|文件|证据 ID|EV-)/i.test(
      evidencePlan,
    )
  ) {
    blockingIssues.push(
      "证据计划必须列出可执行命令、日志、状态快照、历史或文件路径等可回溯证据来源",
    );
  }

  const rootCriteria = sections["根因判定标准"] ?? "";
  if (
    !/ROOT_CAUSE_CONFIRMED/.test(rootCriteria) ||
    !/(首次偏离点|竞争假设|因果链|关键 UNKNOWN|PREMISE_)/.test(rootCriteria)
  ) {
    blockingIssues.push(
      "根因判定标准必须包含 ROOT_CAUSE_CONFIRMED 及首次偏离点、竞争假设、因果链和关键 UNKNOWN 条件",
    );
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
      details: {
        hypothesis_ids: hypothesisIds,
        premise_statuses: premiseStatuses,
        observer_effect_statuses: observerEffectStatuses,
      },
    };
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    details: {
      hypothesis_ids: hypothesisIds,
      premise_statuses: premiseStatuses,
      observer_effect_statuses: observerEffectStatuses,
    },
  };
}

/**
 * Requirements Gate 策略表
 * 定义 3 种 mode 的检查规则
 */
export const REQUIREMENTS_GATE_SPECS: GateModeSpec[] = [
  {
    mode: "change_request",
    targetFile: "impact_analysis.md",
    requiredSections: ["变更范围", "风险评估", "回归测试范围", "KG 关联"],
    checkFn: checkImpactAnalysisContent,
  },
  {
    mode: "refactor",
    targetFile: "refactor_analysis.md",
    requiredSections: ["代码问题识别", "重构目标", "不变行为声明", "风险评估"],
    checkFn: checkRefactorAnalysisContent,
  },
  {
    mode: "investigation",
    targetFile: "investigation_plan.md",
    requiredSections: [
      "调查问题与完成标准",
      "当前状态与调用链",
      "调查范围",
      "已知事实与未知项",
      "问题前提与观察者影响",
      "原始证据来源",
      "候选假设",
      "验证与反证方法",
      "证据计划",
      "根因判定标准",
      "预期产出",
    ],
    checkFn: checkInvestigationPlanContent,
  },
];

// ============================================================
// Section Parsing
// ============================================================

/**
 * 从 Markdown 内容中解析指定 sections
 * 匹配 ## 或 ### 标题，提取标题下的内容直到下一个同级或更高级标题
 */
export function parseSections(
  content: string,
  requiredSections: string[],
): Record<string, string> {
  const sections: Record<string, string> = Object.create(null);
  for (const sectionName of requiredSections) {
    // 转义正则特殊字符
    const escapedName = escapeRegExp(sectionName);
    const pattern = new RegExp(`^#{2,3}\\s*${escapedName}\\s*$`, "im");
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index + match[0].length;
      // 找到下一个同级或更高级标题（h1/h2），不截断 h3 子标题
      const nextHeadingPattern = /^#{1,2}\s+/m;
      const remaining = content.slice(startIdx);
      const nextMatch = nextHeadingPattern.exec(remaining);
      const sectionContent = nextMatch
        ? remaining.slice(0, nextMatch.index).trim()
        : remaining.trim();
      sections[sectionName] = sectionContent;
    } else {
      sections[sectionName] = "";
    }
  }
  return sections;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 requirements gate 检查
 *
 * 检查项（默认模式，无 mode 参数）：
 * 1. requirements.md 是否存在
 * 2. 是否包含用户故事（"用户故事" / "User Story" / "作为"）
 * 3. 是否包含验收标准（"验收标准" / "Acceptance Criteria"）
 * 4. 是否包含术语表（"术语表" / "Glossary"）
 *
 * 当传入 mode 参数时，按 REQUIREMENTS_GATE_SPECS 策略表执行对应检查。
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @param options - 可选参数，包含 mode 字段
 * @returns Gate 检查结果
 */
export async function checkRequirementsGate(
  workItemId: string,
  baseDir: string,
  options?: { mode?: RequirementsGateMode },
): Promise<GateResult> {
  try {
    // V3.4.0: 版本兼容性检查（动态导入，失败时静默跳过）
    await tryCheckCompatibility(baseDir, "sf_requirements_gate_core");

    const mode = options?.mode;

    // 无 mode：现有行为（向后兼容）
    if (mode === undefined) {
      return await existingRequirementsGateCheck(workItemId, baseDir);
    }

    // 查找策略表
    const spec = REQUIREMENTS_GATE_SPECS.find((s) => s.mode === mode);
    if (spec === undefined) {
      return {
        status: "fail",
        blocking_issues: [],
        warnings: [`Unsupported mode: "${mode}"`],
        next_action: "ask_user",
      };
    }

    // 现代 work-items 路径优先；旧 specs 路径只作只读兼容回退。
    let content: string | null;
    try {
      content = await readFirstAvailable([
        join(baseDir, SPEC_DIR_NAME, "work-items", workItemId, spec.targetFile),
        join(baseDir, SPEC_DIR_NAME, "specs", workItemId, spec.targetFile),
      ]);
    } catch (err: unknown) {
      return {
        status: "blocked",
        blocking_issues: [
          `Failed to read ${spec.targetFile}: ${(err as Error).message}`,
        ],
        warnings: [],
        next_action: "ask_user",
      };
    }
    if (content === null) {
      return {
        status: "fail",
        blocking_issues: [`File not found: ${spec.targetFile}`],
        warnings: [],
        next_action: "revise",
      };
    }

    // 解析 sections 并检查完整性
    const sections = parseSections(content, spec.requiredSections);
    const missing = spec.requiredSections.filter((s) => !sections[s]?.trim());
    if (missing.length > 0) {
      return {
        status: "fail",
        blocking_issues: missing.map((s) => `Missing section: ${s}`),
        warnings: [],
        next_action: "revise",
      };
    }

    // 调用 mode 特定的检查函数
    return spec.checkFn(content, sections);
  } catch (err) {
    await logErrorToFile(
      baseDir,
      "sf_requirements_gate_core",
      "checkRequirementsGate",
      err,
    );
    throw err;
  }
}

/**
 * 现有 requirements gate 检查逻辑（无 mode 参数时的默认行为）
 * 提取为独立函数以保持向后兼容
 */
async function existingRequirementsGateCheck(
  workItemId: string,
  baseDir: string,
): Promise<GateResult> {
  const specDir = join(baseDir, SPEC_DIR_NAME, "specs", workItemId);
  const docPath = join(specDir, "requirements.md");

  // 1. 读取 requirements.md
  let content: string;
  try {
    content = await readFile(docPath, "utf-8");
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: ["requirements.md not found"],
        warnings: [],
        next_action: "revise",
      };
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read requirements.md: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    };
  }

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  // 2. 检查用户故事
  if (!hasUserStories(content)) {
    blockingIssues.push('缺少用户故事（"用户故事" / "User Story" / "作为"）');
  }

  // 3. 检查验收标准
  if (!hasAcceptanceCriteria(content)) {
    blockingIssues.push('缺少验收标准（"验收标准" / "Acceptance Criteria"）');
  }

  // 4. 检查术语表
  if (!hasGlossary(content)) {
    blockingIssues.push('缺少术语表（"术语表" / "Glossary"）');
  }

  // 5. V3.7: 检查 verification_strategy 字段合法性
  const strategyResults = parseAllVerificationStrategies(content);
  for (const [reqId, result] of strategyResults) {
    for (const error of result.errors) {
      blockingIssues.push(`${reqId}: ${error}`);
    }
    for (const warning of result.warnings) {
      warnings.push(`${reqId}: ${warning}`);
    }
  }

  // 6. V3.7+: EARS Format Validation
  // Step 6a: Resolve requirements path safely
  const pathResult = resolveRequirementsPath("requirements.md", specDir);
  if (!pathResult.ok) {
    blockingIssues.push(pathResult.error);
  } else {
    // Step 6b: Check file size
    if (content.length > FILE_SIZE_LIMIT) {
      blockingIssues.push(
        `Requirements file exceeds size limit (${FILE_SIZE_LIMIT} bytes)`,
      );
    } else {
      // Step 6c: Execute EARS compliance check
      const earsResult = checkEarsCompliance(content);
      blockingIssues.push(...earsResult.blocking_issues);
      warnings.push(...earsResult.warnings);
    }
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    };
  }

  // ★ V4.0: KG sync on pass
  let kgSync: SyncSummary | null = null;
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, "requirements");
      if (kgResult.success && kgResult.summary) {
        kgSync = kgResult.summary;
      } else if (kgResult.error) {
        warnings.push(`KG sync warning: ${kgResult.error}`);
      }
    }
  } catch (err) {
    warnings.push(`KG sync failed: ${(err as Error).message}`);
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    kg_sync: kgSync,
  };
}

// ============================================================
// Helper functions
// ============================================================

/**
 * 检查是否包含用户故事内容
 * 匹配: "用户故事", "User Story", "作为"（作为...我希望...以便...）
 */
export function hasUserStories(content: string): boolean {
  const patterns = [/用户故事/i, /user\s+stor/i, /作为/i];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 检查是否包含验收标准
 * 匹配: "验收标准", "Acceptance Criteria"
 */
export function hasAcceptanceCriteria(content: string): boolean {
  const patterns = [/验收标准/i, /acceptance\s+criteria/i];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 检查是否包含术语表
 * 匹配: "术语表", "Glossary"
 */
export function hasGlossary(content: string): boolean {
  const patterns = [/术语表/i, /glossary/i];
  return patterns.some((pattern) => pattern.test(content));
}

// ============================================================
// Bugfix Gate Logic
// ============================================================

/**
 * 执行 bugfix gate 检查
 *
 * 检查项：
 * 1. bugfix.md 是否存在
 * 2. 是否包含当前行为（"当前行为" / "Current Behavior"）
 * 3. 是否包含预期行为（"预期行为" / "Expected Behavior"）
 * 4. 是否包含不变行为（"不变行为" / "Unchanged Behavior"）
 * 5. 是否包含根因分析（"根因分析" / "Root Cause Analysis"）
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkBugfixGate(
  workItemId: string,
  baseDir: string,
): Promise<GateResult> {
  try {
    // V3.4.0: 版本兼容性检查（动态导入，失败时静默跳过）
    await tryCheckCompatibility(baseDir, "sf_requirements_gate_core");

    const specDir = join(baseDir, SPEC_DIR_NAME, "specs", workItemId);
    const docPath = join(specDir, "bugfix.md");

    // 1. 读取 bugfix.md
    let content: string;
    try {
      content = await readFile(docPath, "utf-8");
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return {
          status: "fail",
          blocking_issues: ["bugfix.md not found"],
          warnings: [],
          next_action: "revise",
        };
      }
      return {
        status: "blocked",
        blocking_issues: [`Failed to read bugfix.md: ${error.message}`],
        warnings: [],
        next_action: "ask_user",
      };
    }

    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    // 2. 检查当前行为
    if (!hasCurrentBehavior(content)) {
      blockingIssues.push('缺少当前行为（"当前行为" / "Current Behavior"）');
    }

    // 3. 检查预期行为
    if (!hasExpectedBehavior(content)) {
      blockingIssues.push('缺少预期行为（"预期行为" / "Expected Behavior"）');
    }

    // 4. 检查不变行为
    if (!hasUnchangedBehavior(content)) {
      blockingIssues.push('缺少不变行为（"不变行为" / "Unchanged Behavior"）');
    }

    // 5. 检查根因分析
    if (!hasRootCauseAnalysis(content)) {
      blockingIssues.push('缺少根因分析（"根因分析" / "Root Cause Analysis"）');
    }

    if (blockingIssues.length > 0) {
      return {
        status: "fail",
        blocking_issues: blockingIssues,
        warnings,
        next_action: "revise",
      };
    }

    // ★ V4.0: KG sync on pass
    let kgSync: SyncSummary | null = null;
    try {
      if (await isKGEnabled(baseDir)) {
        const kgResult = await syncFromSpec(
          workItemId,
          baseDir,
          "requirements",
        );
        if (kgResult.success && kgResult.summary) {
          kgSync = kgResult.summary;
        } else if (kgResult.error) {
          warnings.push(`KG sync warning: ${kgResult.error}`);
        }
      }
    } catch (err) {
      warnings.push(`KG sync failed: ${(err as Error).message}`);
    }

    return {
      status: "pass",
      blocking_issues: [],
      warnings,
      next_action: "continue",
      kg_sync: kgSync,
    };
  } catch (err) {
    await logErrorToFile(
      baseDir,
      "sf_requirements_gate_core",
      "checkBugfixGate",
      err,
    );
    throw err;
  }
}

// ============================================================
// Bugfix Helper functions
// ============================================================

/**
 * 检查是否包含当前行为
 * 匹配: "当前行为", "Current Behavior"
 */
export function hasCurrentBehavior(content: string): boolean {
  const patterns = [/当前行为/i, /current\s+behavior/i];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 检查是否包含预期行为
 * 匹配: "预期行为", "Expected Behavior"
 */
export function hasExpectedBehavior(content: string): boolean {
  const patterns = [/预期行为/i, /expected\s+behavior/i];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 检查是否包含不变行为
 * 匹配: "不变行为", "Unchanged Behavior"
 */
export function hasUnchangedBehavior(content: string): boolean {
  const patterns = [/不变行为/i, /unchanged\s+behavior/i];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 检查是否包含根因分析
 * 匹配: "根因分析", "Root Cause Analysis"
 */
export function hasRootCauseAnalysis(content: string): boolean {
  const patterns = [/根因分析/i, /root\s+cause\s+analysis/i];
  return patterns.some((pattern) => pattern.test(content));
}

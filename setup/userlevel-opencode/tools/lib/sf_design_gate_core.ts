/**
 * sf_design_gate 核心逻辑
 * 检查 design.md 及既有设计类产物是否满足最低质量标准。
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）。
 *
 * Requirements: 8.3, 8.5, 11.2, 11.5, 11.6, 2.8, 3.7, 3.8, 4.6, 5.9
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GateResult, GateModeSpec } from "./sf_gate_types";
import { parseSections } from "./sf_requirements_gate_core";
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core";
import { tryCheckCompatibility, logErrorToFile } from "./utils";
import { isValidVerificationType } from "./sf_verification_types";
import type { SyncSummary } from "./sf_knowledge_graph_core";

const SPEC_DIR_NAME = ".specforge";

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

// Re-export GateResult for convenience
export type { GateResult };

// ============================================================
// Design Governance Types and Rules
// ============================================================

export type DesignAnalysisScope = "solution_design" | "system_governance";
export type CapabilityVerdict =
  | "reuse_existing"
  | "extend_existing"
  | "new_capability_required"
  | "blocked";

export const SYSTEM_GOVERNANCE_SECTIONS = [
  "Problem Understanding",
  "Existing Architecture Analysis",
  "Governance Classification",
  "Existing Capability Assessment",
  "Solution Strategy",
  "Impact Analysis",
  "Verification Plan",
] as const;

const SYSTEM_GOVERNANCE_SCOPE_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?analysis_scope(?:\*\*)?\s*:\s*system_governance\s*$/im;
const CAPABILITY_VERDICT_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?capability_verdict(?:\*\*)?\s*:\s*(reuse_existing|extend_existing|new_capability_required|blocked)\s*$/im;
const NEW_CAPABILITY_JUSTIFICATION_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?new_capability_justification(?:\*\*)?\s*:\s*(.+)\s*$/im;

const SYSTEM_GOVERNANCE_WORKFLOW_PATHS = new Set([
  "architecture_change_path",
  "design_change_path",
]);
const CHANGE_CLASSIFICATION_BOOLEAN_KEYS = [
  "requirement_changed",
  "acceptance_criteria_changed",
  "business_rule_changed",
  "user_visible_behavior_changed",
  "data_semantics_changed",
  "design_changed",
  "module_boundary_changed",
  "api_contract_changed",
  "architecture_changed",
] as const;
const SYSTEM_GOVERNANCE_CLASSIFICATION_KEYS = [
  "business_rule_changed",
  "data_semantics_changed",
  "design_changed",
  "module_boundary_changed",
  "api_contract_changed",
  "architecture_changed",
] as const;

export interface SystemGovernanceRequirement {
  required: boolean;
  reasons: string[];
  source_path?: string;
  blocking_issue?: string;
}

/**
 * 根据现有 trigger_result.json 中的治理事实判断是否必须进入 system_governance。
 * 该判断不依赖 Design Agent 是否主动声明 analysis_scope，避免自声明绕过 Gate。
 */
export function evaluateSystemGovernanceRequirement(
  triggerResult: unknown,
): SystemGovernanceRequirement {
  if (typeof triggerResult !== "object" || triggerResult === null) {
    return {
      required: false,
      reasons: [],
      blocking_issue: "trigger_result.json 必须是 JSON 对象",
    };
  }

  const trigger = triggerResult as {
    workflow_path?: unknown;
    classification?: unknown;
  };
  const reasons: string[] = [];

  if (
    typeof trigger.workflow_path !== "string" ||
    trigger.workflow_path.trim().length === 0
  ) {
    return {
      required: false,
      reasons: [],
      blocking_issue: "trigger_result.json 缺少有效 workflow_path",
    };
  }

  if (
    typeof trigger.classification !== "object" ||
    trigger.classification === null
  ) {
    return {
      required: false,
      reasons: [],
      blocking_issue: "trigger_result.json 缺少有效 classification",
    };
  }

  const classification = trigger.classification as Record<string, unknown>;
  const invalidBooleanKeys = CHANGE_CLASSIFICATION_BOOLEAN_KEYS.filter(
    (key) => typeof classification[key] !== "boolean",
  );
  if (
    invalidBooleanKeys.length > 0 ||
    !Array.isArray(classification.unknowns)
  ) {
    const invalidFields = [
      ...invalidBooleanKeys.map((key) => `classification.${key}`),
      ...(!Array.isArray(classification.unknowns)
        ? ["classification.unknowns"]
        : []),
    ];
    return {
      required: false,
      reasons: [],
      blocking_issue: `trigger_result.json classification 不完整或类型错误: ${invalidFields.join(", ")}`,
    };
  }

  if (SYSTEM_GOVERNANCE_WORKFLOW_PATHS.has(trigger.workflow_path)) {
    reasons.push(`workflow_path=${trigger.workflow_path}`);
  }

  for (const key of SYSTEM_GOVERNANCE_CLASSIFICATION_KEYS) {
    if (classification[key] === true) {
      reasons.push(`classification.${key}=true`);
    }
  }

  const unknowns = classification.unknowns as unknown[];
  if (unknowns.length > 0) {
    reasons.push(`classification.unknowns=${unknowns.length}`);
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

/**
 * 从既有 Work Item / Spec 目录读取 trigger_result.json。
 * 同时兼容 v1.1 work-items 路径和既有 specs 路径，不新增产物或状态。
 */
export async function resolveSystemGovernanceRequirement(
  workItemId: string,
  baseDir: string,
): Promise<SystemGovernanceRequirement> {
  const candidatePaths = [
    join(
      baseDir,
      SPEC_DIR_NAME,
      "work-items",
      workItemId,
      "trigger_result.json",
    ),
    join(baseDir, SPEC_DIR_NAME, "specs", workItemId, "trigger_result.json"),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = await readFile(candidatePath, "utf-8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return {
          required: false,
          reasons: [],
          source_path: candidatePath,
          blocking_issue: `trigger_result.json 不是合法 JSON: ${(err as Error).message}`,
        };
      }

      return {
        ...evaluateSystemGovernanceRequirement(parsed),
        source_path: candidatePath,
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") continue;
      return {
        required: false,
        reasons: [],
        source_path: candidatePath,
        blocking_issue: `Failed to read trigger_result.json: ${error.message}`,
      };
    }
  }

  return {
    required: false,
    reasons: [],
    blocking_issue:
      "trigger_result.json not found；无法确定 Design Agent analysis_scope",
  };
}

/**
 * 检查文档是否显式声明 system_governance 分析范围。
 */
export function hasSystemGovernanceScope(content: string): boolean {
  return SYSTEM_GOVERNANCE_SCOPE_PATTERN.test(content);
}

/**
 * 检查系统治理设计分析是否形成可审计闭环。
 *
 * - required=false 且文档未声明 system_governance 时，不影响普通 solution_design。
 * - required=true 时必须声明 analysis_scope: system_governance。
 * - system_governance 必须包含七个固定章节和 capability_verdict。
 * - new_capability_required 必须证明 Standard/Contract/Skill/Agent/Tool/Runtime 均无法承载。
 * - blocked 是合法分析结论，但 Gate 必须返回 blocked，禁止继续流转。
 */
export function checkSystemGovernanceContent(
  content: string,
  required = false,
): GateResult {
  const declared = hasSystemGovernanceScope(content);

  if (!declared && !required) {
    return passResult();
  }

  if (!declared) {
    return failResult([
      '设计治理分析缺少 "analysis_scope: system_governance" 声明',
    ]);
  }

  const blockingIssues: string[] = [];
  const extractedSections = new Map<string, string>();

  for (const sectionName of SYSTEM_GOVERNANCE_SECTIONS) {
    const sectionContent = extractMarkdownSection(content, sectionName);
    extractedSections.set(sectionName, sectionContent);
    if (sectionContent.trim().length < 10) {
      blockingIssues.push(`系统治理分析缺少有效章节或内容过短: ${sectionName}`);
    }
  }

  const verdictMatch = CAPABILITY_VERDICT_PATTERN.exec(content);
  if (!verdictMatch) {
    blockingIssues.push(
      "系统治理分析缺少 capability_verdict，合法值为 reuse_existing、extend_existing、new_capability_required、blocked",
    );
  }

  if (blockingIssues.length > 0) {
    return failResult(blockingIssues);
  }

  const verdict = verdictMatch![1] as CapabilityVerdict;

  if (verdict === "blocked") {
    return {
      status: "blocked",
      blocking_issues: [
        "Design Agent 已将当前系统治理分析标记为 blocked；必须补齐架构事实、治理证据或用户决策后重新设计",
      ],
      warnings: [],
      next_action: "ask_user",
      details: {
        analysis_scope: "system_governance",
        capability_verdict: verdict,
      },
    };
  }

  if (verdict === "new_capability_required") {
    const justification =
      NEW_CAPABILITY_JUSTIFICATION_PATTERN.exec(content)?.[1]?.trim() ?? "";
    if (justification.length < 40) {
      blockingIssues.push(
        "new_capability_required 必须提供不少于 40 个字符的 new_capability_justification",
      );
    }

    const capabilityAssessment =
      extractedSections.get("Existing Capability Assessment") ?? "";
    const requiredLayers = [
      "Standard",
      "Contract",
      "Skill",
      "Agent",
      "Tool",
      "Runtime",
    ];
    const missingLayers = requiredLayers.filter(
      (layer) =>
        !new RegExp(`\\b${escapeRegExp(layer)}\\b`, "i").test(
          capabilityAssessment,
        ),
    );
    if (missingLayers.length > 0) {
      blockingIssues.push(
        `new_capability_required 必须在 Existing Capability Assessment 中逐层证明现有体系无法承载，缺少: ${missingLayers.join(", ")}`,
      );
    }
  }

  if (blockingIssues.length > 0) {
    return failResult(blockingIssues);
  }

  return {
    ...passResult(),
    details: {
      analysis_scope: "system_governance",
      capability_verdict: verdict,
      required_sections: [...SYSTEM_GOVERNANCE_SECTIONS],
    },
  };
}

// ============================================================
// Design Gate Mode Types and Strategy Table
// ============================================================

/** Design Gate 支持的 mode 类型。 */
export type DesignGateMode =
  | "change_request"
  | "ops_task"
  | "refactor"
  | "investigation";

/** 检查 design_delta.md 内容（change_request mode）。 */
export function checkDesignDeltaContent(
  _content: string,
  sections: Record<string, string>,
): GateResult {
  const designDesc = sections["增量设计描述"]?.trim();
  if (designDesc && designDesc.length < 10) {
    return failResult(["增量设计描述内容过短，需要详细描述设计变更"]);
  }
  return passResult();
}

/** 检查 ops_plan.md 内容（ops_task mode）。 */
export function checkOpsPlanContent(
  _content: string,
  sections: Record<string, string>,
): GateResult {
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const steps = sections["操作步骤"]?.trim() || "";
  const rollback = sections["回滚方案"]?.trim() || "";
  const stepLines = steps
    .split("\n")
    .filter((line) => /^\s*\d+[.)、]/.test(line));

  if (
    stepLines.length > 0 &&
    rollback.split("\n").filter((line) => line.trim()).length < stepLines.length
  ) {
    blockingIssues.push(
      "回滚方案未覆盖所有操作步骤（操作步骤数 > 回滚方案条目数）",
    );
  }

  const triggerConditions = sections["回滚触发条件"]?.trim() || "";
  const vaguePatterns = [/^无$/i, /^n\/?a$/i, /^待定$/i, /^tbd$/i, /^none$/i];
  if (vaguePatterns.some((pattern) => pattern.test(triggerConditions))) {
    blockingIssues.push(
      '回滚触发条件不明确（不能为"无"、"N/A"、"待定"等模糊表述）',
    );
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    };
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  };
}

/** 检查 refactor_plan.md 内容（refactor mode）。 */
export function checkRefactorPlanContent(
  _content: string,
  _sections: Record<string, string>,
): GateResult {
  return passResult();
}

/** 检查 findings_report.md 内容（investigation mode）。 */
export function checkFindingsReportContent(
  content: string,
  sections: Record<string, string>,
): GateResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const rootStatuses = Array.from(
    new Set(
      Array.from(
        content.matchAll(
          /\b(ROOT_CAUSE_CONFIRMED|ROOT_CAUSE_PROBABLE|ROOT_CAUSE_UNCONFIRMED|INSUFFICIENT_EVIDENCE)\b/g,
        ),
        (match) => match[1],
      ),
    ),
  );

  if (rootStatuses.length !== 1) {
    blockingIssues.push("根因判定必须且只能声明一个合法根因状态");
  }

  const conclusion = sections["调查结论"] ?? "";
  if (!/(原始调查问题|original investigation question)/i.test(conclusion)) {
    blockingIssues.push(
      "调查结论必须逐字或等义重述原始调查问题，防止调查目标漂移",
    );
  }
  if (!/(直接回答|direct answer|结论：|回答：)/i.test(conclusion)) {
    blockingIssues.push(
      "调查结论必须直接回答原始调查问题，而不是改写成另一个问题",
    );
  }

  const premiseSection = sections["问题前提与证据完整性"] ?? "";
  const premiseStatuses = Array.from(
    new Set(
      Array.from(
        premiseSection.matchAll(
          /\b(PREMISE_REPRODUCED|PREMISE_HISTORICALLY_EVIDENCED|PREMISE_CONTRADICTED|PREMISE_NOT_REPRODUCED)\b/g,
        ),
        (match) => match[1],
      ),
    ),
  );
  if (premiseStatuses.length !== 1) {
    blockingIssues.push(
      "问题前提与证据完整性必须且只能声明一个合法 PREMISE 状态",
    );
  }
  const observerEffectStatuses = Array.from(
    new Set(
      Array.from(
        premiseSection.matchAll(
          /\b(OBSERVER_EFFECT_NONE|OBSERVER_EFFECT_CONTROLLED|OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE|OBSERVER_EFFECT_UNKNOWN)\b/g,
        ),
        (match) => match[1],
      ),
    ),
  );
  if (observerEffectStatuses.length !== 1) {
    blockingIssues.push(
      "问题前提与证据完整性必须且只能声明一个合法 OBSERVER_EFFECT 状态",
    );
  }

  const hypothesisSection = sections["假设验证结果"] ?? "";
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
    blockingIssues.push("假设验证结果必须覆盖至少两个竞争假设及其实际实验结果");
  }
  for (const id of hypothesisIds) {
    const linePattern = new RegExp(
      `(?:^|\\n)[^\\n]*\\b${id}\\b[^\\n]*(confirmed|rejected|unknown|已确认|已排除|被推翻|未知|部分确认|partially_confirmed)`,
      "i",
    );
    if (!linePattern.test(hypothesisSection)) {
      blockingIssues.push(`假设 ${id} 必须在同一结果项中给出明确判定`);
    }
  }
  if (
    !/(实验结果|实际结果|actual result|命令输出|证据)/i.test(hypothesisSection)
  ) {
    blockingIssues.push(
      "假设验证结果必须记录实验或检查的实际结果，不能只写结论标签",
    );
  }

  const evidence = sections["事实与证据"] ?? "";
  if (
    !/(CODE_OBSERVED|RUNTIME_OBSERVED|ENV_OBSERVED|HISTORY_OBSERVED)/.test(
      evidence,
    )
  ) {
    blockingIssues.push("事实与证据必须使用正式事实分类，禁止只写概括性判断");
  }
  const primaryEvidencePattern =
    /(源码|配置|原始日志|调用栈|命令输出|events\.jsonl|commit|diff|tag|文件系统|截图|完整会话|一级原始证据|primary evidence|`[^`]+`|\.specforge\/)/i;
  if (!primaryEvidencePattern.test(evidence)) {
    blockingIssues.push(
      "事实与证据必须引用一级原始证据或可回溯到一级证据的派生证据",
    );
  }
  if (
    /(AGENT_CLAIM|UNVERIFIED_REPORT|INVESTIGATION_LEAD)/.test(evidence) &&
    !/(独立核验|independently verified|亲自读取|原始证据)/i.test(evidence)
  ) {
    blockingIssues.push(
      "其他 Agent 的转述只能作为线索，必须记录独立核验及对应原始证据",
    );
  }
  const evidenceIds = Array.from(
    new Set(
      Array.from(evidence.matchAll(/\bEV-[A-Za-z0-9_-]+\b/g), (m) => m[0]),
    ),
  );

  const divergence = sections["调用链与首次偏离点"] ?? "";
  if (
    !/(首次偏离点|第一个不符合预期|first divergence)/i.test(divergence) ||
    !/(预期|expected)/i.test(divergence) ||
    !/(实际|actual)/i.test(divergence)
  ) {
    blockingIssues.push(
      "调用链与首次偏离点必须明确预期与实际，并指出第一个偏离节点",
    );
  }

  const causalChain = sections["因果链"] ?? "";
  if (
    !/(根本缺陷|ROOT_CAUSE)/.test(causalChain) ||
    !/(触发条件)/.test(causalChain) ||
    !/(→|->|=>)/.test(causalChain)
  ) {
    blockingIssues.push(
      "因果链必须从根本缺陷经触发条件和传播过程连接到用户症状",
    );
  }

  const rootStatus = rootStatuses[0];
  const premiseStatus = premiseStatuses[0];
  if (rootStatus === "ROOT_CAUSE_CONFIRMED") {
    if (!/(rejected|已排除|被推翻)/i.test(hypothesisSection)) {
      blockingIssues.push(
        "ROOT_CAUSE_CONFIRMED 必须包含对主要竞争假设的反证或排除结果",
      );
    }
    if (/(partially_confirmed|部分确认)/i.test(hypothesisSection)) {
      blockingIssues.push(
        "存在部分确认或未闭合的主要假设时不得声明 ROOT_CAUSE_CONFIRMED",
      );
    }
    if (
      !["PREMISE_REPRODUCED", "PREMISE_HISTORICALLY_EVIDENCED"].includes(
        premiseStatus ?? "",
      )
    ) {
      blockingIssues.push(
        "问题前提未复现且无不可变历史原证据时不得声明 ROOT_CAUSE_CONFIRMED",
      );
    }
    const observerEffectStatus = observerEffectStatuses[0];
    if (
      [
        "OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE",
        "OBSERVER_EFFECT_UNKNOWN",
      ].includes(observerEffectStatus ?? "") &&
      premiseStatus !== "PREMISE_HISTORICALLY_EVIDENCED"
    ) {
      blockingIssues.push(
        "现场在原始取证前已被改变或观察者影响未知，且无历史原证据时不得声明 ROOT_CAUSE_CONFIRMED",
      );
    }
    if (evidenceIds.length < 2) {
      blockingIssues.push(
        "ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）",
      );
    }
    const limitations = sections["限制与未知项"] ?? "";
    if (
      /关键 UNKNOWN|可能推翻|尚未验证的关键/i.test(limitations) &&
      !/(不存在|无关键|none)/i.test(limitations)
    ) {
      blockingIssues.push(
        "存在可能推翻结论的关键 UNKNOWN 时不得声明 ROOT_CAUSE_CONFIRMED",
      );
    }
  } else if (rootStatus) {
    const followUp = sections["后续验证计划"] ?? "";
    if (!/(命令|实验|复现|日志|检查|验证|test|run)/i.test(followUp)) {
      blockingIssues.push(`${rootStatus} 必须提供可执行的后续补证或验证计划`);
    }
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
      details: {
        root_cause_status: rootStatus,
        premise_status: premiseStatus,
        observer_effect_status: observerEffectStatuses[0] ?? null,
        hypothesis_ids: hypothesisIds,
        evidence_ids: evidenceIds,
      },
    };
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    details: {
      root_cause_status: rootStatus,
      premise_status: premiseStatus,
      hypothesis_ids: hypothesisIds,
      evidence_ids: evidenceIds,
    },
  };
}

/** Design Gate 策略表。 */
export const DESIGN_GATE_SPECS: GateModeSpec[] = [
  {
    mode: "change_request",
    targetFile: "design_delta.md",
    requiredSections: [
      "增量设计描述",
      "受影响模块",
      "兼容性影响",
      "回归风险",
      "KG 追溯关系",
    ],
    checkFn: checkDesignDeltaContent,
  },
  {
    mode: "ops_task",
    targetFile: "ops_plan.md",
    requiredSections: [
      "操作目标",
      "前置条件",
      "操作步骤",
      "回滚方案",
      "回滚触发条件",
      "风险评估",
      "影响范围",
    ],
    checkFn: checkOpsPlanContent,
  },
  {
    mode: "refactor",
    targetFile: "refactor_plan.md",
    requiredSections: ["重构策略", "步骤顺序", "风险等级判定"],
    checkFn: checkRefactorPlanContent,
  },
  {
    mode: "investigation",
    targetFile: "findings_report.md",
    requiredSections: [
      "调查结论",
      "事实与证据",
      "问题前提与证据完整性",
      "调用链与首次偏离点",
      "假设验证结果",
      "根因判定",
      "因果链",
      "影响范围",
      "修复方向",
      "限制与未知项",
      "后续验证计划",
    ],
    checkFn: checkFindingsReportContent,
  },
];

// ============================================================
// Core Logic
// ============================================================

/** 执行 design gate 检查（扩展版）。 */
export async function checkDesignGate(
  workItemId: string,
  baseDir: string,
  workflowType: string = "feature_spec",
  options?: { workflowType?: string; mode?: DesignGateMode },
): Promise<GateResult> {
  try {
    await tryCheckCompatibility(baseDir, "sf_design_gate_core");

    const mode = options?.mode;
    if (mode !== undefined) {
      return executeDesignGateMode(workItemId, baseDir, mode);
    }

    const specDir = join(baseDir, SPEC_DIR_NAME, "specs", workItemId);
    const docPath = join(specDir, "design.md");
    let content: string;

    try {
      content = await readFile(docPath, "utf-8");
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return failResult(["design.md not found"]);
      }
      return {
        status: "blocked",
        blocking_issues: [`Failed to read design.md: ${error.message}`],
        warnings: [],
        next_action: "ask_user",
      };
    }

    if (workflowType === "feature_spec_design_first") {
      const designFirstResult = checkDesignGateDesignFirst(content);
      if (designFirstResult.status === "pass") {
        designFirstResult.kg_sync = await syncDesignToKG(
          workItemId,
          baseDir,
          designFirstResult.warnings,
        );
      }
      return designFirstResult;
    }

    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    const governanceRequirement = await resolveSystemGovernanceRequirement(
      workItemId,
      baseDir,
    );
    if (governanceRequirement.blocking_issue) {
      return {
        status: "blocked",
        blocking_issues: [governanceRequirement.blocking_issue],
        warnings: [],
        next_action: "ask_user",
        details: {
          trigger_result_path: governanceRequirement.source_path,
        },
      };
    }

    const governanceResult = checkSystemGovernanceContent(
      content,
      governanceRequirement.required,
    );
    if (governanceResult.status !== "pass") {
      governanceResult.details = {
        ...governanceResult.details,
        governance_requirement_reasons: governanceRequirement.reasons,
        trigger_result_path: governanceRequirement.source_path,
      };
      return governanceResult;
    }

    if (!hasRequirementReferences(content)) {
      blockingIssues.push(
        '设计文档未引用需求编号（需要包含"需求 X"、"REQ-XXX"或"Requirement X"格式的引用）',
      );
    }

    const cpTestTypes = extractCPTestTypes(content);
    for (const { cpId, testType } of cpTestTypes) {
      if (!isValidVerificationType(testType)) {
        blockingIssues.push(
          `${cpId}: test_type 值非法 "${testType}"，合法值为: unit, property, integration, e2e, regression`,
        );
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

    return {
      status: "pass",
      blocking_issues: [],
      warnings,
      next_action: "continue",
      kg_sync: await syncDesignToKG(workItemId, baseDir, warnings),
      details: {
        ...governanceResult.details,
        governance_requirement_reasons: governanceRequirement.reasons,
        trigger_result_path: governanceRequirement.source_path,
      },
    };
  } catch (err) {
    await logErrorToFile(
      baseDir,
      "sf_design_gate_core",
      "checkDesignGate",
      err,
    );
    throw err;
  }
}

/** Design-First 工作流的 design gate 检查。 */
export function checkDesignGateDesignFirst(content: string): GateResult {
  const governanceResult = checkSystemGovernanceContent(content, true);
  if (governanceResult.status !== "pass") {
    return governanceResult;
  }

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!hasArchitectureSection(content)) {
    blockingIssues.push(
      "design.md 缺少架构概述章节（需要包含“架构”、“Architecture”或“概述”标题）",
    );
  }
  if (!hasModuleBoundaries(content)) {
    blockingIssues.push(
      "design.md 未定义模块或组件边界（需要包含“模块”、“组件”、“Module”或“Component”）",
    );
  }
  if (!hasDataModelOrInterface(content)) {
    blockingIssues.push(
      "design.md 缺少数据模型或接口定义（需要包含“数据模型”、“接口”、“Data Model”或“Interface”）",
    );
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    };
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    details: governanceResult.details,
  };
}

// ============================================================
// Design Gate Mode Dispatch
// ============================================================

async function executeDesignGateMode(
  workItemId: string,
  baseDir: string,
  mode: DesignGateMode,
): Promise<GateResult> {
  const spec = DESIGN_GATE_SPECS.find((item) => item.mode === mode);
  if (spec === undefined) {
    return {
      status: "fail",
      blocking_issues: [],
      warnings: [`Unsupported mode: "${mode}"`],
      next_action: "ask_user",
    };
  }

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
    return failResult([`File not found: ${spec.targetFile}`]);
  }

  const sections = parseSections(content, spec.requiredSections);
  const missing = spec.requiredSections.filter(
    (section) => !sections[section]?.trim(),
  );
  if (missing.length > 0) {
    return failResult(missing.map((section) => `Missing section: ${section}`));
  }

  const governanceRequirement =
    mode === "ops_task" || mode === "investigation"
      ? { required: false, reasons: [] }
      : await resolveSystemGovernanceRequirement(workItemId, baseDir);
  if (governanceRequirement.blocking_issue) {
    return {
      status: "blocked",
      blocking_issues: [governanceRequirement.blocking_issue],
      warnings: [],
      next_action: "ask_user",
      details: {
        trigger_result_path: governanceRequirement.source_path,
      },
    };
  }

  const governanceResult = checkSystemGovernanceContent(
    content,
    governanceRequirement.required,
  );
  if (governanceResult.status !== "pass") {
    governanceResult.details = {
      ...governanceResult.details,
      governance_requirement_reasons: governanceRequirement.reasons,
      trigger_result_path: governanceRequirement.source_path,
    };
    return governanceResult;
  }

  const modeResult = spec.checkFn(content, sections);
  if (modeResult.status === "pass") {
    modeResult.details = {
      ...modeResult.details,
      ...governanceResult.details,
      governance_requirement_reasons: governanceRequirement.reasons,
      trigger_result_path: governanceRequirement.source_path,
    };
  }
  return modeResult;
}

// ============================================================
// Helper functions
// ============================================================

export function hasRequirementReferences(content: string): boolean {
  const patterns = [
    /refs:\s*\[[^\]]*REQ-\d+/i,
    /需求\s*\d+/i,
    /requirement\s*\d+/i,
    /REQ[-_]?\w*\d+/i,
  ];
  return patterns.some((pattern) => pattern.test(content));
}

export function hasArchitectureSection(content: string): boolean {
  const patterns = [
    /#+\s*.*架构/i,
    /#+\s*.*architecture/i,
    /#+\s*.*概述/i,
    /#+\s*.*overview/i,
  ];
  return patterns.some((pattern) => pattern.test(content));
}

export function hasModuleBoundaries(content: string): boolean {
  const patterns = [/模块/i, /组件/i, /module/i, /component/i];
  return patterns.some((pattern) => pattern.test(content));
}

export function hasDataModelOrInterface(content: string): boolean {
  const patterns = [
    /数据模型/i,
    /接口/i,
    /data\s*model/i,
    /interface/i,
    /类型定义/i,
    /type\s*defin/i,
  ];
  return patterns.some((pattern) => pattern.test(content));
}

export function extractCPTestTypes(content: string): Array<{
  cpId: string;
  testType: string;
  testFile?: string;
  requirementRef?: string;
}> {
  const results: Array<{
    cpId: string;
    testType: string;
    testFile?: string;
    requirementRef?: string;
  }> = [];
  const cpPattern = /^#{1,6}\s+(CP-\d+[^\n]*)/gm;
  let match: RegExpExecArray | null;

  while ((match = cpPattern.exec(content)) !== null) {
    const cpIdMatch = match[1].match(/CP-\d+/);
    if (!cpIdMatch) continue;

    const cpId = cpIdMatch[0];
    const afterCP = content.slice(match.index + match[0].length);
    const nextHeading = /^#{1,6}\s/m.exec(afterCP);
    const cpSection = nextHeading
      ? afterCP.slice(0, nextHeading.index)
      : afterCP;
    const testTypeMatch = /\*\*test_type\*\*\s*:\s*(.*)/i.exec(cpSection);

    if (testTypeMatch) {
      const entry: {
        cpId: string;
        testType: string;
        testFile?: string;
        requirementRef?: string;
      } = {
        cpId,
        testType: testTypeMatch[1].trim(),
      };
      const testFileMatch = /\*\*test_file\*\*\s*:\s*(.+)/i.exec(cpSection);
      if (testFileMatch) entry.testFile = testFileMatch[1].trim();
      const reqRefMatch = /\*\*requirement_ref\*\*\s*:\s*(\S+)/i.exec(
        cpSection,
      );
      if (reqRefMatch) entry.requirementRef = reqRefMatch[1].trim();
      results.push(entry);
    }
  }

  return results;
}

function extractMarkdownSection(content: string, sectionName: string): string {
  const headingPattern = new RegExp(
    `^(#{1,6})\\s+(?:\\d+[.、)]\\s*)?${escapeRegExp(sectionName)}\\s*$`,
    "im",
  );
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch) return "";

  const currentLevel = headingMatch[1].length;
  const bodyStart = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(bodyStart);
  const headingIterator = rest.matchAll(/^(#{1,6})\s+/gm);

  for (const nextHeading of headingIterator) {
    if (nextHeading[1].length <= currentLevel) {
      return rest.slice(0, nextHeading.index).trim();
    }
  }

  return rest.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function passResult(): GateResult {
  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  };
}

function failResult(blockingIssues: string[]): GateResult {
  return {
    status: "fail",
    blocking_issues: blockingIssues,
    warnings: [],
    next_action: "revise",
  };
}

async function syncDesignToKG(
  workItemId: string,
  baseDir: string,
  warnings: string[],
): Promise<SyncSummary | null> {
  let kgSync: SyncSummary | null = null;
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, "design");
      if (kgResult.success && kgResult.summary) {
        kgSync = kgResult.summary;
      } else if (kgResult.error) {
        warnings.push(`KG sync warning: ${kgResult.error}`);
      }
    }
  } catch (err) {
    warnings.push(`KG sync failed: ${(err as Error).message}`);
  }
  return kgSync;
}

/**
 * sf_design_gate 核心逻辑
 * 检查 design.md 及既有设计类产物是否满足最低质量标准。
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）。
 *
 * Requirements: 8.3, 8.5, 11.2, 11.5, 11.6, 2.8, 3.7, 3.8, 4.6, 5.9
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  legacyWorkItemSpecArtifact,
  workItemRoot,
  workItemTriggerResult,
} from '@specforge/types/directory-layout';
import type { GateResult, GateModeSpec } from './sf_gate_types';
import { resolveWorkItemSpecArtifacts } from './governance-invariants-v11';
import { parseSections } from './sf_requirements_gate_core';
import { syncFromSpec, isKGEnabled } from './sf_knowledge_graph_core';
import { tryCheckCompatibility, logErrorToFile } from './utils';
import { isValidVerificationType } from './sf_verification_types';
import type { SyncSummary } from './sf_knowledge_graph_core';

async function readFirstAvailable(
  paths: string[]
): Promise<{ content: string; path: string } | null> {
  for (const candidatePath of paths) {
    try {
      return { content: await readFile(candidatePath, 'utf-8'), path: candidatePath };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return null;
}

function modeDocumentReadPaths(baseDir: string, workItemId: string, fileName: string): string[] {
  return [
    join(workItemRoot(baseDir, workItemId), fileName),
    legacyWorkItemSpecArtifact(baseDir, workItemId, fileName),
  ];
}

// Re-export GateResult for convenience
export type { GateResult };

// ============================================================
// Design Governance Types and Rules
// ============================================================

export type DesignAnalysisScope = 'solution_design' | 'system_governance';
export type CapabilityVerdict =
  | 'reuse_existing'
  | 'extend_existing'
  | 'new_capability_required'
  | 'blocked';

export const SYSTEM_GOVERNANCE_SECTIONS = [
  'Problem Understanding',
  'Existing Architecture Analysis',
  'Governance Classification',
  'Existing Capability Assessment',
  'Solution Strategy',
  'Impact Analysis',
  'Verification Plan',
] as const;

const SYSTEM_GOVERNANCE_SCOPE_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?analysis_scope(?:\*\*)?\s*:\s*system_governance\s*$/im;
const CAPABILITY_VERDICT_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?capability_verdict(?:\*\*)?\s*:\s*(reuse_existing|extend_existing|new_capability_required|blocked)\s*$/im;
const NEW_CAPABILITY_JUSTIFICATION_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?new_capability_justification(?:\*\*)?\s*:\s*(.+)\s*$/im;

const SYSTEM_GOVERNANCE_WORKFLOW_PATHS = new Set([
  'architecture_change_path',
  'design_change_path',
]);
const CHANGE_CLASSIFICATION_BOOLEAN_KEYS = [
  'requirement_changed',
  'acceptance_criteria_changed',
  'business_rule_changed',
  'user_visible_behavior_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
] as const;
const SYSTEM_GOVERNANCE_CLASSIFICATION_KEYS = [
  'business_rule_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
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
  triggerResult: unknown
): SystemGovernanceRequirement {
  if (typeof triggerResult !== 'object' || triggerResult === null) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 必须是 JSON 对象',
    };
  }

  const trigger = triggerResult as {
    workflow_path?: unknown;
    classification?: unknown;
  };
  const reasons: string[] = [];

  if (typeof trigger.workflow_path !== 'string' || trigger.workflow_path.trim().length === 0) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 缺少有效 workflow_path',
    };
  }

  if (typeof trigger.classification !== 'object' || trigger.classification === null) {
    return {
      required: false,
      reasons: [],
      blocking_issue: 'trigger_result.json 缺少有效 classification',
    };
  }

  const classification = trigger.classification as Record<string, unknown>;
  const invalidBooleanKeys = CHANGE_CLASSIFICATION_BOOLEAN_KEYS.filter(
    key => typeof classification[key] !== 'boolean'
  );
  if (invalidBooleanKeys.length > 0 || !Array.isArray(classification.unknowns)) {
    const invalidFields = [
      ...invalidBooleanKeys.map(key => `classification.${key}`),
      ...(!Array.isArray(classification.unknowns) ? ['classification.unknowns'] : []),
    ];
    return {
      required: false,
      reasons: [],
      blocking_issue: `trigger_result.json classification 不完整或类型错误: ${invalidFields.join(', ')}`,
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
  baseDir: string
): Promise<SystemGovernanceRequirement> {
  const candidatePaths = [
    workItemTriggerResult(baseDir, workItemId),
    legacyWorkItemSpecArtifact(baseDir, workItemId, 'trigger_result.json'),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = await readFile(candidatePath, 'utf-8');
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
      if (error.code === 'ENOENT') continue;
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
    blocking_issue: 'trigger_result.json not found；无法确定 Design Agent analysis_scope',
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
export function checkSystemGovernanceContent(content: string, required = false): GateResult {
  const declared = hasSystemGovernanceScope(content);

  if (!declared && !required) {
    return passResult();
  }

  if (!declared) {
    return failResult(['设计治理分析缺少 "analysis_scope: system_governance" 声明']);
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
      '系统治理分析缺少 capability_verdict，合法值为 reuse_existing、extend_existing、new_capability_required、blocked'
    );
  }

  if (blockingIssues.length > 0) {
    return failResult(blockingIssues);
  }

  const verdict = verdictMatch![1] as CapabilityVerdict;

  if (verdict === 'blocked') {
    return {
      status: 'blocked',
      blocking_issues: [
        'Design Agent 已将当前系统治理分析标记为 blocked；必须补齐架构事实、治理证据或用户决策后重新设计',
      ],
      warnings: [],
      next_action: 'ask_user',
      details: {
        analysis_scope: 'system_governance',
        capability_verdict: verdict,
      },
    };
  }

  if (verdict === 'new_capability_required') {
    const justification = NEW_CAPABILITY_JUSTIFICATION_PATTERN.exec(content)?.[1]?.trim() ?? '';
    if (justification.length < 40) {
      blockingIssues.push(
        'new_capability_required 必须提供不少于 40 个字符的 new_capability_justification'
      );
    }

    const capabilityAssessment = extractedSections.get('Existing Capability Assessment') ?? '';
    const requiredLayers = ['Standard', 'Contract', 'Skill', 'Agent', 'Tool', 'Runtime'];
    const missingLayers = requiredLayers.filter(
      layer => !new RegExp(`\\b${escapeRegExp(layer)}\\b`, 'i').test(capabilityAssessment)
    );
    if (missingLayers.length > 0) {
      blockingIssues.push(
        `new_capability_required 必须在 Existing Capability Assessment 中逐层证明现有体系无法承载，缺少: ${missingLayers.join(', ')}`
      );
    }
  }

  if (blockingIssues.length > 0) {
    return failResult(blockingIssues);
  }

  return {
    ...passResult(),
    details: {
      analysis_scope: 'system_governance',
      capability_verdict: verdict,
      required_sections: [...SYSTEM_GOVERNANCE_SECTIONS],
    },
  };
}

// ============================================================
// Design Gate Mode Types and Strategy Table
// ============================================================

/** Design Gate 支持的 mode 类型。 */
export type DesignGateMode = 'change_request' | 'ops_task' | 'refactor' | 'investigation';

/** 检查 design_delta.md 内容（change_request mode）。 */
export function checkDesignDeltaContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  const designDesc = sections['增量设计描述']?.trim();
  if (designDesc && designDesc.length < 10) {
    return failResult(['增量设计描述内容过短，需要详细描述设计变更']);
  }
  return passResult();
}

/** 检查 ops_plan.md 内容（ops_task mode）。 */
export function checkOpsPlanContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const steps = sections['操作步骤']?.trim() || '';
  const rollback = sections['回滚方案']?.trim() || '';
  const stepLines = steps.split('\n').filter(line => /^\s*\d+[.)、]/.test(line));

  if (
    stepLines.length > 0 &&
    rollback.split('\n').filter(line => line.trim()).length < stepLines.length
  ) {
    blockingIssues.push('回滚方案未覆盖所有操作步骤（操作步骤数 > 回滚方案条目数）');
  }

  const triggerConditions = sections['回滚触发条件']?.trim() || '';
  const vaguePatterns = [/^无$/i, /^n\/?a$/i, /^待定$/i, /^tbd$/i, /^none$/i];
  if (vaguePatterns.some(pattern => pattern.test(triggerConditions))) {
    blockingIssues.push('回滚触发条件不明确（不能为"无"、"N/A"、"待定"等模糊表述）');
  }

  if (blockingIssues.length > 0) {
    return {
      status: 'fail',
      blocking_issues: blockingIssues,
      warnings,
      next_action: 'revise',
    };
  }

  return {
    status: 'pass',
    blocking_issues: [],
    warnings,
    next_action: 'continue',
  };
}

/** 检查 refactor_plan.md 内容（refactor mode）。 */
export function checkRefactorPlanContent(
  _content: string,
  _sections: Record<string, string>
): GateResult {
  return passResult();
}

/** 检查 findings_report.md 内容（investigation mode）。 */
export function checkFindingsReportContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  const blockingIssues: string[] = [];
  const conclusions = sections['调查结论']?.trim() || '';
  const evidence = sections['数据和证据']?.trim() || '';

  if (evidence.length === 0) {
    blockingIssues.push('数据和证据为空，结论缺乏支撑');
  } else if (conclusions.length > 0 && evidence.length < 20) {
    blockingIssues.push('数据和证据内容过少，不足以支撑调查结论');
  }

  const recommendations = sections['建议']?.trim() || '';
  if (recommendations.length > 0 && recommendations.length < 10) {
    blockingIssues.push('建议内容过短，需要包含可操作的具体建议');
  }

  return blockingIssues.length > 0 ? failResult(blockingIssues) : passResult();
}

/** Design Gate 策略表。 */
export const DESIGN_GATE_SPECS: GateModeSpec[] = [
  {
    mode: 'change_request',
    targetFile: 'design_delta.md',
    requiredSections: ['增量设计描述', '受影响模块', '兼容性影响', '回归风险', 'KG 追溯关系'],
    checkFn: checkDesignDeltaContent,
  },
  {
    mode: 'ops_task',
    targetFile: 'ops_plan.md',
    requiredSections: [
      '操作目标',
      '前置条件',
      '操作步骤',
      '回滚方案',
      '回滚触发条件',
      '风险评估',
      '影响范围',
    ],
    checkFn: checkOpsPlanContent,
  },
  {
    mode: 'refactor',
    targetFile: 'refactor_plan.md',
    requiredSections: ['重构策略', '步骤顺序', '风险等级判定'],
    checkFn: checkRefactorPlanContent,
  },
  {
    mode: 'investigation',
    targetFile: 'findings_report.md',
    requiredSections: ['调查结论', '数据和证据', '建议', '限制'],
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
  workflowType: string = 'feature_spec',
  options?: { workflowType?: string; mode?: DesignGateMode }
): Promise<GateResult> {
  try {
    await tryCheckCompatibility(baseDir, 'sf_design_gate_core');

    const mode = options?.mode;
    if (mode !== undefined) {
      return executeDesignGateMode(workItemId, baseDir, mode);
    }

    const governanceRequirement = await resolveSystemGovernanceRequirement(workItemId, baseDir);
    if (governanceRequirement.blocking_issue) {
      return {
        status: 'blocked',
        blocking_issues: [governanceRequirement.blocking_issue],
        warnings: [],
        next_action: 'ask_user',
        details: {
          trigger_result_path: governanceRequirement.source_path,
        },
      };
    }

    let designArtifacts: Array<{ content: string; path: string }>;
    try {
      designArtifacts = await resolveWorkItemSpecArtifacts({
        projectRoot: baseDir,
        workItemId,
        kind: 'design',
      });
    } catch (err: unknown) {
      return {
        status: 'blocked',
        blocking_issues: [`Failed to read design candidate: ${(err as Error).message}`],
        warnings: [],
        next_action: 'ask_user',
      };
    }
    if (designArtifacts.length === 0) {
      return failResult(['design candidate not found']);
    }

    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    let governanceDetails: Record<string, unknown> | undefined;

    for (const artifact of designArtifacts) {
      const content = artifact.content;
      const artifactLabel = artifact.path.replace(/\\/g, '/');

      if (workflowType === 'feature_spec_design_first') {
        const designFirstResult = checkDesignGateDesignFirst(content);
        if (designFirstResult.status !== 'pass') {
          blockingIssues.push(
            ...designFirstResult.blocking_issues.map(issue => `${artifactLabel}: ${issue}`)
          );
          warnings.push(
            ...designFirstResult.warnings.map(warning => `${artifactLabel}: ${warning}`)
          );
          continue;
        }
        governanceDetails = designFirstResult.details;
        continue;
      }

      const governanceResult = checkSystemGovernanceContent(
        content,
        governanceRequirement.required
      );
      if (governanceResult.status !== 'pass') {
        blockingIssues.push(
          ...governanceResult.blocking_issues.map(issue => `${artifactLabel}: ${issue}`)
        );
        warnings.push(...governanceResult.warnings.map(warning => `${artifactLabel}: ${warning}`));
        continue;
      }
      governanceDetails = governanceResult.details;

      if (!hasRequirementReferences(content)) {
        blockingIssues.push(
          `${artifactLabel}: 设计文档未引用需求编号（需要包含"需求 X"、"REQ-XXX"或"Requirement X"格式的引用）`
        );
      }

      const cpTestTypes = extractCPTestTypes(content);
      for (const { cpId, testType } of cpTestTypes) {
        if (!isValidVerificationType(testType)) {
          blockingIssues.push(
            `${artifactLabel}: ${cpId}: test_type 值非法 "${testType}"，合法值为: unit, property, integration, e2e, regression`
          );
        }
      }
    }

    if (blockingIssues.length > 0) {
      return {
        status: 'fail',
        blocking_issues: blockingIssues,
        warnings,
        next_action: 'revise',
        details: {
          governance_requirement_reasons: governanceRequirement.reasons,
          trigger_result_path: governanceRequirement.source_path,
          design_candidate_paths: designArtifacts.map(artifact => artifact.path),
        },
      };
    }

    const result: GateResult = {
      status: 'pass',
      blocking_issues: [],
      warnings,
      next_action: 'continue',
      details: {
        ...governanceDetails,
        governance_requirement_reasons: governanceRequirement.reasons,
        trigger_result_path: governanceRequirement.source_path,
        design_candidate_paths: designArtifacts.map(artifact => artifact.path),
      },
    };

    result.kg_sync = await syncDesignToKG(workItemId, baseDir, warnings);
    return result;
  } catch (err) {
    await logErrorToFile(baseDir, 'sf_design_gate_core', 'checkDesignGate', err);
    throw err;
  }
}

/** Design-First 工作流的 design gate 检查。 */
export function checkDesignGateDesignFirst(content: string): GateResult {
  const governanceResult = checkSystemGovernanceContent(content, true);
  if (governanceResult.status !== 'pass') {
    return governanceResult;
  }

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!hasArchitectureSection(content)) {
    blockingIssues.push('design.md 缺少架构概述章节（需要包含“架构”、“Architecture”或“概述”标题）');
  }
  if (!hasModuleBoundaries(content)) {
    blockingIssues.push(
      'design.md 未定义模块或组件边界（需要包含“模块”、“组件”、“Module”或“Component”）'
    );
  }
  if (!hasDataModelOrInterface(content)) {
    blockingIssues.push(
      'design.md 缺少数据模型或接口定义（需要包含“数据模型”、“接口”、“Data Model”或“Interface”）'
    );
  }

  if (blockingIssues.length > 0) {
    return {
      status: 'fail',
      blocking_issues: blockingIssues,
      warnings,
      next_action: 'revise',
    };
  }

  return {
    status: 'pass',
    blocking_issues: [],
    warnings,
    next_action: 'continue',
    details: governanceResult.details,
  };
}

// ============================================================
// Design Gate Mode Dispatch
// ============================================================

async function executeDesignGateMode(
  workItemId: string,
  baseDir: string,
  mode: DesignGateMode
): Promise<GateResult> {
  const spec = DESIGN_GATE_SPECS.find(item => item.mode === mode);
  if (spec === undefined) {
    return {
      status: 'fail',
      blocking_issues: [],
      warnings: [`Unsupported mode: "${mode}"`],
      next_action: 'ask_user',
    };
  }

  let resolvedDocument: { content: string; path: string } | null;
  try {
    resolvedDocument = await readFirstAvailable(
      modeDocumentReadPaths(baseDir, workItemId, spec.targetFile)
    );
  } catch (err: unknown) {
    return {
      status: 'blocked',
      blocking_issues: [`Failed to read ${spec.targetFile}: ${(err as Error).message}`],
      warnings: [],
      next_action: 'ask_user',
    };
  }
  if (!resolvedDocument) {
    return failResult([`File not found: ${spec.targetFile}`]);
  }
  const content = resolvedDocument.content;

  const sections = parseSections(content, spec.requiredSections);
  const missing = spec.requiredSections.filter(section => !sections[section]?.trim());
  if (missing.length > 0) {
    return failResult(missing.map(section => `Missing section: ${section}`));
  }

  const governanceRequirement =
    mode === 'ops_task'
      ? { required: false, reasons: [] }
      : await resolveSystemGovernanceRequirement(workItemId, baseDir);
  if (governanceRequirement.blocking_issue) {
    return {
      status: 'blocked',
      blocking_issues: [governanceRequirement.blocking_issue],
      warnings: [],
      next_action: 'ask_user',
      details: {
        trigger_result_path: governanceRequirement.source_path,
      },
    };
  }

  const governanceResult = checkSystemGovernanceContent(content, governanceRequirement.required);
  if (governanceResult.status !== 'pass') {
    governanceResult.details = {
      ...governanceResult.details,
      governance_requirement_reasons: governanceRequirement.reasons,
      trigger_result_path: governanceRequirement.source_path,
    };
    return governanceResult;
  }

  const modeResult = spec.checkFn(content, sections);
  if (modeResult.status === 'pass') {
    modeResult.details = {
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
  return patterns.some(pattern => pattern.test(content));
}

export function hasArchitectureSection(content: string): boolean {
  const patterns = [/#+\s*.*架构/i, /#+\s*.*architecture/i, /#+\s*.*概述/i, /#+\s*.*overview/i];
  return patterns.some(pattern => pattern.test(content));
}

export function hasModuleBoundaries(content: string): boolean {
  const patterns = [/模块/i, /组件/i, /module/i, /component/i];
  return patterns.some(pattern => pattern.test(content));
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
  return patterns.some(pattern => pattern.test(content));
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
    const cpSection = nextHeading ? afterCP.slice(0, nextHeading.index) : afterCP;
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
      const reqRefMatch = /\*\*requirement_ref\*\*\s*:\s*(\S+)/i.exec(cpSection);
      if (reqRefMatch) entry.requirementRef = reqRefMatch[1].trim();
      results.push(entry);
    }
  }

  return results;
}

function extractMarkdownSection(content: string, sectionName: string): string {
  const headingPattern = new RegExp(
    `^(#{1,6})\\s+(?:\\d+[.、)]\\s*)?${escapeRegExp(sectionName)}\\s*$`,
    'im'
  );
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch) return '';

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
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function passResult(): GateResult {
  return {
    status: 'pass',
    blocking_issues: [],
    warnings: [],
    next_action: 'continue',
  };
}

function failResult(blockingIssues: string[]): GateResult {
  return {
    status: 'fail',
    blocking_issues: blockingIssues,
    warnings: [],
    next_action: 'revise',
  };
}

async function syncDesignToKG(
  workItemId: string,
  baseDir: string,
  warnings: string[]
): Promise<SyncSummary | null> {
  let kgSync: SyncSummary | null = null;
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, 'design');
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

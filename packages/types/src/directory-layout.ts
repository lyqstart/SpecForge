/**
 * directory-layout.ts — SpecForge V6 项目目录布局的单一真相源（Single Source of Truth）
 *
 * 依据：SpecForge 最终融合标准 v1.1（specforge_final_fused_standard_v1_1_patch1_zh.md）
 *
 * 本模块定义 SpecForge 项目根目录下 `.specforge/` 目录的全部子路径常量，
 * 并提供 Path Service（路径服务）和 Path Policy（路径策略）。
 *
 * 设计要点：
 * - 使用 TypeScript `as const` 声明 `SPEC_DIR_NAME` 和 `LAYOUT` 字典，
 *   使 `keyof typeof LAYOUT` 成为字面量联合类型——编译期防御的基础设施。
 * - `LAYOUT` 字典中的值是相对于 `<projectRoot>/.specforge/` 的子路径。
 * - 项目级正式规格真相源位于 `.specforge/project/`（§2.1）。
 * - Work Item 事务目录位于 `.specforge/work-items/`（§4.2）。
 * - 旧路径通过 `legacyPaths` 对象保留，仅供 legacy read-only（§1.7）。
 * - 通过 Path Service 系列函数对外提供路径生成能力。
 * - 通过 Path Policy 函数提供路径合法性校验（§1.6）。
 */

/// <reference types="node" />

import * as path from 'node:path';

// ---------------------------------------------------------------------------
// SPEC_DIR_NAME — 项目根下 SpecForge 目录的权威名称（带点）
// ---------------------------------------------------------------------------

/**
 * SpecForge 在用户项目根目录下创建的工具目录名。
 * 必须使用带点形式 `.specforge`。
 */
export const SPEC_DIR_NAME = '.specforge' as const;

// ---------------------------------------------------------------------------
// LAYOUT — `.specforge/` 下各子路径的权威字典（v1.1 标准）
// ---------------------------------------------------------------------------

/**
 * `.specforge/` 目录下各子路径的权威字典（v1.1 标准）。
 *
 * 顶层分区：
 * - **project**：项目级正式规格真相源（§2.1）（committed）
 * - **workItems**：Work Item 事务目录（§4.2）（committed）
 * - **runtime**：运行时数据（gitignored），下设 wal / state / checkpoints / logs
 *
 * 已移除的顶层分区迁移到 `legacyPaths`：
 * - manifest、config、specs、knowledge 等
 * - runtime 下的 archive / sessions / cas 等归档子目录
 */
export const LAYOUT = {
  // ---- committed 区：项目级正式规格真相源（§2.1）----
  /** 项目级正式规格目录 — `<root>/.specforge/project/` */
  project: 'project',

  /** 项目级正式规格文件的"分组键空间" */
  projectFiles: {
    /** `<root>/.specforge/project/spec_manifest.json` */
    specManifest: 'project/spec_manifest.json',
    /** `<root>/.specforge/project/extension_registry.json` */
    extensionRegistry: 'project/extension_registry.json',
    /** `<root>/.specforge/project/requirements_index.md` */
    requirementsIndex: 'project/requirements_index.md',
    /** `<root>/.specforge/project/design_index.md` */
    designIndex: 'project/design_index.md',
    /** `<root>/.specforge/project/architecture.md` */
    architecture: 'project/architecture.md',
    /** `<root>/.specforge/project/glossary.md` */
    glossary: 'project/glossary.md',
    /** `<root>/.specforge/project/decisions.md` */
    decisions: 'project/decisions.md',
    /** `<root>/.specforge/project/trace_matrix.md` */
    traceMatrix: 'project/trace_matrix.md',
    /** `/.specforge/project/domain_model.md` */
    domainModel: 'project/domain_model.md',
    /** `/.specforge/project/context_map.md` */
    contextMap: 'project/context_map.md',
    /** `/.specforge/project/crosscutting_concepts.md` */
    crosscuttingConcepts: 'project/crosscutting_concepts.md',
    /** `/.specforge/project/architecture_risks.md` */
    architectureRisks: 'project/architecture_risks.md',
    /** `/.specforge/project/decisions/` */
    decisionsRoot: 'project/decisions',
    /** `<root>/.specforge/project/modules/` */
    modulesRoot: 'project/modules',
  },

  // ---- committed 区：Work Item 事务目录（§4.2）----
  /** Work Item 事务根目录 — `<root>/.specforge/work-items/` */
  workItems: 'work-items',

  /** Work Item 文件的"分组键空间" */
  workItemFiles: {
    /** `<root>/.specforge/work-items/<WI-ID>/work_item.json` */
    workItemJson: 'work_item.json',
    /** `<root>/.specforge/work-items/<WI-ID>/intake.md` */
    intake: 'intake.md',
    /** `<root>/.specforge/work-items/<WI-ID>/change_classification.md` */
    changeClassification: 'change_classification.md',
    /** `<root>/.specforge/work-items/<WI-ID>/impact_analysis.md` */
    impactAnalysis: 'impact_analysis.md',
    /** `<root>/.specforge/work-items/<WI-ID>/trigger_result.json` */
    triggerResult: 'trigger_result.json',
    /** `<root>/.specforge/work-items/<WI-ID>/requirements_delta.md` */
    requirementsDelta: 'requirements_delta.md',
    /** `<root>/.specforge/work-items/<WI-ID>/design_delta.md` */
    designDelta: 'design_delta.md',
    /** `/.specforge/work-items/<WI>/domain_analysis.md` */
    domainAnalysis: 'domain_analysis.md',
    /** `/.specforge/work-items/<WI>/module_boundary_analysis.md` */
    moduleBoundaryAnalysis: 'module_boundary_analysis.md',
    /** `/.specforge/work-items/<WI>/architecture_migration_map.md` */
    architectureMigrationMap: 'architecture_migration_map.md',
    /** `/.specforge/work-items/<WI>/project_spec_version_before.json` */
    projectSpecVersionBefore: 'project_spec_version_before.json',
    /** `/.specforge/work-items/<WI>/project_spec_version_after.json` */
    projectSpecVersionAfter: 'project_spec_version_after.json',
    /** `<root>/.specforge/work-items/<WI-ID>/tasks.md` */
    tasks: 'tasks.md',
    /** `<root>/.specforge/work-items/<WI-ID>/trace_delta.md` */
    traceDelta: 'trace_delta.md',
    /** `<root>/.specforge/work-items/<WI-ID>/candidate_manifest.json` */
    candidateManifest: 'candidate_manifest.json',
    /** `<root>/.specforge/work-items/<WI-ID>/candidates/` */
    candidates: 'candidates',
    /** `<root>/.specforge/work-items/<WI-ID>/gates/` */
    gates: 'gates',
    /** `<root>/.specforge/work-items/<WI-ID>/gate_summary.md` */
    gateSummary: 'gate_summary.md',
    /** `<root>/.specforge/work-items/<WI-ID>/user_decision.json` */
    userDecision: 'user_decision.json',
    /** `<root>/.specforge/work-items/<WI-ID>/verification_report.md` */
    verificationReport: 'verification_report.md',
    /** `<root>/.specforge/work-items/<WI-ID>/merge_report.md` */
    mergeReport: 'merge_report.md',
    /** `<root>/.specforge/work-items/<WI-ID>/evidence/` */
    evidence: 'evidence',
    /** `<root>/.specforge/work-items/<WI-ID>/evidence/evidence_manifest.json` */
    evidenceManifest: 'evidence/evidence_manifest.json',
    /** `<root>/.specforge/work-items/<WI-ID>/extension_request.json` */
    extensionRequest: 'extension_request.json',
    /** `<root>/.specforge/work-items/<WI-ID>/extension_delta.md` */
    extensionDelta: 'extension_delta.md',
  },

  // ---- gitignored 区：运行时数据（runtime 子树）----
  /** 运行时状态目录 — `<root>/.specforge/runtime/` */
  runtime: 'runtime',

  /** 运行时文件的"分组键空间" */
  runtimeFiles: {
    /** 写前日志 — `<root>/.specforge/runtime/wal.jsonl` */
    wal: 'runtime/wal.jsonl',
    /** 持久化状态 — `<root>/.specforge/runtime/state.json` */
    state: 'runtime/state.json',
    /** 状态快照目录 — `<root>/.specforge/runtime/checkpoints/` */
    checkpoints: 'runtime/checkpoints',
    /** 日志目录 — `<root>/.specforge/runtime/logs/` */
    logs: 'runtime/logs',
  },
} as const;

/**
 * `LAYOUT` 字典的"扁平 key"联合类型。
 */
export type LayoutKey = keyof typeof LAYOUT;

// ---------------------------------------------------------------------------
// legacyPaths — 旧路径常量（仅供 legacy read-only）
// ---------------------------------------------------------------------------

/**
 * 已从 `LAYOUT` 移除的旧路径常量。
 * 仅供 legacy readers 读取，新代码不得使用这些路径进行写入。
 */
export const legacyPaths = {
  /** 旧规格目录（legacy read-only）— `<root>/.specforge/specs/` */
  specsReadOnly: 'specs',
  /** 旧根级 manifest — `<root>/.specforge/manifest.json` */
  manifest: 'manifest.json',
  /** 旧配置目录 — `<root>/.specforge/config/` */
  config: 'config',
  /** 旧配置文件的"分组键空间"（kept for legacy readers） */
  configFiles: {
    /** `<root>/.specforge/config/project-rules.md` */
    projectRules: 'config/project-rules.md',
    /** `<root>/.specforge/config/prod-environment.md` */
    prodEnv: 'config/prod-environment.md',
    /** `<root>/.specforge/config/project.json` */
    project: 'config/project.json',
    /** `<root>/.specforge/config/risk_policy.json` */
    riskPolicy: 'config/risk_policy.json',
    /** `<root>/.specforge/config/skill_fragments.json` */
    skillFragments: 'config/skill_fragments.json',
  },
  /** 旧知识目录 — `<root>/.specforge/knowledge/` */
  knowledge: 'knowledge',
  /** 旧知识图谱 — `<root>/.specforge/knowledge/graph.json` */
  knowledgeGraph: 'knowledge/graph.json',
} as const;

// ---------------------------------------------------------------------------
// Path Service — 路径服务（§1.5）
// ---------------------------------------------------------------------------

/**
 * 拼合 `<projectRoot>/.specforge/<LAYOUT[key]>/<...subpath>`。
 *
 * @param projectRoot 项目根目录绝对路径
 * @param key `LAYOUT` 的顶层 key
 * @param subpath 可变长度子路径段
 * @returns 平台原生路径字符串
 */
export function resolveProjectPath(
  projectRoot: string,
  key: LayoutKey,
  ...subpath: string[]
): string {
  const value = LAYOUT[key];
  const segment = typeof value === 'string' ? value : key;
  return path.join(projectRoot, SPEC_DIR_NAME, segment, ...subpath);
}

// ---- 项目级正式规格路径服务（§1.5 / §2.1）----

/**
 * 项目级正式规格根目录路径。
 * `<projectRoot>/.specforge/project/`
 */
export function projectRoot(projectRoot: string): string {
  return resolveProjectPath(projectRoot, 'project');
}

/**
 * spec_manifest.json 路径。
 * `<projectRoot>/.specforge/project/spec_manifest.json`
 */
export function projectSpecManifest(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.specManifest);
}

/**
 * extension_registry.json 路径。
 * `<projectRoot>/.specforge/project/extension_registry.json`
 */
export function projectExtensionRegistry(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.extensionRegistry);
}

/**
 * requirements_index.md 路径。
 */
export function projectRequirementsIndex(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.requirementsIndex);
}

/**
 * design_index.md 路径。
 */
export function projectDesignIndex(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.designIndex);
}

/**
 * architecture.md 路径。
 */
export function projectArchitecture(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.architecture);
}

/**
 * glossary.md 路径。
 */
export function projectGlossary(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.glossary);
}

/**
 * decisions.md 路径。
 */
export function projectDecisions(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.decisions);
}

/**
 * trace_matrix.md 路径。
 */
export function projectTraceMatrix(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.traceMatrix);
}

/** domain_model.md 路径。 */
export function projectDomainModel(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.domainModel);
}

/** context_map.md 路径。 */
export function projectContextMap(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.contextMap);
}

/** crosscutting_concepts.md 路径。 */
export function projectCrosscuttingConcepts(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.crosscuttingConcepts);
}

/** architecture_risks.md 路径。 */
export function projectArchitectureRisks(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.architectureRisks);
}

/** decisions 目录路径。 */
export function projectDecisionsRoot(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.decisionsRoot);
}

/**
 * modules 根目录路径。
 * `<projectRoot>/.specforge/project/modules/`
 */
export function projectModulesRoot(projectRoot: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.projectFiles.modulesRoot);
}

/**
 * 单个模块根目录路径。
 * `<projectRoot>/.specforge/project/modules/<moduleName>/`
 */
export function moduleRoot(projectRoot: string, moduleName: string): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'project', 'modules', moduleName);
}

/**
 * 单个模块 module.json 路径。
 */
export function moduleJson(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'module.json');
}

/**
 * 单个模块 requirements.md 路径。
 */
export function moduleRequirements(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'requirements.md');
}

/**
 * 单个模块 design.md 路径。
 */
export function moduleDesign(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'design.md');
}

/**
 * 单个模块 trace.md 路径。
 */
export function moduleTrace(projectRoot: string, moduleName: string): string {
  return path.join(moduleRoot(projectRoot, moduleName), 'trace.md');
}

// ---- Work Item 路径服务（§1.5 / §4.2）----

/**
 * Work Items 根目录路径。
 * `<projectRoot>/.specforge/work-items/`
 */
export function workItemsRoot(projectRoot: string): string {
  return resolveProjectPath(projectRoot, 'workItems');
}

/**
 * 单个 Work Item 根目录路径。
 * `<projectRoot>/.specforge/work-items/<workItemId>/`
 */
export function workItemRoot(projectRoot: string, workItemId: string): string {
  return path.join(resolveProjectPath(projectRoot, 'workItems'), workItemId);
}

/**
 * work_item.json 路径。
 */
export function workItemJson(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'work_item.json');
}

/**
 * intake.md 路径。
 */
export function workItemIntake(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'intake.md');
}

/**
 * Work Item runtime log 路径。
 */
export function workItemRuntimeLog(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'runtime.log');
}

/**
 * candidate_manifest.json 路径。
 */
export function workItemCandidateManifest(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'candidate_manifest.json');
}

/**
 * candidates 目录路径。
 */
export function workItemCandidatesRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'candidates');
}

/**
 * gates 目录路径。
 */
export function workItemGatesRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'gates');
}

/**
 * gate_summary.md 路径。
 */
export function workItemGateSummary(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'gate_summary.md');
}

/**
 * user_decision.json 路径。
 */
export function workItemUserDecision(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'user_decision.json');
}

/**
 * verification_report.md 路径。
 */
export function workItemVerificationReport(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'verification_report.md');
}

/**
 * merge_report.md 路径。
 */
export function workItemMergeReport(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'merge_report.md');
}

/**
 * evidence 目录路径。
 */
export function workItemEvidenceRoot(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'evidence');
}

/**
 * evidence_manifest.json 路径。
 */
export function workItemEvidenceManifest(projectRoot: string, workItemId: string): string {
  return path.join(workItemRoot(projectRoot, workItemId), 'evidence', 'evidence_manifest.json');
}

// ---------------------------------------------------------------------------
// Path Policy — 路径策略（§1.6）
// ---------------------------------------------------------------------------

/**
 * 校验路径是否符合 Path Policy 规则（§1.6）。
 *
 * 所有路径必须满足：
 * 1. 使用项目根目录相对路径（不得以 / 开头）
 * 2. 使用 POSIX 风格 /
 * 3. 不允许绝对路径
 * 4. 不允许 ..
 * 5. 不允许 ~
 * 6. 不允许 Windows 反斜杠 \
 * 7. 引用项目规格文件必须带 .specforge/ 前缀
 *
 * @returns 校验结果对象
 */
export function validatePathPolicy(inputPath: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // 3. 不允许绝对路径
  if (inputPath.startsWith('/') || /^[A-Za-z]:/.test(inputPath)) {
    violations.push('absolute_path_not_allowed');
  }

  // 4. 不允许 ..
  if (inputPath.includes('..')) {
    violations.push('parent_traversal_not_allowed');
  }

  // 5. 不允许 ~
  if (inputPath.includes('~')) {
    violations.push('home_shorthand_not_allowed');
  }

  // 6. 不允许 Windows 反斜杠
  if (inputPath.includes('\\')) {
    violations.push('backslash_not_allowed');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * 判断路径是否属于项目级正式规格区域（.specforge/project/）。
 *
 * @deprecated Use packages/workflow-runtime/src/v11/runtime/PathPolicy.ts for permission checks.
 * This function only checks path classification, not permissions.
 */
export function isProjectSpecPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, '/');
  return normalized.startsWith('.specforge/project/');
}

/**
 * 判断路径是否属于 Work Item 区域（.specforge/work-items/）。
 *
 * @deprecated Use packages/workflow-runtime/src/v11/runtime/PathPolicy.ts for permission checks.
 * This function only checks path classification, not permissions.
 */
export function isWorkItemPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, '/');
  return normalized.startsWith('.specforge/work-items/');
}

/**
 * 判断路径是否属于旧 specs 区域（.specforge/specs/）。
 *
 * @deprecated Use packages/workflow-runtime/src/v11/runtime/PathPolicy.ts for permission checks.
 * This function only checks path classification, not permissions.
 */
export function isLegacySpecPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, '/');
  return normalized.startsWith('.specforge/specs/');
}

// ---------------------------------------------------------------------------
// SPEC_USER_DIR_NAME — 用户主目录下 SpecForge 目录的权威名称
// ---------------------------------------------------------------------------

/**
 * SpecForge 用户级数据目录名。
 */
export const SPEC_USER_DIR_NAME = '.specforge' as const;

// ---------------------------------------------------------------------------
// legacyUserLayoutReadOnly — 用户级路径（deprecated）
// ---------------------------------------------------------------------------

/**
 * @deprecated User-level layout is legacy. New code must not write to ~/.specforge/ by default.
 * Only legacy readers may access these paths.
 *
 * `~/.specforge/` 目录下各子路径的只读字典（用户级）。
 * 新代码不得使用此对象。使用 `legacyUserLayoutReadOnly` 仅用于向后兼容读取。
 */
export const legacyUserLayoutReadOnly = {
  /** 运行时状态目录 — `~/.specforge/runtime/` */
  runtime: 'runtime',
  /** 握手文件 — `~/.specforge/runtime/handshake.json` */
  runtimeHandshake: 'runtime/handshake.json',
  /** 持久化状态 — `~/.specforge/runtime/state.json` */
  runtimeState: 'runtime/state.json',
  /** 事件日志 — `~/.specforge/runtime/events.jsonl` */
  runtimeEvents: 'runtime/events.jsonl',
  /** Daemon 锁文件 — `~/.specforge/runtime/daemon.lock` */
  runtimeDaemonLock: 'runtime/daemon.lock',
  /** 主机配置文件 — `~/.specforge/host-profile.json` */
  hostProfile: 'host-profile.json',
  /** 日志目录 — `~/.specforge/logs/` */
  logs: 'logs',
  /** 项目目录 — `~/.specforge/projects/` */
  projects: 'projects',
  /** 模板目录 — `~/.specforge/templates/` */
  templates: 'templates',
  /** 备份目录 — `~/.specforge/backups/` */
  backups: 'backups',
} as const;

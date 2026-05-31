/**
 * directory-layout.ts — SpecForge V6 项目目录布局的单一真相源（Single Source of Truth）
 *
 * 本模块定义 SpecForge 项目根目录下 `.specforge/` 目录的全部子路径常量，
 * 是方案 A（docs/proposals/2026-05-29-directory-structure-governance.md §6.2）
 * 三层架构中"Schema 层"的核心交付物，亦是 P0 阶段的核心产物之一。
 *
 * 设计要点：
 * - 使用 TypeScript `as const` 声明 `SPEC_DIR_NAME` 和 `LAYOUT` 字典，
 *   使 `keyof typeof LAYOUT` 成为字面量联合类型——这是方案 A §8
 *   "三道强制门"中防线 A（编译期防御）的基础设施。
 * - `LAYOUT` 字典中的值是相对于 `<projectRoot>/.specforge/` 的子路径。
 * - 通过 `resolveProjectPath()` / `specPath()` / `agentRunArchivePath()`
 *   三个路径构造函数对外提供路径生成能力——后续 P1 阶段的硬编码字符串
 *   替换工作必须经由这三个函数收口。
 *
 * P0 阶段的隔离承诺：本文件在 P0 完成后不会被任何现有 daemon-core 或
 * tools 代码 import，是孤立模块。首次集成发生在 P1 的代码切换任务中。
 *
 * 关联文档：
 * - 方案 A（docs/proposals/2026-05-29-directory-structure-governance.md）
 * - ADR-006（docs/adr/ADR-006-specforge-dir-naming.md）
 * - WI-010 refactor_plan.md（任务 T1）
 */

/// <reference types="node" />

// 使用 Node.js 内置 path 模块（通过 node: 前缀显式标识）。
// 仅依赖 path.join，不引入任何外部依赖。
import * as path from 'node:path';

// 使用 Node.js 内置 os 模块（用于用户级路径的 os.homedir()）。
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// SPEC_DIR_NAME — 项目根下 SpecForge 目录的权威名称（带点）
// ---------------------------------------------------------------------------

/**
 * SpecForge 在用户项目根目录下创建的工具目录名。
 *
 * **必须使用带点形式 `.specforge`**（与 `.git/` / `.kiro/` / `.opencode/`
 * 风格一致；带点目录在 Unix/Windows 文件管理器默认隐藏，符合
 * "用户不应直接编辑工具内部状态"的语义）。
 *
 * 此处使用 `as const` 声明：任何拼写错误如 `'.SpecForge'` / `'specforge'`
 * 在编译期就被拒绝，这是方案 A §8 防线 A 的核心机制。
 *
 * @example
 * ```ts
 * import { SPEC_DIR_NAME } from '@specforge/types';
 * // SPEC_DIR_NAME === '.specforge'
 * ```
 */
export const SPEC_DIR_NAME = '.specforge' as const;

// ---------------------------------------------------------------------------
// LAYOUT — `.specforge/` 下各子路径的权威字典
// ---------------------------------------------------------------------------

/**
 * `.specforge/` 目录下所有子路径的权威字典。
 *
 * 路径值是相对于 `<projectRoot>/.specforge/` 的子路径片段，不含前导
 * `.specforge/`，由 {@link resolveProjectPath} 等函数负责前缀拼接。
 *
 * 顶层分区（committed 区 vs gitignored 区）依据方案 A §6.2：
 * - **committed 区**（提交到 Git）：manifest / config / specs / knowledge
 * - **gitignored 区**（运行时数据）：runtime / logs / archive / sessions / cas
 *
 * 嵌套对象 `configFiles` 是为提升可发现性而设计的"分组键空间"，
 * 嵌套键不参与 {@link resolveProjectPath} 的 key 选择，但可通过
 * 直接路径拼接使用（见 JSDoc 示例）。
 *
 * @example
 * ```ts
 * import { LAYOUT, SPEC_DIR_NAME } from '@specforge/types';
 * import * as path from 'path';
 *
 * // 顶层 key 用法
 * LAYOUT.runtime;            // 'runtime'
 * LAYOUT.runtimeWal;         // 'runtime/wal.jsonl'
 *
 * // 嵌套 configFiles 用法
 * LAYOUT.configFiles.projectRules;  // 'config/project-rules.md'
 * path.join('/proj', SPEC_DIR_NAME, LAYOUT.configFiles.projectRules);
 * // → '/proj/.specforge/config/project-rules.md'
 * ```
 */
export const LAYOUT = {
  // ---- committed 区（提交到 Git）----
  /** Project manifest（committed）— `<root>/.specforge/manifest.json` */
  manifest: 'manifest.json',

  /** 项目配置目录（committed）— `<root>/.specforge/config/` */
  config: 'config',

  /** 项目配置文件的"分组键空间"。嵌套键不进入 {@link resolveProjectPath}，
   *  应通过直接路径拼接或专用辅助函数使用。 */
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

  /** Work Item 规格目录（committed）— `<root>/.specforge/specs/` */
  specs: 'specs',

  /** specs 目录的 README（committed）— `<root>/.specforge/specs/README.md` */
  specsReadme: 'specs/README.md',

  /** Knowledge 目录（committed）— `<root>/.specforge/knowledge/` */
  knowledge: 'knowledge',

  /** Knowledge Graph 数据（committed）— `<root>/.specforge/knowledge/graph.json` */
  knowledgeGraph: 'knowledge/graph.json',

  // ---- gitignored 区（运行时数据，不提交 Git）----
  /** 运行时状态目录（gitignored）— `<root>/.specforge/runtime/` */
  runtime: 'runtime',

  /** 写前日志（gitignored）— `<root>/.specforge/runtime/wal.jsonl` */
  runtimeWal: 'runtime/wal.jsonl',

  /** 持久化状态（gitignored）— `<root>/.specforge/runtime/state.json` */
  runtimeState: 'runtime/state.json',

  /** 状态快照目录（gitignored）— `<root>/.specforge/runtime/checkpoints/` */
  runtimeCheckpoints: 'runtime/checkpoints',

  /** 日志目录（gitignored）— `<root>/.specforge/logs/` */
  logs: 'logs',

  /** 遥测日志（gitignored）— `<root>/.specforge/logs/telemetry.jsonl` */
  logsTelemetry: 'logs/telemetry.jsonl',

  /** 追踪日志（gitignored）— `<root>/.specforge/logs/trace.jsonl` */
  logsTrace: 'logs/trace.jsonl',

  /** 工具调用日志（gitignored）— `<root>/.specforge/logs/tool_calls.jsonl` */
  logsToolCalls: 'logs/tool_calls.jsonl',

  /** 成本日志（gitignored）— `<root>/.specforge/logs/cost.jsonl` */
  logsCost: 'logs/cost.jsonl',

  /** 会话日志（gitignored）— `<root>/.specforge/logs/conversations.jsonl` */
  logsConversations: 'logs/conversations.jsonl',

  /** Agent Run 归档根目录（gitignored）— `<root>/.specforge/archive/` */
  archive: 'archive',

  /** Agent Run 归档子目录（gitignored）— `<root>/.specforge/archive/agent_runs/` */
  archiveAgentRuns: 'archive/agent_runs',

  /** 会话归档目录（gitignored）— `<root>/.specforge/sessions/` */
  sessions: 'sessions',

  /** 内容寻址存储（gitignored）— `<root>/.specforge/cas/` */
  cas: 'cas',
} as const;

/**
 * `LAYOUT` 字典的"扁平 key"联合类型。
 *
 * 注：嵌套对象 `configFiles` 本身计入键集（因为它是 LAYOUT 的直接 key），
 * 但 `configFiles.*` 的嵌套键不参与该联合类型。
 */
export type LayoutKey = keyof typeof LAYOUT;

// ---------------------------------------------------------------------------
// 路径构造函数（方案 A §6.2 必需的三个入口）
// ---------------------------------------------------------------------------

/**
 * 拼合 `<projectRoot>/.specforge/<LAYOUT[key]>/<...subpath>`，
 * 是后续 P1 阶段全量替换硬编码路径字符串的唯一通用入口。
 *
 * **限制**：`key` 必须是 `LAYOUT` 的顶层 key（含 `'configFiles'`），
 * 嵌套对象 `configFiles` 的子键如 `projectRules` 不能作为 `key` 传入。
 * 若需访问嵌套键，请直接使用 `path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.configFiles.projectRules)`。
 *
 * @param projectRoot 项目根目录绝对路径（如 `/home/user/my-project`）
 * @param key `LAYOUT` 的顶层 key
 * @param subpath 可变长度子路径段，会被 `path.join` 依序拼接到结果末尾
 * @returns 平台原生路径字符串（Windows 用 `\`，Unix 用 `/`）
 *
 * @example
 * ```ts
 * resolveProjectPath('/proj', 'runtime');
 * // → '/proj/.specforge/runtime'
 *
 * resolveProjectPath('/proj', 'specs', 'WI-001', 'design.md');
 * // → '/proj/.specforge/specs/WI-001/design.md'
 *
 * resolveProjectPath('/proj', 'archiveAgentRuns');
 * // → '/proj/.specforge/archive/agent_runs'
 * ```
 */
export function resolveProjectPath(
  projectRoot: string,
  key: LayoutKey,
  ...subpath: string[]
): string {
  const value = LAYOUT[key];
  // 嵌套对象（如 LAYOUT.configFiles）通过 key 传入时，仅拼到 .specforge/<key 名>
  // 不展开内部子项；调用方应改用 LAYOUT.configFiles.<sub> 直接拼接。
  const segment = typeof value === 'string' ? value : key;
  return path.join(projectRoot, SPEC_DIR_NAME, segment, ...subpath);
}

/**
 * 构造单个 Work Item 规格文件的绝对路径，等价于
 * `<projectRoot>/.specforge/specs/<workItemId>/<file>`。
 *
 * 该函数避免上层调用每次手拼 `'specs/' + wi`，是 specs 子路径的专用入口。
 *
 * @param projectRoot 项目根目录绝对路径
 * @param workItemId Work Item ID，如 `'WI-001'`、`'WI-010'`（允许含连字符）
 * @param file 文件名，如 `'requirements.md'`、`'design.md'`、`'refactor_plan.md'`
 * @returns 平台原生路径字符串
 *
 * @example
 * ```ts
 * specPath('/proj', 'WI-001', 'design.md');
 * // → '/proj/.specforge/specs/WI-001/design.md'
 *
 * specPath('/proj', 'WI-010', 'refactor_plan.md');
 * // → '/proj/.specforge/specs/WI-010/refactor_plan.md'
 * ```
 */
export function specPath(
  projectRoot: string,
  workItemId: string,
  file: string,
): string {
  return path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.specs, workItemId, file);
}

/**
 * 构造 Agent Run 归档目录的绝对路径，等价于
 * `<projectRoot>/.specforge/archive/agent_runs/<workItemId>-<agentType>-<runIndex>`。
 *
 * 该函数避免上层手拼 `${wi}-${agent}-${idx}` 字符串格式，
 * 是 Agent Run 归档路径的专用入口。`runIndex` 直接转字符串拼接，
 * 不做零填充（与现有 daemon-core 行为保持一致）。
 *
 * @param projectRoot 项目根目录绝对路径
 * @param workItemId Work Item ID
 * @param agentType Agent 类型字符串，如 `'sf-design'` / `'sf-executor'`
 * @param runIndex Run 序号（自然数，从 1 起）
 * @returns 平台原生路径字符串
 *
 * @example
 * ```ts
 * agentRunArchivePath('/proj', 'WI-001', 'sf-design', 1);
 * // → '/proj/.specforge/archive/agent_runs/WI-001-sf-design-1'
 *
 * agentRunArchivePath('/proj', 'WI-010', 'sf-executor', 99);
 * // → '/proj/.specforge/archive/agent_runs/WI-010-sf-executor-99'
 * ```
 */
export function agentRunArchivePath(
  projectRoot: string,
  workItemId: string,
  agentType: string,
  runIndex: number,
): string {
  const dirName = `${workItemId}-${agentType}-${runIndex}`;
  return path.join(
    projectRoot,
    SPEC_DIR_NAME,
    LAYOUT.archiveAgentRuns,
    dirName,
  );
}

// ---------------------------------------------------------------------------
// SPEC_USER_DIR_NAME — 用户主目录下 SpecForge 目录的权威名称
// ---------------------------------------------------------------------------

/**
 * SpecForge 用户级数据目录名（与 SPEC_DIR_NAME 相同，用于用户主目录下）。
 *
 * 与 {@link SPEC_DIR_NAME} 不同的是，该常量用于 `~/.specforge/` 下的
 * 用户级全局数据（非项目级），如全局运行时状态、日志、模板等。
 *
 * @example
 * ```ts
 * import { SPEC_USER_DIR_NAME } from '@specforge/types';
 * // SPEC_USER_DIR_NAME === '.specforge'
 * ```
 */
export const SPEC_USER_DIR_NAME = '.specforge' as const;

// ---------------------------------------------------------------------------
// USER_LAYOUT — `~/.specforge/` 下各子路径的权威字典（用户级）
// ---------------------------------------------------------------------------

/**
 * `~/.specforge/` 目录下各子路径的权威字典（用户级）。
 *
 * 路径值是相对于 `~/.specforge/` 的子路径片段，不含前导
 * `.specforge/`，由 {@link resolveUserPath} 函数负责前缀拼接。
 *
 * @example
 * ```ts
 * import { USER_LAYOUT, SPEC_USER_DIR_NAME } from '@specforge/types';
 * import * as path from 'path';
 * import * as os from 'os';
 *
 * USER_LAYOUT.runtime;            // 'runtime'
 * USER_LAYOUT.runtimeState;       // 'runtime/state.json'
 * path.join(os.homedir(), SPEC_USER_DIR_NAME, USER_LAYOUT.hostProfile);
 * // → '~/.specforge/host-profile.json'
 * ```
 */
export const USER_LAYOUT = {
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

/**
 * `USER_LAYOUT` 字典的 key 联合类型。
 */
export type UserLayoutKey = keyof typeof USER_LAYOUT;

// ---------------------------------------------------------------------------
// resolveUserPath — 用户级路径构造函数
// ---------------------------------------------------------------------------

/**
 * 拼合 `~/.specforge/<USER_LAYOUT[key]>/<...subpath>` 的路径。
 * 用户级路径总是基于 `os.homedir()`。
 *
 * @param key `USER_LAYOUT` 的顶层 key
 * @param subpath 可变长度子路径段，会被 `path.join` 依序拼接到结果末尾
 * @returns 平台原生路径字符串（基于 `os.homedir()`）
 *
 * @example
 * ```ts
 * resolveUserPath('hostProfile');
 * // → '~/.specforge/host-profile.json'
 *
 * resolveUserPath('projects', 'hash123');
 * // → '~/.specforge/projects/hash123'
 *
 * resolveUserPath('runtime');
 * // → '~/.specforge/runtime'
 * ```
 */
export function resolveUserPath(
  key: UserLayoutKey,
  ...subpath: string[]
): string {
  const value = USER_LAYOUT[key];
  const segment = typeof value === 'string' ? value : key;
  return path.join(os.homedir(), SPEC_USER_DIR_NAME, segment, ...subpath);
}

/**
 * meta-schema.ts — Work Item `_meta.json` 文件的权威 zod schema
 *
 * 本模块定义 SpecForge V6 架构中每个 Work Item 目录下 `_meta.json` 文件的
 * 结构规范，是方案 A（docs/proposals/2026-05-29-directory-structure-governance.md §6.2）
 * 三层架构中"Schema 层"的核心交付物之一（与 directory-layout.ts 并列）。
 *
 * 设计要点：
 * - 使用 zod v3 声明运行期可校验的 schema，并通过 `z.infer<>` 在编译期同步
 *   导出 TypeScript 类型（`WorkItemMeta`），实现"运行期校验 + 编译期类型"
 *   双重防线。
 * - 枚举字段（`workflow_type` / `current_stage`）的合法值来源于本仓库
 *   已部署的 8 类工作流（feature_spec / bugfix_spec / refactor /
 *   investigation / change_request / ops_task / quick_change /
 *   feature_spec_design_first）与现有状态机的所有阶段名。
 *
 * P0 阶段的隔离承诺：本模块在 P0 完成后不会被任何现有 daemon-core 或
 * tools 代码 import，是孤立模块。首次集成发生在 P1 的 `_meta.json`
 * 读写改造任务中。
 *
 * 关联文档：
 * - 方案 A（docs/proposals/2026-05-29-directory-structure-governance.md §6.3）
 * - ADR-006（docs/adr/ADR-006-specforge-dir-naming.md）
 * - WI-010 refactor_plan.md（任务 T2）
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// WORKFLOW_TYPES — 8 类工作流的合法名称
// ---------------------------------------------------------------------------

/**
 * SpecForge V6 已部署的全部工作流类型枚举（`as const` 字面量元组）。
 *
 * 取值与本仓库 `.opencode/skills/sf-workflow-*` 目录命名一一对应。
 * 任何新增工作流类型必须先在此处扩展并同步状态机定义。
 *
 * - `feature_spec`：标准需求驱动工作流（requirements → design → tasks → dev）
 * - `bugfix_spec`：缺陷修复工作流
 * - `refactor`：重构工作流（含 refactor_analysis / refactor_plan 阶段）
 * - `investigation`：调查工作流（无开发/审查/验证阶段）
 * - `change_request`：变更请求工作流
 * - `ops_task`：运维任务工作流
 * - `quick_change`：轻量变更工作流
 * - `feature_spec_design_first`：设计优先工作流（先 design 后 requirements）
 */
export const WORKFLOW_TYPES = [
  'feature_spec',
  'bugfix_spec',
  'refactor',
  'investigation',
  'change_request',
  'ops_task',
  'quick_change',
  'feature_spec_design_first',
] as const;

/**
 * `WORKFLOW_TYPES` 的字面量联合类型（编译期可推导）。
 */
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

// ---------------------------------------------------------------------------
// STAGE_TYPES — 状态机所有阶段名称
// ---------------------------------------------------------------------------

/**
 * SpecForge V6 所有工作流状态机的阶段名称并集（`as const` 字面量元组）。
 *
 * 该联合覆盖 feature_spec / bugfix_spec / refactor / change_request 等
 * 工作流的所有合法阶段。某些阶段仅属于特定工作流（如 `refactor_analysis`
 * 仅 refactor 工作流使用），具体阶段-工作流约束由状态机层校验，本 schema
 * 只做枚举集合层面的合法性检查。
 *
 * - 通用阶段：`intake` / `requirements` / `design` / `tasks` /
 *   `development` / `review` / `verification` / `completed` / `blocked`
 * - refactor 专用：`refactor_analysis` / `refactor_plan` /
 *   `refactor_analysis_gate` / `refactor_plan_gate`
 * - 共享 gate：`verification_gate`
 */
export const STAGE_TYPES = [
  'intake',
  'requirements',
  'design',
  'tasks',
  'development',
  'review',
  'verification',
  'completed',
  'blocked',
  'refactor_analysis',
  'refactor_plan',
  'refactor_analysis_gate',
  'refactor_plan_gate',
  'verification_gate',
] as const;

/**
 * `STAGE_TYPES` 的字面量联合类型（编译期可推导）。
 */
export type StageType = (typeof STAGE_TYPES)[number];

// ---------------------------------------------------------------------------
// WorkItemMetaSchema — `_meta.json` 文件的运行期 zod schema
// ---------------------------------------------------------------------------

/**
 * Work Item `_meta.json` 文件的权威 zod schema。
 *
 * 用 `WorkItemMetaSchema.parse(json)` 校验从磁盘读到的 JSON 对象，
 * 用 `WorkItemMetaSchema.safeParse(json)` 取非抛错的校验结果。
 *
 * 字段说明：
 * - **id**（必填）：Work Item ID，必须形如 `WI-<digits>`，如 `WI-010`
 * - **workflow_type**（必填）：8 类工作流之一，见 {@link WORKFLOW_TYPES}
 * - **title**（必填）：Work Item 标题，非空字符串
 * - **summary**（必填）：摘要，≤ 500 字符（方案 A §6.3 上限）
 * - **key_decisions**（必填）：关键决策列表（每项一段简述），可为空数组
 * - **current_stage**（必填）：当前所处阶段，见 {@link STAGE_TYPES}
 * - **created_at**（必填）：ISO 8601 datetime 字符串（如 `'2026-05-29T08:30:00Z'`）
 * - **completed_at**（可选）：完成时间，ISO 8601 datetime，仅 `current_stage`
 *   为 `completed` 时建议填写
 * - **related_modules**（可选）：相关模块路径列表（如 `['packages/types']`）
 * - **upstream_wis**（可选）：上游 Work Item ID 列表（被依赖的 WI）
 * - **downstream_wis**（可选）：下游 Work Item ID 列表（依赖本 WI 的 WI）
 *
 * @example
 * ```ts
 * import { WorkItemMetaSchema, type WorkItemMeta } from '@specforge/types';
 *
 * const raw = JSON.parse(fs.readFileSync('.specforge/specs/WI-010/_meta.json', 'utf-8'));
 * const meta: WorkItemMeta = WorkItemMetaSchema.parse(raw);
 * console.log(meta.workflow_type); // 类型已收窄到 WorkflowType
 * ```
 */
export const WorkItemMetaSchema = z.object({
  id: z.string().regex(/^WI-\d+$/, 'Work Item ID must match pattern WI-<digits>'),
  workflow_type: z.enum(WORKFLOW_TYPES),
  title: z.string().min(1, 'title must be non-empty'),
  summary: z.string().max(500, 'summary must be ≤ 500 chars'),
  key_decisions: z.array(z.string()),
  current_stage: z.enum(STAGE_TYPES),
  created_at: z.string().datetime({ message: 'created_at must be ISO 8601 datetime' }),
  completed_at: z
    .string()
    .datetime({ message: 'completed_at must be ISO 8601 datetime' })
    .optional(),
  related_modules: z.array(z.string()).optional(),
  upstream_wis: z.array(z.string()).optional(),
  downstream_wis: z.array(z.string()).optional(),
});

/**
 * `_meta.json` 文件的 TypeScript 类型（由 zod schema 推导）。
 *
 * 通过 `z.infer<typeof WorkItemMetaSchema>` 在编译期与运行期 schema 同步，
 * 任何 schema 字段变化都会自动反映到本类型，避免手工维护双重定义。
 */
export type WorkItemMeta = z.infer<typeof WorkItemMetaSchema>;

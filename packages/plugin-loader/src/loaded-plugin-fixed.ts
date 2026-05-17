/**
 * LoadedPlugin 接口定义（任务 1.2.3 核心交付物）
 *
 * 描述一个**已加载、已校验、已实例化**的运行时插件。本文件与 1.2.1 的
 * `manifest.ts`、1.2.2 的 `grants.ts` 配套，构成 PluginLoader 数据模型三件套：
 *
 *   - PluginManifest（1.2.1）: 插件的"静态声明"
 *   - GrantsConfig  （1.2.2）: 系统层"实际授予"，含四层合并语义
 *   - LoadedPlugin  （本文件）: 运行时聚合实例，绑定 manifest + 已合并 grants +
 *                              生命周期状态 + 实例标识
 *
 * 字段约定遵循 REQ-18（持久化必带 schema_version）。注意 LoadedPlugin 是
 * 运行时聚合对象，是否落盘由调用方决定；本接口不强制落盘，但保留
 * schema_version 字段以便快照/事件序列化。
 *
 * 生命周期状态机（参考 design.md §「插件状态监控」与本任务规范）：
 *
 *      ┌──────────┐      校验通过       ┌────────┐      启用      ┌────────┐
 *      │ pending  │────────────────────▶│ loaded │───────────────▶│ active │
 *      └────┬─────┘                     └───┬────┘                └───┬────┘
 *           │                               │                         │
 *           │ 校验失败                      │ 停用                    │ 运行时停用
 *           ▼                               ▼                         ▼
 *      ┌────────┐                      ┌──────────┐ ◀───────────  ┌──────────┐
 *      │ failed │ ◀── * (任意状态)     │ disabled │   运行时启用   │ disabled │
 *      └────────┘                      └──────────┘  ───────────▶ │  active  │
 *                                                                  └──────────┘
 *
 * 合法转移：
 *   pending  → loaded   （manifest/auth/static-check 全部通过）
 *   pending  → failed   （任一校验失败）
 *   loaded   → active   （Plugin Manager 启用插件）
 *   loaded   → disabled （Plugin Manager 在加载完成后立即停用）
 *   active   → disabled （运行时停用，例如用户操作或限速触发）
 *   disabled → active   （运行时重新启用）
 *   *        → failed   （任意状态在出错路径都可进入 failed，便于一致的错误汇聚）
 *
 * 不允许的转移示例：
 *   loaded   → pending  （状态不可回退）
 *   active   → loaded   （状态不可回退）
 *   failed   → *        （除自身外不可恢复，需重新加载到 pending）
 *   *        → 同状态   （视为 no-op，禁止——便于上层日志去重）
 */

import type { PluginManifest } from './manifest';
import type { GrantsConfig } from './grants';
import { isPluginManifest } from './manifest';
import { isGrantsConfig } from './grants';

// ---------------------------------------------------------------------------
// 状态枚举
// ---------------------------------------------------------------------------

/**
 * LoadedPlugin 生命周期状态。
 *
 * - `pending`：刚被发现的插件，尚未走完 manifest/auth/static-check 流程
 * - `loaded`：所有校验通过、模块已实例化，但未启用（不接收事件、不被路由）
 * - `active`：已启用，正常接收事件并参与运行
 * - `disabled`：已加载但被显式停用（用户操作、配置变更、降级等）
 * - `failed`：任一阶段出错，进入终止态，需要重新加载（重置回 `pending`）
 */
export type LoadedPluginState =
  | 'pending'
  | 'loaded'
  | 'active'
  | 'disabled'
  | 'failed';

/** 所有合法状态的常量集合，便于运行时校验 */
export const LOADED_PLUGIN_STATES: ReadonlySet<LoadedPluginState> = new Set<LoadedPluginState>([
  'pending',
  'loaded',
  'active',
  'disabled',
  'failed',
]);

// ---------------------------------------------------------------------------
// LoadedPlugin 接口
// ---------------------------------------------------------------------------

/** 最近一次错误的快照（仅在 state === 'failed' 时通常有值） */
export interface LoadedPluginError {
  /** 简短错误码（machine-readable，例 "MANIFEST_ERROR" / "AUTH_DENIED"） */
  code: string;
  /** 人类可读错误信息 */
  message: string;
  /** Unix ms 时间戳——错误发生时刻 */
  at: number;
}

/**
 * 已加载插件的运行时聚合视图。
 *
 * 必填字段：
 *   - schema_version: 严格字面量 "1.0"
 *   - manifest:       插件清单（来自 1.2.1）
 *   - grants:         **已合并**的授予配置（来自 1.2.2 mergeGrants 的输出）
 *   - state:          当前生命周期状态
 *   - loadedAt:       Unix ms 时间戳——首次完成 manifest 解析的时刻
 *   - instanceId:     运行时唯一 id（与 manifest.id 区分；同一插件多次重载会得到不同 instanceId）
 *
 * 可选字段：
 *   - lastError:      最近一次错误的上下文，便于日志/事件复现
 *
 * 注意：本接口故意**不**包含真实模块对象（`module` / `instance` 等），
 * 因为不同消费方对模块形状要求不同（CommonJS vs ESM、命名导出 vs 默认导出）。
 * 如需绑定具体模块对象，由上层定义扩展接口（例如 `LoadedPluginWithModule<T>`）。
 */
export interface LoadedPlugin {
  schema_version: '1.0';
  manifest: PluginManifest;
  grants: GrantsConfig;
  state: LoadedPluginState;
  loadedAt: number;
  instanceId: string;
  lastError?: LoadedPluginError;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/** 判断 v 是否是有限的非负整数（Unix ms 合法值——允许 0 但不允许负数 / NaN / Infinity） */
function isUnixMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 校验 x 是否是合法的 LoadedPlugin。
 *
 * 校验规则：
 *   1. 必须是普通对象
 *   2. schema_version 必须严格等于字符串 "1.0"
 *   3. manifest 必须通过 isPluginManifest 校验
 *   4. grants 必须通过 isGrantsConfig 校验
 *   5. state 必须是 LOADED_PLUGIN_STATES 中的合法值
 *   6. loadedAt 必须是非负整数（Unix ms）
 *   7. instanceId 必须是非空字符串
 *   8. lastError（如有）必须是普通对象，且 code/message 是非空字符串、at 是非负整数
 *
 * 与 isPluginManifest / isGrantsConfig 一样，本守卫只做"形状 + 值"校验，
 * 不做语义校验（如 state==='failed' 是否必须有 lastError 等）。
 */
export function isLoadedPlugin(x: unknown): x is LoadedPlugin {
  if (!isPlainObject(x)) return false;

  if (x['schema_version'] !== '1.0') return false;

  if (!isPluginManifest(x['manifest'])) return false;
  if (!isGrantsConfig(x['grants'])) return false;

  if (typeof x['state'] !== 'string') return false;
  if (!LOADED_PLUGIN_STATES.has(x['state'] as LoadedPluginState)) return false;

  if (!isUnixMs(x['loadedAt'])) return false;

  if (typeof x['instanceId'] !== 'string' || x['instanceId'].length === 0) return false;

  if (x['lastError'] !== undefined) {
    if (!isPlainObject(x['lastError'])) return false;
    const err = x['lastError'];
    if (typeof err['code'] !== 'string' || err['code'].length === 0) return false;
    if (typeof err['message'] !== 'string') return false;
    if (!isUnixMs(err['at'])) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// 状态转移
// ---------------------------------------------------------------------------

/**
 * 合法转移表（不含 `* → failed` 通配规则——通配规则在 canTransition 中单独处理）。
 *
 * 设计权衡：用 Map<from, Set<to>> 而非二维数组，便于扩展且查表 O(1)。
 */
const TRANSITION_TABLE: ReadonlyMap<LoadedPluginState, ReadonlySet<LoadedPluginState>> = new Map<
  LoadedPluginState,
  ReadonlySet<LoadedPluginState>
>([
  ['pending', new Set<LoadedPluginState>(['loaded', 'failed'])],
  ['loaded', new Set<LoadedPluginState>(['active', 'disabled', 'failed'])],
  ['active', new Set<LoadedPluginState>(['disabled', 'failed'])],
  ['disabled', new Set<LoadedPluginState>(['active', 'failed'])],
  ['failed', new Set<LoadedPluginState>()], // 终止态，无后继（除非外部重置回 pending，由调用方负责）
]);

/**
 * 判断从状态 from 是否允许转移到状态 to。
 *
 * 规则：
 *   - 同状态（from === to）：返回 false（视为 no-op，禁止重复触发）
 *   - 非法状态值（任一不在 LOADED_PLUGIN_STATES 中）：返回 false
 *   - `* → failed`：永远允许（任意状态都可进入失败态）
 *   - 其它：查 TRANSITION_TABLE
 */
export function canTransition(
  from: LoadedPluginState,
  to: LoadedPluginState,
): boolean {
  // 校验输入是否为合法状态
  if (!LOADED_PLUGIN_STATES.has(from)) return false;
  if (!LOADED_PLUGIN_STATES.has(to)) return false;

  // 同状态视为 no-op，禁止
  if (from === to) return false;

  // 通配：任意状态可进入 failed
  if (to === 'failed') return true;

  const allowed = TRANSITION_TABLE.get(from);
  return allowed?.has(to) ?? false;
}
/**
 * PluginRegistry - 插件实例管理器
 *
 * 任务 4.2.1 核心交付物：实现已加载插件的实例管理——跟踪、获取、卸载。
 *
 * 职责：
 *   - 插件实例存储与检索
 *   - 插件生命周期状态管理（与 LoadedPlugin 状态机配合）
 *   - 插件依赖关系解析（任务 4.2.2）
 *   - 插件状态监控（任务 4.2.3）
 *
 * 设计原则：
 *   - 单例模式（全局唯一注册表）
 *   - 线程安全（Map 操作在单线程 Node.js 中天然安全）
 *   - 幂等操作（重复注册/注销不抛异常）
 *   - 状态一致性（所有状态转移通过 canTransition 校验）
 */

import {
  type LoadedPlugin,
  type LoadedPluginState,
  canTransition,
  isLoadedPlugin,
} from '../loaded-plugin';
import type { PluginManifest } from '../manifest';

// ---------------------------------------------------------------------------
// 状态监控类型（任务 4.2.3）
// ---------------------------------------------------------------------------

/**
 * 插件状态变更事件
 */
export interface PluginStateChangeEvent {
  /** 插件 ID */
  pluginId: string;
  /** 变更前的状态 */
  fromState: LoadedPluginState;
  /** 变更后的状态 */
  toState: LoadedPluginState;
  /** 变更时间戳 */
  timestamp: number;
}

/**
 * 状态变更回调函数类型
 */
export type StateChangeCallback = (event: PluginStateChangeEvent) => void | Promise<void>;

/**
 * 状态监控器接口
 */
export interface IPluginStateMonitor {
  /**
   * 注册状态变更监听器
   * @param callback - 状态变更回调函数
   * @returns 取消监听的函数
   */
  onStateChange(callback: StateChangeCallback): () => void;

  /**
   * 获取状态变更历史
   * @param pluginId - 插件 ID（可选，不传则返回所有插件的历史）
   * @returns 状态变更事件数组
   */
  getStateHistory(pluginId?: string): PluginStateChangeEvent[];
}

// ---------------------------------------------------------------------------
// PluginRegistry 接口
// ---------------------------------------------------------------------------

/**
 * 插件注册表核心接口
 */
export interface IPluginRegistry {
  /**
   * 注册插件实例。
   * 若插件已存在（id 相同），抛出 DuplicatePluginError。
   */
  register(plugin: LoadedPlugin): void;

  /**
   * 卸载插件实例。
   * 若插件不存在，无操作（幂等）。
   * 若插件处于 active 状态，先转为 disabled 再注销。
   */
  unregister(pluginId: string): void;

  /**
   * 获取插件实例。
   * 若不存在，返回 null。
   */
  get(pluginId: string): LoadedPlugin | null;

  /**
   * 检查插件是否存在。
   */
  has(pluginId: string): boolean;

  /**
   * 列出所有已注册插件。
   */
  list(): LoadedPlugin[];

  /**
   * 更新插件状态。
   * 使用 LoadedPlugin 状态机的 canTransition 校验转移合法性。
   * 若转移非法，抛出 InvalidStateTransitionError。
   */
  updateState(pluginId: string, newState: LoadedPluginState): void;

  /**
   * 获取注册表统计信息。
   */
  getStats(): PluginRegistryStats;

  /**
   * 获取插件的直接依赖列表。
   * @param pluginId 插件 ID
   * @returns 依赖的插件 ID 数组
   */
  getDependencies(pluginId: string): string[];

  /**
   * 检查插件是否有指定的直接依赖。
   * @param pluginId 插件 ID
   * @param dependencyId 潜在的依赖插件 ID
   * @returns 是否存在直接依赖关系
   */
  hasDependency(pluginId: string, dependencyId: string): boolean;

  /**
   * 解析插件的完整依赖链（递归查找所有依赖）。
   * @param pluginId 插件 ID
   * @returns 依赖链数组
   */
  resolveDependencies(pluginId: string): string[];

  /**
   * 检测插件注册表中是否存在循环依赖。
   * @returns 如果存在循环依赖，返回包含循环路径的数组；否则返回 null
   */
  detectCycle(): string[] | null;

  /**
   * 对已注册的插件进行拓扑排序。
   * @returns 排序后的插件数组
   */
  topologicalSort(): LoadedPlugin[];

  // ---------------------------------------------------------------------------
  // 状态监控（任务 4.2.3）
  // ---------------------------------------------------------------------------

  /**
   * 注册状态变更监听器
   * @param callback - 状态变更回调函数
   * @returns 取消监听的函数
   */
  onStateChange(callback: StateChangeCallback): () => void;

  /**
   * 获取状态变更历史
   * @param pluginId - 插件 ID（可选，不传则返回所有插件的历史）
   * @returns 状态变更事件数组
   */
  getStateHistory(pluginId?: string): PluginStateChangeEvent[];
}

/**
 * 注册表统计信息
 */
export interface PluginRegistryStats {
  total: number;
  byState: Record<LoadedPluginState, number>;
}

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

/**
 * 重复注册错误
 */
export class DuplicatePluginError extends Error {
  constructor(public readonly pluginId: string) {
    super(`插件 "${pluginId}" 已存在，不能重复注册`);
    this.name = 'DuplicatePluginError';
  }
}

/**
 * 插件不存在错误
 */
export class PluginNotFoundError extends Error {
  constructor(public readonly pluginId: string) {
    super(`插件 "${pluginId}" 未找到`);
    this.name = 'PluginNotFoundError';
  }
}

/**
 * 无效状态转移错误
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly fromState: LoadedPluginState,
    public readonly toState: LoadedPluginState,
  ) {
    super(
      `插件 "${pluginId}" 不能从状态 "${fromState}" 转移到 "${toState}"`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}

// ---------------------------------------------------------------------------
// PluginRegistry 实现
// ---------------------------------------------------------------------------

/**
 * 插件注册表实现
 *
 * 线程安全说明：
 *   Node.js/Bun 是单线程事件循环，Map 操作天然线程安全。
 *   若未来需要多线程支持，需加锁（使用 `lockfile` 或 `async-mutex`）。
 */
export class PluginRegistry implements IPluginRegistry {
  /** 插件实例存储：key 为 plugin.id（不是 instanceId） */
  private plugins = new Map<string, LoadedPlugin>();

  /** 状态监控器（任务 4.2.3） */
  private stateMonitor: PluginStateMonitor = getStateMonitor();

  /**
   * 注册插件实例。
   * 若插件已存在（id 相同），抛出 DuplicatePluginError。
   */
  register(plugin: LoadedPlugin): void {
    // 类型校验
    if (!isLoadedPlugin(plugin)) {
      throw new Error('无效的 LoadedPlugin 对象');
    }

    const { id } = plugin.manifest;

    // 检查重复
    if (this.plugins.has(id)) {
      throw new DuplicatePluginError(id);
    }

    // 注册
    this.plugins.set(id, plugin);
  }

  /**
   * 卸载插件实例。
   * 若插件不存在，无操作（幂等）。
   * 若插件处于 active 状态，先转为 disabled 再注销。
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      // 幂等：不存在则无操作
      return;
    }

    // 如果是 active 状态，先转为 disabled 再注销
    // 这符合 design.md 的状态机语义
    if (plugin.state === 'active') {
      plugin.state = 'disabled';
    }

    this.plugins.delete(pluginId);
  }

  /**
   * 获取插件实例。
   * 若不存在，返回 null。
   */
  get(pluginId: string): LoadedPlugin | null {
    return this.plugins.get(pluginId) ?? null;
  }

  /**
   * 检查插件是否存在。
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * 列出所有已注册插件。
   */
  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 更新插件状态。
   * 使用 LoadedPlugin 状态机的 canTransition 校验转移合法性。
   * 若转移非法，抛出 InvalidStateTransitionError。
   * 状态变更会触发事件通知（任务 4.2.3）。
   */
  updateState(pluginId: string, newState: LoadedPluginState): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginNotFoundError(pluginId);
    }

    const fromState = plugin.state;

    // 使用状态机的 canTransition 校验
    if (!canTransition(fromState, newState)) {
      throw new InvalidStateTransitionError(pluginId, fromState, newState);
    }

    // 执行状态转移
    plugin.state = newState;

    // 触发状态变更事件通知（任务 4.2.3）
    this.stateMonitor.emitStateChange({
      pluginId,
      fromState,
      toState: newState,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取注册表统计信息。
   */
  getStats(): PluginRegistryStats {
    const byState: Record<LoadedPluginState, number> = {
      pending: 0,
      loaded: 0,
      active: 0,
      disabled: 0,
      failed: 0,
    };

    for (const plugin of this.plugins.values()) {
      byState[plugin.state]++;
    }

    return {
      total: this.plugins.size,
      byState,
    };
  }

  // ---------------------------------------------------------------------------
  // 依赖解析（任务 4.2.2）
  // ---------------------------------------------------------------------------

  /**
   * 获取插件的直接依赖列表。
   * @param pluginId 插件 ID
   * @returns 依赖的插件 ID 数组（若无依赖则返回空数组）
   */
  getDependencies(pluginId: string): string[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginNotFoundError(pluginId);
    }

    const deps = plugin.manifest.dependencies;
    if (!deps || typeof deps !== 'object') {
      return [];
    }

    return Object.keys(deps);
  }

  /**
   * 检查插件是否有指定的直接依赖。
   * @param pluginId 插件 ID
   * @param dependencyId 潜在的依赖插件 ID
   * @returns 是否存在直接依赖关系
   */
  hasDependency(pluginId: string, dependencyId: string): boolean {
    const dependencies = this.getDependencies(pluginId);
    return dependencies.includes(dependencyId);
  }

  /**
   * 解析插件的完整依赖链（递归查找所有依赖）。
   * 使用后序遍历（先访问依赖，再访问自身），确保依赖排在前面。
   * 注意：只返回在注册表中存在的依赖，不存在的依赖被忽略。
   * @param pluginId 插件 ID
   * @returns 依赖链数组（包含所有传递依赖，不含自身）
   */
  resolveDependencies(pluginId: string): string[] {
    // 使用 path 检测循环，visited 用于避免重复处理
    const visited = new Set<string>();
    const path = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      // 检测循环依赖
      if (path.has(id)) {
        return;
      }

      // 已处理过（不在当前路径上），跳过
      if (visited.has(id)) {
        return;
      }

      // 只处理在注册表中存在的插件
      const plugin = this.plugins.get(id);
      if (!plugin) {
        // 依赖不存在，不加入结果（由调用方通过 detectCycle 单独检查）
        return;
      }

      // 加入当前路径
      path.add(id);

      const deps = plugin.manifest.dependencies;
      if (deps && typeof deps === 'object') {
        const depIds = Object.keys(deps);

        // 先递归访问所有依赖
        for (const depId of depIds) {
          dfs(depId);
        }
      }

      // 离开节点，从当前路径移除，标记为已处理
      path.delete(id);
      visited.add(id);

      // 后序：依赖处理完后，将自身加入结果
      // 但不加入 pluginId 自身（这是查询的起点）
      if (id !== pluginId) {
        result.push(id);
      }
    };

    dfs(pluginId);

    return result;
  }

  /**
   * 检测插件注册表中是否存在循环依赖。
   * @returns 如果存在循环依赖，返回包含循环路径的数组；否则返回 null
   */
  detectCycle(): string[] | null {
    const graph = new Map<string, string[]>();

    // 构建依赖图
    for (const [id, plugin] of this.plugins) {
      const deps = plugin.manifest.dependencies;
      if (deps && typeof deps === 'object') {
        graph.set(id, Object.keys(deps));
      } else {
        graph.set(id, []);
      }
    }

    // DFS 检测环
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) ?? [];

      for (const neighbor of neighbors) {
        // 只检查在注册表中的节点
        if (!this.plugins.has(neighbor)) {
          continue;
        }

        if (!visited.has(neighbor)) {
          const result = dfs(neighbor);
          if (result) {
            return result;
          }
        } else if (recStack.has(neighbor)) {
          // 找到环：提取从 neighbor 开始的路径
          const cycleStart = path.indexOf(neighbor);
          const cycle = [...path.slice(cycleStart), neighbor];
          path.pop();
          recStack.delete(node);
          return cycle;
        }
      }

      path.pop();
      recStack.delete(node);
      return null;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node);
        if (cycle) {
          return cycle;
        }
      }
    }

    return null;
  }

  /**
   * 对已注册的插件进行拓扑排序。
   * 返回按加载顺序排列的数组（依赖排在被依赖者之前）。
   * @returns 排序后的插件数组
   * @throws 如果存在循环依赖，抛出 CyclicDependencyError
   */
  topologicalSort(): LoadedPlugin[] {
    // 先检测循环依赖
    const cycle = this.detectCycle();
    if (cycle) {
      throw new CyclicDependencyError(cycle);
    }

    const result: LoadedPlugin[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (id: string): void => {
      if (temp.has(id)) {
        // 理论上不会到这里，因为已检测环，但作为防御性编程
        return;
      }

      if (visited.has(id)) {
        return;
      }

      temp.add(id);

      const plugin = this.plugins.get(id);
      if (plugin) {
        const deps = plugin.manifest.dependencies;
        if (deps && typeof deps === 'object') {
          for (const depId of Object.keys(deps)) {
            // 只访问在注册表中的依赖
            if (this.plugins.has(depId)) {
              visit(depId);
            }
          }
        }
      }

      temp.delete(id);
      visited.add(id);

      const p = this.plugins.get(id);
      if (p) {
        result.push(p);
      }
    };

    for (const id of this.plugins.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // 状态监控实现（任务 4.2.3）
  // ---------------------------------------------------------------------------

  /**
   * 注册状态变更监听器
   * @param callback - 状态变更回调函数
   * @returns 取消监听的函数
   */
  onStateChange(callback: StateChangeCallback): () => void {
    return this.stateMonitor.onStateChange(callback);
  }

  /**
   * 获取状态变更历史
   * @param pluginId - 插件 ID（可选，不传则返回所有插件的历史）
   * @returns 状态变更事件数组
   */
  getStateHistory(pluginId?: string): PluginStateChangeEvent[] {
    return this.stateMonitor.getStateHistory(pluginId);
  }
}

// ---------------------------------------------------------------------------
// 循环依赖错误
// ---------------------------------------------------------------------------

/**
 * 循环依赖错误
 */
export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`检测到循环依赖: ${cycle.join(' -> ')}`);
    this.name = 'CyclicDependencyError';
  }
}

// ---------------------------------------------------------------------------
// 状态监控实现（任务 4.2.3）
// ---------------------------------------------------------------------------

/**
 * 插件状态监控器实现
 * 负责追踪所有插件的状态变更事件
 */
class PluginStateMonitor implements IPluginStateMonitor {
  private callbacks: Set<StateChangeCallback> = new Set();
  private history: PluginStateChangeEvent[] = [];

  /**
   * 注册状态变更监听器
   * @param callback - 状态变更回调函数
   * @returns 取消监听的函数
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.callbacks.add(callback);
    // 返回取消监听函数
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 触发状态变更事件
   * @param event - 状态变更事件
   */
  async emitStateChange(event: PluginStateChangeEvent): Promise<void> {
    // 记录历史
    this.history.push(event);

    // 通知所有监听器
    const promises: Promise<void>[] = [];
    for (const callback of this.callbacks) {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error('状态变更回调执行失败:', error);
      }
    }

    // 等待所有异步回调完成
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * 获取状态变更历史
   * @param pluginId - 插件 ID（可选，不传则返回所有插件的历史）
   * @returns 状态变更事件数组
   */
  getStateHistory(pluginId?: string): PluginStateChangeEvent[] {
    if (pluginId === undefined) {
      return [...this.history];
    }
    return this.history.filter((e) => e.pluginId === pluginId);
  }

  /**
   * 清除指定插件的状态历史
   * @param pluginId - 插件 ID
   */
  clearHistory(pluginId?: string): void {
    if (pluginId === undefined) {
      this.history = [];
    } else {
      this.history = this.history.filter((e) => e.pluginId !== pluginId);
    }
  }
}

// ---------------------------------------------------------------------------
// 单例实例
// ---------------------------------------------------------------------------

let registryInstance: PluginRegistry | null = null;
let stateMonitorInstance: PluginStateMonitor | null = null;

/**
 * 获取 PluginStateMonitor 单例实例
 */
function getStateMonitor(): PluginStateMonitor {
  if (!stateMonitorInstance) {
    stateMonitorInstance = new PluginStateMonitor();
  }
  return stateMonitorInstance;
}

/**
 * 重置状态监控器（仅用于测试）
 */
export function resetStateMonitor(): void {
  stateMonitorInstance = null;
}

/**
 * 获取 PluginRegistry 单例实例。
 * 方便全局访问，避免层层传递。
 */
export function getPluginRegistry(): PluginRegistry {
  if (!registryInstance) {
    registryInstance = new PluginRegistry();
  }
  return registryInstance;
}

/**
 * 重置单例实例（仅用于测试）
 */
export function resetPluginRegistry(): void {
  registryInstance = null;
  // 同时重置状态监控器，确保测试隔离
  stateMonitorInstance = null;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 根据 manifest 创建 LoadedPlugin 实例。
 * 这是注册前的构造辅助函数。
 * 
 * @param manifest - 插件清单
 * @param grants - 授权配置
 * @param _entryDir - 插件目录路径（用于热重载，内部使用）
 */
export function createLoadedPlugin(
  manifest: PluginManifest,
  grants: { schema_version: '1.0'; grantedPermissions: string[] },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _entryDir?: string,
): LoadedPlugin {
  return {
    schema_version: '1.0',
    manifest,
    grants: grants as any,
    state: 'pending',
    loadedAt: Date.now(),
    instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
}
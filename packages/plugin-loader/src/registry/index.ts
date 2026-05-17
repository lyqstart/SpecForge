/**
 * Plugin Registry - 插件实例管理模块导出
 */

export * from './plugin-registry';

// 兼容性别名（保持与旧代码的兼容性）
export { getPluginRegistry as createPluginRegistry } from './plugin-registry';

// 状态监控导出（任务 4.2.3）
export type {
  PluginStateChangeEvent,
  StateChangeCallback,
  IPluginStateMonitor,
} from './plugin-registry';
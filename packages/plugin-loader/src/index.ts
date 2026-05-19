/**
 * Plugin Loader - Main Entry Point
 * Exports all public types and utilities
 */

// Re-export core data models (Task 1.2.1-1.2.3)
export * from './manifest';
export * from './grants';
export * from './loaded-plugin';

// Re-export event model (Task 1.2.4)
export * from './events';

// Re-export Event Bus integration (Task 1.3)
export * from './plugin-events';

// Re-export permission validator (Task 1.4)
export * from './permission-validator';

// Re-export permission declaration validator (Task 3.1.2)
export * from './permission-declaration-validator';

// Re-export static checker (Task 2.1.3)
export * from './static-checker';
export * from './StaticAnalyzer';

// Re-export path utilities (Task 2.3.1)
export * from './utils/path-utils';

// Re-export plugin discovery (Task 4.1.1)
export * from './loader/discovery';

// Re-export plugin loader (Task 4.1.2, 4.1.3)
export * from './loader/plugin-loader';

// Re-export file watcher (Task 4.3.1)
export * from './loader/file-watcher';

// Re-export hot reload (Task 4.3.1)
export * from './loader/hot-reload';

// Re-export plugin registry (Task 4.2.1)
export * from './registry';

// Re-export error recovery (Task 5.2.3)
export * from './error-recovery';

// Re-export audit logger (Task 5.3.1)
export * from './audit-log';

// Re-export DaemonInit (Task 6.1.2)
export * from './daemon-init';

// Re-export Tool Registry integration (Task 8.3.2)
// 只导出接口和类名，实际实现在 tool-registry-integration.ts
export type {
  PluginTool,
  PluginToolRegistration,
  ToolRegistry,
  ToolCallRequest,
  ToolCallResult,
  PermissionChecker,
} from './tool-registry-integration';

export {
  InMemoryToolRegistry,
  ToolInvoker,
  PluginToolManager,
} from './tool-registry-integration';
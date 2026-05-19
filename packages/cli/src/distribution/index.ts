/**
 * Distribution 模块桶式导出
 * 
 * 本文件作为 distribution 模块的统一入口，导出所有公开类型和接口。
 */

// 导出所有类型定义
export * from './types.js';

// 导出 Scope Gate Bridge（P1/P2 flag keys 真值来源）
export type { ScopeGateExports } from './scope-gate-bridge.js';
export { 
  getP1P2FlagKeys, 
  createScopeGateExports 
} from './scope-gate-bridge.js';
export { default as scopeGateExports } from './scope-gate-bridge.js';

// 导出 PackageValidator（发布流水线验证器）
export { validate } from './package-validator.js';

// 导出 SchemaVersionManager（schema_version 管理）
export { SchemaVersionManager } from './schema-version-manager.js';

// 导出 PathResolver（路径解析工具）
export type { PathResolver } from '../utils/path-resolver.js';
export { DefaultPathResolver, pathResolver } from '../utils/path-resolver.js';

// 导出 InstallationRecord 读写函数
export type { LoadInstallationRecordResult } from './installation-record.js';
export { 
  writeInstallationRecord, 
  loadInstallationRecord 
} from './installation-record.js';

// 导出 DefaultConfigGenerator（默认配置生成器）
export { 
  generateDefaultConfig,
  validateGeneratedYaml 
} from './default-config-generator.js';

// 导出 DaemonHealthCheck（daemon 启动健康检查）
export { 
  runDaemonHealthCheck,
  getDaemonHealthCheckStatus,
  createHealthCheckHook 
} from './daemon-healthcheck.js';

/**
 * Distribution 模块桶式导出
 * 
 * 本文件作为 distribution 模块的统一入口，导出所有公开类型和接口。
 */

// 导出所有类型定义
export * from './types.js';

// 导出 PackageValidator（发布流水线验证器）
export { validate } from './package-validator.js';

// 导出 SchemaVersionManager（schema_version 管理）
export { SchemaVersionManager } from './schema-version-manager.js';

// 导出当前用户根解析工具。
export type { PathResolver } from '../utils/path-resolver.js';
export { DefaultPathResolver, pathResolver } from '../utils/path-resolver.js';

/**
 * 清单模块导出
 *
 * 暴露清单相关的所有公开接口：
 *   - PluginManifest 数据模型
 *   - ManifestParser 解析器
 *   - 错误类型
 *   - 迁移注册接口
 */

// 直接从 parser.ts 导出所有内容
export {
  ManifestParser,
  ManifestParseError,
  ManifestFileNotFoundError,
  ManifestFormatError,
  ManifestValidationError,
  ManifestSchemaMigrationError,
  registerMigration,
} from './parser';

// 重新导出数据模型（从 parser.ts 的导入）
export type { PluginManifest, PluginPermission, PluginManifestMetadata } from '../manifest';
export { isPluginManifest, isValidSemver } from '../manifest';

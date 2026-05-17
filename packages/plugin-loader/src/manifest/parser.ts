/**
 * ManifestParser 实现（任务 1.3 核心交付物）
 *
 * 职责：
 *   1. 从文件系统读取清单文件（支持 JSON 和 YAML 格式）
 *   2. 解析清单内容为 PluginManifest 对象
 *   3. 验证清单的格式和内容正确性
 *   4. 支持 schema_version 迁移骨架（为未来版本演进预留）
 *
 * 设计原则：
 *   - 显式错误报告：每个失败都返回详细的错误信息，便于调试
 *   - 类型安全：使用 isPluginManifest 守卫确保返回值类型正确
 *   - 可扩展性：迁移骨架为未来 schema 版本演进预留接口
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { PluginManifest } from '../manifest';
import { isPluginManifest } from '../manifest';

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

/**
 * 清单解析失败的错误基类。
 * 所有 ManifestParser 抛出的错误都继承自此类，便于上层统一捕获。
 */
export class ManifestParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ManifestParseError';
  }
}

/**
 * 清单文件不存在或无法读取。
 */
export class ManifestFileNotFoundError extends ManifestParseError {
  constructor(filePath: string, cause?: Error) {
    super(
      'MANIFEST_FILE_NOT_FOUND',
      `清单文件不存在或无法读取: ${filePath}`,
      cause,
    );
    this.name = 'ManifestFileNotFoundError';
  }
}

/**
 * 清单文件格式错误（JSON/YAML 解析失败）。
 */
export class ManifestFormatError extends ManifestParseError {
  constructor(filePath: string, format: 'json' | 'yaml', cause?: Error) {
    super(
      'MANIFEST_FORMAT_ERROR',
      `清单文件 ${format.toUpperCase()} 格式错误: ${filePath}`,
      cause,
    );
    this.name = 'ManifestFormatError';
  }
}

/**
 * 清单内容验证失败（字段缺失、类型错误等）。
 */
export class ManifestValidationError extends ManifestParseError {
  constructor(filePath: string, reason: string) {
    super(
      'MANIFEST_VALIDATION_ERROR',
      `清单验证失败 (${filePath}): ${reason}`,
    );
    this.name = 'ManifestValidationError';
  }
}

/**
 * 清单 schema_version 不支持或迁移失败。
 */
export class ManifestSchemaMigrationError extends ManifestParseError {
  constructor(filePath: string, version: unknown, reason?: string) {
    super(
      'MANIFEST_SCHEMA_MIGRATION_ERROR',
      `清单 schema_version 不支持或迁移失败 (${filePath}): version=${JSON.stringify(version)}${reason ? `, ${reason}` : ''}`,
    );
    this.name = 'ManifestSchemaMigrationError';
  }
}

// ---------------------------------------------------------------------------
// 迁移骨架
// ---------------------------------------------------------------------------

/**
 * 迁移函数的签名。
 * 将旧版本的清单对象迁移到新版本。
 *
 * @param manifest 旧版本的清单对象（已解析但未验证）
 * @param fromVersion 源版本号
 * @param toVersion 目标版本号
 * @returns 迁移后的清单对象
 * @throws ManifestSchemaMigrationError 如果迁移失败
 */
type MigrationFn = (
  manifest: unknown,
  fromVersion: string,
  toVersion: string,
) => unknown;

/**
 * 迁移注册表。
 * 键为 "fromVersion→toVersion" 的格式，值为迁移函数。
 *
 * 例如：
 *   "0.9→1.0": (manifest) => { ... }
 *
 * 设计说明：
 *   - 支持链式迁移（例如 0.8→0.9→1.0）
 *   - 每个迁移函数应该是幂等的（多次调用结果相同）
 *   - 迁移函数应该保留未知字段（向前兼容）
 */
const MIGRATION_REGISTRY: Map<string, MigrationFn> = new Map();

/**
 * 注册一个迁移函数。
 *
 * @param fromVersion 源版本号
 * @param toVersion 目标版本号
 * @param fn 迁移函数
 */
export function registerMigration(
  fromVersion: string,
  toVersion: string,
  fn: MigrationFn,
): void {
  const key = `${fromVersion}→${toVersion}`;
  MIGRATION_REGISTRY.set(key, fn);
}

/**
 * 执行迁移链。
 * 从 fromVersion 迁移到 toVersion，可能需要多步迁移。
 *
 * 当前实现采用简单的"直接查表"策略：
 *   - 如果存在 fromVersion→toVersion 的直接迁移，使用它
 *   - 否则抛出错误（不支持自动链式迁移）
 *
 * 未来可扩展为 BFS/DFS 自动寻找迁移路径。
 *
 * @param manifest 待迁移的清单对象
 * @param fromVersion 源版本号
 * @param toVersion 目标版本号
 * @returns 迁移后的清单对象
 * @throws ManifestSchemaMigrationError 如果无法找到迁移路径
 */
function executeMigration(
  manifest: unknown,
  fromVersion: string,
  toVersion: string,
): unknown {
  if (fromVersion === toVersion) {
    return manifest;
  }

  const key = `${fromVersion}→${toVersion}`;
  const migrationFn = MIGRATION_REGISTRY.get(key);

  if (!migrationFn) {
    throw new ManifestSchemaMigrationError(
      '<unknown>',
      fromVersion,
      `无法找到从 ${fromVersion} 到 ${toVersion} 的迁移路径`,
    );
  }

  try {
    return migrationFn(manifest, fromVersion, toVersion);
  } catch (err) {
    throw new ManifestSchemaMigrationError(
      '<unknown>',
      fromVersion,
      `迁移函数执行失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 文件格式检测与解析
// ---------------------------------------------------------------------------

/**
 * 根据文件扩展名检测格式。
 *
 * @param filePath 文件路径
 * @returns 'json' | 'yaml' | 'unknown'
 */
function detectFormat(filePath: string): 'json' | 'yaml' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return 'unknown';
}

/**
 * 解析 JSON 字符串。
 *
 * @param content 文件内容
 * @param filePath 文件路径（用于错误报告）
 * @returns 解析后的对象
 * @throws ManifestFormatError 如果 JSON 格式错误
 */
function parseJSON(content: string, filePath: string): unknown {
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new ManifestFormatError(filePath, 'json', err instanceof Error ? err : undefined);
  }
}

/**
 * 解析 YAML 字符串。
 *
 * 当前实现：
 *   - 如果 yaml 包可用，使用 yaml.parse()
 *   - 否则抛出错误（YAML 支持需要额外依赖）
 *
 * @param content 文件内容
 * @param filePath 文件路径（用于错误报告）
 * @returns 解析后的对象
 * @throws ManifestFormatError 如果 YAML 格式错误或不支持
 */
function parseYAML(content: string, filePath: string): unknown {
  try {
    // 尝试动态导入 yaml 包
    // 注意：这里使用 require 是为了支持可选依赖
    // 生产环境应该在 package.json 中声明 yaml 为可选依赖
    const yaml = require('yaml');
    return yaml.parse(content);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      throw new ManifestFormatError(
        filePath,
        'yaml',
        new Error('YAML 支持需要安装 yaml 包（npm install yaml）'),
      );
    }
    throw new ManifestFormatError(filePath, 'yaml', err instanceof Error ? err : undefined);
  }
}

/**
 * 根据格式解析内容。
 *
 * @param content 文件内容
 * @param format 文件格式
 * @param filePath 文件路径（用于错误报告）
 * @returns 解析后的对象
 * @throws ManifestFormatError 如果格式不支持或解析失败
 */
function parseContent(
  content: string,
  format: 'json' | 'yaml' | 'unknown',
  filePath: string,
): unknown {
  if (format === 'json') {
    return parseJSON(content, filePath);
  }
  if (format === 'yaml') {
    return parseYAML(content, filePath);
  }
  throw new ManifestFormatError(
    filePath,
    'unknown',
    new Error(`不支持的文件格式（期望 .json 或 .yaml/.yml）`),
  );
}

// ---------------------------------------------------------------------------
// ManifestParser 类
// ---------------------------------------------------------------------------

/**
 * 清单解析器。
 *
 * 职责：
 *   1. 从文件系统读取清单文件
 *   2. 解析 JSON/YAML 格式
 *   3. 验证清单内容
 *   4. 支持 schema_version 迁移
 *
 * 使用示例：
 *   const parser = new ManifestParser();
 *   const manifest = await parser.parse('/path/to/plugin.json');
 */
export class ManifestParser {
  /**
   * 从文件解析清单。
   *
   * 流程：
   *   1. 读取文件内容
   *   2. 检测文件格式（JSON/YAML）
   *   3. 解析内容为对象
   *   4. 检查 schema_version 字段
   *   5. 如果版本不是 "1.0"，执行迁移
   *   6. 验证清单内容（使用 isPluginManifest 守卫）
   *   7. 返回验证后的 PluginManifest
   *
   * @param filePath 清单文件路径
   * @returns 解析后的 PluginManifest
   * @throws ManifestFileNotFoundError 如果文件不存在
   * @throws ManifestFormatError 如果格式错误
   * @throws ManifestSchemaMigrationError 如果迁移失败
   * @throws ManifestValidationError 如果验证失败
   */
  async parse(filePath: string): Promise<PluginManifest> {
    // 1. 读取文件
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      throw new ManifestFileNotFoundError(filePath, err instanceof Error ? err : undefined);
    }

    // 2. 检测格式
    const format = detectFormat(filePath);

    // 3. 解析内容
    const parsed = parseContent(content, format, filePath);

    // 4. 检查 schema_version
    const schemaVersion = (parsed as Record<string, unknown>)?.['schema_version'];

    // 5. 迁移（如需要）
    let manifest = parsed;
    if (schemaVersion !== '1.0') {
      if (typeof schemaVersion !== 'string') {
        throw new ManifestSchemaMigrationError(
          filePath,
          schemaVersion,
          'schema_version 字段缺失或类型错误',
        );
      }
      manifest = executeMigration(manifest, schemaVersion, '1.0');
    }

    // 6. 验证清单
    if (!isPluginManifest(manifest)) {
      throw new ManifestValidationError(
        filePath,
        '清单对象不符合 PluginManifest 接口规范',
      );
    }

    // 7. 返回
    return manifest;
  }

  /**
   * 验证清单对象（不涉及文件 I/O）。
   *
   * 用于已经解析的对象进行验证，例如从 API 接收的 JSON。
   *
   * @param manifest 待验证的对象
   * @returns 验证结果
   */
  validate(manifest: unknown): { valid: boolean; error?: string } {
    if (!isPluginManifest(manifest)) {
      return {
        valid: false,
        error: '清单对象不符合 PluginManifest 接口规范',
      };
    }
    return { valid: true };
  }

  /**
   * 执行迁移（暴露给上层的公开接口）。
   *
   * @param manifest 待迁移的清单对象
   * @param fromVersion 源版本号
   * @param toVersion 目标版本号
   * @returns 迁移后的清单对象
   * @throws ManifestSchemaMigrationError 如果迁移失败
   */
  migrate(manifest: unknown, fromVersion: string, toVersion: string): unknown {
    return executeMigration(manifest, fromVersion, toVersion);
  }
}

// ---------------------------------------------------------------------------
// 导出（已在上面通过 export class 声明）
// ---------------------------------------------------------------------------
// ManifestParser 已通过 export class 声明，无需重复导出

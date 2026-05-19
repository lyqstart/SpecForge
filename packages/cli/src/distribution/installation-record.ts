/**
 * Installation Record - 安装记录的读写操作
 * 
 * 本模块实现 design.md 中定义的 InstallationRecord 持久化逻辑：
 * - writeInstallationRecord: 原子写入 ~/.specforge/.installation.json
 * - loadInstallationRecord: 读取并解析，返回封闭枚举结果
 * 
 * Requirements: 4.3, 4.5, 6.3
 * 
 * 设计约束：
 * - schema_version 严格等于 SchemaVersionManager.baseline（不读盘）
 * - 时间戳使用 ISO 8601 UTC 毫秒精度（new Date().toISOString()）
 * - 使用 FilesystemAdapter.writeAtomic 保证原子性
 * - 返回封闭枚举类型，明确区分各种失败情况
 * 
 * @module installation-record
 */

import * as path from 'node:path';
import type { InstallationRecord } from './types.js';
import { filesystemAdapter } from '../utils/filesystem-adapter.js';
import { SchemaVersionManager } from './schema-version-manager.js';

/**
 * 加载安装记录的结果类型（封闭枚举）
 * 
 * 四种可能的结果：
 * - missing: 文件不存在
 * - unparseable: JSON 解析失败
 * - missing_field: 缺少必需字段
 * - ok: 成功加载，包含完整的 InstallationRecord
 */
export type LoadInstallationRecordResult =
  | { kind: 'missing' }
  | { kind: 'unparseable' }
  | { kind: 'missing_field' }
  | { kind: 'ok'; record: InstallationRecord };

/**
 * 写入安装记录到 ~/.specforge/.installation.json
 * 
 * 约束：
 * - schema_version 字段严格等于 SchemaVersionManager.baseline
 * - installedAt 时间戳使用 ISO 8601 UTC 毫秒精度
 * - 使用 FilesystemAdapter.writeAtomic 保证原子性（tmp + rename）
 * 
 * @param root - 安装根目录（通常是 ~/.specforge/）
 * @param record - 安装记录对象
 * @throws 写入失败时抛错（由 FilesystemAdapter.writeAtomic 抛出）
 * 
 * @example
 * await writeInstallationRecord('~/.specforge', {
 *   schema_version: '1.0',
 *   installedAt: new Date().toISOString(),
 *   cliVersion: '6.0.0',
 *   platform: 'win32',
 *   installSource: 'npm-global'
 * });
 */
export async function writeInstallationRecord(
  root: string,
  record: InstallationRecord,
  baseline?: string
): Promise<void> {
  // 构造 .installation.json 的完整路径
  const filePath = path.join(root, '.installation.json');

  // 如果没有传入 baseline，使用传入 record 中的 schema_version
  // 如果传入了 baseline用它覆盖（用于强制重写场景）
  const svm = new SchemaVersionManager(baseline);
  const finalSchemaVersion = baseline ?? record.schema_version ?? svm.baseline;
  
  const recordWithBaseline: InstallationRecord = {
    ...record,
    schema_version: finalSchemaVersion,
  };

  // 确保 installedAt 是 ISO 8601 UTC 毫秒精度格式
  // 如果调用者没有提供或格式不对，使用当前时间
  if (!recordWithBaseline.installedAt || !isValidIso8601(recordWithBaseline.installedAt)) {
    recordWithBaseline.installedAt = new Date().toISOString();
  }

  // 序列化为 JSON（缩进 2 空格，便于人工阅读）
  const jsonContent = JSON.stringify(recordWithBaseline, null, 2);

  // 使用 FilesystemAdapter.writeAtomic 原子写入
  await filesystemAdapter.writeAtomic(filePath, jsonContent);
}

/**
 * 加载安装记录从 ~/.specforge/.installation.json
 * 
 * 返回封闭枚举类型，明确区分各种失败情况：
 * - missing: 文件不存在
 * - unparseable: JSON 解析失败
 * - missing_field: 缺少必需字段（schema_version, installedAt, cliVersion, platform, installSource）
 * - ok: 成功加载，包含完整的 InstallationRecord
 * 
 * @param root - 安装根目录（通常是 ~/.specforge/）
 * @returns LoadInstallationRecordResult 封闭枚举
 * 
 * @example
 * const result = await loadInstallationRecord('~/.specforge');
 * if (result.kind === 'ok') {
 *   console.log('Installed at:', result.record.installedAt);
 * } else if (result.kind === 'missing') {
 *   console.error('Installation record not found');
 * }
 */
export async function loadInstallationRecord(
  root: string
): Promise<LoadInstallationRecordResult> {
  // 构造 .installation.json 的完整路径
  const filePath = path.join(root, '.installation.json');

  // 检查文件是否存在
  const exists = await filesystemAdapter.exists(filePath);
  if (!exists) {
    return { kind: 'missing' };
  }

  // 尝试读取并解析 JSON
  let parsed: unknown;
  try {
    parsed = await filesystemAdapter.readJson(filePath);
  } catch (error) {
    // JSON 解析失败（语法错误、编码问题等）
    return { kind: 'unparseable' };
  }

  // 验证必需字段是否存在
  if (!isValidInstallationRecord(parsed)) {
    return { kind: 'missing_field' };
  }

  // 成功加载
  return { kind: 'ok', record: parsed };
}

/**
 * 验证对象是否是有效的 InstallationRecord
 * 
 * 必需字段：
 * - schema_version: string
 * - installedAt: string
 * - cliVersion: string
 * - platform: "win32" | "darwin" | "linux"
 * - installSource: "npm-global" | "npm-local" | "dev"
 * 
 * @param obj - 待验证的对象
 * @returns 是否是有效的 InstallationRecord
 */
function isValidInstallationRecord(obj: unknown): obj is InstallationRecord {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  // 检查必需字段是否存在且类型正确
  if (typeof record.schema_version !== 'string') return false;
  if (typeof record.installedAt !== 'string') return false;
  if (typeof record.cliVersion !== 'string') return false;

  // 检查 platform 是否是封闭枚举之一
  if (
    record.platform !== 'win32' &&
    record.platform !== 'darwin' &&
    record.platform !== 'linux'
  ) {
    return false;
  }

  // 检查 installSource 是否是封闭枚举之一
  if (
    record.installSource !== 'npm-global' &&
    record.installSource !== 'npm-local' &&
    record.installSource !== 'dev'
  ) {
    return false;
  }

  return true;
}

/**
 * 验证字符串是否是有效的 ISO 8601 UTC 毫秒精度格式
 * 
 * 有效格式示例：
 * - 2026-05-19T12:34:56.789Z
 * - 2026-05-19T00:00:00.000Z
 * 
 * @param str - 待验证的字符串
 * @returns 是否是有效的 ISO 8601 格式
 */
function isValidIso8601(str: string): boolean {
  // 尝试解析为 Date 对象
  const date = new Date(str);

  // 检查是否是有效日期
  if (isNaN(date.getTime())) {
    return false;
  }

  // 检查格式是否严格符合 ISO 8601（toISOString() 的输出格式）
  // 这样可以排除 "2026-05-19" 这种不完整的格式
  return date.toISOString() === str;
}

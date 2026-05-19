/**
 * Version Command
 * 
 * 实现 `specforge --version` 和 `specforge --version --json` 命令。
 * 
 * Requirements: 2.4, 2.5, 6.4
 * 
 * 功能：
 * - 读取 CLI 版本（package.json#version）
 * - 读取 schema_version baseline（SchemaVersionManager.baseline）
 * - 读取磁盘安装记录（~/.specforge/.installation.json#schema_version，可能不存在/损坏）
 * - JSON 模式：输出 VersionInfoPayload 单行 JSON
 * - 非 JSON 模式：输出 <cliVersion>\n<schema_version>
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SchemaVersionManager } from '../distribution/schema-version-manager.js';
import type { VersionInfoPayload, InstallationRecord } from '../distribution/types.js';

/**
 * Version 命令选项
 */
export interface VersionCommandOptions {
  /** 是否输出 JSON 格式 */
  json: boolean;
}

/**
 * 解析 HOME 目录
 * 
 * Windows: %USERPROFILE%
 * macOS/Linux: $HOME
 * 
 * @returns HOME 目录绝对路径
 * @throws 如果 HOME 环境变量未设置（Linux/macOS）
 */
function resolveHomeDirectory(): string {
  const platform = process.platform;
  
  if (platform === 'win32') {
    const userProfile = process.env.USERPROFILE;
    if (!userProfile) {
      throw new Error('USERPROFILE environment variable is not set');
    }
    return userProfile;
  } else {
    // darwin 或 linux
    const home = process.env.HOME;
    if (!home || home.trim() === '') {
      throw new Error('HOME environment variable is not set');
    }
    return home;
  }
}

/**
 * 读取 ~/.specforge/.installation.json 的 schema_version 字段
 * 
 * 处理三种失败情况：
 * - missing: 文件不存在
 * - unparseable: JSON 解析失败
 * - missing_field: schema_version 字段不存在
 * 
 * @returns schema_version 字符串，失败时返回 null
 */
async function loadInstallationSchemaVersion(): Promise<string | null> {
  try {
    const home = resolveHomeDirectory();
    const installationPath = path.join(home, '.specforge', '.installation.json');
    
    // 尝试读取文件
    const content = await fs.readFile(installationPath, 'utf-8');
    
    // 尝试解析 JSON
    const record = JSON.parse(content) as InstallationRecord;
    
    // 检查 schema_version 字段是否存在
    if (!record.schema_version || typeof record.schema_version !== 'string') {
      return null; // missing_field
    }
    
    return record.schema_version;
  } catch (error) {
    // 文件不存在、权限错误、JSON 解析失败等，统一返回 null
    return null;
  }
}

/**
 * 读取 CLI 版本（从 package.json）
 * 
 * 注意：这里假设 package.json 在编译后的 dist 目录的上一级
 * 实际路径：packages/cli/package.json
 * 
 * @returns CLI 版本字符串
 */
async function loadCliVersion(): Promise<string> {
  try {
    // 当前文件编译后在 dist/commands/version-cmd.js
    // package.json 在 dist 的上一级，即 packages/cli/package.json
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as { version: string };
    return pkg.version;
  } catch (error) {
    // 如果读取失败，返回 "unknown"（不应该发生，但作为兜底）
    return 'unknown';
  }
}

/**
 * 获取平台字符串
 * 
 * 格式：<os>-<arch>
 * 例如：win32-x64, darwin-arm64, linux-x64
 * 
 * @returns 平台字符串
 */
function getPlatformString(): string {
  return `${process.platform}-${process.arch}`;
}

/**
 * 执行 version 命令
 * 
 * @param options - 命令选项
 * 
 * 行为：
 * - JSON 模式：输出 VersionInfoPayload 单行 JSON 到 stdout
 * - 非 JSON 模式：输出 <cliVersion>\n<schema_version> 到 stdout
 * 
 * 退出码：始终为 0（REQ-2.4）
 */
export async function runVersionCommand(options: VersionCommandOptions): Promise<void> {
  // 1. 创建 SchemaVersionManager 实例，获取 baseline
  const svm = new SchemaVersionManager();
  const baseline = svm.baseline;
  
  // 2. 读取 CLI 版本
  const cliVersion = await loadCliVersion();
  
  // 3. 读取磁盘安装记录的 schema_version（可能为 null）
  const installRootSchemaVersion = await loadInstallationSchemaVersion();
  
  // 4. 获取 installRoot 路径
  let installRoot: string;
  try {
    const home = resolveHomeDirectory();
    installRoot = path.join(home, '.specforge');
  } catch (error) {
    // 如果 HOME 未设置，使用占位符
    installRoot = '<HOME not set>';
  }
  
  // 5. 获取平台字符串
  const platform = getPlatformString();
  
  if (options.json) {
    // JSON 模式：输出 VersionInfoPayload
    const payload: VersionInfoPayload = {
      schema_version: '1.0',
      cliVersion,
      schemaVersionBaseline: baseline,
      installRoot,
      installRootSchemaVersion,
      platform,
    };
    
    // 输出单行 JSON（REQ-6.4）
    console.log(JSON.stringify(payload));
  } else {
    // 非 JSON 模式：输出 <cliVersion>\n<schema_version>
    // REQ-2.4: version 字段 + \n + schema_version
    console.log(cliVersion);
    console.log(baseline);
  }
}

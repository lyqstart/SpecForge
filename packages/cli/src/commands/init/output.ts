/**
 * Init Output Layer - specforge init 输出格式化
 * 
 * 本模块实现 design.md "InitJsonPayload" 章节定义的输出逻辑：
 * - JSON 模式：输出 InitJsonPayload 单行 JSON，无 ANSI
 * - 交互模式：每个 createdDir 一行 + 5 个命名字段摘要块
 * - warnings 上限 100 条，每条 ≤ 500 字符截断
 * 
 * Requirements: 3.5, 3.6
 * 
 * @module output
 */

import type { InitJsonPayload } from '../../distribution/types.js';

/**
 * 输出格式化选项
 */
export interface OutputOptions {
  /** 是否为 JSON 模式 */
  json: boolean;
  /** 是否显示彩色输出（交互模式） */
  color: boolean;
}

/**
 * 默认输出选项
 */
const DEFAULT_OPTIONS: OutputOptions = {
  json: false,
  color: true,
};

/**
 * 格式化 init 结果并输出
 * 
 * @param payload - InitJsonPayload
 * @param options - 输出选项
 */
export function formatInitOutput(
  payload: InitJsonPayload,
  options: Partial<OutputOptions> = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.json) {
    // JSON 模式：单行 JSON，无 ANSI
    outputJson(payload);
  } else {
    // 交互模式：人类可读输出
    outputInteractive(payload, opts.color);
  }
}

/**
 * JSON 模式输出
 * 
 * 单行 JSON，无 ANSI 转义序列
 * 
 * @param payload - InitJsonPayload
 */
function outputJson(payload: InitJsonPayload): void {
  // 直接输出单行 JSON
  const jsonString = JSON.stringify(payload);
  process.stdout.write(jsonString + '\n');
}

/**
 * 交互模式输出
 * 
 * 按 design.md REQ-3.6：
 * - 每个 createdDir 一行（绝对路径）
 * - 5 个命名字段摘要块：
 *   - Install Root
 *   - Schema Version
 *   - Created Dirs count
 *   - Existing Dirs count
 *   - Warnings count
 * 
 * @param payload - InitJsonPayload
 * @param color - 是否显示彩色
 */
function outputInteractive(payload: InitJsonPayload, color: boolean): void {
  const colors = color ? getColors() : getNoColors();

  // 输出标题
  console.log('\n' + colors.bold + 'SpecForge Installation' + colors.reset);

  // 输出 createdDirs（每个目录一行）
  if (payload.createdDirs.length > 0) {
    console.log('\n' + colors.bold + 'Created directories:' + colors.reset);
    for (const dir of payload.createdDirs) {
      // 构造绝对路径
      const fullPath = payload.installRoot + (dir.startsWith('/') ? '' : '/') + dir;
      console.log(`  ${colors.green}✓${colors.reset} ${fullPath}`);
    }
  }

  // 输出摘要块（5 个命名字段）
  console.log('\n' + colors.bold + 'Summary:' + colors.reset);
  
  // 1. Install Root
  console.log(`  ${colors.cyan}Install Root:${colors.reset} ${payload.installRoot}`);
  
  // 2. Schema Version
  console.log(`  ${colors.cyan}Schema Version:${colors.reset} ${payload.baseline}`);
  
  // 3. Created Dirs count
  console.log(
    `  ${colors.cyan}Created Dirs:${colors.reset} ${payload.createdDirs.length}`
  );
  
  // 4. Existing Dirs count
  console.log(
    `  ${colors.cyan}Existing Dirs:${colors.reset} ${payload.existingDirs.length}`
  );
  
  // 5. Warnings count
  const warningCount = payload.warnings.length;
  if (warningCount > 0) {
    console.log(
      `  ${colors.cyan}Warnings:${colors.reset} ${colors.yellow}${warningCount}${colors.reset}`
    );
  } else {
    console.log(`  ${colors.cyan}Warnings:${colors.reset} ${warningCount}`);
  }

  // 如果有 existingDirs，列出它们
  if (payload.existingDirs.length > 0) {
    console.log('\n' + colors.bold + 'Existing items:' + colors.reset);
    for (const item of payload.existingDirs) {
      console.log(`  - ${item}`);
    }
  }

  // 如果有 warnings，显示它们
  if (payload.warnings.length > 0) {
    console.log('\n' + colors.bold + 'Warnings:' + colors.reset);
    for (const warning of payload.warnings) {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${warning}`);
    }
  }

  // 输出 exit code 提示
  if (payload.exitCode === 0) {
    console.log(
      '\n' + colors.green + '✓ Installation complete' + colors.reset
    );
  } else {
    console.log(
      '\n' + colors.red + '✗ Installation failed' + colors.reset
    );
  }

  console.log(''); // 末尾空行
}

/**
 * 获取 ANSI 颜色代码
 */
function getColors() {
  return {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
  };
}

/**
 * 获取空颜色代码（无 ANSI）
 */
function getNoColors() {
  return {
    reset: '',
    bold: '',
    green: '',
    red: '',
    yellow: '',
    cyan: '',
  };
}

/**
 * 截断警告消息到指定长度
 * 
 * REQ-3.5: 每条 warning ≤ 500 字符
 * 
 * @param warnings - 警告数组
 * @param maxLength - 最大长度（默认 500）
 * @returns 截断后的警告数组
 */
export function truncateWarnings(
  warnings: string[],
  maxLength: number = 500
): string[] {
  return warnings.map((warning) => {
    if (warning.length > maxLength) {
      return warning.substring(0, maxLength - 3) + '...';
    }
    return warning;
  });
}

/**
 * 限制警告数量
 * 
 * REQ-3.5: warnings 上限 100 条
 * 
 * @param warnings - 警告数组
 * @param maxCount - 最大数量（默认 100）
 * @returns 限制后的警告数组
 */
export function limitWarningCount(
  warnings: string[],
  maxCount: number = 100
): string[] {
  if (warnings.length > maxCount) {
    return warnings.slice(0, maxCount);
  }
  return warnings;
}

/**
 * 验证并清理 InitJsonPayload
 * 
 * 确保输出符合 REQ-3.5 的约束：
 * - warnings 最多 100 条
 * - 每条 warning 最多 500 字符
 * 
 * @param payload - 原始 payload
 * @returns 清理后的 payload
 */
export function sanitizePayload(payload: InitJsonPayload): InitJsonPayload {
  // 限制 warnings 数量
  let warnings = limitWarningCount(payload.warnings, 100);
  
  // 截断每条 warning 到 500 字符
  warnings = truncateWarnings(warnings, 500);

  return {
    ...payload,
    warnings,
  };
}

/**
 * 输出错误信息
 * 
 * @param code - 错误码
 * @param message - 错误消息
 * @param jsonMode - 是否为 JSON 模式
 */
export function outputError(
  code: string,
  message: string,
  jsonMode: boolean
): void {
  if (jsonMode) {
    // JSON 模式：输出 ErrorPayload
    const errorPayload = {
      schema_version: '1.0',
      error: {
        code,
        message,
      },
      context: {
        operation: 'init',
        platform: process.platform,
        cliVersion: process.env.npm_package_version || '0.1.0',
      },
    };
    process.stdout.write(JSON.stringify(errorPayload) + '\n');
  } else {
    // 交互模式：人类可读输出
    const colors = getColors();
    console.error(`${colors.red}Error [${code}]:${colors.reset} ${message}`);
  }
}

/**
 * 输出警告信息
 * 
 * @param warning - 警告消息
 * @param jsonMode - 是否为 JSON 模式
 */
export function outputWarning(
  warning: string,
  jsonMode: boolean
): void {
  if (!jsonMode) {
    // 仅在交互模式输出到 stderr
    const colors = getColors();
    console.error(`${colors.yellow}Warning:${colors.reset} ${warning}`);
  }
  // JSON 模式不单独输出警告，它们会包含在 payload.warnings 中
}
/**
 * Init 命令入口
 * 
 * REQ-3: specforge init 安装向导
 * 实现 `specforge init` 子命令，接受 --force / --json / --help 标志
 */

import type { Arguments } from "yargs";
import type { InitOptions, InitResult } from "../../distribution/types.js";
import { parseInitOptions, InitOptionsParseError } from "./options-parser.js";
import { createInstallationWizard } from "./wizard.js";
import { formatInitOutput, sanitizePayload } from "./output.js";

/**
 * 运行 init 命令
 * 
 * @param options - 解析后的命令选项
 * @returns 执行结果
 */
export async function runInitCommand(options: InitOptions): Promise<InitResult> {
  // 创建 InstallationWizard 实例
  const wizard = createInstallationWizard(options.installRootOverride);
  
  // 执行初始化
  const result = await wizard.initialize(options);
  
  // 清理 payload（确保 warnings 符合约束）
  result.payload = sanitizePayload(result.payload);
  
  return result;
}

/**
 * Init 命令的 yargs handler
 * 
 * 处理参数解析、错误处理、输出格式化
 * 
 * @param argv - yargs 解析后的参数对象
 */
export async function initCommandHandler(argv: Arguments): Promise<void> {
  try {
    // 从 argv 中提取原始参数数组（排除 yargs 添加的元数据）
    const rawArgs: string[] = [];
    
    // 检查常见的 init 标志
    if (argv.force) rawArgs.push("--force");
    if (argv.json) rawArgs.push("--json");
    if (argv.installRoot) rawArgs.push(`--install-root=${argv.installRoot}`);
    
    // 解析选项
    const options = parseInitOptions(rawArgs);
    
    // 执行 init 命令
    const result = await runInitCommand(options);
    
    // 输出结果
    formatInitOutput(result.payload, {
      json: options.json,
      color: true, // 交互模式默认开启颜色
    });
    
    process.exit(result.exitCode);
  } catch (error) {
    // 错误处理
    if (error instanceof InitOptionsParseError) {
      // 未知 flag 错误 → exit 2
      const errorPayload = {
        schema_version: "1.0",
        error: {
          code: error.code,
          message: error.message,
          details: error.unknownFlag,
        },
        context: {
          operation: "init",
          platform: process.platform,
          cliVersion: process.env.npm_package_version || "0.1.0",
        },
      };
      
      if (argv.json) {
        process.stdout.write(JSON.stringify(errorPayload) + '\n');
      } else {
        console.error(`Error: ${error.message}`);
      }
      process.exit(2);
    }
    
    // 其他错误 → exit 1
    const message = error instanceof Error ? error.message : String(error);
    const errorPayload = {
      schema_version: "1.0",
      error: {
        code: "INIT_UNKNOWN_ERROR",
        message,
      },
      context: {
        operation: "init",
        platform: process.platform,
        cliVersion: process.env.npm_package_version || "0.1.0",
      },
    };
    
    if (argv.json) {
      process.stdout.write(JSON.stringify(errorPayload) + '\n');
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }
}
/**
 * Init 命令参数解析器
 * 
 * REQ-3.1: 只接受 --force / --json / --help / --install-root=<path>
 * 未知 flag 抛 INIT_UNKNOWN_FLAG（exit 2）
 */

import type { InitOptions, ErrorCode } from "../../distribution/types.js";

/**
 * 参数解析错误
 */
export class InitOptionsParseError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly unknownFlag?: string,
  ) {
    super(message);
    this.name = "InitOptionsParseError";
  }
}

/**
 * 解析 init 命令的 argv 参数
 * 
 * @param argv - 命令行参数数组（不含 node/bun 和脚本路径）
 * @returns 解析后的选项对象
 * @throws {InitOptionsParseError} 当遇到未知 flag 时
 * 
 * @example
 * ```ts
 * parseInitOptions(["--force", "--json"])
 * // => { force: true, json: true }
 * 
 * parseInitOptions(["--install-root=/custom/path"])
 * // => { force: false, json: false, installRootOverride: "/custom/path" }
 * 
 * parseInitOptions(["--unknown"])
 * // => throws InitOptionsParseError with code "INIT_UNKNOWN_FLAG"
 * ```
 */
export function parseInitOptions(argv: string[]): InitOptions {
  const options: InitOptions = {
    force: false,
    json: false,
  };

  for (const arg of argv) {
    // 跳过非 flag 参数（不以 -- 开头）
    if (!arg.startsWith("--")) {
      continue;
    }

    // 处理 --help（短路返回，调用者负责显示帮助）
    if (arg === "--help") {
      // --help 是特殊情况，不抛错，让调用者处理
      // 这里简单地设置一个标记，但根据设计文档，
      // --help 应该在更上层处理（CLI 入口）
      // 为了符合 REQ-3.1 的"只接受这些 flag"，我们允许它通过
      continue;
    }

    // 处理 --force
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    // 处理 --json
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    // 处理 --install-root=<path>
    if (arg.startsWith("--install-root=")) {
      const value = arg.slice("--install-root=".length);
      if (value.length === 0) {
        throw new InitOptionsParseError(
          "INIT_UNKNOWN_FLAG",
          "Flag --install-root requires a value: --install-root=<path>",
          arg,
        );
      }
      options.installRootOverride = value;
      continue;
    }

    // 未知 flag - 抛出错误
    throw new InitOptionsParseError(
      "INIT_UNKNOWN_FLAG",
      `Unknown flag: ${arg}. Supported flags: --force, --json, --help, --install-root=<path>`,
      arg,
    );
  }

  return options;
}

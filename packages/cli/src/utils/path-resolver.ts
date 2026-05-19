/**
 * PathResolver - 跨平台路径解析工具
 * 
 * 职责：
 * - 解析安装根目录 (~/.specforge)
 * - 解析用户 HOME 目录（跨平台）
 * - 提供平台和架构信息
 * - 判断安装来源（npm-global / npm-local / dev）
 * 
 * REQ-4.6: win32 下解析 ~ 为 %USERPROFILE%
 * REQ-4.9: linux/darwin 下 HOME 为空抛 INIT_HOME_NOT_SET
 */

import * as os from "node:os";
import * as path from "node:path";
import { ErrorCode } from "../distribution/types.js";

/**
 * PathResolver 接口
 * design.md "Components and Interfaces" § 5
 */
export interface PathResolver {
  /**
   * 解析安装根目录
   * @param override 可选的覆盖路径（测试用）
   * @returns ~/.specforge 的绝对路径
   */
  resolveInstallRoot(override?: string): string;

  /**
   * 解析用户 HOME 目录
   * @throws {Error} 当 linux/darwin 下 HOME 未设置时抛出 INIT_HOME_NOT_SET
   * @returns 用户 HOME 目录的绝对路径
   */
  resolveHomeDirectory(): string;

  /**
   * 返回当前平台
   * @returns "win32" | "darwin" | "linux"
   */
  platform(): "win32" | "darwin" | "linux";

  /**
   * 返回当前架构
   * @returns "x64" | "arm64"
   */
  arch(): "x64" | "arm64";

  /**
   * 从 argv 判断安装来源
   * @param argv process.argv 或测试提供的参数数组
   * @returns "npm-global" | "npm-local" | "dev"
   */
  installSourceFromArgv(argv: string[]): "npm-global" | "npm-local" | "dev";
}

/**
 * PathResolver 默认实现
 */
export class DefaultPathResolver implements PathResolver {
  /**
   * 解析安装根目录
   * REQ-4.6: 支持 override 参数
   */
  resolveInstallRoot(override?: string): string {
    if (override) {
      return path.resolve(override);
    }

    const home = this.resolveHomeDirectory();
    return path.join(home, ".specforge");
  }

  /**
   * 解析用户 HOME 目录
   * REQ-4.9: linux/darwin 下 HOME 为空抛 INIT_HOME_NOT_SET
   * REQ-4.6: win32 下解析 ~ 为 %USERPROFILE%
   */
  resolveHomeDirectory(): string {
    const platform = this.platform();

    if (platform === "win32") {
      // Windows: 使用 USERPROFILE
      const userProfile = process.env.USERPROFILE;
      if (!userProfile || userProfile.trim() === "") {
        throw this.createHomeNotSetError("USERPROFILE");
      }
      return userProfile;
    } else {
      // macOS / Linux: 使用 HOME
      const home = process.env.HOME;
      if (!home || home.trim() === "") {
        throw this.createHomeNotSetError("HOME");
      }
      return home;
    }
  }

  /**
   * 返回当前平台
   * REQ-4.3: 封闭枚举 "win32" | "darwin" | "linux"
   */
  platform(): "win32" | "darwin" | "linux" {
    const p = os.platform();
    
    // 映射到封闭枚举
    if (p === "win32") return "win32";
    if (p === "darwin") return "darwin";
    // 其他所有 POSIX 平台（linux, freebsd, openbsd, sunos, aix）统一映射为 linux
    return "linux";
  }

  /**
   * 返回当前架构
   * REQ-6.4: 封闭枚举 "x64" | "arm64"
   */
  arch(): "x64" | "arm64" {
    const a = os.arch();
    
    // 映射到封闭枚举
    if (a === "x64") return "x64";
    if (a === "arm64") return "arm64";
    
    // 其他架构（ia32, arm, ppc, s390, mips 等）默认映射为 x64
    // 这是一个保守的回退策略，实际上这些架构不在 Supported Platforms 中
    return "x64";
  }

  /**
   * 从 argv 判断安装来源
   * REQ-4.3: installSource 字段的来源
   * 
   * 判断逻辑：
   * - 包含 "packages/cli" 或 "packages\\cli" → dev（monorepo 开发环境）
   * - 包含 ".bun/install/global" → dev（bun link 场景）
   * - 包含系统级路径特征 → npm-global
   *   - Unix: /usr/local/lib/node_modules, /usr/lib/node_modules
   *   - Windows: AppData\Roaming\npm\node_modules, Program Files
   * - 包含 node_modules 但不在系统路径 → npm-local
   * - 默认 → npm-global
   */
  installSourceFromArgv(argv: string[]): "npm-global" | "npm-local" | "dev" {
    // argv[0] 通常是 node/bun 可执行文件路径
    // argv[1] 通常是脚本路径
    const scriptPath = argv[1] || "";

    // 开发环境：包含 packages/cli（monorepo 路径）
    if (scriptPath.includes("packages/cli") || scriptPath.includes("packages\\cli")) {
      return "dev";
    }

    // 开发环境：bun link 场景（符号链接到 ~/.bun/install/global）
    // bun link 会在 ~/.bun/install/global/node_modules/.bin/ 创建符号链接
    if (scriptPath.includes(".bun/install/global") || scriptPath.includes(".bun\\install\\global")) {
      return "dev";
    }

    // npm 安装：包含 node_modules
    if (scriptPath.includes("node_modules")) {
      // 区分 global 和 local
      // global 的特征路径：
      const globalPatterns = [
        // Unix 系统级路径
        "/usr/local/lib/node_modules",
        "/usr/lib/node_modules",
        // Windows 系统级路径
        "AppData\\Roaming\\npm\\node_modules",
        "AppData/Roaming/npm/node_modules",
        "Program Files\\nodejs\\node_modules",
        "Program Files/nodejs/node_modules",
      ];
      
      const isGlobal = globalPatterns.some(pattern => scriptPath.includes(pattern));
      
      return isGlobal ? "npm-global" : "npm-local";
    }

    // 默认假设是 global 安装
    return "npm-global";
  }

  /**
   * 创建 HOME_NOT_SET 错误
   * REQ-4.9: 错误码和消息格式
   */
  private createHomeNotSetError(envVar: string): Error {
    const errorCode: ErrorCode = "INIT_HOME_NOT_SET";
    const error = new Error(
      `${errorCode}: ${envVar} environment variable is not set or empty. ` +
      `Please set ${envVar} to your home directory path.`
    );
    // 附加错误码到 error 对象，便于测试断言
    (error as any).code = errorCode;
    return error;
  }
}

/**
 * 导出单例实例（便于直接使用）
 */
export const pathResolver = new DefaultPathResolver();

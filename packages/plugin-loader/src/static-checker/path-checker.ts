/**
 * 文件系统路径检查器
 *
 * 职责：
 *   - 检查文件系统访问路径是否安全
 *   - 检测路径逃逸攻击（如 ../../ 逃逸出插件目录）
 *   - 验证路径是否在白名单内
 *
 * 实现策略：
 *   - 使用 Node.js 的 path 模块进行路径规范化
 *   - 检查规范化后的路径是否在允许的目录内
 *   - 支持相对路径和绝对路径检查
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import * as path from 'path';

/**
 * 路径检查结果
 */
export interface PathCheckResult {
  /** 是否安全 */
  safe: boolean;
  /** 检查的路径 */
  path: string;
  /** 规范化后的路径 */
  normalizedPath: string;
  /** 基础目录 */
  baseDir: string;
  /** 错误信息（如果不安全） */
  error?: string;
}

/**
 * 路径检查器配置
 */
export interface PathCheckerConfig {
  /** 允许访问的目录列表 */
  allowedDirs: string[];
  /** 是否允许访问父目录 */
  allowParentAccess: boolean;
  /** 是否允许符号链接 */
  allowSymlinks: boolean;
  /** 禁止访问的系统关键路径 */
  forbiddenPaths: string[];
}

/**
 * 获取默认配置（返回新对象，避免状态污染）
 */
export function getDefaultPathCheckerConfig(): PathCheckerConfig {
  return {
    allowedDirs: [],
    allowParentAccess: false,
    allowSymlinks: false,
    forbiddenPaths: [
      // Windows 系统路径
      'C:\\Windows\\',
      'C:\\Program Files\\',
      'C:\\Program Files (x86)\\',
      'C:\\ProgramData\\',
      'C:\\System32\\',
      'C:\\$Recycle.Bin\\',
      
      // Linux/Unix 系统路径
      '/etc/',
      '/bin/',
      '/sbin/',
      '/usr/bin/',
      '/usr/sbin/',
      '/usr/local/bin/',
      '/var/',
      '/root/',
      '/boot/',
      '/dev/',
      '/proc/',
      '/sys/',
      
      // macOS 系统路径
      '/System/',
      '/Library/',
      '/Applications/',
      '/private/',
      '/Users/Shared/',
    ],
  };
}

/**
 * 文件系统路径检查器
 */
export class PathChecker {
  private config: PathCheckerConfig;

  constructor(config: Partial<PathCheckerConfig> = {}) {
    this.config = { ...getDefaultPathCheckerConfig(), ...config };
  }

  /**
   * 检查路径是否安全
   *
   * @param targetPath - 要检查的路径
   * @param baseDir - 基础目录（通常是插件目录）
   * @returns 检查结果
   */
  checkPath(targetPath: string, baseDir: string): PathCheckResult {
    // 处理空路径和点路径
    if (!targetPath || targetPath === '.' || targetPath === './') {
      // 空路径、当前目录是安全的
      const absoluteBaseDir = path.isAbsolute(baseDir) 
        ? path.normalize(baseDir)
        : path.resolve(process.cwd(), path.normalize(baseDir));
      
      return {
        safe: true,
        path: targetPath,
        normalizedPath: absoluteBaseDir,
        baseDir: absoluteBaseDir,
      };
    }

    // 规范化路径
    const normalizedBaseDir = path.normalize(baseDir);
    const normalizedTargetPath = path.normalize(targetPath);
    
    // 解析为绝对路径
    const absoluteBaseDir = path.isAbsolute(normalizedBaseDir) 
      ? normalizedBaseDir 
      : path.resolve(process.cwd(), normalizedBaseDir);
    
    const absoluteTargetPath = path.isAbsolute(normalizedTargetPath)
      ? normalizedTargetPath
      : path.resolve(absoluteBaseDir, normalizedTargetPath);

    // 首先检查是否访问了禁止的系统路径（最高优先级）
    for (const forbiddenPath of this.config.forbiddenPaths) {
      const absoluteForbiddenPath = path.isAbsolute(forbiddenPath)
        ? forbiddenPath
        : path.resolve(process.cwd(), forbiddenPath);
      
      if (this.isPathWithinBaseDir(absoluteTargetPath, absoluteForbiddenPath)) {
        return {
          safe: false,
          path: targetPath,
          normalizedPath: absoluteTargetPath,
          baseDir: absoluteBaseDir,
          error: `禁止访问系统关键路径：${targetPath}（匹配禁止路径：${forbiddenPath}）`,
        };
      }
    }

    // 检查是否在基础目录内（防止路径逃逸）
    if (!this.isPathWithinBaseDir(absoluteTargetPath, absoluteBaseDir)) {
      return {
        safe: false,
        path: targetPath,
        normalizedPath: absoluteTargetPath,
        baseDir: absoluteBaseDir,
        error: `路径逃逸攻击：路径 "${targetPath}" 试图访问基础目录 "${baseDir}" 之外的位置`,
      };
    }

    // 检查是否在允许的目录列表中
    if (this.config.allowedDirs.length > 0) {
      const isInAllowedDir = this.config.allowedDirs.some(allowedDir => {
        const absoluteAllowedDir = path.isAbsolute(allowedDir)
          ? allowedDir
          : path.resolve(process.cwd(), allowedDir);
        return this.isPathWithinBaseDir(absoluteTargetPath, absoluteAllowedDir);
      });

      if (!isInAllowedDir) {
        return {
          safe: false,
          path: targetPath,
          normalizedPath: absoluteTargetPath,
          baseDir: absoluteBaseDir,
          error: `路径不在允许的目录列表中：${targetPath}`,
        };
      }
    }

    return {
      safe: true,
      path: targetPath,
      normalizedPath: absoluteTargetPath,
      baseDir: absoluteBaseDir,
    };
  }

  /**
   * 检查路径是否在基础目录内
   *
   * @param targetPath - 目标路径
   * @param baseDir - 基础目录
   * @returns 是否在基础目录内
   */
  private isPathWithinBaseDir(targetPath: string, baseDir: string): boolean {
    const relative = path.relative(baseDir, targetPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * 检查多个路径
   *
   * @param paths - 路径列表
   * @param baseDir - 基础目录
   * @returns 检查结果列表
   */
  checkPaths(paths: string[], baseDir: string): PathCheckResult[] {
    return paths.map(path => this.checkPath(path, baseDir));
  }

  /**
   * 检查路径字符串是否包含路径逃逸模式
   *
   * @param pathStr - 路径字符串
   * @returns 是否包含逃逸模式
   */
  static containsPathTraversal(pathStr: string): boolean {
    // 检查常见的路径逃逸模式
    const patterns = [
      /\.\.\//g,      // ../
      /\.\.\\/g,      // ..\
      /\/\.\.\//g,    // /../
      /\\\.\.\\/g,    // \..\
      /\.\.$/g,       // 以..结尾
    ];

    for (const pattern of patterns) {
      if (pattern.test(pathStr)) {
        return true;
      }
    }

    // 检查绝对路径（如果基础目录是相对路径）
    if (path.isAbsolute(pathStr)) {
      return true;
    }

    return false;
  }

  /**
   * 获取当前配置
   */
  getConfig(): PathCheckerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PathCheckerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 添加允许的目录
   */
  addAllowedDir(dir: string): void {
    if (!this.config.allowedDirs.includes(dir)) {
      this.config.allowedDirs.push(dir);
    }
  }

  /**
   * 移除允许的目录
   */
  removeAllowedDir(dir: string): void {
    this.config.allowedDirs = this.config.allowedDirs.filter(d => d !== dir);
  }

  /**
   * 添加禁止的路径
   */
  addForbiddenPath(forbiddenPath: string): void {
    if (!this.config.forbiddenPaths.includes(forbiddenPath)) {
      this.config.forbiddenPaths.push(forbiddenPath);
    }
  }

  /**
   * 移除禁止的路径
   */
  removeForbiddenPath(forbiddenPath: string): void {
    this.config.forbiddenPaths = this.config.forbiddenPaths.filter(p => p !== forbiddenPath);
  }
}

/**
 * 创建路径检查器实例
 */
export function createPathChecker(config?: Partial<PathCheckerConfig>): PathChecker {
  return new PathChecker(config);
}
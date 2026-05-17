/**
 * 路径规范化工具
 * 
 * 职责：
 *   - 实现绝对路径转换
 *   - 处理 `..`, `.` 等路径片段
 *   - 处理不同操作系统路径分隔符
 *   - 提供跨平台的路径操作统一接口
 * 
 * 设计原则：
 *   - 所有路径操作统一使用正斜杠（/）作为输出分隔符
 *   - 输入可以是任意格式（Windows 反斜杠、Unix 正斜杠、混合）
 *   - 支持相对路径和绝对路径的相互转换
 *   - 路径片段（. 和 ..）会被完全解析
 * 
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块为纯函数和同步逻辑，无异步操作
 *   - 无资源泄漏风险
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * 路径分隔符类型
 */
export type PathSeparator = '/' | '\\';

/**
 * 路径规范化选项
 */
export interface NormalizeOptions {
  /** 
   * 输出使用的路径分隔符
   * @default '/' (正斜杠，跨平台统一)
   */
  separator?: PathSeparator;
  /**
   * 是否将相对路径解析为绝对路径
   * @default false
   */
  resolveToAbsolute?: boolean;
  /**
   * 相对路径的基础目录（当 resolveToAbsolute 为 true 时使用）
   * @default process.cwd()
   */
  baseDir?: string;
  /**
   * 是否解析符号链接
   * @default false
   */
  resolveSymlinks?: boolean;
}

/**
 * 路径分析结果
 */
export interface PathAnalysis {
  /** 原始路径 */
  original: string;
  /** 规范化后的路径 */
  normalized: string;
  /** 绝对路径 */
  absolute: string;
  /** 是否为绝对路径 */
  isAbsolute: boolean;
  /** 是否包含路径遍历（..） */
  hasTraversal: boolean;
  /** 是否包含当前目录（.） */
  hasCurrentDir: boolean;
  /** 路径片段数组 */
  segments: string[];
  /** 目录部分 */
  dir: string;
  /** 文件名部分 */
  base: string;
  /** 文件扩展名 */
  ext: string;
  /** 文件名（不含扩展名） */
  name: string;
}

/**
 * 路径比较结果
 */
export interface PathComparison {
  /** 是否相同（规范化后） */
  equal: boolean;
  /** 第一个路径相对于第二个路径 */
  relative: string | null;
  /** 是否在第二个路径内部 */
  isInside: boolean;
}

/**
 * 默认规范化选项
 */
const DEFAULT_OPTIONS: NormalizeOptions = {
  separator: '/',
  resolveToAbsolute: false,
  baseDir: process.cwd(),
  resolveSymlinks: false,
};

/**
 * 路径规范化工具类
 */
export class PathUtils {
  /**
   * 规范化路径
   * 
   * 将任意格式的路径转换为统一格式：
   * - 解析 . 和 .. 片段
   * - 统一分隔符
   * - 移除多余的分隔符
   * 
   * @param inputPath - 输入路径
   * @param options - 规范化选项
   * @returns 规范化后的路径
   */
  static normalize(inputPath: string, options: NormalizeOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    if (!inputPath || inputPath.trim() === '') {
      return '';
    }
    
    // 步骤 1: 统一分隔符（先转为正斜杠，便于处理）
    let normalized = inputPath.replace(/\\/g, '/');
    
    // 步骤 2: 使用 Node.js path.normalize 解析 . 和 ..
    // 注意：path.normalize 会在 Windows 上将反斜杠转回正斜杠
    normalized = path.normalize(normalized);
    
    // 步骤 3: 解析为绝对路径（如需要）
    if (opts.resolveToAbsolute) {
      const base = opts.baseDir || process.cwd();
      if (!path.isAbsolute(normalized)) {
        normalized = path.resolve(base, normalized);
      }
    }
    
    // 步骤 4: 解析符号链接（如需要）
    if (opts.resolveSymlinks && fs.existsSync(normalized)) {
      try {
        normalized = fs.realpathSync(normalized);
      } catch {
        // 忽略符号链接解析错误
      }
    }
    
    // 步骤 5: 统一输出分隔符
    const outputSeparator = opts.separator || '/';
    if (outputSeparator === '/') {
      normalized = normalized.replace(/\\/g, '/');
    } else {
      normalized = normalized.replace(/\//g, '\\');
    }
    
    return normalized;
  }

  /**
   * 转换为绝对路径
   * 
   * @param inputPath - 输入路径（相对或绝对）
   * @param baseDir - 基础目录（默认为当前工作目录）
   * @returns 绝对路径
   */
  static toAbsolute(inputPath: string, baseDir?: string): string {
    if (path.isAbsolute(inputPath)) {
      return PathUtils.normalize(inputPath);
    }
    
    const base = baseDir || process.cwd();
    const resolved = path.resolve(base, inputPath);
    return PathUtils.normalize(resolved);
  }

  /**
   * 转换为相对路径
   * 
   * @param inputPath - 输入路径
   * @param baseDir - 基础目录
   * @returns 相对路径
   */
  static toRelative(inputPath: string, baseDir: string): string {
    const normalizedInput = PathUtils.normalize(inputPath);
    const normalizedBase = PathUtils.normalize(baseDir);
    const relative = path.relative(normalizedBase, normalizedInput);
    return PathUtils.normalize(relative);
  }

  /**
   * 解析路径
   * 
   * 类似于 path.resolve，但返回更多分析信息
   * 
   * @param inputPath - 输入路径
   * @param baseDir - 基础目录（用于解析相对路径）
   * @returns 路径分析结果
   */
  static analyze(inputPath: string, baseDir?: string): PathAnalysis {
    const normalized = PathUtils.normalize(inputPath);
    const absolute = PathUtils.toAbsolute(inputPath, baseDir);
    const isAbs = path.isAbsolute(inputPath);
    
    // 分析路径片段
    const segments = normalized
      .split('/')
      .filter(s => s !== '' && s !== '.');
    
    const hasTraversal = segments.some(s => s === '..');
    const hasCurrentDir = normalized.includes('/./') || normalized.startsWith('./') || normalized.endsWith('/.');
    
    return {
      original: inputPath,
      normalized,
      absolute,
      isAbsolute: isAbs,
      hasTraversal,
      hasCurrentDir,
      segments,
      dir: path.dirname(normalized),
      base: path.basename(normalized),
      ext: path.extname(normalized),
      name: path.basename(normalized, path.extname(normalized)),
    };
  }

  /**
   * 比较两个路径
   * 
   * @param pathA - 路径 A
   * @param pathB - 路径 B
   * @returns 路径比较结果
   */
  static compare(pathA: string, pathB: string): PathComparison {
    const normalizedA = PathUtils.normalize(pathA);
    const normalizedB = PathUtils.normalize(pathB);
    
    const equal = normalizedA === normalizedB;
    const relative = equal ? null : PathUtils.toRelative(normalizedA, normalizedB);
    
    // 检查 pathA 是否在 pathB 内部
    const relativePath = path.relative(normalizedB, normalizedA);
    const isInside = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    
    return {
      equal,
      relative,
      isInside,
    };
  }

  /**
   * 检查路径是否在指定目录内
   * 
   * @param targetPath - 目标路径
   * @param parentDir - 父目录
   * @returns 是否在目录内
   */
  static isInside(targetPath: string, parentDir: string): boolean {
    const normalizedTarget = PathUtils.normalize(targetPath);
    const normalizedParent = PathUtils.normalize(parentDir);
    
    const relative = path.relative(normalizedParent, normalizedTarget);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * 检查路径是否包含路径遍历（..）
   * 
   * @param inputPath - 输入路径
   * @returns 是否包含路径遍历
   */
  static hasTraversal(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.includes('..');
  }

  /**
   * 解析路径遍历
   * 
   * 将包含 .. 的路径解析为安全路径
   * 
   * @param inputPath - 输入路径
   * @param baseDir - 基础目录
   * @returns 解析后的安全路径
   */
  static resolveTraversal(inputPath: string, baseDir: string): string {
    const absoluteBase = PathUtils.toAbsolute(baseDir);
    const absoluteTarget = PathUtils.toAbsolute(inputPath, baseDir);
    
    // 检查是否逃逸
    if (!PathUtils.isInside(absoluteTarget, absoluteBase)) {
      throw new Error(
        `路径 "${inputPath}" 解析后会逃逸出基础目录 "${baseDir}"`
      );
    }
    
    return PathUtils.normalize(absoluteTarget);
  }

  /**
   * 规范化分隔符
   * 
   * 将路径分隔符统一为目标分隔符
   * 
   * @param inputPath - 输入路径
   * @param separator - 目标分隔符
   * @returns 规范化后的路径
   */
  static normalizeSeparator(inputPath: string, separator: PathSeparator = '/'): string {
    if (!inputPath) {
      return '';
    }
    
    if (separator === '/') {
      return inputPath.replace(/\\/g, '/');
    } else {
      return inputPath.replace(/\//g, '\\');
    }
  }

  /**
   * 转换为平台相关路径
   * 
   * @param inputPath - 输入路径
   * @returns 平台相关路径
   */
  static toPlatform(inputPath: string): string {
    return path.normalize(inputPath);
  }

  /**
   * 转换为跨平台统一路径（正斜杠）
   * 
   * @param inputPath - 输入路径
   * @returns 跨平台统一路径
   */
  static toCrossPlatform(inputPath: string): string {
    return PathUtils.normalizeSeparator(inputPath, '/');
  }

  /**
   * 合并路径片段
   * 
   * @param basePath - 基础路径
   * @param ...segments - 路径片段
   * @returns 合并后的路径
   */
  static join(basePath: string, ...segments: string[]): string {
    const joined = path.join(basePath, ...segments);
    return PathUtils.normalize(joined);
  }

  /**
   * 获取路径相对于基础目录的部分
   * 
   * @param targetPath - 目标路径
   * @param baseDir - 基础目录
   * @returns 相对路径
   */
  static relative(targetPath: string, baseDir: string): string {
    const normalizedTarget = PathUtils.normalize(targetPath);
    const normalizedBase = PathUtils.normalize(baseDir);
    return path.relative(normalizedBase, normalizedTarget);
  }

  /**
   * 创建安全的文件路径（防止路径遍历）
   * 
   * @param baseDir - 基础目录
   * @param userInput - 用户输入的路径
   * @returns 安全路径
   * @throws 如果路径会逃逸出基础目录
   */
  static safePath(baseDir: string, userInput: string): string {
    const normalizedBase = PathUtils.normalize(baseDir);
    const resolved = PathUtils.resolveTraversal(userInput, normalizedBase);
    return resolved;
  }

  /**
   * 检查路径是否为系统关键路径
   * 
   * @param inputPath - 输入路径
   * @returns 是否为系统路径
   */
  static isSystemPath(inputPath: string): boolean {
    const normalized = PathUtils.normalize(inputPath).toLowerCase();
    
    const systemPaths = [
      // Windows
      'c:/windows',
      'c:/program files',
      'c:/program files (x86)',
      'c:/programdata',
      'c:/system32',
      // Unix/Linux
      '/etc',
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/sbin',
      '/usr/local/bin',
      '/var',
      '/root',
      '/boot',
      '/dev',
      '/proc',
      '/sys',
      // macOS
      '/system',
      '/library',
      '/applications',
      '/private',
    ];
    
    return systemPaths.some(sp => normalized.startsWith(sp));
  }

  /**
   * 规范化 Windows 驱动器路径
   * 
   * @param inputPath - 输入路径
   * @returns 规范化后的路径
   */
  static normalizeDrive(inputPath: string): string {
    if (!inputPath) {
      return '';
    }
    
    // 转换反斜杠
    let normalized = inputPath.replace(/\\/g, '/');
    
    // 处理驱动器路径（如 C: → C:/）
    const driveMatch = normalized.match(/^([A-Za-z]):(.*)$/);
    if (driveMatch) {
      const drive = driveMatch[1].toUpperCase();
      const rest = driveMatch[2] || '/';
      normalized = `/${drive}:/${rest.replace(/^\/+/, '')}`;
    }
    
    return normalized;
  }
}

/**
 * 创建 PathUtils 实例（面向对象的 API）
 */
export function createPathUtils(): typeof PathUtils {
  return PathUtils;
}

export default PathUtils;
/**
 * 文件系统路径检查规则集
 * 
 * 职责：
 *   - 定义文件系统越界访问禁止规则
 *   - 检测路径逃逸攻击（如 ../../ 逃逸出插件目录）
 *   - 检测系统关键路径访问
 *   - 支持插件目录白名单检查
 * 
 * 规则设计原则：
 *   - 路径规范化：统一处理不同操作系统的路径分隔符
 *   - 相对路径解析：基于插件根目录解析相对路径
 *   - 白名单检查：仅允许访问白名单目录内的文件
 *   - 系统路径保护：禁止访问系统关键路径
 * 
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块为纯数据定义和同步逻辑，无异步操作
 *   - 无资源泄漏风险
 */

import path from 'path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

/**
 * 插件目录白名单配置
 * 
 * 用于配置允许插件访问的目录列表。
 * 插件只能访问白名单中指定的目录及其子目录。
 */
export interface DirectoryWhitelist {
  /** 白名单唯一标识符 */
  id: string;
  /** 白名单名称（用于日志和错误信息） */
  name: string;
  /** 允许访问的目录路径列表 */
  allowedDirs: string[];
  /** 是否允许访问子目录 */
  allowSubdirs?: boolean;
  /** 权限要求（需要声明哪些权限才能访问） */
  requiredPermissions?: string[];
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 白名单检查结果
 */
export interface WhitelistCheckResult {
  /** 是否在白名单中 */
  allowed: boolean;
  /** 匹配的白名单项（如果允许） */
  matchedWhitelist?: DirectoryWhitelist;
  /** 错误信息（如果拒绝） */
  error?: string;
  /** 检查的目录 */
  checkedDir: string;
}

/**
 * 路径检查结果
 */
export interface PathCheckResult {
  /** 是否安全 */
  safe: boolean;
  /** 错误信息（如果不安全） */
  error?: string;
  /** 规范化后的绝对路径 */
  normalizedPath?: string;
  /** 相对插件根目录的路径 */
  relativePath?: string;
}

/**
 * 路径检查规则
 */
export interface PathCheckRule {
  /** 规则唯一标识符 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 检查函数 */
  check: (filePath: string, pluginRoot: string) => PathCheckResult;
  /** 严重级别 */
  severity: 'error' | 'warning';
  /** 所需权限（如果声明了该权限则允许） */
  requiredPermission?: string;
}

/**
 * 默认路径检查规则集
 */
export const DEFAULT_PATH_RULES: PathCheckRule[] = [
  // ========== 路径逃逸攻击检测 ==========
  {
    id: 'PATH_TRAVERSAL',
    name: '路径逃逸攻击检测',
    description: '检测路径中的 ../ 或 ..\\ 逃逸出插件目录',
    check: (filePath: string, pluginRoot: string): PathCheckResult => {
      // 规范化路径，统一使用正斜杠
      const normalize = (p: string) => path.normalize(p).replace(/\\/g, '/');
      const normalizedPath = normalize(filePath);
      const normalizedRoot = normalize(pluginRoot);
      
      // 先将相对路径解析为绝对路径（相对于插件根目录）
      let resolvedPath: string;
      if (path.isAbsolute(normalizedPath)) {
        resolvedPath = normalizedPath;
      } else {
        // 相对路径解析为相对于插件根目录
        resolvedPath = path.resolve(normalizedRoot, normalizedPath);
      }
      
      // 计算解析后的绝对路径相对于插件根目录的路径
      const relativePath = path.relative(normalizedRoot, resolvedPath);
      const normalizedRelative = normalize(relativePath);
      
      // 如果相对路径以 .. 开头，表示逃逸出插件目录
      if (normalizedRelative.startsWith('..')) {
        return {
          safe: false,
          error: `路径逃逸攻击：路径 "${filePath}" 逃逸出插件目录 "${pluginRoot}"`,
          normalizedPath: normalize(resolvedPath),
          relativePath: normalizedRelative,
        };
      }
      
      // 路径在插件目录内，返回成功
      return {
        safe: true,
        normalizedPath: normalize(resolvedPath),
        relativePath: normalizedRelative,
      };
    },
    severity: 'error',
    requiredPermission: 'filesystem.read', // 需要文件系统权限才能允许路径遍历
  },

  // ========== 系统关键路径保护 ==========
  {
    id: 'SYSTEM_PATH_PROTECTION',
    name: '系统关键路径保护',
    description: '禁止访问系统关键路径（如 /etc/, C:\\Windows\\ 等）',
    check: (filePath: string, pluginRoot: string): PathCheckResult => {
      const normalize = (p: string) => path.normalize(p).replace(/\\/g, '/');
      const normalizedPath = normalize(filePath);
      
      // 定义系统关键路径模式（使用正斜杠统一格式）
      const systemPathPatterns = [
        // Unix/Linux 系统路径
        /^\/etc\//,
        /^\/bin\//,
        /^\/sbin\//,
        /^\/usr\/bin\//,
        /^\/usr\/sbin\//,
        /^\/usr\/local\/bin\//,
        /^\/var\/log\//,
        /^\/var\/run\//,
        /^\/proc\//,
        /^\/sys\//,
        /^\/dev\//,
        /^\/root\//,
        /^\/home\/[^\/]+\/\.ssh\//,
        
        // Windows 系统路径（转换为正斜杠）
        /^[A-Za-z]:\/Windows\//i,
        /^[A-Za-z]:\/Program Files\//i,
        /^[A-Za-z]:\/Program Files \(x86\)\//i,
        /^[A-Za-z]:\/ProgramData\//i,
        /^[A-Za-z]:\/System32\//i,
        /^[A-Za-z]:\/SysWOW64\//i,
        /^[A-Za-z]:\/Users\/[^\/]+\/\.ssh\//i,
        /^[A-Za-z]:\/Users\/[^\/]+\/AppData\//i,
        /^[A-Za-z]:\/Users\/[^\/]+\/Documents\//i,
        /^[A-Za-z]:\/Users\/[^\/]+\/Desktop\//i,
      ];

      // 检查是否匹配任何系统路径模式
      for (const pattern of systemPathPatterns) {
        if (pattern.test(normalizedPath)) {
          return {
            safe: false,
            error: `禁止访问系统关键路径：${filePath}`,
            normalizedPath,
          };
        }
      }

      return {
        safe: true,
        normalizedPath,
      };
    },
    severity: 'error',
    requiredPermission: 'filesystem.read', // 需要文件系统权限才能访问系统路径
  },

  // ========== 绝对路径限制 ==========
  {
    id: 'ABSOLUTE_PATH_RESTRICTION',
    name: '绝对路径限制',
    description: '限制使用绝对路径，推荐使用相对路径',
    check: (filePath: string, pluginRoot: string): PathCheckResult => {
      const normalize = (p: string) => path.normalize(p).replace(/\\/g, '/');
      const normalizedPath = normalize(filePath);
      const normalizedRoot = normalize(pluginRoot);
      
      // 检查是否为绝对路径
      if (path.isAbsolute(normalizedPath)) {
        // 检查是否在插件目录内
        const relativePath = path.relative(normalizedRoot, normalizedPath);
        const normalizedRelative = normalize(relativePath);
        if (!normalizedRelative.startsWith('..')) {
          // 绝对路径但在插件目录内，允许但警告
          return {
            safe: true,
            error: `建议使用相对路径替代绝对路径：${filePath}`,
            normalizedPath,
            relativePath: normalizedRelative,
          };
        }
        
        // 绝对路径且在插件目录外，拒绝
        return {
          safe: false,
          error: `禁止使用指向插件目录外的绝对路径：${filePath}`,
          normalizedPath,
          relativePath: normalizedRelative,
        };
      }

      return {
        safe: true,
        normalizedPath,
        relativePath: normalizedPath, // 相对路径本身就是相对路径
      };
    },
    severity: 'error', // 绝对路径在插件目录外时错误，拒绝访问
  },

  // ========== 符号链接保护 ==========
  {
    id: 'SYMLINK_PROTECTION',
    name: '符号链接保护',
    description: '检测可能指向系统关键路径的符号链接',
    check: (filePath: string, pluginRoot: string): PathCheckResult => {
      // 注意：实际符号链接检测需要在运行时进行
      // 这里只检查路径模式
      const normalize = (p: string) => path.normalize(p).replace(/\\/g, '/');
      const normalizedPath = normalize(filePath);
      
      // 检查路径是否包含常见的符号链接模式
      const symlinkPatterns = [
        /\.lnk$/i, // Windows 快捷方式
        /\.symlink$/i,
        /\.link$/i,
      ];

      for (const pattern of symlinkPatterns) {
        if (pattern.test(normalizedPath)) {
          // 返回 safe=false 以便错误信息能被正确传递
          return {
            safe: false,
            error: `检测到可能的符号链接：${filePath}，运行时需要验证目标路径`,
            normalizedPath,
          };
        }
      }

      return {
        safe: true,
        normalizedPath,
      };
    },
    severity: 'warning',
  },

  // ========== 文件扩展名限制 ==========
  {
    id: 'FILE_EXTENSION_RESTRICTION',
    name: '文件扩展名限制',
    description: '限制访问特定危险文件扩展名',
    check: (filePath: string, pluginRoot: string): PathCheckResult => {
      const normalize = (p: string) => path.normalize(p).replace(/\\/g, '/');
      const normalizedPath = normalize(filePath);
      const ext = path.extname(normalizedPath).toLowerCase();
      
      // 危险文件扩展名列表（可执行文件和脚本）
      const dangerousExtensions = [
        '.exe', '.bat', '.cmd', '.ps1', '.sh', '.bash',
        '.dll', '.so', '.dylib', // 动态库
        '.py', '.rb', '.pl', '.php', // 脚本语言
        '.jar', '.class', // Java
      ];

      // JavaScript/TypeScript 文件在插件上下文中是允许的
      const jsExtensions = ['.js', '.ts', '.mjs', '.cjs'];
      
      if (dangerousExtensions.includes(ext)) {
        return {
          safe: false,
          error: `禁止访问危险文件扩展名 ${ext}：${filePath}`,
          normalizedPath,
        };
      }

      // JavaScript/TypeScript 文件允许但记录
      if (jsExtensions.includes(ext)) {
        return {
          safe: true,
          error: `访问 JavaScript/TypeScript 文件 ${ext}：${filePath}`,
          normalizedPath,
        };
      }

      return {
        safe: true,
        normalizedPath,
      };
    },
    severity: 'error', // 错误级别，拒绝访问危险文件
    requiredPermission: 'filesystem.read', // 需要权限才能访问危险文件
  },
];

/**
 * 路径检查器
 */
export class PathChecker {
  private rules: PathCheckRule[];
  private pluginRoot: string;

  constructor(pluginRoot: string, rules: PathCheckRule[] = DEFAULT_PATH_RULES) {
    this.pluginRoot = path.normalize(pluginRoot);
    this.rules = rules;
  }

  /**
   * 检查文件路径安全性
   * 
   * @param filePath - 要检查的文件路径
   * @param permissions - 当前声明的权限列表
   * @returns 检查结果
   */
  checkPath(filePath: string, permissions: string[] = []): PathCheckResult {
    // 首先检查路径是否为空
    if (!filePath || filePath.trim() === '') {
      return {
        safe: false,
        error: '文件路径不能为空',
      };
    }

    // 规范化路径，统一使用正斜杠
    const normalizedPath = this.normalizePath(filePath);
    const normalizedRoot = this.normalizePath(this.pluginRoot);

    let finalResult: PathCheckResult = {
      safe: true,
      normalizedPath,
    };

    // 应用所有规则
    for (const rule of this.rules) {
      // 检查权限：如果规则需要权限且用户已声明该权限，则跳过检查
      if (rule.requiredPermission && permissions.includes(rule.requiredPermission)) {
        continue;
      }

      const result = rule.check(filePath, this.pluginRoot);
      
      // 如果规则检查失败
      if (!result.safe) {
        // 如果是错误级别，立即返回失败
        if (rule.severity === 'error') {
          return {
            safe: false,
            error: result.error,
            normalizedPath: this.normalizePath(result.normalizedPath || filePath),
            relativePath: result.relativePath ? this.normalizePath(result.relativePath) : undefined,
          };
        }
        
        // 如果是警告级别，记录警告但继续检查
        if (result.error && !finalResult.error) {
          finalResult.error = result.error;
        }
      }
      
      // 处理警告级别的安全结果（safe: true 但有警告信息）
      if (result.safe && result.error && rule.severity === 'warning') {
        if (!finalResult.error) {
          finalResult.error = result.error;
        }
      }
      
      // 合并规范化路径信息（确保使用统一的正斜杠格式）
      if (result.normalizedPath) {
        finalResult.normalizedPath = this.normalizePath(result.normalizedPath);
      }
      if (result.relativePath) {
        finalResult.relativePath = this.normalizePath(result.relativePath);
      }
    }

    return finalResult;
  }

  /**
   * 批量检查多个文件路径
   * 
   * @param filePaths - 文件路径列表
   * @param permissions - 当前声明的权限列表
   * @returns 检查结果列表
   */
  checkPaths(filePaths: string[], permissions: string[] = []): PathCheckResult[] {
    return filePaths.map(filePath => this.checkPath(filePath, permissions));
  }

  /**
   * 规范化路径，统一使用正斜杠
   * 
   * @param filePath - 文件路径
   * @returns 规范化后的路径
   */
  private normalizePath(filePath: string): string {
    // 使用 path.normalize 规范化路径
    const normalized = path.normalize(filePath);
    // 统一使用正斜杠，便于跨平台比较
    return normalized.replace(/\\/g, '/');
  }

  /**
   * 检查路径是否在插件目录内
   * 
   * @param filePath - 文件路径
   * @returns 是否在插件目录内
   */
  isWithinPluginRoot(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const normalizedRoot = this.normalizePath(this.pluginRoot);
    
    // 如果路径是相对的，先解析为绝对路径（相对于插件根目录）
    let absolutePath: string;
    if (path.isAbsolute(normalizedPath)) {
      absolutePath = normalizedPath;
    } else {
      // 相对路径解析为相对于插件根目录
      absolutePath = path.resolve(normalizedRoot, normalizedPath);
    }
    
    // 计算相对路径
    const relativePath = path.relative(normalizedRoot, absolutePath);
    const normalizedRelative = this.normalizePath(relativePath);
    
    return !normalizedRelative.startsWith('..') && !path.isAbsolute(normalizedRelative);
  }

  /**
   * 获取插件根目录
   */
  getPluginRoot(): string {
    return this.pluginRoot;
  }

  /**
   * 获取所有规则
   */
  getRules(): PathCheckRule[] {
    return [...this.rules];
  }

  /**
   * 按严重级别获取规则
   * 
   * @param severity - 严重级别
   * @returns 该级别的规则列表
   */
  getRulesBySeverity(severity: 'error' | 'warning'): PathCheckRule[] {
    return this.rules.filter(rule => rule.severity === severity);
  }

  /**
   * 按权限获取规则
   * 
   * @param permission - 权限名称
   * @returns 需要该权限的规则列表
   */
  getRulesByPermission(permission: string): PathCheckRule[] {
    return this.rules.filter(rule => rule.requiredPermission === permission);
  }
}

/**
 * 创建路径检查器实例
 */
export function createPathChecker(pluginRoot: string, rules?: PathCheckRule[]): PathChecker {
  return new PathChecker(pluginRoot, rules);
}

/**
 * 路径检查工具函数
 */
export const PathUtils = {
  /**
   * 规范化路径
   */
  normalize: (filePath: string): string => path.normalize(filePath),

  /**
   * 解析相对路径
   */
  resolve: (basePath: string, relativePath: string): string => 
    path.resolve(basePath, relativePath),

  /**
   * 获取相对路径
   */
  relative: (from: string, to: string): string => path.relative(from, to),

  /**
   * 检查是否为绝对路径
   */
  isAbsolute: (filePath: string): boolean => path.isAbsolute(filePath),

  /**
   * 获取文件扩展名
   */
  extname: (filePath: string): string => path.extname(filePath),

  /**
   * 获取目录名
   */
  dirname: (filePath: string): string => path.dirname(filePath),

  /**
   * 获取文件名
   */
  basename: (filePath: string, ext?: string): string => path.basename(filePath, ext),
};

/**
 * 插件目录白名单检查器
 * 
 * 职责：
 *   - 管理允许插件访问的目录白名单
 *   - 验证文件路径是否在白名单内
 *   - 支持配置多个允许访问的目录
 *   - 权限验证与白名单结合
 */
export class DirectoryWhitelistChecker {
  private whitelists: DirectoryWhitelist[];
  private defaultPluginRoot: string;

  /**
   * 创建白名单检查器
   * 
   * @param whitelists - 白名单配置列表
   * @param defaultPluginRoot - 默认插件根目录（当路径为相对路径时使用）
   */
  constructor(whitelists: DirectoryWhitelist[] = [], defaultPluginRoot?: string) {
    // 保留所有白名单（包括禁用的），在检查时处理
    this.whitelists = whitelists;
    this.defaultPluginRoot = defaultPluginRoot || process.cwd();
  }

  /**
   * 检查路径是否在白名单内
   * 
   * @param filePath - 要检查的文件路径
   * @param permissions - 当前声明的权限列表
   * @returns 白名单检查结果
   */
  checkWhitelist(filePath: string, permissions: string[] = []): WhitelistCheckResult {
    // 首先检查路径是否为空
    if (!filePath || filePath.trim() === '') {
      return {
        allowed: false,
        error: '文件路径不能为空',
        checkedDir: '',
      };
    }

    // 规范化路径
    const normalizedPath = this.normalizePath(filePath);
    
    // 如果没有配置白名单，使用默认的插件根目录检查
    if (this.whitelists.length === 0) {
      return this.checkDefaultWhitelist(normalizedPath, permissions);
    }

    // 尝试在白名单中查找匹配（跳过禁用的白名单）
    for (const whitelist of this.whitelists) {
      // 跳过禁用的白名单
      if (whitelist.enabled === false) {
        continue;
      }
      const result = this.checkAgainstWhitelist(normalizedPath, whitelist, permissions);
      if (result.allowed) {
        return result;
      }
    }

    // 未找到匹配的白名单
    return {
      allowed: false,
      error: `路径 "${filePath}" 不在允许的目录白名单内`,
      checkedDir: normalizedPath,
    };
  }

  /**
   * 使用默认插件根目录检查
   */
  private checkDefaultWhitelist(filePath: string, permissions: string[]): WhitelistCheckResult {
    const normalizedRoot = this.normalizePath(this.defaultPluginRoot);
    
    // 解析为绝对路径
    let absolutePath: string;
    if (path.isAbsolute(filePath)) {
      absolutePath = this.normalizePath(filePath);
    } else {
      absolutePath = this.normalizePath(path.resolve(normalizedRoot, filePath));
    }

    // 检查是否在默认插件根目录内
    const relativePath = path.relative(normalizedRoot, absolutePath);
    const normalizedRelative = this.normalizePath(relativePath);
    
    if (!normalizedRelative.startsWith('..') && !path.isAbsolute(normalizedRelative)) {
      return {
        allowed: true,
        checkedDir: absolutePath,
      };
    }

    return {
      allowed: false,
      error: `路径 "${filePath}" 不在默认允许的目录 "${this.defaultPluginRoot}" 内`,
      checkedDir: absolutePath,
    };
  }

  /**
   * 针对单个白名单项检查
   */
  private checkAgainstWhitelist(
    filePath: string, 
    whitelist: DirectoryWhitelist,
    permissions: string[]
  ): WhitelistCheckResult {
    // 解析为绝对路径
    let absolutePath: string;
    if (path.isAbsolute(filePath)) {
      absolutePath = this.normalizePath(filePath);
    } else {
      // 相对路径相对于默认插件根目录解析
      absolutePath = this.normalizePath(path.resolve(this.defaultPluginRoot, filePath));
    }

    // 先检查是否在白名单目录内
    let isInAllowedDir = false;
    for (const allowedDir of whitelist.allowedDirs) {
      const normalizedAllowed = this.normalizePath(allowedDir);
      
      // 计算绝对路径相对于允许目录的路径
      let relativePath: string;
      try {
        relativePath = path.relative(normalizedAllowed, absolutePath);
      } catch {
        // path.relative 可能抛出跨驱动器错误（Windows）
        relativePath = '';
      }
      
      // 检查路径是否在允许目录内
      // 如果相对路径为空字符串或 '.'，表示是同一个目录
      // 如果相对路径以 .. 开头，表示在允许目录外
      // 其他情况表示在允许目录内
      const normalizedRelative = this.normalizePath(relativePath);
      
      // 同一个目录或者子目录都算"在白名单内"
      // 同一个目录：normalizedRelative === '' || normalizedRelative === '.'
      // 子目录：normalizedRelative 不以 .. 开头
      const isSameDir = normalizedRelative === '' || normalizedRelative === '.';
      const isSubdir = !normalizedRelative.startsWith('..') && !path.isAbsolute(normalizedRelative);
      const isInside = isSameDir || isSubdir;
      
      if (isInside) {
        // 如果不允许访问子目录，检查相对路径是否包含目录分隔符
        // 注意：同一个目录（isSameDir === true）应该允许访问
        if (whitelist.allowSubdirs === false && normalizedRelative.includes('/')) {
          return {
            allowed: false,
            error: `路径 "${filePath}" 不在允许访问的目录列表内（不允许访问子目录）`,
            checkedDir: absolutePath,
          };
        }
        
        isInAllowedDir = true;
        break;
      }
    }

    // 如果不在任何允许目录内，返回错误
    if (!isInAllowedDir) {
      return {
        allowed: false,
        error: `路径 "${filePath}" 不在白名单 "${whitelist.name}" 允许的目录内`,
        checkedDir: absolutePath,
      };
    }

    // 检查是否满足权限要求（必须满足所有必需的权限）
    if (whitelist.requiredPermissions && whitelist.requiredPermissions.length > 0) {
      const hasAllPermissions = whitelist.requiredPermissions.every(p => permissions.includes(p));
      if (!hasAllPermissions) {
        return {
          allowed: false,
          error: `访问目录 "${whitelist.name}" 需要权限: ${whitelist.requiredPermissions.join(', ')}`,
          checkedDir: absolutePath,
        };
      }
    }

    // 通过所有检查
    return {
      allowed: true,
      matchedWhitelist: whitelist,
      checkedDir: absolutePath,
    };
  }

  /**
   * 批量检查多个路径
   * 
   * @param filePaths - 文件路径列表
   * @param permissions - 当前声明的权限列表
   * @returns 检查结果列表
   */
  checkWhitelists(filePaths: string[], permissions: string[] = []): WhitelistCheckResult[] {
    return filePaths.map(filePath => this.checkWhitelist(filePath, permissions));
  }

  /**
   * 添加白名单
   * 
   * @param whitelist - 要添加的白名单
   */
  addWhitelist(whitelist: DirectoryWhitelist): void {
    if (whitelist.enabled !== false) {
      this.whitelists.push(whitelist);
    }
  }

  /**
   * 移除白名单
   * 
   * @param whitelistId - 要移除的白名单ID
   */
  removeWhitelist(whitelistId: string): void {
    this.whitelists = this.whitelists.filter(w => w.id !== whitelistId);
  }

  /**
   * 获取所有白名单
   */
  getWhitelists(): DirectoryWhitelist[] {
    return [...this.whitelists];
  }

  /**
   * 规范化路径，统一使用正斜杠
   */
  private normalizePath(filePath: string): string {
    const normalized = path.normalize(filePath);
    return normalized.replace(/\\/g, '/');
  }
}

/**
 * 创建白名单检查器实例
 */
export function createWhitelistChecker(
  whitelists?: DirectoryWhitelist[], 
  defaultPluginRoot?: string
): DirectoryWhitelistChecker {
  return new DirectoryWhitelistChecker(whitelists, defaultPluginRoot);
}

/**
 * 默认白名单配置
 * 
 * 包含常用的安全目录：
 * - 插件目录本身
 * - 临时目录
 * - 配置文件目录
 */
export const DEFAULT_WHITELISTS: DirectoryWhitelist[] = [
  {
    id: 'plugin-root',
    name: '插件根目��',
    allowedDirs: [], // 由运行时设置
    allowSubdirs: true,
    requiredPermissions: ['filesystem.read'],
    enabled: true,
  },
  {
    id: 'temp-dir',
    name: '临时目录',
    allowedDirs: ['/tmp', '/var/tmp', 'C:\\Temp', 'C:\\Windows\\Temp'],
    allowSubdirs: true,
    requiredPermissions: ['filesystem.read', 'filesystem.write'],
    enabled: true,
  },
  {
    id: 'config-dir',
    name: '配置目录',
    allowedDirs: ['~/.specforge/config', `${SPEC_DIR_NAME}/config`],
    allowSubdirs: true,
    requiredPermissions: ['filesystem.read'],
    enabled: true,
  },
];
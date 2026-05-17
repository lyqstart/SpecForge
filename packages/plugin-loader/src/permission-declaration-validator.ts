/**
 * PermissionDeclarationValidator 实现（任务 3.1.2 核心交付物）
 *
 * 本模块实现权限声明验证的核心逻辑，承接：
 *   - design.md 中的 AuthValidator 接口
 *   - Property PL-1（权限声明验证）
 *   - Property PL-2（静态检查一致性）
 *
 * 核心职责：
 *   1. 验证插件清单中声明的权限（requires）与实际使用的 API 匹配
 *   2. 结合静态检查器结果，检测声明不足（使用了需要权限的 API 但未声明）
 *   3. 检测声明过度（声明了但未使用的权限，可选警告）
 *   4. 生成清晰的验证错误信息
 *
 * 设计原则：
 *   - 最小权限原则：声明的权限必须覆盖实际使用的 API
 *   - 静态检查优先：在加载时发现问题，减少运行时开销
 *   - 可观测性优先：所有验证决策记录到错误信息
 */

import type { PluginPermission } from './manifest';
import type { StaticCheckRule } from './static-checker/rules';
import { DEFAULT_RULE_SET } from './static-checker/rules';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 权限声明验证错误的详细信息
 */
export interface PermissionDeclarationError {
  /** 错误类型 */
  type: 'insufficient_permissions' | 'undeclared_api_usage' | 'unused_permission';
  /** 涉及的权限或 API */
  subject: string;
  /** 详细原因 */
  reason: string;
  /** 行动建议 */
  suggestion?: string;
  /** 相关代码位置（如果是 API 使用相关） */
  location?: {
    line: number;
    column?: number;
    file?: string;
  };
}

/**
 * 静态检查结果（简化版，只保留权限相关信息）
 */
export interface SimplifiedStaticCheckResult {
  passed: boolean;
  /** 违规列表，每个违规需要的权限 */
  violations: Array<{
    ruleId: string;
    api: string;
    requiredPermission?: string;
    line?: number;
    column?: number;
  }>;
}

/**
 * 权限声明验证结果
 */
export interface PermissionDeclarationValidationResult {
  /** 是否通过验证 */
  valid: boolean;
  /** 错误列表 */
  errors: PermissionDeclarationError[];
  /** 警告列表（可选权限、未使用权限等） */
  warnings?: PermissionDeclarationError[];
  /** 需要但未声明的权限列表 */
  missingPermissions: PluginPermission[];
  /** 声明了但未使用的权限列表（仅当 includeUnusedWarnings 为 true 时） */
  unusedPermissions?: PluginPermission[];
}

/**
 * 权限与 API 映射关系
 *
 * 用于将静态检查器检测到的 API 映射回需要的权限
 */
interface PermissionAPIMapping {
  [permission: string]: string[]; // 权限 -> API 模式列表
}

// ---------------------------------------------------------------------------
// 权限与 API 映射
// ---------------------------------------------------------------------------

/** 标准权限与所需 API 的映射关系 */
const PERMISSION_API_MAPPING: PermissionAPIMapping = {
  'child_process': [
    'child_process.exec',
    'child_process.execSync',
    'child_process.spawn',
    'child_process.spawnSync',
    'child_process.fork',
    'child_process.execFile',
    'child_process.execFileSync',
  ],
  'filesystem.read': [
    'fs.readFile',
    'fs.access',
    'fs.stat',
    'fs.readdir',
    'fs.readFileSync',
    'fs.readdirSync',
    'fs.statSync',
    'fs.accessSync',
    'os.homedir', // 需要 filesystem.read
  ],
  'filesystem.write': [
    'fs.writeFile',
    'fs.writeFileSync',
    'fs.unlink',
    'fs.rmdir',
    'fs.mkdir',
    'fs.rename',
    'fs.copyFile',
    'fs.writeFileSync',
    'fs.unlinkSync',
    'fs.rmdirSync',
    'fs.mkdirSync',
    'fs.renameSync',
    'fs.copyFileSync',
  ],
  'network': [
    'http.request',
    'https.request',
    'http.createServer',
    'https.createServer',
    '*.listen',
    'fetch',
  ],
  'env.read': [
    'process.env',
    'os.platform',
    'os.homedir',
    'os.tmpdir',
  ],
};

// ---------------------------------------------------------------------------
// PermissionDeclarationValidator 类
// ---------------------------------------------------------------------------

/**
 * 权限声明验证器
 *
 * 职责：
 *   1. 验证插件声明的权限是否覆盖实际使用的 API
 *   2. 检测声明不足（使用了需要权限的 API 但未声明权限）
 *   3. 检测声明过度（声明了但未使用的权限，可选警告）
 *   4. 生成详细的验证错误信息
 *
 * 使用示例：
 *   ```typescript
 *   const validator = new PermissionDeclarationValidator();
 *
 *   // 验证权限声明
 *   const result = validator.validate({
 *     declaredPermissions: ['filesystem.read', 'network'],
 *     staticCheckResult: {
 *       passed: false,
 *       violations: [
 *         { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
 *         { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
 *       ]
 *     }
 *   });
 *
 *   if (!result.valid) {
 *     console.error('验证失败:', result.errors);
 *   }
 *   ```
 */
export class PermissionDeclarationValidator {
  /**
   * 验证插件权限声明是否与实际使用的 API 匹配
   *
   * 算法：
   *   1. 解析声明的权限集合
   *   2. 从静态检查结果中提取需要的权限集合
   *   3. 检测声明不足：实际需要的权限是否都在声明中
   *   4. 生成详细的错误信息
   *
   * @param options 验证选项
   * @returns 验证结果
   */
  validate(options: {
    /** 插件声明的权限列表（来自 PluginManifest.permissions） */
    declaredPermissions: string[];
    /** 静态检查结果 */
    staticCheckResult: SimplifiedStaticCheckResult;
    /** 是否检测未使用的权限（默认 false） */
    detectUnusedPermissions?: boolean;
  }): PermissionDeclarationValidationResult {
    const { declaredPermissions, staticCheckResult, detectUnusedPermissions = false } = options;

    const errors: PermissionDeclarationError[] = [];
    const warnings: PermissionDeclarationError[] = [];
    const missingPermissions: PluginPermission[] = [];
    const usedPermissions = new Set<PluginPermission>();

    // 1. 从静态检查结果中提取需要的权限
    const requiredPermissionsFromViolations = this.extractRequiredPermissions(staticCheckResult);

    // 2. 检查声明的权限是否覆盖实际需要的权限
    const declaredSet = new Set(declaredPermissions.map(p => p.toLowerCase()));

    for (const [permission, isNeeded] of requiredPermissionsFromViolations) {
      if (isNeeded && !declaredSet.has(permission)) {
        missingPermissions.push(permission as PluginPermission);
        const apis = PERMISSION_API_MAPPING[permission] || [];
        errors.push({
          type: 'insufficient_permissions',
          subject: permission,
          reason: `插件使用了需要 "${permission}" 权限的 API，但未在清单中声明`,
          suggestion: `请在 plugin.json 的 "permissions" 字段中添加 "${permission}" 权限`,
        });
      }

      if (isNeeded) {
        usedPermissions.add(permission as PluginPermission);
      }
    }

    // 3. 可选：检测未使用的权限（警告）
    if (detectUnusedPermissions) {
      const unusedPermissions: PluginPermission[] = [];
      for (const declared of declaredPermissions) {
        if (!usedPermissions.has(declared.toLowerCase() as PluginPermission)) {
          unusedPermissions.push(declared as PluginPermission);
          warnings.push({
            type: 'unused_permission',
            subject: declared,
            reason: `声明了 "${declared}" 权限，但插件代码中未使用需要该权限的 API`,
            suggestion: '如果不需要该权限，建议从清单中移除以遵循最小权限原则',
          });
        }
      }
    }

    // 4. 组合结果
    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      missingPermissions,
    };
  }

  /**
   * 验证权限声明是否在授权集合中
   *
   * 这是对 PermissionValidator 的包装，确保声明的权限都在授权范围内
   *
   * @param declaredPermissions 声明的权限列表
   * @param grants 授权的权限列表
   * @returns 验证错误列表（空表示通过）
   */
  validateAgainstGrants(
    declaredPermissions: string[],
    grants: string[]
  ): PermissionDeclarationError[] {
    const errors: PermissionDeclarationError[] = [];
    const grantsSet = new Set(grants.map(p => p.toLowerCase()));

    for (const permission of declaredPermissions) {
      if (!grantsSet.has(permission.toLowerCase())) {
        errors.push({
          type: 'insufficient_permissions',
          subject: permission,
          reason: `权限 "${permission}" 未被系统授权`,
          suggestion: `请在授权配置中添加 "${permission}" 权限，或联系系统管理员`,
        });
      }
    }

    return errors;
  }

  /**
   * 完整验证：同时检查声明是否匹配 API 使用，以及是否在授权范围内
   *
   * @param options 验证选项（包含 declaredPermissions, staticCheckResult, grants）
   * @returns 完整验证结果
   */
  validateFull(options: {
    /** 插件声明的权限列表 */
    declaredPermissions: string[];
    /** 静态检查结果 */
    staticCheckResult: SimplifiedStaticCheckResult;
    /** 授权的权限列表 */
    grants: string[];
    /** 是否检测未使用的权限 */
    detectUnusedPermissions?: boolean;
  }): PermissionDeclarationValidationResult {
    const { declaredPermissions, staticCheckResult, grants, detectUnusedPermissions } = options;

    // 第一步：验证声明与 API 使用匹配
    const apiValidation = this.validate({
      declaredPermissions,
      staticCheckResult,
      detectUnusedPermissions,
    });

    // 第二步：验证声明是否在授权范围内
    const grantErrors = this.validateAgainstGrants(declaredPermissions, grants);

    // 合并错误
    const allErrors = [...apiValidation.errors, ...grantErrors];
    const allMissing = [...apiValidation.missingPermissions];

    // grantErrors 中的权限也应该加入 missing
    for (const error of grantErrors) {
      if (!allMissing.includes(error.subject as PluginPermission)) {
        // 不重复添加已经在 missingPermissions 中的
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: apiValidation.warnings,
      missingPermissions: allMissing,
    };
  }

  /**
   * 从静态检查结果提取需要的权限集合
   *
   * @param staticCheckResult 静态检查结果
   * @returns 权限 -> 是否需要的映射
   */
  private extractRequiredPermissions(
    staticCheckResult: SimplifiedStaticCheckResult
  ): Map<string, boolean> {
    const result = new Map<string, boolean>();

    // 如果静态检查通过，则不需要额外权限
    if (staticCheckResult.passed && staticCheckResult.violations.length === 0) {
      return result;
    }

    // 从违规中提取需要的权限
    for (const violation of staticCheckResult.violations) {
      if (violation.requiredPermission) {
        result.set(violation.requiredPermission.toLowerCase(), true);
      } else {
        // 如果没有明确标记所需权限，尝试从 API 名称推断
        const inferredPermission = this.inferPermissionFromAPI(violation.api);
        if (inferredPermission) {
          result.set(inferredPermission.toLowerCase(), true);
        }
      }
    }

    return result;
  }

  /**
   * 从 API 名称推断需要的权限
   *
   * @param api API 名称
   * @returns 推断的权限名称
   */
  private inferPermissionFromAPI(api: string): string | null {
    // 遍历权限与 API 映射，查找匹配的 API
    for (const [permission, apis] of Object.entries(PERMISSION_API_MAPPING)) {
      for (const pattern of apis) {
        if (this.matchAPIPattern(api, pattern)) {
          return permission;
        }
      }
    }

    // 尝试从 API 名称前缀推断
    if (api.startsWith('child_process.')) return 'child_process';
    if (api.startsWith('fs.') && this.isWriteOperation(api)) return 'filesystem.write';
    if (api.startsWith('fs.')) return 'filesystem.read';
    if (api.startsWith('http.') || api.startsWith('https.')) return 'network';
    if (api === 'fetch') return 'network';
    if (api.startsWith('process.') || api.startsWith('os.')) return 'env.read';

    return null;
  }

  /**
   * 检查 API 是否为写操作
   */
  private isWriteOperation(api: string): boolean {
    const writeOperations = ['write', 'unlink', 'rmdir', 'mkdir', 'rename', 'copyFile', 'append'];
    return writeOperations.some(op => api.toLowerCase().includes(op.toLowerCase()));
  }

  /**
   * 匹配 API 模式（支持通配符）
   */
  private matchAPIPattern(api: string, pattern: string): boolean {
    if (api === pattern) return true;

    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
      return regex.test(api);
    }

    return false;
  }

  /**
   * 获取所有已知权限的列表
   *
   * @returns 权限列表
   */
  getKnownPermissions(): string[] {
    return Object.keys(PERMISSION_API_MAPPING);
  }

  /**
   * 获取指定权限对应的 API 列表
   *
   * @param permission 权限名称
   * @returns API 模式列表
   */
  getAPIsForPermission(permission: string): string[] {
    return PERMISSION_API_MAPPING[permission] || [];
  }
}

// ---------------------------------------------------------------------------
// 导出单例实例
// ---------------------------------------------------------------------------

/**
 * 全局权限声明验证器实例
 */
export const permissionDeclarationValidator = new PermissionDeclarationValidator();
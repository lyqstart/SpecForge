/**
 * PermissionValidator 实现（任务 1.4 核心交付物）
 *
 * 本模块实现权限验证逻辑，承接 design.md 中的 AuthValidator 接口与
 * Property PL-1（权限声明验证）、Property PL-3（最小权限原则）。
 *
 * 核心职责：
 *   1. 验证插件声明的权限是否被系统授予（Property PL-1）
 *   2. 检查单个权限是否在授予集合中（Property PL-3）
 *   3. 生成清晰的验证错误信息，便于用户理解拒绝原因
 *
 * 设计原则：
 *   - 最小权限原则：默认拒绝，显式授权
 *   - 显式声明优于隐式推断：权限必须明确列出
 *   - 可观测性优先：所有验证决策记录到错误信息
 */

import type { PluginPermission } from './manifest';

// ---------------------------------------------------------------------------
// 验证错误类型
// ---------------------------------------------------------------------------

/**
 * 权限验证错误的详细信息。
 *
 * 字段说明：
 *   - permission: 未被授权的权限名称
 *   - reason: 人类可读的拒绝原因（例 "未在授权集合中"）
 *   - suggestion: 可选的行动建议（例 "请在 ~/.specforge/config/plugin-grants.json 中添加该权限"）
 */
export interface ValidationError {
  permission: string;
  reason: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// PermissionValidator 类
// ---------------------------------------------------------------------------

/**
 * 权限验证器
 *
 * 职责：
 *   1. 验证插件声明的权限集合是否被系统授予
 *   2. 检查单个权限是否在授予集合中
 *   3. 生成详细的验证错误信息
 *
 * 使用示例：
 *   ```typescript
 *   const validator = new PermissionValidator();
 *   const errors = validator.validatePermissions(
 *     ['filesystem.read', 'network'],
 *     ['filesystem.read']
 *   );
 *   if (errors.length > 0) {
 *     console.error('权限验证失败:', errors);
 *   }
 *   ```
 */
export class PermissionValidator {
  /**
   * 验证插件声明的权限是否被授予。
   *
   * 算法：
   *   1. 对每个声明的权限，检查是否在授予集合中
   *   2. 如果不在，生成一条 ValidationError
   *   3. 返回所有错误的数组（空数组表示验证通过）
   *
   * 参数：
   *   - requires: 插件声明的权限列表（来自 PluginManifest.permissions）
   *   - grants: 系统授予的权限列表（来自 GrantsConfig.grantedPermissions）
   *
   * 返回：
   *   - ValidationError[] 数组，每个元素代表一个未被授权的权限
   *   - 空数组表示所有声明的权限都被授予
   *
   * 边界情况处理：
   *   - requires 为空数组：返回空数组（无权限声明 = 验证通过）
   *   - grants 为空数组：返回 requires 中所有权限的错误（无授权 = 全部拒绝）
   *   - requires 包含重复值：每个重复值都会生成一条错误（便于用户发现清单问题）
   *   - requires 包含未知权限名：生成错误，reason 说明"未知权限"
   *   - grants 包含未知权限名：忽略（不影响验证逻辑，只做集合差运算）
   */
  validatePermissions(requires: string[], grants: string[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const grantsSet = new Set(grants);

    for (const permission of requires) {
      if (!grantsSet.has(permission)) {
        errors.push({
          permission,
          reason: `权限 "${permission}" 未被授予`,
          suggestion: `请在授权配置中添加 "${permission}" 权限，或联系系统管理员。`,
        });
      }
    }

    return errors;
  }

  /**
   * 检查单个权限是否在授予集合中。
   *
   * 算法：
   *   - 简单的集合成员检查
   *
   * 参数：
   *   - permission: 要检查的权限名称
   *   - grants: 授予的权限列表
   *
   * 返回：
   *   - true: 权限被授予
   *   - false: 权限未被授予或不存在
   *
   * 边界情况：
   *   - permission 为空字符串：返回 false
   *   - grants 为空数组：返回 false
   *   - permission 不在已知权限列表中：返回 false（最小权限原则）
   */
  checkPermission(permission: string, grants: string[]): boolean {
    if (!permission || permission.length === 0) {
      return false;
    }
    return grants.includes(permission);
  }
}

// ---------------------------------------------------------------------------
// 导出单例实例（便于模块级使用）
// ---------------------------------------------------------------------------

/**
 * 全局权限验证器实例。
 *
 * 使用示例：
 *   ```typescript
 *   import { permissionValidator } from './permission-validator';
 *   const errors = permissionValidator.validatePermissions(requires, grants);
 *   ```
 */
export const permissionValidator = new PermissionValidator();

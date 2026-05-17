/**
 * AuthorizationCollection 授权集合管理实现（任务 3.1.1 核心交付物）
 *
 * 本模块实现授权集合的完整管理能力，包括：
 *   1. 权限添加/移除/检查方法
 *   2. 权限继承支持（父级授权可以被继承）
 *   3. 权限覆盖支持（子级可以覆盖父级权限）
 *   4. 与 GrantsConfig 的无缝集成
 *
 * 设计原则：
 *   - 最小权限原则：默认拒绝，显式授权
 *   - 集合语义：权限集合操作（并集、交集、差集）
 *   - 可变性：授权集合可以在运行时动态修改
 *   - 可观测性：所有修改操作可追溯
 */

import type { PluginPermission } from '../manifest';
import type { GrantsConfig } from '../grants';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 合法的 PluginPermission 取值集合 */
const VALID_PERMISSIONS: ReadonlySet<PluginPermission> = new Set<PluginPermission>([
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
]);

/** 所有已知权限的数组（用于批量操作） */
export const ALL_KNOWN_PERMISSIONS: readonly PluginPermission[] = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
];

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/**
 * 授权来源标识
 *
 * 用于追踪权限的来源层级：
 *   - default: 内置默认授权（始终存在但通常为空）
 *   - user: 用户级授权（~/.specforge/）
 *   - project: 项目级授权（<project>/.specforge/）
 *   - runtime: 运行时动态授权（CLI/API）
 */
export type AuthorizationSource = 'default' | 'user' | 'project' | 'runtime';

/**
 * 权限条目
 *
 * 记录单个权限的详细信息：
 *   - permission: 权限名称
 *   - source: 授权来源
 *   - inherited: 是否继承自父级
 *   - overridden: 是否被子级覆盖（仅当 inherited=true 时有意义）
 */
export interface PermissionEntry {
  permission: PluginPermission;
  source: AuthorizationSource;
  inherited: boolean;
  overridden?: boolean;
}

/**
 * 授权集合变更事件
 *
 * 记录授权集合的每一次修改：
 *   - type: 变更类型（add/remove/clear/merge）
 *   - permission: 涉及的权限（如适用）
 *   - timestamp: 变更时间戳
 *   - source: 变更来源
 */
export interface AuthorizationChangeEvent {
  type: 'add' | 'remove' | 'clear' | 'merge' | 'inherit' | 'override';
  permission?: PluginPermission;
  timestamp: number;
  source: AuthorizationSource;
}

// ---------------------------------------------------------------------------
// AuthorizationCollection 类
// ---------------------------------------------------------------------------

/**
 * 授权集合管理器
 *
 * 核心职责：
 *   1. 管理授权权限集合（添加、移除、检查）
 *   2. 支持权限继承（从父级集合继承权限）
 *   3. 支持权限覆盖（子级可以覆盖继承的权限）
 *   4. 追踪所有变更历史
 *
 * 使用示例：
 *   ```typescript
 *   // 创建授权集合
 *   const auth = new AuthorizationCollection();
 *
 *   // 添加权限
 *   auth.add('filesystem.read', 'runtime');
 *
 *   // 检查权限
 *   if (auth.has('filesystem.read')) {
 *     console.log('有文件读取权限');
 *   }
 *
 *   // 移除权限
 *   auth.remove('filesystem.read', 'runtime');
 *
 *   // 获取所有授权权限
 *   const permissions = auth.toArray();
 *   ```
 */
export class AuthorizationCollection {
  /** 内部权限存储：permission -> PermissionEntry */
  private permissions: Map<PluginPermission, PermissionEntry> = new Map();

  /** 父级授权集合引用（用于继承） */
  private parent: AuthorizationCollection | null = null;

  /** 变更历史记录 */
  private changeHistory: AuthorizationChangeEvent[] = [];

  /** 当前授权来源 */
  private currentSource: AuthorizationSource = 'default';

  // ---------------------------------------------------------------------------
  // 构造函数
  // ---------------------------------------------------------------------------

  /**
   * 创建一个空的授权集合。
   *
   * @param initialPermissions 初始授权权限列表（可选）
   * @param source 初始授权来源（默认 'default'）
   */
  constructor(
    initialPermissions?: readonly PluginPermission[],
    source: AuthorizationSource = 'default',
  ) {
    this.currentSource = source;
    if (initialPermissions) {
      for (const p of initialPermissions) {
        if (this.isValidPermission(p)) {
          this.permissions.set(p, {
            permission: p,
            source,
            inherited: false,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 权限检查方法
  // ---------------------------------------------------------------------------

  /**
   * 检查指定权限是否被授权。
   *
   * 检查逻辑（checkParent=true 时）：
   *   1. 首先检查本地集合
   *   2. 如果本地有且被标记为 overridden，返回 false（显式拒绝，不查父级）
   *   3. 如果本地没有或有但未覆盖，检查父级
   *
   * 检查逻辑（checkParent=false 时）：
   *   1. 只检查本地非继承的权限
   *   2. 继承的权限即使存在也算没有（因为是继承的）
   *
   * @param permission 要检查的权限
   * @param checkParent 是否检查父级集合（默认 true）
   * @returns true 表示有权限，false 表示无权限
   */
  has(permission: PluginPermission, checkParent = true): boolean {
    const entry = this.permissions.get(permission);

    if (checkParent) {
      // 如果本地存在且被标记为 overridden，直接返回 false（显式拒绝）
      if (entry && entry.overridden) {
        return false;
      }
      // 本地有且未被覆盖，返回 true
      if (entry && !entry.overridden) {
        return true;
      }
      // 本地不存在或被覆盖（已删除条目），检查父级
      if (this.parent) {
        return this.parent.has(permission, true);
      }
      return false;
    } else {
      // checkParent=false: 只检查本地非继承的权限
      if (entry && !entry.inherited && !entry.overridden) {
        return true;
      }
      return false;
    }
  }

  /**
   * 检查是否拥有所有指定权限。
   *
   * @param permissions 要检查的权限数组
   * @param checkParent 是否检查父级集合（默认 true）
   * @returns true 表示拥有所有权限，false 表示至少缺少一个
   */
  hasAll(permissions: readonly PluginPermission[], checkParent = true): boolean {
    return permissions.every((p) => this.has(p, checkParent));
  }

  /**
   * 检查是否拥有任一指定权限。
   *
   * @param permissions 要检查的权限数组
   * @param checkParent 是否检查父级集合（默认 true）
   * @returns true 表示拥有至少一个权限，false 表示一个都没有
   */
  hasAny(permissions: readonly PluginPermission[], checkParent = true): boolean {
    return permissions.some((p) => this.has(p, checkParent));
  }

  /**
   * 获取缺少的权限列表。
   *
   * @param required 需要检查的权限数组
   * @param checkParent 是否检查父级集合（默认 true）
   * @returns 缺少的权限数组（空数组表示全部满足）
   */
  getMissingPermissions(
    required: readonly PluginPermission[],
    checkParent = true,
  ): PluginPermission[] {
    return required.filter((p) => !this.has(p, checkParent));
  }

  // ---------------------------------------------------------------------------
  // 权限添加方法
  // ---------------------------------------------------------------------------

  /**
   * 添加单个权限到授权集合。
   *
   * 添加规则：
   *   - 如果权限已存在且未被覆盖，无操作
   *   - 如果权限已存在但被覆盖，取消覆盖���记
   *   - 如果权限不存在，新增条目
   *
   * @param permission 要添加的权限
   * @param source 授权来源（默认使用构造函数指定的来源）
   * @returns this（支持链式调用）
   */
  add(permission: PluginPermission, source?: AuthorizationSource): this {
    if (!this.isValidPermission(permission)) {
      return this;
    }

    const effectiveSource = source ?? this.currentSource;
    const existing = this.permissions.get(permission);

    if (existing) {
      // 已存在：取消覆盖标记，更新来源
      existing.overridden = false;
      existing.source = effectiveSource;
    } else {
      // 不存在：新增
      this.permissions.set(permission, {
        permission,
        source: effectiveSource,
        inherited: false,
      });
    }

    this.recordChange({
      type: 'add',
      permission,
      timestamp: Date.now(),
      source: effectiveSource,
    });

    return this;
  }

  /**
   * 批量添加权限。
   *
   * @param permissions 要添加的权限数组
   * @param source 授权来源（默认使用构造函数指定的来源）
   * @returns this（支持链式调用）
   */
  addMany(permissions: readonly PluginPermission[], source?: AuthorizationSource): this {
    for (const p of permissions) {
      this.add(p, source);
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // 权限移除方法
  // ---------------------------------------------------------------------------

  /**
   * 从授权集合移除单个权限。
   *
   * 移除规则：
   *   - 如果权限存在且不是继承的，直接移除
   *   - 如果权限是继承的，标记为 overridden（实现"撤销继承"语义）
   *   - 如果权限不存在，无操作
   *
   * @param permission 要移除的权限
   * @param source 指定的来源限制（可选，不指定则移除任何来源的该权限）
   * @returns this（支持链式调用）
   */
  remove(permission: PluginPermission, source?: AuthorizationSource): this {
    const entry = this.permissions.get(permission);

    if (!entry) {
      return this;
    }

    // 如果指定了来源限制，且不匹配，不做任何操作
    if (source && entry.source !== source) {
      return this;
    }

    if (entry.inherited) {
      // 是继承的权限：标记为被覆盖（实现撤销继承）
      entry.overridden = true;
    } else {
      // 非继承权限：直接移除
      this.permissions.delete(permission);
    }

    this.recordChange({
      type: 'remove',
      permission,
      timestamp: Date.now(),
      source: entry.source,
    });

    return this;
  }

  /**
   * 批量移除权限。
   *
   * @param permissions 要移除的权限数组
   * @param source 指定的来源限制（可选）
   * @returns this（支持链式调用）
   */
  removeMany(permissions: readonly PluginPermission[], source?: AuthorizationSource): this {
    for (const p of permissions) {
      this.remove(p, source);
    }
    return this;
  }

  /**
   * 清空所有非继承的权限。
   *
   * 注意：继承的权限不会被清除（它们属于父级），但可以被覆盖。
   *
   * @returns this（支持链式调用）
   */
  clear(): this {
    const removed: PluginPermission[] = [];

    for (const [perm, entry] of this.permissions) {
      if (!entry.inherited) {
        removed.push(perm);
        this.permissions.delete(perm);
      }
    }

    if (removed.length > 0) {
      this.recordChange({
        type: 'clear',
        timestamp: Date.now(),
        source: this.currentSource,
      });
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  // 权限继承方法
  // ---------------------------------------------------------------------------

  /**
   * 设置父级授权集合。
   *
   * 设置后，当前集合可以继承父级的权限。
   * 当 parent 设为 null 时，清除所有继承的权限条目（只保留本地直接添加的）。
   *
   * @param parent 父级 AuthorizationCollection 实例
   * @returns this（支持链式调用）
   */
  setParent(parent: AuthorizationCollection | null): this {
    if (parent === null) {
      // 清除所有继承的权限条目
      for (const [perm, entry] of this.permissions) {
        if (entry.inherited) {
          this.permissions.delete(perm);
        }
      }
    }
    this.parent = parent;
    return this;
  }

  /**
   * 从父级继承所有权限。
   *
   * 继承规则：
   *   - 继承父级所有的非 overridden 权限
   *   - 继承的权限标记为 inherited=true
   *   - 如果本地已有同名权限，本地权限优先级更高（不覆盖）
   *
   * @returns this（支持链式调用）
   */
  inheritFromParent(): this {
    if (!this.parent) {
      return this;
    }

    // 获取父级的所有有效权限
    const parentPermissions = this.parent.toArray();

    for (const perm of parentPermissions) {
      // 如果本地没有这个权限，添加为继承的
      if (!this.permissions.has(perm)) {
        this.permissions.set(perm, {
          permission: perm,
          source: 'default', // 继承的权限来源视为 default
          inherited: true,
        });
      }
    }

    this.recordChange({
      type: 'inherit',
      timestamp: Date.now(),
      source: 'default',
    });

    return this;
  }

  /**
   * 移除所有继承的权限覆盖，恢复继承状态。
   *
   * @returns this（支持链式调用）
   */
  restoreInherited(): this {
    for (const entry of this.permissions.values()) {
      if (entry.inherited) {
        entry.overridden = false;
      }
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // 权限覆盖方法
  // ---------------------------------------------------------------------------

  /**
   * 覆盖指定权限（即使其来自父级也视为无效）。
   *
   * 覆盖规则：
   *   - 如果权限存在于父级但不存在于本地，创建标记为 overridden 的条目
   *   - 如果权限已存在于本地，标记为 overridden
   *
   * @param permission 要覆盖的权限
   * @returns this（支持链式调用）
   */
  override(permission: PluginPermission): this {
    if (!this.isValidPermission(permission)) {
      return this;
    }

    const existing = this.permissions.get(permission);

    if (existing) {
      existing.overridden = true;
    } else {
      // 本地没有，创建一个被覆盖的条目（占位，防止从父级继承）
      this.permissions.set(permission, {
        permission,
        source: this.currentSource,
        inherited: false,
        overridden: true,
      });
    }

    this.recordChange({
      type: 'override',
      permission,
      timestamp: Date.now(),
      source: this.currentSource,
    });

    return this;
  }

  /**
   * 批量覆盖权限。
   *
   * @param permissions 要覆盖的权限数组
   * @returns this（支持链式调用）
   */
  overrideMany(permissions: readonly PluginPermission[]): this {
    for (const p of permissions) {
      this.override(p);
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // 集合操作方法
  // ---------------------------------------------------------------------------

  /**
   * 获取所有授权权限的数组（不包括被覆盖的）。
   *
   * @param includeParent 是否包含父级权限和继承的权限（默认 true）
   *   - true: 返回所有有效权限（包括父级继承的）
   *   - false: 只返回本地直接添加的权限（不包括继承的）
   * @returns 授权权限数组
   */
  toArray(includeParent = true): PluginPermission[] {
    const result: PluginPermission[] = [];

    if (includeParent) {
      // 本地非覆盖的权限（包括继承但未覆盖的）
      for (const [perm, entry] of this.permissions) {
        if (!entry.overridden) {
          result.push(perm);
        }
      }

      // 父级权限（排除本地已覆盖的）
      if (this.parent) {
        const parentPerms = this.parent.toArray(true);
        for (const p of parentPerms) {
          const localEntry = this.permissions.get(p);
          if (!localEntry || !localEntry.overridden) {
            if (!result.includes(p)) {
              result.push(p);
            }
          }
        }
      }
    } else {
      // 只返回本地非继承、非覆盖的权限
      for (const [perm, entry] of this.permissions) {
        if (!entry.inherited && !entry.overridden) {
          result.push(perm);
        }
      }
    }

    return result;
  }

  /**
   * 获取作为 Set 的授权权限集合。
   *
   * @param includeParent 是否包含父级权限（默认 true）
   * @returns 授权权限 Set
   */
  toSet(includeParent = true): ReadonlySet<PluginPermission> {
    return new Set(this.toArray(includeParent));
  }

  /**
   * 获取包含详细信息的权限条目数组。
   *
   * @param includeParent 是否包含父级权限（默认 true）
   * @returns 权限条目数组
   */
  getEntries(includeParent = true): PermissionEntry[] {
    const result: PermissionEntry[] = [];

    for (const entry of this.permissions.values()) {
      result.push({ ...entry });
    }

    if (includeParent && this.parent) {
      const parentEntries = this.parent.getEntries(true);
      const localPerms = new Set(this.permissions.keys());

      for (const entry of parentEntries) {
        if (!localPerms.has(entry.permission)) {
          result.push({
            ...entry,
            inherited: true,
          });
        }
      }
    }

    return result;
  }

  /**
   * 获取授权集合的大小。
   *
   * @param includeParent 是否包含父级权限（默认 true）
   * @returns 授权权限数量
   */
  size(includeParent = true): number {
    return this.toArray(includeParent).length;
  }

  /**
   * 检查授权集合是否为空。
   *
   * @param includeParent 是否检查父级权限（默认 true）
   * @returns true 表示空，false 表示非空
   */
  isEmpty(includeParent = true): boolean {
    return this.size(includeParent) === 0;
  }

  // ---------------------------------------------------------------------------
  // GrantsConfig 集成方法
  // ---------------------------------------------------------------------------

  /**
   * 从 GrantsConfig 创建 AuthorizationCollection。
   *
   * @param config GrantsConfig 实例
   * @returns 新的 AuthorizationCollection 实例
   */
  static fromGrantsConfig(config: GrantsConfig): AuthorizationCollection {
    return new AuthorizationCollection(config.grantedPermissions, config.audit?.source ?? 'default');
  }

  /**
   * 转换为 GrantsConfig。
   *
   * @param comment 可选的注释
   * @returns GrantsConfig 对象
   */
  toGrantsConfig(comment?: string): GrantsConfig {
    const result: GrantsConfig = {
      schema_version: '1.0',
      grantedPermissions: this.toArray(false), // 只包含本地权限，不包含继承的
    };

    if (comment) {
      result.comment = comment;
    }

    result.audit = {
      source: this.currentSource,
      grantedAt: new Date().toISOString(),
    };

    return result;
  }

  /**
   * 与另一个 AuthorizationCollection 合并（后者覆盖前者）。
   *
   * @param other 要合并的另一个集合
   * @param source 合并后的来源标识
   * @returns this（支持链式调用）
   */
  merge(other: AuthorizationCollection, source: AuthorizationSource = 'runtime'): this {
    const otherPerms = other.toArray(false); // 只取其他的本地权限

    for (const p of otherPerms) {
      const entry = other.permissions.get(p);
      this.add(p, entry?.source ?? source);
    }

    this.recordChange({
      type: 'merge',
      timestamp: Date.now(),
      source,
    });

    return this;
  }

  // ---------------------------------------------------------------------------
  // 变更历史方法
  // ---------------------------------------------------------------------------

  /**
   * 获取变更历史记录。
   *
   * @returns 变更事件数组（按时间顺序，最新的在最后）
   */
  getChangeHistory(): readonly AuthorizationChangeEvent[] {
    return [...this.changeHistory];
  }

  /**
   * 清空变更历史记录。
   *
   * @returns this（支持链式调用）
   */
  clearChangeHistory(): this {
    this.changeHistory = [];
    return this;
  }

  // ---------------------------------------------------------------------------
  // 内部工具方法
  // ---------------------------------------------------------------------------

  /**
   * 校验权限是否合法。
   */
  private isValidPermission(permission: unknown): permission is PluginPermission {
    return typeof permission === 'string' && VALID_PERMISSIONS.has(permission as PluginPermission);
  }

  /**
   * 记录变更事件。
   */
  private recordChange(event: AuthorizationChangeEvent): void {
    this.changeHistory.push(event);
  }

  // ---------------------------------------------------------------------------
  // 调试方法
  // ---------------------------------------------------------------------------

  /**
   * 创建集合的深拷贝。
   *
   * @returns 新的 AuthorizationCollection 实例
   */
  clone(): AuthorizationCollection {
    const cloned = new AuthorizationCollection([], this.currentSource);
    cloned.permissions = new Map();
    for (const [perm, entry] of this.permissions) {
      cloned.permissions.set(perm, { ...entry });
    }
    cloned.changeHistory = [...this.changeHistory];
    if (this.parent) {
      cloned.parent = this.parent.clone();
    }
    return cloned;
  }

  /**
   * 获取集合的调试表示。
   *
   * @returns 调试字符串
   */
  toString(): string {
    const perms = this.toArray();
    return `AuthorizationCollection(${perms.join(', ') || '(empty)'})`;
  }
}

// ---------------------------------------------------------------------------
// 导出（已在上方使用 inline 方式导出）
// ---------------------------------------------------------------------------
// 注意：类已在定义时导出
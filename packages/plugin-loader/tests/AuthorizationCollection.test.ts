/**
 * AuthorizationCollection 单元测试
 *
 * 任务 3.1.1：实现授权集合管理 - 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AuthorizationCollection,
  ALL_KNOWN_PERMISSIONS,
} from '../src/auth/AuthorizationCollection';
import type { PluginPermission } from '../src/manifest';

describe('AuthorizationCollection', () => {
  let auth: AuthorizationCollection;

  beforeEach(() => {
    auth = new AuthorizationCollection();
  });

  // ---------------------------------------------------------------------------
  // 构造函数测试
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('应该创建空授权集合', () => {
      expect(auth.isEmpty()).toBe(true);
      expect(auth.size()).toBe(0);
    });

    it('应该使用初始权限创建集合', () => {
      const authWithPerms = new AuthorizationCollection(
        ['filesystem.read', 'network'] as PluginPermission[],
        'user',
      );
      expect(authWithPerms.size()).toBe(2);
      expect(authWithPerms.has('filesystem.read')).toBe(true);
      expect(authWithPerms.has('network')).toBe(true);
    });

    it('应该忽略无效权限', () => {
      const authWithInvalid = new AuthorizationCollection(
        ['filesystem.read', 'invalid.permission'] as PluginPermission[],
        'user',
      );
      expect(authWithInvalid.size()).toBe(1);
      expect(authWithInvalid.has('filesystem.read')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // has 方法测试
  // ---------------------------------------------------------------------------

  describe('has', () => {
    beforeEach(() => {
      auth.add('filesystem.read', 'user');
    });

    it('应该返回 true 表示有权限', () => {
      expect(auth.has('filesystem.read')).toBe(true);
    });

    it('应该返回 false 表示无权限', () => {
      expect(auth.has('network')).toBe(false);
    });

    it('应该支持 checkParent=false 只检查本地', () => {
      const child = new AuthorizationCollection();
      child.setParent(auth);
      child.inheritFromParent();

      expect(child.has('filesystem.read', false)).toBe(false);
      expect(child.has('filesystem.read', true)).toBe(true);
    });
  });

  describe('hasAll', () => {
    beforeEach(() => {
      auth.addMany(['filesystem.read', 'network', 'env.read'] as PluginPermission[], 'user');
    });

    it('应该返回 true 当拥有所有权限', () => {
      expect(
        auth.hasAll(['filesystem.read', 'network'] as PluginPermission[]),
      ).toBe(true);
    });

    it('应该返回 false 当缺少任一权限', () => {
      expect(
        auth.hasAll(['filesystem.read', 'child_process'] as PluginPermission[]),
      ).toBe(false);
    });

    it('应该返回 true 当权限数组为空', () => {
      expect(auth.hasAll([])).toBe(true);
    });
  });

  describe('hasAny', () => {
    beforeEach(() => {
      auth.add('filesystem.read', 'user');
    });

    it('应该返回 true 当拥有任一权限', () => {
      expect(
        auth.hasAny(['filesystem.read', 'network'] as PluginPermission[]),
      ).toBe(true);
    });

    it('应该返回 false 当没有任何权限', () => {
      expect(
        auth.hasAny(['network', 'child_process'] as PluginPermission[]),
      ).toBe(false);
    });

    it('应该返回 false 当权限数组为空', () => {
      expect(auth.hasAny([])).toBe(false);
    });
  });

  describe('getMissingPermissions', () => {
    beforeEach(() => {
      auth.addMany(['filesystem.read', 'network'] as PluginPermission[], 'user');
    });

    it('应该返回空数组当全部满足', () => {
      expect(
        auth.getMissingPermissions(['filesystem.read'] as PluginPermission[]),
      ).toEqual([]);
    });

    it('应该返回缺少的权限列表', () => {
      expect(
        auth.getMissingPermissions(
          ['filesystem.read', 'child_process', 'env.read'] as PluginPermission[],
        ),
      ).toEqual(['child_process', 'env.read']);
    });
  });

  // ---------------------------------------------------------------------------
  // add 方法测试
  // ---------------------------------------------------------------------------

  describe('add', () => {
    it('应该添加权限到集合', () => {
      auth.add('filesystem.read', 'user');
      expect(auth.has('filesystem.read')).toBe(true);
    });

    it('应该支持链式调用', () => {
      const result = auth.add('filesystem.read', 'user').add('network', 'user');
      expect(result).toBe(auth);
      expect(auth.size()).toBe(2);
    });

    it('应该忽略无效权限', () => {
      auth.add('invalid.permission' as PluginPermission, 'user');
      expect(auth.isEmpty()).toBe(true);
    });

    it('重复添加同一权限应该无操作', () => {
      auth.add('filesystem.read', 'user');
      auth.add('filesystem.read', 'user');
      expect(auth.size()).toBe(1);
    });
  });

  describe('addMany', () => {
    it('应该批量添加权限', () => {
      auth.addMany(['filesystem.read', 'network', 'env.read'] as PluginPermission[], 'user');
      expect(auth.size()).toBe(3);
    });

    it('应该支持链式调用', () => {
      const result = auth
        .addMany(['filesystem.read'] as PluginPermission[], 'user')
        .addMany(['network'] as PluginPermission[], 'user');
      expect(result).toBe(auth);
      expect(auth.size()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // remove 方法测试
  // ---------------------------------------------------------------------------

  describe('remove', () => {
    beforeEach(() => {
      auth.add('filesystem.read', 'user');
      auth.add('network', 'user');
    });

    it('应该移除指定权限', () => {
      auth.remove('filesystem.read', 'user');
      expect(auth.has('filesystem.read')).toBe(false);
      expect(auth.has('network')).toBe(true);
    });

    it('应该支持链式调用', () => {
      const result = auth.remove('filesystem.read', 'user').remove('network', 'user');
      expect(result).toBe(auth);
      expect(auth.isEmpty()).toBe(true);
    });

    it('移除不存在的权限应该无操作', () => {
      auth.remove('child_process', 'user');
      expect(auth.size()).toBe(2);
    });

    it('当指定来源且不匹配时应无操作', () => {
      auth.remove('filesystem.read', 'runtime');
      expect(auth.has('filesystem.read')).toBe(true);
    });
  });

  describe('removeMany', () => {
    beforeEach(() => {
      auth.addMany(
        ['filesystem.read', 'network', 'env.read'] as PluginPermission[],
        'user',
      );
    });

    it('应该批量移除权限', () => {
      auth.removeMany(['filesystem.read', 'network'] as PluginPermission[], 'user');
      expect(auth.size()).toBe(1);
      expect(auth.has('env.read')).toBe(true);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      auth.addMany(['filesystem.read', 'network'] as PluginPermission[], 'user');
    });

    it('应该清空所有非继承权限', () => {
      auth.clear();
      expect(auth.isEmpty()).toBe(true);
    });

    it('应该保留继承的权限', () => {
      const parent = new AuthorizationCollection(
        ['filesystem.read'] as PluginPermission[],
        'default',
      );
      const child = new AuthorizationCollection([], 'user');
      child.setParent(parent);
      child.inheritFromParent();

      child.clear();

      // 继承的权限应该保留（因为它们属于父级）
      expect(child.has('filesystem.read')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 继承测试
  // ---------------------------------------------------------------------------

  describe('inheritance', () => {
    let parent: AuthorizationCollection;

    beforeEach(() => {
      parent = new AuthorizationCollection(
        ['filesystem.read', 'network'] as PluginPermission[],
        'default',
      );
      auth.setParent(parent);
    });

    it('设置父级后应该可以继承权限', () => {
      auth.inheritFromParent();
      expect(auth.has('filesystem.read')).toBe(true);
      expect(auth.has('network')).toBe(true);
    });

    it('继承的权限应该标记为 inherited', () => {
      auth.inheritFromParent();
      const entries = auth.getEntries();
      const fsEntry = entries.find((e) => e.permission === 'filesystem.read');
      expect(fsEntry?.inherited).toBe(true);
    });

    it('本地权限应该覆盖父级权限', () => {
      auth.add('filesystem.read', 'user');
      auth.inheritFromParent();
      // 本地已有，不会被覆盖
      expect(auth.has('filesystem.read')).toBe(true);
    });

    it('移除继承的权限应该标记为 overridden', () => {
      auth.inheritFromParent();
      auth.remove('filesystem.read');

      // 现在应该从父级也获取不到（被覆盖了）
      expect(auth.has('filesystem.read', false)).toBe(false);
      expect(auth.has('filesystem.read', true)).toBe(false);
    });

    it('restoreInherited 应该恢复所有被覆盖的继承权限', () => {
      auth.inheritFromParent();
      auth.remove('filesystem.read');
      auth.restoreInherited();

      expect(auth.has('filesystem.read')).toBe(true);
    });

    it('setParent(null 应该清除父级关联', () => {
      auth.inheritFromParent();
      auth.setParent(null);

      expect(auth.has('filesystem.read')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 覆盖测试
  // ---------------------------------------------------------------------------

  describe('override', () => {
    let parent: AuthorizationCollection;

    beforeEach(() => {
      parent = new AuthorizationCollection(
        ['filesystem.read', 'network'] as PluginPermission[],
        'default',
      );
      auth.setParent(parent);
      auth.inheritFromParent();
    });

    it('覆盖权限应该使其失效', () => {
      auth.override('filesystem.read');
      expect(auth.has('filesystem.read')).toBe(false);
    });

    it('批量覆盖应该全部失效', () => {
      auth.overrideMany(['filesystem.read', 'network'] as PluginPermission[]);
      expect(auth.has('filesystem.read')).toBe(false);
      expect(auth.has('network')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 集合操作测试
  // ---------------------------------------------------------------------------

  describe('toArray', () => {
    it('应该返回权限数组', () => {
      auth.addMany(['filesystem.read', 'network'] as PluginPermission[], 'user');
      const arr = auth.toArray(false);
      expect(arr).toContain('filesystem.read');
      expect(arr).toContain('network');
    });

    it('应该支持 includeParent=false', () => {
      const parent = new AuthorizationCollection(
        ['filesystem.read'] as PluginPermission[],
        'default',
      );
      auth.setParent(parent);
      auth.inheritFromParent();

      const arrWithParent = auth.toArray(true);
      const arrWithoutParent = auth.toArray(false);

      expect(arrWithParent).toContain('filesystem.read');
      expect(arrWithoutParent).not.toContain('filesystem.read');
    });
  });

  describe('toSet', () => {
    it('应该返回权限 Set', () => {
      auth.add('filesystem.read', 'user');
      const set = auth.toSet(false);
      expect(set.has('filesystem.read')).toBe(true);
    });
  });

  describe('size', () => {
    it('应该返回集合大小', () => {
      expect(auth.size()).toBe(0);
      auth.add('filesystem.read', 'user');
      expect(auth.size()).toBe(1);
    });

    it('应该支持 includeParent', () => {
      const parent = new AuthorizationCollection(
        ['filesystem.read'] as PluginPermission[],
        'default',
      );
      auth.setParent(parent);
      auth.inheritFromParent();

      expect(auth.size(false)).toBe(0);
      expect(auth.size(true)).toBe(1);
    });
  });

  describe('isEmpty', () => {
    it('空集合应该返回 true', () => {
      expect(auth.isEmpty()).toBe(true);
    });

    it('非空集合应该返回 false', () => {
      auth.add('filesystem.read', 'user');
      expect(auth.isEmpty()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GrantsConfig 集成测试
  // ---------------------------------------------------------------------------

  describe('GrantsConfig integration', () => {
    it('fromGrantsConfig 应该正确创建集合', () => {
      const config = {
        schema_version: '1.0' as const,
        grantedPermissions: ['filesystem.read', 'network'] as PluginPermission[],
        audit: { source: 'user' as const },
      };

      const fromConfig = AuthorizationCollection.fromGrantsConfig(config);
      expect(fromConfig.size()).toBe(2);
      expect(fromConfig.has('filesystem.read')).toBe(true);
    });

    it('toGrantsConfig 应该正确转换', () => {
      auth.addMany(['filesystem.read', 'network'] as PluginPermission[], 'user');
      const config = auth.toGrantsConfig('测试授权');

      expect(config.schema_version).toBe('1.0');
      expect(config.grantedPermissions).toContain('filesystem.read');
      expect(config.grantedPermissions).toContain('network');
      expect(config.comment).toBe('测试授权');
    });

    it('merge 应该合并两个集合', () => {
      auth.add('filesystem.read', 'user');
      const other = new AuthorizationCollection(['network'] as PluginPermission[], 'runtime');
      auth.merge(other, 'runtime');

      expect(auth.has('filesystem.read')).toBe(true);
      expect(auth.has('network')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 变更历史测试
  // ---------------------------------------------------------------------------

  describe('change history', () => {
    it('应该记录添加变更', () => {
      auth.add('filesystem.read', 'user');
      const history = auth.getChangeHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1]?.type).toBe('add');
      expect(history[history.length - 1]?.permission).toBe('filesystem.read');
    });

    it('应该记录移除变更', () => {
      auth.add('filesystem.read', 'user');
      auth.remove('filesystem.read', 'user');
      const history = auth.getChangeHistory();

      expect(history.some((h) => h.type === 'remove')).toBe(true);
    });

    it('clearChangeHistory 应该清空历史', () => {
      auth.add('filesystem.read', 'user');
      auth.clearChangeHistory();

      expect(auth.getChangeHistory().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 调试方法测试
  // ---------------------------------------------------------------------------

  describe('debug methods', () => {
    it('clone 应该创建深拷贝', () => {
      auth.add('filesystem.read', 'user');
      const cloned = auth.clone();

      cloned.add('network', 'user');

      expect(auth.size()).toBe(1);
      expect(cloned.size()).toBe(2);
    });

    it('toString 应该返回调试字符串', () => {
      auth.add('filesystem.read', 'user');
      expect(auth.toString()).toContain('AuthorizationCollection');
      expect(auth.toString()).toContain('filesystem.read');
    });
  });

  // ---------------------------------------------------------------------------
  // 常量测试
  // ---------------------------------------------------------------------------

  describe('ALL_KNOWN_PERMISSIONS', () => {
    it('应该包含所有已知权限', () => {
      expect(ALL_KNOWN_PERMISSIONS).toContain('filesystem.read');
      expect(ALL_KNOWN_PERMISSIONS).toContain('filesystem.write');
      expect(ALL_KNOWN_PERMISSIONS).toContain('network');
      expect(ALL_KNOWN_PERMISSIONS).toContain('child_process');
      expect(ALL_KNOWN_PERMISSIONS).toContain('env.read');
    });

    it('应该只有 5 个权限', () => {
      expect(ALL_KNOWN_PERMISSIONS.length).toBe(5);
    });
  });
});
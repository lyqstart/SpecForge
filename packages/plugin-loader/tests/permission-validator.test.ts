/**
 * PermissionValidator 单元测试（任务 1.4 测试交付物）
 *
 * 测试覆盖：
 *   1. validatePermissions 方法的各种场景
 *   2. checkPermission 方法的各种场景
 *   3. 边界情况与错误处理
 *   4. 验证错误信息的清晰度
 *
 * 测试策略：
 *   - 正常场景：所有权限都被授予
 *   - 缺失权限：部分或全部权限未被授予
 *   - 边界情况：空数组、重复值、未知权限等
 *   - 错误信息：验证错误包含足够的上下文信息
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionValidator, permissionValidator } from '../src/permission-validator';

describe('PermissionValidator', () => {
  let validator: PermissionValidator;

  beforeEach(() => {
    validator = new PermissionValidator();
  });

  // =========================================================================
  // validatePermissions 测试
  // =========================================================================

  describe('validatePermissions', () => {
    describe('正常场景：所有权限都被授予', () => {
      it('应该在所有权限都被授予时返回空数组', () => {
        const requires = ['filesystem.read', 'network'];
        const grants = ['filesystem.read', 'network'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该在授予的权限超过声明的权限时返回空数组', () => {
        const requires = ['filesystem.read'];
        const grants = ['filesystem.read', 'network', 'child_process'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该在声明的权限为空时返回空数组', () => {
        const requires: string[] = [];
        const grants = ['filesystem.read', 'network'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });
    });

    describe('缺失权限场景：部分或全部权限未被授予', () => {
      it('应该在部分权限未被授予时返回相应的错误', () => {
        const requires = ['filesystem.read', 'network', 'child_process'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(2);
        expect(errors[0]).toMatchObject({
          permission: 'network',
          reason: expect.stringContaining('未被授予'),
        });
        expect(errors[1]).toMatchObject({
          permission: 'child_process',
          reason: expect.stringContaining('未被授予'),
        });
      });

      it('应该在所有权限都未被授予时返回所有权限的错误', () => {
        const requires = ['filesystem.read', 'network'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(2);
        expect(errors.map((e) => e.permission)).toEqual(['filesystem.read', 'network']);
      });

      it('应该在授予集合为空时返回所有权限的错误', () => {
        const requires = ['filesystem.write', 'env.read'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(2);
        expect(errors.map((e) => e.permission)).toEqual(['filesystem.write', 'env.read']);
      });
    });

    describe('边界情况：重复值、未知权限等', () => {
      it('应该为重复的权限声明生成多条错误', () => {
        const requires = ['network', 'network', 'filesystem.read'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(3);
        expect(errors[0].permission).toBe('network');
        expect(errors[1].permission).toBe('network');
        expect(errors[2].permission).toBe('filesystem.read');
      });

      it('应该为未知权限生成错误', () => {
        const requires = ['filesystem.read', 'unknown.permission'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('unknown.permission');
      });

      it('应该忽略授予集合中的未知权限', () => {
        const requires = ['filesystem.read'];
        const grants = ['filesystem.read', 'unknown.permission'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该处理空字符串权限', () => {
        const requires = ['', 'filesystem.read'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('');
      });
    });

    describe('错误信息质量', () => {
      it('应该在错误中包含权限名称', () => {
        const requires = ['network'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors[0].permission).toBe('network');
      });

      it('应该在错误中包含清晰的拒绝原因', () => {
        const requires = ['child_process'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors[0].reason).toContain('未被授予');
      });

      it('应该在错误中包含行动建议', () => {
        const requires = ['env.read'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors[0].suggestion).toBeDefined();
        expect(errors[0].suggestion).toContain('授权配置');
      });

      it('应该在错误信息中包含权限名称以便用户理解', () => {
        const requires = ['filesystem.write'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors[0].reason).toContain('filesystem.write');
      });
    });

    describe('标准权限类型', () => {
      it('应该正确处理 filesystem.read 权限', () => {
        const requires = ['filesystem.read'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该正确处理 filesystem.write 权限', () => {
        const requires = ['filesystem.write'];
        const grants = ['filesystem.write'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该正确处理 network 权限', () => {
        const requires = ['network'];
        const grants = ['network'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该正确处理 child_process 权限', () => {
        const requires = ['child_process'];
        const grants = ['child_process'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该正确处理 env.read 权限', () => {
        const requires = ['env.read'];
        const grants = ['env.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });

      it('应该正确处理多个标准权限的组合', () => {
        const requires = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];
        const grants = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];

        const errors = validator.validatePermissions(requires, grants);

        expect(errors).toEqual([]);
      });
    });
  });

  // =========================================================================
  // checkPermission 测试
  // =========================================================================

  describe('checkPermission', () => {
    describe('正常场景：权限被授予', () => {
      it('应该在权限被授予时返回 true', () => {
        const result = validator.checkPermission('filesystem.read', ['filesystem.read']);

        expect(result).toBe(true);
      });

      it('应该在权限在授予集合中时返回 true', () => {
        const result = validator.checkPermission('network', ['filesystem.read', 'network', 'child_process']);

        expect(result).toBe(true);
      });

      it('应该在授予集合包含多个权限时正确识别目标权限', () => {
        const grants = ['filesystem.read', 'filesystem.write', 'network'];

        expect(validator.checkPermission('filesystem.read', grants)).toBe(true);
        expect(validator.checkPermission('filesystem.write', grants)).toBe(true);
        expect(validator.checkPermission('network', grants)).toBe(true);
      });
    });

    describe('权限未被授予的场景', () => {
      it('应该在权限未被授予时返回 false', () => {
        const result = validator.checkPermission('network', ['filesystem.read']);

        expect(result).toBe(false);
      });

      it('应该在授予集合为空时返回 false', () => {
        const result = validator.checkPermission('filesystem.read', []);

        expect(result).toBe(false);
      });

      it('应该在权限不在授予集合中时返回 false', () => {
        const grants = ['filesystem.read', 'network'];

        expect(validator.checkPermission('child_process', grants)).toBe(false);
        expect(validator.checkPermission('env.read', grants)).toBe(false);
      });
    });

    describe('边界情况', () => {
      it('应该在权限为空字符串时返回 false', () => {
        const result = validator.checkPermission('', ['filesystem.read']);

        expect(result).toBe(false);
      });

      it('应该在权限为空字符串且授予集合为空时返回 false', () => {
        const result = validator.checkPermission('', []);

        expect(result).toBe(false);
      });

      it('应该在权限为空字符串但授予集合包含空字符串时返回 false', () => {
        // 空字符串权限应该被拒绝，即使授予集合中有空字符串
        const result = validator.checkPermission('', ['']);

        expect(result).toBe(false);
      });

      it('应该在权限为未知值时返回 false', () => {
        const result = validator.checkPermission('unknown.permission', ['filesystem.read', 'network']);

        expect(result).toBe(false);
      });

      it('应该在授予集合包含未知权限时正确处理', () => {
        const result = validator.checkPermission('filesystem.read', ['filesystem.read', 'unknown.permission']);

        expect(result).toBe(true);
      });

      it('应该处理权限名称中的特殊字符', () => {
        const result = validator.checkPermission('permission-with-dash', ['permission-with-dash']);

        expect(result).toBe(true);
      });

      it('应该处理权限名称中的下划线', () => {
        const result = validator.checkPermission('permission_with_underscore', ['permission_with_underscore']);

        expect(result).toBe(true);
      });
    });

    describe('标准权限类型', () => {
      it('应该正确检查 filesystem.read 权限', () => {
        expect(validator.checkPermission('filesystem.read', ['filesystem.read'])).toBe(true);
        expect(validator.checkPermission('filesystem.read', [])).toBe(false);
      });

      it('应该正确检查 filesystem.write 权限', () => {
        expect(validator.checkPermission('filesystem.write', ['filesystem.write'])).toBe(true);
        expect(validator.checkPermission('filesystem.write', [])).toBe(false);
      });

      it('应该正确检查 network 权限', () => {
        expect(validator.checkPermission('network', ['network'])).toBe(true);
        expect(validator.checkPermission('network', [])).toBe(false);
      });

      it('应该正确检查 child_process 权限', () => {
        expect(validator.checkPermission('child_process', ['child_process'])).toBe(true);
        expect(validator.checkPermission('child_process', [])).toBe(false);
      });

      it('应该正确检查 env.read 权限', () => {
        expect(validator.checkPermission('env.read', ['env.read'])).toBe(true);
        expect(validator.checkPermission('env.read', [])).toBe(false);
      });
    });

    describe('大小写敏感性', () => {
      it('应该区分大小写', () => {
        expect(validator.checkPermission('Filesystem.Read', ['filesystem.read'])).toBe(false);
        expect(validator.checkPermission('filesystem.read', ['Filesystem.Read'])).toBe(false);
      });

      it('应该在完全匹配时返回 true', () => {
        expect(validator.checkPermission('filesystem.read', ['filesystem.read'])).toBe(true);
      });
    });
  });

  // =========================================================================
  // 单例实例测试
  // =========================================================================

  describe('permissionValidator 单例', () => {
    it('应该导出一个 PermissionValidator 实例', () => {
      expect(permissionValidator).toBeInstanceOf(PermissionValidator);
    });

    it('单例应该能正常调用 validatePermissions', () => {
      const errors = permissionValidator.validatePermissions(['network'], ['network']);

      expect(errors).toEqual([]);
    });

    it('单例应该能正常调用 checkPermission', () => {
      const result = permissionValidator.checkPermission('filesystem.read', ['filesystem.read']);

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // 集成场景测试
  // =========================================================================

  describe('集成场景', () => {
    it('应该支持完整的权限验证流程', () => {
      const pluginRequires = ['filesystem.read', 'network'];
      const systemGrants = ['filesystem.read', 'network', 'env.read'];

      const errors = validator.validatePermissions(pluginRequires, systemGrants);

      expect(errors).toEqual([]);
    });

    it('应该支持权限拒绝场景', () => {
      const pluginRequires = ['filesystem.read', 'child_process'];
      const systemGrants = ['filesystem.read'];

      const errors = validator.validatePermissions(pluginRequires, systemGrants);

      expect(errors).toHaveLength(1);
      expect(errors[0].permission).toBe('child_process');
    });

    it('应该支持逐个权限检查', () => {
      const grants = ['filesystem.read', 'network'];

      const canReadFS = validator.checkPermission('filesystem.read', grants);
      const canNetwork = validator.checkPermission('network', grants);
      const canExecChild = validator.checkPermission('child_process', grants);

      expect(canReadFS).toBe(true);
      expect(canNetwork).toBe(true);
      expect(canExecChild).toBe(false);
    });

    it('应该支持权限升级场景', () => {
      const pluginRequires = ['filesystem.read'];
      let systemGrants = ['filesystem.read'];

      let errors = validator.validatePermissions(pluginRequires, systemGrants);
      expect(errors).toEqual([]);

      // 升级权限
      systemGrants = ['filesystem.read', 'network'];
      errors = validator.validatePermissions(pluginRequires, systemGrants);
      expect(errors).toEqual([]);
    });

    it('应该支持权限降级场景', () => {
      const pluginRequires = ['filesystem.read', 'network'];
      let systemGrants = ['filesystem.read', 'network'];

      let errors = validator.validatePermissions(pluginRequires, systemGrants);
      expect(errors).toEqual([]);

      // 降级权限
      systemGrants = ['filesystem.read'];
      errors = validator.validatePermissions(pluginRequires, systemGrants);
      expect(errors).toHaveLength(1);
      expect(errors[0].permission).toBe('network');
    });
  });
});

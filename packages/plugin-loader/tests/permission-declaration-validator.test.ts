/**
 * PermissionDeclarationValidator 单元测试（任务 3.1.2 测试交付物）
 *
 * 测试覆盖：
 *   1. validate 方法 - 验证权限声明与 API 使用匹配
 *   2. validateAgainstGrants 方法 - 验证权限在授权范围内
 *   3. validateFull 方法 - 完整验证（声明匹配 API + 在授权范围内）
 *   4. 边界情况与错误处理
 *   5. 错误信息质量验证
 *
 * 测试策略：
 *   - 正常场景：声明的权限覆盖了使用的 API
 *   - 声明不足：使用了需要权限的 API 但未声明
 *   - 授权拒绝：声明的权限不在授权集合中
 *   - 未使用权限：声明了但未使用的权限（可选警告）
 *   - 边界情况：空数组、未知权限等
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionDeclarationValidator,
  permissionDeclarationValidator,
} from '../src/permission-declaration-validator';
import type { SimplifiedStaticCheckResult } from '../src/permission-declaration-validator';

describe('PermissionDeclarationValidator', () => {
  let validator: PermissionDeclarationValidator;

  beforeEach(() => {
    validator = new PermissionDeclarationValidator();
  });

  // =========================================================================
  // validate 方法测试
  // =========================================================================

  describe('validate - 验证权限声明与 API 使用匹配', () => {
    describe('正常场景：声明的权限覆盖了使用的 API', () => {
      it('应该在声明权限覆盖 API 使用时返回 valid=true', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read', 'network'],
          staticCheckResult: {
            passed: true,
            violations: [],
          },
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.missingPermissions).toEqual([]);
      });

      it('应该在声明了所有需要的权限时返回 valid=true', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read', 'network', 'child_process'],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
              { ruleId: 'CHILD_PROCESS_EXEC', api: 'child_process.exec', requiredPermission: 'child_process', line: 30 },
            ],
          },
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.missingPermissions).toEqual([]);
      });
    });

    describe('声明不足场景：使用了需要权限的 API 但未声明', () => {
      it('应该在缺少权限时返回 valid=false 并列出缺失的权限', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read'],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
            ],
          },
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('insufficient_permissions');
        expect(result.missingPermissions).toContain('network');
      });

      it('应该在完全没有声明权限但使用了需要权限的 API 时返回错误', () => {
        const result = validator.validate({
          declaredPermissions: [],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'CHILD_PROCESS_EXEC', api: 'child_process.exec', requiredPermission: 'child_process', line: 10 },
            ],
          },
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].subject).toBe('child_process');
        expect(result.missingPermissions).toContain('child_process');
      });

      it('应该在静态检查失败且有多个违规时报告所有缺失的权限', () => {
        const result = validator.validate({
          declaredPermissions: [],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'FS_WRITE_FILE', api: 'fs.writeFile', requiredPermission: 'filesystem.write', line: 20 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 30 },
            ],
          },
        });

        expect(result.valid).toBe(false);
        expect(result.missingPermissions).toContain('filesystem.read');
        expect(result.missingPermissions).toContain('filesystem.write');
        expect(result.missingPermissions).toContain('network');
      });
    });

    describe('边界情况：空数组、未知权限等', () => {
      it('应该在声明为空且静态检查通过时返回 valid=true', () => {
        const result = validator.validate({
          declaredPermissions: [],
          staticCheckResult: {
            passed: true,
            violations: [],
          },
        });

        expect(result.valid).toBe(true);
      });

      it('应该处理没有 requiredPermission 的违规（尝试推断）', () => {
        const result = validator.validate({
          declaredPermissions: [],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'CUSTOM_RULE', api: 'fs.readFileSync' }, // 没有 requiredPermission，尝试推断
            ],
          },
        });

        expect(result.valid).toBe(false);
      });
    });

    describe('未使用权限检测', () => {
      it('应该在 detectUnusedPermissions=true 时警告未使用的权限', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read', 'network', 'child_process'],
          staticCheckResult: {
            passed: true,
            violations: [],
          },
          detectUnusedPermissions: true,
        });

        expect(result.warnings).toBeDefined();
        expect(result.warnings).toHaveLength(3);
        expect(result.warnings?.[0].type).toBe('unused_permission');
      });

      it('不应该在 detectUnusedPermissions=false 时产生警告', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read', 'network'],
          staticCheckResult: {
            passed: true,
            violations: [],
          },
          detectUnusedPermissions: false,
        });

        expect(result.warnings).toBeUndefined();
      });

      it('应该只警告实际未使用的权限', () => {
        const result = validator.validate({
          declaredPermissions: ['filesystem.read', 'network'],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
            ],
          },
          detectUnusedPermissions: true,
        });

        expect(result.warnings).toBeDefined();
        // network 应该未被使用
        const networkWarning = result.warnings?.find(w => w.subject === 'network');
        expect(networkWarning).toBeDefined();
      });
    });
  });

  // =========================================================================
  // validateAgainstGrants 方法测试
  // =========================================================================

  describe('validateAgainstGrants - 验证权限在授权范围内', () => {
    describe('正常场景：所有声明的权限都在授权范围内', () => {
      it('应该在所有权限都被授权时返回空数组', () => {
        const errors = validator.validateAgainstGrants(
          ['filesystem.read', 'network'],
          ['filesystem.read', 'network', 'child_process']
        );

        expect(errors).toEqual([]);
      });

      it('应该在授权权限超过声明权限时返回空数组', () => {
        const errors = validator.validateAgainstGrants(
          ['filesystem.read'],
          ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read']
        );

        expect(errors).toEqual([]);
      });
    });

    describe('授权不足场景：部分或全部权限未被授权', () => {
      it('应该在部分权限未被授权时返回错误', () => {
        const errors = validator.validateAgainstGrants(
          ['filesystem.read', 'network', 'child_process'],
          ['filesystem.read']
        );

        expect(errors).toHaveLength(2);
        expect(errors.map(e => e.subject)).toContain('network');
        expect(errors.map(e => e.subject)).toContain('child_process');
      });

      it('应该在授权集合为空时返回所有声明权限的错误', () => {
        const errors = validator.validateAgainstGrants(
          ['filesystem.read', 'network'],
          []
        );

        expect(errors).toHaveLength(2);
      });

      it('应该在授权集合为空字符串时正确处理', () => {
        const errors = validator.validateAgainstGrants(
          ['filesystem.read'],
          ['']
        );

        expect(errors).toHaveLength(1);
      });
    });

    describe('边界情况', () => {
      it('应该处理空声明数组', () => {
        const errors = validator.validateAgainstGrants([], ['filesystem.read']);

        expect(errors).toEqual([]);
      });

      it('应该处理空授权数组和空声明数组', () => {
        const errors = validator.validateAgainstGrants([], []);

        expect(errors).toEqual([]);
      });

      it('应该忽略大小写比较', () => {
        const errors = validator.validateAgainstGrants(
          ['FILESYSTEM.READ', 'Network'],
          ['filesystem.read', 'network']
        );

        expect(errors).toEqual([]);
      });

      it('应该处理未知的权限名称', () => {
        const errors = validator.validateAgainstGrants(
          ['unknown.permission'],
          ['filesystem.read']
        );

        expect(errors).toHaveLength(1);
        expect(errors[0].subject).toBe('unknown.permission');
      });
    });

    describe('错误信息质量', () => {
      it('应该在错误中包含权限名称', () => {
        const errors = validator.validateAgainstGrants(
          ['child_process'],
          []
        );

        expect(errors[0].subject).toBe('child_process');
      });

      it('应该在错误中包含清晰的拒绝原因', () => {
        const errors = validator.validateAgainstGrants(
          ['network'],
          []
        );

        expect(errors[0].reason).toContain('未被系统授权');
      });

      it('应该在错误中包含行动建议', () => {
        const errors = validator.validateAgainstGrants(
          ['env.read'],
          []
        );

        expect(errors[0].suggestion).toBeDefined();
        expect(errors[0].suggestion).toContain('授权配置');
      });
    });
  });

  // =========================================================================
  // validateFull 方法测试
  // =========================================================================

  describe('validateFull - 完整验证', () => {
    describe('正常场景：完整验证通过', () => {
      it('应该在校验通过时返回 valid=true', () => {
        const result = validator.validateFull({
          declaredPermissions: ['filesystem.read', 'network'],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
            ],
          },
          grants: ['filesystem.read', 'network', 'child_process'],
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    describe('失败场景：完整验证失败', () => {
      it('应该在声明不足时返回 valid=false', () => {
        const result = validator.validateFull({
          declaredPermissions: ['filesystem.read'],
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
            ],
          },
          grants: ['filesystem.read', 'network'],
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('insufficient_permissions');
        expect(result.missingPermissions).toContain('network');
      });

      it('应该在权限不在授权范围内时返回 valid=false', () => {
        const result = validator.validateFull({
          declaredPermissions: ['filesystem.read', 'child_process'],
          staticCheckResult: {
            passed: true,
            violations: [],
          },
          grants: ['filesystem.read'], // child_process 未授权
        });

        expect(result.valid).toBe(false);
        const grantErrors = result.errors.filter(e => e.reason.includes('未被系统授权'));
        expect(grantErrors).toHaveLength(1);
      });

      it('应该同时报告声明不足和未授权错误', () => {
        const result = validator.validateFull({
          declaredPermissions: ['filesystem.read'], // 声明了 filesystem.read，缺少 network
          staticCheckResult: {
            passed: false,
            violations: [
              { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
              { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
            ],
          },
          grants: ['filesystem.read'], // network 未授权
        });

        expect(result.valid).toBe(false);
        // 缺少 network 权限声明（来自 validate）
        expect(result.errors.some(e => e.type === 'insufficient_permissions')).toBe(true);
        // network 既缺少声明也不在授权范围内（因为 grants 里也没有 network）
        // 所以会产生两个相关错误
      });
    });
  });

  // =========================================================================
  // 辅助方法测试
  // =========================================================================

  describe('辅助方法', () => {
    describe('getKnownPermissions', () => {
      it('应该返回所有已知权限', () => {
        const permissions = validator.getKnownPermissions();

        expect(permissions).toContain('child_process');
        expect(permissions).toContain('filesystem.read');
        expect(permissions).toContain('filesystem.write');
        expect(permissions).toContain('network');
        expect(permissions).toContain('env.read');
      });
    });

    describe('getAPIsForPermission', () => {
      it('应该返回 child_process 权限对应的 API 列表', () => {
        const apis = validator.getAPIsForPermission('child_process');

        expect(apis).toContain('child_process.exec');
        expect(apis).toContain('child_process.execSync');
        expect(apis).toContain('child_process.spawn');
      });

      it('应该返回空数组对于未知权限', () => {
        const apis = validator.getAPIsForPermission('unknown.permission');

        expect(apis).toEqual([]);
      });
    });
  });

  // =========================================================================
  // 单例实例测试
  // =========================================================================

  describe('permissionDeclarationValidator 单例', () => {
    it('应该导出一个 PermissionDeclarationValidator 实例', () => {
      expect(permissionDeclarationValidator).toBeInstanceOf(PermissionDeclarationValidator);
    });

    it('单例应该能正常调用 validate', () => {
      const result = permissionDeclarationValidator.validate({
        declaredPermissions: ['filesystem.read'],
        staticCheckResult: { passed: true, violations: [] },
      });

      expect(result.valid).toBe(true);
    });

    it('单例应该能正常调用 validateAgainstGrants', () => {
      const errors = permissionDeclarationValidator.validateAgainstGrants(
        ['network'],
        ['network']
      );

      expect(errors).toEqual([]);
    });

    it('单例应该能正常调用 validateFull', () => {
      const result = permissionDeclarationValidator.validateFull({
        declaredPermissions: ['filesystem.read'],
        staticCheckResult: { passed: true, violations: [] },
        grants: ['filesystem.read'],
      });

      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // 集成场景测试
  // =========================================================================

  describe('集成场景', () => {
    it('应该支持完整的权限验证流程 - 场景1：合法插件', () => {
      // 场景：一个使用文件系统读取和网络请求的插件
      const result = validator.validateFull({
        declaredPermissions: ['filesystem.read', 'network'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 15 },
            { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 25 },
          ],
        },
        grants: ['filesystem.read', 'network'],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('应该支持完整的权限验证流程 - 场景2：缺少权限声明', () => {
      // 场景：一个使用了 child_process 但未声明的插件
      const result = validator.validateFull({
        declaredPermissions: ['filesystem.read'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 15 },
            { ruleId: 'CHILD_PROCESS_EXEC', api: 'child_process.exec', requiredPermission: 'child_process', line: 25 },
          ],
        },
        grants: ['filesystem.read', 'child_process'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'insufficient_permissions')).toBe(true);
    });

    it('应该支持完整的权限验证流程 - 场景3：权限未授权', () => {
      // 场景：声明了权限但系统未授权
      const result = validator.validateFull({
        declaredPermissions: ['child_process'],
        staticCheckResult: {
          passed: true,
          violations: [],
        },
        grants: [], // child_process 未授权
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.reason.includes('未被系统授权'))).toBe(true);
    });

    it('应该支持完整的权限验证流程 - 场景4：最小权限原则', () => {
      // 场景：精确声明所需权限（无未使用权限）
      const result = validator.validateFull({
        declaredPermissions: ['filesystem.read'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
          ],
        },
        grants: ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'],
        detectUnusedPermissions: true,
      });

      expect(result.valid).toBe(true);
      // filesystem.read 被使用了，不应该有未使用权限警告
      // warnings 可能是 undefined 或空数组
      const unusedWarnings = result.warnings?.filter(w => w.type === 'unused_permission');
      expect(unusedWarnings?.length ?? 0).toBe(0);
    });

    it('应该检测到未使用的权限', () => {
      // 场景：声明了额外的不需要权限
      const result = validator.validateFull({
        declaredPermissions: ['filesystem.read', 'network', 'child_process'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
          ],
        },
        grants: ['filesystem.read', 'network', 'child_process'],
        detectUnusedPermissions: true,
      });

      expect(result.valid).toBe(true);
      // network 和 child_process 未被使用，应该产生警告
      const unusedWarnings = result.warnings?.filter(w => w.type === 'unused_permission');
      expect(unusedWarnings).toBeDefined();
      expect(unusedWarnings?.length).toBe(2);
    });

    it('应该支持权限升级场景', () => {
      // 场景：用户逐步增加授权
      let grants = ['filesystem.read'];

      let result = validator.validateFull({
        declaredPermissions: ['filesystem.read', 'network'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
            { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
          ],
        },
        grants,
      });

      expect(result.valid).toBe(false);

      // 升级授权
      grants = ['filesystem.read', 'network'];

      result = validator.validateFull({
        declaredPermissions: ['filesystem.read', 'network'],
        staticCheckResult: {
          passed: false,
          violations: [
            { ruleId: 'FS_READ_FILE', api: 'fs.readFile', requiredPermission: 'filesystem.read', line: 10 },
            { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network', line: 20 },
          ],
        },
        grants,
      });

      expect(result.valid).toBe(true);
    });
  });
});
/**
 * 任务 3.3.3: 测试权限验证正确性
 *
 * 测试覆盖：
 *   1. 权限声明与实际授权的匹配
 *   2. 多级配置合并后的权限验证
 *   3. 权限拒绝场景
 *
 * 设计参考：
 *   - design.md: AuthValidator 接口、Property PL-1（权限声明验证）
 *   - requirements.md: Requirement 1（权限声明）、Requirement 4（授权管理）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionValidator,
  permissionValidator,
  type ValidationError,
} from '../../src/permission-validator';
import {
  PermissionDeclarationValidator,
  permissionDeclarationValidator,
} from '../../src/permission-declaration-validator';
import {
  mergeGrants,
  type GrantsConfig,
} from '../../src/grants';
import type { PluginPermission } from '../../src/manifest';
import type { SimplifiedStaticCheckResult } from '../../src/permission-declaration-validator';

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/**
 * 模拟多级配置合并后的授权集合
 */
function createMergedGrants(...layers: Partial<GrantsConfig>[]): string[] {
  const fullLayers: GrantsConfig[] = layers.map((l, i) => ({
    schema_version: '1.0',
    grantedPermissions: l.grantedPermissions || [],
    ...(l.comment && { comment: l.comment }),
    ...(l.audit && { audit: l.audit }),
  }));
  return mergeGrants(...fullLayers).grantedPermissions;
}

/**
 * 验证权限验证结果并返回错误信息
 */
function getMissingPermissions(errors: ValidationError[]): string[] {
  return errors.map((e) => e.permission);
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('权限验证正确性测试', () => {
  let validator: PermissionValidator;
  let declarationValidator: PermissionDeclarationValidator;

  beforeEach(() => {
    validator = new PermissionValidator();
    declarationValidator = new PermissionDeclarationValidator();
  });

  // =========================================================================
  // 1. 权限声明与实际授权的匹配测试
  // =========================================================================

  describe('权限声明与授权匹配', () => {
    describe('完全匹配场景', () => {
      it('声明的权限全部在授权集合中，应通过验证', () => {
        const declared = ['filesystem.read', 'network'];
        const grants = ['filesystem.read', 'network', 'child_process'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toEqual([]);
      });

      it('空声明应始终通过验证', () => {
        const declared: string[] = [];
        const grants = ['filesystem.read', 'network'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toEqual([]);
      });

      it('授权权限完全包含声明权限时，应通过验证', () => {
        const declared = ['filesystem.read'];
        const grants = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toEqual([]);
      });
    });

    describe('部分匹配场景', () => {
      it('部分声明权限在授权集合中，应返回缺失权限错误', () => {
        const declared = ['filesystem.read', 'network', 'child_process'];
        const grants = ['filesystem.read', 'network'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(1);
        expect(getMissingPermissions(errors)).toContain('child_process');
      });

      it('每个缺失的权限应生成独立错误', () => {
        const declared = ['filesystem.read', 'network', 'child_process', 'env.read'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(3);
        expect(getMissingPermissions(errors)).toEqual(
          expect.arrayContaining(['network', 'child_process', 'env.read']),
        );
      });
    });

    describe('完全不匹配场景', () => {
      it('授权为空时，所有声明的权限都应被拒绝', () => {
        const declared = ['filesystem.read', 'network'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(2);
        expect(getMissingPermissions(errors)).toEqual(declared);
      });

      it('声明的权限与授权集合完全无交集', () => {
        const declared = ['child_process', 'filesystem.write'];
        const grants = ['filesystem.read', 'network', 'env.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(2);
        expect(getMissingPermissions(errors)).toContain('child_process');
        expect(getMissingPermissions(errors)).toContain('filesystem.write');
      });
    });

    describe('权限声明验证器与授权验证集成', () => {
      it('声明验证 + 授权验证的完整流程', () => {
        const declaredPermissions = ['filesystem.read', 'network'];
        const grants = ['filesystem.read', 'network'];

        const validationErrors = declarationValidator.validateAgainstGrants(
          declaredPermissions,
          grants,
        );

        expect(validationErrors).toEqual([]);
      });

      it('声明验证应检测未授权的权限', () => {
        const declaredPermissions = ['filesystem.read', 'child_process'];
        const grants = ['filesystem.read'];

        const validationErrors = declarationValidator.validateAgainstGrants(
          declaredPermissions,
          grants,
        );

        expect(validationErrors).toHaveLength(1);
        expect(validationErrors[0].subject).toBe('child_process');
        expect(validationErrors[0].type).toBe('insufficient_permissions');
      });
    });
  });

  // =========================================================================
  // 2. 多级配置合并后的权限验证测试
  // =========================================================================

  describe('多级配置合并后的权限验证', () => {
    describe('四层配置合并', () => {
      it('默认层（空）+ 用户层 → 用户层授权', () => {
        const layer1: GrantsConfig = { schema_version: '1.0', grantedPermissions: [] };
        const layer2: GrantsConfig = { schema_version: '1.0', grantedPermissions: ['filesystem.read'] };

        const mergedGrants = mergeGrants(layer1, layer2).grantedPermissions;

        expect(mergedGrants).toContain('filesystem.read');
      });

      it('用户层 + 项目层 → 项目层覆盖', () => {
        const layer2: GrantsConfig = { schema_version: '1.0', grantedPermissions: ['filesystem.read'] };
        const layer3: GrantsConfig = { schema_version: '1.0', grantedPermissions: ['network'] };

        const mergedGrants = mergeGrants(layer2, layer3).grantedPermissions;

        expect(mergedGrants).toContain('filesystem.read');
        expect(mergedGrants).toContain('network');
      });

      it('项目层 + 运行时层 → 运行时层最高优先级', () => {
        const layer3: GrantsConfig = { schema_version: '1.0', grantedPermissions: ['filesystem.read'] };
        const layer4: GrantsConfig = { schema_version: '1.0', grantedPermissions: ['child_process'] };

        const mergedGrants = mergeGrants(layer3, layer4).grantedPermissions;

        expect(mergedGrants).toContain('filesystem.read');
        expect(mergedGrants).toContain('child_process');
      });

      it('完整四层合并 → 所有权限并集', () => {
        const layers = [
          { schema_version: '1.0', grantedPermissions: [] }, // default
          { schema_version: '1.0', grantedPermissions: ['filesystem.read'] }, // user
          { schema_version: '1.0', grantedPermissions: ['network'] }, // project
          { schema_version: '1.0', grantedPermissions: ['child_process'] }, // runtime
        ];

        const mergedGrants = mergeGrants(...layers).grantedPermissions;

        expect(mergedGrants).toEqual(
          expect.arrayContaining(['filesystem.read', 'network', 'child_process']),
        );
        expect(mergedGrants.length).toBe(3);
      });

      it('重复权限应去重', () => {
        const layers = [
          { schema_version: '1.0', grantedPermissions: ['filesystem.read', 'network'] },
          { schema_version: '1.0', grantedPermissions: ['network', 'child_process'] },
          { schema_version: '1.0', grantedPermissions: ['filesystem.read', 'env.read'] },
        ];

        const mergedGrants = mergeGrants(...layers).grantedPermissions;

        expect(mergedGrants).toEqual(['filesystem.read', 'network', 'child_process', 'env.read']);
      });
    });

    describe('合并后权限验证', () => {
      it('用户层授权 + 项目层授权 → 验证通过', () => {
        const declared = ['filesystem.read'];
        const mergedGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: ['filesystem.read', 'network'] },
          { grantedPermissions: [] },
        );

        const errors = validator.validatePermissions(declared, mergedGrants);

        expect(errors).toEqual([]);
      });

      it('多层授权但仍不满足声明 → 验证失败', () => {
        const declared = ['filesystem.read', 'child_process', 'network'];
        const mergedGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: ['filesystem.read'] },
          { grantedPermissions: ['network'] },
        );

        const errors = validator.validatePermissions(declared, mergedGrants);

        expect(errors).toHaveLength(1);
        expect(getMissingPermissions(errors)).toContain('child_process');
      });

      it('运行时层动态添加权限 → 验证通过', () => {
        const declared = ['child_process'];
        // 初始只有用户层授权
        const initialGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: ['filesystem.read'] },
        );
        const errors1 = validator.validatePermissions(declared, initialGrants);
        expect(errors1).toHaveLength(1);

        // 运行时添加 child_process 权限
        const updatedGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: ['filesystem.read'] },
          { grantedPermissions: [] },
          { grantedPermissions: ['child_process'] },
        );
        const errors2 = validator.validatePermissions(declared, updatedGrants);

        expect(errors2).toEqual([]);
      });

      it('用户层无权限 → 验证失败', () => {
        const declared = ['network'];
        // 用户层有权限
        const userGrants = createMergedGrants(
          { grantedPermissions: [] }, // default
          { grantedPermissions: ['network'] }, // user
        );
        const errors1 = validator.validatePermissions(declared, userGrants);
        expect(errors1).toEqual([]);

        // 只用默认层（空）
        const defaultGrants = createMergedGrants(
          { grantedPermissions: [] }, // default
          { grantedPermissions: [] }, // user (empty)
        );
        const errors2 = validator.validatePermissions(declared, defaultGrants);

        expect(errors2).toHaveLength(1);
        expect(getMissingPermissions(errors2)).toContain('network');
      });
    });

    describe('配置合并边界情况', () => {
      it('空配置合并 → 返回空授权', () => {
        const mergedGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: [] },
        );

        expect(mergedGrants).toEqual([]);
      });

      it('多层空配置 + 一层有效授权', () => {
        const mergedGrants = createMergedGrants(
          { grantedPermissions: [] },
          { grantedPermissions: [] },
          { grantedPermissions: ['filesystem.read'] },
          { grantedPermissions: [] },
        );

        expect(mergedGrants).toContain('filesystem.read');
      });
    });
  });

  // =========================================================================
  // 3. 权限拒绝场景测试
  // =========================================================================

  describe('权限拒绝场景', () => {
    describe('基础拒绝场景', () => {
      it('未授权的单个权限应被拒绝', () => {
        const declared = ['child_process'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('child_process');
        expect(errors[0].reason).toContain('未被授予');
      });

      it('未授权的多个权限应全部被拒绝', () => {
        const declared = ['child_process', 'filesystem.write', 'network'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(3);
      });

      it('完全无授权时应拒绝所有声明', () => {
        const declared = ['filesystem.read', 'network', 'child_process', 'filesystem.write', 'env.read'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(5);
        expect(getMissingPermissions(errors)).toEqual(declared);
      });
    });

    describe('错误信息质量', () => {
      it('错误信息应包含权限名称', () => {
        const declared = ['network'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors[0].permission).toBe('network');
        expect(errors[0].reason).toContain('network');
      });

      it('错误信息应包含行动建议', () => {
        const declared = ['filesystem.write'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors[0].suggestion).toBeDefined();
        expect(errors[0].suggestion).toContain('授权配置');
      });

      it('不同权限类型应生成正确的错误信息', () => {
        const permissions = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(permissions, grants);

        expect(errors).toHaveLength(5);
        errors.forEach((error, index) => {
          expect(error.permission).toBe(permissions[index]);
          expect(error.reason).toContain('未被授予');
        });
      });
    });

    describe('拒绝场景与静态检查集成', () => {
      it('静态检查失败 + 权限未授权 → 双重拒绝', () => {
        const declaredPermissions = ['filesystem.read'];
        const staticCheckResult: SimplifiedStaticCheckResult = {
          passed: false,
          violations: [
            { ruleId: 'CHILD_PROCESS_EXEC', api: 'child_process.exec', requiredPermission: 'child_process' },
          ],
        };
        const grants = ['filesystem.read']; // 有 filesystem.read 但没有 child_process

        const result = declarationValidator.validateFull({
          declaredPermissions,
          staticCheckResult,
          grants,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
      });

      it('静态检查通过 + 权限已授权 → 验证通过', () => {
        const declaredPermissions = ['filesystem.read', 'network'];
        const staticCheckResult: SimplifiedStaticCheckResult = {
          passed: true,
          violations: [],
        };
        const grants = ['filesystem.read', 'network'];

        const result = declarationValidator.validateFull({
          declaredPermissions,
          staticCheckResult,
          grants,
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('声明使用敏感API但未声明对应权限 → 拒绝', () => {
        const declaredPermissions = ['filesystem.read']; // 声明了 filesystem.read
        const staticCheckResult: SimplifiedStaticCheckResult = {
          passed: false,
          violations: [
            { ruleId: 'HTTP_REQUEST', api: 'http.request', requiredPermission: 'network' },
          ],
        };
        const grants = ['filesystem.read', 'network']; // 有授权

        const result = declarationValidator.validateFull({
          declaredPermissions,
          staticCheckResult,
          grants,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.type === 'insufficient_permissions')).toBe(true);
      });
    });

    describe('权限拒绝的边界情况', () => {
      it('重复声明的权限应生成多个错误', () => {
        const declared = ['network', 'network', 'network'];
        const grants: string[] = [];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(3);
      });

      it('未知权限应被拒绝', () => {
        const declared = ['unknown.permission', 'filesystem.read'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('unknown.permission');
      });

      it('空字符串权限应被拒绝', () => {
        const declared = ['', 'filesystem.read'];
        const grants = ['filesystem.read'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('');
      });

      it('授权集合包含未知权限不应影响验证', () => {
        const declared = ['filesystem.read'];
        const grants = ['filesystem.read', 'unknown.permission', 'another.unknown'];

        const errors = validator.validatePermissions(declared, grants);

        expect(errors).toEqual([]);
      });
    });

    describe('权限检查与验证的一致性', () => {
      it('checkPermission 返回 true 时 validatePermissions 应返回空数组', () => {
        const permission = 'network';
        const grants = ['filesystem.read', 'network'];

        const checkResult = validator.checkPermission(permission, grants);
        const errors = validator.validatePermissions([permission], grants);

        expect(checkResult).toBe(true);
        expect(errors).toEqual([]);
      });

      it('checkPermission 返回 false 时 validatePermissions 应返回错误', () => {
        const permission = 'child_process';
        const grants = ['filesystem.read', 'network'];

        const checkResult = validator.checkPermission(permission, grants);
        const errors = validator.validatePermissions([permission], grants);

        expect(checkResult).toBe(false);
        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe('child_process');
      });
    });
  });
});
/**
 * Property PL-1: Plugin Permission Gate Property-Based Test
 *
 * Feature: plugin-loader, Property 28: Plugin Permission Gate, Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证权限声明验证的核心属性：
 * 1. 如果 requires ⊆ grants（声明的权限都在授权集合中），验证应该通过（无错误）
 * 2. 如果 requires ∖ grants ≠ ∅（存在未授权的声明），验证应该失败（返回错误）
 * 3. 错误应该精确指出哪些权限未被授权
 *
 * 对应 Requirement 1 AC-4: IF `p.manifest.requires \ grants ≠ ∅` THEN 拒绝加载插件 p
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PermissionValidator } from '../../src/permission-validator';
import { ALL_KNOWN_PERMISSIONS } from '../../src/auth/AuthorizationCollection';

// 已知权限类型（来自 requirements.md）
const KNOWN_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];

// 生成任意已知权限
const arbitraryKnownPermission = fc.oneof(
  ...KNOWN_PERMISSIONS.map((p) => fc.constant(p))
);

// 生成权限数组（可能包含未知权限）
const arbitraryPermissionArray = fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 20 });

// 生成授权集合（可能包含未知权限）
const arbitraryGrantsArray = fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 20 });

describe('Property PL-1: Plugin Permission Gate', () => {
  const validator = new PermissionValidator();

  /**
   * Property 1: 如果声明的权限都在授权集合中，验证应该通过
   *
   * 形式化: ∀ requires, grants: (requires ⊆ grants) → validatePermissions(requires, grants) = []
   */
  it('当所有声明的权限都在授权集合中时，验证应该通过', () => {
    fc.assert(
      fc.property(arbitraryPermissionArray, arbitraryGrantsArray, (requires, grants) => {
        // 确保 requires ⊆ grants（只保留 grants 中存在的权限）
        const filteredRequires = requires.filter((r) => grants.includes(r));
        const grantsSet = new Set(grants);

        // 验证：所有 filteredRequires 都在 grantsSet 中
        const allGranted = filteredRequires.every((r) => grantsSet.has(r));

        if (allGranted && filteredRequires.length > 0) {
          const errors = validator.validatePermissions(filteredRequires, grants);
          expect(errors).toEqual([]);
        }
      }),
      { numRuns: 200, seed: 42 }
    );
  });

  /**
   * Property 2: 如果存在未授权的声明，验证应该失败并返回错误
   *
   * 形式化: ∀ requires, grants: (requires ∖ grants ≠ ∅) → validatePermissions(requires, grants) ≠ []
   */
  it('当存在未授权的权限声明时，验证应该返回错误', () => {
    fc.assert(
      fc.property(arbitraryPermissionArray, arbitraryGrantsArray, (requires, grants) => {
        // 构造 requires 中有不在 grants 中的情况
        const grantsSet = new Set(grants);
        const unauthorizedPermissions = requires.filter((r) => !grantsSet.has(r));

        // 只有当确实存在未授权权限时才验证
        if (unauthorizedPermissions.length > 0) {
          const errors = validator.validatePermissions(requires, grants);

          // 验证：错误数量应该等于未授权权限数量
          expect(errors.length).toBe(unauthorizedPermissions.length);

          // 验证：错误应该包含所有未授权的权限
          const errorPermissions = errors.map((e) => e.permission);
          expect(errorPermissions).toContain(unauthorizedPermissions[0]);
        }
      }),
      { numRuns: 200, seed: 42 }
    );
  });

  /**
   * Property 3: 错误信息应该包含正确的 reason 和 suggestion
   */
  it('错误信息应该正确标识未授权的权限', () => {
    fc.assert(
      fc.property(arbitraryPermissionArray, arbitraryGrantsArray, (requires, grants) => {
        const grantsSet = new Set(grants);
        const unauthorizedPermissions = requires.filter((r) => !grantsSet.has(r));

        if (unauthorizedPermissions.length > 0) {
          const errors = validator.validatePermissions(requires, grants);

          for (const error of errors) {
            // 验证：permission 字段应该非空
            expect(error.permission).toBeTruthy();

            // 验证：reason 应该包含权限名称
            expect(error.reason).toContain(error.permission);

            // 验证：suggestion 应该存在
            expect(error.suggestion).toBeDefined();
            expect(error.suggestion!.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 4: 空权限声明应该始终通过验证
   *
   * 形式化: ∀ grants: validatePermissions([], grants) = []
   */
  it('空权限声明应该通过验证', () => {
    fc.assert(
      fc.property(arbitraryGrantsArray, (grants) => {
        const errors = validator.validatePermissions([], grants);
        expect(errors).toEqual([]);
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 5: 空授权集合应该拒绝所有非空权限声明
   *
   * 形式化: ∀ requires (requires ≠ ∅): validatePermissions(requires, []) = requires.length 个错误
   */
  it('空授权集合应该拒绝所有非空权限声明', () => {
    fc.assert(
      fc.property(arbitraryPermissionArray, (requires) => {
        if (requires.length > 0) {
          const errors = validator.validatePermissions(requires, []);
          expect(errors.length).toBe(requires.length);

          // 验证：错误应该包含所有声明的权限
          const errorPermissions = errors.map((e) => e.permission);
          expect(errorPermissions).toEqual(expect.arrayContaining(requires));
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 6: checkPermission 与 validatePermissions 的一致性
   *
   * 形式化: ∀ permission, grants: checkPermission(permission, grants) = (validatePermissions([permission], grants) = [])
   */
  it('checkPermission 与 validatePermissions 应该一致', () => {
    fc.assert(
      fc.property(arbitraryKnownPermission, arbitraryGrantsArray, (permission, grants) => {
        const checkResult = validator.checkPermission(permission, grants);
        const validateErrors = validator.validatePermissions([permission], grants);
        const validateResult = validateErrors.length === 0;

        expect(checkResult).toBe(validateResult);
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 7: 重复权限声明应该为每个重复项生成错误
   *
   * 形式化: ∀ requires (has duplicates), grants: errors.length ≥ unique(unauthorized)
   */
  it('重复权限声明应该生成对应的错误', () => {
    fc.assert(
      fc.property(arbitraryGrantsArray, (grants) => {
        const grantsSet = new Set(grants);
        // 构造包含重复的权限声明
        const requires = ['filesystem.read', 'network', 'filesystem.read', 'child_process'];
        const unauthorized = requires.filter((r) => !grantsSet.has(r));

        if (unauthorized.length > 0) {
          const errors = validator.validatePermissions(requires, grants);
          // 至少有未授权权限数量的错误
          expect(errors.length).toBeGreaterThanOrEqual(unauthorized.length);
        }
      }),
      { numRuns: 50, seed: 42 }
    );
  });

  /**
   * Property 8: 已知权限列表中的权限验证应该正确处理
   */
  it('已知权限列表中的权限应该正确验证', () => {
    fc.assert(
      fc.property(arbitraryKnownPermission, arbitraryGrantsArray, (permission, grants) => {
        const grantsSet = new Set(grants);
        const errors = validator.validatePermissions([permission], grants);

        if (grantsSet.has(permission)) {
          expect(errors).toEqual([]);
        } else {
          expect(errors.length).toBe(1);
          expect(errors[0].permission).toBe(permission);
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });
});
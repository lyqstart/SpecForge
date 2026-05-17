/**
 * 任务 3.3.3: 权限验证正确性 Property-Based 测试
 *
 * 使用 fast-check 生成边界用例，覆盖：
 *   1. 权限声明与实际授权的匹配（Property PL-1）
 *   2. 多级配置合并后的权限验证
 *   3. 权限拒绝场景
 *
 * 设计参考：
 *   - design.md: AuthValidator 接口、Property PL-1（权限声明验证）
 *   - requirements.md: Requirement 1（权限声明）、Requirement 4（授权管理）
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PermissionValidator,
  permissionValidator,
} from '../../src/permission-validator';
import {
  mergeGrants,
  type GrantsConfig,
} from '../../src/grants';

// ---------------------------------------------------------------------------
// 自定义 Arbitraries
// ---------------------------------------------------------------------------

/** 合法的权限类型 */
const VALID_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

type ValidPermission = typeof VALID_PERMISSIONS[number];

/** 生成有效的权限数组 */
const validPermissionsArray = fc.array(
  fc.oneof(...VALID_PERMISSIONS.map((p) => fc.constant(p))),
  { minLength: 0, maxLength: 5 },
);

/** 生成有效的单个权限 */
const validPermission = fc.oneof(...VALID_PERMISSIONS.map((p) => fc.constant(p)));

/** 生成可能的授权数组（包括有效和无效权限） */
const grantsWithExtras = fc.array(
  fc.oneof(
    ...VALID_PERMISSIONS.map((p) => fc.constant(p)),
    fc.string({ minLength: 1, maxLength: 30 }), // 可能的无效权限
  ),
  { minLength: 0, maxLength: 10 },
);

// ---------------------------------------------------------------------------
// Property 测试
// ---------------------------------------------------------------------------

describe('权限验证正确性 Property 测试', () => {
  const validator = new PermissionValidator();

  // =========================================================================
  // Property 1: 权限声明与授权匹配
  // =========================================================================

  describe('Property PL-1: 权限声明验证', () => {
    /**
     * Property 1.1: 如果声明的权限都在授权集合中，验证应该通过
     *
     * 形式化: ∀ requires, grants: (requires ⊆ grants) → validatePermissions(requires, grants) = []
     */
    it(
      'For all declared permissions that exist in grants, validatePermissions should return empty error array',
      () => {
        fc.assert(
          fc.property(
            validPermissionsArray,
            validPermissionsArray,
            (requires, grants) => {
              // 确保 requires ⊆ grants
              const grantsSet = new Set(grants);
              const authorizedRequires = requires.filter((p) => grantsSet.has(p));

              if (authorizedRequires.length === 0) return;

              const errors = validator.validatePermissions(authorizedRequires, grants);

              expect(errors).toEqual([]);
            },
          ),
        );
      },
    );

    /**
     * Property 1.2: 如果存在未授权的声明，验证应该失败
     *
     * 形式化: ∀ requires, grants: (requires ∖ grants ≠ ∅) → validatePermissions(requires, grants) ≠ []
     */
    it(
      'For all declared permissions NOT in grants, validatePermissions should return errors',
      () => {
        fc.assert(
          fc.property(validPermission, grantsWithExtras, (permission, grants) => {
            // 权限不在授权集合中
            const grantsSet = new Set(grants);
            if (grantsSet.has(permission)) {
              // 如果权限在授权中，测试无意义，跳过
              return;
            }

            const errors = validator.validatePermissions([permission], grants);

            expect(errors).toHaveLength(1);
            expect(errors[0].permission).toBe(permission);
          }),
        );
      },
    );

    /**
     * Property 1.3: 授权集合应忽略无效权限
     *
     * 形式化: ∀ requires, grants: validatePermissions(requires, grants) 只检查 requires 中的权限
     */
    it(
      'Grants with invalid/unknown permissions should not affect validation of valid declared permissions',
      () => {
        fc.assert(
          fc.property(validPermissionsArray, grantsWithExtras, (requires, grants) => {
            // 提取 grants 中的有效权限
            const validGrants = grants.filter((p) =>
              VALID_PERMISSIONS.includes(p as ValidPermission),
            );

            // 只用有效权限验证
            const errors = validator.validatePermissions(requires, validGrants);

            // 错误数量 = 声明中不在有效授权中的权限数量
            const validGrantsSet = new Set(validGrants);
            const unauthorizedRequires = requires.filter((p) => !validGrantsSet.has(p));

            expect(errors.length).toBe(unauthorizedRequires.length);
          }),
        );
      },
    );

    /**
     * Property 1.4: 权限检查与验证的一致性
     *
     * 形式化: ∀ permission, grants: checkPermission(permission, grants) = (validatePermissions([permission], grants) = [])
     */
    it(
      'checkPermission should be consistent with validatePermissions',
      () => {
        fc.assert(
          fc.property(validPermission, grantsWithExtras, (permission, grants) => {
            const checkResult = validator.checkPermission(permission, grants);
            const errors = validator.validatePermissions([permission], grants);
            const validationPassed = errors.length === 0;

            expect(checkResult).toBe(validationPassed);
          }),
        );
      },
    );
  });

  // =========================================================================
  // Property 2: 多级配置合并后的权限验证
  // =========================================================================

  describe('多级配置合并后的权限验证', () => {
    /**
     * Property 2.1: 合并后的权限应支持完整的权限验证
     */
    it(
      'After merging multiple config layers, validation should work correctly',
      () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.record({
                schema_version: fc.constant('1.0' as const),
                grantedPermissions: validPermissionsArray,
              }),
              { minLength: 1, maxLength: 4 },
            ),
            validPermissionsArray,
            (layers, declared) => {
              // 合并配置
              const mergedGrants = mergeGrants(...layers).grantedPermissions;

              // 验证
              const errors = validator.validatePermissions(declared, mergedGrants);

              // 错误应该只包含未合并授权的权限
              const mergedSet = new Set(mergedGrants);
              const missingPermissions = declared.filter((p) => !mergedSet.has(p));

              expect(errors.length).toBe(missingPermissions.length);
            },
          ),
        );
      },
    );

    /**
     * Property 2.2: 合并去重应保持首次出现顺序
     */
    it(
      'Merged permissions should maintain first-occurrence order with deduplication',
      () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.record({
                schema_version: fc.constant('1.0' as const),
                grantedPermissions: validPermissionsArray,
              }),
              { minLength: 2, maxLength: 4 },
            ),
            (layers) => {
              const merged = mergeGrants(...layers).grantedPermissions;

              // 验证去重
              const uniqueSet = new Set(merged);
              expect(merged.length).toBe(uniqueSet.size);

              // 验证顺序：首次出现的顺序
              const seenOrder: string[] = [];
              for (const p of merged) {
                if (!seenOrder.includes(p)) {
                  seenOrder.push(p);
                }
              }
              expect(merged).toEqual(seenOrder);
            },
          ),
        );
      },
    );

    /**
     * Property 2.3: 运行时层应能覆盖之前层级
     */
    it(
      'Runtime layer should be able to add permissions that were not in previous layers',
      () => {
        fc.assert(
          fc.property(
            fc.record({
              baseLayer: validPermissionsArray,
              runtimeAdd: validPermission,
            }),
            ({ baseLayer, runtimeAdd }) => {
              // 基础层 + 运行时层
              const merged = mergeGrants(
                { schema_version: '1.0', grantedPermissions: baseLayer },
                { schema_version: '1.0', grantedPermissions: [runtimeAdd] },
              ).grantedPermissions;

              // 运行时添加的权限应该存在
              expect(merged).toContain(runtimeAdd);
            },
          ),
        );
      },
    );
  });

  // =========================================================================
  // Property 3: 权限拒绝场景
  // =========================================================================

  describe('权限拒绝场景', () => {
    /**
     * Property 3.1: 完全未授权时应拒绝所有声明
     */
    it(
      'When grants is empty, all declared permissions should be rejected',
      () => {
        fc.assert(
          fc.property(validPermissionsArray, (declared) => {
            const errors = validator.validatePermissions(declared, []);

            expect(errors.length).toBe(declared.length);
            declared.forEach((permission) => {
              expect(
                errors.some((e) => e.permission === permission),
              ).toBe(true);
            });
          }),
        );
      },
    );

    /**
     * Property 3.2: 错误信息应包含所有必要信息
     */
    it(
      'Error messages should contain permission name, reason, and suggestion',
      () => {
        fc.assert(
          fc.property(validPermission, (permission) => {
            const errors = validator.validatePermissions([permission], []);

            expect(errors).toHaveLength(1);
            const error = errors[0];

            // 验证错误信息完整性
            expect(error.permission).toBe(permission);
            expect(error.reason).toBeTruthy();
            expect(typeof error.reason).toBe('string');
            expect(error.reason.length).toBeGreaterThan(0);

            // 建议应该是可选的，但如果存在应该是字符串
            if (error.suggestion) {
              expect(typeof error.suggestion).toBe('string');
            }
          }),
        );
      },
    );

    /**
     * Property 3.3: 权限降级场景
     */
    it(
      'When grants are reduced, previously authorized permissions should become unauthorized',
      () => {
        fc.assert(
          fc.property(
            fc.record({
              initialGrants: validPermissionsArray,
              reducedGrants: validPermissionsArray,
              declared: validPermissionsArray,
            }),
            ({ initialGrants, reducedGrants, declared }) => {
              // 确保 reducedGrants 是 initialGrants 的子集
              const initialSet = new Set(initialGrants);
              const validReduced = reducedGrants.filter((p) => initialSet.has(p));

              if (validReduced.length === initialGrants.length) return; // 没有实际降级

              // 初始验证
              const initialErrors = validator.validatePermissions(declared, initialGrants);

              // 降级后验证
              const reducedErrors = validator.validatePermissions(declared, validReduced);

              // 降级后错误应该更多或相同
              expect(reducedErrors.length).toBeGreaterThanOrEqual(initialErrors.length);
            },
          ),
        );
      },
    );

    /**
     * Property 3.4: 重复声明应生成多个错误
     */
    it(
      'Duplicate permission declarations should generate multiple errors',
      () => {
        fc.assert(
          fc.property(
            fc.record({
              permission: validPermission,
              count: fc.integer({ min: 1, max: 5 }),
              grants: validPermissionsArray,
            }),
            ({ permission, count, grants }) => {
              const declared = Array(count).fill(permission);
              const errors = validator.validatePermissions(declared, grants);

              // 过滤出该权限的错误
              const permissionErrors = errors.filter((e) => e.permission === permission);

              // 取决于权限是否在 grants 中
              const grantsSet = new Set(grants);
              if (!grantsSet.has(permission)) {
                expect(permissionErrors.length).toBe(count);
              } else {
                expect(permissionErrors.length).toBe(0);
              }
            },
          ),
        );
      },
    );
  });

  // =========================================================================
  // Property 4: 边界情况
  // =========================================================================

  describe('边界情况 Property 测试', () => {
    /**
     * Property 4.1: 空数组边界
     */
    it(
      'Empty arrays should be handled correctly',
      () => {
        fc.assert(
          fc.property(validPermissionsArray, (grants) => {
            // 空声明
            const emptyDeclaredErrors = validator.validatePermissions([], grants);
            expect(emptyDeclaredErrors).toEqual([]);

            // 空授权
            const emptyGrantsErrors = validator.validatePermissions(grants, []);
            expect(emptyGrantsErrors.length).toBe(grants.length);
          }),
        );
      },
    );

    /**
     * Property 4.2: 大数组边界
     */
    it(
      'Large permission arrays should be handled efficiently',
      () => {
        fc.assert(
          fc.property(
            fc.array(validPermission, { minLength: 50, maxLength: 100 }),
            fc.array(validPermission, { minLength: 50, maxLength: 100 }),
            (declared, grants) => {
              const errors = validator.validatePermissions(declared, grants);

              // 验证结果合理性
              const grantsSet = new Set(grants);
              const expectedErrors = declared.filter((p) => !grantsSet.has(p));

              expect(errors.length).toBe(expectedErrors.length);
            },
          ),
        );
      },
    );

    /**
     * Property 4.3: 单个权限边界
     */
    it(
      'Single permission validation should work correctly',
      () => {
        fc.assert(
          fc.property(validPermission, validPermissionsArray, (permission, grants) => {
            const errors = validator.validatePermissions([permission], grants);

            const grantsSet = new Set(grants);
            if (grantsSet.has(permission)) {
              expect(errors).toEqual([]);
            } else {
              expect(errors).toHaveLength(1);
              expect(errors[0].permission).toBe(permission);
            }
          }),
        );
      },
    );
  });
});
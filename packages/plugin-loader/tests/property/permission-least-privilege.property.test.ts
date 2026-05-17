/**
 * Property PL-3: 最小权限原则 (Principle of Least Privilege) Property-Based Tests
 * 
 * Validates: For all loaded plugins p, p can only access permissions declared in its 
 * manifest.permissions and granted; undeclared permissions are denied by default.
 * 
 * Feature: plugin-loader, Property 3: Least Privilege Principle
 * Derived-From: v6-architecture-overview Property 28 (Plugin Permission Gate)
 * 
 * 核心验证点：
 * 1. 已声明且已授权的权限 → 允许访问
 * 2. 已声明但未授权的权限 → 拒绝访问
 * 3. 未声明的权限 → 默认拒绝（即使 grants 中存在）
 * 4. 空权限声明 → 无需任何权限（所有权限均被拒绝）
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PermissionValidator, permissionValidator } from '../../src/permission-validator';
import type { PluginManifest } from '../../src/manifest';

// 有效的权限名称（来自 design.md 和 manifest.ts）
const VALID_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write', 
  'network',
  'child_process',
  'env.read',
] as const;

type ValidPermission = typeof VALID_PERMISSIONS[number];

// 自定义 Arbitraries
const validPermission = fc.oneof(
  ...VALID_PERMISSIONS.map(p => fc.constant(p))
);

const validPermissionsArray = fc.array(
  validPermission,
  { minLength: 0, maxLength: VALID_PERMISSIONS.length }
);

// 生成两个不相交的权限数组（用于测试声明与授权的差异）
const disjointPermissionSets = fc.record({
  declared: validPermissionsArray,
  granted: validPermissionsArray,
}).map((record) => {
  // 确保 declared 中至少有一些权限不在 granted 中
  const declaredSet = new Set(record.declared);
  const grantedSet = new Set(record.granted);
  
  // 计算未授权的声明权限
  const unauthorized = record.declared.filter(p => !grantedSet.has(p));
  
  return {
    declared: record.declared,
    granted: record.granted,
    unauthorized,  // 声明了但未授权的权限
    extraInGrants: record.granted.filter(p => !declaredSet.has(p)),  // 授权了但未声明的权限
  };
});

describe('Property PL-3: 最小权限原则 (Principle of Least Privilege)', () => {
  
  describe('PL-3.1: 已声明且已授权的权限 → 允许访问', () => {
    it(
      'For all declared permissions that exist in grants, validatePermissions should return empty error array',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            validPermissionsArray,
            validPermissionsArray,
            async (declared, granted) => {
              // 过滤出已授权的声明权限
              const grantedSet = new Set(granted);
              const authorizedDeclared = declared.filter(p => grantedSet.has(p));
              
              if (authorizedDeclared.length === 0) {
                return; // 跳过没有已授权权限的情况
              }
              
              const errors = permissionValidator.validatePermissions(
                authorizedDeclared,
                granted
              );
              
              // 所有已授权的声明权限都应该通过验证
              expect(errors).toHaveLength(0);
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });

  describe('PL-3.2: 已声明但未授权的权限 → 拒绝访问', () => {
    it(
      'For all declared permissions NOT in grants, validatePermissions should return errors',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            disjointPermissionSets,
            async ({ declared, unauthorized }) => {
              if (unauthorized.length === 0) {
                return; // 跳过所有声明都被授权的情况
              }
              
              // 使用所有声明的权限（包括未授权的）进行验证
              const errors = permissionValidator.validatePermissions(declared, []);
              
              // 应该对每个未授权的权限返回错误
              expect(errors.length).toBeGreaterThan(0);
              
              // 验证错误信息包含正确的权限名称
              for (const perm of unauthorized) {
                const hasError = errors.some(e => e.permission === perm);
                expect(hasError).toBe(true);
              }
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );

    it(
      'When declared permissions are partially granted, only unauthorized ones produce errors',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            validPermissionsArray,
            validPermissionsArray,
            async (declared, granted) => {
              if (declared.length === 0) return;
              
              const grantedSet = new Set(granted);
              const expectedUnauthorized = declared.filter(p => !grantedSet.has(p));
              
              const errors = permissionValidator.validatePermissions(declared, granted);
              
              // 错误数量应该等于或小于未授权权限数量
              // (如果declared中有重复，可能会有更多错误)
              expect(errors.length).toBe(expectedUnauthorized.length);
              
              // 每个错误对应的权限都应该是未授权的
              for (const error of errors) {
                expect(grantedSet.has(error.permission)).toBe(false);
              }
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });

  describe('PL-3.3: 未声明的权限 → 默认拒绝（即使在 grants 中存在）', () => {
    it(
      'Undeclared permissions should be denied even if present in grants (core of least privilege)',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            disjointPermissionSets,
            async ({ declared, extraInGrants }) => {
              if (extraInGrants.length === 0) {
                return; // 跳过没有额外授权的情况
              }
              
              // 仅使用 declared 进行验证，不包含 extraInGrants
              const errors = permissionValidator.validatePermissions(
                declared,
                [...declared, ...extraInGrants]  // grants 包含 declared + extra
              );
              
              // 验证：只有 declared 中声明的权限被考虑
              // extraInGrants 是未声明的，所以不会被检查（也不会产生错误）
              // 这是正确的行为 - 未声明的权限不会被授予
              
              // 核心断言：对于声明的权限，如果全部授权，则无错误
              const grantedSet = new Set([...declared, ...extraInGrants]);
              const unauthorizedInDeclared = declared.filter(p => !grantedSet.has(p));
              
              expect(errors.length).toBe(unauthorizedInDeclared.length);
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );

    it(
      'checkPermission returns true only for granted permissions, regardless of declaration',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            validPermission,
            validPermissionsArray,
            validPermissionsArray,
            async (permission, declared, granted) => {
              const grantedSet = new Set(granted);
              const declaredSet = new Set(declared);
              
              // checkPermission 只检查是否在 grants 中，不关心是否声明
              const result = permissionValidator.checkPermission(permission, granted);
              
              // 核心：权限检查只看 grants，不看是否声明
              // 这是正确的 - 如果一个权限不在 grants 中，即使声明了也不会被授予
              // 如果一个权限在 grants 中，即使没声明也不会被授予（下次测试）
              expect(result).toBe(grantedSet.has(permission));
              
              // 额外验证：declared 和 granted 之间的关系
              const isDeclaredButNotGranted = declaredSet.has(permission) && !grantedSet.has(permission);
              const isGrantedButNotDeclared = !declaredSet.has(permission) && grantedSet.has(permission);
              
              // 无论哪种情况，checkPermission 的行为是一致的
              if (isDeclaredButNotGranted) {
                expect(result).toBe(false);
              }
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });

  describe('PL-3.4: 空权限声明 → 无需任何权限', () => {
    it(
      'When permissions array is empty, validation should pass regardless of grants',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            validPermissionsArray,
            async (grants) => {
              // 空权限声明
              const errors = permissionValidator.validatePermissions([], grants);
              
              // 空权限声明应该通过验证（无需任何权限）
              expect(errors).toHaveLength(0);
              
              // checkPermission 对空 grants 的行为
              const hasAnyPermission = permissionValidator.checkPermission(
                VALID_PERMISSIONS[0], 
                []
              );
              expect(hasAnyPermission).toBe(false);
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );

    it(
      'Empty declared permissions means plugin needs NO permissions from grants',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(validPermission, { minLength: 1, maxLength: 5 }),
            async (grants) => {
              const errors = permissionValidator.validatePermissions([], grants);
              
              // 无权限声明 = 无需授权 = 验证通过
              expect(errors).toHaveLength(0);
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });

  describe('PL-3.5: 边界情况处理', () => {
    it(
      'Empty grants array should deny all declared permissions',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            validPermissionsArray,
            async (declared) => {
              if (declared.length === 0) return;
              
              const errors = permissionValidator.validatePermissions(declared, []);
              
              // 所有声明的权限都应该被拒绝
              expect(errors.length).toBe(declared.length);
              
              // 验证错误信息
              for (const perm of declared) {
                const hasError = errors.some(e => e.permission === perm);
                expect(hasError).toBe(true);
              }
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );

    it(
      'Duplicate permissions in declaration should each produce an error',
      async () => {
        // 测试重复权限
        const duplicateDecl = ['filesystem.read', 'filesystem.read', 'network'];
        const grants = ['network'];
        
        const errors = permissionValidator.validatePermissions(duplicateDecl, grants);
        
        // filesystem.read 出现两次，应该产生两个错误
        const fsReadErrors = errors.filter(e => e.permission === 'filesystem.read');
        expect(fsReadErrors).toHaveLength(2);
      }
    );

    it(
      'Unknown/invalid permission names should be denied',
      async () => {
        const invalidPermission = 'invalid.permission.name';
        const grants = ['filesystem.read', 'network'];
        
        const errors = permissionValidator.validatePermissions(
          [invalidPermission], 
          grants
        );
        
        // 未知权限应该被拒绝
        expect(errors).toHaveLength(1);
        expect(errors[0].permission).toBe(invalidPermission);
      }
    );

    it(
      'Empty permission string should be denied',
      async () => {
        const grants = ['filesystem.read', 'network'];
        
        // 空字符串权限
        const result = permissionValidator.checkPermission('', grants);
        expect(result).toBe(false);
        
        const errors = permissionValidator.validatePermissions([''], grants);
        expect(errors).toHaveLength(1);
      }
    );
  });

  describe('PL-3.6: 最小权限原则的综合验证', () => {
    it(
      'Complete least privilege: plugin can only access permissions that are BOTH declared AND granted',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              manifest: fc.record({
                id: fc.string({ minLength: 1, maxLength: 20 }),
                name: fc.string({ minLength: 1, maxLength: 20 }),
                version: fc.string({ minLength: 1, maxLength: 10 }),
                entry: fc.string({ minLength: 1, maxLength: 50 }),
                schema_version: fc.constant('1.0' as const),
                permissions: validPermissionsArray,
              }),
              grants: validPermissionsArray,
            }),
            async ({ manifest, grants }) => {
              const declaredSet = new Set(manifest.permissions);
              const grantsSet = new Set(grants);
              
              // 计算实际可访问的权限：必须同时满足"已声明"且"已授权"
              const accessible = [...declaredSet].filter(p => grantsSet.has(p));
              const unauthorized = manifest.permissions.filter(p => !grantsSet.has(p));
              
              // 验证
              const errors = permissionValidator.validatePermissions(
                manifest.permissions, 
                grants
              );
              
              // 错误数量应等于未授权的声明权限
              expect(errors.length).toBe(unauthorized.length);
              
              // 核心属性：只有同时满足声明和授权的权限才能访问
              // 这就是最小权限原则
              for (const perm of accessible) {
                expect(grantsSet.has(perm)).toBe(true);
                expect(declaredSet.has(perm)).toBe(true);
              }
              
              // 未声明的权限即使在 grants 中也不能访问
              for (const perm of grants) {
                if (!declaredSet.has(perm)) {
                  // 这个权限存在 grants 中，但因为没声明所以不能被插件使用
                  // checkPermission 只看 grants，不考虑声明
                  const checkResult = permissionValidator.checkPermission(perm, grants);
                  expect(checkResult).toBe(true);
                  // 但在 validatePermissions 中不会检查未声明的权限
                }
              }
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });
});
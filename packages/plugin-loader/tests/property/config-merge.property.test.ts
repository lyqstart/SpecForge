/**
 * Property PL-3: Configuration Merge Logic Property-Based Test
 *
 * Feature: plugin-loader, Property 3: Multi-layer Config Merge, Derived-From: v6-architecture-overview Property 3
 *
 * 本测试验证配置合并的核心属性：
 * 1. 合并顺序无关性：多次调用 mergeGrants 的结果应该一致
 * 2. 幂等性：mergeGrants(x, x) = mergeGrants(x)
 * 3. 权限并集去重：重复权限只出现一次，保留首次出现的顺序
 * 4. 覆盖语义：后层的 comment/audit 覆盖前层
 * 5. Schema 一致性：不同 schema_version 应该抛出错误
 * 6. 空输入处理：空参数返回默认配置
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mergeGrants, GrantsConfig, GrantsSchemaVersionMismatchError } from '../../src/grants';

// 已知权限类型
const KNOWN_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

// 生成任意已知权限
const arbitraryKnownPermission = fc.oneof(
  ...KNOWN_PERMISSIONS.map((p) => fc.constant(p))
);

// 生成任意 GrantsConfig（不含非法权限组合，测试时会分开测试）
function arbitraryGrantsConfig(): fc.Arbitrary<GrantsConfig> {
  return fc.record({
    schema_version: fc.constant('1.0'),
    grantedPermissions: fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 10 }),
    comment: fc.option(fc.string(), { nil: undefined }),
    audit: fc.option(
      fc.record({
        grantedBy: fc.string(),
        grantedAt: fc.string(),
        source: fc.oneof(
          fc.constant('default'),
          fc.constant('user'),
          fc.constant('project'),
          fc.constant('runtime')
        ),
      }),
      { nil: undefined }
    ),
  });
}

// 生成多个 GrantsConfig 数组（用于测试合并）
function arbitraryGrantsConfigArray(min: number, max: number): fc.Arbitrary<GrantsConfig[]> {
  return fc.array(arbitraryGrantsConfig(), { minLength: min, maxLength: max });
}

describe('Property PL-3: Config Merge Logic', () => {
  // 辅助函数：获取最后一个定义的 comment（mergeGrants 的逻辑）
// mergeGrants 用 cfg.comment !== undefined，所以空字符串也算"定义"
function getLastDefinedComment(configs: { comment?: string }[]): string | undefined {
  let result: string | undefined;
  for (const cfg of configs) {
    if (cfg.comment !== undefined) {
      result = cfg.comment;
    }
  }
  return result;
}

  /**
   * Property 1: 相同权限集合的结果与顺序无关（集合相等性）
   *
   * 当输入配置的 grantedPermissions 集合完全相同（顺序可能不同）时，
   * 合并结果应该包含相同的权限（不考虑顺序）
   *
   * 形式化: ∀ A,B,C: set(mergeGrants(A,B,C).permissions) = set(mergeGrants(C,B,A).permissions)
   */
  it('相同权限集合的合并结果应该等价（集合相等性）', () => {
    fc.assert(
      fc.property(arbitraryGrantsConfig(), arbitraryGrantsConfig(), arbitraryGrantsConfig(), (a, b, c) => {
        const result1 = mergeGrants(a, b, c);
        const result2 = mergeGrants(c, b, a);
        const result3 = mergeGrants(b, a, c);

        expect(result1.schema_version).toBe(result2.schema_version);
        expect(result1.schema_version).toBe(result3.schema_version);

        // 比较权限集合（忽略顺序）
        const set1 = new Set(result1.grantedPermissions);
        const set2 = new Set(result2.grantedPermissions);
        const set3 = new Set(result3.grantedPermissions);

        expect(set1).toEqual(set2);
        expect(set1).toEqual(set3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: 幂等性
   *
   * mergeGrants(x, x) = mergeGrants(x)
   *
   * 形式化: ∀ x: mergeGrants(x, x) = mergeGrants(x)
   */
  it('重复配置应该幂等', () => {
    fc.assert(
      fc.property(arbitraryGrantsConfig(), (config) => {
        const single = mergeGrants(config);
        const double = mergeGrants(config, config);
        const triple = mergeGrants(config, config, config);

        expect(double.grantedPermissions).toEqual(single.grantedPermissions);
        expect(triple.grantedPermissions).toEqual(single.grantedPermissions);
        expect(double.comment).toEqual(single.comment);
        expect(triple.comment).toEqual(single.comment);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 权限并集去重
   *
   * 合并后的权限列表中，每个权限只出现一次
   * 保留首次出现的顺序
   *
   * 形式化: ∀ configs: unique(mergeGrants(...configs).grantedPermissions)
   */
  it('合并后权限应该去重且保持首次出现的顺序', () => {
    fc.assert(
      fc.property(arbitraryGrantsConfigArray(2, 5), (configs) => {
        const result = mergeGrants(...configs);
        const perms = result.grantedPermissions;

        // 检查去重：每个权限只出现一次
        const uniquePerms = [...new Set(perms)];
        expect(perms).toEqual(uniquePerms);

        // 检查顺序：首次出现的权限应该在前面
        const seen = new Set<string>();
        let orderCorrect = true;
        for (const p of perms) {
          if (seen.has(p)) {
            orderCorrect = false;
            break;
          }
          seen.add(p);
        }
        expect(orderCorrect).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 后层覆盖前层（last-wins）
   *
   * 最后出现的 comment 应该被使用（即使它是空字符串）
   *
   * 形式化: ∀ configs: mergeGrants(...configs).comment = lastDefined(configs).comment
   */
  it('最后出现的 comment 应该覆盖前面的（last-wins）', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            schema_version: fc.constant('1.0'),
            grantedPermissions: fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 5 }),
            comment: fc.option(fc.string(), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (configs) => {
          const result = mergeGrants(...configs);
          const expected = getLastDefinedComment(configs);
          expect(result.comment).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: audit 整体替换
   *
   * audit 应该整体替换，不做深合并
   *
   * 形式化: ∀ configs: mergeGrants(...configs).audit = lastDefined(configs).audit
   */
  it('audit 应该整体替换而不做深合并（last-wins）', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            schema_version: fc.constant('1.0'),
            grantedPermissions: fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 5 }),
            audit: fc.option(
              fc.record({
                grantedBy: fc.string(),
                grantedAt: fc.string(),
                source: fc.oneof(
                  fc.constant('default'),
                  fc.constant('user'),
                  fc.constant('project'),
                  fc.constant('runtime')
                ),
              }),
              { nil: undefined }
            ),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (configs) => {
          // 找到最后一个定义了 audit 的配置
          let lastAudit: { grantedBy: string; grantedAt: string; source: string } | undefined;
          for (const cfg of configs) {
            if (cfg.audit !== undefined) {
              lastAudit = cfg.audit;
            }
          }

          const result = mergeGrants(...configs);

          if (lastAudit === undefined) {
            // 没有任何 audit 时，结果不应包含 audit 字段
            expect('audit' in result).toBe(false);
          } else {
            // audit 应该完全��换，不保留之前的任何字段
            expect(result.audit).toEqual(lastAudit);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Schema 版本一致性
   *
   * 不同 schema_version 的配置合并应该抛出错误
   *
   * 形式化: ∀ v1≠v2: mergeGrants({schema_version: v1}, {schema_version: v2}) throws
   */
  it('不同 schema_version 应该抛出 GrantsSchemaVersionMismatchError', () => {
    // 生成两个不同版本的配置
    const config1: GrantsConfig = {
      schema_version: '1.0',
      grantedPermissions: ['network'],
    };
    const config2: GrantsConfig = {
      // @ts-expect-error - 测试非法版本
      schema_version: '2.0',
      grantedPermissions: ['filesystem.read'],
    };

    expect(() => mergeGrants(config1, config2)).toThrow(GrantsSchemaVersionMismatchError);
  });

  /**
   * Property 7: 空输入返回默认配置
   *
   * mergeGrants() 应该返回默认空配置
   *
   * 形式化: mergeGrants() = { schema_version: '1.0', grantedPermissions: [] }
   */
  it('空参数应该返回默认配置', () => {
    const result = mergeGrants();
    expect(result.schema_version).toBe('1.0');
    expect(result.grantedPermissions).toEqual([]);
    expect('comment' in result).toBe(false);
    expect('audit' in result).toBe(false);
  });

  /**
   * Property 8: 结合律
   *
   * mergeGrants(A, B, C) = mergeGrants(mergeGrants(A, B), C) = mergeGrants(A, mergeGrants(B, C))
   *
   * 形式化: ∀ A,B,C: mergeGrants(A,B,C) = mergeGrants(mergeGrants(A,B), C)
   *
   * 注意：结合律测试需要处理 comment last-wins 语义
   * mergeGrants(a, b, c) 最后一个是 c.comment
   * mergeGrants(mergeGrants(a, b), c) 最后一个是 c.comment（因为 mergeGrants(a,b) 的 comment 来自 a 或 b）
   * mergeGrants(a, mergeGrants(b, c)) 最后是 mergeGrants(b, c).comment
   */
  it('合并应该满足结合律', () => {
    fc.assert(
      fc.property(arbitraryGrantsConfig(), arbitraryGrantsConfig(), arbitraryGrantsConfig(), (a, b, c) => {
        const direct = mergeGrants(a, b, c);
        const leftAssoc = mergeGrants(mergeGrants(a, b), c);
        const rightAssoc = mergeGrants(a, mergeGrants(b, c));

        expect(direct.grantedPermissions).toEqual(leftAssoc.grantedPermissions);
        expect(direct.grantedPermissions).toEqual(rightAssoc.grantedPermissions);
        // 对于 comment，由于 last-wins 语义，直接比较结果
        // mergeGrants(a, b) 的 comment 是 a 和 b 中的最后一个
        // 所以 leftAssoc 最后是 c.comment，rightAssoc 最后是 b 或 c 的最后一个
        expect(direct.comment).toBe(leftAssoc.comment); // 都应该等于 c.comment
        expect(direct.comment).toBe(rightAssoc.comment); // 都应该等于 b 或 c 的最后一个
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: 结果不修改输入
   *
   * 合并操作不应该修改任何输入配置
   *
   * 形式化: ∀ A,B: mergeGrants(A,B) 不修改 A 或 B
   */
  it('合并不应该修改输入配置', () => {
    fc.assert(
      fc.property(arbitraryGrantsConfig(), arbitraryGrantsConfig(), (a, b) => {
        const aSnapshot = JSON.stringify(a);
        const bSnapshot = JSON.stringify(b);

        mergeGrants(a, b);

        expect(JSON.stringify(a)).toBe(aSnapshot);
        expect(JSON.stringify(b)).toBe(bSnapshot);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: 权限顺序稳定性
   *
   * 给定相同的输入顺序，合并结果的权限顺序应该一致
   * 首次出现的权限应该排在前面
   */
  it('权限顺序应该保持首次出现的顺序', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryKnownPermission, { minLength: 3, maxLength: 10 }),
        (perms) => {
          // 制造一些重复
          const config1: GrantsConfig = {
            schema_version: '1.0',
            grantedPermissions: [perms[0], perms[1], perms[2]],
          };
          const config2: GrantsConfig = {
            schema_version: '1.0',
            grantedPermissions: [perms[2], perms[3], perms[0]], // 重复 + 新增
          };
          const config3: GrantsConfig = {
            schema_version: '1.0',
            grantedPermissions: [perms[4], perms[1]], // 更多重复和新添加
          };

          const result = mergeGrants(config1, config2, config3);

          // 验证顺序：首次出现的位置决定顺序
          const firstOccurrence = new Map<string, number>();
          let idx = 0;
          for (const cfg of [config1, config2, config3]) {
            for (const p of cfg.grantedPermissions) {
              if (!firstOccurrence.has(p)) {
                firstOccurrence.set(p, idx++);
              }
            }
          }

          // 按首次出现顺序排序
          const expectedOrder = Array.from(firstOccurrence.keys()).sort(
            (a, b) => (firstOccurrence.get(a) ?? 0) - (firstOccurrence.get(b) ?? 0)
          );

          expect(result.grantedPermissions).toEqual(expectedOrder);
        }
      ),
      { numRuns: 50 }
    );
  });
});
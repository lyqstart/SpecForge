/**
 * 任务 1.2.2 单元测试：GrantsConfig 接口、类型守卫、mergeGrants 四层合并
 *
 * 覆盖：
 *   - 类型守卫：合法 / 非法形状（含权限取值校验、嵌套 audit、边界类型）
 *   - mergeGrants：
 *     * 空配置（0 参）→ 返回默认空配置
 *     * 单配置 → 等价拷贝（已去重）
 *     * 多层叠加 → 权限并集去重 + comment/audit last-wins
 *     * schema_version 必须一致 → 否则抛 GrantsSchemaVersionMismatchError
 */

import { describe, it, expect } from 'vitest';

import {
  isGrantsConfig,
  mergeGrants,
  GrantsSchemaVersionMismatchError,
  type GrantsConfig,
} from '../src/grants';

// ---------------------------------------------------------------------------
// 工具：构造一个合法的最小 GrantsConfig，再按需覆盖字段做反例
// ---------------------------------------------------------------------------

function minimal(): GrantsConfig {
  return {
    schema_version: '1.0',
    grantedPermissions: [],
  };
}

describe('isGrantsConfig 类型守卫', () => {
  describe('合法形状', () => {
    it('最小化（仅必填）应通过', () => {
      expect(isGrantsConfig(minimal())).toBe(true);
    });

    it('完整字段（含 comment / audit）应通过', () => {
      const full: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read', 'network'],
        comment: '用户级默认授权',
        audit: {
          grantedBy: 'alice',
          grantedAt: '2026-05-16T10:00:00Z',
          source: 'user',
        },
      };
      expect(isGrantsConfig(full)).toBe(true);
    });

    it('grantedPermissions 包含全部 5 种合法权限应通过', () => {
      const all: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: [
          'filesystem.read',
          'filesystem.write',
          'network',
          'child_process',
          'env.read',
        ],
      };
      expect(isGrantsConfig(all)).toBe(true);
    });

    it('audit 仅有部分字段应通过', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: [],
          audit: { source: 'project' },
        }),
      ).toBe(true);
    });
  });

  describe('schema_version 校验', () => {
    it('缺失 schema_version 应被拒', () => {
      expect(isGrantsConfig({ grantedPermissions: [] })).toBe(false);
    });

    it('schema_version === "2.0" 应被拒', () => {
      expect(
        isGrantsConfig({ schema_version: '2.0', grantedPermissions: [] }),
      ).toBe(false);
    });

    it('schema_version 为数字 1.0 应被拒', () => {
      expect(
        isGrantsConfig({ schema_version: 1.0, grantedPermissions: [] }),
      ).toBe(false);
    });
  });

  describe('grantedPermissions 校验', () => {
    it('缺失 grantedPermissions 应被拒', () => {
      expect(isGrantsConfig({ schema_version: '1.0' })).toBe(false);
    });

    it('grantedPermissions 不是数组应被拒', () => {
      expect(
        isGrantsConfig({ schema_version: '1.0', grantedPermissions: 'network' }),
      ).toBe(false);
    });

    it('含未知权限字符串应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read', 'filesystem.delete'],
        }),
      ).toBe(false);
    });

    it('含非字符串元素应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: ['network', 42],
        }),
      ).toBe(false);
    });
  });

  describe('comment / audit 校验', () => {
    it('comment 非字符串应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: [],
          comment: 123,
        }),
      ).toBe(false);
    });

    it('audit 非对象应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: [],
          audit: 'alice',
        }),
      ).toBe(false);
    });

    it('audit.grantedBy 非字符串应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: [],
          audit: { grantedBy: 42 },
        }),
      ).toBe(false);
    });

    it('audit.source 非合法枚举值应被拒', () => {
      expect(
        isGrantsConfig({
          schema_version: '1.0',
          grantedPermissions: [],
          audit: { source: 'system' },
        }),
      ).toBe(false);
    });
  });

  describe('类型边界', () => {
    it('null 应被拒', () => {
      expect(isGrantsConfig(null)).toBe(false);
    });

    it('undefined 应被拒', () => {
      expect(isGrantsConfig(undefined)).toBe(false);
    });

    it('数组应被拒', () => {
      expect(isGrantsConfig([])).toBe(false);
    });

    it('基本类型应被拒', () => {
      expect(isGrantsConfig('grant')).toBe(false);
      expect(isGrantsConfig(42)).toBe(false);
      expect(isGrantsConfig(true)).toBe(false);
    });
  });
});

describe('mergeGrants 四层合并', () => {
  describe('空配置 / 单配置', () => {
    it('0 参应返回默认空配置', () => {
      expect(mergeGrants()).toEqual({
        schema_version: '1.0',
        grantedPermissions: [],
      });
    });

    it('单配置应等价于浅拷贝', () => {
      const single: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network', 'filesystem.read'],
        comment: 'only layer',
      };
      const merged = mergeGrants(single);
      expect(merged).toEqual(single);
      // 应该是新对象（不共享引用）
      expect(merged).not.toBe(single);
    });

    it('单配置含重复权限应去重', () => {
      const merged = mergeGrants({
        schema_version: '1.0',
        grantedPermissions: ['network', 'network', 'filesystem.read', 'network'],
      });
      expect(merged.grantedPermissions).toEqual(['network', 'filesystem.read']);
    });
  });

  describe('多层叠加：权限并集去重', () => {
    it('两层无交集 → 并集（保持首次出现顺序）', () => {
      const layer1: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'],
      };
      const layer2: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network'],
      };
      expect(mergeGrants(layer1, layer2).grantedPermissions).toEqual([
        'filesystem.read',
        'network',
      ]);
    });

    it('两层有交集 → 去重并集', () => {
      const layer1: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read', 'network'],
      };
      const layer2: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network', 'env.read'],
      };
      expect(mergeGrants(layer1, layer2).grantedPermissions).toEqual([
        'filesystem.read',
        'network',
        'env.read',
      ]);
    });

    it('四层完整叠加 → 全集去重', () => {
      const layers: GrantsConfig[] = [
        { schema_version: '1.0', grantedPermissions: [] }, // default
        { schema_version: '1.0', grantedPermissions: ['filesystem.read'] }, // user
        { schema_version: '1.0', grantedPermissions: ['network', 'filesystem.read'] }, // project
        { schema_version: '1.0', grantedPermissions: ['child_process'] }, // runtime
      ];
      expect(mergeGrants(...layers).grantedPermissions).toEqual([
        'filesystem.read',
        'network',
        'child_process',
      ]);
    });
  });

  describe('多层叠加：comment / audit last-wins', () => {
    it('comment 由最后一个定义它的层决定', () => {
      const merged = mergeGrants(
        { schema_version: '1.0', grantedPermissions: [], comment: '用户层' },
        { schema_version: '1.0', grantedPermissions: [], comment: '项目层' },
      );
      expect(merged.comment).toBe('项目层');
    });

    it('后层未定义 comment 时不应清空前层 comment', () => {
      const merged = mergeGrants(
        { schema_version: '1.0', grantedPermissions: [], comment: '用户层' },
        { schema_version: '1.0', grantedPermissions: [] },
      );
      expect(merged.comment).toBe('用户层');
    });

    it('audit 整体替换（last-wins，不做深合并）', () => {
      const merged = mergeGrants(
        {
          schema_version: '1.0',
          grantedPermissions: [],
          audit: { grantedBy: 'alice', source: 'user' },
        },
        {
          schema_version: '1.0',
          grantedPermissions: [],
          audit: { grantedBy: 'bob', source: 'project' },
        },
      );
      // 整体替换：alice 不应残留
      expect(merged.audit).toEqual({ grantedBy: 'bob', source: 'project' });
    });

    it('未定义任何 comment / audit 时结果不应包含这些字段', () => {
      const merged = mergeGrants(
        { schema_version: '1.0', grantedPermissions: ['network'] },
        { schema_version: '1.0', grantedPermissions: ['env.read'] },
      );
      expect('comment' in merged).toBe(false);
      expect('audit' in merged).toBe(false);
    });
  });

  describe('schema_version 一致性', () => {
    it('两层 schema_version 不一致应抛 GrantsSchemaVersionMismatchError', () => {
      expect(() =>
        mergeGrants(
          { schema_version: '1.0', grantedPermissions: [] },
          // @ts-expect-error 故意构造非法版本以触发运行时校验
          { schema_version: '2.0', grantedPermissions: [] },
        ),
      ).toThrow(GrantsSchemaVersionMismatchError);
    });

    it('错误信息应包含期望与实际版本', () => {
      try {
        mergeGrants(
          { schema_version: '1.0', grantedPermissions: [] },
          // @ts-expect-error 故意构造非法版本
          { schema_version: '0.9', grantedPermissions: [] },
        );
        // 不应到达这里
        expect.fail('mergeGrants 未抛异常');
      } catch (e) {
        expect(e).toBeInstanceOf(GrantsSchemaVersionMismatchError);
        const err = e as GrantsSchemaVersionMismatchError;
        expect(err.expected).toBe('1.0');
        expect(err.actual).toBe('0.9');
        expect(err.message).toContain('1.0');
        expect(err.message).toContain('0.9');
      }
    });
  });

  describe('结果不变性（不污染入参）', () => {
    it('合并不应修改输入数组', () => {
      const layer1: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network'],
      };
      const layer2: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'],
      };
      const snapshot1 = JSON.parse(JSON.stringify(layer1));
      const snapshot2 = JSON.parse(JSON.stringify(layer2));
      mergeGrants(layer1, layer2);
      expect(layer1).toEqual(snapshot1);
      expect(layer2).toEqual(snapshot2);
    });
  });
});

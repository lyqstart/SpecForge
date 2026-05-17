/**
 * 任务 1.2.3 单元测试：LoadedPlugin 接口、类型守卫、状态转移
 *
 * 覆盖：
 *   - 类型守卫 isLoadedPlugin：合法 / 非法形状（含必填字段缺失、嵌套校验、边界类型）
 *   - 状态转移 canTransition：
 *     * 所有合法转移（按 design 状态机表）
 *     * 所有"* → failed"通配
 *     * 同状态自转（no-op）禁止
 *     * 非法转移（回退、跳跃、failed → 其它）
 *     * 非法状态值（任一参数）
 */

import { describe, it, expect } from 'vitest';

import {
  isLoadedPlugin,
  canTransition,
  LOADED_PLUGIN_STATES,
  type LoadedPlugin,
  type LoadedPluginState,
} from '../src/loaded-plugin';
import type { PluginManifest } from '../src/manifest';
import type { GrantsConfig } from '../src/grants';

// ---------------------------------------------------------------------------
// 工具：构造合法的最小 LoadedPlugin，再按需覆盖字段做反例
// ---------------------------------------------------------------------------

function makeManifest(): PluginManifest {
  return {
    schema_version: '1.0',
    id: 'demo-plugin',
    name: 'Demo Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
  };
}

function makeGrants(): GrantsConfig {
  return {
    schema_version: '1.0',
    grantedPermissions: ['filesystem.read'],
  };
}

function minimal(): LoadedPlugin {
  return {
    schema_version: '1.0',
    manifest: makeManifest(),
    grants: makeGrants(),
    state: 'pending',
    loadedAt: 1747000000000,
    instanceId: 'inst-0001',
  };
}

// ---------------------------------------------------------------------------
// isLoadedPlugin 类型守卫
// ---------------------------------------------------------------------------

describe('isLoadedPlugin 类型守卫', () => {
  describe('合法形状', () => {
    it('最小化（仅必填字段）应通过', () => {
      expect(isLoadedPlugin(minimal())).toBe(true);
    });

    it('含 lastError 的 failed 实例应通过', () => {
      const lp: LoadedPlugin = {
        ...minimal(),
        state: 'failed',
        lastError: {
          code: 'MANIFEST_ERROR',
          message: 'invalid manifest version',
          at: 1747000000123,
        },
      };
      expect(isLoadedPlugin(lp)).toBe(true);
    });

    it('lastError.message 为空字符串也应通过（仅校验类型，不校验语义）', () => {
      const lp: LoadedPlugin = {
        ...minimal(),
        lastError: { code: 'X', message: '', at: 0 },
      };
      expect(isLoadedPlugin(lp)).toBe(true);
    });

    it('五种 state 值都应通过', () => {
      const states: LoadedPluginState[] = ['pending', 'loaded', 'active', 'disabled', 'failed'];
      for (const s of states) {
        expect(isLoadedPlugin({ ...minimal(), state: s })).toBe(true);
      }
    });

    it('loadedAt 为 0 应通过（边界值，等价 1970-01-01）', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: 0 })).toBe(true);
    });
  });

  describe('schema_version 校验', () => {
    it('缺 schema_version 应被拒', () => {
      const m = minimal() as Partial<LoadedPlugin>;
      delete m.schema_version;
      expect(isLoadedPlugin(m)).toBe(false);
    });

    it('schema_version === "2.0" 应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), schema_version: '2.0' })).toBe(false);
    });

    it('schema_version 为数字 1.0 应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), schema_version: 1.0 })).toBe(false);
    });
  });

  describe('manifest / grants 嵌套校验', () => {
    it('manifest 不合法应被拒（缺 entry）', () => {
      const lp = minimal();
      delete (lp.manifest as Partial<PluginManifest>).entry;
      expect(isLoadedPlugin(lp)).toBe(false);
    });

    it('manifest 为 null 应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), manifest: null })).toBe(false);
    });

    it('grants 不合法应被拒（含未知权限）', () => {
      const lp = minimal();
      // @ts-expect-error 故意构造非法权限以触发运行时校验
      lp.grants.grantedPermissions.push('filesystem.delete');
      expect(isLoadedPlugin(lp)).toBe(false);
    });

    it('grants 缺失应被拒', () => {
      const lp = minimal() as Partial<LoadedPlugin>;
      delete lp.grants;
      expect(isLoadedPlugin(lp)).toBe(false);
    });
  });

  describe('state 校验', () => {
    it('state 缺失应被拒', () => {
      const m = minimal() as Partial<LoadedPlugin>;
      delete m.state;
      expect(isLoadedPlugin(m)).toBe(false);
    });

    it('未知 state 字符串应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), state: 'unknown' })).toBe(false);
    });

    it('state 为数字应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), state: 0 })).toBe(false);
    });
  });

  describe('loadedAt 校验', () => {
    it('loadedAt 缺失应被拒', () => {
      const m = minimal() as Partial<LoadedPlugin>;
      delete m.loadedAt;
      expect(isLoadedPlugin(m)).toBe(false);
    });

    it('loadedAt 为字符串应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: '1747000000000' })).toBe(false);
    });

    it('loadedAt 为负数应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: -1 })).toBe(false);
    });

    it('loadedAt 为浮点数应被拒（必须是整数 ms）', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: 1.5 })).toBe(false);
    });

    it('loadedAt 为 NaN 应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: Number.NaN })).toBe(false);
    });

    it('loadedAt 为 Infinity 应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), loadedAt: Number.POSITIVE_INFINITY })).toBe(false);
    });
  });

  describe('instanceId 校验', () => {
    it('instanceId 缺失应被拒', () => {
      const m = minimal() as Partial<LoadedPlugin>;
      delete m.instanceId;
      expect(isLoadedPlugin(m)).toBe(false);
    });

    it('instanceId 为空字符串应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), instanceId: '' })).toBe(false);
    });

    it('instanceId 为非字符串应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), instanceId: 12345 })).toBe(false);
    });
  });

  describe('lastError 校验', () => {
    it('lastError 不是对象应被拒', () => {
      expect(isLoadedPlugin({ ...minimal(), lastError: 'oops' })).toBe(false);
    });

    it('lastError 缺 code 应被拒', () => {
      expect(
        isLoadedPlugin({ ...minimal(), lastError: { message: 'x', at: 0 } }),
      ).toBe(false);
    });

    it('lastError.code 为空字符串应被拒', () => {
      expect(
        isLoadedPlugin({ ...minimal(), lastError: { code: '', message: 'x', at: 0 } }),
      ).toBe(false);
    });

    it('lastError.message 非字符串应被拒', () => {
      expect(
        isLoadedPlugin({ ...minimal(), lastError: { code: 'E', message: 42, at: 0 } }),
      ).toBe(false);
    });

    it('lastError.at 为负数应被拒', () => {
      expect(
        isLoadedPlugin({ ...minimal(), lastError: { code: 'E', message: 'x', at: -1 } }),
      ).toBe(false);
    });
  });

  describe('类型边界', () => {
    it('null 应被拒', () => {
      expect(isLoadedPlugin(null)).toBe(false);
    });

    it('undefined 应被拒', () => {
      expect(isLoadedPlugin(undefined)).toBe(false);
    });

    it('数组应被拒', () => {
      expect(isLoadedPlugin([])).toBe(false);
      expect(isLoadedPlugin([minimal()])).toBe(false);
    });

    it('基本类型应被拒', () => {
      expect(isLoadedPlugin('plugin')).toBe(false);
      expect(isLoadedPlugin(42)).toBe(false);
      expect(isLoadedPlugin(true)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 状态转移：canTransition
// ---------------------------------------------------------------------------

describe('canTransition 状态转移', () => {
  describe('合法转移（按 design 状态机表）', () => {
    const legal: Array<[LoadedPluginState, LoadedPluginState]> = [
      ['pending', 'loaded'],
      ['pending', 'failed'],
      ['loaded', 'active'],
      ['loaded', 'disabled'],
      ['loaded', 'failed'],
      ['active', 'disabled'],
      ['active', 'failed'],
      ['disabled', 'active'],
      ['disabled', 'failed'],
    ];
    for (const [from, to] of legal) {
      it(`${from} → ${to} 应允许`, () => {
        expect(canTransition(from, to)).toBe(true);
      });
    }
  });

  describe('* → failed 通配', () => {
    it('所有非 failed 状态都可进入 failed', () => {
      for (const s of LOADED_PLUGIN_STATES) {
        if (s === 'failed') continue;
        expect(canTransition(s, 'failed')).toBe(true);
      }
    });
  });

  describe('同状态自转禁止', () => {
    it('每个状态自转都应禁止', () => {
      for (const s of LOADED_PLUGIN_STATES) {
        expect(canTransition(s, s)).toBe(false);
      }
    });
  });

  describe('failed 是终止态', () => {
    it('failed 不能转到任何其它状态', () => {
      for (const s of LOADED_PLUGIN_STATES) {
        if (s === 'failed') continue;
        expect(canTransition('failed', s)).toBe(false);
      }
    });
  });

  describe('非法转移（回退 / 跳跃）', () => {
    const illegal: Array<[LoadedPluginState, LoadedPluginState]> = [
      // 回退到 pending
      ['loaded', 'pending'],
      ['active', 'pending'],
      ['disabled', 'pending'],
      // 跳过 loaded 直接到 active/disabled
      ['pending', 'active'],
      ['pending', 'disabled'],
      // 状态回退
      ['active', 'loaded'],
      ['disabled', 'loaded'],
    ];
    for (const [from, to] of illegal) {
      it(`${from} → ${to} 应禁止`, () => {
        expect(canTransition(from, to)).toBe(false);
      });
    }
  });

  describe('非法状态值', () => {
    it('未知 from 状态应返回 false', () => {
      expect(
        canTransition('unknown' as LoadedPluginState, 'loaded'),
      ).toBe(false);
    });

    it('未知 to 状态应返回 false', () => {
      expect(
        canTransition('pending', 'unknown' as LoadedPluginState),
      ).toBe(false);
    });

    it('两个都是未知状态应返回 false', () => {
      expect(
        canTransition('foo' as LoadedPluginState, 'bar' as LoadedPluginState),
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 边界：LOADED_PLUGIN_STATES 常量集合
// ---------------------------------------------------------------------------

describe('LOADED_PLUGIN_STATES 常量', () => {
  it('应包含全部 5 种合法状态', () => {
    expect(LOADED_PLUGIN_STATES.size).toBe(5);
    for (const s of ['pending', 'loaded', 'active', 'disabled', 'failed'] as LoadedPluginState[]) {
      expect(LOADED_PLUGIN_STATES.has(s)).toBe(true);
    }
  });
});

/**
 * 任务 1.2.1 单元测试：PluginManifest 接口与类型守卫
 *
 * 覆盖：
 *   - 合法 manifest（最小化 + 完整）通过验证
 *   - 缺 schema_version / schema_version 错值 → 拒绝
 *   - version 字段的 semver 校验（合法/非法多组）
 *   - 必填字段（id / name / entry）形状校验
 *   - 可选字段（permissions / dependencies / metadata）形状校验
 *   - 类型边界（null / undefined / 数组 / 基本类型）
 */

import { describe, it, expect } from 'vitest';

import {
  isPluginManifest,
  isValidSemver,
  type PluginManifest,
} from '../src/manifest';

// ---------------------------------------------------------------------------
// 工具：构造一个合法的最小 manifest，再按需覆盖字段做反例
// ---------------------------------------------------------------------------

function minimal(): PluginManifest {
  return {
    schema_version: '1.0',
    id: 'demo-plugin',
    name: 'Demo Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
  };
}

describe('PluginManifest 接口 / isPluginManifest', () => {
  describe('合法 manifest', () => {
    it('最小化 manifest（仅必填字段）应通过', () => {
      expect(isPluginManifest(minimal())).toBe(true);
    });

    it('完整 manifest（含所有可选字段）应通过', () => {
      const full: PluginManifest = {
        schema_version: '1.0',
        id: 'specforge-github',
        name: 'SpecForge GitHub Integration',
        version: '2.3.4-beta.1+build.42',
        entry: './dist/index.js',
        permissions: ['network', 'filesystem.read'],
        dependencies: {
          'specforge-core': '^6.0.0',
          'auth-helper': '~1.2.0',
        },
        metadata: {
          description: 'GitHub API integration',
          author: 'SpecForge Team',
          license: 'MIT',
        },
      };
      expect(isPluginManifest(full)).toBe(true);
    });

    it('permissions 为空数组应通过', () => {
      expect(isPluginManifest({ ...minimal(), permissions: [] })).toBe(true);
    });

    it('dependencies 为空对象应通过', () => {
      expect(isPluginManifest({ ...minimal(), dependencies: {} })).toBe(true);
    });

    it('metadata 为空对象应通过', () => {
      expect(isPluginManifest({ ...minimal(), metadata: {} })).toBe(true);
    });
  });

  describe('schema_version 校验', () => {
    it('缺 schema_version 应被拒', () => {
      const m = minimal() as Partial<PluginManifest>;
      delete m.schema_version;
      expect(isPluginManifest(m)).toBe(false);
    });

    it('schema_version === "2.0" 应被拒', () => {
      expect(isPluginManifest({ ...minimal(), schema_version: '2.0' })).toBe(false);
    });

    it('schema_version === 1.0（数字）应被拒', () => {
      expect(isPluginManifest({ ...minimal(), schema_version: 1.0 })).toBe(false);
    });

    it('schema_version === ""（空字符串）应被拒', () => {
      expect(isPluginManifest({ ...minimal(), schema_version: '' })).toBe(false);
    });
  });

  describe('version 字段 semver 校验', () => {
    const valid = [
      '0.0.0',
      '1.0.0',
      '10.20.30',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-0.3.7',
      '1.0.0-x.7.z.92',
      '1.0.0+20130313144700',
      '1.0.0-beta+exp.sha.5114',
      '1.0.0-rc.1+build.1',
    ];
    const invalid = [
      '1',
      '1.0',
      '1.0.0.0',
      'v1.0.0', // 带 v 前缀不合规
      '01.0.0', // 前导 0 不合规
      '1.0.0-', // 悬空预发布
      '1.0.0-+build', // 空预发布
      'latest',
      '',
      ' 1.0.0',
      '1.0.0 ',
    ];

    for (const v of valid) {
      it(`合法 semver "${v}" 应通过`, () => {
        expect(isValidSemver(v)).toBe(true);
        expect(isPluginManifest({ ...minimal(), version: v })).toBe(true);
      });
    }

    for (const v of invalid) {
      it(`非法 semver "${v}" 应被拒`, () => {
        expect(isValidSemver(v)).toBe(false);
        expect(isPluginManifest({ ...minimal(), version: v })).toBe(false);
      });
    }

    it('version 不是字符串（数字）应被拒', () => {
      expect(isPluginManifest({ ...minimal(), version: 1 })).toBe(false);
    });
  });

  describe('必填字段形状校验', () => {
    it('id 缺失应被拒', () => {
      const m = minimal() as Partial<PluginManifest>;
      delete m.id;
      expect(isPluginManifest(m)).toBe(false);
    });

    it('id 为空字符串应被拒', () => {
      expect(isPluginManifest({ ...minimal(), id: '' })).toBe(false);
    });

    it('id 为非字符串应被拒', () => {
      expect(isPluginManifest({ ...minimal(), id: 123 })).toBe(false);
    });

    it('name 缺失应被拒', () => {
      const m = minimal() as Partial<PluginManifest>;
      delete m.name;
      expect(isPluginManifest(m)).toBe(false);
    });

    it('entry 缺失应被拒', () => {
      const m = minimal() as Partial<PluginManifest>;
      delete m.entry;
      expect(isPluginManifest(m)).toBe(false);
    });

    it('entry 为空字符串应被拒', () => {
      expect(isPluginManifest({ ...minimal(), entry: '' })).toBe(false);
    });
  });

  describe('可选字段形状校验', () => {
    it('permissions 不是数组应被拒', () => {
      expect(isPluginManifest({ ...minimal(), permissions: 'network' })).toBe(false);
    });

    it('permissions 含非字符串元素应被拒', () => {
      expect(isPluginManifest({ ...minimal(), permissions: ['network', 42] })).toBe(false);
    });

    it('dependencies 不是对象应被拒', () => {
      expect(isPluginManifest({ ...minimal(), dependencies: ['core'] })).toBe(false);
    });

    it('dependencies 值为非字符串应被拒', () => {
      expect(
        isPluginManifest({ ...minimal(), dependencies: { core: 1 } as unknown as Record<string, string> })
      ).toBe(false);
    });

    it('metadata 不是对象应被拒', () => {
      expect(isPluginManifest({ ...minimal(), metadata: 'meta' })).toBe(false);
    });

    it('metadata.description 非字符串应被拒', () => {
      expect(
        isPluginManifest({ ...minimal(), metadata: { description: 42 } as unknown as Record<string, string> })
      ).toBe(false);
    });

    it('metadata.author 非字符串应被拒', () => {
      expect(
        isPluginManifest({ ...minimal(), metadata: { author: false } as unknown as Record<string, string> })
      ).toBe(false);
    });

    it('metadata.license 非字符串应被拒', () => {
      expect(
        isPluginManifest({ ...minimal(), metadata: { license: null } as unknown as Record<string, string> })
      ).toBe(false);
    });
  });

  describe('类型边界', () => {
    it('null 应被拒', () => {
      expect(isPluginManifest(null)).toBe(false);
    });

    it('undefined 应被拒', () => {
      expect(isPluginManifest(undefined)).toBe(false);
    });

    it('数组应被拒', () => {
      expect(isPluginManifest([])).toBe(false);
      expect(isPluginManifest([minimal()])).toBe(false);
    });

    it('基本类型应被拒', () => {
      expect(isPluginManifest('manifest')).toBe(false);
      expect(isPluginManifest(42)).toBe(false);
      expect(isPluginManifest(true)).toBe(false);
    });
  });
});

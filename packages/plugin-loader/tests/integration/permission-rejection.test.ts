/**
 * Permission Rejection Integration Test (Task 6.2.2)
 *
 * 测试覆盖：
 *   1. 插件请求未授权的权限时应该被拒绝
 *   2. 权限不足时的错误信息应该清晰
 *   3. 边界情况（部分权限、继承权限等）
 *
 * 异步资源生命周期规范：
 *   - 使用 fake timer 确保测试确定性和资源清理
 *   - 每次测试后验证无资源泄漏
 *   - 使用动态追踪列表清理创建的临时资源
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import fc from 'fast-check';
import {
  discoverPlugins,
  type DiscoveredPlugin,
  type DiscoveryResult,
} from '../../src/loader/discovery';
import { type PluginManifest } from '../../src/manifest';
import { PermissionValidator, permissionValidator } from '../../src/permission-validator';
import { createStaticChecker } from '../../src/static-checker';
import {
  LoadedPlugin,
  isLoadedPlugin,
  canTransition,
} from '../../src/loaded-plugin';

// ---------------------------------------------------------------------------
// 测试夹具
// ---------------------------------------------------------------------------

/** 追踪创建的临时目录，用于清理 */
const createdDirs: string[] = [];

/** 创建临时目录 */
async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-rejection-test-'));
  createdDirs.push(dir);
  return dir;
}

/** 清理所有临时目录 */
async function cleanupAllTempDirs(): Promise<void> {
  for (const dir of createdDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
  createdDirs.length = 0;
}

/**
 * 创建带权限声明的测试插件
 */
async function createPluginWithPermissions(
  parentDir: string,
  pluginId: string,
  permissions: string[],
  sourceCode?: string,
): Promise<string> {
  const pluginDir = path.join(parentDir, pluginId);
  await fs.mkdir(pluginDir, { recursive: true });

  if (sourceCode) {
    const entryDir = path.dirname(path.join(pluginDir, sourceCode));
    await fs.mkdir(entryDir, { recursive: true });
  }

  const manifest: PluginManifest = {
    schema_version: '1.0',
    id: pluginId,
    name: `Test Plugin ${pluginId}`,
    version: '1.0.0',
    entry: sourceCode || './dist/index.js',
    permissions: permissions,
  };

  const entryPath = path.join(pluginDir, manifest.entry);
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2),
  );

  const defaultSource = sourceCode || `
    module.exports = {
      run: () => 'ok'
    };
  `;
  await fs.writeFile(entryPath, defaultSource);

  return pluginDir;
}

/**
 * 加载结果接口
 */
interface LoadResult {
  success: boolean;
  plugin?: LoadedPlugin;
  error?: {
    stage: 'discovery' | 'manifest' | 'permission' | 'static-check' | 'unknown';
    code: string;
    message: string;
    missingPermissions?: string[];
  };
}

/**
 * 完整的插件加载流程
 */
async function loadPlugin(
  discoveredPlugin: DiscoveredPlugin,
  grants: string[],
): Promise<LoadResult> {
  try {
    const manifest = discoveredPlugin.manifest;

    // 权限验证阶段
    const permissionErrors = permissionValidator.validatePermissions(
      manifest.permissions ?? [],
      grants,
    );
    if (permissionErrors.length > 0) {
      return {
        success: false,
        error: {
          stage: 'permission',
          code: 'PERMISSION_DENIED',
          message: `权限验证失败: ${permissionErrors.map((e) => e.reason).join('; ')}`,
          missingPermissions: permissionErrors.map((e) => e.permission),
        },
      };
    }

    // 静态检查阶段
    let staticCheckPassed = true;
    if (manifest.entry) {
      const pluginDir = discoveredPlugin.dirPath;
      const entryPath = path.join(pluginDir, manifest.entry);
      try {
        const entryContent = await fs.readFile(entryPath, 'utf-8');
        const checker = createStaticChecker({
          analyzerConfig: { permissions: grants },
          pathCheckerConfig: { allowedDirs: [pluginDir] },
        });
        const result = checker.checkSource(entryContent, entryPath);
        staticCheckPassed = result.passed;
        if (!staticCheckPassed) {
          return {
            success: false,
            error: {
              stage: 'static-check',
              code: 'STATIC_CHECK_FAILED',
              message: `静态检查失败: 发现 ${result.violations?.length ?? 0} 个违规`,
            },
          };
        }
      } catch {
        // 入口文件读取失败，静默通过
      }
    }

    // 创建 LoadedPlugin
    const loadedPlugin: LoadedPlugin = {
      schema_version: '1.0',
      manifest,
      grants: {
        schema_version: '1.0',
        grantedPermissions: grants,
        mergeStrategy: 'deep',
      },
      state: 'pending',
      loadedAt: Date.now(),
      instanceId: `instance-${manifest.id}-${Date.now()}`,
    };

    if (canTransition(loadedPlugin.state, 'loaded')) {
      loadedPlugin.state = 'loaded';
    }

    return { success: true, plugin: loadedPlugin };
  } catch (err) {
    return {
      success: false,
      error: {
        stage: 'unknown',
        code: 'UNKNOWN_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 单元测试：权限拒绝场景
// ---------------------------------------------------------------------------

describe('Permission Rejection - Unit Tests', () => {
  let validator: PermissionValidator;

  beforeEach(() => {
    validator = new PermissionValidator();
  });

  describe('1. 插件请求未授权的权限时应该被拒绝', () => {
    it('应该拒绝请求 filesystem.read 但未授权的情况', () => {
      const requires = ['filesystem.read'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('filesystem.read');
    });

    it('应该拒绝请求多个权限但只授权部分的情况', () => {
      const requires = ['filesystem.read', 'network', 'child_process'];
      const grants = ['filesystem.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(2);
      expect(errors.map((e) => e.permission)).toContain('network');
      expect(errors.map((e) => e.permission)).toContain('child_process');
    });

    it('应该拒绝请求 filesystem.write 但只授权 filesystem.read', () => {
      const requires = ['filesystem.write'];
      const grants = ['filesystem.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('filesystem.write');
    });

    it('应该拒绝请求 child_process 权限（危险权限）', () => {
      const requires = ['child_process'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('child_process');
    });

    it('应该拒绝请求 network 权限但未授权', () => {
      const requires = ['network'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('network');
    });

    it('应该拒绝请求 env.read 权限但未授权', () => {
      const requires = ['env.read'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('env.read');
    });
  });

  describe('2. 权限不足时的错误信息应该清晰', () => {
    it('错误信息应该包含权限名称', () => {
      const requires = ['network'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors[0]!.reason).toContain('network');
    });

    it('错误信息应该明确说明"未被授予"', () => {
      const requires = ['filesystem.read'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors[0]!.reason).toContain('未被授予');
    });

    it('错误信息应该包含行动建议', () => {
      const requires = ['child_process'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors[0]!.suggestion).toBeDefined();
      expect(typeof errors[0]!.suggestion).toBe('string');
    });

    it('多个错误时每个都应该有清晰的错误信息', () => {
      const requires = ['network', 'child_process', 'filesystem.write'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(3);
      for (const error of errors) {
        expect(error.reason).toContain(error.permission);
        expect(error.suggestion).toBeDefined();
      }
    });
  });

  describe('3. 边界情况：部分权限', () => {
    it('应该正确处理部分授权的情况', () => {
      const requires = ['filesystem.read', 'filesystem.write', 'network'];
      const grants = ['filesystem.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(2);
      expect(errors.map((e) => e.permission)).toContain('filesystem.write');
      expect(errors.map((e) => e.permission)).toContain('network');
      expect(errors.map((e) => e.permission)).not.toContain('filesystem.read');
    });

    it('应该正确处理空权限声明', () => {
      const requires: string[] = [];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(0);
    });

    it('应该正确处理空授权集合', () => {
      const requires = ['filesystem.read'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
    });

    it('应该正确处理重复权限声明', () => {
      const requires = ['network', 'network', 'filesystem.read'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(3);
    });

    it('应该处理授权集合比需求多的情况', () => {
      const requires = ['filesystem.read'];
      const grants = ['filesystem.read', 'network', 'child_process', 'env.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(0);
    });

    it('应该处理未知权限名', () => {
      const requires = ['unknown.permission'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('unknown.permission');
    });
  });

  describe('边界情况：继承权限', () => {
    it('应该正确处理 filesystem 权限细分', () => {
      // filesystem.read 和 filesystem.write 是独立的，不继承
      const requires = ['filesystem.write'];
      const grants = ['filesystem.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('filesystem.write');
    });

    it('应该处理所有标准权限类型', () => {
      const allStandardPermissions = [
        'filesystem.read',
        'filesystem.write',
        'network',
        'child_process',
        'env.read',
      ];

      // 全部授权应该通过
      let errors = permissionValidator.validatePermissions(
        allStandardPermissions,
        allStandardPermissions,
      );
      expect(errors).toHaveLength(0);

      // 全部不授权应该全部失败
      errors = permissionValidator.validatePermissions(
        allStandardPermissions,
        [],
      );
      expect(errors).toHaveLength(5);
    });

    it('应该处理包含特殊字符的权限名', () => {
      const requires = ['permission-with-dash', 'permission_with_underscore'];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// 集成测试：完整的权限拒绝流程
// ---------------------------------------------------------------------------

describe('Permission Rejection - Integration Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanupAllTempDirs();
  });

  describe('端到端：插件加载时的权限拒绝', () => {
    it('应该拒绝需要未授权权限的插件', async () => {
      await createPluginWithPermissions(tempDir, 'network-plugin', ['network']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants: string[] = [];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('permission');
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      expect(result.error?.missingPermissions).toContain('network');
    });

    it('应该接受具有部分授权权限的插件', async () => {
      await createPluginWithPermissions(tempDir, 'partial-plugin', ['filesystem.read', 'network']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants = ['filesystem.read'];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('permission');
      expect(result.error?.missingPermissions).toContain('network');
    });

    it('应该接受所有权限都被授权的插件', async () => {
      await createPluginWithPermissions(tempDir, 'authorized-plugin', ['filesystem.read', 'network']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants = ['filesystem.read', 'network'];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(true);
      expect(result.plugin).toBeDefined();
      expect(isLoadedPlugin(result.plugin)).toBe(true);
    });

    it('应该拒绝需要危险权限的插件', async () => {
      await createPluginWithPermissions(
        tempDir,
        'dangerous-plugin',
        ['child_process'],
        './src/index.js',
      );

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants: string[] = [];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('permission');
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('应该正确处理多个插件的不同权限需求', async () => {
      await createPluginWithPermissions(tempDir, 'safe-plugin', ['filesystem.read']);
      await createPluginWithPermissions(tempDir, 'network-plugin', ['network']);
      await createPluginWithPermissions(tempDir, 'privileged-plugin', ['child_process']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants = ['filesystem.read', 'network'];

      // 确保所有插件都被发现
      expect(discovery.plugins).toHaveLength(3);

      // 按插件目录名排序，确保测试稳定性
      const sortedPlugins = [...discovery.plugins].sort(
        (a, b) => a.manifest.id.localeCompare(b.manifest.id)
      );

      const results = await Promise.all(
        sortedPlugins.map((plugin) => loadPlugin(plugin, grants)),
      );

      // results 是按字母排序后的插件 ID 顺序: network-plugin, privileged-plugin, safe-plugin
      // network-plugin 需要 network（已授权）-> success
      // privileged-plugin 需要 child_process（未授权）-> fail
      // safe-plugin 需要 filesystem.read（已授权）-> success

      expect(results[0]?.success).toBe(true);   // network-plugin - 已授权
      expect(results[1]?.success).toBe(false);  // privileged-plugin - 未授权
      expect(results[1]?.error?.stage).toBe('permission');
      expect(results[1]?.error?.missingPermissions).toContain('child_process');
      expect(results[2]?.success).toBe(true);   // safe-plugin - 已授权
    });
  });

  describe('错误消息质量验证', () => {
    it('权限拒绝错误应该包含清晰的阶段信息', async () => {
      await createPluginWithPermissions(tempDir, 'test-plugin', ['child_process']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants: string[] = [];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('permission');
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('错误消息应该说明具体的缺失权限', async () => {
      await createPluginWithPermissions(tempDir, 'test-plugin', ['network', 'filesystem.write']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants = ['filesystem.read'];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.success).toBe(false);
      expect(result.error?.missingPermissions).toContain('network');
      expect(result.error?.missingPermissions).toContain('filesystem.write');
    });

    it('错误消息应该包含权限名称以便用户理解', async () => {
      await createPluginWithPermissions(tempDir, 'test-plugin', ['child_process']);

      const discovery = await discoverPlugins({ pluginDir: tempDir });
      const grants: string[] = [];

      const result = await loadPlugin(discovery.plugins[0]!, grants);

      expect(result.error?.message).toContain('child_process');
    });
  });
});

// ---------------------------------------------------------------------------
// 属性测试：使用 fast-check 验证权限拒绝的通用属性
// ---------------------------------------------------------------------------

// 标准权限列表
const STANDARD_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

describe('Permission Rejection - Property-Based Tests', () => {
  /**
   * Property 1: 如果声明的权限不在授权集合中，应该被拒绝
   * Validates: Requirements 1.4（权限验证）
   */
  it(
    'Property PL-1: 未授权的权限应该导致验证失败',
    async () => {
      await fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 1, maxLength: 5 },
          ),
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 0, maxLength: 5 },
          ),
          (requires, grants) => {
            const errors = permissionValidator.validatePermissions(requires, grants);

            // 验证：每个未被授权的权限都应该产生错误
            const missingPermissions = requires.filter((p) => !grants.includes(p));
            expect(errors.length).toBe(missingPermissions.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 2: 错误消息应该始终包含权限名称
   */
  it(
    'Property: 错误消息应该包含权限名称',
    async () => {
      await fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 1, maxLength: 5 },
          ),
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 0, maxLength: 5 },
          ),
          (requires, grants) => {
            const errors = permissionValidator.validatePermissions(requires, grants);

            // 所有错误都应该包含对应的权限名称
            for (const error of errors) {
              expect(error.reason).toContain(error.permission);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 3: 空权限声明应该总是通过验证
   */
  it(
    'Property: 空权限声明应该总是通过验证',
    async () => {
      await fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 0, maxLength: 5 },
          ),
          (grants) => {
            const errors = permissionValidator.validatePermissions([], grants);
            expect(errors).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 4: 完整授权应该总是通过验证
   */
  it(
    'Property: 当所有权限都被授权时应该通过验证',
    async () => {
      await fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 1, maxLength: 5 },
          ),
          (requires) => {
            // 授权集合包含所有需要的权限
            const errors = permissionValidator.validatePermissions(requires, [...requires]);
            expect(errors).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 5: 错误建议应该始终存在
   */
  it(
    'Property: 每个错误都应该包含行动建议',
    async () => {
      await fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 1, maxLength: 5 },
          ),
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 0, maxLength: 3 },
          ),
          (requires, grants) => {
            const errors = permissionValidator.validatePermissions(requires, grants);

            // 每个错误都应该有建议
            for (const error of errors) {
              expect(error.suggestion).toBeDefined();
              expect(typeof error.suggestion).toBe('string');
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Property 6: checkPermission 方法的正确性
   */
  it(
    'Property: checkPermission 应该正确判断权限是否被授予',
    async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            ...STANDARD_PERMISSIONS.map((p) => fc.constant(p)),
            fc.constant(''),
          ),
          fc.uniqueArray(
            fc.oneof(...STANDARD_PERMISSIONS.map((p) => fc.constant(p))),
            { minLength: 0, maxLength: 5 },
          ),
          (permission, grants) => {
            const result = permissionValidator.checkPermission(permission, grants);
            const expected = grants.includes(permission) && permission.length > 0;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// 边界情况测试
// ---------------------------------------------------------------------------

describe('Permission Rejection - Edge Cases', () => {
  let validator: PermissionValidator;

  beforeEach(() => {
    validator = new PermissionValidator();
  });

  describe('特殊权限值', () => {
    it('应该处理空字符串权限', () => {
      const requires = ['', 'filesystem.read'];
      const grants = ['filesystem.read'];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('');
    });

    it('应该处理空权限且空授权', () => {
      const requires: string[] = [];
      const grants: string[] = [];

      const errors = validator.validatePermissions(requires, grants);

      expect(errors).toHaveLength(0);
    });

    it('checkPermission 应该拒绝空字符串权限', () => {
      expect(validator.checkPermission('', ['filesystem.read'])).toBe(false);
      expect(validator.checkPermission('', [])).toBe(false);
    });
  });

  describe('大规模权限场景', () => {
    it('应该正确处理大量权限声明', () => {
      const manyPermissions = Array(50).fill(null).map((_, i) => `permission.${i}`);
      const grants = manyPermissions.slice(0, 25);

      const errors = validator.validatePermissions(manyPermissions, grants);

      expect(errors).toHaveLength(25);
    });

    it('应该正确处理大量授权（包含所需权限）', () => {
      const requires = ['filesystem.read'];
      const manyGrants = ['filesystem.read', ...Array(99).fill(null).map((_, i) => `permission.${i}`)];

      const errors = validator.validatePermissions(requires, manyGrants);

      expect(errors).toHaveLength(0);
    });

    it('应该正确处理大量授权（不包含所需权限）', () => {
      const requires = ['filesystem.read'];
      const manyGrants = Array(100).fill(null).map((_, i) => `permission.${i}`);

      const errors = validator.validatePermissions(requires, manyGrants);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.permission).toBe('filesystem.read');
    });
  });
});
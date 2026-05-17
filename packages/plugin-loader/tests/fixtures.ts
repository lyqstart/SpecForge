/**
 * 测试 Fixtures 和辅助函数
 * 
 * 提供：
 * - 标准的测试数据工厂函数
 * - 常用的 mock 对象
 * - 测试环境初始化工具
 */

import type { PluginManifest, GrantsConfig, LoadedPlugin } from '../src/types';
import { randomUUID } from 'crypto';

/**
 * 创建最小化的合法 PluginManifest
 * 用于快速构造测试数据
 */
export function createMinimalManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    schema_version: '1.0',
    id: `test-plugin-${randomUUID().slice(0, 8)}`,
    name: 'Test Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
    ...overrides,
  };
}

/**
 * 创建完整的 PluginManifest（包含所有可选字段）
 */
export function createFullManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    schema_version: '1.0',
    id: `test-plugin-${randomUUID().slice(0, 8)}`,
    name: 'Full Test Plugin',
    version: '2.3.4-beta.1+build.42',
    entry: './dist/index.js',
    requires: ['filesystem.read', 'network'],
    description: 'A comprehensive test plugin',
    author: 'Test Suite',
    compatible: '^6.0.0',
    dependencies: [
      {
        type: 'plugin',
        id: 'core-plugin',
        version: '^1.0.0',
      },
    ],
    ...overrides,
  };
}

/**
 * 创建 GrantsConfig（授权配置）
 */
export function createGrantsConfig(overrides?: Partial<GrantsConfig>): GrantsConfig {
  return {
    schema_version: '1.0',
    grants: ['filesystem.read', 'env.read'],
    plugins: {},
    ...overrides,
  };
}

/**
 * 创建 LoadedPlugin（已加载插件实例）
 */
export function createLoadedPlugin(overrides?: Partial<LoadedPlugin>): LoadedPlugin {
  const manifest = createMinimalManifest();
  return {
    id: manifest.id,
    version: manifest.version,
    manifest,
    entryPath: '/test/plugins/test-plugin/dist/index.js',
    module: {},
    loadedAt: Date.now(),
    lastUsedAt: Date.now(),
    stats: {
      loadCount: 1,
      errorCount: 0,
      totalExecutionTimeMs: 0,
    },
    ...overrides,
  };
}

/**
 * 创建包含禁止 API 的源码（用于静态检查测试）
 */
export function createSourceWithForbiddenAPI(apiType: 'child_process' | 'fs_escape' | 'network'): string {
  switch (apiType) {
    case 'child_process':
      return `
        import { exec } from 'child_process';
        export function runCommand(cmd: string) {
          exec(cmd, (err, stdout) => {
            console.log(stdout);
          });
        }
      `;
    case 'fs_escape':
      return `
        import { readFileSync } from 'fs';
        export function readConfig() {
          return readFileSync('../../../../../../etc/passwd', 'utf-8');
        }
      `;
    case 'network':
      return `
        import http from 'http';
        export function fetchData(url: string) {
          http.get(url, (res) => {
            console.log(res.statusCode);
          });
        }
      `;
  }
}

/**
 * 创建安全的源码（通过静态检查）
 */
export function createSafeSource(): string {
  return `
    export function add(a: number, b: number): number {
      return a + b;
    }
    
    export function greet(name: string): string {
      return \`Hello, \${name}!\`;
    }
  `;
}

/**
 * 创建临时测试目录结构
 * 返回目录路径和清理函数
 */
export async function createTempPluginDir(manifest?: Partial<PluginManifest>): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  // 这是一个占位符实现
  // 实际实现需要依赖文件系统操作
  const dir = `/tmp/test-plugin-${randomUUID()}`;
  return {
    dir,
    cleanup: async () => {
      // 清理临时目录
    },
  };
}

/**
 * 创建 mock 的 Event Bus
 */
export function createMockEventBus() {
  const events: Array<{ category: string; action: string; [key: string]: unknown }> = [];

  return {
    emit: (event: { category: string; action: string; [key: string]: unknown }) => {
      events.push(event);
    },
    getEvents: () => [...events],
    clear: () => {
      events.length = 0;
    },
  };
}

/**
 * 创建 mock 的 Configuration Subsystem
 */
export function createMockConfigSystem() {
  let config: Record<string, unknown> = {};

  return {
    get: (key: string) => config[key],
    set: (key: string, value: unknown) => {
      config[key] = value;
    },
    getAll: () => ({ ...config }),
    clear: () => {
      config = {};
    },
  };
}

/**
 * 创建 mock 的 Tool Registry
 */
export function createMockToolRegistry() {
  const tools: Map<string, unknown> = new Map();

  return {
    register: (id: string, tool: unknown) => {
      tools.set(id, tool);
    },
    get: (id: string) => tools.get(id),
    list: () => Array.from(tools.keys()),
    clear: () => {
      tools.clear();
    },
  };
}

/**
 * 断言辅助函数：验证权限声明
 */
export function assertPermissionDeclared(manifest: PluginManifest, permission: string): boolean {
  return manifest.requires?.includes(permission) ?? false;
}

/**
 * 断言辅助函数：验证权限被授权
 */
export function assertPermissionGranted(grants: GrantsConfig, permission: string): boolean {
  return grants.grants.includes(permission);
}

/**
 * 断言辅助函数：验证权限被授权且已声明
 */
export function assertPermissionAuthorized(
  manifest: PluginManifest,
  grants: GrantsConfig,
  permission: string
): boolean {
  return assertPermissionDeclared(manifest, permission) && assertPermissionGranted(grants, permission);
}

/**
 * 创建测试用的随机权限集合
 */
export function createRandomPermissions(count: number = 3): string[] {
  const allPermissions = [
    'filesystem.read',
    'filesystem.write',
    'network',
    'child_process',
    'env.read',
  ];
  const shuffled = [...allPermissions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, allPermissions.length));
}

/**
 * 创建测试用的随机依赖
 */
export function createRandomDependencies(count: number = 2): PluginManifest['dependencies'] {
  const deps: PluginManifest['dependencies'] = [];
  for (let i = 0; i < count; i++) {
    deps.push({
      type: Math.random() > 0.5 ? 'plugin' : 'library',
      id: `dep-${i}`,
      version: `^${Math.floor(Math.random() * 10)}.0.0`,
    });
  }
  return deps;
}

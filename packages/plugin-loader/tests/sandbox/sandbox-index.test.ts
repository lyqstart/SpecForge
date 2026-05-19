/**
 * 沙箱接口类型守卫单元测试（任务 9.2.4 编写沙箱骨架测试）
 *
 * 测试 sandbox/index.ts 中定义的类型守卫和常量：
 *   - isResourceLimits
 *   - isFSRule / isFSWhitelist
 *   - isNetworkRule / isNetworkWhitelist
 *   - isSandboxHandle
 *   - isSandboxOptions
 *   - isSandboxExecuteResult
 *   - createDefaultFSWhitelist
 *   - createDefaultNetworkWhitelist
 *   - SANDBOX_STATUSES / SANDBOX_SCHEMA_VERSION
 */

import { describe, it, expect } from 'vitest';
import {
  isResourceLimits,
  isFSRule,
  isFSWhitelist,
  isNetworkRule,
  isNetworkWhitelist,
  isSandboxHandle,
  isSandboxOptions,
  isSandboxExecuteResult,
  createDefaultFSWhitelist,
  createDefaultNetworkWhitelist,
  SANDBOX_STATUSES,
  SANDBOX_SCHEMA_VERSION,
  DEFAULT_RESOURCE_LIMITS,
} from '../../src/sandbox/index';

// ---------------------------------------------------------------------------
// 常量测试
// ---------------------------------------------------------------------------

describe('SANDBOX_SCHEMA_VERSION', () => {
  it('should be 1.0', () => {
    expect(SANDBOX_SCHEMA_VERSION).toBe('1.0');
  });
});

describe('SANDBOX_STATUSES', () => {
  it('should contain all valid statuses', () => {
    expect(SANDBOX_STATUSES.has('created')).toBe(true);
    expect(SANDBOX_STATUSES.has('running')).toBe(true);
    expect(SANDBOX_STATUSES.has('terminated')).toBe(true);
    expect(SANDBOX_STATUSES.has('error')).toBe(true);
  });

  it('should not contain invalid statuses', () => {
    expect(SANDBOX_STATUSES.has('unknown' as any)).toBe(false);
    expect(SANDBOX_STATUSES.has('stopped' as any)).toBe(false);
  });
});

describe('DEFAULT_RESOURCE_LIMITS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_RESOURCE_LIMITS.memoryLimitMB).toBe(512);
    expect(DEFAULT_RESOURCE_LIMITS.cpuTimeLimitSec).toBe(30);
    expect(DEFAULT_RESOURCE_LIMITS.timeoutMs).toBe(60000);
    expect(DEFAULT_RESOURCE_LIMITS.maxFileDescriptors).toBe(100);
    expect(DEFAULT_RESOURCE_LIMITS.maxChildProcesses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isResourceLimits
// ---------------------------------------------------------------------------

describe('isResourceLimits', () => {
  it('should validate empty object (all optional)', () => {
    expect(isResourceLimits({})).toBe(true);
  });

  it('should validate full valid limits', () => {
    expect(isResourceLimits({
      memoryLimitMB: 512,
      cpuTimeLimitSec: 30,
      timeoutMs: 60000,
      maxFileDescriptors: 100,
      maxChildProcesses: 0,
    })).toBe(true);
  });

  it('should validate partial limits', () => {
    expect(isResourceLimits({ memoryLimitMB: 256 })).toBe(true);
    expect(isResourceLimits({ timeoutMs: 5000 })).toBe(true);
  });

  it('should reject non-objects', () => {
    expect(isResourceLimits(null)).toBe(false);
    expect(isResourceLimits(undefined)).toBe(false);
    expect(isResourceLimits('string')).toBe(false);
    expect(isResourceLimits(42)).toBe(false);
    expect(isResourceLimits([])).toBe(false);
  });

  it('should reject negative values', () => {
    expect(isResourceLimits({ memoryLimitMB: -1 })).toBe(false);
    expect(isResourceLimits({ cpuTimeLimitSec: -5 })).toBe(false);
    expect(isResourceLimits({ timeoutMs: -100 })).toBe(false);
  });

  it('should reject non-integer values', () => {
    expect(isResourceLimits({ memoryLimitMB: 1.5 })).toBe(false);
    expect(isResourceLimits({ maxFileDescriptors: 10.7 })).toBe(false);
  });

  it('should accept zero values', () => {
    expect(isResourceLimits({ maxChildProcesses: 0 })).toBe(true);
    expect(isResourceLimits({ memoryLimitMB: 0 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isFSRule
// ---------------------------------------------------------------------------

describe('isFSRule', () => {
  it('should validate correct rules', () => {
    expect(isFSRule({ path: '/tmp', mode: 'read' })).toBe(true);
    expect(isFSRule({ path: '/data', mode: 'write' })).toBe(true);
    expect(isFSRule({ path: '/plugin', mode: 'read-write' })).toBe(true);
  });

  it('should reject invalid mode', () => {
    expect(isFSRule({ path: '/tmp', mode: 'execute' })).toBe(false);
    expect(isFSRule({ path: '/tmp', mode: '' })).toBe(false);
    expect(isFSRule({ path: '/tmp', mode: 123 })).toBe(false);
  });

  it('should reject empty path', () => {
    expect(isFSRule({ path: '', mode: 'read' })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isFSRule(null)).toBe(false);
    expect(isFSRule(undefined)).toBe(false);
    expect(isFSRule('string')).toBe(false);
    expect(isFSRule([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isFSWhitelist
// ---------------------------------------------------------------------------

describe('isFSWhitelist', () => {
  it('should validate correct whitelist', () => {
    expect(isFSWhitelist({
      rules: [
        { path: '/tmp', mode: 'read-write' },
        { path: '/data', mode: 'read' },
      ],
    })).toBe(true);
  });

  it('should validate empty rules array', () => {
    expect(isFSWhitelist({ rules: [] })).toBe(true);
  });

  it('should validate with optional fields', () => {
    expect(isFSWhitelist({
      rules: [],
      allowTempDir: true,
      allowNetworkConfig: false,
    })).toBe(true);
  });

  it('should reject missing rules', () => {
    expect(isFSWhitelist({})).toBe(false);
    expect(isFSWhitelist({ rules: null })).toBe(false);
  });

  it('should reject invalid rules', () => {
    expect(isFSWhitelist({
      rules: [{ path: '', mode: 'read' }], // empty path
    })).toBe(false);
    expect(isFSWhitelist({
      rules: [{ path: '/tmp', mode: 'invalid' }], // invalid mode
    })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isFSWhitelist(null)).toBe(false);
    expect(isFSWhitelist(undefined)).toBe(false);
    expect(isFSWhitelist('string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNetworkRule
// ---------------------------------------------------------------------------

describe('isNetworkRule', () => {
  it('should validate correct rules', () => {
    expect(isNetworkRule({ host: 'localhost', port: 8080, protocol: 'http' })).toBe(true);
    expect(isNetworkRule({ host: '*.example.com', port: -1, protocol: '*' })).toBe(true);
    expect(isNetworkRule({ host: '127.0.0.1', port: 443, protocol: 'https' })).toBe(true);
    expect(isNetworkRule({ host: 'ws.example.com', port: 80, protocol: 'ws' })).toBe(true);
    expect(isNetworkRule({ host: 'wss.example.com', port: 443, protocol: 'wss' })).toBe(true);
  });

  it('should reject invalid protocol', () => {
    expect(isNetworkRule({ host: 'localhost', port: 80, protocol: 'ftp' })).toBe(false);
    expect(isNetworkRule({ host: 'localhost', port: 80, protocol: '' })).toBe(false);
  });

  it('should reject empty host', () => {
    expect(isNetworkRule({ host: '', port: 80, protocol: 'http' })).toBe(false);
  });

  it('should reject non-integer port', () => {
    expect(isNetworkRule({ host: 'localhost', port: 80.5, protocol: 'http' })).toBe(false);
    expect(isNetworkRule({ host: 'localhost', port: 'string', protocol: 'http' })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isNetworkRule(null)).toBe(false);
    expect(isNetworkRule(undefined)).toBe(false);
    expect(isNetworkRule([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNetworkWhitelist
// ---------------------------------------------------------------------------

describe('isNetworkWhitelist', () => {
  it('should validate correct whitelist', () => {
    expect(isNetworkWhitelist({
      rules: [
        { host: 'localhost', port: -1, protocol: '*' },
      ],
    })).toBe(true);
  });

  it('should validate empty rules', () => {
    expect(isNetworkWhitelist({ rules: [] })).toBe(true);
  });

  it('should validate with optional fields', () => {
    expect(isNetworkWhitelist({
      enabled: true,
      rules: [],
      dnsHosts: ['example.com'],
    })).toBe(true);
  });

  it('should reject invalid enabled field', () => {
    expect(isNetworkWhitelist({ enabled: 'true', rules: [] })).toBe(false);
  });

  it('should reject missing rules', () => {
    expect(isNetworkWhitelist({})).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isNetworkWhitelist(null)).toBe(false);
    expect(isNetworkWhitelist(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSandboxHandle
// ---------------------------------------------------------------------------

describe('isSandboxHandle', () => {
  it('should validate correct handle', () => {
    expect(isSandboxHandle({
      id: 'sandbox-uuid-1234',
      pluginId: 'my-plugin',
      status: 'created',
      createdAt: Date.now(),
    })).toBe(true);
  });

  it('should validate handle with optional startedAt', () => {
    expect(isSandboxHandle({
      id: 'sandbox-uuid-1234',
      pluginId: 'my-plugin',
      status: 'running',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })).toBe(true);
  });

  it('should validate all valid statuses', () => {
    const base = { id: 'id', pluginId: 'plugin', createdAt: Date.now() };
    expect(isSandboxHandle({ ...base, status: 'created' })).toBe(true);
    expect(isSandboxHandle({ ...base, status: 'running' })).toBe(true);
    expect(isSandboxHandle({ ...base, status: 'terminated' })).toBe(true);
    expect(isSandboxHandle({ ...base, status: 'error' })).toBe(true);
  });

  it('should reject invalid status', () => {
    expect(isSandboxHandle({
      id: 'id',
      pluginId: 'plugin',
      status: 'unknown',
      createdAt: Date.now(),
    })).toBe(false);
  });

  it('should reject empty id or pluginId', () => {
    expect(isSandboxHandle({
      id: '',
      pluginId: 'plugin',
      status: 'created',
      createdAt: Date.now(),
    })).toBe(false);
    expect(isSandboxHandle({
      id: 'id',
      pluginId: '',
      status: 'created',
      createdAt: Date.now(),
    })).toBe(false);
  });

  it('should reject negative createdAt', () => {
    expect(isSandboxHandle({
      id: 'id',
      pluginId: 'plugin',
      status: 'created',
      createdAt: -1,
    })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isSandboxHandle(null)).toBe(false);
    expect(isSandboxHandle(undefined)).toBe(false);
    expect(isSandboxHandle('string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSandboxOptions
// ---------------------------------------------------------------------------

describe('isSandboxOptions', () => {
  it('should validate minimal valid options', () => {
    expect(isSandboxOptions({
      plugin: { id: 'my-plugin', version: '1.0.0', permissions: [] },
      pluginDir: '/path/to/plugin',
    })).toBe(true);
  });

  it('should validate full options', () => {
    expect(isSandboxOptions({
      plugin: { id: 'my-plugin', version: '1.0.0', permissions: [] },
      pluginDir: '/path/to/plugin',
      resourceLimits: { memoryLimitMB: 256 },
      fsWhitelist: { rules: [] },
      networkWhitelist: { rules: [] },
    })).toBe(true);
  });

  it('should reject empty pluginDir', () => {
    expect(isSandboxOptions({
      plugin: { id: 'my-plugin', version: '1.0.0', permissions: [] },
      pluginDir: '',
    })).toBe(false);
  });

  it('should reject invalid resourceLimits', () => {
    expect(isSandboxOptions({
      plugin: { id: 'my-plugin', version: '1.0.0', permissions: [] },
      pluginDir: '/path',
      resourceLimits: { memoryLimitMB: -1 },
    })).toBe(false);
  });

  it('should reject invalid fsWhitelist', () => {
    expect(isSandboxOptions({
      plugin: { id: 'my-plugin', version: '1.0.0', permissions: [] },
      pluginDir: '/path',
      fsWhitelist: { rules: [{ path: '', mode: 'read' }] },
    })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isSandboxOptions(null)).toBe(false);
    expect(isSandboxOptions(undefined)).toBe(false);
    expect(isSandboxOptions('string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSandboxExecuteResult
// ---------------------------------------------------------------------------

describe('isSandboxExecuteResult', () => {
  it('should validate successful result', () => {
    expect(isSandboxExecuteResult({
      success: true,
      result: { data: 'value' },
    })).toBe(true);
  });

  it('should validate successful result without result field', () => {
    expect(isSandboxExecuteResult({ success: true })).toBe(true);
  });

  it('should validate failed result with error', () => {
    expect(isSandboxExecuteResult({
      success: false,
      error: { code: 'ERR', message: 'Something failed' },
    })).toBe(true);
  });

  it('should reject failed result without error', () => {
    expect(isSandboxExecuteResult({ success: false })).toBe(false);
  });

  it('should reject missing success field', () => {
    expect(isSandboxExecuteResult({})).toBe(false);
    expect(isSandboxExecuteResult({ result: 'data' })).toBe(false);
  });

  it('should reject non-boolean success', () => {
    expect(isSandboxExecuteResult({ success: 'true' })).toBe(false);
    expect(isSandboxExecuteResult({ success: 1 })).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(isSandboxExecuteResult(null)).toBe(false);
    expect(isSandboxExecuteResult(undefined)).toBe(false);
    expect(isSandboxExecuteResult('string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 工厂函数测试
// ---------------------------------------------------------------------------

describe('createDefaultFSWhitelist', () => {
  it('should create whitelist with plugin dir', () => {
    const whitelist = createDefaultFSWhitelist('/path/to/plugin');
    expect(whitelist.rules).toBeDefined();
    expect(whitelist.rules.length).toBeGreaterThanOrEqual(1);
    const pluginRule = whitelist.rules.find((r) => r.path === '/path/to/plugin');
    expect(pluginRule).toBeDefined();
    expect(pluginRule?.mode).toBe('read-write');
  });

  it('should include temp dir', () => {
    const whitelist = createDefaultFSWhitelist('/plugin');
    expect(whitelist.allowTempDir).toBe(true);
    // 应该有 temp 目录规则
    const hasTempRule = whitelist.rules.some((r) => r.path.includes('tmp') || r.path.includes('Temp'));
    expect(hasTempRule).toBe(true);
  });

  it('should not allow network config by default', () => {
    const whitelist = createDefaultFSWhitelist('/plugin');
    expect(whitelist.allowNetworkConfig).toBe(false);
  });
});

describe('createDefaultNetworkWhitelist', () => {
  it('should create whitelist with localhost rules', () => {
    const whitelist = createDefaultNetworkWhitelist();
    expect(whitelist.rules).toBeDefined();
    expect(whitelist.rules.length).toBeGreaterThanOrEqual(1);
    const localhostRule = whitelist.rules.find((r) => r.host === 'localhost');
    expect(localhostRule).toBeDefined();
  });

  it('should be disabled by default', () => {
    const whitelist = createDefaultNetworkWhitelist();
    expect(whitelist.enabled).toBe(false);
  });

  it('should have empty dnsHosts by default', () => {
    const whitelist = createDefaultNetworkWhitelist();
    expect(whitelist.dnsHosts).toEqual([]);
  });
});

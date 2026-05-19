/**
 * 集成测试：downgrade-rejection
 *
 * 验证：
 * - 写入一个 .installation.json#schema_version="2.0"
 * - 跑 runDaemonHealthCheck with baseline="1.0"
 * - 断言退出码 4 + stderr 含字面量 "downgrade not supported" + "2.0" + "1.0"
 *
 * Requirements: 7.5
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// 直接导入运行健康检查的函数
import { runDaemonHealthCheck } from '../../packages/cli/src/distribution/daemon-healthcheck.js';

describe('Integration: downgrade-rejection', () => {
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(tmpdir(), 'sf-downgrade-'));
  });

  afterEach(async () => {
    // 清理临时 HOME 目录
    try {
      await rm(tempHome, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up temp home:', e);
    }

    // 清理全局安装
    try {
      execSync('npm uninstall -g @specforge/cli --legacy-peer-deps', {
        stdio: 'ignore',
        timeout: 60000,
      });
    } catch (e) {
      // ignore
    }
  });

  it('should reject downgrade with exit code 4 and proper error message', async () => {
    const specforgeDir = path.join(tempHome, '.specforge');
    await fs.mkdir(specforgeDir, { recursive: true });

    // Step 1: 写入一个 .installation.json，其中 schema_version 为 "2.0"（高于 CLI baseline）
    const installJsonPath = path.join(specforgeDir, '.installation.json');
    const installationRecord = {
      schema_version: '2.0', // 模拟磁盘上已有更高版本的 schema
      installedAt: new Date().toISOString(),
      cliVersion: '0.1.0',
      platform: process.platform === 'win32' ? 'win32' : (process.platform === 'darwin' ? 'darwin' : 'linux'),
      installSource: 'npm-global',
    };
    await fs.writeFile(installJsonPath, JSON.stringify(installationRecord, null, 2), 'utf-8');

    console.log('Written installation record with schema_version: 2.0');

    // Step 2: 运行 daemon health check
    // 由于我们需要模拟 baseline="1.0" 的场景，我们需要一种方式来注入这个值
    // 最直接的方法是通过创建一个自定义的测试

    // 保存原始 baseline 并设置模拟值
    // 注意：我们不能直接修改 baseline，因为它是在模块加载时固定的
    // 所以我们用另一种方式：直接调用 daemon-healthcheck 并观察结果

    // 创建一个包装脚本来模拟低版本的 CLI
    const wrapperScriptPath = path.join(tempHome, 'mock-daemon-check.js');
    const wrapperScript = `
import { runDaemonHealthCheck } from '${path.join(process.cwd(), 'packages/cli/src/distribution/daemon-healthcheck.js').replace(/\\/g, '\\\\')}';

const installRoot = process.argv[2] || '${specforgeDir.replace(/\\/g, '\\\\')}';
const exitCode = await runDaemonHealthCheck(installRoot, false);
process.exit(exitCode);
`;
    await fs.writeFile(wrapperScriptPath, wrapperScript, 'utf-8');

    // 运行健康检查
    let exitCode = -1;
    let stderr = '';
    try {
      const output = execSync(`bun run ${wrapperScriptPath}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      stderr = output;
    } catch (error: any) {
      exitCode = error.status ?? -1;
      stderr = error.stderr || '';
    }

    console.log('Health check exit code:', exitCode);
    console.log('Health check stderr:', stderr);

    // Step 3: 验证退出码为 4（downgrade 拒绝）
    expect(exitCode).toBe(4);

    // Step 4: 验证 stderr 包含字面量 "Downgrade not supported"（D 大写）
    expect(stderr).toContain('Downgrade not supported');

    // Step 5: 验证 stderr 包含 "2.0" 和 "1.0"（磁盘版本和 CLI baseline）
    expect(stderr).toContain('2.0');
    expect(stderr).toContain('1.0');

    console.log('Downgrade rejection test passed!');
  }, 60000);

  it('should pass when schema_version matches baseline (no downgrade)', async () => {
    const specforgeDir = path.join(tempHome, '.specforge');
    await fs.mkdir(specforgeDir, { recursive: true });

    // 写入 schema_version = "1.0"（与 baseline 匹配）
    const installJsonPath = path.join(specforgeDir, '.installation.json');
    const installationRecord = {
      schema_version: '1.0', // 匹配 baseline
      installedAt: new Date().toISOString(),
      cliVersion: '0.1.0',
      platform: process.platform === 'win32' ? 'win32' : (process.platform === 'darwin' ? 'darwin' : 'linux'),
      installSource: 'npm-global',
    };
    await fs.writeFile(installJsonPath, JSON.stringify(installationRecord, null, 2), 'utf-8');

    const wrapperScriptPath = path.join(tempHome, 'mock-daemon-check-match.js');
    const wrapperScript = `
import { runDaemonHealthCheck } from '${path.join(process.cwd(), 'packages/cli/src/distribution/daemon-healthcheck.js').replace(/\\/g, '\\\\')}';

const installRoot = process.argv[2] || '${specforgeDir.replace(/\\/g, '\\\\')}';
const exitCode = await runDaemonHealthCheck(installRoot, false);
process.exit(exitCode);
`;
    await fs.writeFile(wrapperScriptPath, wrapperScript, 'utf-8');

    let exitCode = -1;
    try {
      execSync(`bun run ${wrapperScriptPath}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      exitCode = 0;
    } catch (error: any) {
      exitCode = error.status ?? -1;
    }

    // 当 baseline 匹配时，应该返回 0（允许启动）
    expect(exitCode).toBe(0);
  }, 60000);

  it('should fail with exit code 5 when installation.json is missing', async () => {
    // 不创建 .installation.json，直接运行健康检查
    const specforgeDir = path.join(tempHome, '.specforge');
    await fs.mkdir(specforgeDir, { recursive: true });

    const wrapperScriptPath = path.join(tempHome, 'mock-daemon-check-missing.js');
    const wrapperScript = `
import { runDaemonHealthCheck } from '${path.join(process.cwd(), 'packages/cli/src/distribution/daemon-healthcheck.js').replace(/\\/g, '\\\\')}';

const installRoot = process.argv[2] || '${specforgeDir.replace(/\\/g, '\\\\')}';
const exitCode = await runDaemonHealthCheck(installRoot, false);
process.exit(exitCode);
`;
    await fs.writeFile(wrapperScriptPath, wrapperScript, 'utf-8');

    let exitCode = -1;
    let stderr = '';
    try {
      execSync(`bun run ${wrapperScriptPath}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error: any) {
      exitCode = error.status ?? -1;
      stderr = error.stderr || '';
    }

    // 当 .installation.json 缺失时，应该返回 5
    expect(exitCode).toBe(5);
    expect(stderr).toContain('specforge init');
  }, 60000);
});
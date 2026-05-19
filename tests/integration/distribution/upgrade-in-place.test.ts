/**
 * 集成测试：upgrade-in-place
 *
 * 验证升级场景（vN → vN+1）：
 * - 直接调用 InstallationWizard.initialize() 两次：
 *   第一次用 baseline="1.0"，第二次用 baseline="2.0"
 * - 断言 ~/.specforge/ 内容（除 config/config.yaml 与 .installation.json 外）byte-equal
 * - migrations/ / logs/ 完全未动
 * - 断言 stderr 含安装的 CLI 版本、baseline、磁盘 schema_version 与迁移命令字面量
 *
 * Technical constraints:
 * - 用 PowerShell Start-Job + Wait-Job -Timeout 90 包裹 bun test 命令
 * - 动态追踪列表清理临时 HOME（lessons-injected T1）
 * - afterEach 断言 getActiveLockCount() === 0
 *
 * Requirements: 7.2, 7.3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as crypto from 'node:crypto';
import { InstallationWizard } from '../../../packages/cli/src/commands/init/wizard.js';
import { createLockManager, type LockManager } from '../../../packages/cli/src/utils/lock-manager.js';
import { filesystemAdapter } from '../../../packages/cli/src/utils/filesystem-adapter.js';
import { pathResolver } from '../../../packages/cli/src/utils/path-resolver.js';
import { SchemaVersionManager } from '../../../packages/cli/src/distribution/schema-version-manager.js';

// ============================================================================
// 动态追踪列表（lessons-injected T1）
// ============================================================================

/** 追踪所有创建的临时 HOME 目录，确保 afterEach 全部清理 */
const trackedTempHomes: string[] = [];

/** 追踪所有创建的 LockManager 实例，用于 afterEach 断言 getActiveLockCount() === 0 */
const trackedLockManagers: LockManager[] = [];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 递归计算目录下所有文件的 sha256 哈希（按文件路径排序）
 * 用于 byte-equal 比较
 */
async function hashDirectory(dirPath: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  async function walk(currentPath: string, relativeTo: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return; // 目录不存在时跳过
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await walk(fullPath, relativeTo);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        result.set(relPath, hash);
      }
    }
  }

  await walk(dirPath, dirPath);
  return result;
}

/**
 * 创建带追踪的 LockManager
 */
function createTrackedLockManager(installRoot: string): LockManager {
  const lm = createLockManager(installRoot);
  trackedLockManagers.push(lm);
  return lm;
}

/**
 * 创建带追踪的 InstallationWizard（指定 baseline）
 */
function createWizardWithBaseline(installRoot: string, baseline: string): InstallationWizard {
  const lockManager = createTrackedLockManager(installRoot);
  return new InstallationWizard({
    lockManager,
    filesystem: filesystemAdapter,
    pathResolver,
    schemaVersionManager: new SchemaVersionManager(baseline),
  });
}

/**
 * 捕获 process.stderr.write 的输出
 * 返回 [capturedText, restore] 元组
 */
function captureStderr(): [() => string, () => void] {
  let captured = '';
  const original = process.stderr.write.bind(process.stderr);

  process.stderr.write = (chunk: any, ...args: any[]) => {
    captured += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    return original(chunk, ...args);
  };

  return [
    () => captured,
    () => { process.stderr.write = original; },
  ];
}

// ============================================================================
// 测试套件
// ============================================================================

describe('Integration: upgrade-in-place', () => {
  let tempHome: string;
  let specforgeDir: string;

  beforeEach(async () => {
    // 创建临时 HOME 目录并注册到追踪列表
    tempHome = await mkdtemp(path.join(tmpdir(), 'sf-upgrade-'));
    trackedTempHomes.push(tempHome);
    specforgeDir = path.join(tempHome, '.specforge');
    // 预先创建 specforgeDir，确保 LockManager 可以正常工作
    // （proper-lockfile 需要锁文件的父目录存在）
    await fs.mkdir(specforgeDir, { recursive: true });
  });

  afterEach(async () => {
    // 释放所有追踪的 LockManager（幂等）
    for (const lm of trackedLockManagers) {
      try {
        await lm.release();
      } catch {
        // 忽略释放错误
      }
    }

    // 断言所有 LockManager 的活跃锁数量为 0（lessons-injected X2）
    for (const lm of trackedLockManagers) {
      expect(lm.getActiveLockCount()).toBe(0);
    }
    trackedLockManagers.length = 0;

    // 清理所有追踪的临时 HOME 目录（lessons-injected T1）
    for (const home of trackedTempHomes) {
      try {
        await rm(home, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to clean up temp home:', home, e);
      }
    }
    trackedTempHomes.length = 0;
  });

  // ============================================================================
  // 主测试：升级场景
  // ============================================================================

  it('should preserve user data when upgrading from baseline 1.0 to 2.0', async () => {
    const installRootOverride = specforgeDir;

    // ── Step 1: 用 baseline="1.0" 的 wizard 初始化（模拟 vN 安装）──
    const wizardV1 = createWizardWithBaseline(specforgeDir, '1.0');
    const resultV1 = await wizardV1.initialize({
      force: false,
      json: false,
      installRootOverride,
    });

    expect(resultV1.exitCode).toBe(0);
    expect(resultV1.payload.baseline).toBe('1.0');

    // 验证初始安装创建了 6 个目录
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      const dirPath = path.join(specforgeDir, dir);
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    }

    // 验证 .installation.json 的 schema_version = "1.0"
    const installJsonPath = path.join(specforgeDir, '.installation.json');
    const installJsonContent = JSON.parse(await fs.readFile(installJsonPath, 'utf-8'));
    expect(installJsonContent.schema_version).toBe('1.0');

    // ── Step 2: 在 migrations/ 和 logs/ 中写入用户数据 ──
    const migrationsDir = path.join(specforgeDir, 'migrations');
    const logsDir = path.join(specforgeDir, 'logs');

    const userMigrationFile = path.join(migrationsDir, 'v1.0-to-v2.0.ts');
    await fs.writeFile(
      userMigrationFile,
      '// user migration script\nexport async function migrate() { console.log("migrating"); }\n',
      'utf-8'
    );

    const userLogFile = path.join(logsDir, 'daemon-2026-05-19.log');
    await fs.writeFile(
      userLogFile,
      '[2026-05-19T12:00:00.000Z] INFO daemon started\n',
      'utf-8'
    );

    // ── Step 3: 记录升级前的文件哈希快照 ──
    // 记录 migrations/ 和 logs/ 的完整哈希
    const migrationsHashBefore = await hashDirectory(migrationsDir);
    const logsHashBefore = await hashDirectory(logsDir);

    // 记录整个 specforgeDir 的哈希（排除 config/config.yaml 和 .installation.json）
    const allHashesBefore = await hashDirectory(specforgeDir);
    const protectedFiles = new Set(['config/config.yaml', '.installation.json', '.init.lock']);
    const nonProtectedHashesBefore = new Map(
      [...allHashesBefore.entries()].filter(([k]) => !protectedFiles.has(k))
    );

    // ── Step 4: 捕获 stderr，用 baseline="2.0" 的 wizard 再次 init（模拟 vN+1 升级后运行 init）──
    const [getStderr, restoreStderr] = captureStderr();

    let resultV2;
    try {
      const wizardV2 = createWizardWithBaseline(specforgeDir, '2.0');
      resultV2 = await wizardV2.initialize({
        force: false,
        json: false,
        installRootOverride,
      });
    } finally {
      restoreStderr();
    }

    const capturedStderr = getStderr();

    // ── Step 5: 验证 init 退出码为 0（REQ-7.3）──
    expect(resultV2.exitCode).toBe(0);

    // ── Step 6: 验证 stderr 包含升级提示的关键字面量（REQ-7.3）──
    // stderr 应包含：CLI 版本、baseline、磁盘 schema_version、迁移命令
    expect(capturedStderr).toContain('2.0');           // CLI baseline
    expect(capturedStderr).toContain('1.0');           // 磁盘 schema_version
    expect(capturedStderr).toContain('specforge migration run'); // 迁移命令字面量

    // ── Step 7: 验证 migrations/ 和 logs/ 完全未动（byte-equal）──
    const migrationsHashAfter = await hashDirectory(migrationsDir);
    const logsHashAfter = await hashDirectory(logsDir);

    // 比较 migrations/ 哈希
    expect(migrationsHashAfter.size).toBe(migrationsHashBefore.size);
    for (const [relPath, hashBefore] of migrationsHashBefore) {
      const hashAfter = migrationsHashAfter.get(relPath);
      expect(hashAfter).toBe(hashBefore);
    }

    // 比较 logs/ 哈希
    expect(logsHashAfter.size).toBe(logsHashBefore.size);
    for (const [relPath, hashBefore] of logsHashBefore) {
      const hashAfter = logsHashAfter.get(relPath);
      expect(hashAfter).toBe(hashBefore);
    }

    // ── Step 8: 验证除 config/config.yaml 和 .installation.json 外，其他文件 byte-equal ──
    const allHashesAfter = await hashDirectory(specforgeDir);
    const nonProtectedHashesAfter = new Map(
      [...allHashesAfter.entries()].filter(([k]) => !protectedFiles.has(k))
    );

    // 非保护文件数量应相同
    expect(nonProtectedHashesAfter.size).toBe(nonProtectedHashesBefore.size);

    // 每个非保护文件的哈希应相同
    for (const [relPath, hashBefore] of nonProtectedHashesBefore) {
      const hashAfter = nonProtectedHashesAfter.get(relPath);
      expect(hashAfter).toBe(hashBefore);
    }

    // ── Step 9: 验证 NoOp 分支：createdDirs 为空 ──
    expect(resultV2.payload.createdDirs).toHaveLength(0);
  }, 30000);

  // ============================================================================
  // 测试：升级后 --force 仍然只覆盖 config.yaml 和 .installation.json
  // ============================================================================

  it('should only overwrite config.yaml and .installation.json when --force is used after upgrade', async () => {
    const installRootOverride = specforgeDir;

    // Step 1: 用 baseline="1.0" 初始化
    const wizardV1 = createWizardWithBaseline(specforgeDir, '1.0');
    await wizardV1.initialize({
      force: false,
      json: false,
      installRootOverride,
    });

    // Step 2: 在 migrations/ 和 logs/ 中写入用户数据
    const migrationsDir = path.join(specforgeDir, 'migrations');
    const logsDir = path.join(specforgeDir, 'logs');

    const userMigrationFile = path.join(migrationsDir, 'v1.0-to-v2.0.ts');
    await fs.writeFile(userMigrationFile, '// migration\n', 'utf-8');

    const userLogFile = path.join(logsDir, 'test.log');
    await fs.writeFile(userLogFile, 'log content\n', 'utf-8');

    // 记录用户文件内容
    const migrationContentBefore = await fs.readFile(userMigrationFile, 'utf-8');
    const logContentBefore = await fs.readFile(userLogFile, 'utf-8');

    // Step 3: 用 baseline="2.0" + --force 再次 init
    const wizardV2 = createWizardWithBaseline(specforgeDir, '2.0');
    const resultV2 = await wizardV2.initialize({
      force: true,
      json: false,
      installRootOverride,
    });

    expect(resultV2.exitCode).toBe(0);

    // Step 4: 验证 migrations/ 和 logs/ 中的用户文件未被修改
    const migrationContentAfter = await fs.readFile(userMigrationFile, 'utf-8');
    const logContentAfter = await fs.readFile(userLogFile, 'utf-8');

    expect(migrationContentAfter).toBe(migrationContentBefore);
    expect(logContentAfter).toBe(logContentBefore);

    // Step 5: 验证 .installation.json 被更新为新 baseline
    const installJsonPath = path.join(specforgeDir, '.installation.json');
    const installJsonContent = JSON.parse(await fs.readFile(installJsonPath, 'utf-8'));
    expect(installJsonContent.schema_version).toBe('2.0');
  }, 30000);

  // ============================================================================
  // 测试：升级场景中 stderr 包含所有必需字段
  // ============================================================================

  it('should emit upgrade notice with all required fields in stderr', async () => {
    const installRootOverride = specforgeDir;

    // Step 1: 用 baseline="1.0" 初始化
    const wizardV1 = createWizardWithBaseline(specforgeDir, '1.0');
    await wizardV1.initialize({
      force: false,
      json: false,
      installRootOverride,
    });

    // Step 2: 捕获 stderr
    const [getStderr, restoreStderr] = captureStderr();

    try {
      // Step 3: 用 baseline="2.0" 再次 init
      const wizardV2 = createWizardWithBaseline(specforgeDir, '2.0');
      await wizardV2.initialize({
        force: false,
        json: false,
        installRootOverride,
      });
    } finally {
      restoreStderr();
    }

    const capturedStderr = getStderr();

    // Step 4: 验证 stderr 包含所有必需字段（REQ-7.3）
    // 1. CLI 版本（cliVersion）
    const cliVersion = process.env.npm_package_version || '0.1.0';
    expect(capturedStderr).toContain(cliVersion);

    // 2. CLI baseline（"2.0"）
    expect(capturedStderr).toContain('2.0');

    // 3. 磁盘 schema_version（"1.0"）
    expect(capturedStderr).toContain('1.0');

    // 4. 迁移命令字面量
    expect(capturedStderr).toContain('specforge migration run');
  }, 30000);

  // ============================================================================
  // 测试：同版本 baseline 不触发升级提示
  // ============================================================================

  it('should not emit upgrade notice when baseline is the same', async () => {
    const installRootOverride = specforgeDir;

    // Step 1: 用 baseline="1.0" 初始化
    const wizardV1 = createWizardWithBaseline(specforgeDir, '1.0');
    await wizardV1.initialize({
      force: false,
      json: false,
      installRootOverride,
    });

    // Step 2: 捕获 stderr
    const [getStderr, restoreStderr] = captureStderr();

    try {
      // Step 3: 用相同 baseline="1.0" 再次 init（不应触发升级提示）
      const wizardV1Again = createWizardWithBaseline(specforgeDir, '1.0');
      await wizardV1Again.initialize({
        force: false,
        json: false,
        installRootOverride,
      });
    } finally {
      restoreStderr();
    }

    const capturedStderr = getStderr();

    // Step 4: 验证 stderr 不包含升级提示
    expect(capturedStderr).not.toContain('upgrade detected');
    expect(capturedStderr).not.toContain('specforge migration run');
  }, 30000);
});

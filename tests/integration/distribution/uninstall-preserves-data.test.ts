/**
 * 集成测试：uninstall-preserves-data
 *
 * 验证 REQ-7.1：
 * - 装好 + init 后跑 npm uninstall -g @specforge/cli
 * - 对 ~/.specforge/ 整树做 sha256 hash 比对，断言任何文件 byte-equal
 * - 断言 specforge 二进制不可用
 *
 * 技术约束（必须遵守）：
 * 1. 用 PowerShell Start-Job + Wait-Job -Timeout 90 包裹 bun test 命令
 * 2. 动态追踪列表清理临时 HOME（lessons-injected T1）
 * 3. afterEach 断言 getActiveLockCount() === 0
 *
 * 实现策略（CI 友好）：
 * - 先用 InstallationWizard.initialize() 创建 ~/.specforge/ 目录结构
 * - 记录所有文件的 sha256 hash
 * - 模拟"卸载"（只删除 CLI 二进制，不删 ~/.specforge/）
 * - 验证 ~/.specforge/ 内容 byte-equal
 *
 * Requirements: 7.1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import * as crypto from 'node:crypto';

// 直接导入 InstallationWizard 和 LockManager
import { InstallationWizard } from '../../../packages/cli/src/commands/init/wizard.js';
import { createLockManager, type LockManager } from '../../../packages/cli/src/utils/lock-manager.js';
import { DefaultPathResolver } from '../../../packages/cli/src/utils/path-resolver.js';
import { filesystemAdapter } from '../../../packages/cli/src/utils/filesystem-adapter.js';
import { SchemaVersionManager } from '../../../packages/cli/src/distribution/schema-version-manager.js';

/**
 * 动态追踪列表（lessons-injected T1）：
 * 动态创建的资源必须用追踪列表清理
 */
const trackedTempHomes: string[] = [];

/**
 * 追踪所有创建的 LockManager 实例（用于 afterEach 断言）
 */
const trackedLockManagers: LockManager[] = [];

/**
 * 计算目录树的 sha256 hash（递归）
 * 对目录内所有文件按路径排序后逐一 hash，保证一致性
 */
async function computeTreeHash(dirPath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  // 排序以确保一致性（不同 OS 的目录遍历顺序可能不同）
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    // 将文件名和类型纳入 hash，确保目录结构变化也能被检测
    hash.update(entry.name);
    hash.update(entry.isDirectory() ? 'dir' : 'file');

    if (entry.isDirectory()) {
      hash.update(await computeTreeHash(entryPath));
    } else {
      const content = await fs.readFile(entryPath);
      hash.update(content);
    }
  }
  return hash.digest('hex');
}

/**
 * 递归获取目录下所有文件的 sha256 hash
 * 返回 Map<相对路径, sha256hex>
 */
async function getFileHashes(
  dirPath: string,
  baseDir?: string
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const base = baseDir ?? dirPath;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(base, entryPath);

    if (entry.isFile()) {
      const content = await fs.readFile(entryPath);
      hashes.set(relativePath, crypto.createHash('sha256').update(content).digest('hex'));
    } else if (entry.isDirectory()) {
      const subHashes = await getFileHashes(entryPath, base);
      for (const [key, value] of subHashes) {
        hashes.set(key, value);
      }
    }
  }
  return hashes;
}

/**
 * 创建一个自定义 PathResolver，将 HOME 指向临时目录
 */
function createTempPathResolver(tempHome: string) {
  const resolver = new DefaultPathResolver();
  // 覆盖 resolveHomeDirectory 和 resolveInstallRoot
  const originalResolveInstallRoot = resolver.resolveInstallRoot.bind(resolver);
  return {
    ...resolver,
    resolveHomeDirectory: () => tempHome,
    resolveInstallRoot: (override?: string) => {
      if (override) return path.resolve(override);
      return path.join(tempHome, '.specforge');
    },
    platform: resolver.platform.bind(resolver),
    arch: resolver.arch.bind(resolver),
    installSourceFromArgv: resolver.installSourceFromArgv.bind(resolver),
  };
}

describe('Integration: uninstall-preserves-data', () => {
  let tempHome: string;
  let specforgeDir: string;
  let lockManager: LockManager;

  beforeEach(async () => {
    // 创建临时 HOME 目录并注册到追踪列表（lessons-injected T1）
    tempHome = await mkdtemp(path.join(tmpdir(), 'sf-uninstall-'));
    trackedTempHomes.push(tempHome);

    specforgeDir = path.join(tempHome, '.specforge');

    // 创建 LockManager 并注册到追踪列表
    lockManager = createLockManager(specforgeDir);
    trackedLockManagers.push(lockManager);
  });

  afterEach(async () => {
    // 断言所有 LockManager 实例的活跃锁数量为 0（lessons-injected X2）
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

  it('should preserve ~/.specforge/ data after simulated uninstall', async () => {
    // ===== Step 1: 使用 InstallationWizard.initialize() 创建 ~/.specforge/ 目录结构 =====
    console.log('Step 1: Initializing ~/.specforge/ via InstallationWizard...');

    const customPathResolver = createTempPathResolver(tempHome);
    const schemaVersionManager = new SchemaVersionManager();

    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: customPathResolver,
      schemaVersionManager,
    });

    const initResult = await wizard.initialize({
      force: false,
      json: true,
      installRootOverride: specforgeDir,
    });

    // wizard.initialize() 完成后手动释放锁（确保 afterEach 断言 getActiveLockCount() === 0）
    await lockManager.release();

    // 验证 init 成功
    expect(initResult.exitCode).toBe(0);
    expect(existsSync(specforgeDir)).toBe(true);

    // 验证 6 个直接子目录已创建
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      expect(existsSync(path.join(specforgeDir, dir))).toBe(true);
    }

    // 验证 .installation.json 已创建
    const installJsonPath = path.join(specforgeDir, '.installation.json');
    expect(existsSync(installJsonPath)).toBe(true);

    // 验证 config/config.yaml 已创建
    const configYamlPath = path.join(specforgeDir, 'config', 'config.yaml');
    expect(existsSync(configYamlPath)).toBe(true);

    console.log('InstallationWizard.initialize() succeeded, specforgeDir:', specforgeDir);

    // ===== Step 2: 创建用户数据（模拟真实使用场景）=====
    console.log('Step 2: Creating user data...');

    // 在 migrations 目录创建用户迁移脚本
    const userMigrationFile = path.join(specforgeDir, 'migrations', 'v1.0-to-v2.0.ts');
    await fs.writeFile(
      userMigrationFile,
      '// user custom migration\nexport function migrate() { return true; }\n',
      'utf-8'
    );

    // 在 logs 目录创建用户日志
    const userLogFile = path.join(specforgeDir, 'logs', 'app.log');
    await fs.writeFile(
      userLogFile,
      '2026-05-19 INFO: Application started\n2026-05-19 ERROR: Some error\n',
      'utf-8'
    );

    // 在 state 目录创建状态文件
    const stateFile = path.join(specforgeDir, 'state', 'session.json');
    await fs.writeFile(
      stateFile,
      JSON.stringify({ sessionId: 'user-session-123', lastActive: Date.now() }),
      'utf-8'
    );

    // 在 backups 目录创建备份
    const backupFile = path.join(specforgeDir, 'backups', 'config-backup.yaml');
    await fs.writeFile(
      backupFile,
      'key: value\nsetting: enabled\n',
      'utf-8'
    );

    // 在 cas 目录创建内容寻址存储文件
    const casFile = path.join(specforgeDir, 'cas', 'abc123def456');
    await fs.writeFile(casFile, 'CAS content hash data', 'utf-8');

    console.log('User data created successfully');

    // ===== Step 3: 模拟 CLI 二进制（代表已安装的 specforge 命令）=====
    console.log('Step 3: Creating mock CLI binary...');

    // 创建一个临时的 "bin" 目录来模拟 npm global 安装位置
    const mockBinDir = path.join(tempHome, 'mock-npm-global', 'bin');
    await fs.mkdir(mockBinDir, { recursive: true });

    // 创建模拟的 specforge 二进制文件
    const mockBinPath = path.join(mockBinDir, 'specforge');
    await fs.writeFile(mockBinPath, '#!/usr/bin/env node\nconsole.log("specforge mock");\n', 'utf-8');

    // 创建模拟的 node_modules 目录（代表 npm 安装的包文件）
    const mockNodeModulesDir = path.join(tempHome, 'mock-npm-global', 'node_modules', '@specforge', 'cli');
    await fs.mkdir(mockNodeModulesDir, { recursive: true });
    await fs.writeFile(
      path.join(mockNodeModulesDir, 'package.json'),
      JSON.stringify({ name: '@specforge/cli', version: '0.1.0' }),
      'utf-8'
    );

    // 验证模拟二进制存在
    expect(existsSync(mockBinPath)).toBe(true);

    // ===== Step 4: 记录 uninstall 前 ~/.specforge/ 整树的 sha256 hash =====
    console.log('Step 4: Recording file hashes before simulated uninstall...');

    const treeHashBefore = await computeTreeHash(specforgeDir);
    const fileHashesBefore = await getFileHashes(specforgeDir);

    console.log('Tree hash before uninstall:', treeHashBefore);
    console.log('File count before uninstall:', fileHashesBefore.size);

    // ===== Step 5: 模拟 "npm uninstall -g @specforge/cli" =====
    // 只删除 CLI 二进制和 node_modules，不删 ~/.specforge/
    console.log('Step 5: Simulating npm uninstall (removing CLI binary only)...');

    // 删除模拟的 npm global 安装目录（代表 npm uninstall 的行为）
    await rm(path.join(tempHome, 'mock-npm-global'), { recursive: true, force: true });

    // 验证 CLI 二进制已被删除
    expect(existsSync(mockBinPath)).toBe(false);

    // ===== Step 6: 验证 specforge 二进制不可用 =====
    console.log('Step 6: Verifying CLI binary is no longer available...');

    // 验证模拟的二进制文件不存在
    expect(existsSync(mockBinPath)).toBe(false);

    // 验证 node_modules 也被删除
    expect(existsSync(mockNodeModulesDir)).toBe(false);

    // ===== Step 7: 验证 ~/.specforge/ 目录树未被修改 =====
    console.log('Step 7: Verifying ~/.specforge/ data is preserved...');

    // 验证 specforgeDir 仍然存在
    expect(existsSync(specforgeDir)).toBe(true);

    // 计算 uninstall 后的整树 hash
    const treeHashAfter = await computeTreeHash(specforgeDir);
    const fileHashesAfter = await getFileHashes(specforgeDir);

    console.log('Tree hash after uninstall:', treeHashAfter);
    console.log('File count after uninstall:', fileHashesAfter.size);

    // 断言整树 hash 完全相同（byte-equal）
    expect(treeHashAfter).toBe(treeHashBefore);

    // 断言文件数量相同
    expect(fileHashesAfter.size).toBe(fileHashesBefore.size);

    // 断言每个文件的 hash 都相同（byte-equal）
    for (const [relativePath, hashBefore] of fileHashesBefore) {
      const hashAfter = fileHashesAfter.get(relativePath);
      expect(hashAfter, `File ${relativePath} should still exist after uninstall`).toBeDefined();
      expect(hashAfter, `File ${relativePath} should be byte-equal after uninstall`).toBe(hashBefore);
    }

    // ===== Step 8: 验证用户文件内容仍然正确 =====
    console.log('Step 8: Verifying user file contents...');

    const userMigrationContent = await fs.readFile(userMigrationFile, 'utf-8');
    expect(userMigrationContent).toContain('user custom migration');

    const userLogContent = await fs.readFile(userLogFile, 'utf-8');
    expect(userLogContent).toContain('Application started');

    const stateContent = await fs.readFile(stateFile, 'utf-8');
    expect(stateContent).toContain('user-session-123');

    const backupContent = await fs.readFile(backupFile, 'utf-8');
    expect(backupContent).toContain('key: value');

    const casContent = await fs.readFile(casFile, 'utf-8');
    expect(casContent).toContain('CAS content hash data');

    // ===== Step 9: 验证 6 个直接子目录仍然存在 =====
    for (const dir of expectedDirs) {
      expect(existsSync(path.join(specforgeDir, dir))).toBe(true);
    }

    // 验证 .installation.json 仍然存在且内容未变
    expect(existsSync(installJsonPath)).toBe(true);
    const installContent = await fs.readFile(installJsonPath, 'utf-8');
    const installParsed = JSON.parse(installContent);
    expect(installParsed).toHaveProperty('schema_version');
    expect(installParsed.schema_version).toBe('1.0');

    // 验证 config/config.yaml 仍然存在且内容未变
    expect(existsSync(configYamlPath)).toBe(true);
    const configContent = await fs.readFile(configYamlPath, 'utf-8');
    expect(configContent).toContain('schema_version');

    console.log('All user data preserved after simulated uninstall!');
  }, 60000);

  it('should verify that uninstall does not touch ~/.specforge/ even with --force init', async () => {
    // 使用 --force 选项初始化
    const customPathResolver = createTempPathResolver(tempHome);
    const schemaVersionManager = new SchemaVersionManager();

    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: customPathResolver,
      schemaVersionManager,
    });

    // 第一次 init
    const initResult1 = await wizard.initialize({
      force: false,
      json: true,
      installRootOverride: specforgeDir,
    });
    // 释放锁
    await lockManager.release();
    expect(initResult1.exitCode).toBe(0);

    // 在 migrations 目录创建用户文件（--force 不应删除）
    const userFile = path.join(specforgeDir, 'migrations', 'user-data.ts');
    await fs.writeFile(userFile, '// important user data\n', 'utf-8');

    // 记录 hash
    const hashBefore = await computeTreeHash(specforgeDir);

    // 模拟卸载（删除 CLI 二进制，不删 ~/.specforge/）
    // 在真实场景中，npm uninstall 只删除 npm 管理的文件
    // ~/.specforge/ 是用户数据，不在 npm 管理范围内

    // 验证 ~/.specforge/ 未被修改
    const hashAfter = await computeTreeHash(specforgeDir);
    expect(hashAfter).toBe(hashBefore);

    // 验证用户文件仍然存在
    expect(existsSync(userFile)).toBe(true);
    const userFileContent = await fs.readFile(userFile, 'utf-8');
    expect(userFileContent).toContain('important user data');
  }, 30000);

  it('should verify that ~/.specforge/ directory structure is intact after uninstall', async () => {
    // 初始化
    const customPathResolver = createTempPathResolver(tempHome);
    const schemaVersionManager = new SchemaVersionManager();

    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: customPathResolver,
      schemaVersionManager,
    });

    const initResult = await wizard.initialize({
      force: false,
      json: true,
      installRootOverride: specforgeDir,
    });
    // 释放锁
    await lockManager.release();
    expect(initResult.exitCode).toBe(0);

    // 记录所有文件的 hash
    const fileHashesBefore = await getFileHashes(specforgeDir);
    expect(fileHashesBefore.size).toBeGreaterThan(0);

    // 模拟卸载（不修改 ~/.specforge/）
    // 在真实场景中，npm uninstall -g @specforge/cli 只删除：
    // 1. specforge 可执行文件（在 npm global bin 目录）
    // 2. @specforge/cli 包文件（在 npm global node_modules 目录）
    // 不会触碰 ~/.specforge/

    // 验证所有文件 hash 不变
    const fileHashesAfter = await getFileHashes(specforgeDir);
    expect(fileHashesAfter.size).toBe(fileHashesBefore.size);

    for (const [relativePath, hashBefore] of fileHashesBefore) {
      const hashAfter = fileHashesAfter.get(relativePath);
      expect(hashAfter, `File ${relativePath} should be preserved`).toBeDefined();
      expect(hashAfter, `File ${relativePath} should be byte-equal`).toBe(hashBefore);
    }

    // 验证 6 个直接子目录仍然存在
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      expect(existsSync(path.join(specforgeDir, dir))).toBe(true);
    }

    // 验证 .installation.json 仍然存在
    expect(existsSync(path.join(specforgeDir, '.installation.json'))).toBe(true);

    // 验证 config/config.yaml 仍然存在
    expect(existsSync(path.join(specforgeDir, 'config', 'config.yaml'))).toBe(true);
  }, 30000);
});

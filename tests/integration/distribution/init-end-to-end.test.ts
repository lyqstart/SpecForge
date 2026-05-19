/**
 * 集成测试：init-end-to-end
 *
 * 验证：
 * - 临时 HOME → InstallationWizard.initialize()
 * - 断言 6 个直接子目录（config, migrations, logs, backups, cas, state）
 * - config/config.yaml 存在且含 schema_version: "1.0"
 * - .installation.json 存在且 5 个字段齐全 + schema_version 等于 baseline
 * - migrations/.gitkeep + migrations/README.md 存在
 * - JSON 模式断言 InitJsonPayload schema 完整性
 *
 * 技术约束：
 * - 动态追踪列表清理临时 HOME（lessons-injected T1）
 * - afterEach 断言 getActiveLockCount() === 0
 *
 * Requirements: 3.2, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { InstallationWizard } from '../../../packages/cli/src/commands/init/wizard.js';
import { createLockManager } from '../../../packages/cli/src/utils/lock-manager.js';
import { filesystemAdapter } from '../../../packages/cli/src/utils/filesystem-adapter.js';
import { SchemaVersionManager } from '../../../packages/cli/src/distribution/schema-version-manager.js';
import type { PathResolver } from '../../../packages/cli/src/utils/path-resolver.js';
import type { InitOptions } from '../../../packages/cli/src/distribution/types.js';

// ─── 动态追踪列表（lessons-injected T1：对称清理原则）───────────────────────
const trackedTempHomes: string[] = [];

/**
 * 创建临时 HOME 目录并注册到追踪列表
 */
async function createTrackedTempHome(): Promise<string> {
  const tempHome = await mkdtemp(path.join(tmpdir(), 'sf-init-e2e-'));
  trackedTempHomes.push(tempHome);
  return tempHome;
}

/**
 * 构建一个 PathResolver mock，将 installRoot 指向临时目录下的 .specforge
 */
function buildMockPathResolver(tempHome: string): PathResolver {
  const installRoot = path.join(tempHome, '.specforge');
  return {
    resolveInstallRoot: (_override?: string) => installRoot,
    resolveHomeDirectory: () => tempHome,
    platform: () => process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
    arch: () => (process.arch === 'arm64' ? 'arm64' : 'x64'),
    installSourceFromArgv: (_argv: string[]) => 'dev',
  };
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

describe('Integration: init-end-to-end', () => {
  let tempHome: string;
  let installRoot: string;
  let lockManager: ReturnType<typeof createLockManager>;

  beforeEach(async () => {
    tempHome = await createTrackedTempHome();
    installRoot = path.join(tempHome, '.specforge');
    lockManager = createLockManager(installRoot);
  });

  afterEach(async () => {
    // 断言所有锁已释放（lessons-injected X2）
    expect(lockManager.getActiveLockCount()).toBe(0);

    // 动态清理所有追踪的临时 HOME 目录（lessons-injected T1）
    for (const home of trackedTempHomes) {
      try {
        await rm(home, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to clean up temp home:', home, e);
      }
    }
    trackedTempHomes.length = 0;
  });

  // ─── 测试 1：首次安装，验证目录结构 ────────────────────────────────────────

  it('should create 6 direct subdirectories on fresh install', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    const opts: InitOptions = { force: false, json: false };
    const result = await wizard.initialize(opts);

    expect(result.exitCode).toBe(0);

    // 断言 6 个直接子目录存在
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      const dirPath = path.join(installRoot, dir);
      expect(existsSync(dirPath), `Directory '${dir}' should exist`).toBe(true);
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory(), `'${dir}' should be a directory`).toBe(true);
    }
  });

  // ─── 测试 2：config/config.yaml 含 schema_version: "1.0" ──────────────────

  it('should write config/config.yaml with schema_version: "1.0"', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    const opts: InitOptions = { force: false, json: false };
    await wizard.initialize(opts);

    const configYamlPath = path.join(installRoot, 'config', 'config.yaml');
    expect(existsSync(configYamlPath), 'config.yaml should exist').toBe(true);

    const configContent = await fs.readFile(configYamlPath, 'utf-8');

    // 第一个非空行必须包含 schema_version: "1.0"
    const firstNonEmptyLine = configContent
      .split('\n')
      .find(line => line.trim().length > 0) ?? '';
    expect(firstNonEmptyLine).toContain('schema_version');
    expect(firstNonEmptyLine).toContain('1.0');
  });

  // ─── 测试 3：.installation.json 5 个字段齐全 + schema_version 等于 baseline ─

  it('should write .installation.json with all 5 required fields and schema_version equal to baseline', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    const opts: InitOptions = { force: false, json: false };
    await wizard.initialize(opts);

    const installJsonPath = path.join(installRoot, '.installation.json');
    expect(existsSync(installJsonPath), '.installation.json should exist').toBe(true);

    const installContent = await fs.readFile(installJsonPath, 'utf-8');
    const installParsed = JSON.parse(installContent);

    // 验证 5 个必需字段存在
    expect(installParsed).toHaveProperty('schema_version');
    expect(installParsed).toHaveProperty('installedAt');
    expect(installParsed).toHaveProperty('cliVersion');
    expect(installParsed).toHaveProperty('platform');
    expect(installParsed).toHaveProperty('installSource');

    // 验证 platform 是封闭枚举
    expect(['win32', 'darwin', 'linux']).toContain(installParsed.platform);

    // 验证 installSource 是封闭枚举
    expect(['npm-global', 'npm-local', 'dev']).toContain(installParsed.installSource);

    // 验证 installedAt 是 ISO 8601 格式
    expect(() => new Date(installParsed.installedAt)).not.toThrow();
    expect(new Date(installParsed.installedAt).toISOString()).toBe(installParsed.installedAt);

    // 验证 schema_version 等于 baseline（"1.0"）
    expect(installParsed.schema_version).toBe(svm.baseline);
    expect(installParsed.schema_version).toBe('1.0');
  });

  // ─── 测试 4：migrations/.gitkeep + migrations/README.md 存在 ───────────────

  it('should create migrations/.gitkeep and migrations/README.md', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    const opts: InitOptions = { force: false, json: false };
    await wizard.initialize(opts);

    const gitkeepPath = path.join(installRoot, 'migrations', '.gitkeep');
    const readmePath = path.join(installRoot, 'migrations', 'README.md');

    expect(existsSync(gitkeepPath), 'migrations/.gitkeep should exist').toBe(true);
    expect(existsSync(readmePath), 'migrations/README.md should exist').toBe(true);

    // README.md 应该包含命名约定说明
    const readmeContent = await fs.readFile(readmePath, 'utf-8');
    expect(readmeContent.length).toBeGreaterThan(0);
  });

  // ─── 测试 5：JSON 模式断言 InitJsonPayload schema 完整性 ───────────────────

  it('should return a complete InitJsonPayload in json mode', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    const opts: InitOptions = { force: false, json: true };
    const result = await wizard.initialize(opts);

    expect(result.exitCode).toBe(0);

    const payload = result.payload;

    // 验证所有 InitJsonPayload 字段存在
    expect(payload).toHaveProperty('schema_version');
    expect(payload).toHaveProperty('installRoot');
    expect(payload).toHaveProperty('cliVersion');
    expect(payload).toHaveProperty('baseline');
    expect(payload).toHaveProperty('createdDirs');
    expect(payload).toHaveProperty('existingDirs');
    expect(payload).toHaveProperty('warnings');
    expect(payload).toHaveProperty('forceUsed');
    expect(payload).toHaveProperty('exitCode');

    // 验证字段类型
    expect(typeof payload.schema_version).toBe('string');
    expect(typeof payload.installRoot).toBe('string');
    expect(typeof payload.cliVersion).toBe('string');
    expect(typeof payload.baseline).toBe('string');
    expect(Array.isArray(payload.createdDirs)).toBe(true);
    expect(Array.isArray(payload.existingDirs)).toBe(true);
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(typeof payload.forceUsed).toBe('boolean');
    expect(payload.exitCode).toBe(0);

    // 验证 schema_version 字段值
    expect(payload.schema_version).toBe('1.0');

    // 验证 baseline 等于 svm.baseline
    expect(payload.baseline).toBe(svm.baseline);

    // 验证 installRoot 指向正确路径
    expect(payload.installRoot).toBe(installRoot);

    // 验证 createdDirs 包含 6 个目录
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      expect(payload.createdDirs).toContain(dir);
    }

    // warnings 上限 100 条，每条 ≤ 500 字符
    expect(payload.warnings.length).toBeLessThanOrEqual(100);
    for (const warning of payload.warnings) {
      expect(warning.length).toBeLessThanOrEqual(500);
    }
  });

  // ─── 测试 6：完整端到端流程（综合断言）────────────────────────────────────

  it('should complete full init flow and pass all assertions', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');
    const wizard = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });

    // 首次安装（非 JSON 模式）
    const opts: InitOptions = { force: false, json: false };
    const result = await wizard.initialize(opts);

    // 退出码 0
    expect(result.exitCode).toBe(0);

    // 6 个直接子目录
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      expect(existsSync(path.join(installRoot, dir))).toBe(true);
    }

    // config/config.yaml 含 schema_version: "1.0"
    const configContent = await fs.readFile(
      path.join(installRoot, 'config', 'config.yaml'),
      'utf-8'
    );
    expect(configContent).toContain('schema_version');
    expect(configContent).toContain('1.0');

    // .installation.json 5 个字段 + schema_version = baseline
    const installJson = JSON.parse(
      await fs.readFile(path.join(installRoot, '.installation.json'), 'utf-8')
    );
    expect(installJson.schema_version).toBe('1.0');
    expect(installJson.installedAt).toBeTruthy();
    expect(installJson.cliVersion).toBeTruthy();
    expect(['win32', 'darwin', 'linux']).toContain(installJson.platform);
    expect(['npm-global', 'npm-local', 'dev']).toContain(installJson.installSource);

    // migrations/.gitkeep + migrations/README.md
    expect(existsSync(path.join(installRoot, 'migrations', '.gitkeep'))).toBe(true);
    expect(existsSync(path.join(installRoot, 'migrations', 'README.md'))).toBe(true);

    // payload.createdDirs 包含 6 个目录
    for (const dir of expectedDirs) {
      expect(result.payload.createdDirs).toContain(dir);
    }
  });

  // ─── 测试 7：第二次 init（已安装）→ no-op，existingDirs 准确 ───────────────

  it('should detect existing installation and return existingDirs without writing', async () => {
    const mockPathResolver = buildMockPathResolver(tempHome);
    const svm = new SchemaVersionManager('1.0');

    // 第一次安装
    const wizard1 = new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: mockPathResolver,
      schemaVersionManager: svm,
    });
    await wizard1.initialize({ force: false, json: false });

    // 记录安装后的文件内容（用于后续比对）
    const configBefore = await fs.readFile(
      path.join(installRoot, 'config', 'config.yaml'),
      'utf-8'
    );
    const installJsonBefore = await fs.readFile(
      path.join(installRoot, '.installation.json'),
      'utf-8'
    );

    // 第二次 init（不带 --force）：复用同一个 lockManager（已释放）
    const result2 = await wizard1.initialize({ force: false, json: true });

    // 退出码 0
    expect(result2.exitCode).toBe(0);

    // createdDirs 为空（no-op）
    expect(result2.payload.createdDirs).toHaveLength(0);

    // existingDirs 包含已存在的 6 个目录
    const expectedDirs = ['config', 'migrations', 'logs', 'backups', 'cas', 'state'];
    for (const dir of expectedDirs) {
      expect(result2.payload.existingDirs).toContain(dir);
    }

    // 文件内容未被修改
    const configAfter = await fs.readFile(
      path.join(installRoot, 'config', 'config.yaml'),
      'utf-8'
    );
    const installJsonAfter = await fs.readFile(
      path.join(installRoot, '.installation.json'),
      'utf-8'
    );
    expect(configAfter).toBe(configBefore);
    expect(installJsonAfter).toBe(installJsonBefore);
  });
});

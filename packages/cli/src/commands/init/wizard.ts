/**
 * InstallationWizard - specforge init 主体实现
 * 
 * 本模块实现 design.md "Components and Interfaces / InstallationWizard" 章节：
 * - 执行 CARU 四阶段（Created → Started → Locked → Inspected → Created2/NoOp → Persisted → Released）
 * - 任意失败 → Rolled → Released
 * 
 * 设计约束（遵守 async-resource-coding-standards + lessons-injected）：
 * - 构造器只赋值依赖句柄，不做 I/O（JS1）
 * - 使用 await using lock = ... 释放锁（JS2/JS3）
 * - 任何 Promise.race 在 finally 中 clearTimeout 败者（C1）
 * - detectExistingInstallation 仅看 6 个直接子目录
 * - --force 仅覆盖 config/config.yaml 与 .installation.json，migrations/ 与 logs/ 永不动
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.8, 4.1, 4.4, 4.7, 4.8, 4.10, 6.3, 7.1, 7.2, 7.3
 * 
 * @module wizard
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { InitOptions, InitResult, InitJsonPayload } from '../../distribution/types.js';
import { createLockManager, type LockManager } from '../../utils/lock-manager.js';
import { filesystemAdapter } from '../../utils/filesystem-adapter.js';
import { pathResolver, type PathResolver } from '../../utils/path-resolver.js';
import { runResourceCheck } from './resource-check.js';
import { loadInstallationRecord, writeInstallationRecord } from '../../distribution/installation-record.js';
import { generateDefaultConfig } from '../../distribution/default-config-generator.js';
import { SchemaVersionManager } from '../../distribution/schema-version-manager.js';
import { emitError } from '../../distribution/error-payload.js';

/**
 * 直接子目录列表（design.md REQ-4.1）
 */
const DIRECT_CHILD_DIRS = [
  'config',
  'migrations',
  'logs',
  'backups',
  'cas',
  'state',
] as const;

/**
 * 需要保护的目录（--force 不覆盖）
 */
const PROTECTED_DIRS = ['migrations', 'logs'] as const;

/**
 * InstallationWizard 依赖接口
 */
export interface WizardDependencies {
  lockManager: LockManager;
  filesystem: typeof filesystemAdapter;
  pathResolver: PathResolver;
  schemaVersionManager: SchemaVersionManager;
}

/**
 * InstallationWizard 默认实现
 */
export class InstallationWizard {
  private lockManager: LockManager;
  private filesystem: typeof filesystemAdapter;
  private pathResolver: PathResolver;
  private schemaVersionManager: SchemaVersionManager;

  /**
   * 构造器
   * 
   * lessons-injected JS1: 构造器只赋值依赖句柄，不做 I/O
   * 
   * @param deps - 依赖项（如果未提供则使用默认实现）
   */
  constructor(deps?: Partial<WizardDependencies>) {
    this.lockManager = deps?.lockManager ?? createLockManager('');
    this.filesystem = deps?.filesystem ?? filesystemAdapter;
    this.pathResolver = deps?.pathResolver ?? pathResolver;
    this.schemaVersionManager = deps?.schemaVersionManager ?? new SchemaVersionManager();
  }

  /**
   * 初始化安装向导
   * 
   * 实现 design.md "生命周期（CARU 四阶段）"：
   * 1. Created: new InstallationWizard()
   * 2. Started: initialize() 入口
   * 3. Locked: LockManager.acquire()
   * 4. Inspected: detectExistingInstallation()
   * 5. Created2 或 NoOp: 首次安装/带 --force → 创建，否则 no-op
   * 6. Persisted: 原子写 config + .installation.json
   * 7. Released: LockManager.release()
   * 
   * 任意失败 → Rolled(逆序删除已创建目录) → Released
   * 
   * @param opts - init 命令选项
   * @returns InitResult
   */
  async initialize(opts: InitOptions): Promise<InitResult> {
    // === Stage 1: Started ===
    // 解析安装根目录
    const installRoot = this.pathResolver.resolveInstallRoot(opts.installRootOverride);

    // === Stage 2: Locked ===
    // 使用 try/finally 确保锁被释放（JS2/JS3）
    // lessons-injected: Promise.race 超时时 finally 中 clearTimeout
    let lockAcquired = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const acquirePromise = this.lockManager.acquire(30000); // 30s 超时
      
      // Promise.race 实现超时（遵守 C1）
      const timeoutPromise = new Promise<boolean>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve(false); // 超时返回 false
        }, 30000);
      });

      lockAcquired = await Promise.race([acquirePromise, timeoutPromise]);

      // 清理败者 timer（C1）
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }

      if (!lockAcquired) {
        // 锁获取失败
        const exitCode = emitError(
          'INIT_LOCKED',
          {
            message: 'Another init process is currently running',
            details: {
              lockPath: (this.lockManager as any).lockPath,
            },
            remediation: {
              action: 'Wait for the other process to complete or kill it',
            },
          },
          opts.json
        );
        return this.createErrorResult(exitCode, installRoot);
      }
    } catch (error) {
      // 锁获取异常
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      
      const message = error instanceof Error ? error.message : String(error);
      const exitCode = emitError(
        'INIT_PERMISSION_DENIED',
        {
          message,
          details: { operation: 'lock acquisition' },
          remediation: {
            action: 'Check directory permissions',
          },
        },
        opts.json
      );
      return this.createErrorResult(exitCode, installRoot);
    }

    // 锁已获取，使用 try/finally 确保释放
    try {
      return await this._initializeWithLock(opts, installRoot);
    } finally {
      // === Stage 6: Released ===
      // 无论成功还是失败，都释放锁
      await this.lockManager.release();
    }
  }

  /**
   * 在持有锁的情况下执行初始化逻辑
   */
  private async _initializeWithLock(opts: InitOptions, installRoot: string): Promise<InitResult> {
    // 检测现有安装
    const existingInfo = await this.detectExistingInstallation(installRoot);

    // === Stage 4: Created2 或 NoOp ===
    const createdDirs: string[] = [];
    const warnings: string[] = [];

    // 运行资源检查（REQ-3.7）
    const resourceWarnings = await runResourceCheck(installRoot);
    warnings.push(...resourceWarnings);

    // 限制 warnings 上限 100 条（REQ-3.5）
    if (warnings.length > 100) {
      warnings.length = 100;
    }

    // 截断每条 warning 到 500 字符（REQ-3.5）
    for (let i = 0; i < warnings.length; i++) {
      if (warnings[i].length > 500) {
        warnings[i] = warnings[i].substring(0, 497) + '...';
      }
    }

    if (existingInfo.hasExisting && !opts.force) {
      // === NoOp 分支：已安装且未带 --force ===
      // 仅读取，不写入任何文件（REQ-3.3）
      
      // 组合 existingDirs：已存在目录 + 已存在的 init 管理文件
      const existingDirs = [...existingInfo.existingDirs];
      
      // 如果 .installation.json 存在，加入 existingDirs
      const instRecordPath = path.join(installRoot, '.installation.json');
      if (await this.filesystem.exists(instRecordPath)) {
        existingDirs.push('.installation.json');
      }

      // 如果 config/config.yaml 存在，加入 existingDirs
      const configPath = path.join(installRoot, 'config', 'config.yaml');
      if (await this.filesystem.exists(configPath)) {
        existingDirs.push('config/config.yaml');
      }

      // === REQ-7.3: 升级提示 ===
      // 检查磁盘 schema_version 与当前 baseline 是否一致
      // 如果 baseline > 磁盘版本，打印升级提示（含 CLI 版本、baseline、磁盘 schema_version、迁移命令）
      const instRecord = await loadInstallationRecord(installRoot);
      if (instRecord.kind === 'ok') {
        const diskSchemaVersion = instRecord.record.schema_version;
        const comparison = this.schemaVersionManager.compareForHealthCheck(
          diskSchemaVersion,
          this.schemaVersionManager.baseline
        );
        if (comparison === 'code_higher') {
          // 代码 baseline > 磁盘版本 → 需要迁移
          const cliVersion = process.env.npm_package_version || '0.1.0';
          const upgradeNotice = [
            `SpecForge upgrade detected:`,
            `  CLI version: ${cliVersion}`,
            `  CLI baseline: ${this.schemaVersionManager.baseline}`,
            `  On-disk schema_version: ${diskSchemaVersion}`,
            `  Run migration: specforge migration run`,
          ].join('\n');
          process.stderr.write(upgradeNotice + '\n');
        }
      }

      const payload = this.buildPayload({
        installRoot,
        createdDirs: [], // NoOp 时 createdDirs = []
        existingDirs,
        warnings,
        forceUsed: opts.force,
        exitCode: 0,
      });

      return { exitCode: 0, payload };
    }

    // === Created2 分支：首次安装或带 --force ===
    // 创建目录结构
    const createdSet = new Set<string>();

    try {
      for (const dirName of DIRECT_CHILD_DIRS) {
        const dirPath = path.join(installRoot, dirName);
        await this.filesystem.mkdirTracked(dirPath, createdSet);
        createdDirs.push(dirName);
      }

      // 创建 migrations/.gitkeep 和 migrations/README.md
      const migrationsReadmePath = path.join(installRoot, 'migrations', 'README.md');
      await this.filesystem.writeAtomic(
        migrationsReadmePath,
        `# Migrations

This directory contains schema migration scripts.

## Naming Convention

Migration scripts should follow the format: \`v<from>-to-v<to>.ts\`

Example: \`v1.0-to-v2.0.ts\`

## Usage

Run migrations using: \`specforge migration run\`
`
      );
      createdSet.add(migrationsReadmePath);
      createdDirs.push('migrations/README.md');

      const gitkeepPath = path.join(installRoot, 'migrations', '.gitkeep');
      await this.filesystem.writeAtomic(gitkeepPath, '');
      createdSet.add(gitkeepPath);
      createdDirs.push('migrations/.gitkeep');

      // === Stage 5: Persisted ===
      // 写入默认配置（仅当 --force 或文件不存在时）
      const configDirPath = path.join(installRoot, 'config');
      const configFilePath = path.join(configDirPath, 'config.yaml');
      const configExists = await this.filesystem.exists(configFilePath);

      if (!configExists || opts.force) {
        // 生成默认配置（包含 schema_version: "1.0" + P1/P2 flags = false）
        const defaultConfigYaml = generateDefaultConfig();
        await this.filesystem.writeAtomic(configFilePath, defaultConfigYaml);
      }

      // 写入安装记录（仅当 --force 或文件不存在时）
      const instRecordPath = path.join(installRoot, '.installation.json');
      const instRecordExists = await this.filesystem.exists(instRecordPath);

      if (!instRecordExists || opts.force) {
        const installationRecord = {
          schema_version: this.schemaVersionManager.baseline,
          installedAt: new Date().toISOString(),
          cliVersion: process.env.npm_package_version || '0.1.0',
          platform: this.pathResolver.platform(),
          installSource: this.pathResolver.installSourceFromArgv(process.argv),
        };
        // Pass baseline explicitly so writeInstallationRecord uses the correct value
        await writeInstallationRecord(installRoot, installationRecord, this.schemaVersionManager.baseline);
      }

      // 成功：返回结果（锁会在 finally 中释放）
    } catch (error) {
      // === 任意失败 → Rolled ===
      // 逆序删除已创建的目录和文件
      try {
        await this.filesystem.rollback(createdSet);
      } catch (rollbackError) {
        // 回滚失败记录警告，但不阻止流程继续
        console.warn('Rollback warning:', rollbackError);
      }

      // 错误处理
      const message = error instanceof Error ? error.message : String(error);
      const exitCode = emitError(
        'INIT_PERMISSION_DENIED',
        {
          message,
          details: { operation: 'directory creation' },
          remediation: {
            action: 'Check directory permissions or use --install-root to specify a different location',
            command: 'specforge init --install-root <path>',
          },
        },
        opts.json
      );
      return this.createErrorResult(exitCode, installRoot);
    }

    // 组合 existingDirs
    const existingDirs = existingInfo.existingDirs.slice();

    // 如果 .installation.json 存在（之前就存在），加入 existingDirs
    const instRecordPath = path.join(installRoot, '.installation.json');
    if (await this.filesystem.exists(instRecordPath) && !opts.force) {
      existingDirs.push('.installation.json');
    }

    // 如果 config/config.yaml 之前就存在，加入 existingDirs
    const configPath = path.join(installRoot, 'config', 'config.yaml');
    if (await this.filesystem.exists(configPath) && !opts.force) {
      existingDirs.push('config/config.yaml');
    }

    const payload = this.buildPayload({
      installRoot,
      createdDirs,
      existingDirs,
      warnings,
      forceUsed: opts.force,
      exitCode: 0,
    });

    return { exitCode: 0, payload };
  }

  /**
   * 检测现有安装
   * 
   * 仅看 6 个直接子目录是否存在（REQ-3.3）
   * 
   * @param installRoot - 安装根目录
   * @returns 检测结果
   */
  private async detectExistingInstallation(
    installRoot: string
  ): Promise<{ hasExisting: boolean; existingDirs: string[] }> {
    const existingDirs: string[] = [];

    for (const dirName of DIRECT_CHILD_DIRS) {
      const dirPath = path.join(installRoot, dirName);
      const exists = await this.filesystem.exists(dirPath);
      if (exists) {
        existingDirs.push(dirName);
      }
    }

    return {
      hasExisting: existingDirs.length > 0,
      existingDirs,
    };
  }

  /**
   * 构建 InitJsonPayload
   * 
   * @param params - payload 参数
   * @returns InitJsonPayload
   */
  private buildPayload(params: {
    installRoot: string;
    createdDirs: string[];
    existingDirs: string[];
    warnings: string[];
    forceUsed: boolean;
    exitCode: 0 | 1 | 2;
  }): InitJsonPayload {
    return {
      schema_version: '1.0',
      installRoot: params.installRoot,
      cliVersion: process.env.npm_package_version || '0.1.0',
      baseline: this.schemaVersionManager.baseline,
      createdDirs: params.createdDirs,
      existingDirs: params.existingDirs,
      warnings: params.warnings,
      forceUsed: params.forceUsed,
      exitCode: params.exitCode,
    };
  }

  /**
   * 创建错误结果
   * 
   * @param exitCode - 退出码
   * @param installRoot - 安装根目录
   * @returns InitResult
   */
  private createErrorResult(exitCode: number, installRoot: string): InitResult {
    return {
      exitCode: exitCode as 0 | 1 | 2,
      payload: {
        schema_version: '1.0',
        installRoot,
        cliVersion: process.env.npm_package_version || '0.1.0',
        baseline: this.schemaVersionManager.baseline,
        createdDirs: [],
        existingDirs: [],
        warnings: [],
        forceUsed: false,
        exitCode: exitCode as 0 | 1 | 2,
      },
    };
  }
}

/**
 * 创建 InstallationWizard 实例
 * 
 * @param installRoot - 安装根目录（可选，默认从 PathResolver 解析）
 * @returns InstallationWizard 实例
 */
export function createInstallationWizard(installRoot?: string): InstallationWizard {
  const root = installRoot || pathResolver.resolveInstallRoot();
  const lockManager = createLockManager(root);
  
  return new InstallationWizard({
    lockManager,
    filesystem: filesystemAdapter,
    pathResolver,
    schemaVersionManager: new SchemaVersionManager(),
  });
}

/**
 * 默认导出：创建并运行 init 向导
 */
export default createInstallationWizard;
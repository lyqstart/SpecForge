/**
 * Daemon HealthCheck - 守护进程启动早期的版本一致性检查
 * 
 * 本模块实现 design.md "健康检查（Daemon 启动早期）" 章节定义的逻辑：
 * 1. 加载 ~/.specforge/.installation.json 安装记录
 * 2. 比较磁盘 schema_version 与代码嵌入的 SCHEMA_VERSION_BASELINE
 * 3. 根据比较结果决定 daemon 是否可以启动
 * 
 * 设计约束：
 * - 不读盘获取 baseline（baseline 来自代码嵌入常量）
 * - 返回封闭的三态决策（equal / code_higher / code_lower）
 * - 错误消息包含 observed + expected 值
 * 
 * Requirements: 6.5, 7.5, 7.6
 * 
 * @module daemon-healthcheck
 */

import * as path from 'node:path';
import { SchemaVersionManager } from './schema-version-manager.js';
import { loadInstallationRecord, type LoadInstallationRecordResult } from './installation-record.js';
import { emitError } from './error-payload.js';
import type { ErrorCode } from './types.js';

/**
 * 运行 daemon 健康检查
 * 
 * 此函数在 daemon 启动早期调用，检查：
 * 1. .installation.json 是否存在且可解析
 * 2. 磁盘 schema_version 与代码 baseline 是否匹配
 * 
 * 决策逻辑（design.md "健康检查" 章节）：
 * - baseline > disk → exit 1（提示运行 migration）
 * - baseline < disk → exit 4（拒绝降级）
 * - .installation.json 损坏/缺失 → exit 5（提示运行 init 修复）
 * - equal → 继续启动
 * 
 * @param installRoot - 安装根目录（通常是 ~/.specforge/）
 * @param jsonMode - 是否为 JSON 输出模式
 * @returns 0 表示可以继续启动，非 0 表示应该退出
 */
export async function runDaemonHealthCheck(
  installRoot: string,
  jsonMode: boolean = false
): Promise<number> {
  // 使用默认 baseline（构建时通过 --define 注入）
  const svm = new SchemaVersionManager();
  const baseline = svm.baseline;

  // 1. 加载安装记录
  const recordResult = await loadInstallationRecord(installRoot);

  // 2. 根据加载结果分发决策
  const exitCode = dispatchHealthCheckResult(recordResult, baseline, jsonMode);

  return exitCode;
}

/**
 * 根据安装记录加载结果分发健康检查决策
 * 
 * @param recordResult - 安装记录加载结果
 * @param baseline - 代码嵌入的 baseline
 * @param jsonMode - 是否为 JSON 模式
 * @returns 退出码
 */
function dispatchHealthCheckResult(
  recordResult: LoadInstallationRecordResult,
  baseline: string,
  jsonMode: boolean
): number {
  // 处理安装记录加载失败的几种情况
  switch (recordResult.kind) {
    case 'missing':
      // .installation.json 不存在
      return emitError(
        'DAEMON_INSTALLATION_BROKEN',
        {
          message: 'Installation record not found',
          details: {
            file: '.installation.json',
            installRoot: '~/.specforge/',
          },
          remediation: {
            action: 'Run specforge init to repair your installation',
            command: 'specforge init',
          },
        },
        jsonMode
      );

    case 'unparseable':
      // .installation.json 解析失败（JSON 语法错误）
      return emitError(
        'DAEMON_INSTALLATION_BROKEN',
        {
          message: 'Installation record is corrupted or unparseable',
          details: {
            file: '.installation.json',
            issue: 'JSON parse error',
          },
          remediation: {
            action: 'Run specforge init to repair your installation',
            command: 'specforge init',
          },
        },
        jsonMode
      );

    case 'missing_field':
      // .installation.json 缺少必需字段
      return emitError(
        'DAEMON_INSTALLATION_BROKEN',
        {
          message: 'Installation record is missing required fields',
          details: {
            file: '.installation.json',
            requiredFields: ['schema_version', 'installedAt', 'cliVersion', 'platform', 'installSource'],
          },
          remediation: {
            action: 'Run specforge init to repair your installation',
            command: 'specforge init',
          },
        },
        jsonMode
      );

    case 'ok': {
      // 安装记录加载成功，进行 baseline 比较
      const diskSchemaVersion = recordResult.record.schema_version;
      const svm = new SchemaVersionManager();
      const verdict = svm.compareForHealthCheck(diskSchemaVersion, baseline);

      switch (verdict) {
        case 'equal':
          // Baseline 匹配，daemon 可以继续启动
          // 不打印任何消息，静默返回 0
          return 0;

        case 'code_higher':
          // 代码 baseline > 磁盘值，需要运行 migration
          // exit 1，提示运行迁移
          return emitError(
            'DAEMON_BASELINE_MISMATCH',
            {
              message: 'Schema version mismatch detected',
              details: {
                observed: diskSchemaVersion,
                expected: baseline,
                relation: 'code_higher',
              },
              remediation: {
                action: 'Run migration to upgrade your installation',
                command: 'specforge migration run',
              },
            },
            jsonMode
          );

        case 'code_lower':
          // 代码 baseline < 磁盘值，降级不被支持
          // exit 4，"downgrade not supported"
          return emitError(
            'DAEMON_DOWNGRADE_REJECTED',
            {
              message: 'Downgrade not supported',
              details: {
                observed: diskSchemaVersion,
                expected: baseline,
                relation: 'code_lower',
              },
              remediation: {
                action: 'Reinstall the previously installed version or remove ~/.specforge/ manually',
                command: 'npm install -g @specforge/cli@' + recordResult.record.cliVersion,
              },
            },
            jsonMode
          );
      }
    }
  }
}

/**
 * 获取健康检查的详细状态信息
 * 
 * 此函数用于在 daemon 启动时打印诊断信息（不退出）：
 * - 安装记录是否存在
 * - 磁盘 schema_version
 * - 代码 baseline
 * - 匹配状态
 * 
 * @param installRoot - 安装根目录
 * @returns 状态信息对象
 */
export async function getDaemonHealthCheckStatus(
  installRoot: string
): Promise<{
  exists: boolean;
  schemaVersion: string | null;
  baseline: string;
  status: 'ok' | 'mismatch_higher' | 'mismatch_lower' | 'broken' | 'missing';
  message?: string;
}> {
  const svm = new SchemaVersionManager();
  const baseline = svm.baseline;

  const recordResult = await loadInstallationRecord(installRoot);

  switch (recordResult.kind) {
    case 'missing':
      return {
        exists: false,
        schemaVersion: null,
        baseline,
        status: 'missing',
        message: 'Installation record not found',
      };

    case 'unparseable':
    case 'missing_field':
      return {
        exists: true,
        schemaVersion: null,
        baseline,
        status: 'broken',
        message: recordResult.kind === 'unparseable' 
          ? 'Installation record is corrupted' 
          : 'Installation record is missing required fields',
      };

    case 'ok': {
      const diskSchemaVersion = recordResult.record.schema_version;
      const verdict = svm.compareForHealthCheck(diskSchemaVersion, baseline);

      switch (verdict) {
        case 'equal':
          return {
            exists: true,
            schemaVersion: diskSchemaVersion,
            baseline,
            status: 'ok',
          };

        case 'code_higher':
          return {
            exists: true,
            schemaVersion: diskSchemaVersion,
            baseline,
            status: 'mismatch_higher',
            message: `Schema version mismatch: disk (${diskSchemaVersion}) < code (${baseline}). Run migration to upgrade.`,
          };

        case 'code_lower':
          return {
            exists: true,
            schemaVersion: diskSchemaVersion,
            baseline,
            status: 'mismatch_lower',
            message: `Downgrade detected: disk (${diskSchemaVersion}) > code (${baseline}). Downgrade not supported.`,
          };
      }
    }
  }
}

/**
 * 创建 daemon health check 的 hook 注册点适配器
 * 
 * 此函数供 daemon-core 在启动早期调用。
 * daemon-core 需要提供一个回调函数，用于在检查失败时打印错误消息。
 * 
 * @param installRoot - 安装根目录
 * @param onCheckFailed - 检查失败时的回调函数
 * @returns 异步函数，调用后返回退出码
 * 
 * @example
 * // daemon-core 中的集成示例
 * import { createHealthCheckHook } from '@specforge/cli/distribution/daemon-healthcheck';
 * 
 * const healthCheck = createHealthCheckHook('~/.specforge/', (message) => {
 *   daemonLogger.error(message);
 * });
 * 
 * const exitCode = await healthCheck();
 * if (exitCode !== 0) {
 *   daemonProcess.exit(exitCode);
 * }
 */
export function createHealthCheckHook(
  installRoot: string,
  onCheckFailed?: (message: string) => void
): () => Promise<number> {
  return async (): Promise<number> => {
    const exitCode = await runDaemonHealthCheck(installRoot);
    
    // 如果检查失败且提供了回调，调用回调打印错误消息
    if (exitCode !== 0 && onCheckFailed) {
      // 重新运行以获取状态消息
      const status = await getDaemonHealthCheckStatus(installRoot);
      if (status.message) {
        onCheckFailed(status.message);
      }
    }
    
    return exitCode;
  };
}
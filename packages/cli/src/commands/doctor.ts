/**
 * Doctor Command (version-unification spec, R10.3)
 *
 * 实现 `specforge doctor` 子命令，输出完整的版本与 manifest 状态信息。
 *
 * 输出字段（顺序固定）：
 *  - code_version              : 来自 getCodeVersion()
 *  - min_supported_data_schema : 来自 MIN_SUPPORTED_DATA_SCHEMA 常量
 *  - data_schema_version       : 从 project manifest 读取（缺失时 N/A）
 *  - user_manifest_path        : 用户级 manifest 绝对路径
 *  - project_manifest_path     : 项目级 manifest 绝对路径
 *  - mode                      : NORMAL_RW / MIGRATE / DEGRADED_HIGHER_THAN_KNOWN /
 *                                DEGRADED_MIGRATION_FAILED
 *
 * 设计要点：
 *  1) version-unification 包是 ESM (type: "module")，cli 是 CommonJS。
 *     必须通过 dynamic import 跨格式访问。
 *  2) doctor 不主动写文件、不修改 manifest，只读取并打印。
 *  3) 读取 manifest 时，如果文件不存在或解析失败，显示为 N/A，但不抛错。
 *  4) mode 取自 StartupCompatibilityChecker.check 的 kind 字段。
 *
 * Requirements: 10.3
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

/**
 * Doctor 命令的参数。
 *
 * 全部参数显式注入，便于单测；不依赖 `process.cwd()` 或 `os.homedir()` 隐式读取。
 */
export interface RunDoctorCommandArgs {
  /** 项目根目录（用于定位 project manifest）；默认 process.cwd() */
  projectDir?: string;
  /** 用户级 manifest 的绝对路径；默认 ~/.specforge/manifest.json */
  userManifestPath?: string;
  /** stdout 写入器（用于测试捕获） */
  write?: (chunk: string) => void;
  /** stderr 写入器（用于测试捕获） */
  writeErr?: (chunk: string) => void;
}

/**
 * 把 doctor 的内部状态渲染为多行人类可读输出。
 *
 * 输出形如：
 * ```
 * SpecForge Doctor
 *   code_version              : 6.0.0
 *   min_supported_data_schema : 3
 *   data_schema_version       : 5
 *   user_manifest_path        : C:\Users\...\manifest.json
 *   project_manifest_path     : D:\proj\.specforge\manifest.json
 *   mode                      : NORMAL_RW
 * ```
 */
function renderDoctorReport(state: {
  codeVersion: string;
  minSupportedDataSchema: number;
  dataSchemaVersion: number | 'N/A';
  userManifestPath: string;
  projectManifestPath: string;
  mode: string;
}): string {
  const lines: string[] = [];
  lines.push('SpecForge Doctor');
  lines.push(`  code_version              : ${state.codeVersion}`);
  lines.push(`  min_supported_data_schema : ${state.minSupportedDataSchema}`);
  lines.push(`  data_schema_version       : ${state.dataSchemaVersion}`);
  lines.push(`  user_manifest_path        : ${state.userManifestPath}`);
  lines.push(`  project_manifest_path     : ${state.projectManifestPath}`);
  lines.push(`  mode                      : ${state.mode}`);
  return lines.join('\n') + '\n';
}

/**
 * 默认用户 manifest 路径：~/.specforge/manifest.json。
 */
function defaultUserManifestPath(): string {
  return path.join(os.homedir(), '.specforge', 'manifest.json');
}

/**
 * 默认项目 manifest 路径：<projectDir>/.specforge/manifest.json。
 */
function defaultProjectManifestPath(projectDir: string): string {
  return path.join(projectDir, '.specforge', 'manifest.json');
}

/**
 * 执行 doctor 命令。
 *
 * @returns 进程退出码：始终返回 0（doctor 本身只读取状态，不做修改，
 *          因此除非读取 code/min schema 的协议层抛错，否则永远成功）
 */
export async function runDoctorCommand(
  args: RunDoctorCommandArgs = {}
): Promise<number> {
  const projectDir = args.projectDir ?? process.cwd();
  const userManifestPath = args.userManifestPath ?? defaultUserManifestPath();
  const projectManifestPath = defaultProjectManifestPath(projectDir);
  const write = args.write ?? ((s: string) => process.stdout.write(s));
  const writeErr = args.writeErr ?? ((s: string) => process.stderr.write(s));

  // version-unification 是 ESM 包，cli 是 CommonJS。
  // 用 dynamic import 跨格式访问协议层。
  let vu: typeof import('@specforge/version-unification');
  try {
    vu = await import('@specforge/version-unification');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeErr(`doctor: failed to load version-unification module: ${msg}\n`);
    return 1;
  }

  // 1. code_version
  let codeVersion: string;
  try {
    codeVersion = vu.getCodeVersion();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeErr(`doctor: failed to read code version: ${msg}\n`);
    return 1;
  }

  // 2. min_supported_data_schema
  const minSupportedDataSchema = vu.MIN_SUPPORTED_DATA_SCHEMA;
  const highestKnownSchema = vu.HIGHEST_KNOWN_SCHEMA;

  // 3. data_schema_version：从 project manifest 读，缺失/损坏时为 N/A
  // doctor 是只读诊断工具，直接 fs.readFile + JSON.parse 取 data_schema_version 字段，
  // 不走 version-unification 的 manifest-reader（避免 ESM exports 子路径暴露问题）。
  let dataSchemaVersion: number | 'N/A' = 'N/A';
  try {
    const raw = await fs.readFile(projectManifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'data_schema_version' in parsed &&
      typeof (parsed as { data_schema_version: unknown }).data_schema_version === 'number' &&
      Number.isInteger((parsed as { data_schema_version: number }).data_schema_version)
    ) {
      dataSchemaVersion = (parsed as { data_schema_version: number }).data_schema_version;
    }
  } catch {
    // 文件不存在 / JSON 解析失败 / 其他 IO 错误 → 维持 N/A
    dataSchemaVersion = 'N/A';
  }

  // 4. mode
  // 当 project manifest 缺失或 dsv 不可读时，把 mode 标为 'NORMAL_RW'（占位），
  // 因为缺失场景由 bootstrap 接管，doctor 只是状态快照。
  let mode: string;
  if (typeof dataSchemaVersion === 'number') {
    const startupMode = vu.StartupCompatibilityChecker.check({
      dataSchemaVersion,
      minSupportedDataSchema,
      highestKnownSchema,
    });
    mode = startupMode.kind;
  } else {
    mode = 'NORMAL_RW';
  }

  const report = renderDoctorReport({
    codeVersion,
    minSupportedDataSchema,
    dataSchemaVersion,
    userManifestPath,
    projectManifestPath,
    mode,
  });
  write(report);
  return 0;
}

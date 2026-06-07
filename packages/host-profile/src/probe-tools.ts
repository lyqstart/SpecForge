/**
 * 工具探测
 *
 * 探测一组常用开发工具是否可用、版本号是多少。
 *
 * 全部并行探测，单个失败不影响其他（用 Promise.allSettled）。
 * 每个工具探测有 3 秒超时（通过 safeSpawn）。
 */

import type { ToolInfo } from './types.js';
import { safeSpawn, whichCommand, extractVersion, parallelProbe } from './probe-utils.js';

/**
 * 标准工具列表
 *
 * 这些是 SpecForge 工具链常用的。每个 entry：
 * - name: 命令名（与 PATH 里的可执行文件名一致）
 * - args: 探测版本的参数
 * - regexHint: 可选，针对特殊输出格式提供 regex 提示
 */
interface ToolProbeSpec {
  name: string;
  versionArgs: string[];
  /** 某些工具版本号需要特殊处理（不在前几个数字里） */
  customExtractor?: (output: string) => string | null;
}

export const STANDARD_TOOLS: ToolProbeSpec[] = [
  // 包管理器 / 运行时
  { name: 'bun', versionArgs: ['--version'] },
  { name: 'node', versionArgs: ['--version'] }, // "v22.5.1"
  { name: 'npm', versionArgs: ['--version'] },
  { name: 'pnpm', versionArgs: ['--version'] },
  { name: 'yarn', versionArgs: ['--version'] },
  // 版本控制
  { name: 'git', versionArgs: ['--version'] }, // "git version 2.45.0"
  // 搜索 / 文本工具
  { name: 'rg', versionArgs: ['--version'] }, // "ripgrep 14.1.0"
  // 网络
  { name: 'curl', versionArgs: ['--version'] }, // "curl 8.4.0 ..."
  { name: 'wget', versionArgs: ['--version'] }, // "GNU Wget 1.21.4"
  // 语言
  { name: 'python', versionArgs: ['--version'] }, // "Python 3.12.4"
  { name: 'python3', versionArgs: ['--version'] },
  { name: 'cargo', versionArgs: ['--version'] }, // "cargo 1.78.0"
  { name: 'rustc', versionArgs: ['--version'] }, // "rustc 1.78.0"
  { name: 'go', versionArgs: ['version'] }, // "go version go1.22.0 ..."
  // 工具
  { name: 'docker', versionArgs: ['--version'] }, // "Docker version 24.0.5"
  { name: 'jq', versionArgs: ['--version'] }, // "jq-1.7"
  { name: 'gh', versionArgs: ['--version'] }, // "gh version 2.45.0"
];

/**
 * 探测单个工具
 */
async function probeTool(spec: ToolProbeSpec): Promise<{ name: string; info: ToolInfo }> {
  const path = await whichCommand(spec.name);
  if (!path) {
    return {
      name: spec.name,
      info: { available: false, version: null, path: null },
    };
  }

  const result = await safeSpawn(path, spec.versionArgs, { timeoutMs: 3000 });

  if (result.spawnError) {
    return {
      name: spec.name,
      info: {
        available: false,
        version: null,
        path,
        note: `执行失败: ${result.spawnError}`,
      },
    };
  }

  if (result.timedOut) {
    return {
      name: spec.name,
      info: {
        available: false,
        version: null,
        path,
        note: '版本探测超时',
      },
    };
  }

  // 版本输出可能在 stdout 或 stderr（某些工具如 wget、ffmpeg 写 stderr）
  const output = result.stdout + '\n' + result.stderr;
  const version = spec.customExtractor ? spec.customExtractor(output) : extractVersion(output);

  return {
    name: spec.name,
    info: {
      available: true,
      version,
      path,
    },
  };
}

/**
 * 并行探测所有标准工具
 */
export async function probeAllTools(): Promise<Record<string, ToolInfo>> {
  const probes = STANDARD_TOOLS.map(spec => ({
    name: spec.name,
    fn: () => probeTool(spec),
  }));

  const results = await parallelProbe(probes);

  const tools: Record<string, ToolInfo> = {};
  for (const r of results) {
    if (r.ok) {
      tools[r.value.name] = r.value.info;
    } else {
      tools[r.name] = {
        available: false,
        version: null,
        path: null,
        note: `探测异常: ${r.error}`,
      };
    }
  }

  return tools;
}

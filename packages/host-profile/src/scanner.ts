/**
 * Host Profile 主扫描器
 *
 * 组合 OS / Locale / Shell / Tools 探测，输出完整 HostProfile，
 * 原子写入 <OpenCode config>/sf-user/host-profile.json。
 *
 * 设计原则：
 * - 各探测并行（OS + Locale + Shells + Tools 同时跑）
 * - 单项失败不影响整体，写入 note 字段
 * - 整体超时 30 秒（兜底，正常 5 秒内）
 */
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveSpecForgeUserPath,
  resolveSpecForgeUserRoot,
} from '@specforge/types/user-level-paths';
import type { HostProfile, UserInfo, SpecForgePaths } from './types.js';
import { probeOs, probeLocale, detectCI } from './probe-os.js';
import { probeAllShells } from './probe-shells.js';
import { probeAllTools } from './probe-tools.js';
import { buildShellRules } from './build-rules.js';
import { atomicWriteJson, safeReadJson } from './probe-utils.js';

/** 当前扫描器版本 */
export const SCANNER_VERSION = '6.0.0';

/** 扫描结果有效期（30 天） */
export const PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Host Profile 文件路径 */
export function getHostProfilePath(): string {
  return resolveSpecForgeUserPath('host-profile.json');
}

export interface ScanOptions {
  /** 强制重新扫描，忽略缓存 */
  force?: boolean;
  /** 整体超时（毫秒），默认 30 秒 */
  overallTimeoutMs?: number;
  /** 是否打印进度日志（写 stderr） */
  verbose?: boolean;
}

export interface ScanResult {
  profile: HostProfile;
  /** true = 实际执行了扫描；false = 用了缓存 */
  scanned: boolean;
  /** 扫描耗时（毫秒），用缓存时为 0 */
  durationMs: number;
}

/**
 * 主扫描入口
 *
 * 流程：
 * 1. 检查缓存
 * 2. 并行探测 OS / Locale / Shells / Tools
 * 3. 构造 shell_rules
 * 4. 原子写入 <OpenCode config>/sf-user/host-profile.json
 * 5. 返回 ScanResult
 */
export async function scanHostProfile(opts: ScanOptions = {}): Promise<ScanResult> {
  const force = opts.force ?? false;
  const overallTimeoutMs = opts.overallTimeoutMs ?? 30000;
  const verbose = opts.verbose ?? false;
  const profilePath = getHostProfilePath();

  const log = (msg: string) => {
    if (verbose) console.error(`[host-profile] ${msg}`);
  };

  if (!force) {
    const cached = await loadCachedProfile(profilePath);
    if (cached && isCacheFresh(cached)) {
      log(`使用缓存档案（${cached.scanned_at}）`);
      return { profile: cached, scanned: false, durationMs: 0 };
    }
    if (cached && !isCacheFresh(cached)) {
      log(`缓存已过期或机器变更，重新扫描`);
    } else {
      log(`无缓存档案，开始首次扫描`);
    }
  } else {
    log(`强制扫描（--force）`);
  }

  const startTime = Date.now();
  const platform = os.platform();
  log(`并行探测：OS / Locale / Shells / Tools`);

  let overallTimer: NodeJS.Timeout | null = null;
  const overallTimeoutPromise = new Promise<never>((_, reject) => {
    overallTimer = setTimeout(() => {
      reject(new Error(`HOST_PROFILE_SCAN_TIMEOUT_${overallTimeoutMs}ms`));
    }, overallTimeoutMs);
  });

  let osInfo, localeInfo, shells, tools;
  try {
    [osInfo, localeInfo, shells, tools] = await Promise.race([
      Promise.all([
        probeOs(),
        probeLocale(platform),
        probeAllShells(platform),
        probeAllTools(),
      ]),
      overallTimeoutPromise,
    ]);
  } finally {
    if (overallTimer) {
      clearTimeout(overallTimer);
      overallTimer = null;
    }
  }

  const durationMs = Date.now() - startTime;
  log(`探测完成（${durationMs}ms），shells=${shells.filter(s => s.available).length}/${shells.length}，tools=${Object.values(tools).filter(t => t.available).length}/${Object.keys(tools).length}`);

  const ciMode = detectCI();
  const shellRules = buildShellRules(shells, platform, ciMode);
  const user: UserInfo = await buildUserInfo();

  const specforge: SpecForgePaths = {
    install_root: resolveSpecForgeUserRoot(),
    logs_dir: resolveSpecForgeUserPath('logs'),
  };

  const profile: HostProfile = {
    schema_version: '1.0',
    scanned_at: new Date().toISOString(),
    scanner_version: SCANNER_VERSION,
    hostname: os.hostname(),
    os: osInfo,
    locale: localeInfo,
    shells,
    tools,
    shell_rules: shellRules,
    user,
    specforge,
  };

  await atomicWriteJson(profilePath, profile);
  log(`已写入：${profilePath}`);

  return { profile, scanned: true, durationMs };
}

/** 读取缓存的 profile */
export async function loadCachedProfile(profilePath: string): Promise<HostProfile | null> {
  const data = await safeReadJson<HostProfile>(profilePath);
  if (!data) return null;
  if (data.schema_version !== '1.0') return null;
  if (typeof data.scanned_at !== 'string') return null;
  if (typeof data.hostname !== 'string') return null;
  return data;
}

/** 判断缓存是否新鲜 */
export function isCacheFresh(profile: HostProfile): boolean {
  if (profile.hostname !== os.hostname()) return false;
  if (profile.scanner_version !== SCANNER_VERSION) return false;

  const scannedTime = Date.parse(profile.scanned_at);
  if (isNaN(scannedTime)) return false;

  const ageMs = Date.now() - scannedTime;
  return ageMs < PROFILE_TTL_MS;
}

/** 构造用户信息 */
async function buildUserInfo(): Promise<UserInfo> {
  const platform = os.platform();
  const homeDir = os.homedir();
  const username = os.userInfo().username;
  let shellHistoryFile: string | null = null;

  if (platform === 'win32') {
    shellHistoryFile = path.join(
      homeDir,
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'PowerShell',
      'PSReadLine',
      'ConsoleHost_history.txt'
    );
  } else if (platform === 'darwin') {
    shellHistoryFile = path.join(homeDir, '.zsh_history');
  } else if (platform === 'linux') {
    shellHistoryFile = path.join(homeDir, '.bash_history');
  }

  return {
    username,
    home_dir: homeDir,
    shell_history_file: shellHistoryFile,
  };
}

/** 加载档案（不扫描） */
export async function loadHostProfile(): Promise<HostProfile | null> {
  return loadCachedProfile(getHostProfilePath());
}

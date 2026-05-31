/**
 * Host Profile 主扫描器
 *
 * 组合 OS / Locale / Shell / Tools 探测，输出完整 HostProfile，
 * 原子写入 ~/.specforge/host-profile.json。
 *
 * 设计原则：
 * - 各探测并行（OS + Locale + Shells + Tools 同时跑）
 * - 单项失败不影响整体，写入 note 字段
 * - 整体超时 30 秒（兜底，正常 5 秒内）
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type { HostProfile, UserInfo, SpecForgePaths } from './types';
import { probeOs, probeLocale, detectCI } from './probe-os';
import { probeAllShells } from './probe-shells';
import { probeAllTools } from './probe-tools';
import { buildShellRules } from './build-rules';
import { atomicWriteJson, safeReadJson } from './probe-utils';

/** 当前扫描器版本 */
export const SCANNER_VERSION = '6.0.0';

/** 扫描结果有效期（30 天） */
export const PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Host Profile 文件路径
 */
export function getHostProfilePath(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'host-profile.json');
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
 *   1. 检查缓存（如果不强制扫描 + 缓存新鲜 + hostname 匹配 → 直接返回缓存）
 *   2. 并行探测 OS / Locale / Shells / Tools
 *   3. 基于探测结果构造 shell_rules
 *   4. 原子写入 ~/.specforge/host-profile.json
 *   5. 返回 ScanResult
 */
export async function scanHostProfile(opts: ScanOptions = {}): Promise<ScanResult> {
  const force = opts.force ?? false;
  const overallTimeoutMs = opts.overallTimeoutMs ?? 30000;
  const verbose = opts.verbose ?? false;

  const profilePath = getHostProfilePath();
  const log = (msg: string) => {
    if (verbose) console.error(`[host-profile] ${msg}`);
  };

  // ── Step 1: 检查缓存 ──
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

  // ── Step 2: 并行探测 ──
  const startTime = Date.now();
  const platform = os.platform();

  log(`并行探测：OS / Locale / Shells / Tools`);

  // 用 Promise.race 实现整体超时
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
    // A1 败者清理：超时 timer 必须清理
    if (overallTimer) {
      clearTimeout(overallTimer);
      overallTimer = null;
    }
  }

  const durationMs = Date.now() - startTime;
  log(`探测完成（${durationMs}ms），shells=${shells.filter(s => s.available).length}/${shells.length}，tools=${Object.values(tools).filter(t => t.available).length}/${Object.keys(tools).length}`);

  // ── Step 3: 构造 shell_rules ──
  const ciMode = detectCI();
  const shellRules = buildShellRules(shells, platform, ciMode);

  // ── Step 4: 用户信息 ──
  const user: UserInfo = await buildUserInfo();

  // ── Step 5: SpecForge 路径 ──
  const specforge: SpecForgePaths = {
    install_root: path.join(os.homedir(), SPEC_DIR_NAME),
    logs_dir: path.join(os.homedir(), SPEC_DIR_NAME, 'logs'),
  };

  // ── Step 6: 组装完整 profile ──
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

  // ── Step 7: 原子写入 ──
  await atomicWriteJson(profilePath, profile);
  log(`已写入：${profilePath}`);

  return { profile, scanned: true, durationMs };
}

/**
 * 读取缓存的 profile
 */
export async function loadCachedProfile(profilePath: string): Promise<HostProfile | null> {
  const data = await safeReadJson<HostProfile>(profilePath);
  if (!data) return null;
  // 简单 schema 验证
  if (data.schema_version !== '1.0') return null;
  if (typeof data.scanned_at !== 'string') return null;
  if (typeof data.hostname !== 'string') return null;
  return data;
}

/**
 * 判断缓存是否新鲜
 *
 * 条件：
 *   - 距离上次扫描小于 PROFILE_TTL_MS（30 天）
 *   - hostname 与当前一致（防换机器后缓存过时）
 *   - scanner_version 与当前一致（升级后强制重扫，保证 schema 兼容）
 */
export function isCacheFresh(profile: HostProfile): boolean {
  // hostname 必须一致
  if (profile.hostname !== os.hostname()) return false;

  // 扫描器版本必须一致
  if (profile.scanner_version !== SCANNER_VERSION) return false;

  // 时间未过期
  const scannedTime = Date.parse(profile.scanned_at);
  if (isNaN(scannedTime)) return false;
  const ageMs = Date.now() - scannedTime;
  return ageMs < PROFILE_TTL_MS;
}

/**
 * 构造用户信息
 */
async function buildUserInfo(): Promise<UserInfo> {
  const platform = os.platform();
  const homeDir = os.homedir();
  const username = os.userInfo().username;

  let shellHistoryFile: string | null = null;
  if (platform === 'win32') {
    // PowerShell PSReadLine 历史
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
    // 优先 zsh，回退 bash
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

/**
 * 加载档案（不扫描）
 *
 * 用于其他工具（如 sf_safe_bash）只读访问当前档案。
 * 档案不存在或损坏返回 null，调用方应自己决定是否触发扫描。
 */
export async function loadHostProfile(): Promise<HostProfile | null> {
  return loadCachedProfile(getHostProfilePath());
}

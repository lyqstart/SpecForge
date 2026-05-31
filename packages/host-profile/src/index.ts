/**
 * @specforge/host-profile — Host Profile 扫描器
 *
 * 组合 OS / Locale / Shell / Tools 探测，输出完整 HostProfile，
 * 原子写入 ~/.specforge/host-profile.json。
 *
 * 用法：
 *   import { scanHostProfile, loadHostProfile } from '@specforge/host-profile';
 */

// Types
export type {
  ShellName,
  CommonToolName,
  OsInfo,
  LocaleInfo,
  ShellInfo,
  ToolInfo,
  ShellRules,
  UserInfo,
  SpecForgePaths,
  HostProfile,
  ProbeError,
} from './types';

// Scanner
export {
  SCANNER_VERSION,
  PROFILE_TTL_MS,
  getHostProfilePath,
  scanHostProfile,
  loadHostProfile,
  isCacheFresh,
  loadCachedProfile,
} from './scanner';

export type { ScanOptions, ScanResult } from './scanner';

// Utils（供外部复用）
export {
  safeSpawn,
  whichCommand,
  extractVersion,
  detectCI,
  atomicWriteJson,
  safeReadJson,
} from './probe-utils';

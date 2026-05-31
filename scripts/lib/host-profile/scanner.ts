/**
 * Re-export from @specforge/host-profile
 *
 * 保持向后兼容，scripts/scan-host-profile.ts 仍然可以从此文件 import。
 */
export {
  SCANNER_VERSION,
  PROFILE_TTL_MS,
  getHostProfilePath,
  scanHostProfile,
  loadHostProfile,
  isCacheFresh,
  loadCachedProfile,
} from '../../../packages/host-profile/src/index';

export type { ScanOptions, ScanResult } from '../../../packages/host-profile/src/index';

// Re-export types for consumers that import from this file
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
} from '../../../packages/host-profile/src/index';

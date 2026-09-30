// =============================================================================
// Installer path utilities (sf-installer.ts + scripts/lib/*.ts)
// =============================================================================

import * as osModule from 'node:os';
import * as pathModule from 'node:path';

/**
 * Resolve the user-level directory where SpecForge shared components are installed.
 * Defaults to ~/.config/opencode on all platforms.
 */
export function resolveUserLevelDirectory(): string {
  const explicit = process.env.OPENCODE_CONFIG_DIR?.trim();
  if (explicit) return pathModule.resolve(pathModule.normalize(explicit));
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return pathModule.join(xdg, 'opencode');
  return pathModule.join(osModule.homedir(), '.config', 'opencode');
}

/** Current installer coordinate root (the OpenCode configuration root). */
export function resolveSpecForgeInstallRoot(): string {
  return resolveUserLevelDirectory();
}

/** Current private SpecForge user subtree below the OpenCode config root. */
export function resolveSpecForgePrivateRoot(): string {
  return pathModule.join(resolveSpecForgeInstallRoot(), 'sf-user');
}

/**
 * Convert a POSIX-style relative path (forward slashes) to the native
 * path separator for the current OS.
 */
export function posixToNative(posixPath: string): string {
  if (pathModule.sep === '/') return posixPath;
  return posixPath.replace(/\//g, pathModule.sep);
}

/**
 * Convert a native path to POSIX style (forward slashes).
 */
export function toPosix(nativePath: string): string {
  return nativePath.replace(/\\/g, '/');
}

/** SpecForge 项目级治理目录名 */
export const SPEC_DIR_NAME = ".specforge" as const;

/** SpecForge 当前私有用户级目录名 */
export const SPEC_USER_DIR_NAME = "sf-user" as const;

/**
 * SpecForge 当前私有用户级根目录。
 * Legacy ~/.specforge/install.json may be read by dedicated migration code only;
 * it must never redirect current writes or executable loading.
 */
export function resolveSpecForgeHome(): string {
  return resolveSpecForgePrivateRoot();
}

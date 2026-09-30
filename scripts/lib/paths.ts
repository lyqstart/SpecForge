// =============================================================================
// Installer path utilities (sf-installer.ts + scripts/lib/*.ts)
// =============================================================================

import * as osModule from 'node:os';
import * as pathModule from 'node:path';

/**
 * Resolve the user-level directory where SpecForge shared components are installed.
 *
 * Resolution order:
 *   1. If OPENCODE_CONFIG_DIR is set: use it directly (absolute or resolved relative)
 *   2. If XDG_CONFIG_HOME is set: $XDG_CONFIG_HOME/opencode
 *   3. Otherwise: $HOME/.config/opencode
 *
 * OPENCODE_CONFIG_DIR is an explicit override used primarily in testing
 * and CI environments where the full path is specified directly.
 *
 * XDG follows the XDG Base Directory Specification:
 *   $XDG_CONFIG_HOME defines the base directory for user-specific configuration files.
 *   If not set, defaults to $HOME/.config.
 */
export function resolveUserLevelDirectory(): string {
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir && configDir.trim() !== '') {
    return pathModule.resolve(pathModule.normalize(configDir));
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim() !== '') {
    return pathModule.join(xdgConfigHome, 'opencode');
  }
  const home = osModule.homedir();
  return pathModule.join(home, '.config', 'opencode');
}

/**
 * Resolve the current installer coordinate root.
 *
 * Public OpenCode assets and the root-level SpecForge manifest are installed
 * relative to the OpenCode configuration root.
 */
export function resolveSpecForgeInstallRoot(): string {
  return resolveUserLevelDirectory();
}

/** Resolve the private SpecForge user subtree below the OpenCode config root. */
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

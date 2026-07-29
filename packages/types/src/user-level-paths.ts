/// <reference types="node" />
/**
 * Canonical user-level paths for SpecForge.
 *
 * Project-local governance data remains under <project>/.specforge/.
 * Current user-level runtime data MUST NOT be written to ~/.specforge/.
 */
import * as os from "node:os";
import * as path from "node:path";

export type UserLevelPathEnv = Readonly<Record<string, string | undefined>>;

export interface UserLevelPathOptions {
  env?: UserLevelPathEnv;
  homeDir?: string;
}

/**
 * Resolve the OpenCode user configuration root.
 *
 * Priority:
 * 1. OPENCODE_CONFIG_DIR
 * 2. XDG_CONFIG_HOME/opencode
 * 3. <home>/.config/opencode
 */
export function resolveOpenCodeConfigRoot(
  options: UserLevelPathOptions = {},
): string {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  const explicit = env["OPENCODE_CONFIG_DIR"]?.trim();
  if (explicit) {
    return path.resolve(path.normalize(explicit));
  }

  const xdg = env["XDG_CONFIG_HOME"]?.trim();
  if (xdg) {
    return path.join(xdg, "opencode");
  }

  return path.join(homeDir, ".config", "opencode");
}

/** Current SpecForge user-level data root. */
export function resolveSpecForgeUserRoot(
  options: UserLevelPathOptions = {},
): string {
  return path.join(resolveOpenCodeConfigRoot(options), "sf-user");
}

/** Resolve a path under the current SpecForge user-level data root. */
export function resolveSpecForgeUserPath(
  ...segments: string[]
): string {
  return path.join(resolveSpecForgeUserRoot(), ...segments);
}

/**
 * Installer Manifest is intentionally outside sf-user.
 * This is the canonical path confirmed by ADR-010.
 */
export function resolveSpecForgeManifestPath(
  options: UserLevelPathOptions = {},
): string {
  return path.join(resolveOpenCodeConfigRoot(options), "specforge-manifest.json");
}

/**
 * Current SpecForge user-root and platform resolver.
 */

import * as os from "node:os";
import * as path from "node:path";
import { resolveSpecForgeUserRoot } from "@specforge/types/user-level-paths";

export interface PathResolver {
  /** Resolve the current <OpenCode config>/sf-user root. */
  resolveInstallRoot(override?: string): string;
  resolveHomeDirectory(): string;
  platform(): "win32" | "darwin" | "linux";
  arch(): "x64" | "arm64";
}

export class DefaultPathResolver implements PathResolver {
  resolveInstallRoot(override?: string): string {
    if (override) {
      return path.resolve(override);
    }

    if (process.env.OPENCODE_CONFIG_DIR?.trim() || process.env.XDG_CONFIG_HOME?.trim()) {
      return resolveSpecForgeUserRoot();
    }

    return resolveSpecForgeUserRoot({ homeDir: this.resolveHomeDirectory() });
  }

  resolveHomeDirectory(): string {
    const envVar = this.platform() === "win32" ? "USERPROFILE" : "HOME";
    const homeDirectory = process.env[envVar];

    if (!homeDirectory?.trim()) {
      const error = new Error(
        `USER_HOME_NOT_SET: ${envVar} environment variable is not set or empty. ` +
        `Please set ${envVar} to your home directory path.`
      );
      (error as Error & { code: string }).code = "USER_HOME_NOT_SET";
      throw error;
    }

    return homeDirectory;
  }

  platform(): "win32" | "darwin" | "linux" {
    const platform = os.platform();
    if (platform === "win32") return "win32";
    if (platform === "darwin") return "darwin";
    return "linux";
  }

  arch(): "x64" | "arm64" {
    return os.arch() === "arm64" ? "arm64" : "x64";
  }
}

export const pathResolver = new DefaultPathResolver();

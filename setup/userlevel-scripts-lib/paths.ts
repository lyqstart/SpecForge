/**
 * Path discovery for Kiro task metadata.
 *
 * Kiro stores meta files at:
 *   ~/.kiro/tasks/<workspaceHash>/<specName>.meta.json
 *
 * Rather than reverse-engineering Kiro's workspace_hash algorithm, we
 * glob the tasks dir and pick the workspace whose meta files reference
 * the current repo root. In the common case there is exactly one hash
 * per machine per repo.
 *
 * schema_version: 1.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';

export interface KiroWorkspace {
  hash: string;
  tasksDir: string;
}

export class KiroPaths {
  constructor(public readonly repoRoot: string) {}

  get kiroTasksRoot(): string {
    return path.join(os.homedir(), '.kiro', 'tasks');
  }

  get specsRoot(): string {
    return path.join(this.repoRoot, '.kiro', 'specs');
  }

  /**
   * Locate the workspace hash dir used by Kiro for this repo.
   *
   * Strategy:
   *   1. If ~/.kiro/tasks has exactly one child dir, use it (fast path).
   *   2. Otherwise, scan each child's *.meta.json and match `specUri`
   *      against the current repo root. The first hit wins.
   *   3. If nothing matches and there is at least one hash dir, fall
   *      back to the most-recently-modified hash dir.
   *
   * Throws if ~/.kiro/tasks does not exist or is empty.
   */
  async findWorkspace(): Promise<KiroWorkspace> {
    const root = this.kiroTasksRoot;
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `Kiro tasks root not found: ${root}. Has Kiro ever run tasks on this machine?`,
        );
      }
      throw err;
    }

    const dirs: { name: string; fullPath: string; mtimeMs: number }[] = [];
    for (const name of entries) {
      const full = path.join(root, name);
      try {
        const st = await fs.stat(full);
        if (st.isDirectory()) {
          dirs.push({ name, fullPath: full, mtimeMs: st.mtimeMs });
        }
      } catch {
        /* ignore */
      }
    }

    if (dirs.length === 0) {
      throw new Error(`Kiro tasks root is empty: ${root}`);
    }

    if (dirs.length === 1) {
      return { hash: dirs[0]!.name, tasksDir: dirs[0]!.fullPath };
    }

    // Multiple hashes — match by specUri in meta files.
    const repoUriPrefix = this.specUriPrefix();
    for (const d of dirs) {
      const metas = (await fs.readdir(d.fullPath)).filter((f) =>
        f.endsWith('.meta.json'),
      );
      for (const meta of metas) {
        try {
          const raw = await fs.readFile(path.join(d.fullPath, meta), 'utf-8');
          const parsed = JSON.parse(raw);
          const first = Object.values(parsed?.tasks ?? {})[0] as
            | { specUri?: string }
            | undefined;
          if (first?.specUri && first.specUri.startsWith(repoUriPrefix)) {
            return { hash: d.name, tasksDir: d.fullPath };
          }
        } catch {
          /* keep scanning */
        }
      }
    }

    // Fallback: newest hash dir.
    dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { hash: dirs[0]!.name, tasksDir: dirs[0]!.fullPath };
  }

  private specUriPrefix(): string {
    // Kiro's specUri is file:///<drive>%3A/... so a simple file:// prefix
    // is enough for match purposes.
    return pathToFileURL(this.repoRoot).toString().split('://')[0] + '://';
  }

  /**
   * Absolute path to the meta file for a given spec. Does not check existence.
   */
  metaPathFor(ws: KiroWorkspace, specName: string): string {
    return path.join(ws.tasksDir, `${specName}.meta.json`);
  }

  /**
   * Absolute path to a spec's tasks.md.
   */
  tasksMdPathFor(specName: string): string {
    return path.join(this.specsRoot, specName, 'tasks.md');
  }

  /**
   * Absolute path to a spec's PBT metadata file. Kiro derives this by
   * replacing `.md` with `.meta.json` on the tasks.md path (see
   * kiro.kiro-agent/dist/extension.js function `a30`). This file holds
   * `pbtResults[taskId]` and is written by Kiro's `update_pbt_status`
   * tool, which on Windows intermittently fails with EPERM because the
   * VS Code extension host holds a watcher handle on the file. We
   * write to the same location using a copy-based atomic writer to
   * dodge the rename race.
   */
  tasksMetaPathFor(specName: string): string {
    return path.join(this.specsRoot, specName, 'tasks.meta.json');
  }

  /**
   * Enumerate active spec names under .kiro/specs (skips _archive and files).
   */
  async listActiveSpecs(): Promise<string[]> {
    const entries = await fs.readdir(this.specsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name)
      .sort();
  }
}

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
  const home = osModule.homedir();
  return pathModule.join(home, '.config', 'opencode');
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

/** SpecForge 用户级安装目录名 */
export const SPEC_DIR_NAME = ".specforge" as const;

/**
 * SpecForge 安装根目录路径（~/.specforge/）
 *
 * 读取 install.json 中的 base_dir 字段获取安装根路径。
 * 若 install.json 不存在或无法解析，回退到 ~/.specforge/。
 */
export function resolveSpecForgeHome(): string {
  const home = osModule.homedir();
  const defaultDir = pathModule.join(home, '.specforge');

  try {
    const installJsonPath = pathModule.join(defaultDir, 'install.json');
    const raw = require('node:fs').readFileSync(installJsonPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.base_dir === 'string') {
      // 展开 ~ 为 home 目录
      return data.base_dir.replace(/^~[/\\]/, home + pathModule.sep);
    }
  } catch {
    // install.json 不存在或解析失败，使用默认路径
  }

  return defaultDir;
}

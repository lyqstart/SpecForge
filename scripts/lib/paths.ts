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

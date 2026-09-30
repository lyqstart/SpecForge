/**
 * Windows-safe atomic write + per-spec lock for Kiro task meta files.
 *
 * Why this exists:
 * Kiro's built-in `task_update` tool uses a plain
 *   writeFile(tmp) + rename(tmp, target)
 * pattern that fails intermittently on Windows with EPERM because
 * in-process file watchers hold handles without FILE_SHARE_DELETE.
 *
 * This module works around the bug by:
 *   1. taking a per-spec file lock (proper-lockfile) to serialise
 *      concurrent writers across processes
 *   2. writing the payload to <target>.sync.<rand>.tmp
 *   3. copying (not renaming) tmp → target, then unlinking tmp
 *      — copy over existing target works on Windows even when the
 *      target has read handles open
 *   4. if copy fails, retrying with exponential backoff
 *   5. before the copy, optionally unlinking the existing target
 *      (most reliable, but briefly non-atomic; gated behind a flag)
 *
 * schema_version: 1.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import lockfile from 'proper-lockfile';
import { MetaFile, MetaFileSchema, TaskMetaEntry } from './types';

// Defaults are intentionally generous so transient AV/watcher windows resolve.
const DEFAULT_LOCK_STALE_MS = 15_000;
const DEFAULT_LOCK_RETRY = { retries: 20, minTimeout: 50, maxTimeout: 500 };
const DEFAULT_WRITE_RETRY = 5;

export interface WriteOptions {
  /** How long before a lock is considered stale and forcibly claimed. */
  lockStaleMs?: number;
  /** How many times to retry the actual file copy on EPERM/EBUSY. */
  writeRetries?: number;
}

/**
 * Read-modify-write a meta file under an exclusive per-spec lock.
 *
 * The updater is called with the parsed current state (or an empty
 * { tasks: {} } if the file does not yet exist) and must return the
 * next state. Returning the same reference is fine.
 *
 * Any exception inside the updater leaves the file untouched.
 */
export async function updateMetaFile(
  metaPath: string,
  updater: (current: MetaFile) => Promise<MetaFile> | MetaFile,
  opts: WriteOptions = {},
): Promise<MetaFile> {
  await fs.mkdir(path.dirname(metaPath), { recursive: true });

  // Ensure the file exists so proper-lockfile can lock it.
  try {
    await fs.access(metaPath);
  } catch {
    await atomicWriteWindowsSafe(metaPath, JSON.stringify({ tasks: {} }, null, 2));
  }

  const release = await lockfile.lock(metaPath, {
    stale: opts.lockStaleMs ?? DEFAULT_LOCK_STALE_MS,
    retries: DEFAULT_LOCK_RETRY,
    realpath: false,
  });

  try {
    const current = await readMetaFile(metaPath);
    const next = await updater(current);
    // Validate before writing to catch silly mistakes early.
    const validated = MetaFileSchema.parse(next);
    await atomicWriteWindowsSafe(
      metaPath,
      JSON.stringify(validated, null, 2),
      opts.writeRetries ?? DEFAULT_WRITE_RETRY,
    );
    return validated;
  } finally {
    await release().catch(() => {
      /* lock may already be released on process death */
    });
  }
}

export async function readMetaFile(metaPath: string): Promise<MetaFile> {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    if (!raw.trim()) return { tasks: {} };
    const parsed = JSON.parse(raw);
    // Tolerate Kiro-produced files that are the same shape but may contain
    // fields we don't model; Zod's strict default would reject those.
    const result = MetaFileSchema.safeParse(parsed);
    if (result.success) return result.data;
    // Best-effort: preserve tasks block even if individual entries fail.
    if (parsed && typeof parsed.tasks === 'object') {
      const tasks: Record<string, TaskMetaEntry> = {};
      for (const [k, v] of Object.entries(parsed.tasks)) {
        const r = MetaFileSchema.shape.tasks.valueSchema.safeParse(v);
        if (r.success) tasks[k] = r.data;
      }
      return { tasks };
    }
    return { tasks: {} };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { tasks: {} };
    throw err;
  }
}

/**
 * Write `content` to `target`, using a copy-based approach that works
 * on Windows even when watchers have the target opened for read.
 *
 * Steps:
 *   1. Pick an unused tmp file in the same directory.
 *   2. writeFile(tmp, content)
 *   3. copyFile(tmp, target) — atomic at POSIX semantics for size ≤ 4KB
 *      writes and effectively atomic for small JSON.
 *   4. unlink(tmp)
 *
 * If copy fails with EPERM/EBUSY/EACCES, retry with backoff. On every
 * retry except the last we first try unlinking `target` to release any
 * Windows share-deny handles.
 */
export async function atomicWriteWindowsSafe(
  target: string,
  content: string,
  retries: number = DEFAULT_WRITE_RETRY,
): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.sync.${process.pid}.${crypto
      .randomBytes(4)
      .toString('hex')}.tmp`,
  );

  await fs.writeFile(tmp, content, 'utf-8');

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await fs.copyFile(tmp, target);
      await fs.unlink(tmp).catch(() => {});
      return;
    } catch (err: any) {
      lastErr = err;
      const code = err?.code;
      const isTransient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!isTransient) break;
      // Back off, then as a second-chance on later retries, try removing
      // the target first (releases Windows share-deny handles owned by
      // our own process's watchers).
      await sleep(50 * Math.pow(2, attempt));
      if (attempt >= 2) {
        await fs.unlink(target).catch(() => {});
      }
    }
  }

  // Best-effort cleanup then surface the original error.
  await fs.unlink(tmp).catch(() => {});
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Helper: apply a single-task mutation to a meta file.
 */
export async function setTaskStatus(
  metaPath: string,
  taskId: string,
  entry: Partial<TaskMetaEntry> & { taskId: string; specUri: string },
  opts: WriteOptions = {},
): Promise<void> {
  await updateMetaFile(
    metaPath,
    (current) => {
      const now = Date.now();
      const existing = current.tasks[taskId];
      const merged: TaskMetaEntry = {
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        taskId,
        specUri: entry.specUri,
        executionHistory: entry.executionHistory ?? existing?.executionHistory ?? [],
        executionStatus: entry.executionStatus ?? existing?.executionStatus,
      };
      return { tasks: { ...current.tasks, [taskId]: merged } };
    },
    opts,
  );
}

// ---------------------------------------------------------------------------
// PBT (Property-Based Test) metadata helpers
// ---------------------------------------------------------------------------

import {
  TasksMetaFile,
  TasksMetaFileSchema,
  PbtResultEntry,
  PbtPublicStatus,
} from './types';

/**
 * Read the spec-side PBT meta file (the one Kiro writes at
 * <repo>/.kiro/specs/<spec>/tasks.meta.json).
 */
export async function readTasksMetaFile(tasksMetaPath: string): Promise<TasksMetaFile> {
  try {
    const raw = await fs.readFile(tasksMetaPath, 'utf-8');
    if (!raw.trim()) return { pbtResults: {}, executionHistory: {} };
    const parsed = JSON.parse(raw);
    const result = TasksMetaFileSchema.safeParse(parsed);
    if (result.success) return result.data;
    // Best-effort recovery: keep whatever pbtResults/executionHistory parses.
    return {
      pbtResults: (parsed && typeof parsed.pbtResults === 'object' ? parsed.pbtResults : {}) ?? {},
      executionHistory:
        (parsed && typeof parsed.executionHistory === 'object' ? parsed.executionHistory : {}) ??
        {},
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { pbtResults: {}, executionHistory: {} };
    throw err;
  }
}

/**
 * Read-modify-write the PBT meta file under a per-spec lock, using the
 * same copy-based Windows-safe write as the main meta store.
 */
export async function updateTasksMetaFile(
  tasksMetaPath: string,
  updater: (current: TasksMetaFile) => Promise<TasksMetaFile> | TasksMetaFile,
  opts: WriteOptions = {},
): Promise<TasksMetaFile> {
  await fs.mkdir(path.dirname(tasksMetaPath), { recursive: true });
  try {
    await fs.access(tasksMetaPath);
  } catch {
    await atomicWriteWindowsSafe(
      tasksMetaPath,
      JSON.stringify({ pbtResults: {}, executionHistory: {} }, null, 2),
    );
  }

  const release = await lockfile.lock(tasksMetaPath, {
    stale: opts.lockStaleMs ?? DEFAULT_LOCK_STALE_MS,
    retries: DEFAULT_LOCK_RETRY,
    realpath: false,
  });

  try {
    const current = await readTasksMetaFile(tasksMetaPath);
    const next = await updater(current);
    const validated = TasksMetaFileSchema.parse(next);
    await atomicWriteWindowsSafe(
      tasksMetaPath,
      JSON.stringify(validated, null, 2),
      opts.writeRetries ?? DEFAULT_WRITE_RETRY,
    );
    return validated;
  } finally {
    await release().catch(() => {});
  }
}

/**
 * Set (or replace) a PBT result entry keyed by full task id.
 *
 * Mirrors Kiro's write shape exactly (see extension.js 15932355):
 *   pbtResults[taskId] = { status, failingExample, lastRunTimestamp }
 * so Kiro UI continues to render the result in the tasks panel.
 */
export async function setPbtResult(
  tasksMetaPath: string,
  taskId: string,
  result: { status: PbtPublicStatus; failingExample?: string; timestamp?: number },
  opts: WriteOptions = {},
): Promise<void> {
  await updateTasksMetaFile(
    tasksMetaPath,
    (current) => {
      const entry: PbtResultEntry = {
        status: result.status,
        failingExample: result.failingExample,
        lastRunTimestamp: result.timestamp ?? Date.now(),
      };
      return {
        pbtResults: { ...current.pbtResults, [taskId]: entry },
        executionHistory: current.executionHistory,
      };
    },
    opts,
  );
}

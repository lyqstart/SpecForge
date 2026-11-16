import * as fs from 'fs/promises';
import path from 'node:path';

const operations = new Map<string, Promise<unknown>>();

/** Coordinate checkpoint handles inside the single daemon owner, including distinct WAL instances.
 * Windows cannot replace a checkpoint while a reader still holds it open. This lock covers only
 * file I/O: never acquire a WAL operation or invoke another checkpoint operation inside action.
 * It does not retry, suppress I/O errors, or substitute the checkpoint for authoritative events.
 */
export async function withCheckpointFileAccess<T>(
  file: string,
  action: () => Promise<T>
): Promise<T> {
  const resolved = path.resolve(file);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const previous = operations.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(action);
  operations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (operations.get(key) === pending) operations.delete(key);
  }
}

export function readCheckpointFile(file: string): Promise<string> {
  return withCheckpointFileAccess(file, () => fs.readFile(file, 'utf-8'));
}

export function publishCheckpointFile(temporary: string, file: string): Promise<void> {
  return withCheckpointFileAccess(file, () => fs.rename(temporary, file));
}

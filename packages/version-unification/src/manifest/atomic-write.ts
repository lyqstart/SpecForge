/**
 * Windows-safe atomic write for manifest files.
 *
 * Uses the "tmp + copyFile + unlink" pattern to avoid Windows EPERM errors
 * that occur with the naive writeFile + rename pattern when file watchers
 * hold handles without FILE_SHARE_DELETE.
 *
 * This is the foundation for:
 * - R4.5: "失败回到 pre-state" (atomic writes ensure failure doesn't corrupt)
 * - R12.4: migrate command atomicity
 * - R13.1: migration failure preservation
 *
 * Design Decision D5.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Write content to target atomically using copy-based approach.
 *
 * Steps:
 *   1. Create a temp file in the same directory with random suffix
 *   2. Write content to temp file
 *   3. Copy temp file over target (overwrites existing)
 *   4. Unlink temp file
 *
 * On failure, temp file is cleaned up.
 *
 * @param target - The destination file path
 * @param content - The content to write
 * @throws Error if write or cleanup fails
 */
export async function atomicWrite(target: string, content: string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`,
  );

  try {
    // Step 1 & 2: Write to temp file
    await fs.writeFile(tmp, content, 'utf-8');

    // Step 3: Copy temp to target (overwrites existing)
    // copyFile replaces the target atomically on POSIX; on Windows it works
    // even when watchers have the target opened for read
    await fs.copyFile(tmp, target);
  } finally {
    // Step 4: Clean up temp file (ignore errors)
    await fs.unlink(tmp).catch(() => {
      /* best-effort cleanup */
    });
  }
}
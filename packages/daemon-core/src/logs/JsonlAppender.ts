/**
 * JsonlAppender — lightweight JSONL append writer with log rotation.
 *
 * Provides best-effort append semantics: write failures are logged via
 * console.warn but never thrown. If initialize() fails (e.g. cannot mkdir),
 * all subsequent append() calls silently no-op.
 *
 * Rotation archives follow the naming convention:
 *   `<basename>-<ISO-8601-timestamp>.jsonl.bak`
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/** Default maximum file size before rotation: 10 MB */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Default maximum number of archive files to keep */
const DEFAULT_MAX_ARCHIVE_FILES = 3;

export interface JsonlAppenderOptions {
  maxFileSize?: number;      // default 10MB
  maxArchiveFiles?: number;  // default 3
  fsync?: boolean;           // default false
}

export class JsonlAppender {
  private filePath: string;
  private maxFileSize: number;
  private maxArchiveFiles: number;
  private doFsync: boolean;
  private initialized: boolean = false;

  constructor(filePath: string, options?: JsonlAppenderOptions) {
    this.filePath = filePath;
    this.maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxArchiveFiles = options?.maxArchiveFiles ?? DEFAULT_MAX_ARCHIVE_FILES;
    this.doFsync = options?.fsync ?? false;
  }

  /**
   * Create parent directory (mkdir -p) and ensure the JSONL file exists.
   * On failure, sets initialized=false so all future append() calls no-op.
   */
  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Ensure the file exists (create if missing)
      try {
        await fs.access(this.filePath);
      } catch {
        await fs.writeFile(this.filePath, '', 'utf-8');
      }

      this.initialized = true;
    } catch (err) {
      this.initialized = false;
      console.warn(
        `[JsonlAppender] initialize failed for ${this.filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Append a JSON record as a single JSONL line.
   * Best-effort: failures are console.warn'd, never thrown.
   * If not initialized, this is a silent no-op.
   */
  async append(record: Record<string, unknown>): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.rotateIfNeeded();

      const line = JSON.stringify(record) + '\n';
      await fs.appendFile(this.filePath, line, 'utf-8');

      if (this.doFsync) {
        const handle = await fs.open(this.filePath, 'a');
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
    } catch (err) {
      console.warn(
        `[JsonlAppender] append failed for ${this.filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Read all JSONL records from the file.
   * Returns an empty array if the file does not exist or is empty.
   * Malformed lines are silently skipped (console.warn).
   */
  async readAll(): Promise<Record<string, unknown>[]> {
    const records: Record<string, unknown>[] = [];

    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      if (!content) return records;

      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        try {
          records.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          console.warn(
            `[JsonlAppender] Skipping malformed line ${i + 1} in ${this.filePath}`
          );
        }
      }
    } catch {
      // File doesn't exist or is unreadable — return empty
    }

    return records;
  }

  /**
   * Rotate the file if it exceeds maxFileSize.
   * Archives are named: <basename>-<ISO-8601-timestamp>.jsonl.bak
   * Rotation failures are silently logged.
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size < this.maxFileSize) return;
    } catch {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(this.filePath);           // ".jsonl"
      const base = path.basename(this.filePath, ext);    // e.g. "tool_calls"
      const archiveName = `${base}-${timestamp}${ext}.bak`;
      const archivePath = path.join(path.dirname(this.filePath), archiveName);

      await fs.rename(this.filePath, archivePath);
      await fs.writeFile(this.filePath, '', 'utf-8');

      await this.cleanupOldArchives();
    } catch (err) {
      console.warn(
        `[JsonlAppender] rotation failed for ${this.filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Remove oldest archive files beyond maxArchiveFiles.
   * Archives are sorted alphabetically (ISO-8601 timestamps sort chronologically).
   */
  private async cleanupOldArchives(): Promise<void> {
    const dir = path.dirname(this.filePath);
    const ext = path.extname(this.filePath);
    const base = path.basename(this.filePath, ext);
    const prefix = `${base}-`;

    const files = await fs.readdir(dir);
    const archives = files
      .filter((f) => f.startsWith(prefix) && f.endsWith(`${ext}.bak`))
      .sort();

    while (archives.length > this.maxArchiveFiles) {
      const oldest = archives.shift()!;
      await fs.unlink(path.join(dir, oldest)).catch(() => {});
    }
  }
}

/**
 * Migration Error Logger - Writes migration failure diagnostics to JSONL log.
 * 
 * When a migration fails (either forward step or rollback), this logger
 * appends a JSONL entry to <project>/specforge/migration-error.log.
 * 
 * The first entry in the log includes schema_version: "1.0" as a header record.
 * Subsequent entries are simple JSON objects without the schema_version field.
 * 
 * @see Requirements 13.2
 * @see design.md §<project>/specforge/migration-error.log
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// =============================================================================
// Types
// =============================================================================

/**
 * Schema version pair being migrated: [from, to]
 * e.g., [3, 4] means migrating from version 3 to version 4
 */
export type SchemaVersionPair = readonly [number, number];

/**
 * Rollback status in the log entry.
 * - "ok" means rollback succeeded
 * - "failed:<error>" means rollback failed with the error message
 */
export type RollbackStatus = 'ok' | `failed:${string}`;

/**
 * Parameters for appending a migration error log entry.
 */
export interface MigrationErrorLogEntryParams {
  /** Schema version pair being migrated [from, to] */
  pair: SchemaVersionPair;
  /** Error message from the failed migration */
  err: string;
  /** Stack trace of the error */
  stack: string;
  /** Rollback status */
  rollback: RollbackStatus;
}

// =============================================================================
// Error Logger Class
// =============================================================================

/**
 * MigrationErrorLogger - Appends JSONL entries to migration-error.log.
 * 
 * Log file location: <project>/specforge/migration-error.log
 * 
 * Log format (first entry includes schema_version header):
 * {"schema_version":"1.0","ts":"...","pair":[3,4],"err":"...","stack":"...","rollback":"ok"}
 * {"ts":"...","pair":[3,4],"err":"...","stack":"...","rollback":"failed:EBUSY"}
 */
export class MigrationErrorLogger {
  private readonly projectDir: string;
  private readonly logFilePath: string;
  private headerWritten = false;

  /**
   * Create a new MigrationErrorLogger for a project.
   * 
   * @param projectDir - Absolute path to the project directory
   */
  constructor(projectDir: string) {
    this.projectDir = projectDir;
    // R13.2: Write to <project>/specforge/migration-error.log
    this.logFilePath = path.join(projectDir, 'specforge', 'migration-error.log');
  }

  /**
   * Get the absolute path to the error log file.
   */
  get logPath(): string {
    return this.logFilePath;
  }

  /**
   * Append an error log entry to migration-error.log.
   * 
   * First call writes a header entry with schema_version: "1.0".
   * Subsequent calls write standard entries without schema_version.
   * 
   * @param params - Error log entry parameters
   */
  async append(params: MigrationErrorLogEntryParams): Promise<void> {
    const entry = this.buildEntry(params);
    const line = JSON.stringify(entry) + '\n';

    // Ensure specforge directory exists
    const specforgeDir = path.dirname(this.logFilePath);
    await fs.mkdir(specforgeDir, { recursive: true });

    // Append to log file (create if doesn't exist)
    // Using 'a' flag for append mode
    await fs.appendFile(this.logFilePath, line, 'utf-8');
  }

  /**
   * Build the JSON entry object.
   * 
   * First entry includes schema_version header.
   */
  private buildEntry(params: MigrationErrorLogEntryParams): object {
    const base: object = {
      ts: new Date().toISOString(),
      pair: [params.pair[0], params.pair[1]],
      err: params.err,
      stack: params.stack,
      rollback: params.rollback,
    };

    // First entry includes schema_version as header (R13.2 requirement)
    // This follows the pattern mentioned in tasks.md line 9
    if (!this.headerWritten) {
      this.headerWritten = true;
      return {
        schema_version: '1.0',
        ...base,
      };
    }

    return base;
  }

  /**
   * Check if the log file already exists and has content.
   * Used to determine if header has been written.
   */
  async checkExisting(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.logFilePath);
      // If file exists and has content, header has been written
      this.headerWritten = stat.size > 0;
      return this.headerWritten;
    } catch {
      // File doesn't exist yet
      this.headerWritten = false;
      return false;
    }
  }

  /**
   * Reset header tracking (useful for testing).
   */
  resetHeader(): void {
    this.headerWritten = false;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new MigrationErrorLogger instance for a project.
 * 
 * @param projectDir - Absolute path to the project directory
 * @returns A new MigrationErrorLogger instance
 */
export function createMigrationErrorLogger(projectDir: string): MigrationErrorLogger {
  return new MigrationErrorLogger(projectDir);
}
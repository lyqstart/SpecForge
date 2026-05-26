/**
 * Unit tests for MigrationErrorLogger
 * 
 * Validates Requirement 13.2 - Migration error logging to JSONL format
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MigrationErrorLogger } from '../../src/migration/error-logger.js';

describe('MigrationErrorLogger', () => {
  let tempDir: string;
  let logger: MigrationErrorLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'error-logger-test-'));
    logger = new MigrationErrorLogger(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('append', () => {
    it('should create specforge directory if it does not exist', async () => {
      const specforgeDir = path.join(tempDir, 'specforge');
      
      // Verify directory doesn't exist
      await expect(fs.access(specforgeDir)).rejects.toThrow();
      
      // Append error log entry
      await logger.append({
        pair: [3, 4] as const,
        err: 'ENOSPC: no space left',
        stack: 'Error: ENOSPC at ...',
        rollback: 'ok',
      });
      
      // Verify directory now exists
      const stat = await fs.stat(specforgeDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should write first entry with schema_version header', async () => {
      await logger.append({
        pair: [3, 4] as const,
        err: 'ENOSPC: no space left',
        stack: 'Error: ENOSPC at ...',
        rollback: 'ok',
      });

      const content = await fs.readFile(logger.logPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(1);
      
      const entry = JSON.parse(lines[0]);
      expect(entry.schema_version).toBe('1.0');
      expect(entry.pair).toEqual([3, 4]);
      expect(entry.err).toBe('ENOSPC: no space left');
      expect(entry.stack).toBe('Error: ENOSPC at ...');
      expect(entry.rollback).toBe('ok');
      expect(entry.ts).toBeDefined();
    });

    it('should write subsequent entries without schema_version', async () => {
      // First entry
      await logger.append({
        pair: [3, 4] as const,
        err: 'First error',
        stack: 'stack1',
        rollback: 'ok',
      });

      // Create new logger instance (simulates new process)
      const logger2 = new MigrationErrorLogger(tempDir);
      // Simulate that header was already written by checking existing file
      await logger2.checkExisting();

      // Second entry - should NOT have schema_version
      await logger2.append({
        pair: [4, 5] as const,
        err: 'Second error',
        stack: 'stack2',
        rollback: 'failed:EBUSY',
      });

      const content = await fs.readFile(logger.logPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(2);
      
      const entry1 = JSON.parse(lines[0]);
      expect(entry1.schema_version).toBe('1.0');
      
      const entry2 = JSON.parse(lines[1]);
      expect(entry2.schema_version).toBeUndefined();
      expect(entry2.pair).toEqual([4, 5]);
      expect(entry2.err).toBe('Second error');
      expect(entry2.rollback).toBe('failed:EBUSY');
    });

    it('should append to existing log file', async () => {
      await logger.append({
        pair: [1, 2] as const,
        err: 'Error 1',
        stack: 'stack1',
        rollback: 'ok',
      });

      await logger.append({
        pair: [2, 3] as const,
        err: 'Error 2',
        stack: 'stack2',
        rollback: 'ok',
      });

      const content = await fs.readFile(logger.logPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(2);
      
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);
      
      expect(entry1.pair).toEqual([1, 2]);
      expect(entry2.pair).toEqual([2, 3]);
    });

    it('should include ISO 8601 timestamp', async () => {
      const before = new Date().toISOString();
      
      await logger.append({
        pair: [0, 1] as const,
        err: 'test error',
        stack: 'test stack',
        rollback: 'ok',
      });
      
      const after = new Date().toISOString();
      
      const content = await fs.readFile(logger.logPath, 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      
      const entryTime = new Date(entry.ts);
      const beforeTime = new Date(before);
      const afterTime = new Date(after);
      
      expect(entryTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
      expect(entryTime.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);
    });
  });

  describe('logPath', () => {
    it('should return correct log file path', () => {
      expect(logger.logPath).toBe(path.join(tempDir, 'specforge', 'migration-error.log'));
    });
  });

  describe('checkExisting', () => {
    it('should return false when log file does not exist', async () => {
      const exists = await logger.checkExisting();
      expect(exists).toBe(false);
    });

    it('should return true when log file exists with content', async () => {
      await logger.append({
        pair: [1, 2] as const,
        err: 'test',
        stack: 'stack',
        rollback: 'ok',
      });

      const newLogger = new MigrationErrorLogger(tempDir);
      const exists = await newLogger.checkExisting();
      
      expect(exists).toBe(true);
    });
  });

  describe('rollback status', () => {
    it('should accept "ok" rollback status', async () => {
      await logger.append({
        pair: [1, 2] as const,
        err: 'test',
        stack: 'stack',
        rollback: 'ok',
      });

      const content = await fs.readFile(logger.logPath, 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.rollback).toBe('ok');
    });

    it('should accept failed rollback status with error', async () => {
      await logger.append({
        pair: [1, 2] as const,
        err: 'test',
        stack: 'stack',
        rollback: 'failed:EBUSY',
      });

      const content = await fs.readFile(logger.logPath, 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.rollback).toBe('failed:EBUSY');
    });
  });
});
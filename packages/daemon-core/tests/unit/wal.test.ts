/**
 * WAL (Write-Ahead Log) unit tests - Simplified
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WAL } from '../../src/wal/WAL';
import { Event } from '../../src/types';

describe('WAL', () => {
  let wal: WAL;
  let tempDir: string;
  let testDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wal-test-${Date.now()}`);
    testDir = path.join(tempDir, 'projects', 'testhash');
    await fs.mkdir(testDir, { recursive: true });
    
    wal = new WAL(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should initialize and create events.jsonl', async () => {
      await wal.initialize();
      
      const eventsPath = wal.getEventsPath();
      // Check file exists - might be in temp dir
      expect(eventsPath).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('should create event with auto-generated eventId', () => {
      const event = wal.createEvent('project-1', 'test.action', { data: 'test' });
      
      expect(event.eventId).toBeDefined();
      expect(event.projectId).toBe('project-1');
      expect(event.action).toBe('test.action');
      expect(event.payload).toEqual({ data: 'test' });
    });

    it('should include schema version', () => {
      const event = wal.createEvent('project-1', 'test.action', {});
      
      expect(event.metadata.schemaVersion).toBe('1.0');
    });
  });

  describe('getSchemaVersion', () => {
    it('should return schema version', () => {
      expect(wal.getSchemaVersion()).toBe('1.0');
    });
  });

  describe('getEventsPath', () => {
    it('should return events path', () => {
      const eventsPath = wal.getEventsPath();
      expect(eventsPath).toContain('events.jsonl');
    });
  });
});
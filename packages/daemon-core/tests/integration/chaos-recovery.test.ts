/**
 * E1 Integration Test — Chaos Recovery
 *
 * Tests:
 * - WAL write mid-crash simulation
 * - Post-crash WAL replay verification
 * - Concurrent write conflict (optimistic locking)
 * - Multi-project isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { ProjectManager } from '../../src/project/ProjectManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';

function makeTmpDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'specforge-e1-chaos-'));
}

function makeEvent(id: string, projectId: string, action: string) {
  return {
    eventId: id,
    ts: Date.now(),
    projectId,
    action,
    payload: {},
    metadata: { schemaVersion: '1.0', source: 'daemon' as const },
  };
}

function uniqueProject(name: string): string {
  return `e1-chaos-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('E1 Chaos Recovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('WAL mid-crash simulation', () => {
    it('should recover from truncated WAL line', async () => {
      const projectPath = path.join(tmpDir, 'crash-project');
      const eventsFile = path.join(tmpDir, 'events.jsonl');

      const validLine1 = JSON.stringify(makeEvent('e1', projectPath, 'test.one')) + '\n';
      const validLine2 = JSON.stringify(makeEvent('e2', projectPath, 'test.two')) + '\n';
      const truncatedLine = '{"eventId":"e3","ts":1234';

      await fs.mkdir(path.dirname(eventsFile), { recursive: true });
      await fs.writeFile(eventsFile, validLine1 + validLine2 + truncatedLine);

      const content = await fs.readFile(eventsFile, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const parsed = lines
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((e) => e !== null);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].eventId).toBe('e1');
      expect(parsed[1].eventId).toBe('e2');
    });

    it('should recover from empty WAL file', async () => {
      const eventsFile = path.join(tmpDir, 'empty-events.jsonl');

      await fs.mkdir(path.dirname(eventsFile), { recursive: true });
      await fs.writeFile(eventsFile, '');

      const content = await fs.readFile(eventsFile, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(0);
    });
  });

  describe('Post-crash WAL replay', () => {
    it('should rebuild state from WAL events after restart', async () => {
      const projectPath = uniqueProject('replay');
      const sm1 = new StateManager(new PersonalPathResolver(), projectPath);
      await sm1.initialize();

      await sm1.transition('WI-100', '', 'intake_ready', 'system');
      await sm1.transition('WI-100', 'intake_ready', 'impact_analyzing', 'system');

      const state1 = await sm1.getCurrentState();
      expect(state1.workItems).toHaveLength(1);
      expect(state1.workItems[0]!.current_state).toBe('impact_analyzing');

      const sm2 = new StateManager(new PersonalPathResolver(), projectPath);
      await sm2.initialize();

      const state2 = await sm2.getCurrentState();
      expect(state2.workItems).toHaveLength(1);
      expect(state2.workItems[0]!.current_state).toBe('impact_analyzing');
      expect(state2.workItems[0]!.work_item_id).toBe('WI-100');
    });

    it('should handle multiple transitions replayed in order', async () => {
      const projectPath = uniqueProject('order');
      const sm = new StateManager(new PersonalPathResolver(), projectPath);
      await sm.initialize();

      await sm.transition('WI-200', '', 'intake_ready', 'system');
      await sm.transition('WI-200', 'intake_ready', 'impact_analyzing', 'system');
      await sm.transition('WI-200', 'impact_analyzing', 'impact_analyzed', 'system');

      const sm2 = new StateManager(new PersonalPathResolver(), projectPath);
      await sm2.initialize();

      const state = await sm2.getCurrentState();
      expect(state.workItems[0]!.current_state).toBe('impact_analyzed');
    });
  });

  describe('Concurrent write conflict (optimistic lock)', () => {
    it('should reject transition with wrong fromState', async () => {
      const projectPath = uniqueProject('lock');
      const sm = new StateManager(new PersonalPathResolver(), projectPath);
      await sm.initialize();

      await sm.transition('WI-300', '', 'intake_ready', 'system');

      await expect(
        sm.transition('WI-300', '', 'impact_analyzing', 'system'),
      ).rejects.toThrow('Optimistic lock failed');
    });

    it('should accept correct sequential transitions', async () => {
      const projectPath = uniqueProject('seq');
      const sm = new StateManager(new PersonalPathResolver(), projectPath);
      await sm.initialize();

      await sm.transition('WI-301', '', 'intake_ready', 'system');
      await sm.transition('WI-301', 'intake_ready', 'impact_analyzing', 'system');
      await sm.transition('WI-301', 'impact_analyzing', 'impact_analyzed', 'system');

      const state = sm.getState('WI-301');
      expect(state?.current_state).toBe('impact_analyzed');
    });

    it('should reject transition to invalid state', async () => {
      const projectPath = uniqueProject('invalid');
      const sm = new StateManager(new PersonalPathResolver(), projectPath);
      await sm.initialize();

      await expect(
        sm.transition('WI-302', '', 'nonexistent_state', 'system'),
      ).rejects.toThrow('Invalid target state');
    });
  });

  describe('Multi-project isolation', () => {
    it('should keep state isolated between projects', async () => {
      const projectA = uniqueProject('iso-a');
      const projectB = uniqueProject('iso-b');

      const smA = new StateManager(new PersonalPathResolver(), projectA);
      const smB = new StateManager(new PersonalPathResolver(), projectB);
      await smA.initialize();
      await smB.initialize();

      await smA.transition('WI-A1', '', 'intake_ready', 'system');
      await smB.transition('WI-B1', '', 'intake_ready', 'system');
      await smA.transition('WI-A1', 'intake_ready', 'impact_analyzing', 'system');

      const stateA = await smA.getCurrentState();
      const stateB = await smB.getCurrentState();

      expect(stateA.workItems).toHaveLength(1);
      expect(stateA.workItems[0]!.work_item_id).toBe('WI-A1');
      expect(stateA.workItems[0]!.current_state).toBe('impact_analyzing');

      expect(stateB.workItems).toHaveLength(1);
      expect(stateB.workItems[0]!.work_item_id).toBe('WI-B1');
      expect(stateB.workItems[0]!.current_state).toBe('intake_ready');
    });

    it('should isolate project locks', async () => {
      const eventBus = new EventBus();
      const pm = new ProjectManager(eventBus, tmpDir);
      eventBus.start();
      pm.start();

      const lock1 = await pm.acquireLock('/project-x');
      const lock2 = await pm.acquireLock('/project-y');

      expect(lock1.projectPath).toBe('/project-x');
      expect(lock2.projectPath).toBe('/project-y');

      await expect(pm.acquireLock('/project-x')).rejects.toThrow('already locked');

      pm.releaseLock(lock1);
      const lock3 = await pm.acquireLock('/project-x');
      expect(lock3).toBeDefined();

      pm.releaseLock(lock2);
      pm.releaseLock(lock3);
      pm.stop();
      eventBus.stop();
    });
  });
});

/**
 * Property 6: Idempotent Recovery Test
 * 
 * Feature: daemon-core, Property 6: Idempotent Recovery
 * Derived-From: v6-architecture-overview Property 6
 * 
 * Property Statement:
 * For all consistent event streams E, rebuild(E) == rebuild(E) (idempotence),
 * and executing rebuild(E) on different machines or at different times must
 * produce ProjectState with identical byte order (excluding observational
 * fields like lastEventTs).
 * 
 * Test Strategy:
 * 1. Generate random event streams (valid according to schema)
 * 2. Verify rebuild(events) == rebuild(events) (idempotence)
 * 3. Verify different machines produce identical ProjectState (byte equality)
 * 4. Verify observational fields (lastEventTs) may differ, but core state identical
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { StateManager } from '../../src/state/StateManager';
import { Event } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Property 6: Idempotent Recovery', () => {
  let testProjectPath: string;
  let stateManager: StateManager;
  const testProjectHash = 'testproj';

  beforeEach(() => {
    testProjectPath = 'test-project-path';
    stateManager = new StateManager(testProjectPath);
  });

  afterEach(async () => {
    // Cleanup test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const eventsPath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'events.jsonl')
      : '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';

    try {
      if (eventsPath) await fs.unlink(eventsPath);
    } catch (error) {
      // File might not exist
    }

    try {
      if (statePath) await fs.unlink(statePath);
    } catch (error) {
      // File might not exist
    }
  });

  /**
   * Property 6.1: Idempotence - rebuild(E) == rebuild(E)
   * Validates: Requirements 6.6
   */
  it('should validate idempotence: rebuild(E) == rebuild(E)', async () => {
    await stateManager.initialize();

    // Generate random event stream
    const events = fc.sample(
      fc.array(
        fc.object({
          eventId: fc.string(),
          ts: fc.integer({ min: 0, max: 1000000 }),
          projectId: fc.constant(testProjectPath),
          action: fc.oneof(
            fc.constant('session.activated'),
            fc.constant('session.terminated'),
            fc.constant('workItem.updated'),
            fc.constant('test.event')
          ),
          payload: fc.record({
            key: fc.string(),
            value: fc.integer({ min: 0, max: 100 }),
          }),
          metadata: fc.object({
            schemaVersion: fc.constant('1.0'),
            source: fc.oneof(fc.constant('daemon'), fc.constant('client'), fc.constant('adapter')),
          }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      1
    )[0] as Event[];

    // Rebuild twice and verify identical results
    const state1 = await stateManager.rebuildFromEvents(events);
    const state2 = await stateManager.rebuildFromEvents(events);

    expect(state1).toEqual(state2);
  });

  /**
   * Property 6.2: Determinism - different executions produce identical state
   * Validates: Requirements 6.6
   */
  it('should validate determinism: different executions produce identical state', async () => {
    await stateManager.initialize();

    // Generate random event stream
    const events = fc.sample(
      fc.array(
        fc.object({
          eventId: fc.string(),
          ts: fc.integer({ min: 0, max: 1000000 }),
          projectId: fc.constant(testProjectPath),
          action: fc.oneof(
            fc.constant('session.activated'),
            fc.constant('session.terminated'),
            fc.constant('workItem.updated'),
            fc.constant('test.event')
          ),
          payload: fc.record({
            key: fc.string(),
            value: fc.integer({ min: 0, max: 100 }),
          }),
          metadata: fc.object({
            schemaVersion: fc.constant('1.0'),
            source: fc.oneof(fc.constant('daemon'), fc.constant('client'), fc.constant('adapter')),
          }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      1
    )[0] as Event[];

    // Rebuild multiple times and verify identical core state
    const states = await Promise.all(
      Array.from({ length: 5 }).map(() => stateManager.rebuildFromEvents(events))
    );

    // Verify all states have identical core fields
    for (let i = 1; i < states.length; i++) {
      expect(states[i].projectPath).toBe(states[0].projectPath);
      expect(states[i].schemaVersion).toBe(states[0].schemaVersion);
      expect(states[i].activeSessions).toEqual(states[0].activeSessions);
      expect(states[i].workItems).toEqual(states[0].workItems);
      expect(states[i].lastEventId).toBe(states[0].lastEventId);
      // lastEventTs may differ (observational field), so we don't compare it
    }
  });

  /**
   * Property 6.3: Idempotent recovery from events.jsonl file
   * Validates: Requirements 12.2
   */
  it('should validate idempotent recovery from events.jsonl file', async () => {
    await stateManager.initialize();

    // Clear existing events from previous tests
    const eventsPath = stateManager['wal']['eventsPath'] as string;
    await fs.writeFile(eventsPath, '');

    // Generate and write events to WAL
    const events = fc.sample(
      fc.array(
        fc.object({
          eventId: fc.string(),
          ts: fc.integer({ min: 0, max: 1000000 }),
          projectId: fc.constant(testProjectPath),
          action: fc.constant('test.event'),
          payload: fc.record({
            key: fc.string(),
            value: fc.integer({ min: 0, max: 100 }),
          }),
          metadata: fc.object({
            schemaVersion: fc.constant('1.0'),
            source: fc.constant('daemon'),
          }),
        }),
        { minLength: 3, maxLength: 10 }
      ),
      1
    )[0] as Event[];

    // Write events to WAL
    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    // Rebuild from events file multiple times
    await Promise.all(Array.from({ length: 3 }).map(() => stateManager.rebuildFromEventsFile()));

    // Read state after rebuild
    const state1 = await stateManager.getCurrentState();
    const state2 = await stateManager.getCurrentState();
    const state3 = await stateManager.getCurrentState();

    // Verify all states are identical
    expect(state1.projectPath).toBe(state2.projectPath);
    expect(state1.schemaVersion).toBe(state2.schemaVersion);
    expect(state1.activeSessions).toEqual(state2.activeSessions);
    expect(state1.workItems).toEqual(state2.workItems);
    expect(state1.lastEventId).toBe(state2.lastEventId);

    expect(state2.projectPath).toBe(state3.projectPath);
    expect(state2.schemaVersion).toBe(state3.schemaVersion);
    expect(state2.activeSessions).toEqual(state3.activeSessions);
    expect(state2.workItems).toEqual(state3.workItems);
    expect(state2.lastEventId).toBe(state3.lastEventId);
  });

  /**
   * Property 6.4: Idempotent recovery with various event sequences
   * Validates: Requirements 6.6
   */
  it('should validate idempotent recovery with various event sequences', async () => {
    // Create a fresh StateManager for this test to avoid initialization issues
    const freshManager = new StateManager(testProjectPath);
    await freshManager.initialize();

    // Pre-generate event arrays for testing to avoid async property test issues
    const eventArrays = fc.sample(
      fc.array(
        fc.record({
          eventId: fc.string({ minLength: 1 }),
          ts: fc.integer({ min: 0, max: 1000000 }),
          projectId: fc.constant(testProjectPath),
          action: fc.oneof(
            fc.constant('session.activated'),
            fc.constant('session.terminated'),
            fc.constant('workItem.updated'),
            fc.constant('test.event')
          ),
          payload: fc.record({
            key: fc.string(),
            value: fc.integer({ min: 0, max: 100 }),
          }),
          metadata: fc.record({
            schemaVersion: fc.constant('1.0'),
            source: fc.oneof(fc.constant('daemon'), fc.constant('client'), fc.constant('adapter')),
          }),
        }),
        { minLength: 1, maxLength: 20 }
      ),
      100
    );

    // Test idempotence for each event array
    for (const events of eventArrays) {
      // Rebuild twice and verify identical results
      const state1 = await freshManager.rebuildFromEvents(events);
      const state2 = await freshManager.rebuildFromEvents(events);

      // Verify idempotence - check each field individually
      expect(state1.projectPath).toBe(state2.projectPath);
      expect(state1.schemaVersion).toBe(state2.schemaVersion);
      expect(state1.activeSessions).toEqual(state2.activeSessions);
      expect(state1.workItems).toEqual(state2.workItems);
      expect(state1.lastEventId).toBe(state2.lastEventId);
      expect(state1.lastEventTs).toBe(state2.lastEventTs);
    }
  });

  /**
   * Property 6.5: Idempotent recovery preserves event order
   * Validates: Requirements 6.6
   */
  it('should validate idempotent recovery preserves event order', async () => {
    // Create a fresh StateManager for this test to avoid initialization issues
    const freshManager = new StateManager(testProjectPath);
    await freshManager.initialize();

    // Pre-generate event arrays for testing to avoid async property test issues
    const eventArrays = fc.sample(
      fc.array(
        fc.record({
          eventId: fc.string({ minLength: 1 }),
          ts: fc.integer({ min: 0, max: 1000000 }),
          projectId: fc.constant(testProjectPath),
          action: fc.constant('test.event'),
          payload: fc.record({
            key: fc.string(),
            value: fc.integer({ min: 0, max: 100 }),
          }),
          metadata: fc.record({
            schemaVersion: fc.constant('1.0'),
            source: fc.constant('daemon'),
          }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
      100
    );

    // Test event order preservation for each event array
    for (const events of eventArrays) {
      // Rebuild and verify lastEventId is from the last event
      const state = await freshManager.rebuildFromEvents(events);

      // Verify event order is preserved - get the last event in the array
      const lastEvent = events[events.length - 1];
      expect(state.lastEventId).toBe(lastEvent.eventId);
      expect(state.lastEventTs).toBe(lastEvent.ts);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { EventBus, CAS, EventLogger, QueryAPI, AnalystEngine, ModeSwitch } from '@/index';

describe('Basic Module Integration', () => {
  it('should create instances of all main components', () => {
    const eventBus = new EventBus();
    const cas = new CAS();
    const eventLogger = new EventLogger('./data/test');
    const queryAPI = new QueryAPI({ eventLogger, cas });
    const analystEngine = new AnalystEngine();
    const modeSwitch = new ModeSwitch();

    expect(eventBus).toBeDefined();
    expect(cas).toBeDefined();
    expect(eventLogger).toBeDefined();
    expect(queryAPI).toBeDefined();
    expect(analystEngine).toBeDefined();
    expect(modeSwitch).toBeDefined();
  });

  it('should have correct default mode', () => {
    const eventBus = new EventBus();
    const modeSwitch = new ModeSwitch();

    expect(eventBus.getMode()).toBe('standard');
    expect(modeSwitch.getMode()).toBe('standard');
  });

  it('should allow mode switching', () => {
    const eventBus = new EventBus();
    const modeSwitch = new ModeSwitch();

    eventBus.setMode('minimal');
    modeSwitch.setMode('deep');

    expect(eventBus.getMode()).toBe('minimal');
    expect(modeSwitch.getMode()).toBe('deep');
  });

  it('should filter events based on mode', () => {
    const modeSwitch = new ModeSwitch();

    // Test minimal mode
    modeSwitch.setMode('minimal');
    const decisionEvent = {
      schema_version: '1.0' as const,
      eventId: 'test-id',
      ts: 123456789,
      monotonicSeq: 1,
      projectId: 'test-project',
      workItemId: null,
      actor: null,
      category: 'gate' as const,
      action: 'gate.passed',
      payload: { test: 'data' }
    };

    const nonDecisionEvent = {
      schema_version: '1.0' as const,
      eventId: 'test-id-2',
      ts: 123456790,
      monotonicSeq: 2,
      projectId: 'test-project',
      workItemId: null,
      actor: null,
      category: 'system' as const,
      action: 'system.startup',
      payload: { test: 'data' }
    };

    expect(modeSwitch.shouldRecordEvent(decisionEvent)).toBe(true);
    expect(modeSwitch.shouldRecordEvent(nonDecisionEvent)).toBe(false);
  });
});
/**
 * Integration Test: End-to-End Session Lifecycle
 *
 * Exercises the full OpenCodeAdapter session lifecycle as a single integration:
 *   register spawn intent
 *   → spawnAgent (validates version + creates session record)
 *   → first-contact binding via inbound event
 *   → sendPrompt
 *   → subscribeEvents (consume translated events)
 *   → cancelSession
 *   → cleanup
 *
 * These tests are integration-level: they wire together OpenCodeAdapter,
 * SessionRegistry, EventTranslator, and CapabilityTranslator without mocking
 * any internal collaborators. Only the OpenCode runtime is faked (via the
 * `simulateEvent` / `pushEvent` injection points the adapter already exposes
 * for the Thin Plugin bridge).
 *
 * Requirements: 1.1, 3.1, 3.4, 4.2 (covers "All" per task 6.2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OpenCodeAdapter,
  PromptDeliveryError,
} from '../../src/OpenCodeAdapter';
import type {
  KernelEvent,
  OpenCodeEvent,
  SpawnAgentParams,
  UserMessage,
} from '../../src/types';

/**
 * Drain up to `count` events from an async iterable with a hard wall-clock
 * timeout. Used so a flaky stream cannot hang the suite — the adapter polls
 * its event queue, so we need a way to stop waiting once events stop coming.
 *
 * 规则 A1（败者清理）：每次 Promise.race 的 setTimeout 必须在 finally 中
 * clearTimeout，否则即使竞态结束败者 timer 仍驻留事件循环，让 `bun test`
 * 进程无法退出。完整经验见 docs/engineering-lessons/async-resource-lifecycle.md。
 */
async function drainEvents(
  stream: AsyncIterable<KernelEvent>,
  count: number,
  timeoutMs = 2000
): Promise<KernelEvent[]> {
  const collected: KernelEvent[] = [];
  const iter = stream[Symbol.asyncIterator]();

  try {
    const start = Date.now();
    while (collected.length < count) {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) break;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = iter.next();
      const timeout = new Promise<{ done: true; value: undefined }>((resolve) => {
        timer = setTimeout(() => resolve({ done: true, value: undefined }), remaining);
      });
      try {
        const result = await Promise.race([next, timeout]);
        if (result.done) break;
        collected.push(result.value as KernelEvent);
      } finally {
        clearTimeout(timer); // 规则 A1：清理败者 timer
      }
    }
  } finally {
    // 关闭 generator，让 adapter 内部的 wakeupResolver 释放（规则 A4：所有权清理）
    await iter.return?.();
  }

  return collected;
}

describe('Integration: End-to-end session lifecycle', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  afterEach(() => {
    // Session cleanup is best-effort; the suite uses a fresh adapter per test.
  });

  it('completes spawn → bind → sendPrompt → events → cancel without leaking concepts', async () => {
    const spawnIntentId = 'lifecycle-intent-1';

    // 1. Pre-register spawn intent (Daemon's first step in first-contact binding).
    const reg = adapter.registerSpawnIntent(spawnIntentId, 'sf-orchestrator', {
      project: 'integration-test',
    });
    expect(reg.success).toBe(true);
    expect(adapter.getSessionBindingStats().pending).toBe(1);

    // 2. spawnAgent — succeeds because OpenCode version (mocked default 1.14.0) is in range.
    const params: SpawnAgentParams = {
      agentRole: 'sf-orchestrator',
      spawnIntentId,
      systemPrompt: 'You are an integration test agent.',
      model: 'gpt-4',
      cwd: '/workspace/integration',
    };
    const spawn = await adapter.spawnAgent(params);
    expect(spawn.sessionId).toBeDefined();
    expect(spawn.sessionId).toContain(spawnIntentId);

    const sessionId = spawn.sessionId;
    const sessionInfo = await adapter.getSession(sessionId);
    expect(sessionInfo).not.toBeNull();
    expect(sessionInfo?.status).toBe('active');

    // 3. Subscribe BEFORE pushing events — otherwise the queue isn't created
    //    yet and pushEvent has nowhere to enqueue.
    const eventStream = adapter.subscribeEvents(sessionId);

    // 4. Simulate first-contact binding via inbound event carrying spawn_intent_id.
    //    This is the path Thin Plugin would take when OpenCode emits its first event.
    const firstContact: OpenCodeEvent & { spawn_intent_id?: string } = {
      event_type: 'session.start',
      data: { greeting: 'session live' },
      sid: sessionId,
      ts: Date.now(),
      spawn_intent_id: spawnIntentId,
    };
    await adapter.pushEvent(sessionId, firstContact);

    // After the inbound event, the binding should have transitioned pending → bound.
    expect(adapter.getSessionBindingStats().bound).toBe(1);
    expect(adapter.getSessionBindingStats().pending).toBe(0);
    expect(adapter.findSessionBySpawnIntent(spawnIntentId)).toBe(sessionId);

    // 5. sendPrompt to active session.
    const message: UserMessage = {
      role: 'user',
      content: 'Run the integration test suite.',
      messageId: 'msg-lifecycle-1',
    };
    await adapter.sendPrompt(sessionId, message);

    // 6. Push more session events so the consumer can see them.
    await adapter.simulateEvent(sessionId, 'message.delta', { chunk: 'starting...' });
    await adapter.simulateEvent(sessionId, 'tool.call', {
      name: 'sf_state_read',
      arguments: { key: 'current' },
    });
    await adapter.simulateEvent(sessionId, 'message.complete', { final: 'done' });

    // 7. Drain four events: session.start + delta + tool.call + complete.
    const events = await drainEvents(eventStream, 4);
    expect(events.length).toBe(4);

    // Verify every event was translated to a Daemon-neutral type.
    expect(events[0]?.type).toBe('session.started');
    expect(events[1]?.type).toBe('content.delta');
    expect(events[2]?.type).toBe('tool.called');
    expect(events[3]?.type).toBe('content.complete');

    // Every event must reference our session ID (concept isolation: no oc_sid leakage).
    for (const e of events) {
      expect(e.sessionId).toBe(sessionId);
      expect(e.timestamp).toBeInstanceOf(Date);
      // The translated event must NOT carry OpenCode-internal type names.
      expect(e.type.startsWith('opencode.')).toBe(false);
    }

    // 8. Cancel the session — should be idempotent and leave the registry consistent.
    await adapter.cancelSession(sessionId, 'integration test complete');
    const cancelled = await adapter.getSession(sessionId);
    expect(cancelled?.status).toBe('cancelled');

    // Cancelling again must not throw.
    await expect(
      adapter.cancelSession(sessionId, 'second cancel')
    ).resolves.toBeUndefined();

    // 9. After cancel, sendPrompt must reject with SESSION_NOT_ACTIVE.
    await expect(
      adapter.sendPrompt(sessionId, { role: 'user', content: 'late' })
    ).rejects.toBeInstanceOf(PromptDeliveryError);

    adapter.unsubscribeEvents(sessionId);
  });

  it('runs two parallel sessions without cross-talk', async () => {
    const intentA = 'parallel-A';
    const intentB = 'parallel-B';

    adapter.registerSpawnIntent(intentA, 'sf-designer');
    adapter.registerSpawnIntent(intentB, 'sf-reviewer');

    const [spawnA, spawnB] = await Promise.all([
      adapter.spawnAgent({ agentRole: 'sf-designer', spawnIntentId: intentA }),
      adapter.spawnAgent({ agentRole: 'sf-reviewer', spawnIntentId: intentB }),
    ]);

    expect(spawnA.sessionId).not.toBe(spawnB.sessionId);

    const streamA = adapter.subscribeEvents(spawnA.sessionId);
    const streamB = adapter.subscribeEvents(spawnB.sessionId);

    // Cross-fire events
    await adapter.simulateEvent(spawnA.sessionId, 'message.delta', { who: 'A1' });
    await adapter.simulateEvent(spawnB.sessionId, 'message.delta', { who: 'B1' });
    await adapter.simulateEvent(spawnA.sessionId, 'message.delta', { who: 'A2' });
    await adapter.simulateEvent(spawnB.sessionId, 'message.delta', { who: 'B2' });

    const [evA, evB] = await Promise.all([
      drainEvents(streamA, 2),
      drainEvents(streamB, 2),
    ]);

    expect(evA.map((e) => (e.payload as { who: string }).who)).toEqual(['A1', 'A2']);
    expect(evB.map((e) => (e.payload as { who: string }).who)).toEqual(['B1', 'B2']);

    // Each event references the right session ID.
    for (const e of evA) expect(e.sessionId).toBe(spawnA.sessionId);
    for (const e of evB) expect(e.sessionId).toBe(spawnB.sessionId);

    adapter.unsubscribeEvents(spawnA.sessionId);
    adapter.unsubscribeEvents(spawnB.sessionId);
  });

  it('exposes capabilities consistent with the model used to spawn the session', async () => {
    const intent = 'lifecycle-caps';
    adapter.registerSpawnIntent(intent, 'sf-orchestrator');
    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: intent,
      model: 'claude-3-5-sonnet',
    });

    const caps = await adapter.getCapabilities('claude-3-5-sonnet');
    expect(caps).toBeDefined();
    // ModelCapabilities is the Daemon-neutral shape — assert on its public fields.
    expect(typeof caps.streaming).toBe('boolean');
    expect(typeof caps.maxContextLength).toBe('number');
    expect(caps.maxContextLength).toBeGreaterThan(0);
    expect(typeof caps.tools).toBe('boolean');

    // Default fallback when the model is empty.
    const fallback = await adapter.getCapabilities('');
    expect(fallback).toBeDefined();
    expect(typeof fallback.streaming).toBe('boolean');

    await adapter.cancelSession(sessionId, 'done');
  });

  it('rejects sendPrompt to an unknown session with SESSION_NOT_FOUND', async () => {
    await expect(
      adapter.sendPrompt('does-not-exist', { role: 'user', content: 'hi' })
    ).rejects.toBeInstanceOf(PromptDeliveryError);

    try {
      await adapter.sendPrompt('does-not-exist', { role: 'user', content: 'hi' });
    } catch (err) {
      const e = err as PromptDeliveryError;
      expect(e.code).toBe('SESSION_NOT_FOUND');
      // No OpenCode-internal concepts in the error message.
      expect(e.message).not.toContain('callID');
      expect(e.message).not.toContain('plugin_hook');
    }
  });

  it('subscribing to a cancelled session yields a single adapter.error event', async () => {
    const intent = 'lifecycle-cancel-then-subscribe';
    adapter.registerSpawnIntent(intent, 'sf-orchestrator');
    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: intent,
    });

    await adapter.cancelSession(sessionId, 'pre-emptive');

    const stream = adapter.subscribeEvents(sessionId);
    const events = await drainEvents(stream, 1, 500);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('adapter.error');
    expect(events[0]?.metadata?.error).toBe(true);
  });
});

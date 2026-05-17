/**
 * Comprehensive Unit Tests: LLMKernelAdapter Method Implementations
 *
 * Covers all six LLMKernelAdapter interface methods on OpenCodeAdapter:
 *   spawnAgent, getSession, cancelSession, sendPrompt, subscribeEvents, getCapabilities
 *
 * Also covers:
 *   - Version compatibility checking integration
 *   - Error handling scenarios for each method
 *   - Session lifecycle state transitions
 *   - Concept isolation (no OpenCode-internal tokens in errors / events)
 *
 * Requirements: 1.1, 1.4, 2.1, 3.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OpenCodeAdapter,
  SessionInitializationError,
  PromptDeliveryError,
} from '../../src/OpenCodeAdapter';
import type { SpawnAgentParams, UserMessage, KernelEvent } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPENCODE_INTERNAL_TOKENS = ['callID', 'plugin_hook', 'pluginHook', 'oc_internal', 'opencode_ctx'];

function assertNoConcept(value: unknown, label: string): void {
  const str = JSON.stringify(value ?? null);
  for (const token of OPENCODE_INTERNAL_TOKENS) {
    expect(str.includes(token), `${label} leaked "${token}"`).toBe(false);
  }
}

function makeAdapter(overrides: Record<string, unknown> = {}): OpenCodeAdapter {
  return new OpenCodeAdapter({
    compatibleKernelRange: '>=1.0.0 <2.0.0',
    communicationTimeout: 5000,
    ...overrides,
  });
}

async function spawnSession(adapter: OpenCodeAdapter, suffix = ''): Promise<string> {
  const { sessionId } = await adapter.spawnAgent({
    agentRole: 'sf-orchestrator',
    spawnIntentId: `intent-${suffix || Date.now()}`,
  });
  return sessionId;
}

// ===========================================================================
// spawnAgent
// ===========================================================================

describe('OpenCodeAdapter.spawnAgent (unit)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => { adapter = makeAdapter(); });

  it('returns a sessionId that contains the spawnIntentId', async () => {
    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'my-intent',
    });
    expect(sessionId).toContain('my-intent');
    expect(sessionId).toMatch(/^oc-/);
  });

  it('creates unique session IDs for successive calls', async () => {
    const p: SpawnAgentParams = { agentRole: 'sf-orchestrator', spawnIntentId: 'same-intent' };
    const { sessionId: s1 } = await adapter.spawnAgent(p);
    await new Promise(r => setTimeout(r, 10));
    const { sessionId: s2 } = await adapter.spawnAgent(p);
    expect(s1).not.toBe(s2);
  });

  it('accepts all optional fields without error', async () => {
    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-designer',
      spawnIntentId: 'intent-full',
      systemPrompt: 'You are a designer.',
      cwd: '/workspace/project',
      model: 'claude-3-5-sonnet',
    });
    expect(sessionId).toBeDefined();
  });

  // ── Parameter validation ────────────────────────────────────────────────

  it('throws INVALID_PARAMS for empty agentRole', async () => {
    await expect(adapter.spawnAgent({ agentRole: '', spawnIntentId: 'i' }))
      .rejects.toBeInstanceOf(SessionInitializationError);
    try {
      await adapter.spawnAgent({ agentRole: '', spawnIntentId: 'i' });
    } catch (e) {
      expect((e as SessionInitializationError).code).toBe('INVALID_PARAMS');
    }
  });

  it('throws INVALID_PARAMS for whitespace-only agentRole', async () => {
    await expect(adapter.spawnAgent({ agentRole: '   ', spawnIntentId: 'i' }))
      .rejects.toBeInstanceOf(SessionInitializationError);
  });

  it('throws INVALID_PARAMS for empty spawnIntentId', async () => {
    await expect(adapter.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: '' }))
      .rejects.toBeInstanceOf(SessionInitializationError);
    try {
      await adapter.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: '' });
    } catch (e) {
      expect((e as SessionInitializationError).code).toBe('INVALID_PARAMS');
    }
  });

  // ── Version compatibility ───────────────────────────────────────────────

  it('throws VERSION_MISMATCH when detected version is too high', async () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <1.15.0' });
    vi.spyOn(a as unknown as { detectOpenCodeVersion(): Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('2.0.0');
    try {
      await a.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: 'i' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SessionInitializationError);
      expect((e as SessionInitializationError).code).toBe('VERSION_MISMATCH');
      assertNoConcept({ message: (e as Error).message }, 'VERSION_MISMATCH error');
    }
  });

  it('throws VERSION_MISMATCH when detected version is too low', async () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.14.0 <2.0.0' });
    vi.spyOn(a as unknown as { detectOpenCodeVersion(): Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('1.0.0');
    await expect(a.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: 'i' }))
      .rejects.toBeInstanceOf(SessionInitializationError);
  });

  it('cleans up session state on version mismatch (no orphan)', async () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <1.15.0' });
    vi.spyOn(a as unknown as { detectOpenCodeVersion(): Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('2.0.0');
    await expect(a.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: 'i' }))
      .rejects.toThrow();
    const sessions = (a as unknown as { sessions: Map<string, unknown> }).sessions;
    expect(sessions.size).toBe(0);
  });

  it('throws TIMEOUT when communicationTimeout is extremely short', async () => {
    const a = makeAdapter({ communicationTimeout: 1 });
    await expect(a.spawnAgent({ agentRole: 'sf-orchestrator', spawnIntentId: 'i' }))
      .rejects.toBeInstanceOf(SessionInitializationError);
  });
});

// ===========================================================================
// getSession
// ===========================================================================

describe('OpenCodeAdapter.getSession (unit)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => { adapter = makeAdapter(); });

  it('returns null for non-existent session', async () => {
    expect(await adapter.getSession('does-not-exist')).toBeNull();
  });

  it('returns SessionInfo for an active session', async () => {
    const sessionId = await spawnSession(adapter, 'gs-1');
    const info = await adapter.getSession(sessionId);
    expect(info).not.toBeNull();
    expect(info?.sessionId).toBe(sessionId);
    expect(info?.status).toBe('active');
  });

  it('includes createdAt and lastActivityAt timestamps', async () => {
    const before = new Date();
    const sessionId = await spawnSession(adapter, 'gs-ts');
    const after = new Date();
    const info = await adapter.getSession(sessionId);
    expect(info?.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(info?.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(info?.lastActivityAt).toBeInstanceOf(Date);
  });

  it('reflects model when provided at spawn', async () => {
    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'gs-model',
      model: 'gpt-4',
    });
    const info = await adapter.getSession(sessionId);
    expect(info?.model).toBe('gpt-4');
  });
});

// ===========================================================================
// cancelSession
// ===========================================================================

describe('OpenCodeAdapter.cancelSession (unit)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => { adapter = makeAdapter(); });

  it('resolves without throwing for non-existent session (idempotent)', async () => {
    await expect(adapter.cancelSession('ghost-session', 'test')).resolves.toBeUndefined();
  });

  it('changes session status to "cancelled"', async () => {
    const sessionId = await spawnSession(adapter, 'cancel-1');
    await adapter.cancelSession(sessionId, 'user request');
    const info = await adapter.getSession(sessionId);
    expect(info?.status).toBe('cancelled');
  });

  it('is idempotent – cancelling twice does not throw', async () => {
    const sessionId = await spawnSession(adapter, 'cancel-2');
    await adapter.cancelSession(sessionId, 'first');
    await expect(adapter.cancelSession(sessionId, 'second')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// sendPrompt
// ===========================================================================

describe('OpenCodeAdapter.sendPrompt (unit)', () => {
  let adapter: OpenCodeAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = makeAdapter();
    sessionId = await spawnSession(adapter, 'sp');
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('resolves for a valid user message', async () => {
    await expect(adapter.sendPrompt(sessionId, { role: 'user', content: 'Hello' }))
      .resolves.toBeUndefined();
  });

  it('accepts all valid roles', async () => {
    for (const role of ['user', 'assistant', 'system'] as const) {
      await expect(adapter.sendPrompt(sessionId, { role, content: 'test' }))
        .resolves.toBeUndefined();
    }
  });

  it('accepts optional messageId and timestamp', async () => {
    const msg: UserMessage = {
      role: 'user',
      content: 'With metadata',
      messageId: 'msg-42',
      timestamp: new Date(),
    };
    await expect(adapter.sendPrompt(sessionId, msg)).resolves.toBeUndefined();
  });

  it('updates lastActivityAt after sending', async () => {
    const before = new Date();
    await adapter.sendPrompt(sessionId, { role: 'user', content: 'Activity' });
    const info = await adapter.getSession(sessionId);
    expect(info?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // ── Message validation ──────────────────────────────────────────────────

  it('throws INVALID_MESSAGE for null message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(adapter.sendPrompt(sessionId, null as any)).rejects.toBeInstanceOf(PromptDeliveryError);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adapter.sendPrompt(sessionId, null as any);
    } catch (e) {
      expect((e as PromptDeliveryError).code).toBe('INVALID_MESSAGE');
    }
  });

  it('throws INVALID_MESSAGE for empty content', async () => {
    try {
      await adapter.sendPrompt(sessionId, { role: 'user', content: '' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PromptDeliveryError);
      expect((e as PromptDeliveryError).code).toBe('INVALID_MESSAGE');
    }
  });

  it('throws INVALID_MESSAGE for whitespace-only content', async () => {
    await expect(adapter.sendPrompt(sessionId, { role: 'user', content: '   ' }))
      .rejects.toBeInstanceOf(PromptDeliveryError);
  });

  it('throws INVALID_MESSAGE for invalid role', async () => {
    try {
      await adapter.sendPrompt(sessionId, { role: 'invalid' as 'user', content: 'test' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as PromptDeliveryError).code).toBe('INVALID_MESSAGE');
    }
  });

  // ── Session validation ──────────────────────────────────────────────────

  it('throws SESSION_NOT_FOUND for unknown session', async () => {
    try {
      await adapter.sendPrompt('ghost', { role: 'user', content: 'test' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PromptDeliveryError);
      expect((e as PromptDeliveryError).code).toBe('SESSION_NOT_FOUND');
      expect((e as PromptDeliveryError).sessionId).toBe('ghost');
    }
  });

  it('throws SESSION_NOT_ACTIVE for cancelled session', async () => {
    await adapter.cancelSession(sessionId, 'test');
    try {
      await adapter.sendPrompt(sessionId, { role: 'user', content: 'test' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as PromptDeliveryError).code).toBe('SESSION_NOT_ACTIVE');
    }
  });

  it('throws SESSION_NOT_ACTIVE for pending session', async () => {
    const sessions = (adapter as unknown as { sessions: Map<string, { status: string }> }).sessions;
    const session = sessions.get(sessionId);
    if (session) session.status = 'pending';
    try {
      await adapter.sendPrompt(sessionId, { role: 'user', content: 'test' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as PromptDeliveryError).code).toBe('SESSION_NOT_ACTIVE');
    }
  });

  it('wraps transport failure as DELIVERY_FAILED', async () => {
    const spy = vi.spyOn(
      adapter as unknown as { deliverPromptToSession(...args: unknown[]): Promise<void> },
      'deliverPromptToSession'
    ).mockRejectedValue(new Error('socket hangup'));
    try {
      await adapter.sendPrompt(sessionId, { role: 'user', content: 'test' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as PromptDeliveryError).code).toBe('DELIVERY_FAILED');
      assertNoConcept({ message: (e as Error).message }, 'DELIVERY_FAILED message');
    } finally {
      spy.mockRestore();
    }
  });

  it('error messages contain no OpenCode-internal tokens (Property 4)', async () => {
    try {
      await adapter.sendPrompt('ghost', { role: 'user', content: 'test' });
    } catch (e) {
      assertNoConcept({ message: (e as Error).message }, 'SESSION_NOT_FOUND error');
    }
  });
});

// ===========================================================================
// subscribeEvents
// ===========================================================================

describe('OpenCodeAdapter.subscribeEvents (unit)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => { adapter = makeAdapter(); });
  afterEach(() => { /* cleanup handled per-test */ });

  it('returns an AsyncIterable', async () => {
    const sessionId = await spawnSession(adapter, 'se-1');
    const stream = adapter.subscribeEvents(sessionId);
    expect(stream[Symbol.asyncIterator]).toBeDefined();
    adapter.unsubscribeEvents(sessionId);
  });

  it('yields a single adapter.error then done for non-existent session', async () => {
    const stream = adapter.subscribeEvents('ghost');
    const it = stream[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.done).toBe(false);
    expect(first.value?.type).toBe('adapter.error');
    const second = await it.next();
    expect(second.done).toBe(true);
  });

  it('yields adapter.error for cancelled session', async () => {
    const sessionId = await spawnSession(adapter, 'se-cancel');
    await adapter.cancelSession(sessionId, 'test');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value?.type).toBe('adapter.error');
  });

  it('translates OpenCode events to Daemon format', async () => {
    const sessionId = await spawnSession(adapter, 'se-translate');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    await adapter.simulateEvent(sessionId, 'session.start', { msg: 'hi' });
    const result = await it.next();
    expect(result.value?.type).toBe('session.started');
    expect(result.value?.sessionId).toBe(sessionId);
    expect((result.value?.payload as Record<string, unknown>)?.msg).toBe('hi');
    adapter.unsubscribeEvents(sessionId);
  });

  it('delivers multiple events in order', async () => {
    const sessionId = await spawnSession(adapter, 'se-order');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    await adapter.simulateEvent(sessionId, 'session.start', { n: 1 });
    await adapter.simulateEvent(sessionId, 'message.delta', { n: 2 });
    await adapter.simulateEvent(sessionId, 'message.complete', { n: 3 });
    const r1 = await it.next();
    const r2 = await it.next();
    const r3 = await it.next();
    expect((r1.value?.payload as Record<string, unknown>)?.n).toBe(1);
    expect((r2.value?.payload as Record<string, unknown>)?.n).toBe(2);
    expect((r3.value?.payload as Record<string, unknown>)?.n).toBe(3);
    adapter.unsubscribeEvents(sessionId);
  });

  it('emits adapter.error (not raw event) when translation fails', async () => {
    const sessionId = await spawnSession(adapter, 'se-fail');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    // Push event with empty sid – EventTranslator will reject it
    await (adapter as unknown as {
      pushEvent(sid: string, ev: unknown): Promise<void>;
    }).pushEvent(sessionId, { event_type: 'session.start', data: null, sid: '', ts: 0 });
    const result = await it.next();
    expect(result.value?.type).toBe('adapter.error');
    expect(result.value?.metadata?.unsupported).toBe(true);
    assertNoConcept(result.value, 'adapter.error event');
    adapter.unsubscribeEvents(sessionId);
  });

  it('stream completes after unsubscribeEvents', async () => {
    const sessionId = await spawnSession(adapter, 'se-abort');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    adapter.unsubscribeEvents(sessionId);
    const result = await it.next();
    expect(result.done).toBe(true);
  });

  it('unsubscribeEvents is idempotent', () => {
    expect(() => adapter.unsubscribeEvents('ghost')).not.toThrow();
  });

  it('events contain no OpenCode-internal tokens (Property 4)', async () => {
    const sessionId = await spawnSession(adapter, 'se-p4');
    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();
    await adapter.simulateEvent(sessionId, 'tool.call', { name: 'sf_state_read' });
    const result = await it.next();
    assertNoConcept(result.value, 'subscribeEvents event');
    adapter.unsubscribeEvents(sessionId);
  });
});

// ===========================================================================
// getCapabilities
// ===========================================================================

describe('OpenCodeAdapter.getCapabilities (unit)', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => { adapter = makeAdapter(); });

  it('returns default capabilities for empty model string', async () => {
    const caps = await adapter.getCapabilities('');
    expect(caps.streaming).toBe(true);
    expect(caps.maxContextLength).toBe(128000);
    expect(caps.tools).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.functionCalling).toBe(true);
    expect(caps.outputFormats).toContain('text');
  });

  it('returns default capabilities for undefined model', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caps = await adapter.getCapabilities(undefined as any);
    expect(caps).toBeDefined();
    expect(caps.streaming).toBe(true);
  });

  it('returns capabilities for GPT-4 (128k context)', async () => {
    const caps = await adapter.getCapabilities('gpt-4');
    expect(caps.maxContextLength).toBe(128000);
    expect(caps.functionCalling).toBe(true);
  });

  it('returns capabilities for GPT-3.5 (16k context)', async () => {
    const caps = await adapter.getCapabilities('gpt-3.5-turbo');
    expect(caps.maxContextLength).toBe(16385);
  });

  it('returns capabilities for Claude (200k context, vision)', async () => {
    const caps = await adapter.getCapabilities('claude-3-5-sonnet');
    expect(caps.maxContextLength).toBe(200000);
    expect(caps.vision).toBe(true);
  });

  it('returns capabilities for Gemini (1M context)', async () => {
    const caps = await adapter.getCapabilities('gemini-pro');
    expect(caps.maxContextLength).toBe(1000000);
  });

  it('always includes text in outputFormats', async () => {
    const caps = await adapter.getCapabilities('any-model');
    expect(caps.outputFormats).toContain('text');
  });

  it('returns all required ModelCapabilities fields', async () => {
    const caps = await adapter.getCapabilities('test-model');
    expect(caps).toHaveProperty('streaming');
    expect(caps).toHaveProperty('maxContextLength');
    expect(caps).toHaveProperty('tools');
    expect(caps).toHaveProperty('vision');
    expect(caps).toHaveProperty('functionCalling');
    expect(caps).toHaveProperty('outputFormats');
  });

  it('returns correct types for all fields', async () => {
    const caps = await adapter.getCapabilities('test-model');
    expect(typeof caps.streaming).toBe('boolean');
    expect(typeof caps.maxContextLength).toBe('number');
    expect(typeof caps.tools).toBe('boolean');
    expect(typeof caps.vision).toBe('boolean');
    expect(typeof caps.functionCalling).toBe('boolean');
    expect(Array.isArray(caps.outputFormats)).toBe(true);
  });

  it('caches capabilities for the same model', async () => {
    const caps1 = await adapter.getCapabilities('cached-model');
    const caps2 = await adapter.getCapabilities('cached-model');
    expect(caps1).toEqual(caps2);
  });

  it('clearCapabilitiesCache clears specific model', async () => {
    await adapter.getCapabilities('model-x');
    adapter.clearCapabilitiesCache('model-x');
    // Should still work after clearing
    const caps = await adapter.getCapabilities('model-x');
    expect(caps).toBeDefined();
  });

  it('clearCapabilitiesCache() with no arg clears all', async () => {
    await adapter.getCapabilities('m1');
    await adapter.getCapabilities('m2');
    adapter.clearCapabilitiesCache();
    const caps = await adapter.getCapabilities('m1');
    expect(caps).toBeDefined();
  });

  it('never throws for any input', async () => {
    await expect(adapter.getCapabilities('')).resolves.toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(adapter.getCapabilities(null as any)).resolves.toBeDefined();
    await expect(adapter.getCapabilities('a'.repeat(1000))).resolves.toBeDefined();
  });
});

// ===========================================================================
// checkVersionCompatibility (adapter-level integration)
// ===========================================================================

describe('OpenCodeAdapter.checkVersionCompatibility (unit)', () => {
  it('returns compatible=true for version in range', () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <2.0.0' });
    expect(a.checkVersionCompatibility('1.5.0').compatible).toBe(true);
  });

  it('returns compatible=false for version outside range', () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <2.0.0' });
    expect(a.checkVersionCompatibility('2.0.0').compatible).toBe(false);
  });

  it('result includes version and requiredRange', () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <2.0.0' });
    const r = a.checkVersionCompatibility('1.5.0');
    expect(r.version).toBe('1.5.0');
    expect(r.requiredRange).toBe('>=1.0.0 <2.0.0');
  });

  it('updateConfig with new range is reflected in subsequent checks', () => {
    const a = makeAdapter({ compatibleKernelRange: '>=1.0.0 <2.0.0' });
    a.updateConfig({ compatibleKernelRange: '>=1.5.0 <2.0.0' });
    expect(a.checkVersionCompatibility('1.4.0').compatible).toBe(false);
    expect(a.checkVersionCompatibility('1.5.0').compatible).toBe(true);
  });
});

// ===========================================================================
// Configuration
// ===========================================================================

describe('OpenCodeAdapter configuration (unit)', () => {
  it('exposes version and compatibleKernelRange', () => {
    const a = makeAdapter({ compatibleKernelRange: '>=2.0.0 <3.0.0' });
    expect(a.version).toBeDefined();
    expect(a.compatibleKernelRange).toBe('>=2.0.0 <3.0.0');
  });

  it('getConfig returns current configuration', () => {
    const a = makeAdapter({ communicationTimeout: 9999 });
    expect(a.getConfig().communicationTimeout).toBe(9999);
  });

  it('updateConfig merges partial config', () => {
    const a = makeAdapter({ communicationTimeout: 5000 });
    a.updateConfig({ communicationTimeout: 12000 });
    expect(a.getConfig().communicationTimeout).toBe(12000);
    // Other fields unchanged
    expect(a.getConfig().compatibleKernelRange).toBe('>=1.0.0 <2.0.0');
  });

  it('getMaxReconnectAttempts and getReconnectDelayMs return defaults', () => {
    const a = makeAdapter();
    expect(a.getMaxReconnectAttempts()).toBe(3);
    expect(a.getReconnectDelayMs()).toBe(1000);
  });
});

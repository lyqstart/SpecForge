/**
 * OpenCode Adapter - Consolidated Error Handling Unit Tests
 *
 * Validates the four error categories defined in design.md §5.1:
 *   1. Version Incompatibility Errors
 *   2. Translation Failures
 *   3. OpenCode Communication Errors
 *   4. Thin Plugin Integration Errors
 *
 * These tests complement the per-component unit suites (OpenCodeAdapter,
 * sendPrompt, subscribeEvents, getCapabilities, ThinPluginClient,
 * DaemonStartupManager, translators, version-checker) by exercising each
 * error category as a single contract. They prove that:
 *
 *   • Errors are surfaced as the correct typed Error subclass with the
 *     expected discriminator code (no anonymous Error instances).
 *   • Error messages and details never expose OpenCode-internal concepts
 *     (Property 4 / Adapter Encapsulation).
 *   • Recovery paths (cleanup, no-throw on idempotent ops) behave as
 *     promised by the design.
 *
 * Requirements: 1.6, 2.3, 3.1, 4.4 (error contracts across all reqs)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OpenCodeAdapter,
  SessionInitializationError,
  PromptDeliveryError,
} from '../../src/OpenCodeAdapter';
import {
  ThinPluginClient,
  ThinPluginClientError,
  ThinPluginClientErrorCode,
} from '../../src/integration/ThinPluginClient';
import {
  DaemonStartupManager,
  DaemonStartupError,
  DaemonStartupErrorCode,
} from '../../src/integration/DaemonStartupManager';
import { ContextTranslator } from '../../src/translators/ContextTranslator';
import { EventTranslator } from '../../src/translators/EventTranslator';
import { ToolTranslator } from '../../src/translators/ToolTranslator';
import { CapabilityTranslator } from '../../src/translators/CapabilityTranslator';
import {
  checkCompatibility,
  buildVersionMismatchEvent,
} from '../../src/version-checker';
import type {
  SpawnAgentParams,
  UserMessage,
  OpenCodeContext,
  OpenCodeEvent,
  OpenCodeToolCall,
  OpenCodeToolResult,
} from '../../src/types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Substrings that would betray OpenCode internals if they leaked into a public
 * error message or event payload. The list mirrors the design's "no leakage"
 * contract (Property 4): adapter callers must never see references to
 * `ctx`, `callID`, OpenCode plugin hook structure, or OpenCode's internal
 * event schema names. We only include identifiers that are unambiguously
 * OpenCode-internal (so generic words like `error` or `session` are safe).
 */
const OPENCODE_INTERNAL_TOKENS = [
  'callID',
  'plugin_hook',
  'pluginHook',
  'oc_internal',
  'opencode_ctx',
];

function expectNoOpenCodeLeakage(payload: unknown, label: string): void {
  const str = JSON.stringify(payload, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
  for (const token of OPENCODE_INTERNAL_TOKENS) {
    expect(
      str.includes(token),
      `${label} leaked OpenCode-internal token "${token}": ${str}`
    ).toBe(false);
  }
}

// ============================================================================
// 1. Version Incompatibility Errors
// ============================================================================

describe('Error Handling / Version Incompatibility', () => {
  it('throws SessionInitializationError with VERSION_MISMATCH code when kernel is too new', async () => {
    const adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <1.15.0',
      communicationTimeout: 5000,
    });

    vi.spyOn(adapter as unknown as { detectOpenCodeVersion: () => Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('2.0.0');

    const params: SpawnAgentParams = {
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'intent-version-too-new',
    };

    await expect(adapter.spawnAgent(params)).rejects.toBeInstanceOf(
      SessionInitializationError
    );

    try {
      await adapter.spawnAgent(params);
    } catch (err) {
      const e = err as SessionInitializationError;
      expect(e.code).toBe('VERSION_MISMATCH');
      expect(e.message).toContain('2.0.0');
      expect(e.message).toContain('>=1.0.0 <1.15.0');
      expect(e.details).toBeDefined();
      expectNoOpenCodeLeakage({ message: e.message, details: e.details }, 'VERSION_MISMATCH error');
    }
  });

  it('throws SessionInitializationError when kernel is too old', async () => {
    const adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.14.0 <2.0.0',
      communicationTimeout: 5000,
    });

    vi.spyOn(adapter as unknown as { detectOpenCodeVersion: () => Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('1.0.0');

    const params: SpawnAgentParams = {
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'intent-version-too-old',
    };

    try {
      await adapter.spawnAgent(params);
      expect.fail('Expected SessionInitializationError');
    } catch (err) {
      const e = err as SessionInitializationError;
      expect(e).toBeInstanceOf(SessionInitializationError);
      expect(e.code).toBe('VERSION_MISMATCH');
    }
  });

  it('produces an adapter.version_mismatch event payload with daemon-neutral keys', () => {
    const ev = buildVersionMismatchEvent('2.0.0', '^1.14.0');

    expect(ev.type).toBe('adapter.version_mismatch');
    const allowedKeys = new Set([
      'detectedVersion',
      'requiredRange',
      'reason',
      'suggestedAction',
      'detectedAt',
    ]);
    for (const key of Object.keys(ev.payload)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    expectNoOpenCodeLeakage(ev, 'version_mismatch event');
  });

  it('checkCompatibility returns structured failure (not throw) for invalid range', () => {
    const result = checkCompatibility('1.0.0', 'totally-bogus');
    expect(result.compatible).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it('cleans up partial session state when version check fails', async () => {
    const adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <1.15.0',
      communicationTimeout: 5000,
    });

    vi.spyOn(adapter as unknown as { detectOpenCodeVersion: () => Promise<string> }, 'detectOpenCodeVersion')
      .mockResolvedValue('2.0.0');

    const params: SpawnAgentParams = {
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'intent-cleanup-on-version-fail',
    };

    await expect(adapter.spawnAgent(params)).rejects.toThrow(
      SessionInitializationError
    );

    // No session record should exist after the failure.
    const sessions = (adapter as unknown as { sessions: Map<string, unknown> }).sessions;
    expect(sessions.size).toBe(0);
  });
});

// ============================================================================
// 2. Translation Failures
// ============================================================================

describe('Error Handling / Translation Failures', () => {
  it('ContextTranslator returns structured unsupported result (never throws)', () => {
    const t = new ContextTranslator();
    const malformed = { workspace: '/x', oc_version: '1.14.0' } as OpenCodeContext;

    const result = t.translate(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.unsupported).toBe(true);
      expect(typeof result.reason).toBe('string');
      expectNoOpenCodeLeakage(result, 'context translation failure');
    }
  });

  it('EventTranslator returns structured unsupported result for missing required fields', () => {
    const t = new EventTranslator();
    const malformed: OpenCodeEvent = {
      event_type: '',
      data: {},
      sid: '',
      ts: 0,
    } as OpenCodeEvent;

    const result = t.translate(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.unsupported).toBe(true);
    }
  });

  it('ToolTranslator returns structured unsupported result for missing tool name', () => {
    const t = new ToolTranslator();
    const malformed = { arguments: { x: 1 } } as OpenCodeToolCall;

    const result = t.translateToolCall(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('name');
    }
  });

  it('ToolTranslator returns structured unsupported result for missing call_id', () => {
    const t = new ToolTranslator();
    const malformed = { result: { ok: true } } as OpenCodeToolResult;

    const result = t.translateToolResult(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('call_id');
    }
  });

  it('CapabilityTranslator falls back to defaults when input is null (never throws)', () => {
    const t = new CapabilityTranslator();
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t.translate(null as any)
    ).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caps = t.translate(null as any);
    expect(caps).toEqual(t.getDefaultCapabilities());
  });

  it('adapter.subscribeEvents emits adapter.error (not raw OpenCode event) on translation failure', async () => {
    const adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });

    const { sessionId } = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'intent-translation-failure',
    });

    const stream = adapter.subscribeEvents(sessionId);
    const it = stream[Symbol.asyncIterator]();

    // Push an event with an empty `sid` so the EventTranslator rejects it.
    await (
      adapter as unknown as {
        pushEvent: (sid: string, ev: OpenCodeEvent) => Promise<void>;
      }
    ).pushEvent(sessionId, {
      event_type: 'session.start',
      data: null,
      sid: '',
      ts: Date.now(),
    } as OpenCodeEvent);

    const result = await it.next();
    expect(result.done).toBe(false);
    expect(result.value!.type).toBe('adapter.error');
    expect(result.value!.metadata?.unsupported).toBe(true);
    // Ensure none of the OpenCode-internal field names leak through.
    expectNoOpenCodeLeakage(result.value, 'adapter.error event');

    adapter.unsubscribeEvents(sessionId);
  });
});

// ============================================================================
// 3. OpenCode Communication Errors (delivery + session-state errors)
// ============================================================================

describe('Error Handling / OpenCode Communication Errors', () => {
  let adapter: OpenCodeAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });

    const result = await adapter.spawnAgent({
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'intent-comm-error',
    });
    sessionId = result.sessionId;
  });

  it('sendPrompt to a missing session throws PromptDeliveryError(SESSION_NOT_FOUND)', async () => {
    const message: UserMessage = { role: 'user', content: 'hello' };

    try {
      await adapter.sendPrompt('does-not-exist', message);
      expect.fail('Expected PromptDeliveryError');
    } catch (err) {
      const e = err as PromptDeliveryError;
      expect(e).toBeInstanceOf(PromptDeliveryError);
      expect(e.code).toBe('SESSION_NOT_FOUND');
      expect(e.sessionId).toBe('does-not-exist');
    }
  });

  it('sendPrompt to a cancelled session throws PromptDeliveryError(SESSION_NOT_ACTIVE)', async () => {
    await adapter.cancelSession(sessionId, 'test');
    const message: UserMessage = { role: 'user', content: 'hello' };

    try {
      await adapter.sendPrompt(sessionId, message);
      expect.fail('Expected PromptDeliveryError');
    } catch (err) {
      const e = err as PromptDeliveryError;
      expect(e.code).toBe('SESSION_NOT_ACTIVE');
      expect(e.sessionId).toBe(sessionId);
    }
  });

  it('sendPrompt with empty content throws PromptDeliveryError(INVALID_MESSAGE)', async () => {
    const message: UserMessage = { role: 'user', content: '' };

    try {
      await adapter.sendPrompt(sessionId, message);
      expect.fail('Expected PromptDeliveryError');
    } catch (err) {
      const e = err as PromptDeliveryError;
      expect(e.code).toBe('INVALID_MESSAGE');
    }
  });

  it('sendPrompt wraps a transport-layer failure as DELIVERY_FAILED', async () => {
    const message: UserMessage = { role: 'user', content: 'hello' };

    const spy = vi
      .spyOn(
        adapter as unknown as {
          deliverPromptToSession: (...args: unknown[]) => Promise<void>;
        },
        'deliverPromptToSession'
      )
      .mockRejectedValue(new Error('socket hangup'));

    try {
      await adapter.sendPrompt(sessionId, message);
      expect.fail('Expected PromptDeliveryError');
    } catch (err) {
      const e = err as PromptDeliveryError;
      expect(e.code).toBe('DELIVERY_FAILED');
      expect(e.details).toBeDefined();
      // The original error is preserved under details.originalError but the
      // top-level message must remain Daemon-neutral.
      expectNoOpenCodeLeakage({ message: e.message }, 'DELIVERY_FAILED message');
    } finally {
      spy.mockRestore();
    }
  });

  it('cancelSession is idempotent on a missing session (no throw)', async () => {
    await expect(
      adapter.cancelSession('does-not-exist', 'test')
    ).resolves.toBeUndefined();
  });

  it('subscribeEvents on a missing session yields a single adapter.error then completes', async () => {
    const stream = adapter.subscribeEvents('non-existent-session');
    const it = stream[Symbol.asyncIterator]();

    const first = await it.next();
    expect(first.done).toBe(false);
    expect(first.value!.type).toBe('adapter.error');

    const second = await it.next();
    expect(second.done).toBe(true);
  });

  it('getCapabilities never throws and falls back to defaults on bad input', async () => {
    await expect(adapter.getCapabilities('')).resolves.toBeDefined();
    await expect(
      adapter.getCapabilities(null as unknown as string)
    ).resolves.toBeDefined();
  });
});

// ============================================================================
// 4. Thin Plugin Integration Errors
// ============================================================================

describe('Error Handling / Thin Plugin Integration Errors', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ThinPluginClient throws CONFIG_ERROR for empty baseUrl', () => {
    expect(() => new ThinPluginClient({ baseUrl: '' })).toThrow(
      ThinPluginClientError
    );

    try {
      new ThinPluginClient({ baseUrl: '' });
    } catch (err) {
      const e = err as ThinPluginClientError;
      expect(e.code).toBe(ThinPluginClientErrorCode.CONFIG_ERROR);
    }
  });

  it('ThinPluginClient surfaces network failures as RETRY_EXHAUSTED after retries', async () => {
    const failingFetch = vi
      .fn<(...args: unknown[]) => Promise<Response>>()
      .mockRejectedValue(new TypeError('fetch failed'));

    const client = new ThinPluginClient({
      baseUrl: 'http://localhost:65535',
      fetchFn: failingFetch as unknown as typeof fetch,
      maxRetries: 1,
      baseRetryDelay: 1,
      maxRetryDelay: 2,
    });

    try {
      await client.reportEvent({
        eventType: 'session.start',
        payload: {},
        sessionId: 's1',
        timestamp: Date.now(),
      });
      expect.fail('Expected ThinPluginClientError(RETRY_EXHAUSTED)');
    } catch (err) {
      const e = err as ThinPluginClientError;
      expect(e).toBeInstanceOf(ThinPluginClientError);
      expect(e.code).toBe(ThinPluginClientErrorCode.RETRY_EXHAUSTED);
    }
    // 1 initial attempt + 1 retry
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });

  it('ThinPluginClient throws INVALID_RESPONSE for malformed JSON body', async () => {
    const fetchFn = vi
      .fn<(...args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response('not-json', { status: 200 }));

    const client = new ThinPluginClient({
      baseUrl: 'http://localhost:3000',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
      baseRetryDelay: 1,
      maxRetryDelay: 2,
    });

    try {
      await client.reportEvent({
        eventType: 'session.start',
        payload: {},
        sessionId: 's1',
        timestamp: Date.now(),
      });
      expect.fail('Expected ThinPluginClientError(INVALID_RESPONSE)');
    } catch (err) {
      const e = err as ThinPluginClientError;
      expect(e).toBeInstanceOf(ThinPluginClientError);
      expect(e.code).toBe(ThinPluginClientErrorCode.INVALID_RESPONSE);
    }
  });

  it('DaemonStartupManager throws DaemonStartupError(CONFIG_ERROR) on empty command', () => {
    expect(
      () =>
        new DaemonStartupManager({
          daemonCommand: '',
          daemonArgs: ['x'],
        })
    ).toThrow(DaemonStartupError);

    try {
      new DaemonStartupManager({ daemonCommand: '', daemonArgs: ['x'] });
    } catch (err) {
      const e = err as DaemonStartupError;
      expect(e.code).toBe(DaemonStartupErrorCode.CONFIG_ERROR);
    }
  });

  it('DaemonStartupManager throws DaemonStartupError(CONFIG_ERROR) on empty args', () => {
    try {
      new DaemonStartupManager({
        daemonCommand: 'bun',
        daemonArgs: [],
      });
      expect.fail('Expected DaemonStartupError');
    } catch (err) {
      const e = err as DaemonStartupError;
      expect(e).toBeInstanceOf(DaemonStartupError);
      expect(e.code).toBe(DaemonStartupErrorCode.CONFIG_ERROR);
    }
  });

  it('typed errors carry a discriminator code so callers can branch without parsing messages', () => {
    // This is a contract test: every adapter-layer error class exposes a
    // string `code` property that is part of the public type. If any of the
    // error classes silently regress to anonymous Error subclasses, these
    // expectations will fail.
    expect(SessionInitializationError.prototype).toBeInstanceOf(Error);
    expect(PromptDeliveryError.prototype).toBeInstanceOf(Error);
    expect(ThinPluginClientError.prototype).toBeInstanceOf(Error);
    expect(DaemonStartupError.prototype).toBeInstanceOf(Error);

    const a = new SessionInitializationError('x', 'INVALID_PARAMS');
    const b = new PromptDeliveryError('x', 'INVALID_MESSAGE');
    const c = new ThinPluginClientError('x', ThinPluginClientErrorCode.CONFIG_ERROR);
    const d = new DaemonStartupError('x', DaemonStartupErrorCode.CONFIG_ERROR);

    expect(a.code).toBe('INVALID_PARAMS');
    expect(b.code).toBe('INVALID_MESSAGE');
    expect(c.code).toBe(ThinPluginClientErrorCode.CONFIG_ERROR);
    expect(d.code).toBe(DaemonStartupErrorCode.CONFIG_ERROR);
  });
});

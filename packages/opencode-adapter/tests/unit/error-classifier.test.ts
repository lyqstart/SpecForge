/**
 * Unit tests for `classifyError` — Task 7.1
 *
 * Pure-function test suite: every test feeds a synthetically-constructed
 * error (or translator unsupported result) directly into `classifyError`
 * and asserts on the returned `ClassifiedError` record. We deliberately do
 * NOT exercise `OpenCodeAdapter.subscribeEvents` / `spawnAgent` /
 * `sendPrompt` here — those paths can spin up event-stream timers, and
 * this suite must remain free of any async resource that could keep the
 * `bun test` process alive (regression guard for the 2026-05 incident
 * documented in `docs/engineering-lessons/async-resource-lifecycle.md`).
 *
 * Coverage matrix:
 *   Category 1 — Version Incompatibility
 *     • SessionInitializationError(VERSION_MISMATCH)
 *     • AdapterError VersionIncompatibilityError
 *     • AdapterError VersionParseError / VersionRangeInvalidError
 *   Category 2 — Translation Failure
 *     • Translator unsupported-result objects (4 sources)
 *     • PromptDeliveryError(TRANSLATION_FAILED)
 *     • AdapterError TranslationError subclasses
 *   Category 3 — OpenCode Communication
 *     • SessionInitializationError(SESSION_INIT_FAILED / TIMEOUT / INVALID_PARAMS)
 *     • PromptDeliveryError(SESSION_NOT_FOUND / SESSION_NOT_ACTIVE /
 *       INVALID_MESSAGE / DELIVERY_FAILED)
 *     • AdapterError CommunicationTimeoutError
 *   Category 4 — Thin Plugin Integration
 *     • Every ThinPluginClientErrorCode value
 *     • Every DaemonStartupErrorCode value
 *   Fallback
 *     • Plain Error / unknown / non-Error throw values
 *   D2 message contract
 *     • operation, timeoutMs, suggestion always present in the rendered
 *       message when relevant
 */

import { describe, it, expect } from 'vitest';
import {
  SessionInitializationError,
  PromptDeliveryError,
} from '../../src/OpenCodeAdapter';
import {
  ThinPluginClientError,
  ThinPluginClientErrorCode,
} from '../../src/integration/ThinPluginClient';
import {
  DaemonStartupError,
  DaemonStartupErrorCode,
} from '../../src/integration/DaemonStartupManager';
import {
  classifyError,
  ErrorCategory,
} from '../../src/errors/ErrorClassifier';
import {
  VersionIncompatibilityError,
  VersionParseError,
  VersionRangeInvalidError,
  ContextTranslationError,
  EventTranslationError,
  ToolTranslationError,
  CapabilityTranslationError,
  UnsupportedFeatureError,
  CommunicationTimeoutError,
} from '../../src/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectD2Compliant(
  message: string,
  expects: {
    category: ErrorCategory;
    operation?: string;
    timeoutMs?: number;
  },
): void {
  expect(message).toContain(`[${expects.category}]`);
  if (expects.operation) {
    expect(message).toContain(`operation=${expects.operation}`);
  }
  if (typeof expects.timeoutMs === 'number') {
    expect(message).toContain(`timeoutMs=${expects.timeoutMs}`);
  }
  // D2 — every classified error carries a concrete suggestion clause.
  expect(message).toContain('suggestion: ');
}

// ---------------------------------------------------------------------------
// Category 1: Version Incompatibility
// ---------------------------------------------------------------------------

describe('classifyError / Version Incompatibility', () => {
  it('classifies SessionInitializationError(VERSION_MISMATCH) as VERSION_INCOMPATIBILITY', () => {
    const err = new SessionInitializationError(
      'OpenCode version incompatibility: 2.0.0 not in >=1.0.0 <2.0.0',
      'VERSION_MISMATCH',
      { detectedVersion: '2.0.0', requiredRange: '>=1.0.0 <2.0.0' },
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(true);
    expect(out.eventType).toBe('adapter.version_mismatch');
    expect(out.code).toBe('VERSION_MISMATCH');
    expect(out.operation).toBe('spawnAgent');
    expectD2Compliant(out.message, {
      category: ErrorCategory.VERSION_INCOMPATIBILITY,
      operation: 'spawnAgent',
    });
    expect(out.suggestion).toMatch(/OpenCode|adapter/);
  });

  it('classifies AdapterError VersionIncompatibilityError as VERSION_INCOMPATIBILITY with adapter.version_mismatch event', () => {
    const err = new VersionIncompatibilityError('1.13.0', '^1.14.0');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(out.eventType).toBe('adapter.version_mismatch');
    expect(out.recordEvent).toBe(true);
    expect(out.retryable).toBe(false);
    expectD2Compliant(out.message, { category: ErrorCategory.VERSION_INCOMPATIBILITY });
  });

  it('classifies VersionParseError as VERSION_INCOMPATIBILITY (non-retryable, non-mismatch event)', () => {
    const err = new VersionParseError('not.a.version');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(out.retryable).toBe(false);
    // Parse errors are not "version_mismatch" — that event semantics is
    // reserved for actual range disagreements.
    expect(out.eventType).toBe('adapter.error');
  });

  it('classifies VersionRangeInvalidError as VERSION_INCOMPATIBILITY', () => {
    const err = new VersionRangeInvalidError('::garbage::');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.VERSION_INCOMPATIBILITY);
    expect(out.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Category 2: Translation Failure
// ---------------------------------------------------------------------------

describe('classifyError / Translation Failure', () => {
  it('classifies an unsupported translator result (Context) as TRANSLATION (no retry)', () => {
    const result = {
      success: false as const,
      unsupported: true as const,
      reason: 'Missing required field: oc_sid',
    };

    const out = classifyError(result);

    expect(out.category).toBe(ErrorCategory.TRANSLATION);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(true);
    expect(out.eventType).toBe('adapter.error');
    expect(out.operation).toBe('translate');
    expect(out.message).toContain(result.reason);
    expectD2Compliant(out.message, {
      category: ErrorCategory.TRANSLATION,
      operation: 'translate',
    });
  });

  it('classifies an unsupported translator result (Tool) as TRANSLATION', () => {
    const result = {
      success: false as const,
      unsupported: true as const,
      reason: 'Missing required field: name',
    };
    const out = classifyError(result);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('classifies PromptDeliveryError(TRANSLATION_FAILED) as TRANSLATION', () => {
    const err = new PromptDeliveryError(
      'Cannot translate UserMessage',
      'TRANSLATION_FAILED',
      'session-1',
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.TRANSLATION);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(true);
    expect(out.operation).toBe('sendPrompt');
    expectD2Compliant(out.message, {
      category: ErrorCategory.TRANSLATION,
      operation: 'sendPrompt',
    });
  });

  it('classifies AdapterError ContextTranslationError as TRANSLATION', () => {
    const err = new ContextTranslationError('missing required field');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
    expect(out.eventType).toBe('adapter.error');
  });

  it('classifies AdapterError EventTranslationError as TRANSLATION', () => {
    const err = new EventTranslationError('session.start', 'unknown shape');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('classifies AdapterError ToolTranslationError as TRANSLATION', () => {
    const err = new ToolTranslationError('custom_tool', 'not allowlisted');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('classifies AdapterError CapabilityTranslationError as TRANSLATION', () => {
    const err = new CapabilityTranslationError('gpt-x', 'unknown family');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
  });

  it('classifies AdapterError UnsupportedFeatureError as TRANSLATION (concept isolation)', () => {
    const err = new UnsupportedFeatureError('experimental_api');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.TRANSLATION);
    expect(out.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Category 3: OpenCode Communication
// ---------------------------------------------------------------------------

describe('classifyError / OpenCode Communication', () => {
  it('classifies SessionInitializationError(SESSION_INIT_FAILED) as COMMUNICATION (retryable)', () => {
    const err = new SessionInitializationError(
      'spawn failed: ECONNREFUSED',
      'SESSION_INIT_FAILED',
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(true);
    expect(out.recordEvent).toBe(true);
    expect(out.eventType).toBe('adapter.error');
    expect(out.operation).toBe('spawnAgent');
    expectD2Compliant(out.message, {
      category: ErrorCategory.COMMUNICATION,
      operation: 'spawnAgent',
    });
  });

  it('classifies SessionInitializationError(TIMEOUT) as COMMUNICATION with timeoutMs in message', () => {
    const err = new SessionInitializationError(
      'Session initialization timed out after 5000ms',
      'TIMEOUT',
      { timeoutMs: 5000 },
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(true);
    expect(out.timeoutMs).toBe(5000);
    expectD2Compliant(out.message, {
      category: ErrorCategory.COMMUNICATION,
      operation: 'spawnAgent',
      timeoutMs: 5000,
    });
  });

  it('classifies SessionInitializationError(INVALID_PARAMS) as COMMUNICATION (non-retryable, no event)', () => {
    const err = new SessionInitializationError(
      'Invalid agent role',
      'INVALID_PARAMS',
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(false);
  });

  it('classifies PromptDeliveryError(SESSION_NOT_FOUND) as COMMUNICATION (non-retryable, no event)', () => {
    const err = new PromptDeliveryError('Session not found', 'SESSION_NOT_FOUND', 'sess-1');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(false);
    expect(out.operation).toBe('sendPrompt');
  });

  it('classifies PromptDeliveryError(SESSION_NOT_ACTIVE) as COMMUNICATION (non-retryable)', () => {
    const err = new PromptDeliveryError(
      'Session is not active',
      'SESSION_NOT_ACTIVE',
      'sess-1',
    );
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(false);
  });

  it('classifies PromptDeliveryError(INVALID_MESSAGE) as COMMUNICATION (non-retryable, no event)', () => {
    const err = new PromptDeliveryError('Empty content', 'INVALID_MESSAGE');
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(false);
  });

  it('classifies PromptDeliveryError(DELIVERY_FAILED) as COMMUNICATION (retryable, with timeoutMs)', () => {
    const err = new PromptDeliveryError(
      'Prompt delivery timed out after 5000ms',
      'DELIVERY_FAILED',
      'sess-1',
      { timeoutMs: 5000 },
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(true);
    expect(out.timeoutMs).toBe(5000);
    expectD2Compliant(out.message, {
      category: ErrorCategory.COMMUNICATION,
      operation: 'sendPrompt',
      timeoutMs: 5000,
    });
  });

  it('classifies AdapterError CommunicationTimeoutError as COMMUNICATION with operation+timeoutMs', () => {
    const err = new CommunicationTimeoutError('sendPrompt', 7500, 'sess-1');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(true);
    expect(out.timeoutMs).toBe(7500);
    expect(out.operation).toBe('sendPrompt');
    expectD2Compliant(out.message, {
      category: ErrorCategory.COMMUNICATION,
      operation: 'sendPrompt',
      timeoutMs: 7500,
    });
  });
});

// ---------------------------------------------------------------------------
// Category 4: Thin Plugin Integration
// ---------------------------------------------------------------------------

describe('classifyError / Thin Plugin Integration', () => {
  it('classifies ThinPluginClientError(NETWORK_ERROR) as THIN_PLUGIN (retryable)', () => {
    const err = new ThinPluginClientError(
      'fetch failed',
      ThinPluginClientErrorCode.NETWORK_ERROR,
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(true);
    expect(out.recordEvent).toBe(true);
    expect(out.operation).toBe('thinPlugin.request');
    expectD2Compliant(out.message, {
      category: ErrorCategory.THIN_PLUGIN,
      operation: 'thinPlugin.request',
    });
  });

  it('classifies ThinPluginClientError(TIMEOUT) as THIN_PLUGIN with timeoutMs', () => {
    const err = new ThinPluginClientError(
      'request timed out',
      ThinPluginClientErrorCode.TIMEOUT,
      undefined,
      { timeoutMs: 10000 },
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(true);
    expect(out.timeoutMs).toBe(10000);
    expectD2Compliant(out.message, {
      category: ErrorCategory.THIN_PLUGIN,
      operation: 'thinPlugin.request',
      timeoutMs: 10000,
    });
  });

  it('classifies ThinPluginClientError(SERVER_ERROR, 500) as retryable, (400) as non-retryable, (429) as retryable', () => {
    const e500 = new ThinPluginClientError('boom', ThinPluginClientErrorCode.SERVER_ERROR, 500);
    const e400 = new ThinPluginClientError('bad', ThinPluginClientErrorCode.SERVER_ERROR, 400);
    const e429 = new ThinPluginClientError('slow', ThinPluginClientErrorCode.SERVER_ERROR, 429);

    expect(classifyError(e500).retryable).toBe(true);
    expect(classifyError(e400).retryable).toBe(false);
    expect(classifyError(e429).retryable).toBe(true);

    expect(classifyError(e500).category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(classifyError(e400).category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(classifyError(e429).category).toBe(ErrorCategory.THIN_PLUGIN);
  });

  it('classifies ThinPluginClientError(INVALID_RESPONSE) as THIN_PLUGIN (non-retryable)', () => {
    const err = new ThinPluginClientError(
      'malformed JSON',
      ThinPluginClientErrorCode.INVALID_RESPONSE,
    );
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(false);
  });

  it('classifies ThinPluginClientError(RETRY_EXHAUSTED) as THIN_PLUGIN (non-retryable)', () => {
    const err = new ThinPluginClientError(
      'gave up',
      ThinPluginClientErrorCode.RETRY_EXHAUSTED,
    );
    const out = classifyError(err);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(true);
  });

  it('classifies ThinPluginClientError(CONFIG_ERROR) as THIN_PLUGIN (non-retryable)', () => {
    const err = new ThinPluginClientError(
      'baseUrl missing',
      ThinPluginClientErrorCode.CONFIG_ERROR,
    );
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(false);
  });

  it('classifies ThinPluginClientError(ABORTED) as THIN_PLUGIN with no event recorded', () => {
    const err = new ThinPluginClientError('aborted', ThinPluginClientErrorCode.ABORTED);
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.recordEvent).toBe(false);
  });

  it('classifies DaemonStartupError(STARTUP_TIMEOUT) as THIN_PLUGIN (retryable)', () => {
    const err = new DaemonStartupError(
      'daemon did not become healthy',
      DaemonStartupErrorCode.STARTUP_TIMEOUT,
    );

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(true);
    expect(out.recordEvent).toBe(true);
    expect(out.operation).toBe('daemonStartup');
    expectD2Compliant(out.message, {
      category: ErrorCategory.THIN_PLUGIN,
      operation: 'daemonStartup',
    });
  });

  it('classifies DaemonStartupError(CONFIG_ERROR) as THIN_PLUGIN (non-retryable)', () => {
    const err = new DaemonStartupError(
      'daemonCommand required',
      DaemonStartupErrorCode.CONFIG_ERROR,
    );
    const out = classifyError(err);
    expect(out.category).toBe(ErrorCategory.THIN_PLUGIN);
    expect(out.retryable).toBe(false);
  });

  it('classifies every DaemonStartupErrorCode value as THIN_PLUGIN', () => {
    const codes = Object.values(DaemonStartupErrorCode);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const out = classifyError(new DaemonStartupError(`test:${code}`, code));
      expect(out.category, `code=${code}`).toBe(ErrorCategory.THIN_PLUGIN);
      // recordEvent must be true for every daemon-startup failure (operators
      // need visibility regardless of retryability).
      expect(out.recordEvent, `code=${code}`).toBe(true);
      // D2: every classified error carries operation + suggestion.
      expectD2Compliant(out.message, {
        category: ErrorCategory.THIN_PLUGIN,
        operation: 'daemonStartup',
      });
    }
  });

  it('classifies every ThinPluginClientErrorCode value as THIN_PLUGIN', () => {
    const codes = Object.values(ThinPluginClientErrorCode);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const out = classifyError(new ThinPluginClientError(`test:${code}`, code));
      expect(out.category, `code=${code}`).toBe(ErrorCategory.THIN_PLUGIN);
      expectD2Compliant(out.message, {
        category: ErrorCategory.THIN_PLUGIN,
        operation: 'thinPlugin.request',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback / unknown
// ---------------------------------------------------------------------------

describe('classifyError / Fallback', () => {
  it('classifies a plain Error containing "timeout" as COMMUNICATION (retryable)', () => {
    const err = new Error('socket timeout while reading');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.COMMUNICATION);
    expect(out.retryable).toBe(true);
    expectD2Compliant(out.message, { category: ErrorCategory.COMMUNICATION });
  });

  it('classifies a plain Error without a known signal as GENERAL (non-retryable)', () => {
    const err = new Error('something went wrong');

    const out = classifyError(err);

    expect(out.category).toBe(ErrorCategory.GENERAL);
    expect(out.retryable).toBe(false);
    expect(out.recordEvent).toBe(true);
    expectD2Compliant(out.message, { category: ErrorCategory.GENERAL });
  });

  it('classifies a non-Error throw value as GENERAL with the value rendered into the message', () => {
    const out = classifyError('boom');
    expect(out.category).toBe(ErrorCategory.GENERAL);
    expect(out.message).toContain('boom');
    expectD2Compliant(out.message, { category: ErrorCategory.GENERAL });
  });

  it('classifies undefined / null without throwing', () => {
    const outU = classifyError(undefined);
    const outN = classifyError(null);
    expect(outU.category).toBe(ErrorCategory.GENERAL);
    expect(outN.category).toBe(ErrorCategory.GENERAL);
    expect(outU.suggestion.length).toBeGreaterThan(0);
    expect(outN.suggestion.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D2 invariants — every classified error must satisfy these globally.
// ---------------------------------------------------------------------------

describe('classifyError / D2 invariants', () => {
  const samples: Array<{ name: string; value: unknown }> = [
    { name: 'VERSION_MISMATCH', value: new SessionInitializationError('v', 'VERSION_MISMATCH') },
    { name: 'TIMEOUT', value: new SessionInitializationError('t', 'TIMEOUT', { timeoutMs: 9000 }) },
    { name: 'SESSION_INIT_FAILED', value: new SessionInitializationError('x', 'SESSION_INIT_FAILED') },
    { name: 'INVALID_PARAMS', value: new SessionInitializationError('x', 'INVALID_PARAMS') },
    { name: 'TRANSLATION_FAILED', value: new PromptDeliveryError('x', 'TRANSLATION_FAILED', 's') },
    { name: 'DELIVERY_FAILED', value: new PromptDeliveryError('x', 'DELIVERY_FAILED', 's', { timeoutMs: 1234 }) },
    { name: 'SESSION_NOT_FOUND', value: new PromptDeliveryError('x', 'SESSION_NOT_FOUND', 's') },
    { name: 'NETWORK_ERROR', value: new ThinPluginClientError('x', ThinPluginClientErrorCode.NETWORK_ERROR) },
    { name: 'STARTUP_TIMEOUT', value: new DaemonStartupError('x', DaemonStartupErrorCode.STARTUP_TIMEOUT) },
    { name: 'unsupported-translation', value: { success: false, unsupported: true, reason: 'r' } },
    { name: 'plain-Error', value: new Error('plain') },
    { name: 'string-throw', value: 'literal' },
  ];

  it('every sample produces a non-empty suggestion', () => {
    for (const s of samples) {
      const out = classifyError(s.value);
      expect(out.suggestion, `sample=${s.name}`).toBeTruthy();
      expect(out.suggestion.length, `sample=${s.name}`).toBeGreaterThan(0);
    }
  });

  it('every sample renders its suggestion into the message (D2)', () => {
    for (const s of samples) {
      const out = classifyError(s.value);
      expect(out.message, `sample=${s.name}`).toContain('suggestion: ');
      expect(out.message, `sample=${s.name}`).toContain(out.suggestion);
    }
  });

  it('every sample tags its category bracket into the message', () => {
    for (const s of samples) {
      const out = classifyError(s.value);
      expect(out.message, `sample=${s.name}`).toContain(`[${out.category}]`);
    }
  });

  it('classifyError never throws for any input', () => {
    for (const s of samples) {
      expect(() => classifyError(s.value), `sample=${s.name}`).not.toThrow();
    }
  });
});

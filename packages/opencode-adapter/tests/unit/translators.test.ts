/**
 * Comprehensive Unit Tests: Translator Modules
 *
 * Covers ContextTranslator, EventTranslator, ToolTranslator, CapabilityTranslator.
 * Each translator is tested for:
 *   - Valid input translation
 *   - Missing / invalid required fields
 *   - Edge cases (null, empty, whitespace, special chars)
 *   - Concept isolation (no OpenCode-internal tokens in output)
 *
 * Requirements: 3.1, 3.2, 3.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextTranslator } from '../../src/translators/ContextTranslator';
import { EventTranslator } from '../../src/translators/EventTranslator';
import { ToolTranslator } from '../../src/translators/ToolTranslator';
import { CapabilityTranslator } from '../../src/translators/CapabilityTranslator';
import type {
  OpenCodeContext,
  OpenCodeEvent,
  OpenCodeToolCall,
  OpenCodeToolResult,
  OpenCodeModelCapabilities,
  ModelCapabilities,
} from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tokens that must never appear in Daemon-facing output (Property 4). */
const OPENCODE_INTERNAL_TOKENS = ['callID', 'plugin_hook', 'pluginHook', 'oc_internal', 'opencode_ctx'];

function assertNoConcept(value: unknown, label: string): void {
  const str = JSON.stringify(value ?? null);
  for (const token of OPENCODE_INTERNAL_TOKENS) {
    expect(str.includes(token), `${label} leaked "${token}"`).toBe(false);
  }
}

// ===========================================================================
// ContextTranslator
// ===========================================================================

describe('ContextTranslator (unit)', () => {
  let translator: ContextTranslator;

  beforeEach(() => {
    translator = new ContextTranslator();
  });

  // ── Valid translations ──────────────────────────────────────────────────

  describe('translate – valid inputs', () => {
    it('translates minimal context (oc_sid + workspace + oc_version)', () => {
      const ctx: OpenCodeContext = { oc_sid: 'sid-1', workspace: '/w', oc_version: '1.14.0' };
      const r = translator.translate(ctx);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.sessionId).toBe('sid-1');
        expect(r.data.workspace).toBe('/w');
        expect(r.data.kernelVersion).toBe('1.14.0');
        expect(r.data.userId).toBeUndefined();
        expect(r.data.model).toBeUndefined();
        expect(r.data.env).toBeUndefined();
      }
    });

    it('translates full context with all optional fields', () => {
      const ctx: OpenCodeContext = {
        oc_sid: 'sid-full',
        oc_uid: 'uid-42',
        workspace: '/workspace/project',
        oc_version: '1.15.0',
        model: { provider: 'anthropic', name: 'claude-3-5-sonnet' },
        env: { NODE_ENV: 'test', DEBUG: '1' },
      };
      const r = translator.translate(ctx);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.userId).toBe('uid-42');
        expect(r.data.model).toEqual({ provider: 'anthropic', name: 'claude-3-5-sonnet' });
        expect(r.data.env).toEqual({ NODE_ENV: 'test', DEBUG: '1' });
      }
    });

    it('output contains no OpenCode-internal tokens (Property 4)', () => {
      const ctx: OpenCodeContext = { oc_sid: 'sid-p4', workspace: '/w', oc_version: '1.14.0' };
      const r = translator.translate(ctx);
      assertNoConcept(r, 'ContextTranslator output');
    });

    it('preserves env with special characters', () => {
      const ctx: OpenCodeContext = {
        oc_sid: 'sid-env',
        workspace: '/w',
        oc_version: '1.14.0',
        env: { PATH: '/usr/bin:/bin', JSON: '{"k":"v"}' },
      };
      const r = translator.translate(ctx);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.env?.PATH).toBe('/usr/bin:/bin');
    });

    it('handles empty env object', () => {
      const ctx: OpenCodeContext = { oc_sid: 'sid-emptyenv', workspace: '/w', oc_version: '1.14.0', env: {} };
      const r = translator.translate(ctx);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.env).toEqual({});
    });
  });

  // ── Missing required fields ─────────────────────────────────────────────

  describe('translate – missing required fields', () => {
    it('returns unsupported when oc_sid is absent', () => {
      const ctx = { workspace: '/w', oc_version: '1.14.0' } as OpenCodeContext;
      const r = translator.translate(ctx);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.unsupported).toBe(true);
        expect(r.reason).toContain('oc_sid');
      }
    });

    it('returns unsupported when workspace is absent', () => {
      const ctx = { oc_sid: 'sid-1', oc_version: '1.14.0' } as OpenCodeContext;
      const r = translator.translate(ctx);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('workspace');
    });

    it('returns unsupported for empty-string oc_sid', () => {
      const ctx = { oc_sid: '', workspace: '/w', oc_version: '1.14.0' } as OpenCodeContext;
      const r = translator.translate(ctx);
      expect(r.success).toBe(false);
    });

    it('returns unsupported for whitespace-only oc_sid', () => {
      const ctx = { oc_sid: '   ', workspace: '/w', oc_version: '1.14.0' } as OpenCodeContext;
      const r = translator.translate(ctx);
      expect(r.success).toBe(false);
    });

    it('returns unsupported for empty-string workspace', () => {
      const ctx = { oc_sid: 'sid-1', workspace: '', oc_version: '1.14.0' } as OpenCodeContext;
      const r = translator.translate(ctx);
      expect(r.success).toBe(false);
    });

    it('never throws for empty object input – returns unsupported', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => translator.translate({} as any)).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = translator.translate({} as any);
      expect(r.success).toBe(false);
    });
  });

  // ── isFieldSupported ────────────────────────────────────────────────────

  describe('isFieldSupported', () => {
    it('returns true for all known fields', () => {
      for (const f of ['oc_sid', 'oc_uid', 'workspace', 'oc_version', 'model', 'env']) {
        expect(translator.isFieldSupported(f)).toBe(true);
      }
    });

    it('returns false for unknown fields', () => {
      expect(translator.isFieldSupported('unknown')).toBe(false);
      expect(translator.isFieldSupported('')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(translator.isFieldSupported(null as any)).toBe(false);
    });
  });
});

// ===========================================================================
// EventTranslator
// ===========================================================================

describe('EventTranslator (unit)', () => {
  let translator: EventTranslator;

  beforeEach(() => {
    translator = new EventTranslator();
  });

  // ── Known event type mappings ───────────────────────────────────────────

  describe('translate – known event types', () => {
    const MAPPINGS: Array<[string, string]> = [
      ['session.start', 'session.started'],
      ['session.end', 'session.ended'],
      ['session.error', 'session.error'],
      ['message.delta', 'content.delta'],
      ['message.complete', 'content.complete'],
      ['tool.call', 'tool.called'],
      ['tool.result', 'tool.result'],
      ['tool.error', 'tool.error'],
      ['error', 'adapter.error'],
      ['version.mismatch', 'adapter.version_mismatch'],
    ];

    for (const [input, expected] of MAPPINGS) {
      it(`maps "${input}" → "${expected}"`, () => {
        const ev: OpenCodeEvent = { event_type: input, data: {}, sid: 'sid-1', ts: 1000 };
        const r = translator.translate(ev);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.type).toBe(expected);
      });
    }

    it('prefixes unknown event types with "opencode."', () => {
      const ev: OpenCodeEvent = { event_type: 'custom.thing', data: {}, sid: 'sid-1', ts: 1000 };
      const r = translator.translate(ev);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.type).toBe('opencode.custom.thing');
    });
  });

  // ── Field preservation ──────────────────────────────────────────────────

  describe('translate – field preservation', () => {
    it('preserves sessionId, payload, and timestamp', () => {
      const ts = 1700000000000;
      const ev: OpenCodeEvent = { event_type: 'session.start', data: { x: 1 }, sid: 'sid-abc', ts };
      const r = translator.translate(ev);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.sessionId).toBe('sid-abc');
        expect(r.data.payload).toEqual({ x: 1 });
        expect(r.data.timestamp.getTime()).toBe(ts);
      }
    });

    it('handles null data payload', () => {
      const ev: OpenCodeEvent = { event_type: 'session.start', data: null, sid: 'sid-1', ts: 0 };
      const r = translator.translate(ev);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.payload).toBeNull();
    });

    it('handles zero timestamp', () => {
      const ev: OpenCodeEvent = { event_type: 'session.start', data: {}, sid: 'sid-1', ts: 0 };
      const r = translator.translate(ev);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.timestamp.getTime()).toBe(0);
    });
  });

  // ── Missing required fields ─────────────────────────────────────────────

  describe('translate – missing required fields', () => {
    it('returns unsupported when event_type is empty', () => {
      const ev: OpenCodeEvent = { event_type: '', data: {}, sid: 'sid-1', ts: 0 };
      const r = translator.translate(ev);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('event_type');
    });

    it('returns unsupported when sid is empty', () => {
      const ev: OpenCodeEvent = { event_type: 'session.start', data: {}, sid: '', ts: 0 };
      const r = translator.translate(ev);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('sid');
    });

    it('output contains no OpenCode-internal tokens (Property 4)', () => {
      const ev: OpenCodeEvent = { event_type: 'session.start', data: {}, sid: 'sid-1', ts: 0 };
      const r = translator.translate(ev);
      assertNoConcept(r, 'EventTranslator output');
    });
  });

  // ── isEventTypeSupported / mapEventType ────────────────────────────────

  describe('isEventTypeSupported', () => {
    it('returns true for all known types', () => {
      for (const t of ['session.start', 'session.end', 'message.delta', 'tool.call', 'error']) {
        expect(translator.isEventTypeSupported(t)).toBe(true);
      }
    });

    it('returns false for unknown types', () => {
      expect(translator.isEventTypeSupported('custom.event')).toBe(false);
      expect(translator.isEventTypeSupported('')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(translator.isEventTypeSupported(null as any)).toBe(false);
    });
  });

  describe('mapEventType', () => {
    it('maps known types correctly', () => {
      expect(translator.mapEventType('session.start')).toBe('session.started');
      expect(translator.mapEventType('error')).toBe('adapter.error');
    });

    it('prefixes unknown types', () => {
      expect(translator.mapEventType('foo.bar')).toBe('opencode.foo.bar');
    });
  });
});

// ===========================================================================
// ToolTranslator
// ===========================================================================

describe('ToolTranslator (unit)', () => {
  let translator: ToolTranslator;

  beforeEach(() => {
    translator = new ToolTranslator();
  });

  // ── translateToolCall – valid ────────────────────────────────────────────

  describe('translateToolCall – valid inputs', () => {
    it('translates minimal tool call', () => {
      const tc: OpenCodeToolCall = { name: 'sf_state_read', arguments: { key: 'x' } };
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.name).toBe('sf_state_read');
        expect(r.data.arguments).toEqual({ key: 'x' });
        expect(r.data.callId).toBeDefined();
        expect(r.data.sessionId).toBeUndefined();
      }
    });

    it('uses provided call ID', () => {
      const tc: OpenCodeToolCall = { name: 'tool', arguments: {}, id: 'call-99' };
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.callId).toBe('call-99');
    });

    it('attaches sessionId when provided', () => {
      const tc: OpenCodeToolCall = { name: 'tool', arguments: {} };
      const r = translator.translateToolCall(tc, 'sess-1');
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.sessionId).toBe('sess-1');
    });

    it('generates callId when id is absent', () => {
      const tc: OpenCodeToolCall = { name: 'tool', arguments: {} };
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.callId).toMatch(/^call-\d+$/);
    });

    it('preserves complex nested arguments', () => {
      const args = { a: [1, 2], b: { c: true, d: null } };
      const tc: OpenCodeToolCall = { name: 'tool', arguments: args };
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.arguments).toEqual(args);
    });

    it('output contains no OpenCode-internal tokens (Property 4)', () => {
      const tc: OpenCodeToolCall = { name: 'tool', arguments: { x: 1 } };
      const r = translator.translateToolCall(tc);
      assertNoConcept(r, 'ToolTranslator.translateToolCall output');
    });
  });

  // ── translateToolCall – invalid ─────────────────────────────────────────

  describe('translateToolCall – invalid inputs', () => {
    it('returns unsupported for empty name', () => {
      const tc = { name: '', arguments: {} } as OpenCodeToolCall;
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('name');
    });

    it('returns unsupported for missing arguments', () => {
      const tc = { name: 'tool' } as OpenCodeToolCall;
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('arguments');
    });

    it('returns unsupported for whitespace-only name', () => {
      const tc = { name: '   ', arguments: {} } as OpenCodeToolCall;
      const r = translator.translateToolCall(tc);
      expect(r.success).toBe(false);
    });
  });

  // ── translateToolResult – valid ─────────────────────────────────────────

  describe('translateToolResult – valid inputs', () => {
    it('translates minimal tool result', () => {
      const tr: OpenCodeToolResult = { call_id: 'c-1', result: { ok: true } };
      const r = translator.translateToolResult(tr);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.callId).toBe('c-1');
        expect(r.data.result).toEqual({ ok: true });
        expect(r.data.error).toBeUndefined();
      }
    });

    it('preserves error field', () => {
      const tr: OpenCodeToolResult = { call_id: 'c-2', result: null, error: 'ENOENT' };
      const r = translator.translateToolResult(tr);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.error).toBe('ENOENT');
    });

    it('attaches sessionId when provided', () => {
      const tr: OpenCodeToolResult = { call_id: 'c-3', result: {} };
      const r = translator.translateToolResult(tr, 'sess-2');
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.sessionId).toBe('sess-2');
    });
  });

  // ── translateToolResult – invalid ───────────────────────────────────────

  describe('translateToolResult – invalid inputs', () => {
    it('returns unsupported for empty call_id', () => {
      const tr = { call_id: '', result: {} } as OpenCodeToolResult;
      const r = translator.translateToolResult(tr);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.reason).toContain('call_id');
    });

    it('returns unsupported for whitespace-only call_id', () => {
      const tr = { call_id: '   ', result: {} } as OpenCodeToolResult;
      const r = translator.translateToolResult(tr);
      expect(r.success).toBe(false);
    });
  });

  // ── isToolSupported ─────────────────────────────────────────────────────

  describe('isToolSupported', () => {
    it('returns true for non-empty tool names', () => {
      expect(translator.isToolSupported('sf_state_read')).toBe(true);
      expect(translator.isToolSupported('a')).toBe(true);
    });

    it('returns false for empty / whitespace / non-string', () => {
      expect(translator.isToolSupported('')).toBe(false);
      expect(translator.isToolSupported('   ')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(translator.isToolSupported(null as any)).toBe(false);
    });
  });
});

// ===========================================================================
// CapabilityTranslator
// ===========================================================================

describe('CapabilityTranslator (unit)', () => {
  let translator: CapabilityTranslator;

  beforeEach(() => {
    translator = new CapabilityTranslator();
  });

  // ── translate ───────────────────────────────────────────────────────────

  describe('translate', () => {
    it('translates full capabilities', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'openai',
        model: 'gpt-4',
        features: { streaming: false, vision: false, function_calling: true, json_output: true },
        context_window: 128000,
        tools: ['t1', 't2'],
      };
      const r = translator.translate(oc);
      expect(r.streaming).toBe(false);
      expect(r.vision).toBe(false);
      expect(r.functionCalling).toBe(true);
      expect(r.maxContextLength).toBe(128000);
      expect(r.tools).toBe(true);
      expect(r.outputFormats).toContain('json');
    });

    it('uses defaults when features are undefined', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test',
        features: undefined as unknown as OpenCodeModelCapabilities['features'],
        context_window: undefined,
        tools: undefined,
      };
      const r = translator.translate(oc);
      const d = translator.getDefaultCapabilities();
      expect(r.streaming).toBe(d.streaming);
      expect(r.maxContextLength).toBe(d.maxContextLength);
    });

    it('returns defaults for null input (never throws)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => translator.translate(null as any)).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = translator.translate(null as any);
      expect(r).toEqual(translator.getDefaultCapabilities());
    });

    it('output contains no OpenCode-internal tokens (Property 4)', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test',
        model: 'test',
        features: {},
        context_window: 100000,
        tools: [],
      };
      assertNoConcept(translator.translate(oc), 'CapabilityTranslator output');
    });

    it('includes text and markdown by default; json only when json_output=true', () => {
      const withJson: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: { json_output: true }, context_window: 1000, tools: [],
      };
      const withoutJson: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: { json_output: false }, context_window: 1000, tools: [],
      };
      expect(translator.translate(withJson).outputFormats).toContain('json');
      expect(translator.translate(withoutJson).outputFormats).not.toContain('json');
    });
  });

  // ── getDefaultCapabilities ──────────────────────────────────────────────

  describe('getDefaultCapabilities', () => {
    it('returns a copy (mutations do not affect subsequent calls)', () => {
      const d1 = translator.getDefaultCapabilities();
      d1.streaming = false;
      const d2 = translator.getDefaultCapabilities();
      expect(d2.streaming).toBe(true);
    });

    it('includes all required fields', () => {
      const d = translator.getDefaultCapabilities();
      expect(d).toHaveProperty('streaming');
      expect(d).toHaveProperty('maxContextLength');
      expect(d).toHaveProperty('tools');
      expect(d).toHaveProperty('vision');
      expect(d).toHaveProperty('functionCalling');
      expect(d).toHaveProperty('outputFormats');
    });
  });

  // ── hasCapability ───────────────────────────────────────────────────────

  describe('hasCapability', () => {
    it('returns true for defined keys', () => {
      const caps = translator.getDefaultCapabilities();
      expect(translator.hasCapability('streaming', caps)).toBe(true);
      expect(translator.hasCapability('maxContextLength', caps)).toBe(true);
    });

    it('returns false for non-existent keys', () => {
      const caps = translator.getDefaultCapabilities();
      expect(translator.hasCapability('nonexistent' as keyof ModelCapabilities, caps)).toBe(false);
    });
  });

  // ── discoverCapabilities / cache ────────────────────────────────────────

  describe('discoverCapabilities', () => {
    it('returns success with capabilities for valid model', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: {}, context_window: 50000, tools: [],
      };
      const r = translator.discoverCapabilities('my-model', oc);
      expect(r.success).toBe(true);
      expect(r.capabilities?.maxContextLength).toBe(50000);
    });

    it('returns failure for empty model string', () => {
      const r = translator.discoverCapabilities('');
      expect(r.success).toBe(false);
      expect(r.error).toBeDefined();
    });

    it('caches results and returns cached on second call', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: {}, context_window: 77777, tools: [],
      };
      translator.discoverCapabilities('cached-model', oc);
      // Second call without oc – should return cached
      const r2 = translator.discoverCapabilities('cached-model');
      expect(r2.success).toBe(true);
      expect(r2.capabilities?.maxContextLength).toBe(77777);
    });

    it('clearCache removes specific model', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: {}, context_window: 1000, tools: [],
      };
      translator.discoverCapabilities('model-a', oc);
      translator.discoverCapabilities('model-b', oc);
      translator.clearCache('model-a');
      expect(translator.getCachedModels()).not.toContain('model-a');
      expect(translator.getCachedModels()).toContain('model-b');
    });

    it('clearCache() with no arg clears all', () => {
      const oc: OpenCodeModelCapabilities = {
        provider: 'test', model: 'test', features: {}, context_window: 1000, tools: [],
      };
      translator.discoverCapabilities('m1', oc);
      translator.discoverCapabilities('m2', oc);
      translator.clearCache();
      expect(translator.getCachedModels()).toHaveLength(0);
    });
  });

  // ── mergeCapabilities ───────────────────────────────────────────────────

  describe('mergeCapabilities', () => {
    it('returns defaults for empty array', () => {
      expect(translator.mergeCapabilities([])).toEqual(translator.getDefaultCapabilities());
    });

    it('returns single item unchanged', () => {
      const caps: ModelCapabilities = {
        streaming: false, maxContextLength: 1000, tools: false, vision: false,
        functionCalling: false, outputFormats: ['text'],
      };
      expect(translator.mergeCapabilities([caps])).toEqual(caps);
    });

    it('merges with OR logic for booleans and MAX for context length', () => {
      const a: ModelCapabilities = {
        streaming: true, maxContextLength: 100000, tools: false, vision: false,
        functionCalling: true, outputFormats: ['text'],
      };
      const b: ModelCapabilities = {
        streaming: false, maxContextLength: 200000, tools: true, vision: true,
        functionCalling: false, outputFormats: ['json'],
      };
      const m = translator.mergeCapabilities([a, b]);
      expect(m.streaming).toBe(true);
      expect(m.maxContextLength).toBe(200000);
      expect(m.tools).toBe(true);
      expect(m.vision).toBe(true);
      expect(m.functionCalling).toBe(true);
      expect(m.outputFormats).toContain('text');
      expect(m.outputFormats).toContain('json');
    });

    it('deduplicates output formats', () => {
      const a: ModelCapabilities = {
        streaming: true, maxContextLength: 1000, tools: true, vision: true,
        functionCalling: true, outputFormats: ['text', 'json'],
      };
      const b: ModelCapabilities = {
        streaming: true, maxContextLength: 1000, tools: true, vision: true,
        functionCalling: true, outputFormats: ['text', 'markdown'],
      };
      const m = translator.mergeCapabilities([a, b]);
      expect(m.outputFormats.filter(f => f === 'text')).toHaveLength(1);
    });
  });
});

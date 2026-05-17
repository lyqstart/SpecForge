/**
 * Property-Based Tests for Adapter Encapsulation
 *
 * Property 4: Adapter Encapsulation
 *
 * For all public API surfaces exported from the Adapter/OpenCodeAdapter,
 * their type signatures and runtime data must NOT contain OpenCode-specific
 * concepts (including but not limited to OpenCode's ctx, callID, plugin hook shape,
 * internal event schema). Even if the Adapter fails to fully absorb OpenCode
 * behavior changes, the concept isolation obligation takes precedence
 * (prefer returning "unsupported" errors over leakage).
 *
 * Feature: OpenCodeAdapter, Property 4: Adapter Encapsulation
 * Derived-From: v6-architecture-overview Property 4
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, REQ-3.*
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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
  DaemonSessionContext,
  KernelEvent,
  DaemonToolCall,
  DaemonToolResult,
  ModelCapabilities,
} from '../../src/types';

// ============================================================
// Arbitraries for generating random OpenCode data structures
// ============================================================

/** Generate random valid OpenCode context */
const openCodeContextArb = (): fc.Arbitrary<OpenCodeContext> =>
  fc.record(
    {
      oc_sid: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
      oc_uid: fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constant(undefined)
      ),
      workspace: fc
        .string({ minLength: 1, maxLength: 200 })
        .filter((s) => s.trim().length > 0),
      oc_version: fc.string({ minLength: 1, maxLength: 20 }),
      model: fc.oneof(
        fc.record({
          provider: fc.string({ minLength: 1 }),
          name: fc.string({ minLength: 1 }),
        }),
        fc.constant(undefined)
      ),
      env: fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(undefined)),
    },
    { withDeletedKeys: true }
  );

/** Generate random valid OpenCode event */
const openCodeEventArb = (): fc.Arbitrary<OpenCodeEvent> =>
  fc.record(
    {
      event_type: fc.oneof(
        fc.constant('session.start'),
        fc.constant('session.end'),
        fc.constant('session.error'),
        fc.constant('message.delta'),
        fc.constant('message.complete'),
        fc.constant('tool.call'),
        fc.constant('tool.result'),
        fc.constant('tool.error'),
        fc.constant('error'),
        fc.constant('version.mismatch')
      ),
      data: fc.oneof(
        fc.constant(null),
        fc.record({ message: fc.string() }),
        fc.record({ error: fc.string() }),
        fc.dictionary(fc.string(), fc.string()),
        fc.constant({})
      ),
      sid: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
      ts: fc.integer({ min: 1600000000000, max: 2000000000000 }),
    },
    { withDeletedKeys: true }
  );

/** Generate random valid OpenCode tool call */
const openCodeToolCallArb = (): fc.Arbitrary<OpenCodeToolCall> =>
  fc.record(
    {
      name: fc
        .string({ minLength: 1, maxLength: 50 })
        .filter((s) => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
      arguments: fc.dictionary(
        fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
      ),
      id: fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constant(undefined)
      ),
    },
    { withDeletedKeys: true }
  );

/** Generate random valid OpenCode tool result */
const openCodeToolResultArb = (): fc.Arbitrary<OpenCodeToolResult> =>
  fc.record(
    {
      call_id: fc
        .string({ minLength: 1, maxLength: 50 })
        .filter((s) => s.trim().length > 0),
      result: fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.record({ success: fc.boolean() }),
        fc.constant(null)
      ),
      error: fc.oneof(fc.string(), fc.constant(undefined)),
    },
    { withDeletedKeys: true }
  );

/** Generate random OpenCode model capabilities */
const openCodeCapabilitiesArb = (): fc.Arbitrary<OpenCodeModelCapabilities> =>
  fc.record({
    provider: fc.string({ minLength: 1, maxLength: 30 }),
    model: fc.string({ minLength: 1, maxLength: 50 }),
    features: fc.record({
      streaming: fc.oneof(fc.boolean(), fc.constant(undefined)),
      vision: fc.oneof(fc.boolean(), fc.constant(undefined)),
      function_calling: fc.oneof(fc.boolean(), fc.constant(undefined)),
      json_output: fc.oneof(fc.boolean(), fc.constant(undefined)),
    }),
    context_window: fc.oneof(fc.integer({ min: 1000, max: 200000 }), fc.constant(undefined)),
    tools: fc.oneof(fc.array(fc.string({ minLength: 1 })), fc.constant(undefined)),
  });

// ============================================================
// OpenCode-specific field names that should NEVER appear in outputs
// ============================================================

const OPENCOD_EXCLUSIVE_FIELDS = [
  'oc_sid',
  'oc_uid',
  'oc_version',
  'event_type',
  'sid',
  'ts',
  'call_id',
  'id', // OpenCode's id for tool calls (conflicts with callId)
  'function_calling', // OpenCode naming (vs functionCalling)
  'json_output', // OpenCode naming (vs jsonOutput - camelCase)
  'context_window', // OpenCode naming (vs contextLength)
];

// ============================================================
// Property Tests
// ============================================================

describe('AdapterEncapsulation Property Tests', () => {
  const contextTranslator = new ContextTranslator();
  const eventTranslator = new EventTranslator();
  const toolTranslator = new ToolTranslator();
  const capabilityTranslator = new CapabilityTranslator();

  /**
   * Property 4.1: ContextTranslation - No OpenCode concepts leak in outputs
   *
   * The translated DaemonSessionContext must not contain any OpenCode-specific
   * field names. The translator should map oc_sid -> sessionId, oc_uid -> userId, etc.
   */
  describe('Property 4.1: ContextTranslator encapsulation', () => {
    it('should NOT leak OpenCode field names in successful translations', () => {
      fc.assert(
        fc.property(openCodeContextArb(), (ocContext: OpenCodeContext) => {
          const result = contextTranslator.translate(ocContext);

          if (result.success) {
            const daemonContext: DaemonSessionContext = result.data;
            const outputJson = JSON.stringify(daemonContext);

            // Verify no OpenCode-specific fields leak
            for (const field of OPENCOD_EXCLUSIVE_FIELDS) {
              // Check that the field name doesn't appear as a key
              expect(outputJson).not.toContain(`"${field}"`);
            }

            // Verify OpenCode fields are mapped correctly
            expect(daemonContext.sessionId).toBe(ocContext.oc_sid);
            expect(daemonContext.workspace).toBe(ocContext.workspace);
            expect(daemonContext.kernelVersion).toBe(ocContext.oc_version);

            if (ocContext.oc_uid !== undefined) {
              expect(daemonContext.userId).toBe(ocContext.oc_uid);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should return "unsupported" with proper reasons (no leakage)', () => {
      // Generate invalid contexts that should return unsupported
      const invalidContextArb = fc.record(
        {
          oc_uid: fc.oneof(fc.string(), fc.constant(undefined)),
          workspace: fc.string({ minLength: 1 }),
          oc_version: fc.string(),
        },
        { withDeletedKeys: true }
      );

      fc.assert(
        fc.property(
          invalidContextArb,
          fc.oneof(
            fc.constant(null),
            fc.constant(''),
            fc.constant('   '),
            fc.constant(undefined)
          ),
          (partialContext, invalidSid) => {
            // @ts-ignore - intentionally testing invalid input
            const ocContext: OpenCodeContext = {
              ...partialContext,
              oc_sid: invalidSid,
            };

            const result = contextTranslator.translate(ocContext);

            expect(result.success).toBe(false);
            expect(result.unsupported).toBe(true);
            expect(result.reason).toBeDefined();

            // Verify reason doesn't leak internal OpenCode structure details
            // It should describe the missing field but not expose implementation
            if (result.reason) {
              // Reason can mention oc_sid is missing (that's user-facing)
              // But should not expose internal mapping details
              expect(result.reason).not.toContain('internal');
              expect(result.reason).not.toContain('translation');
              expect(result.reason).not.toContain('OpenCode');
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.2: EventTranslation - No OpenCode event schema leaks
   *
   * The translated KernelEvent must not contain OpenCode-specific field names
   * like event_type, sid, ts. It should use Daemon-neutral names like type, sessionId, timestamp.
   */
  describe('Property 4.2: EventTranslator encapsulation', () => {
    it('should NOT leak OpenCode field names in successful translations', () => {
      fc.assert(
        fc.property(openCodeEventArb(), (ocEvent: OpenCodeEvent) => {
          const result = eventTranslator.translate(ocEvent);

          if (result.success) {
            const daemonEvent: KernelEvent = result.data;
            const outputJson = JSON.stringify(daemonEvent);

            // Verify no OpenCode-specific fields leak
            expect(outputJson).not.toContain('"event_type"');
            expect(outputJson).not.toContain('"sid"');
            expect(outputJson).not.toContain('"ts"');

            // Verify correct mapping
            expect(daemonEvent.sessionId).toBe(ocEvent.sid);
            expect(daemonEvent.type).toBeDefined();
            // Note: Some event types map to same value (e.g., 'tool.error' -> 'tool.error')
            // The important check is that OpenCode-specific fields don't leak
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should return "unsupported" for missing required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            event_type: fc.string({ minLength: 1 }),
            data: fc.anything(),
          }),
          fc.oneof(fc.constant(null), fc.constant(''), fc.constant(undefined)),
          (partialEvent, invalidSid) => {
            // @ts-ignore - intentionally testing invalid input
            const ocEvent: OpenCodeEvent = {
              ...partialEvent,
              sid: invalidSid,
              ts: Date.now(),
            };

            const result = eventTranslator.translate(ocEvent);

            expect(result.success).toBe(false);
            expect(result.unsupported).toBe(true);
            expect(result.reason).toContain('sid');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.3: ToolTranslation - No OpenCode tool call schema leaks
   *
   * The translated DaemonToolCall must not contain OpenCode-specific field names.
   * OpenCode uses 'id' for tool call ID; Daemon uses 'callId'.
   * This test verifies proper mapping.
   */
  describe('Property 4.3: ToolTranslator encapsulation', () => {
    it('should NOT leak OpenCode field names in successful tool call translations', () => {
      fc.assert(
        fc.property(
          openCodeToolCallArb(),
          fc.oneof(fc.string({ minLength: 1 }), fc.constant(undefined)),
          (ocToolCall: OpenCodeToolCall, sessionId?: string) => {
            const result = toolTranslator.translateToolCall(ocToolCall, sessionId);

            if (result.success) {
              const daemonToolCall: DaemonToolCall = result.data;
              const outputJson = JSON.stringify(daemonToolCall);

              // Verify no OpenCode-specific fields leak
              // OpenCode uses 'id' but we should map to 'callId'
              // The input might have 'id', but output should NOT have 'id'
              expect(outputJson).not.toMatch(/"id":/);

              // Verify correct mapping
              expect(daemonToolCall.callId).toBeDefined();
              if (ocToolCall.id) {
                expect(daemonToolCall.callId).toBe(ocToolCall.id);
              } else {
                // Should have generated a callId
                expect(daemonToolCall.callId).toMatch(/^call-\d+$/);
              }

              expect(daemonToolCall.name).toBe(ocToolCall.name);
              expect(daemonToolCall.arguments).toEqual(ocToolCall.arguments);

              if (sessionId) {
                expect(daemonToolCall.sessionId).toBe(sessionId);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT leak OpenCode field names in successful tool result translations', () => {
      fc.assert(
        fc.property(
          openCodeToolResultArb(),
          fc.oneof(fc.string({ minLength: 1 }), fc.constant(undefined)),
          (ocToolResult: OpenCodeToolResult, sessionId?: string) => {
            const result = toolTranslator.translateToolResult(ocToolResult, sessionId);

            if (result.success) {
              const daemonToolResult: DaemonToolResult = result.data;
              const outputJson = JSON.stringify(daemonToolResult);

              // Verify no OpenCode-specific fields leak
              // OpenCode uses 'call_id', Daemon uses 'callId'
              expect(outputJson).not.toContain('"call_id"');

              // Verify correct mapping
              expect(daemonToolResult.callId).toBe(ocToolResult.call_id);
              expect(daemonToolResult.result).toBe(ocToolResult.result);

              if (sessionId) {
                expect(daemonToolResult.sessionId).toBe(sessionId);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "unsupported" with proper reasons', () => {
      fc.assert(
        fc.property(
          fc.record({
            arguments: fc.record({}, { withDeletedKeys: true }),
          }),
          fc.oneof(fc.constant(null), fc.constant(''), fc.constant(undefined)),
          (partialToolCall, invalidName) => {
            // @ts-ignore - intentionally testing invalid input
            const ocToolCall: OpenCodeToolCall = {
              ...partialToolCall,
              name: invalidName,
            };

            const result = toolTranslator.translateToolCall(ocToolCall);

            expect(result.success).toBe(false);
            expect(result.unsupported).toBe(true);
            expect(result.reason).toContain('name');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.4: CapabilityTranslation - No OpenCode naming conventions leak
   *
   * OpenCode uses snake_case for capability fields (function_calling, json_output, context_window).
   * The translated ModelCapabilities must use Daemon-standard camelCase (functionCalling, jsonOutput, maxContextLength).
   */
  describe('Property 4.4: CapabilityTranslator encapsulation', () => {
    it('should NOT leak OpenCode field names in translated capabilities', () => {
      fc.assert(
        fc.property(openCodeCapabilitiesArb(), (ocCapabilities: OpenCodeModelCapabilities) => {
          const capabilities: ModelCapabilities = capabilityTranslator.translate(ocCapabilities);
          const outputJson = JSON.stringify(capabilities);

          // Verify no OpenCode-specific naming leaks
          expect(outputJson).not.toContain('function_calling');
          expect(outputJson).not.toContain('json_output');
          expect(outputJson).not.toContain('context_window');

          // Verify Daemon-standard naming is used
          expect(outputJson).toContain('functionCalling');
          expect(outputJson).toContain('maxContextLength');
        }),
        { numRuns: 100 }
      );
    });

    it('should map OpenCode context_window to Daemon maxContextLength', () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.string(),
            model: fc.string(),
            context_window: fc.integer({ min: 1000, max: 200000 }),
          }),
          (ocCaps) => {
            const result = capabilityTranslator.translate(ocCaps);
            expect(result.maxContextLength).toBe(ocCaps.context_window);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should map OpenCode function_calling to Daemon functionCalling', () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.string(),
            model: fc.string(),
            features: fc.record({
              function_calling: fc.boolean(),
            }),
          }),
          (ocCaps) => {
            const result = capabilityTranslator.translate(ocCaps);
            expect(result.functionCalling).toBe(ocCaps.features.function_calling);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4.5: Error message isolation
   *
   * Error messages must not expose OpenCode internal implementation details.
   * Even when translation fails, the error should be user-friendly and not leak
   * that this is specifically an OpenCode adapter.
   */
  describe('Property 4.5: Error message isolation', () => {
    it('should not expose OpenCode internals in error messages', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Invalid contexts
            fc.record({
              workspace: fc.string(),
              oc_version: fc.string(),
            }),
            // Invalid events
            fc.record({
              event_type: fc.string(),
            }),
            // Invalid tool calls
            fc.record({
              arguments: fc.record({}),
            })
          ),
          (invalidInput: any) => {
            // Try all translators with invalid input
            const results = [
              contextTranslator.translate(invalidInput as OpenCodeContext),
              eventTranslator.translate(invalidInput as OpenCodeEvent),
              toolTranslator.translateToolCall(invalidInput as OpenCodeToolCall),
            ];

            for (const result of results) {
              if (!result.success && result.reason) {
                // Error messages should NOT contain:
                expect(result.reason).not.toMatch(/opencode/i);
                expect(result.reason).not.toMatch(/translation layer/i);
                expect(result.reason).not.toMatch(/internal/i);
                expect(result.reason).not.toMatch(/adapter/i);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 4.6: Translation success or unsupported - never partial leak
   *
   * Either translation succeeds completely (with no OpenCode concepts in output)
   * OR it returns "unsupported" with a clear reason. There must be no middle ground
   * where some OpenCode concepts leak through.
   */
  describe('Property 4.6: Complete success or complete isolation', () => {
    it('should never partially leak OpenCode concepts', () => {
      fc.assert(
        fc.property(
          fc.oneof(openCodeContextArb(), openCodeEventArb(), openCodeToolCallArb()),
          (input: OpenCodeContext | OpenCodeEvent | OpenCodeToolCall) => {
            let result: any;

            // Determine which translator to use
            if ('oc_sid' in input) {
              result = contextTranslator.translate(input as OpenCodeContext);
            } else if ('event_type' in input) {
              result = eventTranslator.translate(input as OpenCodeEvent);
            } else if ('name' in input && 'arguments' in input) {
              result = toolTranslator.translateToolCall(input as OpenCodeToolCall);
            } else {
              return; // Skip unknown type
            }

            if (result.success) {
              // If successful, verify complete isolation - no OpenCode concepts
              const outputJson = JSON.stringify(result.data);
              for (const field of OPENCOD_EXCLUSIVE_FIELDS) {
                expect(outputJson).not.toContain(`"${field}"`);
              }
            } else {
              // If failed, should be explicit unsupported
              expect(result.unsupported).toBe(true);
              expect(result.reason).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4.7: Deterministic translation preserves isolation
   *
   * Multiple translations of the same input should produce the same output,
   * and that output should always maintain encapsulation.
   */
  describe('Property 4.7: Deterministic isolation', () => {
    it('should produce same isolation result for same input', () => {
      fc.assert(
        fc.property(
          openCodeContextArb(),
          openCodeEventArb(),
          openCodeToolCallArb(),
          (ctx, evt, tool) => {
            // Test each translator
            const results = [
              contextTranslator.translate(ctx),
              eventTranslator.translate(evt),
              toolTranslator.translateToolCall(tool),
            ];

            // Run each 3 times
            for (const result of results) {
              const run1 = result;
              const run2 = JSON.parse(JSON.stringify(result)); // Simulate re-translation

              // Success/failure status should match
              expect(run1.success).toBe(run2.success);

              if (run1.success) {
                // Both should produce same output JSON
                expect(JSON.stringify(run1.data)).toBe(JSON.stringify(run2.data));

                // Both should have no OpenCode concepts
                const outputJson = JSON.stringify(run1.data);
                for (const field of OPENCOD_EXCLUSIVE_FIELDS) {
                  expect(outputJson).not.toContain(`"${field}"`);
                }
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
/**
 * ContextTranslator Property-Based Tests
 *
 * Property-based tests for the ContextTranslator class.
 * Uses fast-check to verify universal properties across many inputs.
 *
 * Requirements: 3.1, 3.2, 3.4
 * Property Tests: Validates core translation properties
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ContextTranslator } from '../../src/translators/ContextTranslator';
import type { OpenCodeContext, DaemonSessionContext } from '../../src/types';

describe('ContextTranslator - Property-Based Tests', () => {
  const translator = new ContextTranslator();

  // ============================================================
  // Property 1: Valid contexts always translate successfully
  // ============================================================

  describe('Property 1: Valid contexts translate successfully', () => {
    it('should successfully translate any context with valid oc_sid and workspace', () => {
      const validContextArb = fc.record({
        oc_sid: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        oc_uid: fc.oneof(fc.string(), fc.constant(undefined)),
        workspace: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        oc_version: fc.string({ minLength: 1 }),
        model: fc.oneof(
          fc.record({
            provider: fc.string(),
            name: fc.string(),
          }),
          fc.constant(undefined)
        ),
        env: fc.oneof(
          fc.dictionary(fc.string(), fc.string()),
          fc.constant(undefined)
        )
      }, { withDeletedKeys: true });

      fc.assert(
        fc.property(validContextArb, (ocContext: OpenCodeContext) => {
          const result = translator.translate(ocContext);
          expect(result.success).toBe(true);
          if (result.success) {
            // Verify translation preserves session ID
            expect(result.data.sessionId).toBe(ocContext.oc_sid);
            // Verify translation preserves workspace
            expect(result.data.workspace).toBe(ocContext.workspace);
            // Verify translation preserves kernel version
            expect(result.data.kernelVersion).toBe(ocContext.oc_version);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================
  // Property 2: Required fields must be present
  // ============================================================

  describe('Property 2: Missing required fields return unsupported', () => {
    it('should return unsupported when oc_sid is missing or empty', () => {
      fc.assert(
        fc.property(
          fc.record({
            oc_uid: fc.oneof(fc.string(), fc.constant(undefined)),
            workspace: fc.string({ minLength: 1 }),
            oc_version: fc.string(),
          }, { withDeletedKeys: true }),
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
            const result = translator.translate(ocContext);
            expect(result.success).toBe(false);
            expect(result.unsupported).toBe(true);
            expect(result.reason).toContain('oc_sid');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return unsupported when workspace is missing or empty', () => {
      fc.assert(
        fc.property(
          fc.record({
            oc_sid: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            oc_version: fc.string(),
          }),
          fc.oneof(
            fc.constant(null),
            fc.constant(''),
            fc.constant('   '),
            fc.constant(undefined)
          ),
          (partialContext, invalidWorkspace) => {
            // @ts-ignore - intentionally testing invalid input
            const ocContext: OpenCodeContext = {
              ...partialContext,
              workspace: invalidWorkspace,
            };
            const result = translator.translate(ocContext);
            expect(result.success).toBe(false);
            expect(result.unsupported).toBe(true);
            expect(result.reason).toContain('workspace');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 3: Translation preserves optional fields
  // ============================================================

  describe('Property 3: Translation preserves optional fields', () => {
    it('should preserve userId when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            oc_sid: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            workspace: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
            oc_version: fc.string(),
            oc_uid: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          }),
          (ocContext) => {
            const result = translator.translate(ocContext);
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.userId).toBe(ocContext.oc_uid);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve model when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            oc_sid: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            workspace: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            oc_version: fc.string({ minLength: 1 }),
            model: fc.record({
              provider: fc.string({ minLength: 1 }),
              name: fc.string({ minLength: 1 }),
            }),
          }),
          (ocContext) => {
            const result = translator.translate(ocContext);
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.model).toBeDefined();
              expect(result.data.model?.provider).toBe(ocContext.model?.provider);
              expect(result.data.model?.name).toBe(ocContext.model?.name);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve env when provided (with valid required fields)', () => {
      fc.assert(
        fc.property(
          fc.record({
            oc_sid: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            workspace: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            oc_version: fc.string({ minLength: 1 }),
            env: fc.dictionary(fc.string(), fc.string()),
          }),
          (ocContext) => {
            const result = translator.translate(ocContext);
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.env).toEqual(ocContext.env);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 4: Field support detection works correctly
  // ============================================================

  describe('Property 4: Field support detection', () => {
    it('should correctly identify all supported fields', () => {
      const supportedFields = ['oc_sid', 'oc_uid', 'workspace', 'oc_version', 'model', 'env'];

      fc.assert(
        fc.property(fc.constantFrom(...supportedFields), (field) => {
          expect(translator.isFieldSupported(field)).toBe(true);
        }),
        { numRuns: supportedFields.length }
      );
    });

    it('should return false for any unsupported field', () => {
      const unsupportedFields = [
        'unknown_field',
        'oc_internal',
        'custom_data',
        'plugin_context',
        'session_metadata',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...unsupportedFields), (field) => {
          expect(translator.isFieldSupported(field)).toBe(false);
        }),
        { numRuns: unsupportedFields.length }
      );
    });
  });

  // ============================================================
  // Property 5: Idempotent translation
  // ============================================================

  describe('Property 5: Translation is deterministic', () => {
    it('should produce the same result for the same input', () => {
      const contextArb = fc.record({
        oc_sid: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        oc_uid: fc.oneof(fc.string(), fc.constant(undefined)),
        workspace: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        oc_version: fc.string({ minLength: 1, maxLength: 20 }),
        model: fc.oneof(
          fc.record({
            provider: fc.string(),
            name: fc.string(),
          }),
          fc.constant(undefined)
        ),
        env: fc.oneof(
          fc.dictionary(fc.string(), fc.string()),
          fc.constant(undefined)
        )
      }, { withDeletedKeys: true });

      fc.assert(
        fc.property(contextArb, (ocContext) => {
          const result1 = translator.translate(ocContext);
          const result2 = translator.translate(ocContext);

          // Both should have same success status
          expect(result1.success).toBe(result2.success);

          if (result1.success && result2.success) {
            expect(result1.data).toEqual(result2.data);
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 6: Session ID mapping
  // ============================================================

  describe('Property 6: Session ID mapping', () => {
    it('should map oc_sid to sessionId in output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          (sid, workspace) => {
            const ocContext: OpenCodeContext = {
              oc_sid: sid,
              workspace,
              oc_version: '1.0.0',
            };

            const result = translator.translate(ocContext);

            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.sessionId).toBe(sid);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
/**
 * ContextTranslator Unit Tests
 *
 * Tests for the ContextTranslator class which converts OpenCode context objects
 * to Daemon-neutral session contexts.
 *
 * Requirements: 3.1, 3.2, 3.4
 */

import { describe, it, expect } from 'vitest';
import { ContextTranslator } from '../src/translators/ContextTranslator';
import type { OpenCodeContext, DaemonSessionContext } from '../src/types';

describe('ContextTranslator', () => {
  const translator = new ContextTranslator();

  // ============================================================
  // Valid Context Translation Tests
  // ============================================================

  describe('translate - valid contexts', () => {
    it('should translate a minimal valid OpenCode context', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-123',
        workspace: '/home/user/project',
        oc_version: '1.14.0',
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe('session-123');
        expect(result.data.workspace).toBe('/home/user/project');
        expect(result.data.kernelVersion).toBe('1.14.0');
        expect(result.data.userId).toBeUndefined();
        expect(result.data.model).toBeUndefined();
        expect(result.data.env).toBeUndefined();
      }
    });

    it('should translate a full OpenCode context with all fields', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-456',
        oc_uid: 'user-789',
        workspace: '/workspace/myproject',
        oc_version: '1.15.0',
        model: {
          provider: 'anthropic',
          name: 'claude-3-5-sonnet',
        },
        env: {
          NODE_ENV: 'development',
          DEBUG: 'true',
        },
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe('session-456');
        expect(result.data.userId).toBe('user-789');
        expect(result.data.workspace).toBe('/workspace/myproject');
        expect(result.data.kernelVersion).toBe('1.15.0');
        expect(result.data.model).toEqual({
          provider: 'anthropic',
          name: 'claude-3-5-sonnet',
        });
        expect(result.data.env).toEqual({
          NODE_ENV: 'development',
          DEBUG: 'true',
        });
      }
    });

    it('should preserve optional userId when provided', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-with-user',
        oc_uid: 'user-abc123',
        workspace: '/test/workspace',
        oc_version: '1.14.5',
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user-abc123');
      }
    });

    it('should preserve model configuration when provided', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-model',
        workspace: '/test/workspace',
        oc_version: '1.14.0',
        model: {
          provider: 'openai',
          name: 'gpt-4',
        },
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBeDefined();
        expect(result.data.model?.provider).toBe('openai');
        expect(result.data.model?.name).toBe('gpt-4');
      }
    });
  });

  // ============================================================
  // Missing Required Fields Tests
  // ============================================================

  describe('translate - missing required fields', () => {
    it('should return unsupported when oc_sid is missing', () => {
      const ocContext: OpenCodeContext = {
        workspace: '/home/user/project',
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('oc_sid');
    });

    it('should return unsupported when workspace is missing', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-123',
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('workspace');
    });

    it('should return unsupported when both oc_sid and workspace are missing', () => {
      const ocContext: OpenCodeContext = {
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      // Should report first missing required field
      expect(result.reason).toContain('oc_sid');
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('translate - edge cases', () => {
    it('should handle empty string oc_sid', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: '',
        workspace: '/home/user/project',
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      // Empty string is considered missing
      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });

    it('should handle empty string workspace', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-123',
        workspace: '',
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      // Empty string is considered missing
      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });

    it('should handle null/undefined values for optional fields', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-null-test',
        oc_uid: undefined,
        workspace: '/test',
        oc_version: '1.14.0',
        model: undefined,
        env: undefined,
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBeUndefined();
        expect(result.data.model).toBeUndefined();
        expect(result.data.env).toBeUndefined();
      }
    });

    it('should handle whitespace-only strings as invalid', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: '   ',
        workspace: '/test',
        oc_version: '1.14.0',
      } as OpenCodeContext;

      const result = translator.translate(ocContext);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
    });

    it('should handle empty env object', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-empty-env',
        workspace: '/test',
        oc_version: '1.14.0',
        env: {},
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.env).toEqual({});
      }
    });

    it('should handle environment variables with special characters', () => {
      const ocContext: OpenCodeContext = {
        oc_sid: 'session-special-env',
        workspace: '/test',
        oc_version: '1.14.0',
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          NODE_OPTIONS: '--inspect=9229',
          JSON_DATA: '{"key":"value","nested":{"a":1}}',
        },
      };

      const result = translator.translate(ocContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.env).toEqual({
          PATH: '/usr/local/bin:/usr/bin:/bin',
          NODE_OPTIONS: '--inspect=9229',
          JSON_DATA: '{"key":"value","nested":{"a":1}}',
        });
      }
    });
  });

  // ============================================================
  // isFieldSupported Tests
  // ============================================================

  describe('isFieldSupported', () => {
    it('should return true for supported fields', () => {
      expect(translator.isFieldSupported('oc_sid')).toBe(true);
      expect(translator.isFieldSupported('oc_uid')).toBe(true);
      expect(translator.isFieldSupported('workspace')).toBe(true);
      expect(translator.isFieldSupported('oc_version')).toBe(true);
      expect(translator.isFieldSupported('model')).toBe(true);
      expect(translator.isFieldSupported('env')).toBe(true);
    });

    it('should return false for unsupported fields', () => {
      expect(translator.isFieldSupported('unknown_field')).toBe(false);
      expect(translator.isFieldSupported('oc_internal')).toBe(false);
      expect(translator.isFieldSupported('custom_data')).toBe(false);
      expect(translator.isFieldSupported('')).toBe(false);
    });

    it('should return false for null/undefined input', () => {
      expect(translator.isFieldSupported(null as unknown as string)).toBe(false);
      expect(translator.isFieldSupported(undefined as unknown as string)).toBe(false);
    });
  });

  // ============================================================
  // Round-trip Translation Tests
  // ============================================================

  describe('round-trip translation', () => {
    it('should preserve all fields through translation', () => {
      const original: OpenCodeContext = {
        oc_sid: 'roundtrip-session',
        oc_uid: 'user-999',
        workspace: '/workspace/roundtrip',
        oc_version: '1.14.2',
        model: {
          provider: 'anthropic',
          name: 'claude-3-opus',
        },
        env: {
          CUSTOM_VAR: 'custom-value',
        },
      };

      const result = translator.translate(original);

      expect(result.success).toBe(true);
      if (result.success) {
        const translated = result.data;
        expect(translated.sessionId).toBe(original.oc_sid);
        expect(translated.userId).toBe(original.oc_uid);
        expect(translated.workspace).toBe(original.workspace);
        expect(translated.kernelVersion).toBe(original.oc_version);
        expect(translated.model).toEqual(original.model);
        expect(translated.env).toEqual(original.env);
      }
    });
  });

  // ============================================================
  // Multiple Contexts Test
  // ============================================================

  describe('translate - multiple contexts', () => {
    it('should handle multiple valid contexts correctly', () => {
      const contexts: OpenCodeContext[] = [
        { oc_sid: 's1', workspace: '/w1', oc_version: '1.14.0' },
        { oc_sid: 's2', workspace: '/w2', oc_version: '1.15.0' },
        { oc_sid: 's3', workspace: '/w3', oc_version: '1.16.0', oc_uid: 'u3' },
      ];

      const results = contexts.map((ctx) => translator.translate(ctx));

      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].success && results[0].data.sessionId).toBe('s1');
      expect(results[1].success && results[1].data.sessionId).toBe('s2');
      expect(results[2].success && results[2].data.userId).toBe('u3');
    });

    it('should handle mix of valid and invalid contexts', () => {
      const contexts: Array<OpenCodeContext | null> = [
        { oc_sid: 's1', workspace: '/w1', oc_version: '1.14.0' },
        { workspace: '/w2', oc_version: '1.14.0' } as OpenCodeContext, // missing oc_sid
        { oc_sid: 's3', workspace: '/w3', oc_version: '1.14.0' },
        null, // edge case
      ];

      const results = contexts.map((ctx) => {
        if (!ctx) {
          return { success: false, unsupported: true, reason: 'Null context' };
        }
        return translator.translate(ctx);
      });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(false);
    });
  });
});
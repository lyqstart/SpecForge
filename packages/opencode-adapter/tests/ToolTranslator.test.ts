/**
 * ToolTranslator Unit Tests
 *
 * Tests for the ToolTranslator class which converts tool call parameters
 * between OpenCode and Daemon formats.
 *
 * Requirements: 3.1, 3.4
 */

import { describe, it, expect } from 'vitest';
import { ToolTranslator } from '../src/translators/ToolTranslator';
import type { OpenCodeToolCall, OpenCodeToolResult, DaemonToolCall, DaemonToolResult } from '../src/types';

describe('ToolTranslator', () => {
  const translator = new ToolTranslator();

  // ============================================================
  // Valid Tool Call Translation Tests
  // ============================================================

  describe('translateToolCall - valid tool calls', () => {
    it('should translate a minimal valid OpenCode tool call', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_state_read',
        arguments: { key: 'test' },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('sf_state_read');
        expect(result.data.arguments).toEqual({ key: 'test' });
        expect(result.data.callId).toBeDefined();
        expect(result.data.sessionId).toBeUndefined();
      }
    });

    it('should translate tool call with provided call ID', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_artifact_write',
        arguments: { path: '/test.txt', content: 'hello' },
        id: 'call-12345',
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe('call-12345');
      }
    });

    it('should translate tool call with session ID', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_context_build',
        arguments: { files: ['a.ts', 'b.ts'] },
      };

      const result = translator.translateToolCall(ocToolCall, 'session-abc');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe('session-abc');
      }
    });

    it('should translate tool call with all fields', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_batch_verify',
        arguments: { paths: ['test1.ts', 'test2.ts'], strict: true },
        id: 'call-full',
      };

      const result = translator.translateToolCall(ocToolCall, 'session-full');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('sf_batch_verify');
        expect(result.data.arguments).toEqual({ paths: ['test1.ts', 'test2.ts'], strict: true });
        expect(result.data.callId).toBe('call-full');
        expect(result.data.sessionId).toBe('session-full');
      }
    });

    it('should preserve complex argument structures', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_knowledge_query',
        arguments: {
          query: 'How do I implement authentication?',
          filters: {
            type: 'documentation',
            tags: ['security', 'auth'],
          },
          options: {
            maxResults: 10,
            includeMetadata: true,
          },
        },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments).toEqual(ocToolCall.arguments);
      }
    });

    it('should handle nested array arguments', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
        arguments: {
          items: [
            { id: 1, name: 'first' },
            { id: 2, name: 'second' },
          ],
          tags: ['a', 'b', 'c'],
        },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments).toEqual(ocToolCall.arguments);
      }
    });

    it('should handle empty arguments object', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'noop_tool',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments).toEqual({});
      }
    });

    it('should handle null values in arguments', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'tool_with_nulls',
        arguments: {
          stringVal: 'test',
          nullVal: null,
          numVal: 42,
        },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments.stringVal).toBe('test');
        expect(result.data.arguments.nullVal).toBeNull();
        expect(result.data.arguments.numVal).toBe(42);
      }
    });
  });

  // ============================================================
  // Missing Required Fields Tests
  // ============================================================

  describe('translateToolCall - missing required fields', () => {
    it('should return unsupported when name is missing', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: '',
        arguments: { key: 'test' },
      } as OpenCodeToolCall;

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('name');
    });

    it('should return unsupported when name is undefined', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: undefined as unknown as string,
        arguments: { key: 'test' },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('name');
    });

    it('should return unsupported when arguments is missing', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
      } as OpenCodeToolCall;

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('arguments');
    });

    it('should return unsupported when arguments is undefined', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
        arguments: undefined as unknown as Record<string, unknown>,
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('arguments');
    });

    it('should return unsupported when both name and arguments are missing', () => {
      const ocToolCall: OpenCodeToolCall = {} as OpenCodeToolCall;

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      // Should report first missing required field (name)
      expect(result.reason).toContain('name');
    });
  });

  // ============================================================
  // Tool Result Translation Tests
  // ============================================================

  describe('translateToolResult - valid results', () => {
    it('should translate a minimal valid OpenCode tool result', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-123',
        result: { success: true },
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe('call-123');
        expect(result.data.result).toEqual({ success: true });
        expect(result.data.error).toBeUndefined();
        expect(result.data.sessionId).toBeUndefined();
      }
    });

    it('should translate tool result with error', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-456',
        result: null,
        error: 'File not found',
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe('call-456');
        expect(result.data.error).toBe('File not found');
      }
    });

    it('should translate tool result with session ID', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-789',
        result: { data: 'test' },
      };

      const result = translator.translateToolResult(ocToolResult, 'session-abc');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe('session-abc');
      }
    });

    it('should translate tool result with all fields', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-full',
        result: { output: 'completed', status: 200 },
        error: undefined,
      };

      const result = translator.translateToolResult(ocToolResult, 'session-full');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe('call-full');
        expect(result.data.result).toEqual({ output: 'completed', status: 200 });
        expect(result.data.error).toBeUndefined();
        expect(result.data.sessionId).toBe('session-full');
      }
    });

    it('should preserve complex result structures', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-complex',
        result: {
          files: [
            { path: '/a.ts', status: 'modified' },
            { path: '/b.ts', status: 'added' },
          ],
          summary: {
            added: 5,
            modified: 10,
            deleted: 2,
          },
        },
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.result).toEqual(ocToolResult.result);
      }
    });

    it('should handle null result with error', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-null-result',
        result: null,
        error: 'Execution failed',
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.result).toBeNull();
        expect(result.data.error).toBe('Execution failed');
      }
    });

    it('should handle undefined result', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-undefined-result',
        result: undefined,
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.result).toBeUndefined();
      }
    });
  });

  // ============================================================
  // Missing call_id Tests
  // ============================================================

  describe('translateToolResult - missing call_id', () => {
    it('should return unsupported when call_id is missing', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: '',
        result: { success: true },
      } as OpenCodeToolResult;

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('call_id');
    });

    it('should return unsupported when call_id is undefined', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: undefined as unknown as string,
        result: { success: true },
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('call_id');
    });

    it('should return unsupported when call_id is whitespace only', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: '   ',
        result: { success: true },
      } as OpenCodeToolResult;

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(false);
      expect(result.unsupported).toBe(true);
      expect(result.reason).toContain('call_id');
    });
  });

  // ============================================================
  // isToolSupported Tests
  // ============================================================

  describe('isToolSupported', () => {
    it('should return true for valid tool names', () => {
      expect(translator.isToolSupported('sf_state_read')).toBe(true);
      expect(translator.isToolSupported('sf_artifact_write')).toBe(true);
      expect(translator.isToolSupported('sf_context_build')).toBe(true);
      expect(translator.isToolSupported('custom_tool')).toBe(true);
      expect(translator.isToolSupported('a')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(translator.isToolSupported('')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(translator.isToolSupported(null as unknown as string)).toBe(false);
      expect(translator.isToolSupported(undefined as unknown as string)).toBe(false);
      expect(translator.isToolSupported(123 as unknown as string)).toBe(false);
      expect(translator.isToolSupported({} as unknown as string)).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(translator.isToolSupported('   ')).toBe(false);
      expect(translator.isToolSupported('\t\n')).toBe(false);
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('translateToolCall - edge cases', () => {
    it('should generate call ID if not provided', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toMatch(/^call-\d+$/);
      }
    });

    it('should handle very long tool name', () => {
      const longName = 'a'.repeat(1000);
      const ocToolCall: OpenCodeToolCall = {
        name: longName,
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(longName);
      }
    });

    it('should handle special characters in tool name', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'tool-with-dashes_underscores.and.dots',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('tool-with-dashes_underscores.and.dots');
      }
    });

    it('should handle numeric tool name', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'tool123',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('tool123');
      }
    });

    it('should handle arguments with special characters', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'special_tool',
        arguments: {
          json: '{"key":"value","nested":true}',
          path: 'C:\\Users\\test\\file.txt',
          regex: '^test\\d+$',
        },
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arguments).toEqual(ocToolCall.arguments);
      }
    });

    it('should handle empty session ID gracefully', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall, '');

      expect(result.success).toBe(true);
      if (result.success) {
        // Empty string is passed through, not treated as missing
        expect(result.data.sessionId).toBe('');
      }
    });

    it('should handle undefined session ID', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'test_tool',
        arguments: {},
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBeUndefined();
      }
    });
  });

  describe('translateToolResult - edge cases', () => {
    it('should handle empty error string', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-empty-err',
        result: { done: true },
        error: '',
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        // Empty string is preserved (different from undefined)
        expect(result.data.error).toBe('');
      }
    });

    it('should handle whitespace error string', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'call-ws-err',
        result: null,
        error: '   ',
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        // Whitespace is preserved
        expect(result.data.error).toBe('   ');
      }
    });

    it('should handle very long call ID', () => {
      const longCallId = 'c'.repeat(1000);
      const ocToolResult: OpenCodeToolResult = {
        call_id: longCallId,
        result: { done: true },
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe(longCallId);
      }
    });

    it('should handle numeric call ID', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: '12345',
        result: { count: 5 },
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callId).toBe('12345');
      }
    });
  });

  // ============================================================
  // Round-trip Translation Tests
  // ============================================================

  describe('round-trip translation - tool calls', () => {
    it('should preserve all fields through translation', () => {
      const original: OpenCodeToolCall = {
        name: 'sf_artifact_write',
        arguments: { path: '/test.txt', content: 'hello world', encoding: 'utf-8' },
        id: 'call-roundtrip',
      };

      const result = translator.translateToolCall(original, 'session-rt');

      expect(result.success).toBe(true);
      if (result.success) {
        const translated = result.data;
        expect(translated.name).toBe(original.name);
        expect(translated.arguments).toEqual(original.arguments);
        expect(translated.callId).toBe(original.id);
        expect(translated.sessionId).toBe('session-rt');
      }
    });
  });

  describe('round-trip translation - tool results', () => {
    it('should preserve all fields through translation', () => {
      const original: OpenCodeToolResult = {
        call_id: 'call-rt-result',
        result: { files: ['a.ts', 'b.ts'], count: 2 },
        error: undefined,
      };

      const result = translator.translateToolResult(original, 'session-rt-res');

      expect(result.success).toBe(true);
      if (result.success) {
        const translated = result.data;
        expect(translated.callId).toBe(original.call_id);
        expect(translated.result).toEqual(original.result);
        expect(translated.error).toBe(original.error);
        expect(translated.sessionId).toBe('session-rt-res');
      }
    });
  });

  // ============================================================
  // Multiple Translations Tests
  // ============================================================

  describe('translate - multiple tool calls', () => {
    it('should handle multiple valid tool calls correctly', () => {
      const toolCalls: OpenCodeToolCall[] = [
        { name: 'tool1', arguments: { a: 1 } },
        { name: 'tool2', arguments: { b: 2 } },
        { name: 'tool3', arguments: { c: 3 } },
      ];

      const results = toolCalls.map((tc) => translator.translateToolCall(tc));

      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].success && results[0].data.name).toBe('tool1');
      expect(results[1].success && results[1].data.name).toBe('tool2');
      expect(results[2].success && results[2].data.name).toBe('tool3');
    });

    it('should handle mix of valid and invalid tool calls', () => {
      const toolCalls: Array<OpenCodeToolCall | null> = [
        { name: 'valid1', arguments: {} },
        { name: '', arguments: {} } as OpenCodeToolCall, // invalid name
        { name: 'valid2', arguments: {} },
        null, // edge case
      ];

      const results = toolCalls.map((tc) => {
        if (!tc) {
          return { success: false, unsupported: true, reason: 'Null tool call' };
        }
        return translator.translateToolCall(tc);
      });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(false);
    });
  });

  describe('translate - multiple tool results', () => {
    it('should handle multiple valid tool results correctly', () => {
      const toolResults: OpenCodeToolResult[] = [
        { call_id: 'c1', result: { status: 'ok' } },
        { call_id: 'c2', result: { status: 'error' }, error: 'Failed' },
        { call_id: 'c3', result: { data: [1, 2, 3] } },
      ];

      const results = toolResults.map((tr) => translator.translateToolResult(tr));

      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle mix of valid and invalid results', () => {
      const toolResults: Array<OpenCodeToolResult | null> = [
        { call_id: 'c1', result: {} },
        { call_id: '', result: {} } as OpenCodeToolResult, // invalid call_id
        { call_id: 'c3', result: {} },
        null, // edge case
      ];

      const results = toolResults.map((tr) => {
        if (!tr) {
          return { success: false, unsupported: true, reason: 'Null result' };
        }
        return translator.translateToolResult(tr);
      });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(false);
    });
  });

  // ============================================================
  // OpenCode Tool Call Format Compatibility Tests
  // ============================================================

  describe('OpenCode format compatibility', () => {
    it('should handle standard OpenCode tool call format', () => {
      // Standard format as might come from OpenCode plugin
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_state_read',
        arguments: {
          path: '/workspace/project/src/main.ts',
          options: {
            includeMetadata: true,
            recursive: false,
          },
        },
        id: 'oc-call-001',
      };

      const result = translator.translateToolCall(ocToolCall, 'oc-session-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          name: 'sf_state_read',
          arguments: ocToolCall.arguments,
          callId: 'oc-call-001',
          sessionId: 'oc-session-001',
        });
      }
    });

    it('should handle OpenCode batch tool call format', () => {
      const ocToolCall: OpenCodeToolCall = {
        name: 'sf_batch_verify',
        arguments: {
          paths: ['file1.ts', 'file2.ts', 'file3.ts'],
          options: {
            strict: true,
            failFast: false,
          },
        },
        id: 'batch-call-001',
      };

      const result = translator.translateToolCall(ocToolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('sf_batch_verify');
        expect(Array.isArray(result.data.arguments.paths)).toBe(true);
      }
    });

    it('should handle OpenCode tool result with file operations data', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'write-call-001',
        result: {
          success: true,
          path: '/workspace/output.txt',
          bytesWritten: 1024,
          metadata: {
            created: true,
            modified: true,
          },
        },
      };

      const result = translator.translateToolResult(ocToolResult, 'oc-session-002');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.result).toEqual(ocToolResult.result);
        expect(result.data.sessionId).toBe('oc-session-002');
      }
    });

    it('should handle OpenCode error result format', () => {
      const ocToolResult: OpenCodeToolResult = {
        call_id: 'error-call-001',
        result: null,
        error: 'EACCES: permission denied, open "/etc/passwd"',
      };

      const result = translator.translateToolResult(ocToolResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.error).toContain('permission denied');
      }
    });
  });
});
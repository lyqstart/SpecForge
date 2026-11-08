/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for JSON Parser
 *
 * Requirements: 6.1, 6.2, 6.3, 6.10
 */

import { describe, it, expect } from 'vitest';
import { JsonParser } from '@/v11/runtime/JsonParser';

describe('JsonParser', () => {
  describe('parse', () => {
    it('should parse valid JSON', () => {
      const result = JsonParser.parse<{ name: string }>('{"name": "test"}');
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('test');
    });

    it('should return descriptive error for invalid JSON', () => {
      const result = JsonParser.parse('not valid json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });

    it('should return error for empty string', () => {
      const result = JsonParser.parse('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty string');
    });

    it('should return error for non-string input', () => {
      const result = JsonParser.parse(undefined as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('expected string');
    });

    it('should parse arrays', () => {
      const result = JsonParser.parse<number[]>('[1, 2, 3]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should parse nested objects', () => {
      const result = JsonParser.parse<{ a: { b: number } }>('{"a": {"b": 42}}');
      expect(result.success).toBe(true);
      expect(result.data!.a.b).toBe(42);
    });
  });

  describe('serialize', () => {
    it('should serialize objects to JSON', () => {
      const result = JsonParser.serialize({ name: 'test' });
      expect(result.success).toBe(true);
      expect(result.data).toContain('"name"');
      expect(result.data).toContain('"test"');
    });

    it('should serialize with indentation', () => {
      const result = JsonParser.serialize({ a: 1 });
      expect(result.success).toBe(true);
      expect(result.data).toContain('\n');
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      const result = JsonParser.serialize(obj);
      expect(result.success).toBe(false);
      expect(result.error).toContain('serialize error');
    });
  });

  describe('round-trip', () => {
    it('should produce equivalent object after round-trip', () => {
      const original = {
        name: 'test',
        count: 42,
        items: [1, 2, 3],
        nested: { key: 'value' },
      };

      const result = JsonParser.roundTrip(original);
      expect(result.success).toBe(true);
      expect(JsonParser.deepEqual(result.original, result.recovered)).toBe(true);
    });
  });

  describe('deepEqual', () => {
    it('should compare primitives', () => {
      expect(JsonParser.deepEqual(1, 1)).toBe(true);
      expect(JsonParser.deepEqual('a', 'a')).toBe(true);
      expect(JsonParser.deepEqual(1, 2)).toBe(false);
    });

    it('should compare objects', () => {
      expect(JsonParser.deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(JsonParser.deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should compare arrays', () => {
      expect(JsonParser.deepEqual([1, 2], [1, 2])).toBe(true);
      expect(JsonParser.deepEqual([1, 2], [2, 1])).toBe(false);
    });

    it('should handle null', () => {
      expect(JsonParser.deepEqual(null, null)).toBe(true);
      expect(JsonParser.deepEqual(null, undefined)).toBe(false);
    });
  });
});

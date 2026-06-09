/**
 * Feature: specforge-v1-1-compliance-remediation
 * Property 16: JSON Parser/Serializer Round-Trip
 * Property 19: Parser Error Descriptiveness
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.10
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { JsonParser } from '@/v11/runtime/JsonParser';

describe('Property 16: JSON Parser/Serializer Round-Trip', () => {
  /**
   * For any valid JSON-serializable data object, parsing the serialized JSON
   * string and then serializing the parsed object SHALL produce an equivalent object.
   */
  it('should produce equivalent objects after round-trip', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (obj) => {
          // Skip values that JSON.stringify would lose (undefined, functions, symbols)
          const jsonStr = JSON.stringify(obj);
          if (jsonStr === undefined) return true;

          const serialized = JsonParser.serialize(JSON.parse(jsonStr));
          if (!serialized.success) return false;

          const parsed = JsonParser.parse(serialized.data!);
          if (!parsed.success) return false;

          // Compare via re-serialization for consistency
          const reSerialized = JsonParser.serialize(parsed.data);
          if (!reSerialized.success) return false;

          return serialized.data === reSerialized.data;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 19: Parser Error Descriptiveness', () => {
  /**
   * For any invalid input provided to a parser, the parser SHALL return
   * a descriptive error message indicating the nature of the parsing failure.
   */
  it('should return descriptive errors for invalid JSON', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try { JSON.parse(s); return false; } catch { return true; }
        }),
        (invalidJson) => {
          const result = JsonParser.parse(invalidJson);
          if (result.success) return false; // Should not parse invalid JSON
          // Error must be descriptive (non-empty string)
          return result.error !== undefined && result.error.length > 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * JsonParser.ts — SpecForge v1.1 JSON Parser and Serializer utilities
 *
 * Provides parse and serialize methods with descriptive error messages.
 * Guarantees round-trip: parse(serialize(obj)) ≡ obj for valid data.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.10
 */

/** Result of a parse operation */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string | undefined;
}

/**
 * JsonParser — JSON parsing and serialization with error handling.
 *
 * Requirements: 6.1, 6.2, 6.10
 */
export class JsonParser {
  /**
   * Parse a JSON string into a typed object.
   * Requirement: 6.1 — parse valid JSON strings into data objects
   * Requirement: 6.10 — return descriptive error messages for invalid input
   */
  static parse<T = unknown>(jsonString: string): ParseResult<T> {
    if (typeof jsonString !== 'string') {
      return {
        success: false,
        error: `Invalid input: expected string, got ${typeof jsonString}`,
      };
    }

    if (jsonString.trim().length === 0) {
      return {
        success: false,
        error: 'Invalid input: empty string',
      };
    }

    try {
      const data = JSON.parse(jsonString) as T;
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `JSON parse error: ${message}`,
      };
    }
  }

  /**
   * Serialize a data object to a JSON string.
   * Requirement: 6.2 — serialize data objects to valid JSON strings
   */
  static serialize<T = unknown>(data: T, indent: number = 2): ParseResult<string> {
    try {
      const jsonString = JSON.stringify(data, null, indent);
      if (jsonString === undefined) {
        return {
          success: false,
          error: 'JSON serialize error: cannot serialize undefined',
        };
      }
      return { success: true, data: jsonString };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `JSON serialize error: ${message}`,
      };
    }
  }

  /**
   * Verify round-trip consistency: parse(serialize(obj)) ≡ obj
   * Requirement: 6.3
   */
  static roundTrip<T = unknown>(data: T): { success: boolean; original?: T | undefined; recovered?: T | undefined; error?: string | undefined } {
    const serialized = JsonParser.serialize(data);
    if (!serialized.success || serialized.data === undefined) {
      return { success: false, error: serialized.error ?? 'Serialization failed' };
    }

    const parsed = JsonParser.parse<T>(serialized.data);
    if (!parsed.success || parsed.data === undefined) {
      return { success: false, error: parsed.error ?? 'Parse after serialize failed' };
    }

    return { success: true, original: data, recovered: parsed.data };
  }

  /**
   * Check if two values are deeply equal (for round-trip verification).
   */
  static deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj).sort();
      const bKeys = Object.keys(bObj).sort();

      if (aKeys.length !== bKeys.length) return false;
      if (!aKeys.every((k, i) => k === bKeys[i])) return false;

      return aKeys.every((key) => JsonParser.deepEqual(aObj[key], bObj[key]));
    }

    return false;
  }
}

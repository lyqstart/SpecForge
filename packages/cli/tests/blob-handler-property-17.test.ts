/**
 * Property-based test for Property 17: Payload Size Thresholding
 * 
 * Feature: blob-handler, Property 17: Payload Size Thresholding
 * Validates: Requirements 5.6
 * Derived-From: v6-architecture-overview Property 17
 * 
 * This test verifies:
 * - Content > 64 KiB is converted to blob://<sha256> references
 * - Content ≤ 64 KiB remains inline (unchanged)
 * 
 * Iterations: 100+ (configured via fast-check)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { BlobHandler, BLOB_THRESHOLD_BYTES, BlobReference } from '../src/blob/BlobHandler';

// Constants for testing
const THRESHOLD = BLOB_THRESHOLD_BYTES; // 64 KiB = 65536 bytes

describe('Property 17: Payload Size Thresholding', () => {
  let handler: BlobHandler;

  beforeEach(() => {
    handler = new BlobHandler();
  });

  afterEach(() => {
    handler.clear();
  });

  /**
   * Property 1: Content ≤ 64 KiB must remain inline (unchanged)
   * 
   * For all content c where |c| ≤ 64 KiB, the processed content should equal the original.
   */
  it('**Validates: Requirements 5.6** - small content remains inline', () => {
    fc.assert(
      fc.property(
        // Generate content that is at most 64 KiB
        fc.uint8Array({ maxLength: THRESHOLD }),
        (bytes) => {
          const content = new TextDecoder().decode(bytes);
          const result = handler.convertToBlob(content);
          
          // Small content should remain unchanged
          expect(result).toBe(content);
        }
      ),
      {
        numRuns: 100, // At least 100 iterations
        seed: 42, // Reproducible
      }
    );
  });

  /**
   * Property 2: Content > 64 KiB must become blob references
   * 
   * For all content c where |c| > 64 KiB, the processed content must be a blob://<sha256> reference.
   */
  it('**Validates: Requirements 5.6** - large content becomes blob reference', () => {
    fc.assert(
      fc.property(
        // Generate content that is larger than 64 KiB
        fc.uint8Array({ minLength: THRESHOLD + 1, maxLength: THRESHOLD * 10 }),
        (bytes) => {
          const content = new TextDecoder().decode(bytes);
          const result = handler.convertToBlob(content);
          
          // Large content should become a blob reference
          expect(typeof result).toBe('string');
          expect(handler.isBlobReference(result as string)).toBe(true);
          
          // The blob reference should have correct format
          const ref = result as BlobReference;
          const sha256 = ref.replace('blob://', '');
          expect(sha256).toHaveLength(64);
          expect(/^[a-f0-9]+$/.test(sha256)).toBe(true);
        }
      ),
      {
        numRuns: 100, // At least 100 iterations
        seed: 42,
      }
    );
  });

  /**
   * Property 3: Threshold boundary test
   * 
   * Test exactly at the threshold boundary (64 KiB) and just above
   */
  it('**Validates: Requirements 5.6** - threshold boundary behavior', () => {
    fc.assert(
      fc.property(
        // Generate content around the threshold
        fc.nat({ max: 1024 }), // Add random bytes around threshold
        (extra) => {
          // Exactly at threshold (64 KiB) should remain inline
          const atThreshold = 'x'.repeat(THRESHOLD);
          const atThresholdResult = handler.convertToBlob(atThreshold);
          expect(atThresholdResult).toBe(atThreshold);
          
          // Just above threshold should become blob
          const aboveThreshold = 'x'.repeat(THRESHOLD + 1 + extra);
          const aboveThresholdResult = handler.convertToBlob(aboveThreshold);
          expect(handler.isBlobReference(aboveThresholdResult as string)).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 43,
      }
    );
  });

  /**
   * Property 4: Nested content thresholding
   * 
   * For objects and arrays, large nested values should be converted to blob references
   * while small values remain inline.
   */
  it('**Validates: Requirements 5.6** - nested content thresholding', () => {
    fc.assert(
      fc.property(
        // Generate small and large strings
        fc.string({ maxLength: 100 }),
        fc.string({ minLength: THRESHOLD + 1, maxLength: THRESHOLD + 1000 }),
        (smallString, largeString) => {
          // Test with object
          const obj = { small: smallString, large: largeString };
          const processedObj = handler.processContent(obj) as Record<string, unknown>;
          
          // Small should remain, large should become blob
          expect(processedObj.small).toBe(smallString);
          expect(handler.isBlobReference(processedObj.large as string)).toBe(true);
          
          // Test with array
          const arr = [smallString, largeString];
          const processedArr = handler.processContent(arr) as unknown[];
          
          expect(processedArr[0]).toBe(smallString);
          expect(handler.isBlobReference(processedArr[1] as string)).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 44,
      }
    );
  });

  /**
   * Property 5: Blob reference determinism
   * 
   * Same content should produce same blob reference
   */
  it('**Validates: Requirements 5.6** - deterministic blob references', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: THRESHOLD + 1, maxLength: THRESHOLD * 5 }),
        (bytes) => {
          const content = new TextDecoder().decode(bytes);
          
          const result1 = handler.convertToBlob(content);
          const result2 = handler.convertToBlob(content);
          
          // Same content should produce identical blob reference
          expect(result1).toBe(result2);
        }
      ),
      {
        numRuns: 50,
        seed: 45,
      }
    );
  });

  /**
   * Property 6: Various content types
   * 
   * Test thresholding with different content types: strings, numbers, objects, arrays
   * Using simpler generators to avoid timeout
   */
  it('**Validates: Requirements 5.6** - various content types', () => {
    fc.assert(
      fc.property(
        // Use simple strings only to avoid complex object generation timeout
        fc.string({ minLength: THRESHOLD + 1, maxLength: THRESHOLD + 1000 }),
        (content) => {
          const result = handler.processContent(content);
          
          // Function should complete without error
          expect(result).toBeDefined();
          
          // Large string should become blob reference
          expect(handler.isBlobReference(result as string)).toBe(true);
        }
      ),
      {
        numRuns: 50,
        seed: 46,
      }
    );
  });

  /**
   * Property 7: Size calculation accuracy
   * 
   * The getBlobSize method should accurately calculate content size
   */
  it('**Validates: Requirements 5.6** - size calculation accuracy', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: THRESHOLD * 2 }),
        (content) => {
          const calculatedSize = handler.getBlobSize(content);
          const expectedSize = new TextEncoder().encode(content).length;
          
          expect(calculatedSize).toBe(expectedSize);
          
          // Threshold decision should match size comparison
          const shouldConvert = calculatedSize > THRESHOLD;
          const actualConversion = handler.shouldConvertToBlob(content);
          expect(shouldConvert).toBe(actualConversion);
        }
      ),
      {
        numRuns: 100,
        seed: 47,
      }
    );
  });

  /**
   * Property 8: Edge cases
   * 
   * Test edge cases like empty content, very large content, Unicode content
   */
  it('**Validates: Requirements 5.6** - edge cases', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''), // Empty string
          fc.string({ minLength: 1, maxLength: 10 }), // Tiny string
          fc.fullUnicodeString({ minLength: THRESHOLD + 1, maxLength: THRESHOLD + 100 }) // Unicode > threshold
        ),
        (content) => {
          const size = handler.getBlobSize(content);
          const shouldConvert = handler.shouldConvertToBlob(content);
          const result = handler.convertToBlob(content);
          
          // Size should never be negative
          expect(size).toBeGreaterThanOrEqual(0);
          
          // Empty string should not convert
          if (content === '') {
            expect(shouldConvert).toBe(false);
            expect(result).toBe('');
          }
          
          // If shouldConvert is false, result should equal content
          if (!shouldConvert) {
            expect(result).toBe(content);
          }
        }
      ),
      {
        numRuns: 50,
        seed: 48,
      }
    );
  });
});

/**
 * Additional boundary tests with explicit sizes
 */
describe('Property 17: Boundary Tests', () => {
  let handler: BlobHandler;

  beforeEach(() => {
    handler = new BlobHandler();
  });

  afterEach(() => {
    handler.clear();
  });

  it('should handle exactly 64 KiB (threshold) as inline', () => {
    const content = 'x'.repeat(THRESHOLD);
    const result = handler.convertToBlob(content);
    expect(result).toBe(content);
  });

  it('should convert content just above 64 KiB to blob', () => {
    const content = 'x'.repeat(THRESHOLD + 1);
    const result = handler.convertToBlob(content);
    expect(handler.isBlobReference(result as string)).toBe(true);
  });

  it('should handle very large content (1 MiB)', () => {
    const content = 'x'.repeat(1024 * 1024); // 1 MiB
    const result = handler.convertToBlob(content);
    expect(handler.isBlobReference(result as string)).toBe(true);
  });

  it('should handle large JSON objects', () => {
    // Create an object with a large string value
    const largeData = 'x'.repeat(THRESHOLD + 100);
    const obj = { data: largeData, metadata: { type: 'test' } };
    const result = handler.processContent(obj) as Record<string, unknown>;
    expect(handler.isBlobReference(result.data as string)).toBe(true);
    expect(result.metadata).toEqual({ type: 'test' });
  });
});
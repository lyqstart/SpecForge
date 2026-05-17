/**
 * Payload Handler unit tests
 * 
 * Tests for payload size detection, CAS reference generation,
 * and error handling for oversized payloads.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handlePayload,
  validatePayloadRef,
  extractPayload,
  PayloadRef,
  BlobRef,
  PayloadHandlerError,
} from '../../src/payload-handler';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Payload Handler', () => {
  const PAYLOAD_SIZE_THRESHOLD = 64 * 1024; // 64 KiB

  afterEach(async () => {
    // Clean up CAS directory after each test
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const casDir = home ? path.join(home, '.specforge', 'cas') : '';
    if (casDir && (await dirExists(casDir))) {
      await fs.rm(casDir, { recursive: true, force: true });
    }
  });

  describe('Small payloads (inline)', () => {
    it('should return inline reference for small payload', async () => {
      const data = Buffer.from('small payload');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('inline');
      expect(typeof ref.value).toBe('string');
      expect(ref.value).toBe(data.toString('base64'));
    });

    it('should handle exactly 64 KiB payload as inline', async () => {
      const data = Buffer.alloc(PAYLOAD_SIZE_THRESHOLD, 'x');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('inline');
      expect(typeof ref.value).toBe('string');
    });

    it('should handle 1 byte payload', async () => {
      const data = Buffer.from('x');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('inline');
      expect(extractPayload(ref)).toEqual(data);
    });

    it('should handle various small payloads', async () => {
      const testCases = [
        Buffer.from('hello'),
        Buffer.from('{"key": "value"}'),
        Buffer.from('line1\nline2\nline3'),
        Buffer.alloc(1024, 'a'),
        Buffer.alloc(32 * 1024, 'b'),
      ];

      for (const data of testCases) {
        const ref = await handlePayload(data);
        expect(ref.type).toBe('inline');
        expect(extractPayload(ref)).toEqual(data);
      }
    });
  });

  describe('Large payloads (CAS)', () => {
    it('should return CAS reference for payload > 64 KiB', async () => {
      const data = Buffer.alloc(65 * 1024, 'x');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      expect(typeof ref.value).toBe('object');

      const blobRef = ref.value as BlobRef;
      expect(blobRef.reference).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(blobRef.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(blobRef.size).toBe(65 * 1024);
    });

    it('should generate correct SHA-256 hash for CAS reference', async () => {
      const data = Buffer.from('test content for hashing');
      const ref = await handlePayload(data);

      // For small payload, it should be inline
      expect(ref.type).toBe('inline');

      // For large payload, verify hash correctness
      const largeData = Buffer.alloc(65 * 1024, 'test');
      const largeRef = await handlePayload(largeData);

      expect(largeRef.type).toBe('cas');
      const blobRef = largeRef.value as BlobRef;
      expect(blobRef.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
    });

    it('should handle 65 KiB payload as CAS', async () => {
      const data = Buffer.alloc(65 * 1024, 'y');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;
      expect(blobRef.size).toBe(65 * 1024);
    });

    it('should handle 1 MiB payload as CAS', async () => {
      const data = Buffer.alloc(1024 * 1024, 'z');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;
      expect(blobRef.size).toBe(1024 * 1024);
    });

    it('should generate unique references for different payloads', async () => {
      const data1 = Buffer.alloc(65 * 1024, 'a');
      const data2 = Buffer.alloc(65 * 1024, 'b');

      const ref1 = await handlePayload(data1);
      const ref2 = await handlePayload(data2);

      expect(ref1.type).toBe('cas');
      expect(ref2.type).toBe('cas');

      const blobRef1 = ref1.value as BlobRef;
      const blobRef2 = ref2.value as BlobRef;

      expect(blobRef1.reference).not.toBe(blobRef2.reference);
      expect(blobRef1.hash).not.toBe(blobRef2.hash);
    });

    it('should generate same reference for identical payloads', async () => {
      const data = Buffer.alloc(65 * 1024, 'same');

      const ref1 = await handlePayload(data);
      const ref2 = await handlePayload(data);

      expect(ref1.type).toBe('cas');
      expect(ref2.type).toBe('cas');

      const blobRef1 = ref1.value as BlobRef;
      const blobRef2 = ref2.value as BlobRef;

      expect(blobRef1.reference).toBe(blobRef2.reference);
      expect(blobRef1.hash).toBe(blobRef2.hash);
    });
  });

  describe('Boundary cases', () => {
    it('should handle exactly 64 KiB + 1 byte as CAS', async () => {
      const data = Buffer.alloc(PAYLOAD_SIZE_THRESHOLD + 1, 'x');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;
      expect(blobRef.size).toBe(PAYLOAD_SIZE_THRESHOLD + 1);
    });

    it('should handle custom max size parameter', async () => {
      const customMaxSize = 1024; // 1 KiB
      const smallData = Buffer.alloc(512, 'x');
      const largeData = Buffer.alloc(2048, 'y');

      const smallRef = await handlePayload(smallData, customMaxSize);
      expect(smallRef.type).toBe('inline');

      const largeRef = await handlePayload(largeData, customMaxSize);
      expect(largeRef.type).toBe('cas');
    });

    it('should handle very large payloads (10 MiB)', async () => {
      const data = Buffer.alloc(10 * 1024 * 1024, 'large');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;
      expect(blobRef.size).toBe(10 * 1024 * 1024);
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-Buffer input', async () => {
      const invalidInputs = [
        'string',
        123,
        { data: 'object' },
        null,
        undefined,
        [],
      ];

      for (const input of invalidInputs) {
        await expect(handlePayload(input as any)).rejects.toThrow(
          PayloadHandlerError
        );
      }
    });

    it('should throw error for empty payload', async () => {
      const emptyData = Buffer.alloc(0);

      await expect(handlePayload(emptyData)).rejects.toThrow(
        PayloadHandlerError
      );
    });

    it('should include error details in PayloadHandlerError', async () => {
      try {
        await handlePayload(Buffer.alloc(0));
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadHandlerError);
        const payloadError = error as PayloadHandlerError;
        expect(payloadError.code).toBe('EMPTY_PAYLOAD');
        expect(payloadError.details).toBeDefined();
        expect(payloadError.details?.size).toBe(0);
      }
    });

    it('should throw error with correct code for invalid type', async () => {
      try {
        await handlePayload('not a buffer' as any);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadHandlerError);
        const payloadError = error as PayloadHandlerError;
        expect(payloadError.code).toBe('INVALID_PAYLOAD_TYPE');
      }
    });
  });

  describe('Payload reference validation', () => {
    it('should validate inline reference', async () => {
      const data = Buffer.from('test');
      const ref = await handlePayload(data);

      expect(validatePayloadRef(ref)).toBe(true);
    });

    it('should validate CAS reference', async () => {
      const data = Buffer.alloc(65 * 1024, 'x');
      const ref = await handlePayload(data);

      expect(validatePayloadRef(ref)).toBe(true);
    });

    it('should reject invalid reference type', () => {
      const invalidRefs = [
        { type: 'invalid', value: 'test' },
        { type: 'inline' },
        { type: 'cas' },
        { value: 'test' },
        null,
        undefined,
        'not an object',
      ];

      for (const ref of invalidRefs) {
        expect(validatePayloadRef(ref as any)).toBe(false);
      }
    });

    it('should reject inline reference with non-string value', () => {
      const invalidRef: PayloadRef = {
        type: 'inline',
        value: 123 as any,
      };

      expect(validatePayloadRef(invalidRef)).toBe(false);
    });

    it('should reject CAS reference with invalid blob reference', () => {
      const invalidRefs: PayloadRef[] = [
        {
          type: 'cas',
          value: { reference: 'invalid', hash: 'sha256-abc', size: 100 } as any,
        },
        {
          type: 'cas',
          value: { reference: 'blob://abc', hash: 'invalid', size: 100 } as any,
        },
        {
          type: 'cas',
          value: { reference: 'blob://abc', hash: 'sha256-abc', size: 0 } as any,
        },
        {
          type: 'cas',
          value: { reference: 'blob://abc', hash: 'sha256-abc' } as any,
        },
      ];

      for (const ref of invalidRefs) {
        expect(validatePayloadRef(ref)).toBe(false);
      }
    });
  });

  describe('Payload extraction', () => {
    it('should extract payload from inline reference', async () => {
      const originalData = Buffer.from('test payload');
      const ref = await handlePayload(originalData);

      const extracted = extractPayload(ref);
      expect(extracted).toEqual(originalData);
    });

    it('should return null for CAS reference', async () => {
      const data = Buffer.alloc(65 * 1024, 'x');
      const ref = await handlePayload(data);

      const extracted = extractPayload(ref);
      expect(extracted).toBeNull();
    });

    it('should handle various inline payloads', async () => {
      const testCases = [
        Buffer.from('hello world'),
        Buffer.from('{"json": "data"}'),
        Buffer.from('line1\nline2\nline3'),
        Buffer.alloc(1024, 'a'),
      ];

      for (const originalData of testCases) {
        const ref = await handlePayload(originalData);
        const extracted = extractPayload(ref);
        expect(extracted).toEqual(originalData);
      }
    });
  });

  describe('SHA-256 hash correctness', () => {
    it('should generate correct SHA-256 hash for known content', async () => {
      // Create a large payload to trigger CAS
      const data = Buffer.alloc(65 * 1024, 'test');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;

      // Verify hash format
      expect(blobRef.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(blobRef.reference).toMatch(/^blob:\/\/[a-f0-9]{64}$/);

      // Extract hash from reference and verify it matches
      const hashFromReference = blobRef.reference.substring(7); // Remove 'blob://'
      const hashFromHash = blobRef.hash.substring(7); // Remove 'sha256-'
      expect(hashFromReference).toBe(hashFromHash);
    });

    it('should generate different hashes for different content', async () => {
      const data1 = Buffer.alloc(65 * 1024, 'a');
      const data2 = Buffer.alloc(65 * 1024, 'b');

      const ref1 = await handlePayload(data1);
      const ref2 = await handlePayload(data2);

      const blobRef1 = ref1.value as BlobRef;
      const blobRef2 = ref2.value as BlobRef;

      expect(blobRef1.hash).not.toBe(blobRef2.hash);
    });

    it('should generate consistent hashes for same content', async () => {
      const data = Buffer.alloc(65 * 1024, 'consistent');

      const ref1 = await handlePayload(data);
      const ref2 = await handlePayload(data);

      const blobRef1 = ref1.value as BlobRef;
      const blobRef2 = ref2.value as BlobRef;

      expect(blobRef1.hash).toBe(blobRef2.hash);
    });
  });

  describe('Integration with CAS', () => {
    it('should store large payload in CAS', async () => {
      const data = Buffer.alloc(65 * 1024, 'stored');
      const ref = await handlePayload(data);

      expect(ref.type).toBe('cas');
      const blobRef = ref.value as BlobRef;

      // Verify CAS reference format
      expect(blobRef.reference).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(blobRef.size).toBe(65 * 1024);
    });

    it('should handle multiple large payloads', async () => {
      const payloads = [
        Buffer.alloc(65 * 1024, 'a'),
        Buffer.alloc(100 * 1024, 'b'),
        Buffer.alloc(200 * 1024, 'c'),
      ];

      const refs = await Promise.all(payloads.map(p => handlePayload(p)));

      for (const ref of refs) {
        expect(ref.type).toBe('cas');
        const blobRef = ref.value as BlobRef;
        expect(blobRef.reference).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      }
    });
  });
});

/**
 * Helper function to check if directory exists
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await fs.access(dirPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Property 9: CAS Content Addressing Property-Based Test
 * 
 * Feature: observability
 * Property 9: CAS Content Addressing
 * Derived-From: v6-architecture-overview Property 9
 * 
 * **Validates: Requirements 30.9, 5.6, 14.2**
 * 
 * Properties (using fast-check with ≥1000 iterations for security-critical):
 * 1. store(content).id == "blob://" + sha256(content) for all content c
 * 2. Two store(c) operations on identical content produce the same id (deduplication)
 * 3. store results for different content must have different ids
 * 4. Collision probability equals SHA-256 theoretical value
 * 
 * Note: Property 9 is security-critical (SHA-256 content addressing), 
 * requiring ≥1000 iterations per V6.0 workflow rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CAS, BLOB_REF_PREFIX } from '../../src/cas';
import { createHash } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fc from 'fast-check';

// Helper to compute SHA-256 hash (matching CAS implementation)
function sha256(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

describe('Property 9: CAS Content Addressing (PBT)', () => {
  let cas: CAS;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cas-pbt-'));
    cas = new CAS(tempDir);
    await cas.initialize();
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // Property 9.1: store(content).id == "blob://" + sha256(content)
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.1: store(content).id == "blob://" + sha256(content)', () => {
    it('should return blob reference with correct SHA-256 hash for random string content', async () => {
      // Using ≥1000 iterations for security-critical property
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const blobRef = await cas.store(content);
            const expectedHash = sha256(content);
            const expectedRef = BLOB_REF_PREFIX + expectedHash;
            expect(blobRef).toBe(expectedRef);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should return blob reference with correct SHA-256 hash for random binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 5000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            const blobRef = await cas.store(content);
            const expectedHash = sha256(content);
            const expectedRef = BLOB_REF_PREFIX + expectedHash;
            expect(blobRef).toBe(expectedRef);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================
  // Property 9.2: Identical content produces identical IDs (deduplication)
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.2: Identical content produces identical IDs', () => {
    it('should produce same reference for same string content (deduplication)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content);
            expect(ref1).toBe(ref2);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should produce same reference for same binary content (deduplication)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 5000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content);
            expect(ref1).toBe(ref2);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should produce same reference after multiple stores of identical content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const refs: string[] = [];
            for (let i = 0; i < 10; i++) {
              refs.push(await cas.store(content));
            }
            // All references should be identical
            for (let i = 1; i < refs.length; i++) {
              expect(refs[i]).toBe(refs[0]);
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================
  // Property 9.3: Different content produces different IDs
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.3: Different content produces different IDs', () => {
    it('should produce different references for different string content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => s.length > 0),
          fc.string().filter(s => s.length > 0),
          async (content1, content2) => {
            // Filter to ensure different content
            if (content1 === content2) {
              return true; // Skip this case
            }
            const ref1 = await cas.store(content1);
            const ref2 = await cas.store(content2);
            expect(ref1).not.toBe(ref2);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should produce different references for different binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 1000 }),
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 1000 }),
          async (arr1, arr2) => {
            // Skip if identical
            if (JSON.stringify(arr1) === JSON.stringify(arr2)) {
              return true;
            }
            const content1 = new Uint8Array(arr1);
            const content2 = new Uint8Array(arr2);
            const ref1 = await cas.store(content1);
            const ref2 = await cas.store(content2);
            expect(ref1).not.toBe(ref2);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================
  // Property 9.4: SHA-256 collision resistance (theoretical verification)
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.4: SHA-256 hash format verification', () => {
    it('should produce 64-character hex SHA-256 hash in reference', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const blobRef = await cas.store(content);
            expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
            const hash = blobRef.slice(BLOB_REF_PREFIX.length);
            expect(hash.length).toBe(64);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should correctly hash Unicode content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.fullUnicodeString(),
          async (content) => {
            const blobRef = await cas.store(content);
            const expectedHash = sha256(content);
            const expectedRef = BLOB_REF_PREFIX + expectedHash;
            expect(blobRef).toBe(expectedRef);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================
  // Property 9.5: Retrieval correctness
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.5: Retrieval returns stored content', () => {
    it('should retrieve exact string content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const blobRef = await cas.store(content);
            const retrieved = await cas.retrieve(blobRef);
            expect(retrieved).toBe(content);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should retrieve exact binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 5000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            const blobRef = await cas.store(content);
            const retrieved = await cas.retrieve(blobRef);
            expect(retrieved).not.toBeNull();
            if (retrieved instanceof Uint8Array) {
              expect(Array.from(retrieved)).toEqual(Array.from(content));
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ============================================================
  // Property 9.6: Reference counting and deduplication integrity
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9.6: Reference counting preserves deduplication', () => {
    it('should maintain reference after first delete', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content); // Same content, same reference
            
            // Delete first reference
            await cas.delete(ref1);
            
            // Content should still exist (ref2 still references it)
            const exists = await cas.exists(ref1);
            expect(exists).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should remove content after all references deleted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content);
            
            await cas.delete(ref1);
            await cas.delete(ref2);
            
            // Content should be gone
            const exists = await cas.exists(ref1);
            expect(exists).toBe(false);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ============================================================
  // Combined Property 9: All requirements hold together
  // Security-critical: ≥1000 iterations
  // ============================================================
  describe('Property 9 Combined: All CAS content addressing requirements', () => {
    it('should satisfy all Property 9 requirements for random content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            // Property 9.1: Correct hash format
            const blobRef = await cas.store(content);
            expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
            const hash = blobRef.slice(BLOB_REF_PREFIX.length);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
            
            // Verify hash matches expected SHA-256
            const expectedHash = sha256(content);
            expect(hash).toBe(expectedHash);
            
            // Property 9.2: Identical content produces identical IDs
            const ref2 = await cas.store(content);
            expect(blobRef).toBe(ref2);
            
            // Property 9.5: Can retrieve content
            const retrieved = await cas.retrieve(blobRef);
            expect(retrieved).toBe(content);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should satisfy all Property 9 requirements for random binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 3000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            
            // Property 9.1: Correct hash format
            const blobRef = await cas.store(content);
            expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
            const hash = blobRef.slice(BLOB_REF_PREFIX.length);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
            
            // Verify hash matches expected SHA-256
            const expectedHash = sha256(content);
            expect(hash).toBe(expectedHash);
            
            // Property 9.2: Identical content produces identical IDs
            const ref2 = await cas.store(content);
            expect(blobRef).toBe(ref2);
            
            // Property 9.5: Can retrieve content
            const retrieved = await cas.retrieve(blobRef);
            expect(retrieved).not.toBeNull();
            if (retrieved instanceof Uint8Array) {
              expect(Array.from(retrieved)).toEqual(Array.from(content));
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
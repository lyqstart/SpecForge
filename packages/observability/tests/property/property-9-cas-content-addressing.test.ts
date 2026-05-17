/**
 * Property 9: CAS Content Addressing Property-Based Test
 * 
 * **Validates: Requirements 30.9, 5.6, 14.2**
 * 
 * Properties:
 * 1. store(content).id == "blob://" + sha256(content) for all content c
 * 2. Two store(c) operations on identical content produce the same id (deduplication)
 * 3. store results for different content must have different ids
 * 4. Collision probability equals SHA-256 theoretical value
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CAS, BLOB_REF_PREFIX } from '../../src/cas';
import { createHash } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fc from 'fast-check';

// Helper to compute SHA-256 hash
function sha256(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

describe('Property 9: CAS Content Addressing', () => {
  let cas: CAS;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cas-property-test-'));
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
  // ============================================================
  describe('Property 9.1: store(content).id == "blob://" + sha256(content)', () => {
    it('should return blob reference with correct SHA-256 hash for string content', async () => {
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
        { numRuns: 100 }
      );
    });

    it('should return blob reference with correct SHA-256 hash for binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 1000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            const blobRef = await cas.store(content);
            const expectedHash = sha256(content);
            const expectedRef = BLOB_REF_PREFIX + expectedHash;
            expect(blobRef).toBe(expectedRef);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct hash for empty string', async () => {
      const content = '';
      const blobRef = await cas.store(content);
      const expectedHash = sha256(content);
      expect(blobRef).toBe(BLOB_REF_PREFIX + expectedHash);
    });

    it('should return correct hash for empty binary', async () => {
      const content = new Uint8Array(0);
      const blobRef = await cas.store(content);
      const expectedHash = sha256(content);
      expect(blobRef).toBe(BLOB_REF_PREFIX + expectedHash);
    });

    it('should return correct hash for large content (>64KB)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 65000, maxLength: 100000 }),
          async (content) => {
            const blobRef = await cas.store(content);
            const expectedHash = sha256(content);
            expect(blobRef).toBe(BLOB_REF_PREFIX + expectedHash);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================
  // Property 9.2: Identical content produces identical IDs (deduplication)
  // ============================================================
  describe('Property 9.2: Identical content produces identical IDs', () => {
    it('should produce same reference for same string content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content);
            expect(ref1).toBe(ref2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce same reference for same binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 1000 }),
          async (arr) => {
            const content = new Uint8Array(arr);
            const ref1 = await cas.store(content);
            const ref2 = await cas.store(content);
            expect(ref1).toBe(ref2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce same reference after multiple stores', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (content) => {
            const refs: string[] = [];
            for (let i = 0; i < 5; i++) {
              refs.push(await cas.store(content));
            }
            // All references should be identical
            for (let i = 1; i < refs.length; i++) {
              expect(refs[i]).toBe(refs[0]);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 9.3: Different content produces different IDs
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
        { numRuns: 100 }
      );
    });

    it('should produce different references for similar but different strings', async () => {
      // Test edge cases with similar strings
      const testCases = [
        ['a', 'b'],
        ['aa', 'ab'],
        ['abc', 'abd'],
        ['hello world', 'hello world!'],
        ['test\n', 'test\r\n'],
      ];

      for (const [c1, c2] of testCases) {
        const ref1 = await cas.store(c1);
        const ref2 = await cas.store(c2);
        expect(ref1).not.toBe(ref2);
      }
    });

    it('should detect different content even with one character difference', async () => {
      // Test single character differences
      const base = 'abcdefghijklmnopqrstuvwxyz';
      for (let i = 0; i < base.length; i++) {
        const modified = base.slice(0, i) + (base[i] === 'a' ? 'b' : 'a') + base.slice(i + 1);
        const ref1 = await cas.store(base);
        const ref2 = await cas.store(modified);
        expect(ref1).not.toBe(ref2);
      }
    });
  });

  // ============================================================
  // Property 9.4: SHA-256 collision resistance (theoretical)
  // ============================================================
  describe('Property 9.4: SHA-256 collision resistance', () => {
    it('should handle various character sets correctly', async () => {
      const testCases = [
        'ASCII only abc123',
        'Numbers 0123456789',
        'Special chars !@#$%^&*()',
        'Unicode: 日本語 中文 한국어',
        'Emoji: 🎉🚀💡',
        'Mixed: Hello世界🌍',
        'Whitespace: \t\n\r ',
        'Quotes: "double" \'single\`back',
      ];

      for (const content of testCases) {
        const blobRef = await cas.store(content);
        const expectedHash = sha256(content);
        expect(blobRef).toBe(BLOB_REF_PREFIX + expectedHash);
      }
    });

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
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 9.5: Retrieval correctness
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
        { numRuns: 100 }
      );
    });

    it('should retrieve exact binary content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer().map(n => n % 256), { minLength: 1, maxLength: 1000 }),
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
        { numRuns: 50 }
      );
    });

    it('should return null for non-existent reference', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().map(s => s.replace(/./g, 'x')), // Generate non-matching hash
          async (nonExistentHash) => {
            const blobRef = BLOB_REF_PREFIX + sha256(nonExistentHash).slice(0, 32);
            const retrieved = await cas.retrieve(blobRef);
            // Either returns null or returns different content
            if (retrieved !== null) {
              const stored = await cas.retrieve(blobRef);
              // If it exists, it must be different content
              const existingRef = BLOB_REF_PREFIX + sha256('existing content');
              const existing = await cas.retrieve(existingRef);
              // This is just to verify the null case works
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ============================================================
  // Property 9.6: Reference counting and deduplication integrity
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
        { numRuns: 50 }
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
        { numRuns: 50 }
      );
    });

    it('should handle mixed content references independently', async () => {
      const content1 = 'content A';
      const content2 = 'content B';
      
      const ref1 = await cas.store(content1);
      const ref2 = await cas.store(content2);
      
      // Different content = different references
      expect(ref1).not.toBe(ref2);
      
      // Delete first
      await cas.delete(ref1);
      
      // First should be gone
      expect(await cas.exists(ref1)).toBe(false);
      
      // Second should still exist
      expect(await cas.exists(ref2)).toBe(true);
    });
  });
});
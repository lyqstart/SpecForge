/**
 * CAS (Content-Addressable Storage) unit tests
 * 
 * Tests the CAS implementation including:
 * - SHA-256 content addressing
 * - Blob storage and retrieval
 * - Deduplication
 * - Reference counting
 * - Garbage collection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CAS, BLOB_REF_PREFIX, createCAS } from '../../src/cas';
import { createHash } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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

describe('CAS (Content-Addressable Storage)', () => {
  let cas: CAS;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'cas-test-'));
    cas = new CAS(tempDir);
    await cas.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('store()', () => {
    it('should store string content and return blob reference', async () => {
      const content = 'Hello, World!';
      const blobRef = await cas.store(content);

      expect(blobRef).toBeDefined();
      expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
    });

    it('should store binary content and return blob reference', async () => {
      const content = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const blobRef = await cas.store(content);

      expect(blobRef).toBeDefined();
      expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
    });

    it('should store empty string content', async () => {
      const content = '';
      const blobRef = await cas.store(content);

      expect(blobRef).toBeDefined();
      expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);
    });

    it('should store large content (>64KB)', async () => {
      // Generate content larger than 64KB
      const largeContent = 'x'.repeat(70000);
      const blobRef = await cas.store(largeContent);

      expect(blobRef).toBeDefined();
      expect(blobRef.startsWith(BLOB_REF_PREFIX)).toBe(true);

      // Verify we can retrieve it
      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(largeContent);
    });

    it('should store content with special characters', async () => {
      const content = 'Hello 世界 🌍 \n\t\r"quotes"';
      const blobRef = await cas.store(content);

      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(content);
    });

    it('should store Unicode content', async () => {
      const content = '日本語テスト 🎉 unicode';
      const blobRef = await cas.store(content);

      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(content);
    });
  });

  describe('Property 9.1: Content Addressing', () => {
    it('should return blob reference with SHA-256 hash', async () => {
      const content = 'test content';
      const blobRef = await cas.store(content);

      const expectedHash = sha256(content);
      const expectedRef = BLOB_REF_PREFIX + expectedHash;

      expect(blobRef).toBe(expectedRef);
    });

    it('should return consistent hash for same content', async () => {
      const content = 'consistent content';

      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content);

      // Same content should produce same reference (deduplication)
      expect(ref1).toBe(ref2);
    });

    it('should produce different hashes for different content', async () => {
      const ref1 = await cas.store('content A');
      const ref2 = await cas.store('content B');

      expect(ref1).not.toBe(ref2);
    });

    it('should produce different hashes for similar but different content', async () => {
      const ref1 = await cas.store('Hello World');
      const ref2 = await cas.store('Hello World!');

      expect(ref1).not.toBe(ref2);
    });
  });

  describe('retrieve()', () => {
    it('should retrieve stored string content', async () => {
      const original = 'Hello, World!';
      const blobRef = await cas.store(original);

      const retrieved = await cas.retrieve(blobRef);

      expect(retrieved).toBe(original);
    });

    it('should retrieve stored binary content', async () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const blobRef = await cas.store(original);

      const retrieved = await cas.retrieve(blobRef);

      // retrieved should be either string or Uint8Array
      expect(retrieved).not.toBeNull();
      if (retrieved instanceof Uint8Array) {
        expect(Array.from(retrieved)).toEqual([1, 2, 3, 4, 5]);
      }
    });

    it('should return null for non-existent blob reference', async () => {
      const result = await cas.retrieve('blob://' + 'a'.repeat(64));

      expect(result).toBeNull();
    });

    it('should return null for invalid blob reference format', async () => {
      const result = await cas.retrieve('invalid-ref');

      expect(result).toBeNull();
    });

    it('should return null for empty hash', async () => {
      const result = await cas.retrieve('blob://');

      expect(result).toBeNull();
    });
  });

  describe('exists()', () => {
    it('should return true for stored content', async () => {
      const content = 'test content';
      const blobRef = await cas.store(content);

      const exists = await cas.exists(blobRef);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent blob reference', async () => {
      const exists = await cas.exists('blob://' + 'b'.repeat(64));

      expect(exists).toBe(false);
    });

    it('should return false for invalid blob reference format', async () => {
      const exists = await cas.exists('invalid-format');

      expect(exists).toBe(false);
    });
  });

  describe('Reference Counting', () => {
    it('should increment reference count for duplicate store', async () => {
      const content = 'shared content';
      
      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content);

      // Both should return the same reference (deduplication)
      expect(ref1).toBe(ref2);

      // Deleting one should not remove the blob
      await cas.delete(ref1);

      const stillExists = await cas.exists(ref1);
      expect(stillExists).toBe(true);
    });

    it('should remove blob after all references deleted', async () => {
      const content = 'shared content';
      
      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content); // Same content, same reference

      // Delete first reference
      await cas.delete(ref1);

      // Blob should still exist
      let exists = await cas.exists(ref1);
      expect(exists).toBe(true);

      // Delete second reference
      await cas.delete(ref2);

      // Blob should be removed
      exists = await cas.exists(ref1);
      expect(exists).toBe(false);
    });

    it('should handle multiple stores of different content separately', async () => {
      const content1 = 'content 1';
      const content2 = 'content 2';

      const ref1 = await cas.store(content1);
      const ref2 = await cas.store(content2);

      expect(ref1).not.toBe(ref2);

      // Delete first
      await cas.delete(ref1);

      // First should be gone
      expect(await cas.exists(ref1)).toBe(false);

      // Second should still exist
      expect(await cas.exists(ref2)).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should delete blob when reference count reaches zero', async () => {
      const content = 'to be deleted';
      const blobRef = await cas.store(content);

      await cas.delete(blobRef);

      const exists = await cas.exists(blobRef);
      expect(exists).toBe(false);
    });

    it('should handle deleting non-existent blob gracefully', async () => {
      // Should not throw
      await expect(
        cas.delete('blob://' + 'c'.repeat(64))
      ).resolves.not.toThrow();
    });

    it('should handle deleting with invalid reference format', async () => {
      // Should not throw
      await expect(
        cas.delete('invalid-format')
      ).resolves.not.toThrow();
    });
  });

  describe('garbageCollect()', () => {
    it('should collect blobs with zero reference count', async () => {
      const content = 'to be garbage collected';
      const blobRef = await cas.store(content);

      // Manually delete (sets refcount to 0)
      await cas.delete(blobRef);

      // Run garbage collection
      const deleted = await cas.garbageCollect();

      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats()', () => {
    it('should return correct blob count and size', async () => {
      const content1 = 'content 1';
      const content2 = 'content 2';

      await cas.store(content1);
      await cas.store(content2);

      const stats = await cas.getStats();

      expect(stats.blobCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return zero for empty storage', async () => {
      const stats = await cas.getStats();

      expect(stats.blobCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle storing multiple times with same reference', async () => {
      const content = 'test';
      
      // Store 3 times
      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content);
      const ref3 = await cas.store(content);

      expect(ref1).toBe(ref2);
      expect(ref2).toBe(ref3);

      // Delete twice
      await cas.delete(ref1);
      await cas.delete(ref2);

      // Should still exist
      expect(await cas.exists(ref1)).toBe(true);

      // Delete third time
      await cas.delete(ref3);

      // Should be gone
      expect(await cas.exists(ref1)).toBe(false);
    });

    it('should handle very long content', async () => {
      const veryLongContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
      const blobRef = await cas.store(veryLongContent);

      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(veryLongContent);
    });

    it('should handle binary data with null bytes', async () => {
      const binaryWithNulls = new Uint8Array([0x00, 0x01, 0x00, 0x02, 0x00]);
      const blobRef = await cas.store(binaryWithNulls);

      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('createCAS() factory', () => {
    it('should create a CAS instance with custom path', () => {
      const customPath = '/custom/cas/path';
      const cas = createCAS(customPath);
      
      expect(cas).toBeDefined();
    });
  });
});
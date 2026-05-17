/**
 * Integration tests for BlobHandler + DaemonClient integration.
 * 
 * Tests:
 * - Automatic blob conversion on request (content > 64 KiB)
 * - Automatic blob resolution on response
 * - Transparent handling for users
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4; Property 17
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DaemonClient, BLOB_THRESHOLD_BYTES } from '../src/http';

describe('BlobHandler + DaemonClient Integration', () => {
  let client: DaemonClient;

  beforeEach(() => {
    client = new DaemonClient({
      host: '127.0.0.1',
      port: 3847,
      token: 'test-token',
      enableBlobHandling: true,
    });
  });

  afterEach(() => {
    client.clearBlobs();
  });

  describe('constructor with blob configuration', () => {
    it('should enable blob handling by default', () => {
      const defaultClient = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
      });
      expect(defaultClient.isBlobHandlingEnabled).toBe(true);
    });

    it('should allow disabling blob handling', () => {
      const noBlobClient = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        enableBlobHandling: false,
      });
      expect(noBlobClient.isBlobHandlingEnabled).toBe(false);
    });

    it('should use default threshold of 64 KiB', () => {
      expect(client.blobThreshold).toBe(BLOB_THRESHOLD_BYTES);
    });

    it('should accept custom blob threshold', () => {
      const customClient = new DaemonClient({
        host: '127.0.0.1',
        port: 3847,
        blobThreshold: 1024, // 1 KB
      });
      expect(customClient.blobThreshold).toBe(1024);
    });
  });

  describe('convertToBlob', () => {
    it('should return small content unchanged', () => {
      const smallContent = 'small content';
      expect(client.convertToBlob(smallContent)).toBe(smallContent);
    });

    it('should convert large content to blob reference', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const result = client.convertToBlob(largeContent);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });

    it('should convert large objects to blob references', () => {
      const largeObj = { data: 'x'.repeat(64 * 1024 + 1) };
      const result = client.convertToBlob(largeObj);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });
  });

  describe('processContent', () => {
    it('should handle null', () => {
      expect(client.processContent(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(client.processContent(undefined)).toBeUndefined();
    });

    it('should process primitives unchanged', () => {
      expect(client.processContent('string')).toBe('string');
      expect(client.processContent(123)).toBe(123);
      expect(client.processContent(true)).toBe(true);
    });

    it('should process array elements', () => {
      const smallArray = ['a', 'b', 'c'];
      expect(client.processContent(smallArray)).toEqual(smallArray);
    });

    it('should convert large array elements to blobs', () => {
      const largeItem = 'x'.repeat(64 * 1024 + 1);
      const array = ['small', largeItem, 'another'];
      const result = client.processContent(array) as string[];
      expect(result[0]).toBe('small');
      expect(result[1]).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(result[2]).toBe('another');
    });

    it('should convert large object values to blobs', () => {
      const largeValue = 'x'.repeat(64 * 1024 + 1);
      const obj = { small: 'value', large: largeValue };
      const result = client.processContent(obj) as Record<string, string>;
      expect(result.small).toBe('value');
      expect(result.large).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });
  });

  describe('resolveContent', () => {
    it('should resolve blob in interactive mode', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = client.convertToBlob(largeContent) as string;
      const resolved = client.resolveContent(blobRef, true);
      expect(resolved).toBe(largeContent);
    });

    it('should keep blob reference in JSON mode', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = client.convertToBlob(largeContent) as string;
      // When resolveBlobsInInteractive is true, interactive=true resolves, 
      // but interactive=false (JSON mode) keeps the reference
      const resolved = client.resolveContent(blobRef, false);
      expect(resolved).toBe(blobRef);
    });

    it('should resolve nested blob references in objects', () => {
      const largeValue = 'x'.repeat(64 * 1024 + 1);
      const obj = { small: 'value', large: largeValue };
      const processed = client.processContent(obj) as Record<string, string>;
      const resolved = client.resolveContent(processed, true) as Record<string, string>;
      expect(resolved.small).toBe('value');
      expect(resolved.large).toBe(largeValue);
    });
  });

  describe('isBlobReference', () => {
    it('should return true for valid blob reference', () => {
      const validRef = 'blob://' + 'a'.repeat(64);
      expect(client.isBlobReference(validRef)).toBe(true);
    });

    it('should return false for string not starting with blob://', () => {
      expect(client.isBlobReference('not-a-blob')).toBe(false);
    });

    it('should return false for blob:// with wrong length', () => {
      expect(client.isBlobReference('blob://abc')).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(client.isBlobReference(123)).toBe(false);
      expect(client.isBlobReference({})).toBe(false);
      expect(client.isBlobReference(null)).toBe(false);
    });
  });

  describe('clearBlobs', () => {
    it('should clear blob store', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = client.convertToBlob(largeContent) as string;
      
      // Before clearing, should resolve
      expect(client.resolveContent(blobRef, true)).toBe(largeContent);
      
      // Clear the store
      client.clearBlobs();
      
      // After clearing, should return reference
      expect(client.resolveContent(blobRef, true)).toBe(blobRef);
    });
  });

  describe('transparent handling for users', () => {
    it('should provide access to BlobHandler methods', () => {
      // Users can access blob handling methods directly if needed
      const size = client.blobHandler.getBlobSize?.('test') ?? 0;
      expect(size).toBeGreaterThan(0);
    });
  });
});

describe('Property 17: Payload Size Thresholding', () => {
  let client: DaemonClient;

  beforeEach(() => {
    client = new DaemonClient({
      host: '127.0.0.1',
      port: 3847,
      enableBlobHandling: true,
    });
  });

  afterEach(() => {
    client.clearBlobs();
  });

  it('should keep content <= 64 KiB inline', () => {
    const smallContent = 'x'.repeat(64 * 1024);
    const processed = client.processContent(smallContent);
    expect(processed).toBe(smallContent);
  });

  it('should convert content > 64 KiB to blob reference', () => {
    const largeContent = 'x'.repeat(64 * 1024 + 1);
    const processed = client.processContent(largeContent);
    expect(processed).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
  });

  it('should handle mixed content correctly', () => {
    const smallValue = 'small';
    const largeValue = 'x'.repeat(64 * 1024 + 1);
    const obj = { small: smallValue, large: largeValue };
    
    const processed = client.processContent(obj) as Record<string, string>;
    
    expect(processed.small).toBe(smallValue);
    expect(processed.large).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
  });
});
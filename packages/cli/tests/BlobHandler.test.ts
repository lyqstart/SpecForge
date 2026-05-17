/**
 * Unit tests for BlobHandler component.
 * 
 * Tests:
 * - Content size detection (threshold > 64 KiB)
 * - Large content conversion to blob://<sha256> references
 * - Blob reference resolution in interactive mode
 * - Blob references unchanged in JSON mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlobHandler, BLOB_THRESHOLD_BYTES, createBlobHandler, BlobReference } from '../src/blob/BlobHandler';

describe('BlobHandler', () => {
  let handler: BlobHandler;

  beforeEach(() => {
    handler = new BlobHandler();
  });

  afterEach(() => {
    handler.clear();
  });

  describe('constructor', () => {
    it('should use default threshold of 64 KiB', () => {
      expect(handler.getThreshold()).toBe(BLOB_THRESHOLD_BYTES);
    });

    it('should accept custom threshold', () => {
      const customHandler = new BlobHandler({ threshold: 1024 });
      expect(customHandler.getThreshold()).toBe(1024);
      customHandler.clear();
    });

    it('should accept resolveInJsonMode option', () => {
      const interactiveHandler = new BlobHandler({ resolveInJsonMode: true });
      interactiveHandler.clear();
    });
  });

  describe('getBlobSize', () => {
    it('should return 0 for null', () => {
      expect(handler.getBlobSize(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(handler.getBlobSize(undefined)).toBe(0);
    });

    it('should calculate size of string correctly', () => {
      const smallString = 'hello';
      expect(handler.getBlobSize(smallString)).toBe(5);
    });

    it('should calculate size of UTF-8 string correctly', () => {
      const utf8String = '你好';
      // '你好' is 6 bytes in UTF-8
      expect(handler.getBlobSize(utf8String)).toBe(6);
    });

    it('should calculate size of object correctly', () => {
      const obj = { key: 'value' };
      const size = handler.getBlobSize(obj);
      expect(size).toBeGreaterThan(0);
    });

    it('should calculate size of number correctly', () => {
      const num = 12345;
      const size = handler.getBlobSize(num);
      expect(size).toBeGreaterThan(0);
    });

    it('should calculate size of boolean correctly', () => {
      const bool = true;
      const size = handler.getBlobSize(bool);
      expect(size).toBeGreaterThan(0);
    });

    it('should detect content > 64 KiB', () => {
      // Create a string larger than 64 KiB
      const largeString = 'x'.repeat(64 * 1024 + 1);
      expect(handler.getBlobSize(largeString)).toBeGreaterThan(BLOB_THRESHOLD_BYTES);
    });

    it('should detect content <= 64 KiB', () => {
      const smallString = 'x'.repeat(64 * 1024);
      expect(handler.getBlobSize(smallString)).toBe(BLOB_THRESHOLD_BYTES);
    });
  });

  describe('shouldConvertToBlob', () => {
    it('should return false for small content', () => {
      expect(handler.shouldConvertToBlob('small content')).toBe(false);
    });

    it('should return true for large content', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      expect(handler.shouldConvertToBlob(largeContent)).toBe(true);
    });

    it('should return false for null', () => {
      expect(handler.shouldConvertToBlob(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(handler.shouldConvertToBlob(undefined)).toBe(false);
    });
  });

  describe('convertToBlob', () => {
    it('should return small content unchanged', () => {
      const content = 'small content';
      expect(handler.convertToBlob(content)).toBe(content);
    });

    it('should convert large content to blob reference', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const result = handler.convertToBlob(largeContent);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });

    it('should convert large object to blob reference', () => {
      const largeObj = { data: 'x'.repeat(64 * 1024 + 1) };
      const result = handler.convertToBlob(largeObj);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });

    it('should produce deterministic blob references', () => {
      const content = 'x'.repeat(64 * 1024 + 1);
      const result1 = handler.convertToBlob(content);
      const result2 = handler.convertToBlob(content);
      expect(result1).toBe(result2);
    });
  });

  describe('processContent', () => {
    it('should handle null', () => {
      expect(handler.processContent(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(handler.processContent(undefined)).toBeUndefined();
    });

    it('should handle primitives unchanged', () => {
      expect(handler.processContent('string')).toBe('string');
      expect(handler.processContent(123)).toBe(123);
      expect(handler.processContent(true)).toBe(true);
    });

    it('should process array elements', () => {
      const smallArray = ['a', 'b', 'c'];
      expect(handler.processContent(smallArray)).toEqual(smallArray);
    });

    it('should convert large array elements to blobs', () => {
      const largeItem = 'x'.repeat(64 * 1024 + 1);
      const array = ['small', largeItem, 'another'];
      const result = handler.processContent(array) as string[];
      expect(result[0]).toBe('small');
      expect(result[1]).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
      expect(result[2]).toBe('another');
    });

    it('should process object values', () => {
      const obj = { key: 'value' };
      expect(handler.processContent(obj)).toEqual(obj);
    });

    it('should convert large object values to blobs', () => {
      const largeValue = 'x'.repeat(64 * 1024 + 1);
      const obj = { small: 'value', large: largeValue };
      const result = handler.processContent(obj) as Record<string, string>;
      expect(result.small).toBe('value');
      expect(result.large).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    });
  });

  describe('isBlobReference', () => {
    it('should return true for valid blob reference', () => {
      const validRef = 'blob://' + 'a'.repeat(64);
      expect(handler.isBlobReference(validRef)).toBe(true);
    });

    it('should return false for string not starting with blob://', () => {
      expect(handler.isBlobReference('not-a-blob')).toBe(false);
    });

    it('should return false for blob:// with wrong length', () => {
      expect(handler.isBlobReference('blob://abc')).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(handler.isBlobReference(123)).toBe(false);
      expect(handler.isBlobReference({})).toBe(false);
      expect(handler.isBlobReference(null)).toBe(false);
    });
  });

  describe('resolveBlob', () => {
    it('should return null for unknown blob reference', () => {
      const unknownRef = 'blob://' + 'a'.repeat(64);
      expect(handler.resolveBlob(unknownRef)).toBe(unknownRef);
    });

    it('should resolve known blob reference', () => {
      const content = 'x'.repeat(64 * 1024 + 1);
      const blobRef = handler.convertToBlob(content) as string;
      const resolved = handler.resolveBlob(blobRef as BlobReference);
      expect(resolved).toBe(content);
    });
  });

  describe('resolveContent', () => {
    it('should resolve in interactive mode', () => {
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = handler.convertToBlob(largeContent) as string;
      const resolved = handler.resolveContent(blobRef, true);
      expect(resolved).toBe(largeContent);
    });

    it('should keep blob reference in JSON mode when resolveInJsonMode=false', () => {
      const nonInteractiveHandler = new BlobHandler({ resolveInJsonMode: false });
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = nonInteractiveHandler.convertToBlob(largeContent) as string;
      const resolved = nonInteractiveHandler.resolveContent(blobRef, false);
      expect(resolved).toBe(blobRef);
      nonInteractiveHandler.clear();
    });

    it('should resolve in JSON mode when resolveInJsonMode=true', () => {
      const interactiveHandler = new BlobHandler({ resolveInJsonMode: true });
      const largeContent = 'x'.repeat(64 * 1024 + 1);
      const blobRef = interactiveHandler.convertToBlob(largeContent) as string;
      const resolved = interactiveHandler.resolveContent(blobRef, false);
      expect(resolved).toBe(largeContent);
      interactiveHandler.clear();
    });

    it('should resolve nested blob references in objects', () => {
      const largeValue = 'x'.repeat(64 * 1024 + 1);
      const obj = { 
        small: 'value',
        large: largeValue 
      };
      const processed = handler.processContent(obj) as Record<string, string>;
      const resolved = handler.resolveContent(processed, true) as Record<string, string>;
      expect(resolved.small).toBe('value');
      expect(resolved.large).toBe(largeValue);
    });

    it('should resolve nested blob references in arrays', () => {
      const largeItem = 'x'.repeat(64 * 1024 + 1);
      const array = ['small', largeItem];
      const processed = handler.processContent(array) as string[];
      const resolved = handler.resolveContent(processed, true) as string[];
      expect(resolved[0]).toBe('small');
      expect(resolved[1]).toBe(largeItem);
    });

    it('should handle null and undefined in resolveContent', () => {
      expect(handler.resolveContent(null, true)).toBeNull();
      expect(handler.resolveContent(undefined, true)).toBeUndefined();
    });
  });

  describe('createBlobHandler', () => {
    it('should create handler with options', () => {
      const h = createBlobHandler({ threshold: 512 });
      expect(h.getThreshold()).toBe(512);
      h.clear();
    });
  });
});

describe('BLOB_THRESHOLD_BYTES constant', () => {
  it('should be 64 KiB', () => {
    expect(BLOB_THRESHOLD_BYTES).toBe(64 * 1024);
  });
});
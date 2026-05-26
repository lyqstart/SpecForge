/**
 * Content-Addressable Storage (CAS) unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContentAddressableStorage } from '../../src/cas/ContentAddressableStorage';

describe('ContentAddressableStorage', () => {
  let cas: ContentAddressableStorage;

  beforeEach(() => {
    cas = new ContentAddressableStorage();
  });

  afterEach(async () => {
    // Clean up test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const casDir = home ? `${home}/specforge/cas` : '';
    // Note: In real tests, we would clean up the CAS directory
  });

  it('should calculate SHA-256 hash correctly', () => {
    const content = Buffer.from('test content');
    const hash = cas['calculateHash'](content);
    
    // Verify hash is 64 hex characters (SHA-256)
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('should store and retrieve a small blob', async () => {
    const content = Buffer.from('small test content');
    const reference = await cas.store(content);
    
    expect(reference.type).toBe('cas-blob');
    expect(reference.hash).toContain('sha256-');
    expect(reference.size).toBe(content.length);
    expect(reference.reference).toContain('cas://');
    
    const retrieved = await cas.retrieve(reference.reference);
    expect(retrieved).toEqual(content);
  });

  it('should return same reference for duplicate content', async () => {
    const content = Buffer.from('duplicate test content');
    const ref1 = await cas.store(content);
    const ref2 = await cas.store(content);
    
    expect(ref1.reference).toBe(ref2.reference);
  });

  it('should check if blob exists', async () => {
    const content = Buffer.from('exists test content');
    const reference = await cas.store(content);
    
    expect(await cas.exists(reference.reference)).toBe(true);
    expect(await cas.exists('cas://nonexistent')).toBe(false);
  });

  it('should process payload and return inline for small content', async () => {
    const content = Buffer.from('small content');
    const maxSize = 1024; // 1 KiB
    
    const result = await cas.processPayload(content, maxSize);
    
    expect(result).toEqual(content);
  });

  it('should process payload and return CAS reference for large content', async () => {
    // Create content larger than 64 KiB
    const largeContent = Buffer.alloc(65 * 1024, 'x');
    const maxSize = 64 * 1024; // 64 KiB
    
    const result = await cas.processPayload(largeContent, maxSize);
    
    expect((result as any).type).toBe('cas-blob');
    expect((result as any).hash).toContain('sha256-');
    expect((result as any).size).toBe(largeContent.length);
  });

  it('should detect when content exceeds max size', () => {
    const largeContent = Buffer.alloc(65 * 1024, 'x');
    const maxSize = 64 * 1024; // 64 KiB
    
    expect(cas.exceedsMaxSize(largeContent, maxSize)).toBe(true);
    expect(cas.exceedsMaxSize(Buffer.from('small'), maxSize)).toBe(false);
  });

  it('should handle empty content', async () => {
    const content = Buffer.from('');
    const reference = await cas.store(content);
    
    expect(reference.size).toBe(0);
    
    const retrieved = await cas.retrieve(reference.reference);
    expect(retrieved).toEqual(content);
  });

  it('should handle string content', async () => {
    const content = 'string test content';
    const reference = await cas.store(content);
    
    expect(reference.type).toBe('cas-blob');
    
    const retrieved = await cas.retrieve(reference.reference);
    expect(retrieved?.toString()).toBe(content);
  });
});

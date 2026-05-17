/**
 * CAS (Content-Addressable Storage) module
 * 
 * Implements Property 9: CAS Content Addressing
 * - store(content).id == "blob://" + sha256(content)
 * - Identical content produces identical blob IDs (deduplication)
 * - Different content produces different blob IDs
 * - Reference counting for garbage collection
 * 
 * Validates: Property 9, Requirements 30.9, 5.6, 14.2
 */

import { createHash } from 'crypto';
import { readFile, writeFile, unlink, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import type { CAS as ICAS } from '@/types';

/**
 * CAS Blob Reference format
 */
export const BLOB_REF_PREFIX = 'blob://';

/**
 * CAS Implementation
 * File-based content-addressable storage with reference counting
 */
export class CAS implements ICAS {
  private basePath: string;
  private referenceCounts: Map<string, number> = new Map();

  /**
   * Create a new CAS instance
   * @param basePath Base directory for blob storage (default: ./data/cas/blobs)
   */
  constructor(basePath: string = './data/cas/blobs') {
    this.basePath = basePath;
  }

  /**
   * Initialize the CAS storage directory
   */
  async initialize(): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
  }

  /**
   * Compute SHA-256 hash of content
   * @param content Binary or text content
   * @returns SHA-256 hash as hex string (64 characters)
   */
  private computeHash(content: Uint8Array | string): string {
    const hash = createHash('sha256');
    
    if (typeof content === 'string') {
      hash.update(content, 'utf8');
    } else {
      hash.update(content);
    }
    
    return hash.digest('hex');
  }

  /**
   * Extract hash from blob reference
   * @param ref Blob reference in format "blob://<sha256>"
   * @returns SHA-256 hash or null if invalid format
   */
  private extractHash(ref: string): string | null {
    if (!ref.startsWith(BLOB_REF_PREFIX)) {
      return null;
    }
    return ref.slice(BLOB_REF_PREFIX.length);
  }

  /**
   * Get the file path for a blob
   * @param hash SHA-256 hash
   * @returns File path for the blob
   */
  private getBlobPath(hash: string): string {
    // Use first 2 characters as subdirectory for better file system performance
    const subdir = hash.slice(0, 2);
    return join(this.basePath, subdir, hash);
  }

  /**
   * Get the reference count file path
   * @param hash SHA-256 hash
   * @returns Reference count file path
   */
  private getRefCountPath(hash: string): string {
    const subdir = hash.slice(0, 2);
    return join(this.basePath, subdir, `${hash}.refcount`);
  }

  /**
   * Store content in CAS
   * Returns blob reference: "blob://<sha256>"
   * 
   * Property 9.1: store(content).id == "blob://" + sha256(content)
   * Property 9.2: Identical content produces identical IDs
   * 
   * @param content Binary or text content to store
   * @returns Blob reference string
   */
  async store(content: Uint8Array | string): Promise<string> {
    // Compute SHA-256 hash of the content
    const hash = this.computeHash(content);
    const blobRef = BLOB_REF_PREFIX + hash;
    const blobPath = this.getBlobPath(hash);
    
    // Check if blob already exists (deduplication)
    try {
      const exists = await this.exists(blobRef);
      if (exists) {
        // Increment reference count
        await this.incrementRefCount(hash);
        return blobRef;
      }
    } catch {
      // Blob doesn't exist, proceed to create it
    }
    
    // Ensure directory exists
    await mkdir(dirname(blobPath), { recursive: true });
    
    // Write blob content
    if (typeof content === 'string') {
      await writeFile(blobPath, content, 'utf8');
    } else {
      await writeFile(blobPath, Buffer.from(content));
    }
    
    // Initialize reference count to 1
    await this.setRefCount(hash, 1);
    
    return blobRef;
  }

  /**
   * Retrieve content from CAS
   * 
   * @param ref Blob reference in format "blob://<sha256>"
   * @returns Content as Uint8Array or string, or null if not found
   */
  async retrieve(ref: string): Promise<Uint8Array | string | null> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return null;
    }
    
    const blobPath = this.getBlobPath(hash);
    
    try {
      // Check if blob exists
      const blobStat = await stat(blobPath);
      if (!blobStat.isFile()) {
        return null;
      }
      
      // Read content as buffer and try to determine if it's text or binary
      const buffer = await readFile(blobPath);
      
      // Check if content is likely text (UTF-8 encoded)
      // Simple heuristic: check for valid UTF-8 encoding
      try {
        const text = buffer.toString('utf8');
        // Verify it's valid UTF-8 by checking for replacement characters
        if (!buffer.includes(0xFFFD)) {
          return text;
        }
      } catch {
        // Not valid UTF-8, return as binary
      }
      
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  /**
   * Check if a blob exists in CAS
   * 
   * @param ref Blob reference in format "blob://<sha256>"
   * @returns True if blob exists
   */
  async exists(ref: string): Promise<boolean> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return false;
    }
    
    const blobPath = this.getBlobPath(hash);
    
    try {
      const blobStat = await stat(blobPath);
      return blobStat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Delete a blob reference
   * Uses reference counting - only deletes the actual blob when count reaches 0
   * 
   * @param ref Blob reference in format "blob://<sha256>"
   */
  async delete(ref: string): Promise<void> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return;
    }
    
    // Decrement reference count
    const newCount = await this.decrementRefCount(hash);
    
    // If reference count reached 0, delete the actual blob
    if (newCount <= 0) {
      const blobPath = this.getBlobPath(hash);
      const refCountPath = this.getRefCountPath(hash);
      
      try {
        await unlink(blobPath);
      } catch {
        // Blob file might not exist
      }
      
      try {
        await unlink(refCountPath);
      } catch {
        // Refcount file might not exist
      }
      
      this.referenceCounts.delete(hash);
    }
  }

  /**
   * Get reference count for a blob
   * 
   * @param hash SHA-256 hash
   * @returns Current reference count, or 0 if not found
   */
  async getRefCount(hash: string): Promise<number> {
    // Check memory cache first
    if (this.referenceCounts.has(hash)) {
      return this.referenceCounts.get(hash)!;
    }
    
    const refCountPath = this.getRefCountPath(hash);
    
    try {
      const content = await readFile(refCountPath, 'utf8');
      const count = parseInt(content.trim(), 10);
      this.referenceCounts.set(hash, count);
      return isNaN(count) ? 0 : count;
    } catch {
      return 0;
    }
  }

  /**
   * Set reference count for a blob
   * 
   * @param hash SHA-256 hash
   * @param count New reference count
   */
  private async setRefCount(hash: string, count: number): Promise<void> {
    this.referenceCounts.set(hash, count);
    const refCountPath = this.getRefCountPath(hash);
    await mkdir(dirname(refCountPath), { recursive: true });
    await writeFile(refCountPath, count.toString(), 'utf8');
  }

  /**
   * Increment reference count for a blob
   * 
   * @param hash SHA-256 hash
   * @returns New reference count
   */
  private async incrementRefCount(hash: string): Promise<number> {
    const currentCount = await this.getRefCount(hash);
    const newCount = currentCount + 1;
    await this.setRefCount(hash, newCount);
    return newCount;
  }

  /**
   * Decrement reference count for a blob
   * 
   * @param hash SHA-256 hash
   * @returns New reference count after decrement
   */
  private async decrementRefCount(hash: string): Promise<number> {
    const currentCount = await this.getRefCount(hash);
    const newCount = Math.max(0, currentCount - 1);
    await this.setRefCount(hash, newCount);
    return newCount;
  }

  /**
   * Perform garbage collection - delete blobs with zero reference count
   * 
   * @returns Number of blobs deleted
   */
  async garbageCollect(): Promise<number> {
    let deletedCount = 0;
    
    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const subdirPath = join(this.basePath, entry.name);
        const files = await readdir(subdirPath);
        
        for (const file of files) {
          // Skip reference count files
          if (file.endsWith('.refcount')) continue;
          
          const filePath = join(subdirPath, file);
          const hash = file;
          
          const count = await this.getRefCount(hash);
          if (count <= 0) {
            try {
              await unlink(filePath);
              deletedCount++;
            } catch {
              // File might not exist
            }
            
            // Also delete refcount file if exists
            try {
              await unlink(join(subdirPath, `${hash}.refcount`));
            } catch {
              // File might not exist
            }
          }
        }
      }
    } catch {
      // Directory might not exist
    }
    
    return deletedCount;
  }

  /**
   * Get storage statistics
   * 
   * @returns Object with blob count and total size
   */
  async getStats(): Promise<{ blobCount: number; totalSize: number }> {
    let blobCount = 0;
    let totalSize = 0;
    
    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const subdirPath = join(this.basePath, entry.name);
        const files = await readdir(subdirPath);
        
        for (const file of files) {
          // Skip reference count files
          if (file.endsWith('.refcount')) continue;
          
          const filePath = join(subdirPath, file);
          try {
            const stats = await stat(filePath);
            if (stats.isFile()) {
              blobCount++;
              totalSize += stats.size;
            }
          } catch {
            // File might not exist
          }
        }
      }
    } catch {
      // Directory might not exist
    }
    
    return { blobCount, totalSize };
  }
}

/**
 * Create a CAS instance with default configuration
 * 
 * @param basePath Optional base path for storage
 * @returns Configured CAS instance
 */
export function createCAS(basePath?: string): CAS {
  return new CAS(basePath);
}

export { BLOB_REF_PREFIX as BLOB_REFERENCE_PREFIX };
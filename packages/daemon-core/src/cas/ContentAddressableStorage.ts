/**
 * Content-Addressable Storage (CAS) implementation
 * 
 * Stores and retrieves blobs by their SHA-256 hash.
 * Used for payloads exceeding 64 KiB to avoid inline data in events.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CASBlobReference {
  type: 'cas-blob';
  hash: string;
  size: number;
  reference: string;
}

export class ContentAddressableStorage {
  private readonly storageDir: string;

  constructor() {
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    this.storageDir = home ? path.join(home, '.specforge', 'cas') : '';
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(content: Buffer | string): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Get the storage path for a blob
   */
  private getBlobPath(hash: string): string {
    // Use first 2 characters as subdirectory for better file system performance
    const prefix = hash.substring(0, 2);
    return path.join(this.storageDir, prefix, hash);
  }

  /**
   * Store a blob in CAS
   */
  async store(content: Buffer | string): Promise<CASBlobReference> {
    // Ensure storage directory exists
    await fs.mkdir(this.storageDir, { recursive: true });

    const hash = this.calculateHash(content);
    const blobPath = this.getBlobPath(hash);

    try {
      // Check if blob already exists
      await fs.access(blobPath);
      // Blob already exists, return reference
    } catch (error) {
      // Blob doesn't exist, store it
      await fs.mkdir(path.dirname(blobPath), { recursive: true });
      await fs.writeFile(blobPath, content);
    }

    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);

    return {
      type: 'cas-blob',
      hash: `sha256-${hash}`,
      size,
      reference: `cas://${hash}`,
    };
  }

  /**
   * Retrieve a blob from CAS
   */
  async retrieve(reference: string): Promise<Buffer | null> {
    // Parse reference format: cas://<hash>
    if (!reference.startsWith('cas://')) {
      return null;
    }

    const hash = reference.substring(6); // Remove 'cas://'
    const blobPath = this.getBlobPath(hash);

    try {
      return await fs.readFile(blobPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a blob exists in CAS
   */
  async exists(reference: string): Promise<boolean> {
    const buffer = await this.retrieve(reference);
    return buffer !== null;
  }

  /**
   * Process payload and return appropriate response
   * - For payloads <= 64 KiB: return inline data
   * - For payloads > 64 KiB: store in CAS and return reference
   */
  async processPayload(content: Buffer | string, maxSize: number): Promise<Buffer | string | CASBlobReference> {
    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);

    if (size <= maxSize) {
      return content;
    }

    // Payload exceeds max size, store in CAS
    return await this.store(content);
  }

  /**
   * Check if content exceeds max size
   */
  exceedsMaxSize(content: Buffer | string, maxSize: number): boolean {
    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);
    return size > maxSize;
  }
}

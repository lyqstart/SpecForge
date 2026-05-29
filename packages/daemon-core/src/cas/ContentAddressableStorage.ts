/**
 * Content-Addressable Storage (CAS) implementation
 * 
 * Stores and retrieves blobs by their SHA-256 hash.
 * Used for payloads exceeding 64 KiB to avoid inline data in events.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SPEC_DIR_NAME, resolveProjectPath } from '@specforge/types/directory-layout';

export interface CASBlobReference {
  type: 'cas-blob';
  hash: string;
  size: number;
  reference: string;
}

export class ContentAddressableStorage {
  private readonly storageDir: string;

  constructor(baseDir?: string) {
    const dir = baseDir || process.cwd();
    this.storageDir = resolveProjectPath(dir, 'cas');
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
   * Get the storage path for a blob using two-level directory structure
   * {sha256[:2]}/{sha256[2:]} to avoid too many files in a single directory
   */
  private getBlobPath(hash: string): string {
    const prefix = hash.substring(0, 2);
    const suffix = hash.substring(2);
    return path.join(this.storageDir, prefix, suffix);
  }

  /**
   * Store a blob in CAS
   * Returns a blob://sha256hash reference
   * Automatically deduplicates: same content returns the same reference
   */
  async store(content: Buffer | string): Promise<CASBlobReference> {
    await fs.mkdir(this.storageDir, { recursive: true });

    const hash = this.calculateHash(content);
    const blobPath = this.getBlobPath(hash);

    try {
      // Check if blob already exists (dedup)
      await fs.access(blobPath);
    } catch {
      // Blob doesn't exist, store it
      await fs.mkdir(path.dirname(blobPath), { recursive: true });
      await fs.writeFile(blobPath, content);
    }

    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);

    return {
      type: 'cas-blob',
      hash,
      size,
      reference: `blob://${hash}`,
    };
  }

  /**
   * Retrieve a blob from CAS by blob reference
   * Reference format: blob://<sha256hash>
   */
  async retrieve(blobRef: string): Promise<Buffer | null> {
    // Parse reference format: blob://<hash>
    if (!blobRef.startsWith('blob://')) {
      return null;
    }

    const hash = blobRef.substring(7); // Remove 'blob://'
    const blobPath = this.getBlobPath(hash);

    try {
      return await fs.readFile(blobPath);
    } catch {
      return null;
    }
  }

  /**
   * Check if a blob with the given hash exists in CAS
   */
  async exists(hash: string): Promise<boolean> {
    const blobPath = this.getBlobPath(hash);
    try {
      await fs.access(blobPath);
      return true;
    } catch {
      return false;
    }
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

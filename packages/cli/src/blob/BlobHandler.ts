/**
 * BlobHandler - Handles large content thresholding and blob reference management.
 * 
 * Implements Property 17: Payload Size Thresholding
 * - Content > 64 KiB is converted to blob://<sha256> references
 * - Interactive mode resolves blob references for display
 * - JSON mode keeps blob references unchanged
 */

import { createHash, Hash } from 'crypto';

/**
 * Threshold for blob conversion (64 KiB in bytes)
 */
export const BLOB_THRESHOLD_BYTES = 64 * 1024;

/**
 * Blob reference type
 */
export type BlobReference = `blob://${string}`;

/**
 * Result of processing content - either original or blob reference
 */
export type ProcessedContent = unknown;

/**
 * Options for BlobHandler
 */
export interface BlobHandlerOptions {
  /** Threshold in bytes (default: 64 KiB) */
  threshold?: number;
  /** Resolve blobs in JSON mode (default: false) */
  resolveInJsonMode?: boolean;
}

/**
 * Internal blob storage (in production, this would connect to CAS)
 * Maps blob references to their actual content
 */
class BlobStore {
  private blobs = new Map<string, unknown>();

  /**
   * Store content and return blob reference
   */
  store(content: unknown): BlobReference {
    const sha256 = this.computeSha256(content);
    this.blobs.set(sha256, content);
    return `blob://${sha256}` as BlobReference;
  }

  /**
   * Retrieve content by blob reference
   */
  retrieve(ref: BlobReference): unknown | null {
    const sha256 = ref.replace('blob://', '');
    return this.blobs.get(sha256) ?? null;
  }

  /**
   * Check if blob exists
   */
  has(ref: BlobReference): boolean {
    const sha256 = ref.replace('blob://', '');
    return this.blobs.has(sha256);
  }

  /**
   * Compute SHA256 hash of content
   */
  private computeSha256(content: unknown): string {
    const serialized = typeof content === 'string' ? content : JSON.stringify(content);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Clear all stored blobs (for testing)
   */
  clear(): void {
    this.blobs.clear();
  }
}

/**
 * BlobHandler class
 */
export class BlobHandler {
  private readonly threshold: number;
  private readonly resolveInJsonMode: boolean;
  private readonly blobStore: BlobStore;

  constructor(options: BlobHandlerOptions = {}) {
    this.threshold = options.threshold ?? BLOB_THRESHOLD_BYTES;
    this.resolveInJsonMode = options.resolveInJsonMode ?? false;
    this.blobStore = new BlobStore();
  }

  /**
   * Check if content should be converted to blob reference
   */
  shouldConvertToBlob(content: unknown): boolean {
    return this.getBlobSize(content) > this.threshold;
  }

  /**
   * Get the size of content in bytes
   */
  getBlobSize(content: unknown): number {
    if (content === null || content === undefined) {
      return 0;
    }

    if (typeof content === 'string') {
      // Count UTF-8 bytes
      return new TextEncoder().encode(content).length;
    }

    if (typeof content === 'number' || typeof content === 'boolean') {
      // Primitive types - serialize to estimate
      return new TextEncoder().encode(String(content)).length;
    }

    // Objects, arrays, etc - serialize to JSON
    const serialized = JSON.stringify(content);
    return new TextEncoder().encode(serialized).length;
  }

  /**
   * Convert content to blob reference if it exceeds threshold
   * Returns original content if below threshold
   */
  convertToBlob(content: unknown): ProcessedContent {
    if (!this.shouldConvertToBlob(content)) {
      return content;
    }
    return this.blobStore.store(content);
  }

  /**
   * Process content, converting large items to blob references
   * Handles nested objects and arrays
   */
  processContent(content: unknown): ProcessedContent {
    if (content === null || content === undefined) {
      return content;
    }

    // Handle strings - direct size check
    if (typeof content === 'string') {
      return this.convertToBlob(content);
    }

    // Handle primitives
    if (typeof content !== 'object') {
      return content;
    }

    // Handle arrays - process each element
    if (Array.isArray(content)) {
      return content.map(item => this.processContent(item));
    }

    // Handle objects - process each value
    const processed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      processed[key] = this.processContent(value);
    }
    return processed;
  }

  /**
   * Resolve a blob reference to its actual content
   * Returns the reference if content not found
   */
  resolveBlob(ref: BlobReference): unknown {
    const content = this.blobStore.retrieve(ref);
    return content ?? ref;
  }

  /**
   * Check if a string is a valid blob reference
   */
  isBlobReference(value: unknown): value is BlobReference {
    if (typeof value !== 'string') {
      return false;
    }
    return value.startsWith('blob://') && value.length === 7 + 64; // 'blob://' + 64-char hex
  }

  /**
   * Resolve all blob references in content
   * Interactive mode: fully resolve to show actual content
   * JSON mode: optionally keep references
   */
  resolveContent(content: unknown, interactive: boolean): ProcessedContent {
    // In JSON mode with resolveInJsonMode=false, keep blob references
    if (!interactive && !this.resolveInJsonMode) {
      return content;
    }

    if (content === null || content === undefined) {
      return content;
    }

    // Handle strings - check if it's a blob reference
    if (typeof content === 'string') {
      if (this.isBlobReference(content)) {
        return this.resolveBlob(content);
      }
      return content;
    }

    // Handle primitives - no change needed
    if (typeof content !== 'object') {
      return content;
    }

    // Handle arrays - resolve each element
    if (Array.isArray(content)) {
      return content.map(item => this.resolveContent(item, interactive));
    }

    // Handle objects - resolve each value
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      resolved[key] = this.resolveContent(value, interactive);
    }
    return resolved;
  }

  /**
   * Get the threshold value
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Clear blob store (for testing)
   */
  clear(): void {
    this.blobStore.clear();
  }
}

/**
 * Create a BlobHandler with default settings
 */
export function createBlobHandler(options?: BlobHandlerOptions): BlobHandler {
  return new BlobHandler(options);
}
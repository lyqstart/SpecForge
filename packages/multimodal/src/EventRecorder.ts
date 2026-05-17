/**
 * Event Recording Integration
 * 
 * Integrates with observability module's CAS (Content-Addressable Storage)
 * to record UserMessage events and retrieve them by hash.
 * 
 * Implements Property 9: CAS Content Addressing
 * - store(content).id == "blob://" + sha256(content)
 * - Identical content produces identical blob IDs
 * - Different content produces different blob IDs
 * 
 * Validates: Requirements 14.2, 14.6, 30.9
 * Feature: multimodal, Requirement: Event recording integration
 */

import type { UserMessage } from './types/user-message.js';
import type { CASClient } from './cas-types.js';
import { createHash } from 'crypto';

/**
 * Result of recording a UserMessage
 */
export interface RecordingResult {
  /** CAS blob reference (format: blob://<sha256>) */
  blobRef: string;
  /** SHA-256 hash of the serialized message */
  hash: string;
  /** Timestamp when recorded */
  recordedAt: number;
}

/**
 * Query result for a recorded UserMessage
 */
export interface QueryResult {
  /** The retrieved UserMessage */
  message: UserMessage;
  /** CAS blob reference */
  blobRef: string;
  /** SHA-256 hash */
  hash: string;
  /** Timestamp when originally recorded */
  recordedAt: number;
}

/**
 * EventRecorder class for recording and querying UserMessage events
 * 
 * Manages the lifecycle of event recording with proper async resource cleanup.
 * Follows async-resource-coding-standards.md rules:
 * - A1: Proper cleanup of resources in finally blocks
 * - A4: Creator (EventRecorder) is responsible for resource cleanup
 */
export class EventRecorder {
  private cas: CASClient;
  private recordingCache: Map<string, { message: UserMessage; recordedAt: number }> = new Map();
  private isInitialized = false;
  private activeOperations = new Set<Promise<unknown>>();

  /**
   * Create a new EventRecorder instance
   * 
   * @param cas CASClient instance for blob storage
   */
  constructor(cas: CASClient) {
    this.cas = cas;
  }

  /**
   * Initialize the EventRecorder
   * Must be called before using recordUserMessage or queryByHash
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // CASClient doesn't require explicit initialization in the interface
    // but we mark as initialized to track state
    this.isInitialized = true;
  }

  /**
   * Record a UserMessage to CAS
   * 
   * Property 9: CAS Content Addressing
   * - Returns blob reference in format "blob://<sha256>"
   * - Identical messages produce identical blob references
   * - Different messages produce different blob references
   * 
   * Async Resource Rules (async-resource-coding-standards.md):
   * - C1: No Promise.race without finally cleanup
   * - C4: Returns resource that caller must manage
   * 
   * @param message UserMessage to record
   * @returns RecordingResult with blob reference and hash
   * @throws Error if CAS operation fails
   */
  async recordUserMessage(message: UserMessage): Promise<RecordingResult> {
    if (!this.isInitialized) {
      throw new Error('EventRecorder not initialized. Call initialize() first.');
    }

    const recordingPromise = this.performRecording(message);
    this.activeOperations.add(recordingPromise);

    try {
      const result = await recordingPromise;
      return result;
    } finally {
      this.activeOperations.delete(recordingPromise);
    }
  }

  /**
   * Internal method to perform the actual recording
   * Separated for cleaner async resource management
   */
  private async performRecording(message: UserMessage): Promise<RecordingResult> {
    // Serialize the message to JSON
    const serialized = JSON.stringify(message);
    const recordedAt = Date.now();

    // Convert string to Uint8Array for CAS storage
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(serialized);

    // Store in CAS
    let blobRef: string;
    try {
      blobRef = await this.cas.store(contentBytes);
    } catch (error) {
      throw new Error(
        `Failed to store UserMessage in CAS: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Extract hash from blob reference (format: blob://<sha256>)
    const hash = this.extractHashFromBlobRef(blobRef);

    // Cache the message for quick retrieval
    this.recordingCache.set(hash, { message, recordedAt });

    return {
      blobRef,
      hash,
      recordedAt,
    };
  }

  /**
   * Query a recorded UserMessage by its hash
   * 
   * Property 9: CAS Content Addressing
   * - Retrieves content by SHA-256 hash
   * - Returns null if hash not found
   * 
   * Async Resource Rules (async-resource-coding-standards.md):
   * - C4: Returns resource that caller must manage
   * 
   * @param hash SHA-256 hash of the message
   * @returns QueryResult if found, null if not found
   * @throws Error if CAS operation fails
   */
  async queryByHash(hash: string): Promise<QueryResult | null> {
    if (!this.isInitialized) {
      throw new Error('EventRecorder not initialized. Call initialize() first.');
    }

    // Check cache first
    const cached = this.recordingCache.get(hash);
    if (cached) {
      return {
        message: cached.message,
        blobRef: `blob://${hash}`,
        hash,
        recordedAt: cached.recordedAt,
      };
    }

    const queryPromise = this.performQuery(hash);
    this.activeOperations.add(queryPromise);

    try {
      const result = await queryPromise;
      return result;
    } finally {
      this.activeOperations.delete(queryPromise);
    }
  }

  /**
   * Internal method to perform the actual query
   * Separated for cleaner async resource management
   */
  private async performQuery(hash: string): Promise<QueryResult | null> {
    const blobRef = `blob://${hash}` as const;

    // Check if blob exists in CAS
    let exists: boolean;
    try {
      exists = await this.cas.exists(blobRef as any);
    } catch (error) {
      throw new Error(
        `Failed to check CAS for blob ${blobRef}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!exists) {
      return null;
    }

    // Retrieve content from CAS
    let content: Uint8Array;
    try {
      content = await this.cas.retrieve(blobRef as any);
    } catch (error) {
      throw new Error(
        `Failed to retrieve blob ${blobRef} from CAS: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!content) {
      return null;
    }

    // Parse the content back to UserMessage
    let message: UserMessage;
    try {
      const jsonString = new TextDecoder().decode(content);
      message = JSON.parse(jsonString) as UserMessage;
    } catch (error) {
      throw new Error(
        `Failed to parse UserMessage from CAS: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Cache the message for future queries
    // Note: We don't have the original recordedAt, so we use current time as approximation
    // In production, this should be stored with the blob
    const recordedAt = Date.now();
    this.recordingCache.set(hash, { message, recordedAt });

    return {
      message,
      blobRef: `blob://${hash}`,
      hash,
      recordedAt,
    };
  }

  /**
   * Extract SHA-256 hash from blob reference
   * 
   * @param blobRef Blob reference in format "blob://<sha256>"
   * @returns SHA-256 hash (64 hex characters)
   * @throws Error if blob reference format is invalid
   */
  private extractHashFromBlobRef(blobRef: string): string {
    const prefix = 'blob://';
    if (!blobRef.startsWith(prefix)) {
      throw new Error(`Invalid blob reference format: ${blobRef}`);
    }

    const hash = blobRef.slice(prefix.length);

    // Validate hash format (should be 64 hex characters for SHA-256)
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Invalid SHA-256 hash in blob reference: ${hash}`);
    }

    return hash;
  }

  /**
   * Verify that a UserMessage matches its hash
   * 
   * Property 9: CAS Content Addressing
   * - Verifies that store(content).id == "blob://" + sha256(content)
   * 
   * @param message UserMessage to verify
   * @param hash Expected SHA-256 hash
   * @returns true if message matches hash, false otherwise
   */
  verifyMessageHash(message: UserMessage, hash: string): boolean {
    const serialized = JSON.stringify(message);
    const computedHash = this.computeSHA256(serialized);
    return computedHash === hash;
  }

  /**
   * Compute SHA-256 hash of content
   * 
   * @param content Content to hash
   * @returns SHA-256 hash as hex string (64 characters)
   */
  private computeSHA256(content: string): string {
    const hash = createHash('sha256');
    hash.update(content, 'utf8');
    return hash.digest('hex');
  }

  /**
   * Get the number of active async operations
   * Used for testing and resource cleanup verification
   * 
   * @internal
   */
  _getActiveOperationCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Get the cache size
   * Used for testing
   * 
   * @internal
   */
  _getCacheSize(): number {
    return this.recordingCache.size;
  }

  /**
   * Clear the recording cache
   * Useful for testing and memory management
   */
  clearCache(): void {
    this.recordingCache.clear();
  }

  /**
   * Dispose of the EventRecorder
   * 
   * Async Resource Rules (async-resource-coding-standards.md):
   * - A4: Creator is responsible for cleanup
   * - Must be called in finally block to ensure cleanup
   * 
   * Waits for all active operations to complete before returning.
   */
  async dispose(): Promise<void> {
    // Wait for all active operations to complete
    if (this.activeOperations.size > 0) {
      await Promise.all(Array.from(this.activeOperations));
    }

    // Clear cache
    this.recordingCache.clear();

    // Mark as uninitialized
    this.isInitialized = false;
  }
}

/**
 * Create an EventRecorder instance with a CASClient
 * 
 * @param cas CASClient instance for blob storage
 * @returns Configured EventRecorder instance
 */
export function createEventRecorder(cas: CASClient): EventRecorder {
  return new EventRecorder(cas);
}

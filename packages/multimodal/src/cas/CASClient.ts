/**
 * CAS (Content-Addressable Storage) Client Interface
 * 
 * Provides blob storage and retrieval operations for multimodal content.
 * All blobs are referenced by SHA-256 hash.
 * 
 * Validates: Requirements 14.2, 30.9
 * Feature: multimodal, Property 9: CAS Content Addressing
 */

import type { BlobRef } from "../types/blob-ref.js";

/**
 * CAS Client interface for blob storage and retrieval
 * 
 * Property 9 (CAS Content Addressing): store(content).id === "blob://" + sha256(content)
 */
export interface CASClient {
  /**
   * Store content in CAS and return a blob reference
   * @param content - Binary content to store
   * @returns Promise resolving to BlobRef
   */
  store(content: Uint8Array): Promise<BlobRef>;
  
  /**
   * Retrieve content from CAS by blob reference
   * @param ref - Blob reference
   * @returns Promise resolving to stored content
   */
  retrieve(ref: BlobRef): Promise<Uint8Array>;
  
  /**
   * Check if a blob reference exists in CAS
   * @param ref - Blob reference to check
   * @returns Promise resolving to boolean
   */
  exists(ref: BlobRef): Promise<boolean>;
}

/**
 * Error thrown when blob is not found in CAS
 */
export class BlobNotFoundError extends Error {
  constructor(public readonly blobRef: BlobRef) {
    super(`Blob not found: ${blobRef}`);
    this.name = "BlobNotFoundError";
  }
}

/**
 * Error thrown when CAS operation fails
 */
export class CASError extends Error {
  constructor(
    message: string,
    public readonly operation: "store" | "retrieve" | "exists",
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "CASError";
  }
}
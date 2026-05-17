/**
 * Property 9 Verification Helpers
 * 
 * Provides verification utilities for CAS Content Addressing property.
 * 
 * Property 9: CAS Content Addressing
 * - store(content).id === "blob://" + sha256(content)
 * - Identical content produces identical BlobRef
 * - Different content produces different BlobRef (collision probability check)
 * 
 * Validates: Requirements 30.9, 5.6, 14.2
 * Feature: multimodal, Property 9: CAS Content Addressing; 
 * Derived-From: v6-architecture-overview Property 9
 */

import { createBlobRef, extractHash, isBlobRef, type BlobRef } from "../types/blob-ref.js";

/**
 * Compute SHA-256 hash of content
 * @param content - Binary content to hash
 * @returns SHA-256 hash as hex string
 */
export async function computeSHA256(content: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify Property 9: CAS Content Addressing
 * 
 * Checks that the given BlobRef follows the expected format:
 * - Format is "blob://<sha256>"
 * - The hash matches the content
 * 
 * @param content - Original content
 * @param blobRef - Blob reference to verify
 * @returns true if the blobRef is correct
 */
export async function verifyBlobRef(content: Uint8Array, blobRef: BlobRef): Promise<boolean> {
  // Verify format
  if (!isBlobRef(blobRef)) {
    return false;
  }
  
  // Compute expected hash
  const expectedHash = await computeSHA256(content);
  const actualHash = extractHash(blobRef);
  
  return actualHash === expectedHash;
}

/**
 * Verify that identical content produces identical BlobRef
 * 
 * @param contents - Array of identical content arrays
 * @param blobRefs - Array of corresponding BlobRefs
 * @returns true if all BlobRefs are identical
 */
export function verifyIdenticalContentProducesIdenticalRef(
  contents: Uint8Array[],
  blobRefs: BlobRef[]
): boolean {
  if (contents.length !== blobRefs.length || contents.length === 0) {
    return false;
  }
  
  // All BlobRefs should be identical for identical content
  const firstRef = blobRefs[0];
  return blobRefs.every(ref => ref === firstRef);
}

/**
 * Verify that different content produces different BlobRefs
 * 
 * @param contents - Array of different content
 * @param blobRefs - Array of corresponding BlobRefs
 * @returns true if all BlobRefs are different
 */
export function verifyDifferentContentProducesDifferentRef(
  contents: Uint8Array[],
  blobRefs: BlobRef[]
): boolean {
  if (contents.length !== blobRefs.length || contents.length < 2) {
    return false;
  }
  
  // All BlobRefs should be different for different content
  const uniqueRefs = new Set(blobRefs);
  return uniqueRefs.size === blobRefs.length;
}

/**
 * Create a mock CAS client for testing purposes
 * In-memory implementation that stores blobs in a Map
 */
export class InMemoryCASClient {
  private blobs: Map<string, Uint8Array> = new Map();
  
  async store(content: Uint8Array): Promise<BlobRef> {
    const hash = await computeSHA256(content);
    const ref = createBlobRef(hash);
    this.blobs.set(hash, content);
    return ref;
  }
  
  async retrieve(ref: BlobRef): Promise<Uint8Array> {
    const hash = extractHash(ref);
    const content = this.blobs.get(hash);
    if (!content) {
      throw new Error(`Blob not found: ${ref}`);
    }
    return content;
  }
  
  async exists(ref: BlobRef): Promise<boolean> {
    const hash = extractHash(ref);
    return this.blobs.has(hash);
  }
}

/**
 * Generate random content for testing
 * @param size - Size of content in bytes
 * @returns Random Uint8Array
 */
export function generateRandomContent(size: number): Uint8Array {
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Convert string to Uint8Array
 * @param str - String to convert
 * @returns Uint8Array representation
 */
export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string
 * @param array - Uint8Array to convert
 * @returns String representation
 */
export function uint8ArrayToString(array: Uint8Array): string {
  return new TextDecoder().decode(array);
}
/**
 * Blob Reference Type
 * 
 * Defines the content-addressable storage reference format.
 * 
 * Validates: Requirements 14.2
 * Feature: multimodal, Requirement: CAS Content Addressing
 */

/**
 * Blob reference in CAS format
 * Format: blob://<sha256 hex>
 * 
 * Property 9 (CAS Content Addressing): store(content).id === "blob://" + sha256(content)
 */
export type BlobRef = `blob://${string}`;

/**
 * Create a blob reference from a sha256 hash
 */
export function createBlobRef(sha256Hash: string): BlobRef {
  return `blob://${sha256Hash}`;
}

/**
 * Check if a string is a valid blob reference
 */
export function isBlobRef(value: unknown): value is BlobRef {
  return typeof value === "string" && value.startsWith("blob://");
}

/**
 * Extract the hash from a blob reference
 */
export function extractHash(blobRef: BlobRef): string {
  return blobRef.replace("blob://", "");
}
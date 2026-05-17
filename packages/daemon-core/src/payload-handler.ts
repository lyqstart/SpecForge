/**
 * Payload Handler
 * 
 * Handles payload size detection and CAS blob reference generation.
 * Payloads <= 64 KiB are returned as inline references.
 * Payloads > 64 KiB are stored in CAS and returned as blob references.
 */

import * as crypto from 'crypto';
import { ContentAddressableStorage } from './cas';

/**
 * Payload reference type
 * - inline: payload is small enough to be included directly
 * - cas: payload is stored in Content-Addressable Storage
 */
export interface PayloadRef {
  type: 'inline' | 'cas';
  value: string | BlobRef;
}

/**
 * CAS blob reference
 * Format: blob://<sha256>
 */
export interface BlobRef {
  reference: string;
  hash: string;
  size: number;
}

/**
 * Payload handler error
 */
export class PayloadHandlerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PayloadHandlerError';
  }
}

/**
 * Handle payload and return appropriate reference
 * 
 * @param data The payload data as Buffer
 * @param maxSize Maximum size for inline payloads (default: 64 KiB)
 * @returns PayloadRef with inline or CAS reference
 * @throws PayloadHandlerError if payload is invalid
 */
export async function handlePayload(
  data: Buffer,
  maxSize: number = 64 * 1024
): Promise<PayloadRef> {
  // Validate input
  if (!Buffer.isBuffer(data)) {
    throw new PayloadHandlerError(
      'Payload must be a Buffer',
      'INVALID_PAYLOAD_TYPE',
      { receivedType: typeof data }
    );
  }

  // Check for empty payload
  if (data.length === 0) {
    throw new PayloadHandlerError(
      'Payload cannot be empty',
      'EMPTY_PAYLOAD',
      { size: 0 }
    );
  }

  // Check payload size
  if (data.length <= maxSize) {
    // Small payload - return inline reference
    return {
      type: 'inline',
      value: data.toString('base64'),
    };
  }

  // Large payload - generate CAS reference
  try {
    const blobRef = await generateCASReference(data);
    return {
      type: 'cas',
      value: blobRef,
    };
  } catch (error) {
    throw new PayloadHandlerError(
      `Failed to generate CAS reference: ${error instanceof Error ? error.message : String(error)}`,
      'CAS_GENERATION_FAILED',
      { size: data.length, maxSize }
    );
  }
}

/**
 * Generate CAS blob reference for payload
 * 
 * @param data The payload data
 * @returns BlobRef with CAS reference
 */
async function generateCASReference(data: Buffer): Promise<BlobRef> {
  // Calculate SHA-256 hash
  const hash = calculateSHA256(data);

  // Store in CAS
  const cas = new ContentAddressableStorage();
  const casBlob = await cas.store(data);

  return {
    reference: `blob://${hash}`,
    hash: `sha256-${hash}`,
    size: data.length,
  };
}

/**
 * Calculate SHA-256 hash of data
 * 
 * @param data The data to hash
 * @returns Hex-encoded SHA-256 hash
 */
function calculateSHA256(data: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Validate payload reference
 * 
 * @param ref The payload reference to validate
 * @returns true if reference is valid
 */
export function validatePayloadRef(ref: PayloadRef): boolean {
  if (!ref || typeof ref !== 'object') {
    return false;
  }

  if (ref.type === 'inline') {
    return typeof ref.value === 'string';
  }

  if (ref.type === 'cas') {
    const blobRef = ref.value as BlobRef;
    return (
      typeof blobRef === 'object' &&
      typeof blobRef.reference === 'string' &&
      blobRef.reference.startsWith('blob://') &&
      typeof blobRef.hash === 'string' &&
      blobRef.hash.startsWith('sha256-') &&
      typeof blobRef.size === 'number' &&
      blobRef.size > 0
    );
  }

  return false;
}

/**
 * Extract payload from reference
 * 
 * @param ref The payload reference
 * @returns The original payload data or null if CAS reference
 */
export function extractPayload(ref: PayloadRef): Buffer | null {
  if (ref.type === 'inline' && typeof ref.value === 'string') {
    return Buffer.from(ref.value, 'base64');
  }

  // CAS references cannot be extracted without CAS access
  return null;
}

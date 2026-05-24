/**
 * Event schema utilities for Property 30: Multi-sync Readiness
 * 
 * Implements:
 * - UUIDv7 generation for eventId
 * - Project ID calculation (SHA-256 of project root path, truncated)
 * - Monotonic timestamp utilities
 */

import { createHash } from 'crypto';
import type { Event } from './index';

/**
 * Generate a UUIDv7-like ID for event IDs
 * Time-ordered and globally unique
 * Format: timestamp(48 bits) + version(4 bits) + variant(2 bits) + random(62 bits)
 * Simplified implementation for V6
 */
export function generateEventId(): string {
  const timestamp = Date.now();
  
  // Convert timestamp to hex (12 chars for 48 bits)
  const timestampHex = Math.floor(timestamp).toString(16).padStart(12, '0');
  
  // Generate random hex string (18 chars for 72 bits)
  let randomHex = '';
  for (let i = 0; i < 18; i++) {
    randomHex += Math.floor(Math.random() * 16).toString(16);
  }
  
  // UUIDv7 format: timestamp(12) + version(1) + random(15) + variant(1) + random(10)
  // Version 7: 0x7 in position 12
  // Variant RFC 4122: 0x8, 0x9, 0xA, or 0xB in position 16
  const version = '7';
  const variant = (0x8 + Math.floor(Math.random() * 4)).toString(16); // 8, 9, a, or b
  
  return `${timestampHex.substring(0, 8)}-${timestampHex.substring(8, 12)}-${version}${randomHex.substring(0, 3)}-${variant}${randomHex.substring(3, 6)}-${randomHex.substring(6, 18)}`;
}

/**
 * Calculate project ID from project root path
 * Returns SHA-256 hash of the path, truncated to 16 characters
 * 
 * @param projectRootPath Absolute path to project root
 * @returns Project ID string
 */
export function calculateProjectId(projectRootPath: string): string {
  const hash = createHash('sha256');
  hash.update(projectRootPath);
  const fullHash = hash.digest('hex');
  
  // Truncate to 16 characters for readability while maintaining uniqueness
  return fullHash.substring(0, 16);
}

/**
 * Monotonic timestamp generator
 * Ensures timestamps are monotonic within a process
 */
export class MonotonicTimestamp {
  private lastTimestamp = 0;
  private sequenceCounter = 0;

  /**
   * Get current timestamp in nanoseconds with monotonic guarantee
   * Returns { timestamp: number, sequence: number }
   */
  getTimestamp(): { timestamp: number; sequence: number } {
    const now = Date.now();
    const timestampNs = now * 1_000_000; // Convert to nanoseconds
    
    if (timestampNs > this.lastTimestamp) {
      this.lastTimestamp = timestampNs;
      this.sequenceCounter = 0;
    } else {
      // Same timestamp, increment sequence
      this.sequenceCounter++;
    }
    
    return {
      timestamp: this.lastTimestamp,
      sequence: this.sequenceCounter
    };
  }

  /**
   * Reset the monotonic timestamp generator
   * Useful for testing
   */
  reset(): void {
    this.lastTimestamp = 0;
    this.sequenceCounter = 0;
  }
}

/**
 * Validate Event schema properties (Property 30)
 */
export function validateEventSchema(event: Event): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check schema_version
  if (event.schema_version !== '1.0') {
    errors.push(`Invalid schema_version: ${event.schema_version}`);
  }

  // Check eventId format (should be UUID)
  if (!isValidUuid(event.eventId)) {
    errors.push(`Invalid eventId format: ${event.eventId}`);
  }

  // Check timestamp is positive
  if (event.ts <= 0) {
    errors.push(`Invalid timestamp: ${event.ts}`);
  }

  // Check monotonicSeq is non-negative
  if (event.monotonicSeq < 0) {
    errors.push(`Invalid monotonicSeq: ${event.monotonicSeq}`);
  }

  // Check projectId is non-empty
  if (!event.projectId || event.projectId.trim() === '') {
    errors.push('projectId cannot be empty');
  }

  // Check projectId format (hex string, 16 chars)
  if (!/^[0-9a-f]{16}$/i.test(event.projectId)) {
    errors.push(`Invalid projectId format: ${event.projectId}`);
  }

  // Check category is valid
  const validCategories = [
    'workflow', 'gate', 'permission', 'session', 'tool', 
    'heal', 'modality', 'system', 'llm'
  ];
  if (!validCategories.includes(event.category)) {
    errors.push(`Invalid category: ${event.category}`);
  }

  // Check action is non-empty
  if (!event.action || event.action.trim() === '') {
    errors.push('action cannot be empty');
  }

  // Check payloadBlobRef format if present
  if (event.payloadBlobRef && !event.payloadBlobRef.startsWith('blob://')) {
    errors.push(`Invalid payloadBlobRef format: ${event.payloadBlobRef}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Create a minimal event with all required fields
 * Useful for testing and event creation
 */
export function createEvent(
  data: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'>,
  timestampGenerator: MonotonicTimestamp = new MonotonicTimestamp()
): Event {
  const { timestamp, sequence } = timestampGenerator.getTimestamp();
  
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: timestamp,
    monotonicSeq: sequence,
    ...data
  };
}

/**
 * Event schema constants
 */
export const EVENT_SCHEMA = {
  VERSION: '1.0' as const,
  MAX_PAYLOAD_SIZE: 64 * 1024, // 64 KiB
  BLOB_REF_PREFIX: 'blob://' as const,
  PROJECT_ID_LENGTH: 16,
  TIMESTAMP_PRECISION: 'nanoseconds' as const
} as const;
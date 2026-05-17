/**
 * Event ID generation for Event Bus
 * Implements UUIDv7 for globally unique, time-ordered event IDs
 * 
 * Re-exports from event-utils for backward compatibility
 */

export { generateEventId, isValidUuid as isValidEventId } from '@/types/event-utils';
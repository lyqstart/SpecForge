/**
 * work-item-id-validator.ts — SpecForge v1.1 Work Item ID single source.
 *
 * v1.1 fixed format:
 *   WI-NNNN
 *
 * Examples:
 *   WI-0001
 *   WI-0023
 *
 * Invalid:
 *   WI-001
 *   WI-20260614-0001
 *   blue-h1-hello-world
 */
export const WI_ID_PATTERN = /^WI-\d{4}$/;

/**
 * Validate a work_item_id conforms to the v1.1 standard.
 * Returns null if valid, or an error message if invalid.
 */
export function validateWorkItemId(workItemId: string): string | null {
  if (!workItemId || typeof workItemId !== 'string') {
    return 'work_item_id is required and must be a string';
  }

  if (!WI_ID_PATTERN.test(workItemId)) {
    return `Invalid work_item_id "${workItemId}". Must match WI-NNNN (e.g. WI-0001). Date-based IDs such as WI-YYYYMMDD-NNNN are not allowed in v1.1.`;
  }

  return null;
}

/**
 * Check if a work_item_id is valid v1.1 format.
 */
export function isValidWorkItemId(workItemId: string): boolean {
  return typeof workItemId === 'string' && WI_ID_PATTERN.test(workItemId);
}

/**
 * Format a numeric sequence as WI-NNNN.
 */
export function formatWorkItemId(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error(`Invalid WI sequence: ${sequence}. Must be integer 1..9999.`);
  }

  return `WI-${String(sequence).padStart(4, '0')}`;
}

/**
 * Parse WI-NNNN and return numeric sequence.
 */
export function parseWorkItemSequence(workItemId: string): number | null {
  if (!isValidWorkItemId(workItemId)) return null;
  return Number.parseInt(workItemId.slice(3), 10);
}

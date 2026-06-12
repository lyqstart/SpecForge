/**
 * work-item-id-validator.ts — Enforce v1.1 Work Item ID format
 *
 * Valid formats: WI-NNN, WI-NNNN, WI-YYYYMMDD-NNNN
 * Invalid: business slugs like "todo-list-web", "blue-h1-hello-world"
 */

const WI_ID_PATTERN = /^WI-(\d{3,4}|\d{8}-\d{4})$/;

/**
 * Validate a work_item_id conforms to v1.1 standard.
 * Returns null if valid, or an error message if invalid.
 */
export function validateWorkItemId(workItemId: string): string | null {
  if (!workItemId || typeof workItemId !== 'string') {
    return 'work_item_id is required and must be a string';
  }
  if (!WI_ID_PATTERN.test(workItemId)) {
    return `Invalid work_item_id "${workItemId}". Must match WI-NNN or WI-NNNN or WI-YYYYMMDD-NNNN (e.g. WI-001, WI-0001, WI-20260612-0001). Business slugs are not allowed.`;
  }
  return null;
}

/**
 * Check if a work_item_id is valid v1.1 format.
 */
export function isValidWorkItemId(workItemId: string): boolean {
  return WI_ID_PATTERN.test(workItemId);
}

/**
 * allowed-write-files.ts — AllowedWriteFile type & validation
 *
 * Extracted from code-permission-service-v11.ts for write-guard domain.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllowedWriteFile {
  path: string;
  operation: 'create' | 'modify' | 'delete';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a list of allowed write files.
 *
 * Deduplicates by normalised path, trims whitespace, and ensures the
 * operation field is one of the allowed values.
 */
export function validateAllowedWriteFiles(
  raw: Array<{ path: string; operation: string }>,
): AllowedWriteFile[] {
  const seen = new Set<string>();
  const result: AllowedWriteFile[] = [];

  for (const entry of raw) {
    const normalised = entry.path.replace(/\\/g, '/').trim();
    if (normalised.length === 0) continue;

    const op = entry.operation as AllowedWriteFile['operation'];
    if (op !== 'create' && op !== 'modify' && op !== 'delete') continue;

    if (seen.has(normalised)) continue;
    seen.add(normalised);

    result.push({ path: normalised, operation: op });
  }

  return result;
}

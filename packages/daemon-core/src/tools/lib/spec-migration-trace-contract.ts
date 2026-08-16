/**
 * Canonical spec_migration trace-scope contract.
 *
 * Trace Delta is required only when the frozen Candidate actually migrates
 * formal Trace content. Consumers must share this predicate instead of
 * treating every spec_migration Work Item as trace-changing.
 */
export function normalizeSpecMigrationCandidateTargetPath(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

export function isSpecMigrationTraceEntry(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const type = String(entry.type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  const target = normalizeSpecMigrationCandidateTargetPath(entry.target_path);
  return (
    type === 'project_trace' ||
    type === 'module_trace' ||
    /(^|\/)trace\.md$/i.test(target) ||
    /(^|\/)trace_matrix\.md$/i.test(target)
  );
}

export function specMigrationCandidateRequiresTraceDelta(
  manifest: Record<string, unknown> | null | undefined,
): boolean {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  return entries.some(isSpecMigrationTraceEntry);
}

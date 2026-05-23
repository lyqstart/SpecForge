/**
 * Progress Reporter for Migration Chain
 *
 * Outputs migration progress in a single line format as required by Requirement 10.4:
 * "WHEN the SpecForge_System runs the Migration_Chain successfully, THE SpecForge_System
 * SHALL print a single line summarizing the source schema version, the target schema version,
 * and the elapsed wall-clock duration in milliseconds."
 */

export interface MigrationProgress {
  fromVersion: number;
  toVersion: number;
  durationMs: number;
}

/**
 * Prints migration progress to stdout in the format:
 * `[migration] data_schema_version <from> → <to> in <ms> ms`
 *
 * @param progress - Migration progress containing fromVersion, toVersion, and durationMs
 */
export function printMigrationProgress(progress: MigrationProgress): void {
  const { fromVersion, toVersion, durationMs } = progress;
  console.log(`[migration] data_schema_version ${fromVersion} → ${toVersion} in ${durationMs} ms`);
}

/**
 * Creates a MigrationProgress object from the given parameters.
 *
 * @param fromVersion - The source schema version
 * @param toVersion - The target schema version
 * @param durationMs - Elapsed time in milliseconds
 * @returns MigrationProgress object
 */
export function createMigrationProgress(
  fromVersion: number,
  toVersion: number,
  durationMs: number
): MigrationProgress {
  return { fromVersion, toVersion, durationMs };
}
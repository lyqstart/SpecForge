/**
 * Release Cycle Policy for legacy manifest migration.
 *
 * Determines the current behavior of the legacy manifest migrator based on
 * which release cycle of the deprecation period the code is in.
 *
 * @see Requirements 11.2, 11.3, 11.4
 * @see design.md §"Manifest 字段三个 Release Cycle 的演进时间线"
 */

import { getCodeVersion } from '../code-version.js';

/**
 * Release cycle behaviors for manifest migration.
 *
 * - DUAL_WRITE (Cycle 1): Write both new and legacy fields
 * - READ_OLD_WRITE_NEW (Cycle 2): Read legacy fields, write only new fields, emit deprecation warning
 * - IN_PLACE_CONVERT (Cycle 3): Detect legacy at startup, backup .legacy.bak, in-place convert
 */
export type ReleaseCycleBehavior = 'DUAL_WRITE' | 'READ_OLD_WRITE_NEW' | 'IN_PLACE_CONVERT';

/**
 * The version at which the deprecation period started.
 * When SpecForge releases a version with this feature, legacy support begins.
 * 
 * This should be updated when the deprecation period actually starts in a release.
 * For now, we use version 6.0.0 as the baseline (the version where this feature is introduced).
 */
const DEPRECATION_PERIOD_START_VERSION = '6.0.0';

/**
 * Release Cycle Policy implementation.
 *
 * Derives the current cycle number from the code version by comparing
 * against the deprecation period start version.
 *
 * The cycle is determined by how many "major.minor" increments have occurred
 * since the deprecation period started:
 * - Cycle 1: Same major.minor as start version → DUAL_WRITE
 * - Cycle 2: One major.minor increment → READ_OLD_WRITE_NEW
 * - Cycle 3: Two major.minor increments → IN_PLACE_CONVERT
 * - Cycle 4+: Beyond deprecation period → normal behavior (returns IN_PLACE_CONVERT as last legacy stage)
 */
export class ReleaseCyclePolicy {
  /**
   * Get the current release cycle behavior based on the code version.
   *
   * The cycle is derived by comparing the current code version's major.minor
   * to the deprecation period start version's major.minor.
   *
   * @returns The current release cycle behavior
   *
   * @example
   * ```typescript
   * // If deprecation started at 6.0.0:
   * // 6.0.x → DUAL_WRITE
   * // 6.1.x → READ_OLD_WRITE_NEW
   * // 7.0.x → IN_PLACE_CONVERT
   * // 8.0.x → IN_PLACE_CONVERT (beyond period, last legacy stage)
   * ```
   */
  current(): ReleaseCycleBehavior {
    const currentVersion = getCodeVersion();
    const cycle = this.deriveCycleFromVersion(currentVersion);

    // Map cycle number to behavior
    if (cycle <= 1) {
      return 'DUAL_WRITE';
    } else if (cycle === 2) {
      return 'READ_OLD_WRITE_NEW';
    } else {
      // Cycle 3 and beyond: IN_PLACE_CONVERT is the last legacy stage
      // After cycle 3, legacy support is fully removed
      return 'IN_PLACE_CONVERT';
    }
  }

  /**
   * Derive the cycle number (1-based) from a semantic version string.
   *
   * The cycle is determined by counting major.minor version increments
   * since the deprecation period start version.
   *
   * @param version - The semantic version string (e.g., "6.0.0", "6.1.0", "7.0.0")
   * @returns The cycle number (1, 2, 3, or higher)
   */
  private deriveCycleFromVersion(version: string): number {
    const current = this.parseMajorMinor(version);
    const start = this.parseMajorMinor(DEPRECATION_PERIOD_START_VERSION);

    // Calculate the number of major.minor increments
    const majorDiff = current.major - start.major;
    const minorDiff = current.minor - start.minor;

    // Cycle is 1 + total increments (each major.minor pair is one cycle)
    const cycle = 1 + (majorDiff * 10 + minorDiff);

    // Ensure cycle is at least 1
    return Math.max(1, cycle);
  }

  /**
   * Parse major and minor version numbers from a semantic version string.
   *
   * @param version - Semantic version string (e.g., "6.0.0", "6.1.2-beta.1")
   * @returns Object with major and minor numbers
   */
  private parseMajorMinor(version: string): { major: number; minor: number } {
    // Extract just the numeric part before any pre-release suffix
    const numericPart = version.split('-')[0];
    const parts = numericPart.split('.');

    const major = parseInt(parts[0] || '0', 10);
    const minor = parseInt(parts[1] || '0', 10);

    return { major, minor };
  }
}

/**
 * Convenience function to get the current release cycle behavior.
 *
 * @returns The current release cycle behavior
 *
 * @example
 * ```typescript
 * import { getCurrentReleaseCycle } from './release-cycle-policy';
 *
 * const behavior = getCurrentReleaseCycle();
 * if (behavior === 'DUAL_WRITE') {
 *   // Write both new and legacy fields
 * }
 * ```
 */
export function getCurrentReleaseCycle(): ReleaseCycleBehavior {
  const policy = new ReleaseCyclePolicy();
  return policy.current();
}
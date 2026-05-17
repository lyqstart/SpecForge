/**
 * Version Checker
 *
 * Parses OpenCode version strings and implements SemVer range checking.
 */

import { VersionCompatibilityResult } from '../types';

/**
 * Semantic Version interface
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
  raw: string;
}

/**
 * Range operator type
 */
type RangeOperator = '<' | '<=' | '>' | '>=' | '=' | '~' | '^';

/**
 * Version range segment
 */
interface RangeSegment {
  operator: RangeOperator;
  comparator: SemVer;
}

/**
 * Version Checker
 *
 * Parses OpenCode version strings and implements SemVer range checking.
 * Generates compatibility results and error messages.
 */
export class VersionChecker {
  private range: RangeSegment[];
  private rangeString: string;

  /**
   * Create a new VersionChecker
   *
   * @param versionRange - SemVer range string (e.g., ">=1.0.0 <2.0.0")
   */
  constructor(versionRange: string) {
    this.rangeString = versionRange;
    this.range = this.parseRange(versionRange);
  }

  /**
   * Parse a SemVer range string
   *
   * @param rangeString - Range string to parse
   * @returns Array of range segments
   */
  private parseRange(rangeString: string): RangeSegment[] {
    const segments: RangeSegment[] = [];

    // Split by whitespace and filter empty
    const parts = rangeString.split(/\s+/).filter(p => p.length > 0);

    for (const part of parts) {
      // Match operators: <, <=, >, >=, =, ~, ^
      const match = part.match(/^([<>=~^]+)?(\d+\.\d+\.\d+.*)$/);

      if (!match) {
        continue;
      }

      const [, op, version] = match;
      if (!version) {
        continue;
      }
      const operator = (op || '=') as RangeOperator;
      const comparator = this.parseVersion(version);

      segments.push({ operator, comparator });
    }

    return segments;
  }

  /**
   * Parse a SemVer string
   *
   * @param versionString - Version string to parse
   * @returns SemVer object
   */
  parseVersion(versionString: string): SemVer {
    // Match semver: major.minor.patch-prerelease+build
    const match = versionString.match(
      /^(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/
    );

    if (!match) {
      // Return a default invalid version
      return {
        major: 0,
        minor: 0,
        patch: 0,
        prerelease: [],
        build: [],
        raw: versionString,
      };
    }

    const [, major, minor, patch, prerelease, build] = match;

    if (major === undefined || minor === undefined || patch === undefined) {
      // Return a default invalid version
      return {
        major: 0,
        minor: 0,
        patch: 0,
        prerelease: [],
        build: [],
        raw: versionString,
      };
    }

    return {
      major: parseInt(major, 10),
      minor: parseInt(minor, 10),
      patch: parseInt(patch, 10),
      prerelease: prerelease ? prerelease.split('.') : [],
      build: build ? build.split('.') : [],
      raw: versionString,
    };
  }

  /**
   * Check if a version satisfies the range
   *
   * @param version - Version to check
   * @returns Whether the version satisfies the range
   */
  satisfies(version: string | SemVer): boolean {
    const semver = typeof version === 'string' ? this.parseVersion(version) : version;

    for (const segment of this.range) {
      if (!this.compare(semver, segment.operator, segment.comparator)) {
        return false;
      }
    }

    return this.range.length > 0;
  }

  /**
   * Compare two versions
   *
   * @param version - Version to compare
   * @param operator - Comparison operator
   * @param comparator - Version to compare against
   * @returns Result of comparison
   */
  private compare(version: SemVer, operator: RangeOperator, comparator: SemVer): boolean {
    // Handle ~ and ^ operators
    if (operator === '~') {
      return this.compareTilde(version, comparator);
    }
    if (operator === '^') {
      return this.compareCaret(version, comparator);
    }

    const cmp = this.compareVersions(version, comparator);

    switch (operator) {
      case '<':
        return cmp < 0;
      case '<=':
        return cmp <= 0;
      case '>':
        return cmp > 0;
      case '>=':
        return cmp >= 0;
      case '=':
        return cmp === 0;
      default:
        return false;
    }
  }

  /**
   * Compare using tilde (~) operator - patch version flexibility
   * ~1.2.3 := >=1.2.3 <1.3.0
   */
  private compareTilde(version: SemVer, comparator: SemVer): boolean {
    if (version.major !== comparator.major) {
      return version.major === comparator.major;
    }
    if (version.minor !== comparator.minor) {
      return version.minor === comparator.minor;
    }
    return version.patch >= comparator.patch;
  }

  /**
   * Compare using caret (^) operator - minor version flexibility
   * ^1.2.3 := >=1.2.3 <2.0.0
   */
  private compareCaret(version: SemVer, comparator: SemVer): boolean {
    if (version.major !== 0) {
      return version.major === comparator.major;
    }
    // For 0.x versions, caret behaves like tilde
    if (version.minor !== comparator.minor) {
      return version.minor === comparator.minor;
    }
    return version.patch >= comparator.patch;
  }

  /**
   * Compare two versions numerically
   *
   * @param v1 - First version
   * @param v2 - Second version
   * @returns -1, 0, or 1
   */
  private compareVersions(v1: SemVer, v2: SemVer): number {
    // Compare major
    if (v1.major !== v2.major) {
      return v1.major < v2.major ? -1 : 1;
    }

    // Compare minor
    if (v1.minor !== v2.minor) {
      return v1.minor < v2.minor ? -1 : 1;
    }

    // Compare patch
    if (v1.patch !== v2.patch) {
      return v1.patch < v2.patch ? -1 : 1;
    }

    // Compare prerelease
    if (v1.prerelease.length !== v2.prerelease.length) {
      return v1.prerelease.length < v2.prerelease.length ? -1 : 1;
    }

    for (let i = 0; i < v1.prerelease.length; i++) {
      const p1 = v1.prerelease[i];
      const p2 = v2.prerelease[i];
      if (p1 === undefined || p2 === undefined) {
        return v1.prerelease.length - v2.prerelease.length;
      }
      if (p1 !== p2) {
        return p1 < p2 ? -1 : 1;
      }
    }

    return 0;
  }

  /**
   * Check version compatibility
   *
   * @param kernelVersion - Version string to check
   * @returns Compatibility result
   */
  check(kernelVersion: string): VersionCompatibilityResult {
    const compatible = this.satisfies(kernelVersion);

    if (!compatible) {
      return {
        compatible: false,
        version: kernelVersion,
        requiredRange: this.rangeString,
        error: `OpenCode version ${kernelVersion} is not compatible with required range ${this.rangeString}`,
      };
    }

    return {
      compatible: true,
      version: kernelVersion,
      requiredRange: this.rangeString,
    };
  }

  /**
   * Get the range string
   *
   * @returns The original range string
   */
  getRangeString(): string {
    return this.rangeString;
  }
}

/**
 * Build-time schema-version parsing and publish monotonicity checks.
 */

import type { ValidationResult } from "./types.js";

export class SchemaVersionManager {
  /** Build-time schema baseline. Runtime installation state is not read here. */
  readonly baseline: string;

  constructor(baseline: string = "1.0") {
    this.baseline = baseline;
  }

  parseTuple(version: string): readonly [number, number] {
    if (!version || version.trim() === "") {
      throw new Error("Invalid schema_version format: empty string");
    }

    const parts = version.split(".");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid schema_version format: "${version}" (expected "MAJOR.MINOR" with exactly one dot)`
      );
    }

    const major = Number.parseInt(parts[0], 10);
    const minor = Number.parseInt(parts[1], 10);
    if (Number.isNaN(major) || Number.isNaN(minor)) {
      throw new Error(
        `Invalid schema_version format: "${version}" (MAJOR and MINOR must be integers)`
      );
    }
    if (parts[0] !== String(major) || parts[1] !== String(minor)) {
      throw new Error(
        `Invalid schema_version format: "${version}" (contains non-numeric characters)`
      );
    }

    return [major, minor] as const;
  }

  assertMonotonic(
    candidateBaseline: string,
    highestPublished: string | null
  ): ValidationResult {
    if (highestPublished === null) {
      return { isValid: true, errors: [], warnings: [] };
    }

    try {
      const [candidateMajor, candidateMinor] = this.parseTuple(candidateBaseline);
      const [highestMajor, highestMinor] = this.parseTuple(highestPublished);
      const isMonotonic =
        candidateMajor > highestMajor ||
        (candidateMajor === highestMajor && candidateMinor >= highestMinor);

      if (isMonotonic) {
        return { isValid: true, errors: [], warnings: [] };
      }

      return {
        isValid: false,
        errors: [{
          code: "PUBLISH_BASELINE_DOWNGRADE",
          field: "schema_version",
          message:
            `Schema version downgrade detected: candidate baseline "${candidateBaseline}" ` +
            `is lower than highest published baseline "${highestPublished}". ` +
            "Schema versions must be monotonically increasing.",
        }],
        warnings: [],
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: "PUBLISH_VALIDATION",
          field: "schema_version",
          message:
            `Failed to parse schema_version: ${error instanceof Error ? error.message : String(error)}`,
        }],
        warnings: [],
      };
    }
  }
}

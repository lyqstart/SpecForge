/**
 * Service Unit Generator Interface
 *
 * Responsible for rendering ServiceInstallSpec into a systemd unit file.
 *
 * Follows "always-rewrite" strategy - each upgrade rewrites the entire unit file,
 * with version tracking via metadata comment block at the top.
 */

import type { ServiceInstallSpec } from "../types/service-install-spec.js";
import type { ServiceUnitMetadata } from "../types/service-unit-metadata.js";

export interface ServiceUnitGenerator {
  /**
   * Generate systemd unit file text (Linux).
   * The returned value starts with metadata comment block.
   */
  generateSystemdUnit(spec: ServiceInstallSpec): string;

  /**
   * Parse unit file top metadata comment block to extract ServiceUnitMetadata.
   * Returns null if metadata is missing or corrupted.
   */
  parseMetadata(unitContent: string): ServiceUnitMetadata | null;
}

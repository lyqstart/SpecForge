/**
 * Service Unit Generator Interface
 *
 * Responsible for rendering ServiceInstallSpec into:
 * - systemd unit file text (Linux)
 * - NSSM command sequence (Windows)
 *
 * Follows "always-rewrite" strategy - each upgrade rewrites the entire unit file,
 * with version tracking via metadata comment block at the top.
 */

import type { ServiceInstallSpec } from "../types/service-install-spec.js";
import type { ServiceUnitMetadata } from "../types/service-unit-metadata.js";
import type { NssmCommand } from "../types/nssm-command.js";

export interface ServiceUnitGenerator {
  /**
   * Generate systemd unit file text (Linux).
   * The returned value starts with metadata comment block.
   */
  generateSystemdUnit(spec: ServiceInstallSpec): string;

  /**
   * Generate NSSM command sequence (Windows).
   * Each command is idempotent - calling multiple times has the same effect as once.
   */
  generateNssmCommands(spec: ServiceInstallSpec, nssmExePath: string): NssmCommand[];

  /**
   * Parse unit file top metadata comment block to extract ServiceUnitMetadata.
   * Returns null if metadata is missing or corrupted.
   */
  parseMetadata(unitContent: string): ServiceUnitMetadata | null;
}
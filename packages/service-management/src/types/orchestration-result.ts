import type { ServiceStatus } from "./service-status.js";

/**
 * Result of a multi-service orchestration operation (installAll, startAll, etc.)
 */
export interface OrchestrationResult {
  schema_version: "1.0";
  /** Whether the operation completed successfully */
  success: boolean;
  /** Final status of each service */
  perService: ServiceStatus[];
  /** List of services that were rolled back on failure */
  rolledBack: string[];
  /** Error information (first failed service's error) */
  error: {
    code: string;
    message: string;
    suggestion: string;
  } | null;
}

/**
 * Helper function to serialize Map<string, ServiceStatus> to JSON.
 * Used when storing orchestration results.
 */
export function serializeServiceStatusMap(
  map: Map<string, ServiceStatus>
): Record<string, ServiceStatus> {
  const result: Record<string, ServiceStatus> = {};
  for (const [key, value] of map) {
    result[key] = value;
  }
  return result;
}

/**
 * Helper function to deserialize JSON back to Map<string, ServiceStatus>.
 * Used when reading stored orchestration results.
 */
export function deserializeServiceStatusMap(
  obj: Record<string, ServiceStatus>
): Map<string, ServiceStatus> {
  const map = new Map<string, ServiceStatus>();
  for (const [key, value] of Object.entries(obj)) {
    map.set(key, value);
  }
  return map;
}
/**
 * @specforge/observability - Observability module for SpecForge V6
 * 
 * Current-release shared event types and observability policy contract.
 */

export * from './types/index.js';
export {
  OBSERVABILITY_CONFIG_SCHEMA_VERSION,
  OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR,
  parseObservabilityConfigDocument,
  serializeObservabilityConfigDocument,
} from './config-contract.js';
export type { ObservabilityConfigDocument } from './config-contract.js';

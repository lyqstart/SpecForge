/**
 * ModalityAdapter Configuration Interface
 *
 * Configuration options for ModalityAdapter instances.
 * Supports different modalities with customizable behavior.
 *
 * Part of the Multimodal Message Layer skeleton for SpecForge V6.0
 * Full implementation deferred to P2
 *
 * Validates: Requirement 14.5
 * Feature: multimodal, Requirement: ModalityAdapter config interface
 */

import type { ModalityType } from "./modality-type.js";

/**
 * Configuration for a specific modality handler
 */
export interface ModalityHandlerConfig {
  /** The modality type this handler is configured for */
  modalityType: ModalityType;

  /** Whether this modality is enabled for processing */
  enabled: boolean;

  /** Maximum input size in bytes (optional) */
  maxInputSize?: number;

  /** Supported MIME types for this modality (optional) */
  supportedMimeTypes?: string[];

  /** Custom handler options (for P2 implementation) */
  options?: Record<string, unknown>;
}

/**
 * Adapter configuration for deterministic behavior
 */
export interface AdapterBehaviorConfig {
  /**
   * Whether to use caching for derivative generation
   * When true, identical inputs produce cached outputs (Property 13)
   */
  useCache: boolean;

  /**
   * Cache TTL in milliseconds
   * Only used when useCache is true
   */
  cacheTtlMs?: number;

  /**
   * Whether to strict mode - reject unsupported modalities
   * instead of falling back to text derivatives
   */
  strictMode: boolean;

  /**
   * Default text derivative type when downgrading non-text content
   * Options: "ocr", "transcription", "summary"
   */
  defaultDerivativeType?: "ocr" | "transcription" | "summary";
}

/**
 * Complete ModalityAdapter configuration
 */
export interface ModalityAdapterConfig {
  /** Schema version for migration support */
  schema_version: "1.0";

  /** Adapter identifier (for logging and debugging) */
  adapterId: string;

  /** Configuration for each modality type */
  modalityHandlers: ModalityHandlerConfig[];

  /** Behavior configuration for deterministic adaptation */
  behavior: AdapterBehaviorConfig;

  /** Target model identifier (optional, for logging) */
  targetModel?: string;

  /** Custom configuration options */
  options?: Record<string, unknown>;
}

/**
 * Default adapter configuration for V6.0 skeleton
 */
export const DEFAULT_ADAPTER_CONFIG: Omit<ModalityAdapterConfig, "adapterId"> = {
  schema_version: "1.0",
  modalityHandlers: [
    {
      modalityType: "text" as ModalityType,
      enabled: true,
    },
    {
      modalityType: "image" as ModalityType,
      enabled: false, // V6.0: disabled, P2 enables
    },
    {
      modalityType: "audio" as ModalityType,
      enabled: false, // V6.0: disabled, P2 enables
    },
    {
      modalityType: "video" as ModalityType,
      enabled: false, // V6.0: disabled, P2 enables
    },
    {
      modalityType: "file" as ModalityType,
      enabled: false, // V6.0: disabled, P2 enables
    },
  ],
  behavior: {
    useCache: true,
    cacheTtlMs: 3600000, // 1 hour
    strictMode: true, // V6.0 rejects non-text by default
    defaultDerivativeType: "summary",
  },
};

/**
 * Create a ModalityAdapterConfig with defaults applied
 */
export function createAdapterConfig(
  overrides: Partial<ModalityAdapterConfig> = {},
): ModalityAdapterConfig {
  return {
    ...DEFAULT_ADAPTER_CONFIG,
    ...overrides,
    modalityHandlers: overrides.modalityHandlers ?? DEFAULT_ADAPTER_CONFIG.modalityHandlers,
    behavior: {
      ...DEFAULT_ADAPTER_CONFIG.behavior,
      ...overrides.behavior,
    },
  } as ModalityAdapterConfig;
}

/**
 * Validate a ModalityAdapterConfig
 */
export function isValidAdapterConfig(
  config: unknown,
): config is ModalityAdapterConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  if (cfg["schema_version"] !== "1.0") {
    return false;
  }

  if (typeof cfg["adapterId"] !== "string" || (cfg["adapterId"] as string).length === 0) {
    return false;
  }

  if (!Array.isArray(cfg["modalityHandlers"])) {
    return false;
  }

  if (typeof cfg["behavior"] !== "object" || cfg["behavior"] === null) {
    return false;
  }

  return true;
}

/**
 * Get handler config for a specific modality
 */
export function getModalityHandler(
  config: ModalityAdapterConfig,
  modalityType: ModalityType,
): ModalityHandlerConfig | undefined {
  return config.modalityHandlers.find((h) => h.modalityType === modalityType);
}

/**
 * Check if a modality is enabled in the configuration
 */
export function isModalityEnabled(
  config: ModalityAdapterConfig,
  modalityType: ModalityType,
): boolean {
  const handler = getModalityHandler(config, modalityType);
  return handler?.enabled ?? false;
}
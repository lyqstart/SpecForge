/**
 * ModelCapabilities - Defines what modalities a model supports
 *
 * Part of the Multimodal Message Layer skeleton for SpecForge V6.0
 * Full implementation deferred to P2
 */

import type { Modality } from "./modality-type.js";
import {
  ModalityType,
  ALL_MODALITY_TYPES,
  isModalityType,
  modalityTypeToModality,
  modalityToModalityType,
} from "./modality-type.js";

export type { Modality };
export {
  ModalityType,
  ALL_MODALITY_TYPES,
  isModalityType,
  modalityTypeToModality,
  modalityToModalityType,
};

/**
 * Capabilities of a model, defining what modalities it supports
 */
export interface ModelCapabilities {
  /** Schema version for this structure */
  schema_version: '1.0';

  /** Array of supported modalities */
  modalities: Modality[];

  /** Maximum number of input tokens the model can accept (optional) */
  maxInputTokens?: number;

  /** Whether the model supports tool calling (optional) */
  supportsTools?: boolean;
}
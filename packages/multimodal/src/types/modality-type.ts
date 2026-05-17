/**
 * ModalityType Enum
 *
 * Enum representing supported modality types for the Multimodal Message Layer.
 * This provides type-safe modality identification for adapter configurations
 * and runtime checks.
 *
 * Part of the Multimodal Message Layer skeleton for SpecForge V6.0
 * Full implementation deferred to P2
 */

/**
 * Supported modality types as an enum for type-safe operations
 */
export enum ModalityType {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video",
  FILE = "file",
}

/**
 * Type alias for modality string values (backward compatibility with Modality type)
 */
export type Modality = "text" | "image" | "audio" | "video" | "file";

/**
 * All valid modality type values as an array
 */
export const ALL_MODALITY_TYPES: ModalityType[] = [
  ModalityType.TEXT,
  ModalityType.IMAGE,
  ModalityType.AUDIO,
  ModalityType.VIDEO,
  ModalityType.FILE,
];

/**
 * Check if a string is a valid ModalityType
 */
export function isModalityType(value: unknown): value is ModalityType {
  return (
    typeof value === "string" &&
    Object.values(ModalityType).includes(value as ModalityType)
  );
}

/**
 * Convert ModalityType to Modality string
 */
export function modalityTypeToModality(type: ModalityType): Modality {
  return type as Modality;
}

/**
 * Convert Modality string to ModalityType enum
 */
export function modalityToModalityType(modality: Modality): ModalityType {
  return ModalityType[modality.toUpperCase() as keyof typeof ModalityType];
}
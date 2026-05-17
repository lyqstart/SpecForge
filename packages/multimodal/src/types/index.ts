/**
 * Type exports for multimodal module
 */

export * from "./blob-ref.js";
export * from "./message-content.js";
export * from "./model-capabilities.js";
export * from "./user-message.js";
export * from "./observability-events.js";
export * from "./modality-type.js";
export * from "./adapter-config.js";

// Re-export validation and serialization functions
export {
  validateUserMessage,
  isValidUserMessage,
  serializeUserMessage,
  deserializeUserMessage,
  cloneUserMessage,
  type ValidationError,
} from "./user-message.js";

// Re-export observability event functions
export {
  createModalityAdaptationEvent,
  createMultimodalRejectionEvent,
  validateModalityAdaptationEvent,
  validateMultimodalRejectionEvent,
  isModalityAdaptationEvent,
  isMultimodalRejectionEvent,
  isMultimodalObservabilityEvent,
  serializeObservabilityEvent,
  deserializeObservabilityEvent,
  type EventValidationError,
  type BaseObservabilityEvent,
  type ModalityAdaptationEvent,
  type MultimodalRejectionEvent,
  type MultimodalObservabilityEvent,
} from "./observability-events.js";

// Re-export type guards
export {
  isTextContent,
  isImageContent,
  isAudioContent,
  isVideoContent,
  isFileContent,
  isCodeContent,
  isDocumentContent,
  getContentType,
} from "./message-content.js";
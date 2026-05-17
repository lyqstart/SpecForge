/**
 * @specforge/multimodal - Multimodal Message Layer for SpecForge V6
 * 
 * Provides the foundational framework for handling multi-modal content
 * (images, audio, video, files, code snippets, documents) while enforcing
 * V6.0 scope boundaries.
 * 
 * V6.0 Scope: Framework skeleton only, with full multimodal support deferred to P2.
 */

// Core types
export type { UserMessage, AgentIdentity, ValidationError } from './types/user-message.js';
export {
  createTextMessage,
  isV6Compliant,
  extractTextContent,
  validateUserMessage,
  isValidUserMessage,
  serializeUserMessage,
  deserializeUserMessage,
  cloneUserMessage,
} from './types/user-message.js';

export type { MessageContentItem } from './types/message-content.js';
export {
  isTextContent,
  isImageContent,
  isAudioContent,
  isVideoContent,
  isFileContent,
  isCodeContent,
  isDocumentContent,
  getContentType,
} from './types/message-content.js';

export type { BlobRef } from './types/blob-ref.js';
export { createBlobRef, isBlobRef, extractHash } from './types/blob-ref.js';

// CAS types and utilities
export type { CASClient } from './cas-types.js';
export {
  validateBlobRef,
  isStrictBlobRef,
  BLOB_REF_PATTERN,
  SHA256_HEX_LENGTH,
} from './cas-types.js';

// Event Recording
export type { RecordingResult, QueryResult } from './EventRecorder.js';
export { EventRecorder, createEventRecorder } from './EventRecorder.js';

// Modality Adapter
export type { ModalityAdapter, PreparedMessage, PreparedMessageMetadata } from './modality-adapter.js';

// Adapter Configuration
export type {
  ModalityAdapterConfig,
  ModalityHandlerConfig,
  AdapterBehaviorConfig,
} from './types/adapter-config.js';
export {
  DEFAULT_ADAPTER_CONFIG,
  createAdapterConfig,
  isValidAdapterConfig,
  getModalityHandler,
  isModalityEnabled,
} from './types/adapter-config.js';

// Modality Type
export { ModalityType, isModalityType, modalityTypeToModality, modalityToModalityType, ALL_MODALITY_TYPES } from './types/modality-type.js';
export type { Modality } from './types/modality-type.js';

// Ingestion
export type { IngestionSubsystem, SubmitResult } from './ingestion/IngestionSubsystem.js';
export { V6IngestionSubsystem } from './ingestion/IngestionSubsystem.js';

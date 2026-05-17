/**
 * ModalityAdapter Interface
 *
 * Defines the contract for adapting UserMessage instances to a target model's
 * accepted modality set. In V6.0 this is a P0 skeleton interface only; full
 * adaptation implementation (parsers, derivative generation, downgrading)
 * is deferred to P2.
 *
 * Inherited Correctness Property:
 *   Property 13 (Modality Adaptation Determinism):
 *     For all (userMessage, modelCapabilities) pairs (with userMessage blob
 *     references fixed), the output of prepareMessageForModel must be
 *     deterministic — identical inputs must produce identical outputs.
 *
 * Validates: Requirements 14.5
 * Feature: multimodal, Requirement: ModalityAdapter interface
 * Derived-From: v6-architecture-overview Property 13
 */

import type { BlobRef } from "./types/blob-ref.js";
import type { MessageContentItem } from "./types/message-content.js";
import type { ModelCapabilities } from "./types/model-capabilities.js";
import { ModalityType, type Modality } from "./types/modality-type.js";
import type { UserMessage } from "./types/user-message.js";
import type { ModalityAdapterConfig } from "./types/adapter-config.js";

/**
 * Metadata describing how a UserMessage was adapted into a PreparedMessage.
 *
 * This information is what observability events of category "modality" /
 * action "adaptation.decision" carry (see design.md §Data Models). Keeping
 * it on the PreparedMessage itself ensures the adaptation decision is fully
 * reproducible from inputs alone (Property 13).
 */
export interface PreparedMessageMetadata {
  /** Modalities present in the source UserMessage. */
  inputModalities: Modality[];

  /** Whether any content item was downgraded to a text derivative. */
  downgraded: boolean;

  /** Blob refs that came from the source UserMessage (pre-adaptation). */
  originalBlobRefs: BlobRef[];

  /**
   * Blob refs of text derivatives substituted for original content
   * (e.g. OCR text replacing an image blob). Empty when downgraded === false.
   */
  usedDerivativeBlobRefs: BlobRef[];

  /**
   * Identifier of the target model this PreparedMessage was prepared for.
   * Mirrors `ModalityAdaptationEvent.payload.targetModel` in design.md.
   */
  targetModel?: string;
}

/**
 * The output of `ModalityAdapter.prepareMessageForModel`.
 *
 * Represents a UserMessage that has been transformed into a form acceptable
 * by the target model:
 *   - Items the model natively supports are passed through using the
 *     original blob refs.
 *   - Items the model does not support are replaced with text derivatives
 *     (in V6.0 this branch is skeleton-only and not exercised — V6.0
 *     IngestionSubsystem rejects non-text UserMessages per Property 23).
 */
export interface PreparedMessage {
  /** Schema version for migration support. */
  schema_version: "1.0";

  /** Content items adapted for the target model. */
  content: MessageContentItem[];

  /** Adaptation decision metadata (deterministic from inputs). */
  metadata: PreparedMessageMetadata;
}

/**
 * ModalityAdapter — adapts UserMessage instances to a target model.
 *
 * Implementations MUST be deterministic: given the same `(message, capabilities)`
 * inputs (with blob refs fixed), `prepareMessageForModel` MUST return an
 * equal PreparedMessage. This is Property 13 from the V6 architecture.
 *
 * In V6.0 this interface is a skeleton — concrete implementations are
 * expected to land in P2 alongside parsers (OCR, transcription, document
 * extraction) and the derivative cache.
 */
export interface ModalityAdapter {
  /**
   * Prepare `message` for a model whose `capabilities` describe its
   * supported modalities.
   *
   * @param message      The UserMessage to adapt.
   * @param capabilities The target model's modality capabilities.
   * @returns A PreparedMessage whose `content` is acceptable by the target
   *          model and whose `metadata` describes the adaptation decision.
   *
   * Determinism contract (Property 13):
   *   Two invocations with deeply-equal `message` and `capabilities` MUST
   *   return deeply-equal PreparedMessage values.
   */
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage;
}

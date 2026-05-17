/**
 * Ingestion Subsystem for Multimodal Message Layer
 * 
 * Handles submission of UserMessages with V6.0 scope boundary enforcement.
 * In V6.0, only text-only messages are accepted; non-text content requires P2.
 * 
 * Validates: Requirements 14.7, 14.8, Property 23
 * Feature: multimodal, Requirement: IngestionSubsystem interface
 */

import type { UserMessage } from "../types/user-message.js";
import type { MessageContentItem } from "../types/message-content.js";

/**
 * Result of a message submission
 */
export interface SubmitResult {
  /** Whether the submission was successful */
  success: boolean;
  
  /** Error message if submission failed */
  error?: string;
  
  /** Error code for programmatic error handling */
  errorCode?: "V6_MULTIMODAL_REJECTED" | "INVALID_MESSAGE";
  
  /** The submitted message if successful */
  submittedMessage?: UserMessage;
  
  /** Timestamp of submission */
  submittedAt?: number;
}

/**
 * Ingestion Subsystem Interface
 * 
 * Handles message ingestion with V6.0 scope enforcement.
 * In V6.0, only text-only UserMessages are accepted.
 * 
 * Property 23 (V6.0 Multimodal Rejection):
 * For all UserMessage m submitted in V6.0, if m.content contains any non-text 
 * elements (image/audio/video/file/code/document), THEN the Ingestion subsystem 
 * MUST reject the submission and return an explicit error.
 */
export interface IngestionSubsystem {
  /**
   * Submit a UserMessage for processing
   * 
   * In V6.0 mode:
   * - Accepts only text-only messages
   * - Rejects messages with non-text content (image/audio/video/file/code/document)
   * 
   * @param message - The UserMessage to submit
   * @returns Promise<SubmitResult> - Result of the submission
   */
  submitMessage(message: UserMessage): Promise<SubmitResult>;
}

/**
 * V6.0 Ingestion Subsystem Implementation
 * 
 * Enforces V6.0 scope boundaries by rejecting non-text content.
 */
export class V6IngestionSubsystem implements IngestionSubsystem {
  /**
   * Submit a message for processing
   * 
   * V6.0 constraints:
   * - Only accepts text-only UserMessages
   * - Rejects any message containing image/audio/video/file/code/document content
   * 
   * @param message - The UserMessage to submit
   * @returns Promise<SubmitResult>
   */
  async submitMessage(message: UserMessage): Promise<SubmitResult> {
    // Validate message structure
    if (!message || !Array.isArray(message.content)) {
      return {
        success: false,
        error: "Invalid message: content must be an array",
        errorCode: "INVALID_MESSAGE",
      };
    }

    // Check for non-text content (V6.0 rejection logic)
    const nonTextContent = message.content.filter(
      (item): item is Exclude<MessageContentItem, { type: "text" }> => item.type !== "text"
    );

    if (nonTextContent.length > 0) {
      const nonTextTypes = [...new Set(nonTextContent.map((item) => item.type))];
      return {
        success: false,
        error: `Multimodal content not supported in V6.0. Found: ${nonTextTypes.join(", ")}. Full multimodal support requires P2 (V6.x).`,
        errorCode: "V6_MULTIMODAL_REJECTED",
      };
    }

    // Accept text-only message
    const submittedAt = Date.now();
    return {
      success: true,
      submittedMessage: {
        ...message,
        submittedAt,
        schema_version: message.schema_version || "1.0",
      },
      submittedAt,
    };
  }
}

/**
 * Create a V6.0 compliant ingestion subsystem instance
 */
export function createIngestionSubsystem(): IngestionSubsystem {
  return new V6IngestionSubsystem();
}
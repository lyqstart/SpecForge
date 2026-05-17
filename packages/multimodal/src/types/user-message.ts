/**
 * UserMessage Data Structure
 * 
 * Defines the main user message interface with multimodal content support.
 * 
 * Validates: Requirements 14.1
 * Feature: multimodal, Requirement: UserMessage interface
 */

import type { MessageContentItem } from "./message-content.js";

/**
 * Agent identity reference
 */
export interface AgentIdentity {
  id: string;
  role: string;
  sessionId?: string;
}

/**
 * User message structure for multimodal content
 * 
 * This is the primary data structure for submitting messages with
 * multi-modal content (text, images, audio, video, files, code, documents).
 * 
 * V6.0 Constraint: Only { type: "text" } items are allowed in V6.0 submissions.
 * Full multimodal support is deferred to P2.
 */
export interface UserMessage {
  /** Schema version for this structure */
  schema_version: "1.0";
  
  /** Array of content items (text/image/audio/video/file/code/document) */
  content: MessageContentItem[];
  
  /** Optional cache for derived texts (OCR/transcription/summary) - for P2 */
  derivedTexts?: Record<string, string>;
  
  /** Timestamp when message was submitted (Unix epoch ms) */
  submittedAt?: number;
  
  /** Identity of the submitter */
  submitter?: AgentIdentity | null;
  
  /** Associated work item ID */
  workItemId?: string | null;
}

/**
 * Create a basic text-only UserMessage
 * 
 * This is the V6.0 compliant message format.
 */
export function createTextMessage(text: string): UserMessage {
  return {
    schema_version: "1.0",
    content: [
      {
        type: "text",
        text,
      },
    ],
    submittedAt: Date.now(),
  };
}

/**
 * Check if a UserMessage contains only text content (V6.0 compliant)
 */
export function isV6Compliant(message: UserMessage): boolean {
  return message.content.every((item) => item.type === "text");
}

/**
 * Get all text content from a UserMessage
 */
export function extractTextContent(message: UserMessage): string[] {
  return message.content
    .filter((item): item is Extract<MessageContentItem, { type: "text" }> => item.type === "text")
    .map((item) => item.text);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validation error for UserMessage
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate UserMessage structure
 * Returns array of validation errors (empty if valid)
 */
export function validateUserMessage(message: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if message is an object
  if (!message || typeof message !== "object") {
    errors.push({ field: "", message: "Message must be an object" });
    return errors;
  }

  const msg = message as Record<string, unknown>;

  // Check schema_version
  if (!msg["schema_version"]) {
    errors.push({ field: "schema_version", message: "schema_version is required" });
  } else if (msg["schema_version"] !== "1.0") {
    errors.push({ field: "schema_version", message: "schema_version must be '1.0'" });
  }

  // Check content
  if (!msg["content"]) {
    errors.push({ field: "content", message: "content is required" });
  } else if (!Array.isArray(msg["content"])) {
    errors.push({ field: "content", message: "content must be an array" });
  } else if ((msg["content"] as unknown[]).length === 0) {
    errors.push({ field: "content", message: "content must not be empty" });
  } else {
    // Validate each content item
    (msg["content"] as unknown[]).forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push({ field: `content[${index}]`, message: "Content item must be an object" });
        return;
      }

      const contentItem = item as Record<string, unknown>;

      // Check type field
      if (!contentItem["type"]) {
        errors.push({ field: `content[${index}].type`, message: "type is required" });
        return;
      }

      const validTypes = ["text", "image", "audio", "video", "file", "code", "document"];
      if (!validTypes.includes(contentItem["type"] as string)) {
        errors.push({
          field: `content[${index}].type`,
          message: `Invalid type '${contentItem["type"]}'. Valid types: ${validTypes.join(", ")}`,
        });
        return;
      }

      // Type-specific validation
      switch (contentItem["type"]) {
        case "text":
          if (typeof contentItem["text"] !== "string") {
            errors.push({ field: `content[${index}].text`, message: "text must be a string" });
          }
          break;
        case "image":
        case "audio":
        case "video":
        case "document":
          if (!contentItem["blob"]) {
            errors.push({ field: `content[${index}].blob`, message: "blob is required" });
          }
          if (!contentItem["mime"]) {
            errors.push({ field: `content[${index}].mime`, message: "mime is required" });
          }
          break;
        case "file":
          if (!contentItem["blob"]) {
            errors.push({ field: `content[${index}].blob`, message: "blob is required" });
          }
          if (!contentItem["mime"]) {
            errors.push({ field: `content[${index}].mime`, message: "mime is required" });
          }
          if (!contentItem["filename"]) {
            errors.push({ field: `content[${index}].filename`, message: "filename is required" });
          }
          break;
        case "code":
          if (!contentItem["blob"]) {
            errors.push({ field: `content[${index}].blob`, message: "blob is required" });
          }
          if (!contentItem["language"]) {
            errors.push({ field: `content[${index}].language`, message: "language is required" });
          }
          break;
      }
    });
  }

  return errors;
}

/**
 * Check if a UserMessage is valid
 */
export function isValidUserMessage(message: unknown): message is UserMessage {
  return validateUserMessage(message).length === 0;
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

/**
 * Serialize UserMessage to JSON string
 */
export function serializeUserMessage(message: UserMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize JSON string to UserMessage
 * Returns null if parsing fails or invalid
 */
export function deserializeUserMessage(json: string): UserMessage | null {
  try {
    const parsed = JSON.parse(json);
    if (isValidUserMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Deep clone a UserMessage
 */
export function cloneUserMessage(message: UserMessage): UserMessage {
  return JSON.parse(JSON.stringify(message));
}
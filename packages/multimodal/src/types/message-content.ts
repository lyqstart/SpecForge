/**
 * Message Content Item Types
 * 
 * Defines the union of all supported content types in multimodal messages.
 * 
 * Validates: Requirements 14.1
 * Feature: multimodal, Requirement: MessageContentItem union type
 */

// Re-export BlobRef for convenience
export type { BlobRef } from "./blob-ref.js";

// Import BlobRef for use in this file
import type { BlobRef } from "./blob-ref.js";

/**
 * Text content item
 */
export interface TextContentItem {
  type: "text";
  text: string;
}

/**
 * Image content item
 */
export interface ImageContentItem {
  type: "image";
  blob: BlobRef;
  mime: string;
}

/**
 * Audio content item
 */
export interface AudioContentItem {
  type: "audio";
  blob: BlobRef;
  mime: string;
}

/**
 * Video content item
 */
export interface VideoContentItem {
  type: "video";
  blob: BlobRef;
  mime: string;
}

/**
 * File content item with filename
 */
export interface FileContentItem {
  type: "file";
  blob: BlobRef;
  mime: string;
  filename: string;
}

/**
 * Code content item with language specification
 */
export interface CodeContentItem {
  type: "code";
  language: string;
  blob: BlobRef;
}

/**
 * Document content item
 */
export interface DocumentContentItem {
  type: "document";
  blob: BlobRef;
  mime: string;
}

/**
 * Union type for all message content items
 * 
 * V6.0 Constraint: Only { type: "text" } items are allowed in V6.0 submissions.
 * Full multimodal support is deferred to P2.
 */
export type MessageContentItem =
  | TextContentItem
  | ImageContentItem
  | AudioContentItem
  | VideoContentItem
  | FileContentItem
  | CodeContentItem
  | DocumentContentItem;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for TextContentItem
 */
export function isTextContent(item: MessageContentItem): item is TextContentItem {
  return item.type === "text";
}

/**
 * Type guard for ImageContentItem
 */
export function isImageContent(item: MessageContentItem): item is ImageContentItem {
  return item.type === "image";
}

/**
 * Type guard for AudioContentItem
 */
export function isAudioContent(item: MessageContentItem): item is AudioContentItem {
  return item.type === "audio";
}

/**
 * Type guard for VideoContentItem
 */
export function isVideoContent(item: MessageContentItem): item is VideoContentItem {
  return item.type === "video";
}

/**
 * Type guard for FileContentItem
 */
export function isFileContent(item: MessageContentItem): item is FileContentItem {
  return item.type === "file";
}

/**
 * Type guard for CodeContentItem
 */
export function isCodeContent(item: MessageContentItem): item is CodeContentItem {
  return item.type === "code";
}

/**
 * Type guard for DocumentContentItem
 */
export function isDocumentContent(item: MessageContentItem): item is DocumentContentItem {
  return item.type === "document";
}

/**
 * Get the type name from a MessageContentItem
 */
export function getContentType(item: MessageContentItem): MessageContentItem["type"] {
  return item.type;
}
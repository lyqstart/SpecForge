/**
 * Unit tests for IngestionSubsystem
 * 
 * Tests V6.0 rejection logic for non-text UserMessages.
 * 
 * Validates: Requirements 14.7, 14.8, Property 23
 * Feature: multimodal, Requirement: IngestionSubsystem submitMessage
 */

import { describe, it, expect } from "vitest";
import type { UserMessage } from "../src/types/user-message.js";
import type { MessageContentItem } from "../src/types/message-content.js";
import { createTextMessage } from "../src/types/user-message.js";
import {
  V6IngestionSubsystem,
  createIngestionSubsystem,
  type SubmitResult,
} from "../src/ingestion/IngestionSubsystem.js";

describe("IngestionSubsystem", () => {
  const subsystem = new V6IngestionSubsystem();

  describe("submitMessage", () => {
    it("should accept text-only UserMessage", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [{ type: "text", text: "Hello world" }],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(true);
      expect(result.submittedMessage).toBeDefined();
      expect(result.submittedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should accept multiple text items", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "text", text: "First text" },
          { type: "text", text: "Second text" },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(true);
      expect(result.submittedMessage?.content).toHaveLength(2);
    });

    it("should reject message with image content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "text", text: "Look at this image" },
          { type: "image", blob: "blob://abc123", mime: "image/png" },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("Multimodal content not supported in V6.0");
      expect(result.error).toContain("image");
      expect(result.error).toContain("P2");
    });

    it("should reject message with audio content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [{ type: "audio", blob: "blob://abc123", mime: "audio/mp3" }],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("audio");
    });

    it("should reject message with video content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [{ type: "video", blob: "blob://abc123", mime: "video/mp4" }],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("video");
    });

    it("should reject message with file content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          {
            type: "file",
            blob: "blob://abc123",
            mime: "application/pdf",
            filename: "document.pdf",
          },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("file");
    });

    it("should reject message with code content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "code", language: "typescript", blob: "blob://abc123" },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("code");
    });

    it("should reject message with document content", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "document", blob: "blob://abc123", mime: "application/pdf" },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
      expect(result.error).toContain("document");
    });

    it("should report all non-text types in error message", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "text", text: "Some text" },
          { type: "image", blob: "blob://abc", mime: "image/png" },
          { type: "audio", blob: "blob://def", mime: "audio/mp3" },
          { type: "video", blob: "blob://ghi", mime: "video/mp4" },
        ],
      };

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain("image");
      expect(result.error).toContain("audio");
      expect(result.error).toContain("video");
    });

    it("should reject message with empty content array", async () => {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [],
      };

      const result = await subsystem.submitMessage(message);

      // Empty content is technically text-only (v6 compliant)
      expect(result.success).toBe(true);
    });

    it("should reject invalid message without content array", async () => {
      const message = {
        schema_version: "1.0",
        // @ts-expect-error - intentionally invalid
        content: "not an array",
      };

      const result = await subsystem.submitMessage(message as UserMessage);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_MESSAGE");
      expect(result.error).toContain("Invalid message");
    });

    it("should reject null message", async () => {
      // @ts-expect-error - intentionally null
      const result = await subsystem.submitMessage(null);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_MESSAGE");
    });

    it("should preserve submittedAt timestamp on successful submission", async () => {
      const message: UserMessage = createTextMessage("Test message");

      const result = await subsystem.submitMessage(message);

      expect(result.success).toBe(true);
      expect(result.submittedAt).toBeGreaterThan(0);
      expect(result.submittedMessage?.submittedAt).toBe(result.submittedAt);
    });

    it("should set default schema_version if not provided", async () => {
      const message = {
        // @ts-expect-error - no schema_version
        content: [{ type: "text", text: "Test" }],
      };

      const result = await subsystem.submitMessage(message as UserMessage);

      expect(result.success).toBe(true);
      expect(result.submittedMessage?.schema_version).toBe("1.0");
    });
  });

  describe("createIngestionSubsystem factory", () => {
    it("should create a V6IngestionSubsystem instance", () => {
      const instance = createIngestionSubsystem();
      expect(instance).toBeInstanceOf(V6IngestionSubsystem);
    });
  });
});

describe("Property 23: V6.0 Multimodal Rejection", () => {
  const subsystem = new V6IngestionSubsystem();

  /**
   * Property 23: For all UserMessage m submitted in V6.0, if m.content contains 
   * any non-text elements (image/audio/video/file/code/document), THEN the 
   * Ingestion subsystem must reject the submission and return an explicit error.
   */
  it("should reject any non-text content in V6.0 mode", async () => {
    const nonTextContentTypes: Array<MessageContentItem["type"]> = [
      "image",
      "audio",
      "video",
      "file",
      "code",
      "document",
    ];

    for (const type of nonTextContentTypes) {
      const message: UserMessage = {
        schema_version: "1.0",
        content: [
          { type: "text", text: "Test" },
          // @ts-expect-error - creating content based on type
          type === "image" ? { type, blob: "blob://abc", mime: "image/png" } :
          type === "audio" ? { type, blob: "blob://abc", mime: "audio/mp3" } :
          type === "video" ? { type, blob: "blob://abc", mime: "video/mp4" } :
          type === "file" ? { type, blob: "blob://abc", mime: "application/pdf", filename: "test.pdf" } :
          type === "code" ? { type, language: "typescript", blob: "blob://abc" } :
          { type, blob: "blob://abc", mime: "application/pdf" }
        ],
      };

      const result = await subsystem.submitMessage(message);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
    }
  });

  it("should allow text-only content in V6.0 mode", async () => {
    const textOnlyMessage: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "First paragraph" },
        { type: "text", text: "Second paragraph" },
      ],
    };

    const result = await subsystem.submitMessage(textOnlyMessage);
    expect(result.success).toBe(true);
  });

  it("must return explicit error for non-text content (not silent acceptance)", async () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "image", blob: "blob://abc123", mime: "image/png" },
      ],
    };

    const result = await subsystem.submitMessage(message);
    
    // Explicit error requirement: must have error message
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(10); // meaningful error message
    
    // Must not have submitted message
    expect(result.submittedMessage).toBeUndefined();
  });
});
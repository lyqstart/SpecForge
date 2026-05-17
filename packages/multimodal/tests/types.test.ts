/**
 * Unit tests for multimodal type structures
 * 
 * Tests MessageContentItem union types and UserMessage interface
 * 
 * Validates: Requirements 14.1
 */

import { describe, it, expect } from "vitest";
import type { MessageContentItem } from "../src/types/message-content.js";
import { createBlobRef, isBlobRef, extractHash } from "../src/types/blob-ref.js";
import {
  type UserMessage,
  createTextMessage,
  isV6Compliant,
  extractTextContent,
  validateUserMessage,
  isValidUserMessage,
  serializeUserMessage,
  deserializeUserMessage,
  cloneUserMessage,
  type ValidationError,
} from "../src/types/user-message.js";
import {
  isTextContent,
  isImageContent,
  isAudioContent,
  isVideoContent,
  isFileContent,
  isCodeContent,
  isDocumentContent,
  getContentType,
} from "../src/types/index.js";

describe("BlobRef", () => {
  it("should create a blob reference from sha256 hash", () => {
    const hash = "a".repeat(64);
    const blobRef = createBlobRef(hash);
    expect(blobRef).toBe(`blob://${hash}`);
  });

  it("should validate blob reference format", () => {
    expect(isBlobRef("blob://abc123")).toBe(true);
    expect(isBlobRef("blob://")).toBe(true);
    expect(isBlobRef("http://example.com")).toBe(false);
    expect(isBlobRef("")).toBe(false);
    expect(isBlobRef(null)).toBe(false);
    expect(isBlobRef(undefined)).toBe(false);
  });

  it("should extract hash from blob reference", () => {
    const hash = "abc123def456";
    const blobRef = `blob://${hash}`;
    expect(extractHash(blobRef)).toBe(hash);
  });
});

describe("MessageContentItem types", () => {
  it("should allow text content item", () => {
    const content: MessageContentItem = {
      type: "text",
      text: "Hello world",
    };
    expect(content.type).toBe("text");
    expect(content.text).toBe("Hello world");
  });

  it("should allow image content item", () => {
    const content: MessageContentItem = {
      type: "image",
      blob: "blob://abc123",
      mime: "image/png",
    };
    expect(content.type).toBe("image");
    expect(content.blob).toBe("blob://abc123");
    expect(content.mime).toBe("image/png");
  });

  it("should allow audio content item", () => {
    const content: MessageContentItem = {
      type: "audio",
      blob: "blob://def456",
      mime: "audio/mp3",
    };
    expect(content.type).toBe("audio");
    expect(content.mime).toBe("audio/mp3");
  });

  it("should allow video content item", () => {
    const content: MessageContentItem = {
      type: "video",
      blob: "blob://ghi789",
      mime: "video/mp4",
    };
    expect(content.type).toBe("video");
    expect(content.mime).toBe("video/mp4");
  });

  it("should allow file content item with filename", () => {
    const content: MessageContentItem = {
      type: "file",
      blob: "blob://jkl012",
      mime: "application/pdf",
      filename: "document.pdf",
    };
    expect(content.type).toBe("file");
    expect((content as any).filename).toBe("document.pdf");
  });

  it("should allow code content item with language", () => {
    const content: MessageContentItem = {
      type: "code",
      language: "typescript",
      blob: "blob://mno345",
    };
    expect(content.type).toBe("code");
    expect((content as any).language).toBe("typescript");
  });

  it("should allow document content item", () => {
    const content: MessageContentItem = {
      type: "document",
      blob: "blob://pqr678",
      mime: "application/json",
    };
    expect(content.type).toBe("document");
    expect(content.mime).toBe("application/json");
  });
});

describe("UserMessage", () => {
  it("should have schema_version field", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "test" }],
    };
    expect(message.schema_version).toBe("1.0");
  });

  it("should create text-only message with createTextMessage", () => {
    const message = createTextMessage("Hello world");
    
    expect(message.schema_version).toBe("1.0");
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe("text");
    expect(message.content[0].text).toBe("Hello world");
    expect(message.submittedAt).toBeDefined();
  });

  it("should identify V6 compliant messages (text-only)", () => {
    const textMessage = createTextMessage("Hello");
    expect(isV6Compliant(textMessage)).toBe(true);
  });

  it("should identify non-V6 compliant messages (with images)", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "Hello" },
        { type: "image", blob: "blob://abc", mime: "image/png" },
      ],
    };
    expect(isV6Compliant(message)).toBe(false);
  });

  it("should extract text content from message", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
        { type: "image", blob: "blob://abc", mime: "image/png" },
      ],
    };
    
    const texts = extractTextContent(message);
    expect(texts).toEqual(["Hello", "World"]);
  });

  it("should support derivedTexts field", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "test" }],
      derivedTexts: {
        ocr: "OCR result",
        summary: "Summary text",
      },
    };
    
    expect(message.derivedTexts).toBeDefined();
    expect(message.derivedTexts?.ocr).toBe("OCR result");
  });

  it("should support submitter and workItemId fields", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "test" }],
      submittedAt: 1234567890,
      submitter: { id: "agent-1", role: "dev" },
      workItemId: "work-item-123",
    };
    
    expect(message.submittedAt).toBe(1234567890);
    expect(message.submitter?.id).toBe("agent-1");
    expect(message.workItemId).toBe("work-item-123");
  });
});
// ============================================================================
// UserMessage Validation Tests (Requirement 14.1)
// ============================================================================

describe("UserMessage Validation", () => {
  describe("validateUserMessage", () => {
    it("should return no errors for valid text-only UserMessage", () => {
      const message = createTextMessage("Hello world");
      const errors = validateUserMessage(message);
      expect(errors).toHaveLength(0);
    });

    it("should return error when schema_version is missing", () => {
      const message = {
        content: [{ type: "text", text: "test" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "schema_version", message: "schema_version is required" })
      );
    });

    it("should return error when schema_version is invalid", () => {
      const message = {
        schema_version: "2.0",
        content: [{ type: "text", text: "test" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "schema_version", message: "schema_version must be '1.0'" })
      );
    });

    it("should return error when content is missing", () => {
      const message = {
        schema_version: "1.0",
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content", message: "content is required" })
      );
    });

    it("should return error when content is not an array", () => {
      const message = {
        schema_version: "1.0",
        content: "not an array",
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content", message: "content must be an array" })
      );
    });

    it("should return error when content is empty", () => {
      const message = {
        schema_version: "1.0",
        content: [],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content", message: "content must not be empty" })
      );
    });

    it("should return error when content item is not an object", () => {
      const message = {
        schema_version: "1.0",
        content: ["not an object"],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0]", message: "Content item must be an object" })
      );
    });

    it("should return error when content item type is missing", () => {
      const message = {
        schema_version: "1.0",
        content: [{ text: "test" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].type", message: "type is required" })
      );
    });

    it("should return error when content item type is invalid", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "invalid", text: "test" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: "content[0].type",
          message: "Invalid type 'invalid'. Valid types: text, image, audio, video, file, code, document",
        })
      );
    });

    it("should return error when text content is missing text field", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "text" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].text", message: "text must be a string" })
      );
    });

    it("should return error when image content is missing blob", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "image", mime: "image/png" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].blob", message: "blob is required" })
      );
    });

    it("should return error when image content is missing mime", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "image", blob: "blob://abc123" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].mime", message: "mime is required" })
      );
    });

    it("should return error when file content is missing filename", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "file", blob: "blob://abc123", mime: "application/pdf" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].filename", message: "filename is required" })
      );
    });

    it("should return error when code content is missing language", () => {
      const message = {
        schema_version: "1.0",
        content: [{ type: "code", blob: "blob://abc123" }],
      };
      const errors = validateUserMessage(message);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "content[0].language", message: "language is required" })
      );
    });

    it("should return error for non-object message", () => {
      const errors = validateUserMessage("not an object");
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "", message: "Message must be an object" })
      );
    });

    it("should return error for null message", () => {
      const errors = validateUserMessage(null);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: "", message: "Message must be an object" })
      );
    });

    it("should return multiple errors for multiple validation failures", () => {
      const message = {
        schema_version: "2.0",
        content: [],
      };
      const errors = validateUserMessage(message);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("isValidUserMessage", () => {
    it("should return true for valid UserMessage", () => {
      const message = createTextMessage("Hello");
      expect(isValidUserMessage(message)).toBe(true);
    });

    it("should return false for invalid UserMessage", () => {
      const message = { content: [] };
      expect(isValidUserMessage(message)).toBe(false);
    });

    it("should narrow type when used in type guard", () => {
      const message = createTextMessage("test");
      if (isValidUserMessage(message)) {
        // TypeScript should know message is UserMessage here
        expect(message.schema_version).toBe("1.0");
        expect(message.content).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Type Guards Tests (Requirement 14.1)
// ============================================================================

describe("MessageContentItem Type Guards", () => {
  it("should correctly identify text content", () => {
    const textItem: MessageContentItem = { type: "text", text: "hello" };
    const imageItem: MessageContentItem = { type: "image", blob: "blob://abc", mime: "image/png" };

    expect(isTextContent(textItem)).toBe(true);
    expect(isTextContent(imageItem)).toBe(false);
  });

  it("should correctly identify image content", () => {
    const textItem: MessageContentItem = { type: "text", text: "hello" };
    const imageItem: MessageContentItem = { type: "image", blob: "blob://abc", mime: "image/png" };

    expect(isImageContent(imageItem)).toBe(true);
    expect(isImageContent(textItem)).toBe(false);
  });

  it("should correctly identify audio content", () => {
    const audioItem: MessageContentItem = { type: "audio", blob: "blob://abc", mime: "audio/mp3" };
    const textItem: MessageContentItem = { type: "text", text: "hello" };

    expect(isAudioContent(audioItem)).toBe(true);
    expect(isAudioContent(textItem)).toBe(false);
  });

  it("should correctly identify video content", () => {
    const videoItem: MessageContentItem = { type: "video", blob: "blob://abc", mime: "video/mp4" };
    const textItem: MessageContentItem = { type: "text", text: "hello" };

    expect(isVideoContent(videoItem)).toBe(true);
    expect(isVideoContent(textItem)).toBe(false);
  });

  it("should correctly identify file content", () => {
    const fileItem: MessageContentItem = {
      type: "file",
      blob: "blob://abc",
      mime: "application/pdf",
      filename: "doc.pdf",
    };
    const textItem: MessageContentItem = { type: "text", text: "hello" };

    expect(isFileContent(fileItem)).toBe(true);
    expect(isFileContent(textItem)).toBe(false);
  });

  it("should correctly identify code content", () => {
    const codeItem: MessageContentItem = { type: "code", language: "typescript", blob: "blob://abc" };
    const textItem: MessageContentItem = { type: "text", text: "hello" };

    expect(isCodeContent(codeItem)).toBe(true);
    expect(isCodeContent(textItem)).toBe(false);
  });

  it("should correctly identify document content", () => {
    const docItem: MessageContentItem = {
      type: "document",
      blob: "blob://abc",
      mime: "application/json",
    };
    const textItem: MessageContentItem = { type: "text", text: "hello" };

    expect(isDocumentContent(docItem)).toBe(true);
    expect(isDocumentContent(textItem)).toBe(false);
  });

  it("should narrow type in type guard conditional", () => {
    const items: MessageContentItem[] = [
      { type: "text", text: "hello" },
      { type: "image", blob: "blob://abc", mime: "image/png" },
      { type: "audio", blob: "blob://def", mime: "audio/mp3" },
    ];

    const textItems = items.filter(isTextContent);
    expect(textItems).toHaveLength(1);
    expect(textItems[0].text).toBe("hello");

    const imageItems = items.filter(isImageContent);
    expect(imageItems).toHaveLength(1);
    expect(imageItems[0].mime).toBe("image/png");
  });

  it("should get correct content type", () => {
    expect(getContentType({ type: "text", text: "hello" })).toBe("text");
    expect(getContentType({ type: "image", blob: "blob://abc", mime: "image/png" })).toBe("image");
    expect(getContentType({ type: "audio", blob: "blob://abc", mime: "audio/mp3" })).toBe("audio");
    expect(getContentType({ type: "video", blob: "blob://abc", mime: "video/mp4" })).toBe("video");
    expect(
      getContentType({ type: "file", blob: "blob://abc", mime: "application/pdf", filename: "f" })
    ).toBe("file");
    expect(getContentType({ type: "code", language: "ts", blob: "blob://abc" })).toBe("code");
    expect(getContentType({ type: "document", blob: "blob://abc", mime: "application/json" })).toBe(
      "document"
    );
  });
});

// ============================================================================
// Serialization/Deserialization Tests (Requirement 14.1)
// ============================================================================

describe("UserMessage Serialization", () => {
  it("should serialize UserMessage to JSON string", () => {
    const message = createTextMessage("Hello world");
    const json = serializeUserMessage(message);

    expect(typeof json).toBe("string");
    expect(() => JSON.parse(json)).not.toThrow();

    const parsed = JSON.parse(json);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0].type).toBe("text");
    expect(parsed.content[0].text).toBe("Hello world");
  });

  it("should deserialize valid JSON to UserMessage", () => {
    const original = createTextMessage("Test message");
    const json = serializeUserMessage(original);
    const deserialized = deserializeUserMessage(json);

    expect(deserialized).not.toBeNull();
    expect(deserialized?.schema_version).toBe("1.0");
    expect(deserialized?.content).toHaveLength(1);
    expect(deserialized?.content[0].text).toBe("Test message");
  });

  it("should return null for invalid JSON", () => {
    const result = deserializeUserMessage("not valid json");
    expect(result).toBeNull();
  });

  it("should return null for JSON that doesn't match UserMessage schema", () => {
    const result = deserializeUserMessage('{"schema_version": "1.0", "content": []}');
    expect(result).toBeNull();
  });

  it("should handle complex UserMessage with all fields", () => {
    const complexMessage: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "Hello" },
        { type: "image", blob: "blob://abc123", mime: "image/png" },
      ],
      derivedTexts: { ocr: "Extracted text" },
      submittedAt: 1234567890,
      submitter: { id: "agent-1", role: "dev", sessionId: "session-1" },
      workItemId: "work-123",
    };

    const json = serializeUserMessage(complexMessage);
    const deserialized = deserializeUserMessage(json);

    expect(deserialized).not.toBeNull();
    expect(deserialized?.content).toHaveLength(2);
    expect(deserialized?.derivedTexts?.ocr).toBe("Extracted text");
    expect(deserialized?.submitter?.id).toBe("agent-1");
    expect(deserialized?.workItemId).toBe("work-123");
  });

  it("should handle round-trip serialization/deserialization", () => {
    const original: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "First message" },
        { type: "text", text: "Second message" },
        {
          type: "image",
          blob: "blob://abc123def456",
          mime: "image/jpeg",
        },
      ],
      derivedTexts: {
        ocr: "OCR result",
        summary: "Summary",
      },
      submittedAt: 1234567890,
    };

    const json = serializeUserMessage(original);
    const result = deserializeUserMessage(json);

    expect(result).not.toBeNull();
    expect(result).toEqual(original);
  });

  it("should handle multimodal content types in serialization", () => {
    const multimodalMessage: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "Check this image" },
        { type: "image", blob: "blob://img123", mime: "image/png" },
        { type: "audio", blob: "blob://audio456", mime: "audio/mp3" },
        { type: "video", blob: "blob://video789", mime: "video/mp4" },
        { type: "file", blob: "blob://file101", mime: "application/pdf", filename: "doc.pdf" },
        { type: "code", language: "typescript", blob: "blob://code202" },
        { type: "document", blob: "blob://doc303", mime: "application/json" },
      ],
    };

    const json = serializeUserMessage(multimodalMessage);
    const result = deserializeUserMessage(json);

    expect(result).not.toBeNull();
    expect(result?.content).toHaveLength(7);
  });
});

describe("cloneUserMessage", () => {
  it("should create a deep clone of UserMessage", () => {
    const original: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "Original" }],
      derivedTexts: { key: "value" },
    };

    const cloned = cloneUserMessage(original);

    // Modify the clone
    cloned.content[0].text = "Modified";
    cloned.derivedTexts!.key = "modified";

    // Original should not be affected
    expect(original.content[0].text).toBe("Original");
    expect(original.derivedTexts?.key).toBe("value");
  });

  it("should return valid UserMessage", () => {
    const original = createTextMessage("Test");
    const cloned = cloneUserMessage(original);

    expect(isValidUserMessage(cloned)).toBe(true);
    expect(cloned).toEqual(original);
  });

  it("should handle null/undefined optional fields", () => {
    const message: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "Test" }],
    };

    const cloned = cloneUserMessage(message);
    expect(cloned.derivedTexts).toBeUndefined();
    expect(cloned.submitter).toBeUndefined();
    expect(cloned.workItemId).toBeUndefined();
  });
});
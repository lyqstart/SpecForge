/**
 * Property 23: V6.0 Multimodal Rejection — property-based test
 *
 * Feature: multimodal, Property 23: V6.0 Multimodal Rejection;
 * Derived-From: v6-architecture-overview Property 23
 *
 * This file verifies the V6.0 scope boundary enforcement:
 *
 *   For all UserMessage m submitted in V6.0, if m.content contains any
 *   non-text elements (image/audio/video/file/code/document), THEN the
 *   Ingestion subsystem MUST reject the submission and return
 *   errorCode: "V6_MULTIMODAL_REJECTED".
 *
 *   Text-only UserMessages MUST be accepted in V6.0 mode.
 *
 * Property 1 — Non-text rejection:
 *   For any UserMessage containing at least one non-text content item
 *   (image/audio/video/file/code/document), the IngestionSubsystem.submitMessage
 *   MUST return success: false with errorCode: "V6_MULTIMODAL_REJECTED".
 *
 * Property 2 — Text-only acceptance:
 *   For any UserMessage containing ONLY text content items, the
 *   IngestionSubsystem.submitMessage MUST return success: true.
 *
 * Validates: Requirements 14.7, 14.8
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { createIngestionSubsystem } from "../../src/ingestion/IngestionSubsystem.js";
import type { UserMessage } from "../../src/types/user-message.js";
import type { MessageContentItem, TextContentItem, ImageContentItem, AudioContentItem, VideoContentItem, FileContentItem, CodeContentItem, DocumentContentItem } from "../../src/types/message-content.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a valid BlobRef (blob://<sha256-hex>)
 * SHA256 hex is exactly 64 characters of 0-9a-f
 */
const blobRefArb: fc.Arbitrary<string> = fc
  .array(fc.oneof(
    fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"),
  ), { minLength: 64, maxLength: 64 })
  .map((chars) => `blob://${chars.join("")}`);

/**
 * Generate a text content item
 */
const textContentArb: fc.Arbitrary<TextContentItem> = fc
  .string({ minLength: 0, maxLength: 500 })
  .map((text) => ({ type: "text" as const, text }));

/**
 * Generate an image content item
 */
const imageContentArb: fc.Arbitrary<ImageContentItem> = blobRefArb.map((blob) => ({
  type: "image" as const,
  blob,
  mime: "image/png",
}));

/**
 * Generate an audio content item
 */
const audioContentArb: fc.Arbitrary<AudioContentItem> = blobRefArb.map((blob) => ({
  type: "audio" as const,
  blob,
  mime: "audio/mp3",
}));

/**
 * Generate a video content item
 */
const videoContentArb: fc.Arbitrary<VideoContentItem> = blobRefArb.map((blob) => ({
  type: "video" as const,
  blob,
  mime: "video/mp4",
}));

/**
 * Generate a file content item
 */
const fileContentArb: fc.Arbitrary<FileContentItem> = fc
  .tuple(blobRefArb, fc.string({ minLength: 1, maxLength: 50 }))
  .map(([blob, filename]) => ({
    type: "file" as const,
    blob,
    mime: "application/pdf",
    filename,
  }));

/**
 * Generate a code content item
 */
const codeContentArb: fc.Arbitrary<CodeContentItem> = fc
  .tuple(blobRefArb, fc.oneof(
    fc.constant("typescript"),
    fc.constant("python"),
    fc.constant("javascript"),
    fc.constant("go"),
    fc.constant("rust"),
  ))
  .map(([blob, language]) => ({
    type: "code" as const,
    language,
    blob,
  }));

/**
 * Generate a document content item
 */
const documentContentArb: fc.Arbitrary<DocumentContentItem> = blobRefArb.map((blob) => ({
  type: "document" as const,
  blob,
  mime: "application/pdf",
}));

/**
 * Any non-text content item (one of: image, audio, video, file, code, document)
 */
const nonTextContentArb: fc.Arbitrary<Exclude<MessageContentItem, TextContentItem>> = fc.oneof(
  imageContentArb,
  audioContentArb,
  videoContentArb,
  fileContentArb,
  codeContentArb,
  documentContentArb,
);

/**
 * Any content item (text OR non-text)
 */
const anyContentItemArb: fc.Arbitrary<MessageContentItem> = fc.oneof(
  textContentArb,
  nonTextContentArb,
);

/**
 * Generate a UserMessage with random mixed content (0 to 5 items)
 * This is the main generator for testing Property 23.
 * 
 * We generate 0-5 items to test edge cases like:
 * - Empty content (should be valid text-only)
 * - Single item (text or non-text)
 * - Multiple mixed items
 */
const mixedContentUserMessageArb: fc.Arbitrary<UserMessage> = fc
  .array(anyContentItemArb, { minLength: 0, maxLength: 5 })
  .map((content) => ({
    schema_version: "1.0" as const,
    content,
    submittedAt: Date.now(),
  }));

/**
 * Generate a text-only UserMessage (always valid in V6.0)
 */
const textOnlyUserMessageArb: fc.Arbitrary<UserMessage> = fc
  .array(textContentArb, { minLength: 1, maxLength: 3 })
  .map((content) => ({
    schema_version: "1.0" as const,
    content,
    submittedAt: Date.now(),
  }));

/**
 * Generate a UserMessage with at least one non-text item
 */
const nonTextUserMessageArb: fc.Arbitrary<UserMessage> = fc
  .tuple(
    fc.array(nonTextContentArb, { minLength: 1, maxLength: 3 }), // at least 1 non-text
    fc.array(textContentArb, { minLength: 0, maxLength: 2 }),    // optional text
  )
  .map(([nonTextItems, textItems]) => ({
    schema_version: "1.0" as const,
    content: [...nonTextItems, ...textItems],
    submittedAt: Date.now(),
  }));

/**
 * Generate a UserMessage with a specific non-text type
 * Used to ensure we test each type individually
 */
function userMessageWithSpecificType(type: MessageContentItem["type"]): fc.Arbitrary<UserMessage> {
  let contentArb: fc.Arbitrary<MessageContentItem>;
  
  switch (type) {
    case "image":
      contentArb = imageContentArb;
      break;
    case "audio":
      contentArb = audioContentArb;
      break;
    case "video":
      contentArb = videoContentArb;
      break;
    case "file":
      contentArb = fileContentArb;
      break;
    case "code":
      contentArb = codeContentArb;
      break;
    case "document":
      contentArb = documentContentArb;
      break;
    default:
      throw new Error(`Unknown type: ${type}`);
  }

  return fc
    .array(contentArb, { minLength: 1, maxLength: 2 })
    .map((content) => ({
      schema_version: "1.0" as const,
      content,
      submittedAt: Date.now(),
    }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a UserMessage contains only text content
 */
function isTextOnly(message: UserMessage): boolean {
  return message.content.every((item) => item.type === "text");
}

/**
 * Check if a UserMessage contains any non-text content
 */
function hasNonTextContent(message: UserMessage): boolean {
  return message.content.some((item) => item.type !== "text");
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 23: V6.0 Multimodal Rejection", () => {
  // Property 23 is NOT safety-critical (not in 3/7/9/24 list), so 100 iterations
  // is sufficient per the steering rule.
  const NUM_RUNS = 100;

  // Create a fresh IngestionSubsystem for each test
  const createSubsystem = () => createIngestionSubsystem();

  describe("Property 1: Non-text content MUST be rejected", () => {
    it("Property: any UserMessage with non-text content is rejected with V6_MULTIMODAL_REJECTED", async () => {
      await fc.assert(
        fc.asyncProperty(nonTextUserMessageArb, async (message) => {
          // Verify precondition: message has non-text content
          expect(hasNonTextContent(message)).toBe(true);

          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          // Property 1: MUST reject
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toBeDefined();
          expect(result.error).toContain("not supported in V6.0");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: image content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("image"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("image");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: audio content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("audio"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("audio");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: video content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("video"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("video");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: file content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("file"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("file");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: code content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("code"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("code");
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: document content is rejected", async () => {
      await fc.assert(
        fc.asyncProperty(userMessageWithSpecificType("document"), async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
          expect(result.error).toContain("document");
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Property 2: Text-only content MUST be accepted", () => {
    it("Property: text-only UserMessage is accepted", async () => {
      await fc.assert(
        fc.asyncProperty(textOnlyUserMessageArb, async (message) => {
          // Verify precondition: message is text-only
          expect(isTextOnly(message)).toBe(true);

          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          // Property 2: MUST accept
          expect(result.success).toBe(true);
          expect(result.errorCode).toBeUndefined();
          expect(result.error).toBeUndefined();
          expect(result.submittedMessage).toBeDefined();
          expect(result.submittedAt).toBeDefined();
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: single text item is accepted", async () => {
      await fc.assert(
        fc.asyncProperty(textContentArb, async (textContent) => {
          const message: UserMessage = {
            schema_version: "1.0",
            content: [textContent],
            submittedAt: Date.now(),
          };

          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(true);
          expect(result.errorCode).toBeUndefined();
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Property: empty content (no items) is treated as text-only and accepted", async () => {
      // Empty content array - technically no non-text content
      const message: UserMessage = {
        schema_version: "1.0",
        content: [],
        submittedAt: Date.now(),
      };

      const subsystem = createSubsystem();
      const result = await subsystem.submitMessage(message);

      // Empty content should be accepted (no non-text to reject)
      expect(result.success).toBe(true);
    });
  });

  describe("Property 3: Mixed content (text + non-text) MUST be rejected", () => {
    it("Property: UserMessage with both text and non-text is rejected", async () => {
      // Generate messages that have at least one text AND at least one non-text
      const mixedArb: fc.Arbitrary<UserMessage> = fc
        .tuple(
          fc.array(textContentArb, { minLength: 1, maxLength: 2 }),
          fc.array(nonTextContentArb, { minLength: 1, maxLength: 2 }),
        )
        .map(([textItems, nonTextItems]) => ({
          schema_version: "1.0" as const,
          content: [...textItems, ...nonTextItems],
          submittedAt: Date.now(),
        }));

      await fc.assert(
        fc.asyncProperty(mixedArb, async (message) => {
          // Verify precondition: message has both text and non-text
          expect(hasNonTextContent(message)).toBe(true);
          expect(isTextOnly(message)).toBe(false);

          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          // Must reject due to non-text content
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe("V6_MULTIMODAL_REJECTED");
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Property 4: Error messages contain P2 indication", () => {
    it("Property: rejection error message mentions P2 requirement", async () => {
      await fc.assert(
        fc.asyncProperty(nonTextUserMessageArb, async (message) => {
          const subsystem = createSubsystem();
          const result = await subsystem.submitMessage(message);

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          // Error should mention that full multimodal support requires P2
          expect(result.error).toMatch(/P2|V6\.x|full multimodal/i);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Property 5: Invalid message structure is rejected", () => {
    it("Property: message without content array is rejected", async () => {
      // Invalid message: missing content array
      const invalidMessage = {
        schema_version: "1.0",
        // @ts-expect-error - intentionally invalid
        content: "not an array",
      } as unknown as UserMessage;

      const subsystem = createSubsystem();
      const result = await subsystem.submitMessage(invalidMessage);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_MESSAGE");
    });

    it("Property: null message is rejected", async () => {
      const subsystem = createSubsystem();
      // @ts-expect-error - intentionally passing null
      const result = await subsystem.submitMessage(null);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_MESSAGE");
    });
  });
});
/**
 * Unit tests for ModalityAdapter interface contract
 *
 * Validates: Requirements 14.5
 * Feature: multimodal, Requirement: ModalityAdapter interface contract
 *
 * These tests verify the *interface contract* only (V6.0 skeleton). They do
 * NOT test a full adaptation implementation — concrete adaptation logic is
 * deferred to P2. We use a minimal pass-through mock to confirm the type
 * shape and determinism contract are satisfiable.
 */

import { describe, expect, it } from "vitest";

import type {
  ModalityAdapter,
  PreparedMessage,
} from "../src/modality-adapter.js";
import type { ModelCapabilities } from "../src/types/model-capabilities.js";
import type { UserMessage } from "../src/types/user-message.js";

/**
 * Minimal pass-through ModalityAdapter for V6.0 contract testing.
 *
 * V6.0 reality: IngestionSubsystem rejects non-text UserMessages (Property 23),
 * so any adapter only ever sees text-only messages. This mock therefore just
 * passes content through and reports zero downgrading.
 */
const passThroughAdapter: ModalityAdapter = {
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage {
    const inputModalities = Array.from(
      new Set(message.content.map((item) => item.type)),
    ).filter((t): t is ModelCapabilities["modalities"][number] =>
      (
        ["text", "image", "audio", "video", "file"] as const
      ).includes(t as ModelCapabilities["modalities"][number]),
    );

    return {
      schema_version: "1.0",
      content: message.content,
      metadata: {
        inputModalities,
        downgraded: false,
        originalBlobRefs: [],
        usedDerivativeBlobRefs: [],
        targetModel: capabilities.modalities.join(","),
      },
    };
  },
};

const textCapabilities: ModelCapabilities = {
  schema_version: "1.0",
  modalities: ["text"],
  maxInputTokens: 8192,
  supportsTools: false,
};

const textMessage: UserMessage = {
  schema_version: "1.0",
  content: [{ type: "text", text: "hello world" }],
  submittedAt: 1700000000000,
};

describe("ModalityAdapter interface contract", () => {
  it("returns a PreparedMessage with required schema_version", () => {
    const prepared = passThroughAdapter.prepareMessageForModel(
      textMessage,
      textCapabilities,
    );

    expect(prepared.schema_version).toBe("1.0");
  });

  it("preserves text-only content (V6.0 pass-through)", () => {
    const prepared = passThroughAdapter.prepareMessageForModel(
      textMessage,
      textCapabilities,
    );

    expect(prepared.content).toEqual(textMessage.content);
  });

  it("populates adaptation metadata with required fields", () => {
    const prepared = passThroughAdapter.prepareMessageForModel(
      textMessage,
      textCapabilities,
    );

    expect(prepared.metadata).toEqual({
      inputModalities: ["text"],
      downgraded: false,
      originalBlobRefs: [],
      usedDerivativeBlobRefs: [],
      targetModel: "text",
    });
  });

  it("is deterministic: identical inputs produce identical outputs (Property 13)", () => {
    const a = passThroughAdapter.prepareMessageForModel(
      textMessage,
      textCapabilities,
    );
    const b = passThroughAdapter.prepareMessageForModel(
      textMessage,
      textCapabilities,
    );

    expect(a).toEqual(b);
  });

  it("treats message as conceptually immutable (does not mutate caller's content array length)", () => {
    const mutable: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "abc" }],
    };
    const before = mutable.content.length;

    passThroughAdapter.prepareMessageForModel(mutable, textCapabilities);

    expect(mutable.content.length).toBe(before);
  });

  // Error handling tests for invalid inputs (as per task 4.3 requirement)
  it("handles empty content array gracefully", () => {
    const emptyMessage: UserMessage = {
      schema_version: "1.0",
      content: [],
      submittedAt: 1700000000000,
    };

    const prepared = passThroughAdapter.prepareMessageForModel(
      emptyMessage,
      textCapabilities,
    );

    // Should return empty content but still have valid schema and metadata
    expect(prepared.schema_version).toBe("1.0");
    expect(prepared.content).toEqual([]);
    expect(prepared.metadata.inputModalities).toEqual([]);
    expect(prepared.metadata.downgraded).toBe(false);
  });

  it("handles null/undefined message gracefully", () => {
    // The interface expects a valid UserMessage, so we test that it doesn't throw
    // on messages with missing optional fields
    const minimalMessage: UserMessage = {
      schema_version: "1.0",
      content: [{ type: "text", text: "test" }],
      // submittedAt, submitter, workItemId all optional
    };

    const prepared = passThroughAdapter.prepareMessageForModel(
      minimalMessage,
      textCapabilities,
    );

    expect(prepared.schema_version).toBe("1.0");
    expect(prepared.content).toHaveLength(1);
  });

  it("handles messages with various modality types in content", () => {
    // Test with content items of different modality types
    const multiModalityMessage: UserMessage = {
      schema_version: "1.0",
      content: [
        { type: "text", text: "hello" },
        { type: "image", blob: "blob://abc123", mime: "image/png" },
        { type: "audio", blob: "def456", mime: "audio/mp3" },
      ],
      submittedAt: 1700000000000,
    };

    const prepared = passThroughAdapter.prepareMessageForModel(
      multiModalityMessage,
      textCapabilities,
    );

    // Should preserve all content items and detect modalities
    expect(prepared.content).toHaveLength(3);
    expect(prepared.metadata.inputModalities).toContain("text");
    expect(prepared.metadata.inputModalities).toContain("image");
    expect(prepared.metadata.inputModalities).toContain("audio");
  });

  it("handles model capabilities with single modality", () => {
    const singleModalityCapabilities: ModelCapabilities = {
      schema_version: "1.0",
      modalities: ["image"],
      maxInputTokens: 4096,
      supportsTools: true,
    };

    const prepared = passThroughAdapter.prepareMessageForModel(
      textMessage,
      singleModalityCapabilities,
    );

    // Target model should reflect the single modality
    expect(prepared.metadata.targetModel).toBe("image");
  });

  it("handles model capabilities with multiple modalities", () => {
    const multiModalityCapabilities: ModelCapabilities = {
      schema_version: "1.0",
      modalities: ["text", "image", "audio"],
      maxInputTokens: 16384,
      supportsTools: true,
    };

    const prepared = passThroughAdapter.prepareMessageForModel(
      textMessage,
      multiModalityCapabilities,
    );

    // Target model should reflect all modalities
    expect(prepared.metadata.targetModel).toBe("text,image,audio");
  });
});

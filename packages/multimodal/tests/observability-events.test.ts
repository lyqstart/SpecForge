/**
 * Unit tests for multimodal observability events
 * 
 * Tests ModalityAdaptationEvent and MultimodalRejectionEvent schemas
 * 
 * Validates: Requirements 14.6
 */

import { describe, it, expect } from "vitest";
import {
  type ModalityAdaptationEvent,
  type MultimodalRejectionEvent,
  type MultimodalObservabilityEvent,
  type EventValidationError,
  createModalityAdaptationEvent,
  createMultimodalRejectionEvent,
  validateModalityAdaptationEvent,
  validateMultimodalRejectionEvent,
  isModalityAdaptationEvent,
  isMultimodalRejectionEvent,
  isMultimodalObservabilityEvent,
  serializeObservabilityEvent,
  deserializeObservabilityEvent,
} from "../src/types/observability-events.js";

describe("ModalityAdaptationEvent", () => {
  it("should create a valid modality adaptation event", () => {
    const event = createModalityAdaptationEvent(
      ["text", "image"],
      "gpt-4-vision-preview",
      true,
      ["blob://abc123", "blob://def456"],
      {
        usedDerivativeBlobRef: "blob://ocr-text-123",
        sessionId: "session-123",
        workItemId: "WI-042",
        messageId: "msg-789",
        eventId: "test-event-id-123",
        ts: 1234567890,
      }
    );

    expect(event.schema_version).toBe("1.0");
    expect(event.eventId).toBe("test-event-id-123");
    expect(event.ts).toBe(1234567890);
    expect(event.category).toBe("modality");
    expect(event.action).toBe("adaptation.decision");
    expect(event.payload.inputModalities).toEqual(["text", "image"]);
    expect(event.payload.targetModel).toBe("gpt-4-vision-preview");
    expect(event.payload.downgraded).toBe(true);
    expect(event.payload.usedDerivativeBlobRef).toBe("blob://ocr-text-123");
    expect(event.payload.originalBlobRefs).toEqual(["blob://abc123", "blob://def456"]);
    expect(event.payload.sessionId).toBe("session-123");
    expect(event.payload.workItemId).toBe("WI-042");
    expect(event.payload.messageId).toBe("msg-789");
  });

  it("should create event with minimal required fields", () => {
    const event = createModalityAdaptationEvent(
      ["text"],
      "gpt-4",
      false,
      [],
      {
        eventId: "test-event-id-456",
        ts: 1234567890,
      }
    );

    expect(event.schema_version).toBe("1.0");
    expect(event.eventId).toBe("test-event-id-456");
    expect(event.ts).toBe(1234567890);
    expect(event.category).toBe("modality");
    expect(event.action).toBe("adaptation.decision");
    expect(event.payload.inputModalities).toEqual(["text"]);
    expect(event.payload.targetModel).toBe("gpt-4");
    expect(event.payload.downgraded).toBe(false);
    expect(event.payload.usedDerivativeBlobRef).toBeUndefined();
    expect(event.payload.originalBlobRefs).toEqual([]);
    expect(event.payload.sessionId).toBeUndefined();
    expect(event.payload.workItemId).toBeUndefined();
    expect(event.payload.messageId).toBeUndefined();
  });

  it("should validate a valid modality adaptation event", () => {
    const event: ModalityAdaptationEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "adaptation.decision",
      payload: {
        inputModalities: ["text", "image"],
        targetModel: "gpt-4-vision-preview",
        downgraded: true,
        usedDerivativeBlobRef: "blob://ocr-123",
        originalBlobRefs: ["blob://abc123", "blob://def456"],
      },
    };

    const errors = validateModalityAdaptationEvent(event);
    expect(errors).toEqual([]);
  });

  it("should return validation errors for invalid modality adaptation event", () => {
    const invalidEvent = {
      schema_version: "2.0", // Wrong version
      eventId: 123, // Wrong type
      ts: "not-a-number", // Wrong type
      category: "wrong-category", // Wrong category
      action: "wrong-action", // Wrong action
      payload: {
        inputModalities: "not-an-array", // Wrong type
        targetModel: 123, // Wrong type
        downgraded: "not-a-boolean", // Wrong type
        originalBlobRefs: "not-an-array", // Wrong type
      },
    };

    const errors = validateModalityAdaptationEvent(invalidEvent);
    expect(errors.length).toBeGreaterThan(0);
    
    // Check for specific errors
    const errorFields = errors.map(e => e.field);
    expect(errorFields).toContain("schema_version");
    expect(errorFields).toContain("eventId");
    expect(errorFields).toContain("ts");
    expect(errorFields).toContain("category");
    expect(errorFields).toContain("action");
    expect(errorFields).toContain("payload.inputModalities");
    expect(errorFields).toContain("payload.targetModel");
    expect(errorFields).toContain("payload.downgraded");
    expect(errorFields).toContain("payload.originalBlobRefs");
  });

  it("should validate missing required fields", () => {
    const invalidEvent = {
      // Missing all required fields
    };

    const errors = validateModalityAdaptationEvent(invalidEvent);
    expect(errors.length).toBeGreaterThan(0);
    // The first error should be about missing schema_version
    expect(errors[0].field).toBe("schema_version");
    expect(errors[0].message).toBe("schema_version is required");
  });

  it("should correctly identify modality adaptation event with type guard", () => {
    const validEvent: ModalityAdaptationEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "adaptation.decision",
      payload: {
        inputModalities: ["text"],
        targetModel: "gpt-4",
        downgraded: false,
        originalBlobRefs: [],
      },
    };

    const invalidEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "wrong-action", // Wrong action
      payload: {
        inputModalities: ["text"],
        targetModel: "gpt-4",
        downgraded: false,
        originalBlobRefs: [],
      },
    };

    expect(isModalityAdaptationEvent(validEvent)).toBe(true);
    expect(isModalityAdaptationEvent(invalidEvent)).toBe(false);
  });
});

describe("MultimodalRejectionEvent", () => {
  it("should create a valid multimodal rejection event", () => {
    const event = createMultimodalRejectionEvent(
      ["image", "audio"],
      "Multimodal content not supported in V6.0. Full support requires P2 (V6.x).",
      {
        sessionId: "session-123",
        workItemId: "WI-042",
        messageId: "msg-789",
        eventId: "test-event-id-789",
        ts: 1234567890,
      }
    );

    expect(event.schema_version).toBe("1.0");
    expect(event.eventId).toBe("test-event-id-789");
    expect(event.ts).toBe(1234567890);
    expect(event.category).toBe("modality");
    expect(event.action).toBe("rejection.v6_boundary");
    expect(event.payload.rejectedModalities).toEqual(["image", "audio"]);
    expect(event.payload.errorCode).toBe("V6_MULTIMODAL_REJECTED");
    expect(event.payload.message).toBe("Multimodal content not supported in V6.0. Full support requires P2 (V6.x).");
    expect(event.payload.sessionId).toBe("session-123");
    expect(event.payload.workItemId).toBe("WI-042");
    expect(event.payload.messageId).toBe("msg-789");
  });

  it("should create event with minimal required fields", () => {
    const event = createMultimodalRejectionEvent(
      ["image"],
      "Image content not supported",
      {
        eventId: "test-event-id-abc",
        ts: 1234567890,
      }
    );

    expect(event.schema_version).toBe("1.0");
    expect(event.eventId).toBe("test-event-id-abc");
    expect(event.ts).toBe(1234567890);
    expect(event.category).toBe("modality");
    expect(event.action).toBe("rejection.v6_boundary");
    expect(event.payload.rejectedModalities).toEqual(["image"]);
    expect(event.payload.errorCode).toBe("V6_MULTIMODAL_REJECTED");
    expect(event.payload.message).toBe("Image content not supported");
    expect(event.payload.sessionId).toBeUndefined();
    expect(event.payload.workItemId).toBeUndefined();
    expect(event.payload.messageId).toBeUndefined();
  });

  it("should validate a valid multimodal rejection event", () => {
    const event: MultimodalRejectionEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "rejection.v6_boundary",
      payload: {
        rejectedModalities: ["image", "audio"],
        errorCode: "V6_MULTIMODAL_REJECTED",
        message: "Multimodal content not supported",
      },
    };

    const errors = validateMultimodalRejectionEvent(event);
    expect(errors).toEqual([]);
  });

  it("should return validation errors for invalid multimodal rejection event", () => {
    const invalidEvent = {
      schema_version: "2.0", // Wrong version
      eventId: 123, // Wrong type
      ts: "not-a-number", // Wrong type
      category: "wrong-category", // Wrong category
      action: "wrong-action", // Wrong action
      payload: {
        rejectedModalities: "not-an-array", // Wrong type
        errorCode: "WRONG_ERROR_CODE", // Wrong error code
        message: 123, // Wrong type
      },
    };

    const errors = validateMultimodalRejectionEvent(invalidEvent);
    expect(errors.length).toBeGreaterThan(0);
    
    // Check for specific errors
    const errorFields = errors.map(e => e.field);
    expect(errorFields).toContain("schema_version");
    expect(errorFields).toContain("eventId");
    expect(errorFields).toContain("ts");
    expect(errorFields).toContain("category");
    expect(errorFields).toContain("action");
    expect(errorFields).toContain("payload.rejectedModalities");
    expect(errorFields).toContain("payload.errorCode");
    expect(errorFields).toContain("payload.message");
  });

  it("should correctly identify multimodal rejection event with type guard", () => {
    const validEvent: MultimodalRejectionEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "rejection.v6_boundary",
      payload: {
        rejectedModalities: ["image"],
        errorCode: "V6_MULTIMODAL_REJECTED",
        message: "Image not supported",
      },
    };

    const invalidEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "wrong-action", // Wrong action
      payload: {
        rejectedModalities: ["image"],
        errorCode: "V6_MULTIMODAL_REJECTED",
        message: "Image not supported",
      },
    };

    expect(isMultimodalRejectionEvent(validEvent)).toBe(true);
    expect(isMultimodalRejectionEvent(invalidEvent)).toBe(false);
  });
});

describe("MultimodalObservabilityEvent union", () => {
  it("should correctly identify any valid observability event", () => {
    const adaptationEvent: ModalityAdaptationEvent = {
      schema_version: "1.0",
      eventId: "event-1",
      ts: 1234567890,
      category: "modality",
      action: "adaptation.decision",
      payload: {
        inputModalities: ["text"],
        targetModel: "gpt-4",
        downgraded: false,
        originalBlobRefs: [],
      },
    };

    const rejectionEvent: MultimodalRejectionEvent = {
      schema_version: "1.0",
      eventId: "event-2",
      ts: 1234567890,
      category: "modality",
      action: "rejection.v6_boundary",
      payload: {
        rejectedModalities: ["image"],
        errorCode: "V6_MULTIMODAL_REJECTED",
        message: "Image not supported",
      },
    };

    const invalidEvent = {
      schema_version: "1.0",
      eventId: "event-3",
      ts: 1234567890,
      category: "modality",
      action: "unknown-action", // Unknown action
      payload: {},
    };

    expect(isMultimodalObservabilityEvent(adaptationEvent)).toBe(true);
    expect(isMultimodalObservabilityEvent(rejectionEvent)).toBe(true);
    expect(isMultimodalObservabilityEvent(invalidEvent)).toBe(false);
  });
});

describe("Serialization and Deserialization", () => {
  it("should serialize and deserialize a modality adaptation event", () => {
    const originalEvent: ModalityAdaptationEvent = {
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "adaptation.decision",
      payload: {
        inputModalities: ["text", "image"],
        targetModel: "gpt-4-vision-preview",
        downgraded: true,
        usedDerivativeBlobRef: "blob://ocr-123",
        originalBlobRefs: ["blob://abc123", "blob://def456"],
        sessionId: "session-123",
      },
    };

    const json = serializeObservabilityEvent(originalEvent);
    expect(typeof json).toBe("string");
    
    const deserialized = deserializeObservabilityEvent(json);
    expect(deserialized).toEqual(originalEvent);
  });

  it("should serialize and deserialize a multimodal rejection event", () => {
    const originalEvent: MultimodalRejectionEvent = {
      schema_version: "1.0",
      eventId: "event-456",
      ts: 1234567890,
      category: "modality",
      action: "rejection.v6_boundary",
      payload: {
        rejectedModalities: ["image", "audio"],
        errorCode: "V6_MULTIMODAL_REJECTED",
        message: "Multimodal content not supported",
        workItemId: "WI-042",
      },
    };

    const json = serializeObservabilityEvent(originalEvent);
    expect(typeof json).toBe("string");
    
    const deserialized = deserializeObservabilityEvent(json);
    expect(deserialized).toEqual(originalEvent);
  });

  it("should return null for invalid JSON", () => {
    const invalidJson = "{ invalid json }";
    const result = deserializeObservabilityEvent(invalidJson);
    expect(result).toBeNull();
  });

  it("should return null for valid JSON but invalid event", () => {
    const invalidEventJson = JSON.stringify({
      schema_version: "1.0",
      eventId: "event-123",
      ts: 1234567890,
      category: "modality",
      action: "unknown-action", // Invalid action
      payload: {},
    });

    const result = deserializeObservabilityEvent(invalidEventJson);
    expect(result).toBeNull();
  });
});

describe("Event Examples", () => {
  it("should create realistic adaptation event examples", () => {
    // Example 1: Text-only message, no adaptation needed
    const textOnlyEvent = createModalityAdaptationEvent(
      ["text"],
      "gpt-4",
      false,
      [],
      {
        eventId: "event-text-only",
        ts: 1234567890,
      }
    );
    
    expect(textOnlyEvent.payload.downgraded).toBe(false);
    expect(textOnlyEvent.payload.usedDerivativeBlobRef).toBeUndefined();

    // Example 2: Image message downgraded to text via OCR
    const imageDowngradeEvent = createModalityAdaptationEvent(
      ["image"],
      "gpt-3.5-turbo", // Doesn't support images
      true,
      ["blob://image-sha256-123"],
      {
        usedDerivativeBlobRef: "blob://ocr-text-sha456",
        eventId: "event-image-downgrade",
        ts: 1234567890,
      }
    );
    
    expect(imageDowngradeEvent.payload.downgraded).toBe(true);
    expect(imageDowngradeEvent.payload.usedDerivativeBlobRef).toBe("blob://ocr-text-sha456");

    // Example 3: Mixed content with partial downgrade
    const mixedContentEvent = createModalityAdaptationEvent(
      ["text", "image", "audio"],
      "gpt-4-vision-preview", // Supports text and images
      true, // Audio needs downgrade
      ["blob://text-123", "blob://image-456", "blob://audio-789"],
      {
        usedDerivativeBlobRef: "blob://transcription-abc",
        eventId: "event-mixed-content",
        ts: 1234567890,
      }
    );
    
    expect(mixedContentEvent.payload.downgraded).toBe(true);
    expect(mixedContentEvent.payload.inputModalities).toEqual(["text", "image", "audio"]);
  });

  it("should create realistic rejection event examples", () => {
    // Example 1: Single modality rejection
    const singleRejection = createMultimodalRejectionEvent(
      ["image"],
      "Image content not supported in V6.0. Full support requires P2 (V6.x).",
      {
        eventId: "event-single-rejection",
        ts: 1234567890,
      }
    );
    
    expect(singleRejection.payload.rejectedModalities).toEqual(["image"]);
    expect(singleRejection.payload.errorCode).toBe("V6_MULTIMODAL_REJECTED");

    // Example 2: Multiple modalities rejection
    const multiRejection = createMultimodalRejectionEvent(
      ["image", "audio", "video"],
      "Multimodal content (image, audio, video) not supported in V6.0. Full support requires P2 (V6.x).",
      {
        eventId: "event-multi-rejection",
        ts: 1234567890,
      }
    );
    
    expect(multiRejection.payload.rejectedModalities).toEqual(["image", "audio", "video"]);
    expect(multiRejection.payload.message).toContain("Multimodal content");

    // Example 3: Rejection with context
    const contextualRejection = createMultimodalRejectionEvent(
      ["document"],
      "PDF document processing not supported in V6.0. Full document support requires P2 (V6.x).",
      {
        sessionId: "session-123",
        workItemId: "WI-042",
        messageId: "msg-pdf-upload",
        eventId: "event-contextual-rejection",
        ts: 1234567890,
      }
    );
    
    expect(contextualRejection.payload.sessionId).toBe("session-123");
    expect(contextualRejection.payload.workItemId).toBe("WI-042");
    expect(contextualRejection.payload.messageId).toBe("msg-pdf-upload");
  });
});

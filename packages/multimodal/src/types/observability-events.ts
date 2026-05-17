/**
 * Observability Events for Multimodal Module
 * 
 * Defines event schemas for modality adaptation decisions and V6.0 rejection events.
 * 
 * Validates: Requirements 14.6
 * Feature: multimodal, Requirement: Observability events for modality adaptation decisions
 */

/**
 * Base event interface with common fields
 */
export interface BaseObservabilityEvent {
  /** Schema version for this event structure */
  schema_version: "1.0";
  
  /** Unique event identifier (UUID v4 recommended) */
  eventId: string;
  
  /** Timestamp when event occurred (Unix epoch ms) */
  ts: number;
  
  /** Event category for filtering and routing */
  category: "modality";
  
  /** Specific action within the category */
  action: string;
}

/**
 * Modality adaptation decision event
 * 
 * Recorded when a modality adaptation decision is made for a UserMessage
 * to prepare it for a specific model based on its capabilities.
 * 
 * This event captures the adaptation logic decision, including whether
 * downgrading was required and which derivative blob was used.
 */
export interface ModalityAdaptationEvent extends BaseObservabilityEvent {
  action: "adaptation.decision";
  
  /** Detailed payload of the adaptation decision */
  payload: {
    /** Array of input modality types (e.g., ["text", "image"]) */
    inputModalities: string[];
    
    /** Target model identifier for which adaptation was performed */
    targetModel: string;
    
    /** Whether adaptation required downgrading (e.g., image → text via OCR) */
    downgraded: boolean;
    
    /** Optional blob reference to the derivative used (e.g., OCR text blob) */
    usedDerivativeBlobRef?: string;
    
    /** Array of original blob references from the UserMessage */
    originalBlobRefs: string[];
    
    /** Optional session ID for correlation */
    sessionId?: string;
    
    /** Optional work item ID for correlation */
    workItemId?: string;
    
    /** Optional message ID for correlation */
    messageId?: string;
  };
}

/**
 * V6.0 multimodal rejection event
 * 
 * Recorded when a UserMessage containing non-text content is rejected
 * due to V6.0 scope boundary enforcement.
 * 
 * This event captures the rejection decision and provides context about
 * which modalities were rejected and the error message returned to the user.
 */
export interface MultimodalRejectionEvent extends BaseObservabilityEvent {
  action: "rejection.v6_boundary";
  
  /** Detailed payload of the rejection */
  payload: {
    /** Array of rejected modality types (e.g., ["image", "audio"]) */
    rejectedModalities: string[];
    
    /** Error code indicating V6.0 boundary enforcement */
    errorCode: "V6_MULTIMODAL_REJECTED";
    
    /** Human-readable error message explaining the rejection */
    message: string;
    
    /** Optional session ID for correlation */
    sessionId?: string;
    
    /** Optional work item ID for correlation */
    workItemId?: string;
    
    /** Optional message ID for correlation */
    messageId?: string;
  };
}

/**
 * Union type for all multimodal observability events
 */
export type MultimodalObservabilityEvent = 
  | ModalityAdaptationEvent
  | MultimodalRejectionEvent;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a modality adaptation decision event
 */
export function createModalityAdaptationEvent(
  inputModalities: string[],
  targetModel: string,
  downgraded: boolean,
  originalBlobRefs: string[],
  options?: {
    usedDerivativeBlobRef?: string;
    sessionId?: string;
    workItemId?: string;
    messageId?: string;
    eventId?: string;
    ts?: number;
  }
): ModalityAdaptationEvent {
  return {
    schema_version: "1.0",
    eventId: options?.eventId || crypto.randomUUID(),
    ts: options?.ts || Date.now(),
    category: "modality",
    action: "adaptation.decision",
    payload: {
      inputModalities,
      targetModel,
      downgraded,
      usedDerivativeBlobRef: options?.usedDerivativeBlobRef,
      originalBlobRefs,
      sessionId: options?.sessionId,
      workItemId: options?.workItemId,
      messageId: options?.messageId,
    },
  };
}

/**
 * Create a V6.0 multimodal rejection event
 */
export function createMultimodalRejectionEvent(
  rejectedModalities: string[],
  message: string,
  options?: {
    sessionId?: string;
    workItemId?: string;
    messageId?: string;
    eventId?: string;
    ts?: number;
  }
): MultimodalRejectionEvent {
  return {
    schema_version: "1.0",
    eventId: options?.eventId || crypto.randomUUID(),
    ts: options?.ts || Date.now(),
    category: "modality",
    action: "rejection.v6_boundary",
    payload: {
      rejectedModalities,
      errorCode: "V6_MULTIMODAL_REJECTED",
      message,
      sessionId: options?.sessionId,
      workItemId: options?.workItemId,
      messageId: options?.messageId,
    },
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validation error for observability events
 */
export interface EventValidationError {
  field: string;
  message: string;
}

/**
 * Validate a modality adaptation event
 */
export function validateModalityAdaptationEvent(
  event: unknown
): EventValidationError[] {
  const errors: EventValidationError[] = [];

  if (!event || typeof event !== "object") {
    errors.push({ field: "", message: "Event must be an object" });
    return errors;
  }

  const e = event as Record<string, unknown>;

  // Check schema_version
  if (!e["schema_version"]) {
    errors.push({ field: "schema_version", message: "schema_version is required" });
  } else if (e["schema_version"] !== "1.0") {
    errors.push({ field: "schema_version", message: "schema_version must be '1.0'" });
  }

  // Check eventId
  if (!e["eventId"]) {
    errors.push({ field: "eventId", message: "eventId is required" });
  } else if (typeof e["eventId"] !== "string") {
    errors.push({ field: "eventId", message: "eventId must be a string" });
  }

  // Check ts
  if (!e["ts"]) {
    errors.push({ field: "ts", message: "ts is required" });
  } else if (typeof e["ts"] !== "number") {
    errors.push({ field: "ts", message: "ts must be a number" });
  }

  // Check category
  if (!e["category"]) {
    errors.push({ field: "category", message: "category is required" });
  } else if (e["category"] !== "modality") {
    errors.push({ field: "category", message: "category must be 'modality'" });
  }

  // Check action
  if (!e["action"]) {
    errors.push({ field: "action", message: "action is required" });
  } else if (e["action"] !== "adaptation.decision") {
    errors.push({ field: "action", message: "action must be 'adaptation.decision'" });
  }

  // Check payload
  if (!e["payload"]) {
    errors.push({ field: "payload", message: "payload is required" });
    return errors;
  }

  const payload = e["payload"] as Record<string, unknown>;

  // Check inputModalities
  if (!payload["inputModalities"]) {
    errors.push({ field: "payload.inputModalities", message: "inputModalities is required" });
  } else if (!Array.isArray(payload["inputModalities"])) {
    errors.push({ field: "payload.inputModalities", message: "inputModalities must be an array" });
  }

  // Check targetModel
  if (!payload["targetModel"]) {
    errors.push({ field: "payload.targetModel", message: "targetModel is required" });
  } else if (typeof payload["targetModel"] !== "string") {
    errors.push({ field: "payload.targetModel", message: "targetModel must be a string" });
  }

  // Check downgraded
  if (payload["downgraded"] === undefined) {
    errors.push({ field: "payload.downgraded", message: "downgraded is required" });
  } else if (typeof payload["downgraded"] !== "boolean") {
    errors.push({ field: "payload.downgraded", message: "downgraded must be a boolean" });
  }

  // Check originalBlobRefs
  if (!payload["originalBlobRefs"]) {
    errors.push({ field: "payload.originalBlobRefs", message: "originalBlobRefs is required" });
  } else if (!Array.isArray(payload["originalBlobRefs"])) {
    errors.push({ field: "payload.originalBlobRefs", message: "originalBlobRefs must be an array" });
  }

  return errors;
}

/**
 * Validate a multimodal rejection event
 */
export function validateMultimodalRejectionEvent(
  event: unknown
): EventValidationError[] {
  const errors: EventValidationError[] = [];

  if (!event || typeof event !== "object") {
    errors.push({ field: "", message: "Event must be an object" });
    return errors;
  }

  const e = event as Record<string, unknown>;

  // Check schema_version
  if (!e["schema_version"]) {
    errors.push({ field: "schema_version", message: "schema_version is required" });
  } else if (e["schema_version"] !== "1.0") {
    errors.push({ field: "schema_version", message: "schema_version must be '1.0'" });
  }

  // Check eventId
  if (!e["eventId"]) {
    errors.push({ field: "eventId", message: "eventId is required" });
  } else if (typeof e["eventId"] !== "string") {
    errors.push({ field: "eventId", message: "eventId must be a string" });
  }

  // Check ts
  if (!e["ts"]) {
    errors.push({ field: "ts", message: "ts is required" });
  } else if (typeof e["ts"] !== "number") {
    errors.push({ field: "ts", message: "ts must be a number" });
  }

  // Check category
  if (!e["category"]) {
    errors.push({ field: "category", message: "category is required" });
  } else if (e["category"] !== "modality") {
    errors.push({ field: "category", message: "category must be 'modality'" });
  }

  // Check action
  if (!e["action"]) {
    errors.push({ field: "action", message: "action is required" });
  } else if (e["action"] !== "rejection.v6_boundary") {
    errors.push({ field: "action", message: "action must be 'rejection.v6_boundary'" });
  }

  // Check payload
  if (!e["payload"]) {
    errors.push({ field: "payload", message: "payload is required" });
    return errors;
  }

  const payload = e["payload"] as Record<string, unknown>;

  // Check rejectedModalities
  if (!payload["rejectedModalities"]) {
    errors.push({ field: "payload.rejectedModalities", message: "rejectedModalities is required" });
  } else if (!Array.isArray(payload["rejectedModalities"])) {
    errors.push({ field: "payload.rejectedModalities", message: "rejectedModalities must be an array" });
  }

  // Check errorCode
  if (!payload["errorCode"]) {
    errors.push({ field: "payload.errorCode", message: "errorCode is required" });
  } else if (payload["errorCode"] !== "V6_MULTIMODAL_REJECTED") {
    errors.push({ field: "payload.errorCode", message: "errorCode must be 'V6_MULTIMODAL_REJECTED'" });
  }

  // Check message
  if (!payload["message"]) {
    errors.push({ field: "payload.message", message: "message is required" });
  } else if (typeof payload["message"] !== "string") {
    errors.push({ field: "payload.message", message: "message must be a string" });
  }

  return errors;
}

/**
 * Type guard for ModalityAdaptationEvent
 */
export function isModalityAdaptationEvent(
  event: unknown
): event is ModalityAdaptationEvent {
  return validateModalityAdaptationEvent(event).length === 0;
}

/**
 * Type guard for MultimodalRejectionEvent
 */
export function isMultimodalRejectionEvent(
  event: unknown
): event is MultimodalRejectionEvent {
  return validateMultimodalRejectionEvent(event).length === 0;
}

/**
 * Type guard for MultimodalObservabilityEvent
 */
export function isMultimodalObservabilityEvent(
  event: unknown
): event is MultimodalObservabilityEvent {
  return isModalityAdaptationEvent(event) || isMultimodalRejectionEvent(event);
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

/**
 * Serialize an observability event to JSON string
 */
export function serializeObservabilityEvent(
  event: MultimodalObservabilityEvent
): string {
  return JSON.stringify(event);
}

/**
 * Deserialize JSON string to observability event
 * Returns null if parsing fails or invalid
 */
export function deserializeObservabilityEvent(
  json: string
): MultimodalObservabilityEvent | null {
  try {
    const parsed = JSON.parse(json);
    if (isMultimodalObservabilityEvent(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

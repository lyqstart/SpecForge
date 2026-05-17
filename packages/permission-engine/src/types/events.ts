/**
 * Permission Event Types
 * 
 * Defines event schemas for permission decision logging as required by
 * Property 10: Permission Decision Traceability
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';

/**
 * Base event schema for all events written to events.jsonl
 * Based on V6 Architecture Specification Property 30
 */
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),           // UUIDv7 for global uniqueness
  ts: z.number(),                       // monotonic timestamp
  projectId: z.string().min(1),         // non-empty project identifier
  action: z.string().min(1),            // event action type
  payload: z.record(z.string(), z.any()) // event-specific payload
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

/**
 * Permission decision event payload schema
 * Based on Property 10: Permission Decision Traceability
 */
export const PermissionDecisionEventPayloadSchema = z.object({
  actor: z.object({
    id: z.string().min(1),
    sessionId: z.string().optional(),
    agentRole: z.string().optional(),
    workflowRole: z.string().optional(),
    remoteIdentity: z.string().optional()  // for OpenClaw requests
  }),
  action: z.string().min(1),           // e.g., "tool.execute", "workflow.create"
  resource: z.object({
    type: z.string().min(1),           // e.g., "tool", "workItem", "file"
    id: z.string().optional(),         // resource identifier if applicable
    path: z.string().optional()        // file path if applicable
  }),
  decision: z.enum(['allow', 'deny']),
  matched_rule: z.string().min(1),     // rule identifier
  rule_layer: z.enum(['hard', 'builtin', 'user']),
  reason: z.string().min(1),           // human-readable explanation
  context: z.record(z.string(), z.any()).optional()  // additional evaluation context
});

export type PermissionDecisionEventPayload = z.infer<typeof PermissionDecisionEventPayloadSchema>;

/**
 * Permission denied event payload schema (for authentication failures)
 * Based on Property 16: Bearer Token Enforcement
 */
export const PermissionDeniedEventPayloadSchema = z.object({
  actor: z.object({
    id: z.string().optional(),
    sessionId: z.string().optional(),
    remoteIdentity: z.string().optional()
  }),
  action: z.string().min(1),
  resource: z.object({
    type: z.string().min(1),
    id: z.string().optional(),
    path: z.string().optional()
  }),
  reason: z.string().min(1),
  layer: z.enum(['auth', 'remote', 'permission']),
  details: z.record(z.string(), z.any()).optional()
});

export type PermissionDeniedEventPayload = z.infer<typeof PermissionDeniedEventPayloadSchema>;

/**
 * Hard rule conflict event payload schema
 */
export const HardRuleConflictEventPayloadSchema = z.object({
  rule: z.object({
    id: z.string().min(1),
    description: z.string().min(1)
  }),
  conflict: z.string().min(1),
  config: z.record(z.string(), z.any()).optional(),
  detectedAt: z.string().datetime()  // ISO timestamp
});

export type HardRuleConflictEventPayload = z.infer<typeof HardRuleConflictEventPayloadSchema>;

/**
 * Plugin permission denied event payload schema
 * Based on Property 28: Plugin Permission Gate
 */
export const PluginPermissionDeniedEventPayloadSchema = z.object({
  pluginId: z.string().min(1),
  pluginName: z.string().min(1),
  reason: z.enum(['requirements_not_granted', 'prohibited_api', 'static_check_failed']),
  details: z.object({
    missingRequirements: z.array(z.string()).optional(),
    prohibitedApis: z.array(z.string()).optional(),
    staticCheckErrors: z.array(z.string()).optional()
  }).optional()
});

export type PluginPermissionDeniedEventPayload = z.infer<typeof PluginPermissionDeniedEventPayloadSchema>;

/**
 * Event action types
 */
export type EventAction = 
  | 'permission.evaluated'
  | 'permission.denied'
  | 'config.hard_rule_conflict'
  | 'plugin.load_denied'
  | 'plugin.static_check_failed';

/**
 * Complete permission decision event
 */
export interface PermissionDecisionEvent extends BaseEvent {
  action: 'permission.evaluated';
  payload: PermissionDecisionEventPayload;
}

/**
 * Complete permission denied event (authentication/authorization failure)
 */
export interface PermissionDeniedEvent extends BaseEvent {
  action: 'permission.denied';
  payload: PermissionDeniedEventPayload;
}

/**
 * Complete hard rule conflict event
 */
export interface HardRuleConflictEvent extends BaseEvent {
  action: 'config.hard_rule_conflict';
  payload: HardRuleConflictEventPayload;
}

/**
 * Complete plugin permission denied event
 */
export interface PluginPermissionDeniedEvent extends BaseEvent {
  action: 'plugin.load_denied';
  payload: PluginPermissionDeniedEventPayload;
}

/**
 * Union type of all permission-related events
 */
export type PermissionEvent = 
  | PermissionDecisionEvent
  | PermissionDeniedEvent
  | HardRuleConflictEvent
  | PluginPermissionDeniedEvent;

/**
 * Event creation utilities
 */
export function createPermissionDecisionEvent(
  projectId: string,
  payload: PermissionDecisionEventPayload
): PermissionDecisionEvent {
  return {
    eventId: crypto.randomUUID(),
    ts: Date.now(),
    projectId,
    action: 'permission.evaluated',
    payload
  };
}

export function createPermissionDeniedEvent(
  projectId: string,
  payload: PermissionDeniedEventPayload
): PermissionDeniedEvent {
  return {
    eventId: crypto.randomUUID(),
    ts: Date.now(),
    projectId,
    action: 'permission.denied',
    payload
  };
}

export function createHardRuleConflictEvent(
  projectId: string,
  payload: HardRuleConflictEventPayload
): HardRuleConflictEvent {
  return {
    eventId: crypto.randomUUID(),
    ts: Date.now(),
    projectId,
    action: 'config.hard_rule_conflict',
    payload
  };
}

export function createPluginPermissionDeniedEvent(
  projectId: string,
  payload: PluginPermissionDeniedEventPayload
): PluginPermissionDeniedEvent {
  return {
    eventId: crypto.randomUUID(),
    ts: Date.now(),
    projectId,
    action: 'plugin.load_denied',
    payload
  };
}
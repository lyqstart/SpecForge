// Barrel export for all shared types in service-management package

// State types
export type { ServiceState } from "./service-state.js";

// Installation and status types
export type { ServiceInstallSpec } from "./service-install-spec.js";
export type { ServiceStatus } from "./service-status.js";

// Unit metadata
export type { ServiceUnitMetadata } from "./service-unit-metadata.js";

// Environment precheck
export type { Platform, PrecheckIssueCode, PrecheckIssue, EnvironmentPrecheck } from "./environment-precheck.js";

// Orchestration
export type { OrchestrationResult, serializeServiceStatusMap, deserializeServiceStatusMap } from "./orchestration-result.js";

// NSSM
export type { NssmCommand } from "./nssm-command.js";

// Shutdown
export type { ShutdownPriority, ShutdownTask, ShutdownTaskEntry } from "./shutdown.js";

// Handshake
export type { HandshakeFile } from "./handshake.js";

// Healthcheck
export type { HealthCheckResponse } from "./healthcheck.js";

// Status JSON payload
export type { ServiceStatusJsonEntry, ServicesStatusJsonPayload, ServiceOperationJsonPayload } from "./status-json-payload.js";
/**
 * v11/index.ts — SpecForge v1.1 Runtime module barrel export
 *
 * Re-exports all v1.1 runtime components.
 */

// Path Service and Policy (Round 1)
export { PathService, SPEC_DIR_NAME } from './runtime/PathService.js';
export { PathPolicy, type ValidationResult, type DetailedValidationResult, type PathCaller, type WriteOperation } from './runtime/PathPolicy.js';

// JSON Parser (Round 1)
export { JsonParser, type ParseResult } from './runtime/JsonParser.js';

// Write Guard (Round 4)
export {
  WriteGuard,
  CodePermissionService,
  ChangedFilesAudit,
  type ToolType,
  type WriteContext,
  type WritePermission,
  type EscapedWriteIncident,
  type WriteCheckResult,
} from './runtime/WriteGuard.js';

// Close Gate (Cross-cutting)
export {
  CloseGate,
  type CloseCheck,
  type CloseValidationResult,
  type FileSystemValidationParams,
} from './runtime/CloseGate.js';

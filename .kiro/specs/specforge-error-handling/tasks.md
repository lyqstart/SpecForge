# Implementation Plan: specforge-error-handling

## Overview

Implement a layered error handling strategy for SpecForge: Plugin-level exception containment, Tool Core error logging with re-throw, dynamic import for compatibility checks, and conversations.jsonl log rotation. The implementation language is TypeScript (matching the existing codebase).

## Tasks

- [x] 1. Add shared error handling utilities to utils.ts
  - [x] 1.1 Implement `logErrorToFile()` helper function in `.opencode/tools/lib/utils.ts`
    - Add `ERROR_LOG_RELATIVE_PATH` constant (`"specforge/logs/error.log"`)
    - Implement `logErrorToFile(baseDir, component, event, error)` that writes JSONL error entries using existing `appendJsonl()`
    - Function must silently swallow write failures (try-catch around the entire body)
    - Error entry format: `{ timestamp, level: "ERROR", component, event, message }`
    - _Requirements: 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 1.2 Implement `tryCheckCompatibility()` helper function in `.opencode/tools/lib/utils.ts`
    - Implement `tryCheckCompatibility(baseDir, component)` that dynamically imports `"../../../scripts/lib/compatibility"`
    - On successful import, call `checkCompatibilityAtEntry(baseDir)` if it exists
    - On import failure, call `logErrorToFile()` with event `"dynamic_import_failed"` and include `module_path` in the log entry
    - Function must never throw — all errors silently handled
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2. Migrate Tool Core files: replace static import with `tryCheckCompatibility` and add try-catch
  - [x] 2.1 Migrate `sf_state_read_core.ts`
    - Remove `import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"`
    - Add `import { tryCheckCompatibility, logErrorToFile } from "./utils"`
    - Replace `checkCompatibilityAtEntry(baseDir)` calls with `await tryCheckCompatibility(baseDir, "sf_state_read_core")`
    - Wrap all exported async functions with try-catch that calls `logErrorToFile` then re-throws
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.2 Migrate `sf_state_transition_core.ts`
    - Same pattern as 2.1: remove static import, add dynamic import via `tryCheckCompatibility`, add try-catch to exported functions
    - Component name: `"sf_state_transition_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.3 Migrate `sf_requirements_gate_core.ts`
    - Same pattern: remove static import, add `tryCheckCompatibility` + `logErrorToFile`, wrap exported functions
    - Component name: `"sf_requirements_gate_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.4 Migrate `sf_design_gate_core.ts`
    - Same pattern as above
    - Component name: `"sf_design_gate_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.5 Migrate `sf_tasks_gate_core.ts`
    - Same pattern as above
    - Component name: `"sf_tasks_gate_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.6 Migrate `sf_verification_gate_core.ts`
    - Same pattern as above
    - Component name: `"sf_verification_gate_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.7 Migrate `sf_knowledge_graph_core.ts`
    - Same pattern as above — note this file has multiple exported functions calling `checkCompatibilityAtEntry`
    - Component name: `"sf_knowledge_graph_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.8 Migrate `sf_knowledge_query_core.ts`
    - Same pattern as above
    - Component name: `"sf_knowledge_query_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

  - [x] 2.9 Migrate `sf_context_build_core.ts`
    - Same pattern as above
    - Component name: `"sf_context_build_core"`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2_

- [x] 3. Add try-catch error logging to remaining Tool Core files (no compatibility import)
  - [x] 3.1 Add error logging to `sf_artifact_write_core.ts`, `sf_batch_verify_core.ts`, `sf_continuity_core.ts`
    - Add `import { logErrorToFile } from "./utils"`
    - Wrap all exported async functions with try-catch: `await logErrorToFile(baseDir, component, functionName, err)` then re-throw
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.2 Add error logging to `sf_conversation_recorder_core.ts`, `sf_cost_report_core.ts`, `sf_doc_lint_core.ts`
    - Same pattern: import `logErrorToFile`, wrap exported functions with try-catch + re-throw
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.3 Add error logging to `sf_doctor_core.ts`, `sf_trace_matrix_core.ts`, `sf_verifier_execution_core.ts`, `sf_knowledge_base_core.ts`
    - Same pattern: import `logErrorToFile`, wrap exported functions with try-catch + re-throw
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 4. Checkpoint - Verify Tool Core migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Plugin-level error handling in `sf_specforge.ts`
  - [x] 5.1 Wrap `executeStartupFlow` with try-catch in the Plugin export function
    - Wrap the `determineStartupMode()` + `executeStartupFlow()` sequence in try-catch
    - On exception: call `logError(projectRoot, "sf_specforge.startup", err)` (existing function)
    - Wrap the `logError` call itself in try-catch to handle secondary failures silently
    - Set `finalMode = "degraded"` on failure so handler registration still proceeds
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 5.2 Implement `wrapHandler` utility and wrap all event handlers
    - Create `wrapHandler<T>(handler: T, handlerName: string): T` inside the Plugin export
    - Wrapper catches all exceptions, calls `logError(projectRoot, "sf_specforge.<handlerName>", err)`, and silently returns
    - Wrap `logError` call in nested try-catch for secondary failure protection
    - Apply `wrapHandler` to `tool.execute.before`, `tool.execute.after`, and `event` handlers in the return object
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 6. Implement conversations.jsonl log rotation in Plugin
  - [x] 6.1 Implement `rotateConversationsLog()` function in `sf_specforge.ts`
    - Add constants: `LOG_ROTATION_THRESHOLD_BYTES = 100 * 1024 * 1024`, `LOG_ROTATION_MAX_HISTORY = 3`
    - Implement rotation logic: check file size → delete files > max history → rename files with incrementing numbers (high to low) → rename current to `.1` → create new empty file
    - Function throws on failure (caller handles)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Integrate rotation check into event handler write path
    - Before each `appendJsonlSafe(conversationFile, ...)` call, invoke `rotateConversationsLog(conversationFile)`
    - Wrap rotation call in try-catch: on failure, call `logError(projectRoot, "log_rotation", err)` and continue writing to current file
    - _Requirements: 4.5, 4.6_

- [x] 7. Checkpoint - Verify Plugin changes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Write tests
  - [ ]* 8.1 Write property test for Plugin startup exception containment
    - **Property 1: Plugin startup exception containment**
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 8.2 Write property test for event handler exception containment
    - **Property 2: Event handler exception containment**
    - **Validates: Requirements 1.2, 1.4**

  - [ ]* 8.3 Write property test for Tool Core error logging and re-throw
    - **Property 3: Tool Core error logging and re-throw**
    - **Validates: Requirements 2.1, 2.2, 5.1, 5.2**

  - [ ]* 8.4 Write property test for Tool Core resilience to log write failure
    - **Property 4: Tool Core resilience to log write failure**
    - **Validates: Requirements 2.4**

  - [ ]* 8.5 Write property test for dynamic import failure behavior
    - **Property 5: Dynamic import failure does not alter return value**
    - **Property 6: Dynamic import failure logging**
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]* 8.6 Write property test for log rotation file ordering and retention
    - **Property 7: Log rotation preserves numbered file ordering**
    - **Property 8: Log rotation enforces retention limit**
    - **Property 9: Log rotation produces empty main file**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ]* 8.7 Write property test for error log entry format validation
    - **Property 10: Error log entries are valid JSONL with required fields**
    - **Property 11: Error log directory auto-creation**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The 9 core files with `checkCompatibilityAtEntry` imports need both the dynamic import migration AND try-catch wrapping (tasks 2.x)
- The remaining core files (without compatibility imports) only need try-catch wrapping (tasks 3.x)
- Plugin already has `logError()` and `appendJsonlSafe()` — reuse them for Plugin-level error handling
- Tool Core uses `appendJsonl()` from utils.ts — the new `logErrorToFile()` wraps this with silent failure handling

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "6.2"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7"] }
  ]
}
```

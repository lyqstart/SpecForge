{
  "conclusion": "request_changes",
  "summary": "WI-005 WAL/StateManager singleton refactoring is well-architected and closely follows design_delta.md across all 4 change items. The core production code (StateManager, path-resolver, Daemon, ProjectManager) correctly implements the singleton pattern, daemon-specific path resolution, RecoverySubsystem injection with fallback, and per-project StateManager elimination. However, one blocking compilation error exists in the test file `tests/unit/project.test.ts` where the mock IPathResolver is missing the two new interface methods (`resolveDaemonStatePath` and `resolveDaemonEventsPath`), preventing TypeScript compilation and test execution. Additional warnings include: (1) legacy events.jsonl merge omits monotonicSeq sorting per design, (2) path-resolver contract test and symmetry tests don't cover the new daemon state/events path methods, (3) stale comment in ProjectManager, and (4) no direct test for detectAndHandleLegacyState with mock legacy files or T6.3 rollback scenario.",
  "needs_design_change": false,
  "dimensions": {
    "correctness": "warning",
    "coverage": "warning",
    "quality": "pass",
    "security": "pass",
    "performance": "pass",
    "maintainability": "pass"
  },
  "project_rules_lint": {
    "config_hardcoded": false,
    "dependency_undeclared": false,
    "version_incompatible": false,
    "empty_catch_blocks": 0
  },
  "findings": [
    {
      "severity": "blocking",
      "category": "code_quality",
      "file": "packages/daemon-core/tests/unit/project.test.ts",
      "line": "12-23",
      "description": "Mock IPathResolver in createMockPathResolver() is missing resolveDaemonStatePath() and resolveDaemonEventsPath() methods. The IPathResolver interface now requires 9 methods but the mock only provides 7. This causes a TypeScript compilation error — the object literal does not satisfy the IPathResolver interface.",
      "suggestion": "Add the two missing methods to the mock:\n  resolveDaemonStatePath: () => `${base}/.specforge/runtime/state.json`,\n  resolveDaemonEventsPath: () => `${base}/.specforge/runtime/events.jsonl`,"
    },
    {
      "severity": "warning",
      "category": "spec_compliance",
      "file": "packages/daemon-core/src/daemon/Daemon.ts",
      "line": "236-257",
      "description": "Legacy events.jsonl merge in detectAndHandleLegacyState() deduplicates by eventId and appends without sorting by monotonicSeq. The design_delta.md specifies: '按 eventId 去重，按 monotonicSeq 排序'. The implementation only does eventId deduplication. While this is functionally safe (applyStateTransition is order-independent for final state, and WAL.initialize() re-seeds _lastSeq from actual file content), it deviates from the documented merge strategy.",
      "suggestion": "Sort the legacy events by monotonicSeq before appending, and optionally filter events with seq <= last canonical seq. Alternatively, update design_delta.md to reflect the simpler merge strategy if the current approach is deemed sufficient."
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": "packages/daemon-core/tests/unit/path-resolver.test.ts",
      "line": "28-55",
      "description": "The assertContract() function in the IPathResolver contract test does not verify the new resolveDaemonStatePath() and resolveDaemonEventsPath() methods. No dedicated test cases exist for these new methods (unlike resolveDaemonRuntimeDir, resolveHandshakePath, etc. which all have dedicated describe blocks). The Path resolver symmetry section also lacks tests for the new methods.",
      "suggestion": "Add to assertContract:\n  const dsp = resolver.resolveDaemonStatePath();\n  expect(dsp).toContain('state.json');\n  expect(dsp.startsWith(dr)).toBe(true);\n  const dep = resolver.resolveDaemonEventsPath();\n  expect(dep).toContain('events.jsonl');\n  expect(dep.startsWith(dr)).toBe(true);\nAlso add dedicated describe blocks and symmetry tests for both PersonalPathResolver and EnterprisePathResolver."
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": "packages/daemon-core/src/project/ProjectManager.ts",
      "line": "257-258",
      "description": "Stale comment: '// Project state is maintained independently via per-project StateManager'. Per-project StateManagers have been eliminated by this change (Change Item 4). The comment is misleading.",
      "suggestion": "Update the comment to reflect the new architecture, e.g.: '// Project state is managed via the daemon global StateManager (singleton)'"
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": "packages/daemon-core/tests/unit/path-resolver.test.ts",
      "line": "218-236",
      "description": "The 'Path resolver symmetry' test section verifies that both resolvers return the same daemonRuntimeDir, handshakePath, and daemonJsonPath, but does NOT verify symmetry for the new resolveDaemonStatePath() and resolveDaemonEventsPath() methods.",
      "suggestion": "Add symmetry tests:\n  expect(personal.resolveDaemonStatePath()).toBe(enterprise.resolveDaemonStatePath());\n  expect(personal.resolveDaemonEventsPath()).toBe(enterprise.resolveDaemonEventsPath());"
    },
    {
      "severity": "info",
      "category": "code_quality",
      "file": "packages/daemon-core/tests/integration/wal-singleton-e2e.test.ts",
      "line": "N/A",
      "description": "Test scenario T1.3 (legacy nested state.json detection with actual orphaned files) and T6.3 (rollback scenario: injection failure → fallback → workItems empty but no crash) from impact_analysis.md are not directly tested. T1.3 is tested indirectly via path non-nesting assertions. T6.3 requires a test where stateManager.getWal() throws.",
      "suggestion": "Consider adding explicit test cases: (1) create legacy nested files on disk → verify detectAndHandleLegacyState logs warnings, (2) mock StateManager.getWal() to throw → verify RecoverySubsystem falls back gracefully."
    },
    {
      "severity": "info",
      "category": "spec_compliance",
      "file": "packages/daemon-core/src/daemon/Daemon.ts",
      "line": "204",
      "description": "detectAndHandleLegacyState parameter changed from design's `pathResolver: IPathResolver` to `runtimeDir: string`. This is a minor deviation but actually better — the method only needs runtimeDir to construct legacy paths, not the full resolver. The legacy paths are constructed using path.join(runtimeDir, '.specforge', 'runtime', ...) which correctly reconstructs the old nested path pattern.",
      "suggestion": "No change needed — the implementation is correct and arguably cleaner than the design. Consider updating design_delta.md to match."
    }
  ],
  "traceability": {
    "requirements_covered": [
      "Change Item 1: Eliminate Daemon.ts independent WAL — private wal field removed, getWal() added, HTTPServer uses stateManager.getWal()",
      "Change Item 2: Fix path-resolver nested statePath — resolveDaemonStatePath/EventsPath added, isDaemonGlobal constructor param, detectAndHandleLegacyState",
      "Change Item 3: RecoverySubsystem injection — try/catch fallback in constructor, checkAndRepair wrapped in try/catch in start()",
      "Change Item 4: ProjectManager injection — daemonStateManager constructor param, isFullyRegistered replaces wal as idempotency flag, per-project WAL/SM eliminated"
    ],
    "requirements_missing": []
  },
  "self_check": {
    "passed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "failed": [],
    "notes": "All 10 self-check items passed. prod-environment.md not found (project-rules.md states it was intentionally omitted for self-investigation)."
  },
  "out_of_scope_observations": [],
  "dimension_details": {
    "correctness": {
      "rating": "warning",
      "rationale": "All 4 change items are correctly implemented in production code. WAL singleton confirmed (no new WAL() in Daemon.ts). Path resolution confirmed non-nested. RecoverySubsystem injection with fallback confirmed. ProjectManager injection with isFullyRegistered confirmed. However, the legacy events.jsonl merge omits monotonicSeq sorting per design spec, which is a correctness deviation (though functionally safe)."
    },
    "coverage": {
      "rating": "warning",
      "rationale": "E2E tests (wal-singleton-e2e.test.ts) provide excellent coverage of T1.1-T1.4, T2.1-T2.3, T3.1-T3.2, T4.1-T4.2, T5.1-T5.3, and cross-cutting WAL singleton verification. Unit tests cover getWal() and isDaemonGlobal. However: (1) path-resolver.test.ts has no tests for the new resolveDaemonStatePath/EventsPath methods, (2) no direct test for detectAndHandleLegacyState with mock files, (3) no test for T6.3 rollback scenario, (4) tests/unit/project.test.ts has a compilation-blocking mock issue."
    },
    "quality": {
      "rating": "pass",
      "rationale": "Code is clean and well-structured. Daemon.ts constructor ordering is correct (StateManager before RecoverySubsystem before ProjectManager). JSDoc comments on getWal() and @deprecated annotations on ProjectContext.wal/stateManager are appropriate. The TestDaemonPathResolver in E2E tests is well-designed for isolation. One stale comment in ProjectManager.ts handleProjectEvent."
    },
    "security": {
      "rating": "pass",
      "rationale": "No security vulnerabilities introduced. Legacy state detection uses safe operations (access, readFile, rename — no deletion). EventId-based deduplication prevents injection through legacy merge. No hardcoded secrets or credentials. validateProjectPath guard is preserved."
    },
    "performance": {
      "rating": "pass",
      "rationale": "No performance regressions. WAL singleton eliminates multi-writer contention (improvement). Legacy merge is a one-time startup cost. StateManager.getWal() is O(1) direct reference return. No N+1 queries or unbounded loops."
    },
    "maintainability": {
      "rating": "pass",
      "rationale": "Clear separation of concerns: daemon paths vs project paths in path-resolver, isDaemonGlobal flag for mode selection, injection pattern with fallback for RecoverySubsystem. @deprecated annotations guide future cleanup. E2E test structure mirrors the T1-T5 test plan from impact_analysis.md."
    }
  },
  "detailed_checklist": {
    "design_conformance": {
      "change_item_1_wal_elimination": "PASS — private wal field removed, getWal() added, HTTPServer deps updated",
      "change_item_2_path_resolver": "PASS — resolveDaemonStatePath/EventsPath added to interface and both implementations, isDaemonGlobal constructor param with default false",
      "change_item_3_recovery_injection": "PASS — try/catch fallback in constructor, checkAndRepair wrapped in try/catch in start()",
      "change_item_4_project_manager": "PASS — daemonStateManager injected, isFullyRegistered replaces wal, per-project WAL/SM eliminated",
      "deviation_legacy_merge_sorting": "WARNING — merge omits monotonicSeq sorting per design"
    },
    "backward_compatibility": {
      "isDaemonGlobal_default_false": "PASS — preserves original behavior for existing callers",
      "project_context_optional_fields": "PASS — wal? and stateManager? kept as deprecated optional fields",
      "http_server_deps_type": "PASS — HTTPServerDeps.wal type unchanged, HTTPServer doesn't use deps.wal internally"
    },
    "error_handling": {
      "recovery_injection_try_catch": "PASS — Daemon.ts L58-63 wraps getWal() in try/catch",
      "checkAndRepair_try_catch": "PASS — Daemon.ts L148-152 wraps checkAndRepair() in try/catch",
      "legacy_detection_io_safety": "PASS — all fs.access/readFile/rename in try/catch blocks"
    },
    "legacy_state_detection": {
      "no_file_deletion": "PASS — only fs.rename to .orphaned suffix",
      "eventId_dedup": "PASS — prevents duplicate events during merge",
      "corrupted_line_handling": "PASS — JSON.parse in try/catch, malformed lines skipped"
    },
    "wal_singleton_verification": {
      "no_private_wal_in_daemon": "PASS — grep confirms no 'private wal' in Daemon.ts",
      "no_new_wal_in_daemon": "PASS — grep confirms all new WAL() calls are in StateManager.ts only",
      "httpserver_uses_getWal": "PASS — Daemon.ts L98: wal: this.stateManager.getWal()"
    },
    "project_context_compat": {
      "isFullyRegistered_flag": "PASS — replaces wal as idempotency check in getProject() and registerProject()",
      "deprecated_annotations": "PASS — @deprecated JSDoc on wal and stateManager fields",
      "getDaemonStateManager": "PASS — new method exposes injected daemon global StateManager"
    },
    "no_scope_creep": {
      "files_changed": "PASS — only the 4 specified production files + test files changed",
      "httpserver_unchanged": "PASS — HTTPServer.ts not modified (wal reference source change is in Daemon.ts)"
    }
  },
  "project_rules_lint_details": {
    "check_1_config_hardcoded": {
      "result": "PASS",
      "details": "No new IP addresses hardcoded in changed files. Pre-existing 127.0.0.1 in HTTPServer.ts L129 (bind address, not in changed files)."
    },
    "check_2_dependency_undeclared": {
      "result": "PASS",
      "details": "No new imports in changed files. Daemon.ts imports fs/promises and path (existing). No new package dependencies."
    },
    "check_3_version_compatible": {
      "result": "PASS",
      "details": "No new syntax features used. isDaemonGlobal boolean parameter, optional chaining, nullish coalescing — all compatible with TypeScript 5.x and Node.js 18+."
    },
    "check_4_logging": {
      "result": "WARNING",
      "details": "New console.warn messages in Daemon.ts (L62, L211-212, L253, L258) and console.error (L151) added per design_delta.md specification. These are diagnostic/operational logs for error paths and legacy detection — appropriate for daemon infrastructure but technically violate the 'no console.log in production code' rule."
    },
    "check_5_error_handling": {
      "result": "PASS",
      "details": "No empty catch blocks found in changed files. All catch blocks have either logging or comment explaining the no-op."
    }
  }
}
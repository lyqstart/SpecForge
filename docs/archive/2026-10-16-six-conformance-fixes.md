# Six conformance fixes — execution evidence

RUN_ID=CODEX-SF-20261016-SIX-CONFORMANCE-FIXES-A01
EXECUTION_MODE=CODEX_DIRECT
EVIDENCE_ROOT=D:\code\SpecForge
BASELINE=ddba4ef407a53061cd00578e126015fa1ca06b2e
USER_REQUEST=你来修复这6个问题

This is historical task evidence, not another current-status or product authority.

## Gate and scope

Bootstrap READY; local and remote main equal; initial working tree clean.
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES (complete reading in preceding audit, unchanged SHA-256 b24db5c8219712dfe45ab752f9e0d0430b18f287dc0ab51df00edd484a8f45d1).
EXPERIENCE_FILE_READ=YES
HISTORICAL_LEDGER_SEARCH=native writes, configuration snapshots, capabilities, sensitive logs, state projection; EXP-004/006/010/017/031/051/264.
REPEATED_ERROR_CHECK=PASS

Repair six source-confirmed defects: native write enforcement; authoritative shell state; accepted four-layer configuration and stable activation; real model capability discovery; truthful HTTP responses; secret-free configuration logging. Preserve current controlled workflow ownership. Do not operate on t2 or t3, create a SpecForge self-development Work Item, or change their acceptance state.

Plan: extend existing owner contracts only where necessary; update production consumers and deployed templates; add isolated behavior regressions; run focused tests, strict build and required regressions; audit exact diff before commit/main reconciliation. Stop on unresolved authority conflict or unexplained regression. Delivery completion requires evidence, not mock-only success.

## Investigation/tool failures

ERR-SIX-ENV-01: sandbox denied Git ref lock (exit 1); no branch change occurred. Retry the identical authorized Git operation through escalation. Prior audit Bun working-directory and DNS failures were likewise environment-bound; escalated tests and remote verification succeeded. EXP-008/016.
ERR-SIX-READ-01: guessed source paths and PowerShell wildcard arguments caused read failures (exit 1/rg diagnostics). Resolve source filenames with rg --files before subsequent reads; no product mutation resulted. EXP-046/065.
ERR-SIX-READ-02: oversized search output was truncated; do not count truncated output as complete reading. Prior mandatory full-rule reading remains covered by unchanged hash. EXP-021/261.
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0

## Write classification

TRUTH_SOURCE_WRITES: only authorized product contracts and the single project-status entry, if required; no business-project .specforge writes.
REPOSITORY_TRACKED_WRITES: source, templates, regression tests, engineering rules and task evidence within this repair.
RUNTIME_OBSERVER_WRITES: test-runner caches and isolated temporary fixtures; enumerate unexpected writes before delivery.
EXTERNAL_EVIDENCE_WRITES: none at initiation.

## Initial verification

2026-10-16T15:17Z: configuration acceptance/logging 6/6, real capability mapping 5/5, native/state/HTTP boundaries 10/10 passed (each numeric exit 0). First official root build stopped at Adapter TS6133 for two imports made unused by deleting mock discovery; this is an introduced compile cleanup, not an environmental or pre-existing failure. Remove those imports and resume the official build. ERR-SIX-BUILD-01 / EXP-004/011.

OpenCode server probe: sandbox socket access denied; elevated identical read got connection refused at 127.0.0.1:4096. No real server is available at that endpoint. API field evidence comes instead from installed @opencode-ai/sdk 1.18.16 v2 Model/ProviderListResponses definitions and official https://opencode.ai/docs/server/ and https://opencode.ai/docs/plugins/ . Do not claim a real OpenCode end-to-end run from mocked transport tests.

Full configuration regression: 197/197 passed, exit 0. Full Adapter: 875 passed, 47 failed; full Daemon: 1841 passed, 42 failed, exits 1. Failures are under investigation: old capability tests explicitly demand fabricated model-name defaults; HTTP tests demand placeholder success; registration fixtures omit project config; shell fixtures provide only projection files/no StateManager; native point-read owner interfaces need support. Preserve assertions for valid behavior while migrating fixtures to current contracts. Do not weaken fail-closed checks to satisfy retired expectations. ERR-SIX-REGRESSION-01 / EXP-004/010/022/046. Raw logs: C:/Users/lyq/AppData/Local/Temp/specforge-six-{configuration,adapter,daemon}.log (elevated TEMP differs from sandbox TEMP).

## Subsequent verification and review

Adapter rerun: 903/903 passed, exit 0 (`specforge-six-adapter-2.log`). Daemon rerun: 1881 passed/2 failed, exit 1; one was a real client propagation bug (reason discarded), the other an old post-close violation assertion. Fixed client propagation and kept actual denial assertions. Focused native/HTTP/governance run: 42/42 passed; owner/event/config run: 38/38 passed, exits 0. Deployed template and package client are both covered over real loopback HTTP; this is not an actual OpenCode-hosted execution claim.

First official full run `bun run test`: root and all packages except scope-gate/daemon passed; scope-gate 127 passed/7 failed from old local policy/hook assertions and stale release identity/hash assertions, daemon 1888 passed/1 failed because the newly added active-rule source comment contained a concrete historical ERR ID. Removed that historical ID from the active rules (retained it in the ledger). These failures are recorded, not waived. Source-independent release tests must run again after the new commit-bound manifest exists.

Final strict build: 2026-10-16T15:31:35Z–15:32:06Z, exit 0. Three release typechecks and workflow synchronization: 15:31:05Z–15:31:12Z, each exit 0. Final root regression: 15:32:41Z–15:33:10Z, 725/725 passed, exit 0. Later HTTP project-identity hardening requires a new daemon build/regression before delivery. Raw outputs use the `C:/Users/lyq/AppData/Local/Temp/specforge-six-*.log` prefix and are retained as raw outputs, with immutable copies made during the final delivery audit.

Release version is 1.0.14; all 14 package manifests and current version consumers were aligned, `bun install --lockfile-only --ignore-scripts` exited 0. No schema or protocol version was bumped. Source/configuration/template changes are task-owned; original workspace was clean. Runtime and release build outputs remain ignored derived files. No t2/t3 files have been inspected or changed.

Review boundary: the native bridge makes permission decisions in the existing Daemon/Permission Engine. Unknown tools and arbitrary native shells fail closed; only identified edit/write paths are accepted. Shell authority and HTTP audits now share StateManager reads. Missing authority is no longer treated as an empty active-task list. Configuration activation stores only a content hash, rejects drift during active work across restart, and rejects corrupt activation records. Legacy unimplemented HTTP routes return explicit errors; this does not implement a new CAS/query product. External model facts come from provider metadata; transport-only mock tests do not prove a live provider/model acceptance.

Final focused boundary/config/rules/API run at 2026-10-16T15:33:54Z passed 96/96, exit 0. Local immutable review evidence is under `.tmp/CODEX-SF-20261016-SIX-CONFORMANCE-FIXES-A01/source-review-01.json.gz`: baseline bytes, current bytes, full binary diff and per-file hashes; the associated manifest is independently rehashed. This source candidate is a local verification checkpoint, not a release-complete assertion; commit-bound release generation and full revalidation follow before main delivery.

## Final source and installed-runtime evidence

CONFIRMED: source candidate 5dd4f7af66bb509179f781a9b72f2d43a495e248. Final official strict build completed 2026-10-16T15:34:37Z, exit 0; all three release typechecks were repeated against this source at 15:39:59Z–15:40:06Z, exits 0. Commit-bound runtime build and release precheck at 15:35:17Z–15:35:23Z passed with no authority, inventory or evidence errors.

CONFIRMED: official `bun run test` at 15:35:40Z–15:41:41Z exited 0. Root 725; version-unification 2; configuration 197; service-management 226; host-profile 2; observability 47; permission-engine 375; OpenCode Adapter 903; scope-gate 134; workflow-runtime 1516; CLI 789; daemon-core 1890: total 6806 passed. Types has no test script in the official runner. No failing case was skipped to obtain this result. Final log: specforge-six-full-final.log.

CONFIRMED: official isolated install and verify succeeded for 111 files. The installed executable started PID 42864, health returned 1.0.14, native read succeeded, unauthorized write/shell were denied, CAS returned 501, and no business file was written. Official stop completed and that PID exited. These tests used only the task's isolated directory.

CONFIRMED: user install preverify passed 111/111 at version 1.0.13. First upgrade exited 1 because Windows held running specforged.exe (PID 23040); rollback could not replace the same locked file. Official CLI authenticated stop exited 0; after the old process exited, the official installer completed rollback and deliberately exited 12 to request a retry. Journal status was independently checked as rolled_back and old installation verified 111/111. Retry at 15:42:42Z exited 0: four files upgraded, 107 unchanged. Final verify passed 111/111. New daemon PID 5148 independently returned version 1.0.14/status ok at 15:43:08Z; PID 23040 no longer existed. The four deployed SHA-256 values match the release exactly (user-runtime-after.json).

Deployment writes were made only by the official installer and CLI lifecycle owners: two binaries, two plugin libraries, installer transaction/backup/manifest and daemon handshake/runtime logs under C:/Users/lyq/.config/opencode. Source and test writes remain the 70-file reviewed candidate; t2/t3 were not operated on. Prior failed install and recovery logs remain preserved.

INSUFFICIENT_EVIDENCE: an already-open OpenCode process has not been shown to reload the new plugin, and an actual OpenCode model session has not been exercised. User must restart OpenCode to activate the installed hook. The real HTTP and installed daemon tests do not replace that external-host acceptance.

Raw output copies and SHA-256 manifest are retained under .tmp/CODEX-SF-20261016-SIX-CONFORMANCE-FIXES-A01/logs-final/. Final documentation changes receive a second complete byte snapshot before their commit. POST_COMMIT_STATE_SEMANTIC_SIMULATION=PASS: current status records verified code/daemon delivery and the user plugin reload action; it does not claim external OpenCode acceptance or retain push as a product blocker.

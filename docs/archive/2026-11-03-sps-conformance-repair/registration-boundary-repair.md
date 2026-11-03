# Registration incident preservation and prevention

RUN_ID=CODEX-SF-20261103-SPS-GAP-REPAIR-A01
EXECUTION_MODE=CODEX_DIRECT

## Preserved facts

`capture-registration-incident.cjs` completed at `2026-11-03T03:56:10.285Z`, numeric exit code 0. It wrote only `registration-incident-snapshot.json`, then verified every embedded current-file byte sequence and each corresponding live file hash. Snapshot SHA-256: `4ff1c8f29307b44a93df8a4a2b321e5799bc9f215641b7770d8bf46510a88a06`.

The snapshot contains six complete current files, Git blob baselines for the two tracked paths, file times, Git status and a recursive recent-file inventory under `.specforge`. Exactly six files had modification times at or after the selected probe-time threshold. This establishes inventory coverage under that threshold; it is not a complete process audit and does not rule out timestamp-preserving or older writes.

Classification: the six live changes are preserved `CORROBORATED_PROBE_INITIALIZATION_WRITE` observations. The user stated they did not create them. Their times and content match the earlier probe and initialization templates. No live `.specforge` file was changed during this repair.

## Architecture and repair

The HTTP ingest registration handler called `ensureProjectInit` before `ProjectManager.registerProject`. ProjectManager already rejects retired root manifests and uninitialized directories before project writes. The handler bypassed this existing boundary by first seeding configuration, CORE files and module-registry normalization. Ownership is HTTP registration / Project Init, with the first divergence in the HTTP handler.

The repair removes implicit initialization from plugin registration. Explicit initialization remains owned by `/api/v1/project/ensure`. Existing ProjectManager checks now run before the registration handler can create project context. This uses the existing legal path rather than adding a second recovery or state owner.

## Validation receipts

- Command: `../../node_modules/.bin/vitest.exe run tests/unit/registration-no-initialization.test.ts tests/unit/current-project-layout-boundary.test.ts tests/unit/http.test.ts`; cwd: `D:/code/SpecForge/packages/daemon-core`; purpose: real HTTP boundary and layout regression; UTC start `2026-11-03T03:57:39.1181404Z`, end `2026-11-03T03:57:41.3580494Z`; carrier/inner exit codes `0/0`; result: 3 files, 44 tests passed. Expected/observed writes: temporary test fixtures and test cache, no live project changes. The new tests use a real ProjectManager and HTTP request, and compare all fixture directories and raw file bytes before/after rejection.
- Earlier attempt from repository root: UTC `2026-11-03T03:57:29.9809426Z` to `2026-11-03T03:57:32.2549989Z`, carrier/inner codes `1/1`; 42 passed and 2 existing source-path checks failed because they resolve paths relative to the package cwd. Retried from the package cwd without modifying those checks.
- Command: `tsc.exe --noEmit --ignoreDeprecations 6.0 --types node -p packages/daemon-core/tsconfig.json`; cwd: `D:/code/SpecForge`; UTC `2026-11-03T03:58:00.5981482Z` to `2026-11-03T03:58:11.9542148Z`; carrier/inner codes `0/0`; no emitted writes; PASS.
- Workflow generation check and `git diff --check` passed. The live six-file incident remains preserved.

## Historical recovery limitation

The captured Git blobs are not pre-probe raw-byte snapshots. In particular, Git normalization can hide a CRLF/LF difference in `config/project.json`. No before-image initialization journal was captured by the old registration path. A new future transaction journal cannot retroactively prove these bytes. The existing Work Item rollback and invalid-merge compensation tools require ownership/evidence absent from this incident. They were not invoked.

The snapshot is evidence, not permission to modify formal Project Spec. Recovery must use an authorized owner and declare whether it restores proven before-images or reconstructs a Git content baseline. No historical rollback or deployed registration fix is claimed by this report.

## Authorized reconstruction extension

The user explicitly chose: `同意使用 Git 内容基线重建`. SPS §10.1 and the Authority Registry now record this limited contract. The Project Init HTTP owner implements explicit `reconstruct_git_baseline`, independently verifies Git root/commit ancestry and blob bytes, checks snapshot and live hashes, rejects out-of-scope files and links, preserves a durable plan containing current bytes, quarantines created template files, and accepts retries only against the same plan's before/after states. The old root manifest is required; this is not an accepted-current-layout repair or migration capability. Owner locks fail closed on collision, including an unreleased lock after process death; no automatic stale-lock removal is authorized.

Five targeted suites (registration, HTTP, layout, initialization and reconstruction) passed: 58 tests, carrier/inner exits 0/0, UTC 2026-11-03T04:02:49.5011996Z to 2026-11-03T04:02:57.4350867Z. Cases include reconstructed/quarantined output, retries with mixed original/target states, later-edit refusal, forged Git baseline refusal, changed snapshot refusal, hard-link refusal and the authenticated HTTP owner. The daemon-core typecheck passed with exit 0. Execution against the preserved incident is a subsequent step after build/deployment validation.

## Executed reconstruction

Commit `c5bc48e06c1c58dc215b71a7ba62745be1109dca` passed the full workspace build and formal release precheck. The installer upgraded two user-level files and verified all 112 deployed files. The installed daemon binary SHA-256 is `cc4e5d4aa0282afda7a005a12a89b19acb4bdb78094448d2d631efc6d9fdc50c`.

`run-registration-reconstruction.cjs` called the actual installed daemon's authenticated Project Init endpoint, received HTTP 200 and returned numeric exit 0. See `registration-reconstruction-result.json` for timestamps, process identity and raw response. Two tracked files were reconstructed from verified Git blobs. Four newly created CORE template files were moved to `.specforge/runtime/init-recovery/4ff1c8f29307b44a93df8a4a2b321e5799bc9f215641b7770d8bf46510a88a06/quarantine-*`; their contents were retained, not deleted. The same archive holds `plan.json` with the original current bytes and `events.jsonl` with completed operations.

Postchecks found no Git content diff in the two tracked files and no remaining untracked CORE files. Git `core.autocrlf=true` initially reported stat/line-ending changes. Each working file's Git-normalized object hash was independently compared with its HEAD blob before synchronizing the index's unchanged content identity. No governance content was staged or committed; `.specforge` status is clean. This is the explicitly authorized Git-content reconstruction, not proof of historical raw-byte restoration.

The daemon was returned to background operation through the official CLI. Health confirmed PID 35652, status `ok`, version 1.0.21. Runtime recovery plans, quarantine files and diagnostic logs are declared owner/audit writes. The independent business fixture event-chain probe remains a separate next step; original WI-0001 was not accessed or resumed.

## Independent fixture registration acceptance

`isolated-registration-probe.cjs` used a new system-temporary fixture, explicitly initialized it through the deployed Project Init owner, then started a temporary OpenCode 1.18.35 host. Its plugin logged `Daemon connected.` and the real daemon's authenticated session-list response contained a new `plugin-daemon-bridge` session. Numeric exit code: 0. Full timestamped initialization/session responses and host output are preserved in `isolated-registration-result.json`. The temporary OpenCode host was stopped; the isolated fixture was retained for audit, and the shared daemon stayed running. No Work Item was created.

This confirms isolated plugin registration. Session-created/updated events were generated by OpenCode, but this probe did not establish a durable event-derived state effect. That remains `INSUFFICIENT_EVIDENCE`, not a successful full workflow acceptance. No original business WI was resumed.

EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-004,EXP-007,EXP-026,EXP-060,EXP-065
REPEATED_ERROR_CHECK=PASS
HISTORICAL_LEDGER_SEARCH=registration,initialization,recovery; current source and existing Work Item recovery preconditions independently checked

Writes: evidence and scoped source/test/status only. TRUTH_SOURCE_WRITES=NONE. No installed runtime was changed in this prevention repair.

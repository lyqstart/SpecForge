# Local repair validation and deployment classification

RUN_ID: `CODEX-SF-20261103-SPS-GAP-REPAIR-A01`  
ATTEMPT_ID: `CODEX-SF-20261103-SPS-GAP-REPAIR-A01-ATTEMPT-01`  
Mode: `CODEX_DIRECT`  
Observed at: `2026-11-02 16:44:27 UTC`  
Baseline: `c55f0b09dd24d18f4618b1b4fe608eed29b42d51`  
Branch: `codex/sps-conformance-repair`

## Changes and evidence

| Gap | Repair | Evidence and result |
|---|---|---|
| `GAP-CONSUMER-D18` | Disabled executor Bash permission; rewrote verification and TDD instructions to record `not_executed`/`blocked`; reviewer checks verification status rather than demanding execution. | Regression in `packages/daemon-core/tests/unit/verifier-guidance-execution-boundary.test.ts`; included in 44 passing daemon-core tests. This does not grant shell execution. |
| `GAP-CONSUMER-PATH` | Updated deployed Agent/skill trace readers and the installed artifact writer to `.specforge/runtime/logs/trace.jsonl`. | Regression in `semantic-closure-contract-alignment.test.ts`; 44 daemon-core tests pass. No stale literal remains in deployed setup consumers. |
| `GAP-DESIGN-OWNER` | `sf-design` now reports trace relation changes to `sf-task-planner`; task planner remains the formal `trace_delta` writer. | Ownership regression in `semantic-closure-contract-alignment.test.ts`; 44 daemon-core tests pass. |
| `GAP-ADAPTER-EVENT` | Added an abortable OpenCode `GET /event` SSE client with project-directory query and frame parsing; Adapter filters native session identifiers and forwards matching events into its existing translation queue. | HTTP parser and adapter bridge regressions; all 33 adapter test files / 920 tests pass. Source typecheck passes. |
| `GAP-BASELINE-FALSE-POSITIVE` | Changed baseline contradiction detection so explanatory `greenfield` mentions do not count as project assertions; explicit positive claims and file-creation contradictions still fail. Preserved Windows-insensitive / POSIX-sensitive path comparison. | Added README-only exact-scope regressions plus direct positive/negative cases; included in 44 passing daemon-core tests. |

## Validation commands

All commands ran from `D:/code/SpecForge`. Numeric inner exit codes are recorded below. Test temporary files were placed under a temporary workspace directory and removed after use.

| Command | Purpose | Expected / observed writes | Inner exit | Result |
|---|---|---|---:|---|
| `node scripts/render-workflow-docs.ts --check` | Workflow generation consistency | No writes / none | 0 | PASS, generated markdown in sync |
| `vitest.exe run --root packages/daemon-core tests/unit/candidate-seal-boundary.test.ts tests/unit/semantic-closure-contract-alignment.test.ts tests/unit/verifier-guidance-execution-boundary.test.ts` | Candidate truth and consumer regressions | Temporary test cache only / 44 passed | 0 | PASS |
| `vitest.exe run --root packages/opencode-adapter` | Full adapter package regression suite | Temporary test cache only / 920 passed | 0 | PASS |
| `vitest.exe run --root packages/scope-gate tests/current-repository-formal-release-precheck.integration.test.ts tests/current-installer-backup-lifecycle.test.ts tests/current-repository-release-manifest-runtime.integration.test.ts` | Release precheck, installer lifecycle, manifest/runtime inventory | Test rewrote ignored `release/release-manifest.json`; restored byte-for-byte to its archived pre-run SHA-256 `e24ed667612e6760c130bfab555007902284580182ca3cadf8c35cbf4ef24764` | 0 | PASS, 8 tests; no remaining artifact change |
| `tsc.exe --noEmit --ignoreDeprecations 6.0 --types node -p packages/opencode-adapter/tsconfig.json` | Adapter typecheck | No writes / none | 0 | PASS |
| `tsc.exe --noEmit --ignoreDeprecations 6.0 --types node -p packages/daemon-core/tsconfig.json` | Daemon typecheck | No writes / none | 0 | PASS |
| `git diff --check` | Whitespace/error check | No writes / none | 0 | PASS |
| `Invoke-RestMethod http://127.0.0.1:4096/global/health` | Read-only local OpenCode host probe | No writes / socket denied by sandbox | 0 (caught exception) | INSUFFICIENT_EVIDENCE: sandbox refused socket access; this does not establish whether OpenCode is running |

The root `bun run` carrier failed twice with `CouldntReadCurrentDirectory` (inner exit 1); direct Vitest executables were used instead. The first Vitest attempt using the system temporary directory failed before loading tests with Windows `EPERM` on an SSR cache rename (inner exit 1); the retry with a workspace temporary directory passed. One initial TypeScript invocation surfaced the repository's TS 6 deprecation / Node ambient-type configuration; the supported invocation above explicitly supplied `--ignoreDeprecations 6.0 --types node` and passed both packages.

## Deployment classification

- Local source and package tests: `CONFIRMED`.
- Runtime event subscription against an actual OpenCode host: `INSUFFICIENT_EVIDENCE`; only the mocked HTTP/SSE protocol and Adapter bridge were exercised. Host probing was denied at the local socket boundary.
- User-level deployed byte identity: `INSUFFICIENT_EVIDENCE`; this run did not change the installed copy, and sandbox permissions do not permit asserting that its files match this branch.
- Overall SPS conformance / WI-0001 Candidate readiness: not established. No Gate, seal, approval, merge, or original WI resume was performed.

## Write classification and observer effects

- `TRUTH_SOURCE_WRITES`: none.
- `REPOSITORY_TRACKED_WRITES`: scoped implementation, setup consumer, test, status and evidence files listed by Git.
- `RUNTIME_OBSERVER_WRITES`: none.
- `EXTERNAL_EVIDENCE_WRITES`: this evidence root only.
- Validation observer effect: the release-precheck integration suite regenerated the ignored release manifest. The pre-test SHA was independently recorded in the previous archived delivery audit; a clean-baseline regeneration reproduced that exact hash, and the manifest was restored to it. The workspace temporary directory and restoration test were removed.

## Gate and stop

The five code/document repair workstreams and local validation are complete. Fresh-host event-feed evidence and installed byte identity remain unavailable, so do not claim deployment or overall runtime conformance. Stop before resuming the original WI-0001 at `candidate_preparing`; preserve its prior rejected Candidate seal and all existing HardStop/Gate history.

`EXPERIENCE_FILE_READ=YES`  
`APPLICABLE_EXPERIENCE_RULES=EXP-004, EXP-007, EXP-026, EXP-060, EXP-065, EXP-261, EXP-280, EXP-282, EXP-287`  
`REPEATED_ERROR_CHECK=PASS`  
`ACTIVE_EXPERIENCE_RULES_FILE_READ=YES`  
`HISTORICAL_LEDGER_SEARCH=baseline false positive, SSE/event bridge, installed consumer path, D18 and trace_delta ownership; ERR-1895, ERR-1896, ERR-1890; no repeated repair applied without rechecking current source.`

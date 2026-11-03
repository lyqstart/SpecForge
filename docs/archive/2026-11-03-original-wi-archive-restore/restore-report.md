# Original project archive restoration — verified outcome

RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01
EXECUTION_MODE=CODEX_DIRECT

The user-approved same-path archive restoration is **CONFIRMED**. This report covers recovery and its first formal authority read; subsequent professional Candidate revisions are a separate continuation, not a claim that every restored byte remains frozen forever.

## Evidence and boundaries

| Conclusion | Primary evidence | What it proves |
|---|---|---|
| Deployed Recovery owner restored all 319 archived files exactly | `deployed-restoration-retry2.json`, command 0035, `owner-audit/` | Every file size and raw SHA-256 matched the sealed source before native continuation |
| Original Git content identity recovered | Command 0035 Git outputs and independently validated object graph | Detached HEAD at `8a692e88c0823984647622294f5199c18bb0c587`, README-only index and valid commit/tree/blob graph |
| Original WI authority recovered | `formal-state-read.json`, command 0036 | Formal `sf_state_read` replayed the original five events; only WI-0001 existed and was `candidate_preparing` |
| Original event history preserved on first formal reads | Before/after SHA-256 in `formal-state-read.json` | `events.jsonl` remained `a3166374c640e3c4cbc2f7b80dbf7424925d90d5a2ce45b670bb46c4a306ef13` |
| Installation matches the verified release payload | Commands 0026, 0030, 0033 and deployed identity check in 0035 | 112 installed files verified; daemon SHA-256 `69837184547f477b199c49d210344ebbf591ddae9ef36b63f5d327f16f0aaa56` |

Original target: `C:\Users\lyq\AppData\Local\Temp\sf-conformance-business-R6ttE7`. Source archive raw SHA-256: `65b2257fc90354a6349f1df5be1d8d01c6e9f5aa13f8a4feafc67698363f103a`. The whole original residual tree was retained in the owner-recorded sibling residue path. All three surviving compressed Git objects were preserved. Old branch/config/index bytes were not available and are not claimed restored. The cause of the original file disappearance remains **INSUFFICIENT_EVIDENCE**.

The first StateManager load changed projection stateVersion 6 → 7, as explicitly recorded. This was a projection observer effect; no workflow transition was invented. Native OpenCode history already retained original session `ses_e8e849253ffeo8tI9ZIOUEjSZ5`; archive import does not claim to reconstruct that external application database.

## Architecture and validation

SPS §3.6 and Authority Registry were updated before implementation. The path is authenticated operator HTTP → ProjectManager recovery exclusion → RecoverySubsystem → isolated archive restorer. Project Init and Agent Tool privileges were not expanded. All files, loose objects and StateManager history are validated in staging before same-volume directory publication. The original directory is quarantined, immutable plans and per-file/Git operation receipts retained, and interrupted publication resumes only the same bound plan. Loaded projects, conflicting content, links and drift are rejected.

The first deployed request rejected empty Git directories before writing target files (0022). Independent scene receipt 0023 found 250 directories and only the original three files. The corrected importer retains empty structure in residue, while preserving strict file/link checks; retry 0035 succeeded. This is recorded in ERR-1898/EXP-288.

Validation scope: focused owner/init/guard suite 37 passing tests; Recovery/WAL/HTTP suite 81; project/config/state consumers 61; corrected empty-directory/init suite 33; final recovery-only suite 26, including actual test-process exit and stale-lock recovery. These suites overlap and are not added into a fabricated unique total. Typechecks, workspace build, release runtime build, release precheck and installer verification passed. Failed environmental/fixture runs remain in immutable receipts and are classified in `validation-notes.md`.

Implementation commits: `df0b9ea6`, `bd32d45c`. Verified restoration milestone `ecc1f1f1` was fast-forwarded and pushed to remote main. Later native outcome evidence may be committed separately. No PR was created.

## Continued business work

Original WI-0001 was resumed through its existing native session and professional owners. Requirements were normalized and independently checked (6 canonical definitions, 18 ACs, zero short REQ aliases, exact baseline binding). First design execution saved two files before provider HTTP 429; inherited byte identity is independently proven in `inherited-design-proof.json`. A later design owner completed the remaining artifacts and wrote a new handoff. Native tool refusals, API failures and controller correction mistakes are preserved, not converted into successful workflow claims.

No Candidate approval, Merge, implementation, Verification or Close follows from archive restoration. The original request's stop remains the real Candidate approval boundary or a proven inability to continue legally. Overall SPS acceptance is not established by this report.

Publication excludes local native reasoning source copies and command 0048's sensitive response Cookie; hash-bound redacted derivatives retain factual tool/error evidence. Actual staged content, including nested Base64 snapshots, was checked before milestone publication. ERR-1899/EXP-289 and ERR-1900/EXP-290 record the diagnostic and continuation-role corrections.

## Supplemental execution exclusion and deployed continuation

Commit `e51ee1eb42d85aea0e2a4290dcad6937f4ade3a1` moves project-operation exclusion from one HTTP entry into the shared ToolDispatcher, before project-scoped observations and handlers. Direct directory/worktree calls and the legacy HTTP consumer are covered by real-handler regressions. The final focused suite passed 55 tests in four files (0082); typecheck, workspace build and release-runtime build passed. Release precheck 0090 passed, the old daemon exited before upgrade, and installer verification 0095 checked all 112 files. `shared-deployment-verification.json` independently binds installed daemon SHA-256 `8acdd0400b826df9267f78561b57ded3a58f9ebb676a05fe6fea1916012ff6b0`, running PID 29796, and identical business WAL before/after restart.

The first supplemental legacy HTTP test incorrectly assumed an unimplemented project-path header. That request used the package service cwd and initialized a derived empty runtime projection under `packages/daemon-core/.specforge/runtime/state.json`. Its exact observed bytes and metadata are sealed in 0081 / `test-observer-projection.json`; no pre-probe byte snapshot exists, no event WAL or Work Item was created, and no manual cleanup or byte-perfect rollback is claimed. The fixture now binds the existing resolver to a test-owned temporary project. Older package-local runtime directories remain untouched. This observer effect and test correction are recorded in ERR-1901; no legacy project-selection capability was invented.

Native continuation retained the same session and WI. Attempts 0001 and 0002 remain immutable (6/10 and 8/10 passed). After controlled owner revisions and resealing, the new deployment ran attempt 0003: 9/10 passed, with one blocking Trace check `trace_data_DATA-CORE-003`. The primary report and exact Candidate inputs are sealed in `original-audit-gates-a03.json`. The Trace candidate lacks an Architecture constraint edge for DATA-CORE-003 and its Data Model section has no such declaration; removing its earlier illegal Module Contract edge did not satisfy this separate coverage obligation. This is a Candidate-authoring defect with an existing legal owner-repair path, not evidence that the archive recovery failed. Latest formal state in receipt 0100 is `gates_failed`; approval and implementation remain unproven and unauthorized by archive consent.

## Final reached stop: Candidate decision required

The original native session completed the legal owner repair. sf-design session `ses_e5e4ea318ffeVr0xr0ViBnumcr` wrote the Architecture constraint and new handoff; the parent ran attempt-0004 before synchronizing Trace Delta, so the same check correctly failed again (0105). This premature rerun is retained and attributed in ERR-1902. sf-task-planner session `ses_e5e4cba3bffePJ08v1nw5rTI1J` then completed the canonical edge, synchronized its 37-row count and wrote a fresh handoff. The parent validated handoffs, resealed through the formal owner and ran **attempt-0005: all 10 required Candidate Gates passed, zero blockers/warnings**. The actual Gate tool result records StateManager advancement to `approval_required` at `2026-11-03T13:59:15Z`. The native driver returned at 13:59:56Z and killed only its own native host. Prepared a04 was never run.

Two elevated final-read launches did not start because automatic permission review timed out; the allowed single retry also timed out. This is not a safety rejection or a numeric process failure. Sandbox command 0107 did start and returned exit 1/fetch failed; its precise cause is **INSUFFICIENT_EVIDENCE**. We did not manufacture a successful final API response or alter Runtime. The safer read-only fallback 0108 copied original immutable Gate reports, Candidate files, actual WAL and projection; its last StateManager event and projection cursor agree on `approval_required`. Independent 0109 additionally proves all current Candidate/manifest hashes match attempt-0005 input snapshot, original Git HEAD is unchanged, 12 archived formal Project files retain original bytes, README retains its original 123 bytes and four implementation paths remain absent.

The Candidate input snapshot SHA-256 is `3012dc9895dd145465dc5a704411fb1b04ad22e9fa990d745b744e18970bca54`. [Candidate review](candidate-review.md) provides human-readable scope and exact-byte extracted copies of all ten Candidate/manifest files. No business approval, Merge, Code Permission, implementation, executed business tests or Close was performed. **Archive recovery and reaching the Candidate approval boundary are CONFIRMED; full business workflow or overall SPS acceptance is not claimed.**

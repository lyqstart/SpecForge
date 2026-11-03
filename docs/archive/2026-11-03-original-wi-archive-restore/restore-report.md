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

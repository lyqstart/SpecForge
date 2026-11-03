# Controlled archive restoration

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01
EXECUTION_ATTEMPT_ID=CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01-01
EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-004,EXP-006,EXP-007,EXP-026,EXP-060,EXP-065,EXP-262,EXP-264,EXP-270,EXP-282,EXP-283,EXP-284
REPEATED_ERROR_CHECK=PASS
HISTORICAL_LEDGER_SEARCH=EXP-004/007/060/065 and archive.restore; historical consumer/authority and evidence rules apply. Full required-rule coverage is retained from the preceding execution window, with unchanged bootstrap hashes.

Confirmed baseline: main/local/remote 281a2f5c03b845b1254d33dd9ed36c21f8e08d7d, clean bootstrap. User now approved the sealed preflight proposal. Source archive SHA-256 65b2257fc90354a6349f1df5be1d8d01c6e9f5aa13f8a4feafc67698363f103a; exact target C:\Users\lyq\AppData\Local\Temp\sf-conformance-business-R6ttE7. No inference about disappearance cause.

Architecture: HTTP authenticated operator route → RecoverySubsystem → isolated archive restorer; ProjectManager excludes loaded projects and holds an exclusive recovery lease. Archive import stages all bytes, validates Git object graph and StateManager replay, journals plan/publication, quarantines original residue then renames verified stage. No Agent Tool or Project Init widening. Only personal project-local runtime supported. Tests include negative inputs, actual Git/StateManager, interruption and HTTP owner routing. Build/release/installer and deployed endpoint identity precede original-path execution.

Write classification: REPOSITORY_TRACKED_WRITES = authority, implementation, tests, status; EXTERNAL_EVIDENCE_WRITES = this new evidence root; RUNTIME_OBSERVER_WRITES = test fixtures/build, daemon/install and native OpenCode logs; TRUTH_SOURCE_WRITES = original project only through verified deployed Recovery owner after implementation checks. Residue is retained. Stop at proven capability gap or original Candidate approval boundary. No t2/t3 access.

# Windows read-only verification backend

SPS §9.2.4 / D23 and the subordinate Windows verification contract define this backend. The production entry is LpacVerificationMain, built by scripts/lib/verification-asset-producer.ts. Runtime never downloads/compiles a launcher or selects an arbitrary host program.

Only the approved windows-lpac-node-single-process-readonly/v1 profile is adopted: pinned Node 24.19.0 x64, LPAC with the approved single registryRead capability, child policy1, DETACHED creation, no-addons, Job1 and fixed filesystem/network/resource limits. Non-Windows, additional processes, addons, dependencies and unproved declarations are rejected.

Real sf-orchestrator owns sf_verification_plan; real sf-verifier owns sf_verification_run. Code permission stays separate. Plans and attempts bind actual owner/state/subject, immutable inputs and execution assets, budgets, normalized argv, invocation lease and trusted termination receipts. Application output cannot impersonate control evidence.

Cancellation/recovery uses the same attempt and verifies stable process/resource ownership, Job cleanup and preserved failure history. Missing numeric exit, stale/tampered/incomplete receipts or unknown cleanup cannot pass shared evidence consumers, Formal Version or Close.

Compile through the current build-time producer with its exact native entry, source set and assembly references. Preserve source/binary hashes per attempt; a newly built executable cannot replace an archived run's identity.

Other native entry points in this directory are retained synthetic probes. They are not product tools/backends or an alternative execution path. Their earlier startup, registry, pipe, file, network and lifecycle failures/successes remain exact historical evidence under docs/archive/2026-11-04-* and docs/archive/2026-11-05-synthetic-boundary-matrix/. Do not present a single synthetic positive as complete isolation or product acceptance.

Current execution/deployment checkpoints are owned by docs/project-status.md. Product capability is defined by the authoritative specification, not historical probe notes.

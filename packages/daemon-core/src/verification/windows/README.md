# Synthetic LPAC acceptance probes

Current checkpoint (2026-11-07): these sources remain experimental and are not
registered, bundled into release assets, installed, or callable by a WI.
The new D22 strict single-process finite synthetic matrix has passed, including
CJS/ESM/TypeScript/inline positives, file/alias/registry/network denials, native
child/override/console/parent-handle denials, resource limits, launcher/real Daemon
crash and restart, interrupted cleanup and independent resource reconciliation.
Evidence: `docs/archive/2026-11-06-single-process-matrix/acceptance-review.md`.
The earlier multi-process profile remains NOT_ACCEPTED: native process limits
allowed extra live Job members. Sampling termination139 does not prove a strict
ceiling. D22 instead uses DETACHED creation, actual child policy1, Job1 and Node
no-addons. The independent D21 production-adoption decision, public tools,
common consumers, installation assets and original WI verification remain pending.

Compile all `.cs` files in this directory with the existing x64 .NET Framework
compiler, `/reference:System.Web.Extensions.dll`, `/reference:System.Management.dll`
and explicit `/main:LpacStartupPoc`. The private native helper uses explicit
`/main:LpacPrivateRegistryChild` and its frozen source set. Preserve each build
and its raw hashes before execution; do not substitute a newer executable for
an archived attempt. Guest native reports use `LpacProbeJson`, avoiding the
observed guest finalizer failures associated with the System.Web reporting path.

The D22 primary native boundary helper uses `/main:LpacSingleNativeBoundary`;
it performs the fixed native API calls directly in the single primary process.
`--synthetic-single-files` is the fixed file/alias/network probe, and
`--synthetic-single-resource-{wall,cancel,output,memory,crash,daemon-crash}` are
finite resource/lifecycle probes. Resource rejection intentionally returns owner1;
the lab driver proves expected rejection without turning it into application success.

`--synthetic-registry-read-node-file-locked` and
`--synthetic-registry-read-node-test-file-locked` accept only their fixed
first-party probe. Both preserve symlink paths and select TAP explicitly; the
second uses `--test --test-isolation=none positive.cjs` in the frozen input cwd.
Real application/owner exits were0, the module stayed unchanged and its write
was denied. This does not turn the old unflagged file/default-pipe commands into
successful executions. Product command normalization and trusted receipts remain
separate unimplemented integration work.

The detailed evidence and limitations are in
`docs/archive/2026-11-05-synthetic-boundary-matrix/acceptance-review.md`.
The following startup notes describe earlier configurations and retained failures.

`LpacStartupPoc.cs` is an experimental, first-party x64 Windows acceptance probe
under SPS §9.2.1 / D20. It is not registered as a tool, imported by the daemon,
included in release assets, or installed. It only creates a fixed synthetic
assertion, then attempts to execute a frozen Node copy under LPAC and a Job.

The initial build contained only the startup, trace, capability and canary sources;
the current build requires the complete source set described above.
Use absolute Windows source/output paths.
The CLI accepts `--synthetic-p01 NEW_UUID_ROOT PINNED_NODE_EXE`, where the fresh
root must be a UUID leaf below `<cwd>/.tmp/verification-lpac`. Creating the
AppContainer profile and changing only its owned ACLs is an explicit host action.
No arbitrary test script, environment, stdin, command, or original project is
accepted. Preserve the source/binary hash before every distinct run.

The startup result is never a full isolation acceptance receipt and cannot run a WI.
Earlier startup-only receipts do not establish coverage of the later matrix.
See the subordinate contract for the frozen matrix and production prerequisites.

On the initial tested Windows host, Node v24.19.0 failed during Winsock startup
with error10107, before the positive JS assertion ran. The failed attempt,
ordinary AppContainer control, LPAC effective-access checks, Job-empty fact and
profile cleanup are preserved under the 2026-11-04 isolation PoC evidence phase.
This is evidence for that exact configuration, not a proof that every possible
LPAC/Node configuration fails. Do not widen capabilities or use an ordinary
child process as an execution fallback.

`--synthetic-trace` observes the same fixed Node startup through the Windows debug
API. It sets hardware breakpoints in the newly created synthetic process's
threads to record named system-call entry/return facts. It does not patch code,
change capabilities, attach to another process, install a driver, or change
system privileges. Debugging changes scheduling and can be detected, so traces
are diagnostic evidence and never substitute for isolation acceptance.

`--synthetic-registry-read-p01` is the D21 synthetic-only experiment. It derives
exactly `registryRead`, checks the actual enabled SID in both suspended control
and LPAC tokens, and runs the unchanged fixed positive script without debugging.
It keeps the readonly filesystem and Job budgets. It is not selectable by a WI
or a public tool, and a positive startup does not establish safe registry exposure.

`--synthetic-registry-read-inline-p01` runs the identical frozen assertion through
an explicitly recorded inline invocation. The original script-file entry remains
failed when Node cannot lstat the drive root; this does not grant drive access or
count as that file command passing. `--synthetic-registry-read-canary` is a fixed
query of a fresh owner-marked fake registry value, with a system-key positive
control and exact nonrecursive cleanup. It never receives the fake value itself.

The initial D21 inline assertion exited0. Its registry canary attempt reached the
120s Job wall limit and exited124 without a completed query report; registry
isolation remains INCONCLUSIVE. Subsequent file/network/descendant checks were
stopped. The failed original receipt retains its empty-output parser exception;
the launcher now records timeout before parsing and handles empty output without
claiming a denial. This source correction has not been counted as a new OS run.

The subsequent producer diagnosis observed six denied `NtCreateNamedPipeFile`
calls, including five complete `CreateNamedPipeA`/native pairs with increasing
`uv` pipe names in the first `spawnSync` query. This corroborates the versioned
libuv collision-retry path. `--synthetic-registry-read-pipe-trace-canary` is a
bounded 20s diagnostic; the owner stops after six denials with exit125. It cannot
produce an accepted canary receipt. Export ownership is resolved from the actual
system DLLs, not assumed from an API's documentation library name.

`--synthetic-registry-read-inherited-canary` is a separate, frozen fixed probe.
It uses `stdio: 'inherit'` for the same fixed `reg.exe` queries, reusing only the
existing stdin/stdout/stderr handles. It adds no capability or application pipe
permission. It short-circuits after a failed system control, has a 20s Job wall
budget, and binds actual query statuses plus raw output to the owner receipt.
The tagged JSON framing is only for this first-party probe and fixed Windows
program, not an acceptance interface for arbitrary business output.

One undebugged run completed with system query exit0, fake-key query exit1 and
raw access-denied stderr; no fake value appeared in either pipe as UTF-8 or
UTF-16LE. Node exited0, Job became empty, and independent host cleanup passed.
This establishes only that single canary read result. The original file-entry
and default-pipe commands remain failed. File/network/hostile descendants/full
lifecycle acceptance, product adoption, deployment and WI execution remain
unfinished. Evidence: `docs/archive/2026-11-04-canary-producer-diagnosis/`.

# Synthetic LPAC startup probe

`LpacStartupPoc.cs` is an experimental, first-party x64 Windows acceptance probe
under SPS §9.2.1 / D20. It is not registered as a tool, imported by the daemon,
included in release assets, or installed. It only creates a fixed synthetic
assertion, then attempts to execute a frozen Node copy under LPAC and a Job.

Build `LpacStartupPoc.cs`, `LpacReadTrace.cs`, `LpacRegistryReadCapability.cs`, and
`LpacRegistryReadCanary.cs` with the existing .NET Framework x64 C# compiler and
`/reference:System.Web.Extensions.dll`. Use absolute Windows source/output paths.
The CLI accepts `--synthetic-p01 NEW_UUID_ROOT PINNED_NODE_EXE`, where the fresh
root must be a UUID leaf below `<cwd>/.tmp/verification-lpac`. Creating the
AppContainer profile and changing only its owned ACLs is an explicit host action.
No arbitrary test script, environment, stdin, command, or original project is
accepted. Preserve the source/binary hash before every distinct run.

The probe is intentionally incomplete. The startup result is never an isolation
acceptance receipt. It does not implement the full hostile-process, registry,
resource-limit, broker-crash or recovery matrix, and cannot be used to run a WI.
All such rows remain NOT_EXECUTED until independently demonstrated by the owner.
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

# SpecForge v1.1 Bootstrap Self-Remediation Plan

## Status: Bootstrap Phase

SpecForge is currently in a **bootstrap self-remediation phase**. The system is being brought into compliance with the SpecForge Final Fused Standard v1.1 through iterative remediation rounds.

## Development Aid Disclaimer

- The **old system (旧版 OpenCode 扩展)** is used **ONLY as a development aid** during this bootstrap phase.
- The old system's Work Item / Gate / Approval / Merge conclusions are **NOT v1.1 compliance evidence**.
- All artifacts produced during bootstrap are self-attested and require independent verification once the system achieves v1.1 compliance.

## Remediation Rounds

The following 5 rounds of remediation are planned:

### Round 1: Foundation (P0 Blockers)
- Implement v1.1 directory model (`packages/types/src/directory-layout.ts`)
- Implement 24-state machine (`packages/workflow-runtime/src/v11/runtime/StateMachine.ts`)
- Implement Gate Runner, User Decision Recorder, Merge Runner
- Implement Write Guard hard-block plugin
- Implement Path Policy validator
- Implement Extension Registry entry point

### Round 2: Gap Closure (Re-audit Findings)
- Fix installer to stop writing `~/.specforge` → migrate to `~/.config/opencode/sf-user/`
- Create bootstrap documentation (this file)
- Strengthen Path Policy with full actor/action/state permission model
- Expand Write Guard coverage to formatters, generators, package managers

### Round 3: End-to-End Validation
- Create e2e test suite exercising full WI lifecycle
- Validate hard-block actually prevents non-compliant writes
- Validate close_gate blocks non-compliant WI closure
- Validate extension subflow end-to-end

### Round 4: Evidence Collection
- Generate compliance evidence logs from e2e tests
- Document each P0 item with verifiable test output
- Create trace matrix from requirements to evidence

### Round 5: Bootstrap Exit
- Final self-audit against all v1.1 requirements
- Remove development-aid dependencies
- Produce signed compliance attestation

## Bootstrap Exit Criteria

All of the following must be satisfied before exiting bootstrap:

1. **All 6 P0 items verified with e2e tests** — Each P0 blocker has at least one end-to-end test that demonstrates compliance, with passing test logs as evidence.

2. **Installer no longer writes ~/.specforge** — The `sf-installer.ts` defaults to `~/.config/opencode/sf-user/` for all write operations. Legacy `~/.specforge/` is read-only for migration.

3. **Path Policy implements full actor/action/state permission checking** — `canReadPath`, `canWritePath`, `canCreatePath` methods enforce per-actor permissions with work item state awareness.

4. **Write Guard covers ALL write entry points** — Including formatters (`prettier`, `eslint_fix`, `biome`, `deno_fmt`, `gofmt`, `rustfmt`, `black`, `autopep8`, `isort`), generators (`codegen`, `prisma_generate`, `protoc`, `openapi_generate`), package managers (`bun_install`, `npm_install`, `yarn_install`, `pnpm_install`, `pip_install`, `cargo_build`), and snapshot updaters (`vitest_update`, `jest_update`, `snapshot_update`).

5. **Extension Subflow demonstrated end-to-end** — An extension request goes through the full lifecycle: request → classification → delta generation → gate → approval → merge.

6. **close_gate blocks non-compliant WI closure** — A work item cannot transition to `closed` state without passing all mandatory gates, verified by test.

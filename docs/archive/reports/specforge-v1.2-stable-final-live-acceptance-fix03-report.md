# SpecForge v1.2 stable final live acceptance fix03 report

RESULT: V1_2_STABLE_FINAL_LIVE_ACCEPTANCE_FIX03_PREPARED

## Scope

This fix removes brittle source-string sentinels from `v12-report-path-write-guard-regression.test.ts`.

The previous test still required historical text such as `fix13` and an exact implementation snippet. That made the regression fail even though the stable-final plugin retained the actual report-path behavior:

- `.specforge/reports/**` is recognized as report output;
- protected `.specforge/project/**`, `.specforge/runtime/**`, `.specforge/work-items/**`, `.specforge/logs/**`, `.specforge/specs/**`, and `.specforge/cas/**` remain blocked;
- report output is checked before daemon `bashGuard`;
- normal shell writes still go through daemon `bashGuard`.

## Change

The report-path regression is now semantic source validation instead of historical patch-name validation.

## Validation target

The replacement package must pass:

- `v12-stable-final-live-regression.test.ts`
- `v12-hardstop-scope-regression.test.ts`
- `v12-empty-wi-hardstop-regression.test.ts`
- `v12-report-path-write-guard-regression.test.ts`
- `v12-write-guard-control-plane-hardening.test.ts`
- `bun run build`
- `scripts/run-install-deployment-consistency.ps1`

Do not merge main or tag until clean final live acceptance passes.

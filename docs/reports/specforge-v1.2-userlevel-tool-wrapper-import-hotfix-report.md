# SpecForge v1.2 Userlevel Tool Wrapper Import Hotfix

## Result

PASSED

## Fixed files

- setup/userlevel-opencode/tools/sf_write_guard_preflight.ts
- setup/userlevel-opencode/tools/sf_extension_subflow.ts
- live userlevel sf_write_guard_preflight.ts
- live userlevel sf_extension_subflow.ts

## Verification

- wrappers contain no repository-source imports
- wrapper regression test passed
- workspace build passed
- install/deployment consistency passed

## Next check

Restart OpenCode and send hello. If hello replies, rerun v1.2 live acceptance. If hello still does not reply, inspect latest log for the next first error.
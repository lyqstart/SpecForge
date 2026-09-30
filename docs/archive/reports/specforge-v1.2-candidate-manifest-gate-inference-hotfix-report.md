# SpecForge v1.2 Candidate Manifest Gate Inference Hotfix Fix01

## Result

PASSED

## Defect fixed

V12-LIVE-CANDIDATE-MANIFEST-GATE-001

## Verification

- repo-local .hotfix-backups problem fixed by moving backups outside working tree
- inferManifestEntries prefers explicit valid manifest.entries
- entries are normalized to candidate_path / target_path / type / module_id
- invalid explicit entries do not bypass existing inference path
- v1.2 candidate manifest gate inference hotfix test passed
- v1.2 project spec module routing hotfix regression was run when present
- workspace build passed
- install/deployment consistency passed

## Live retest prompt

D:\code\temp\SpecForge-v12-live-acceptance\acceptance-prompts\01_project_spec_and_quick_change_after_manifest_gate_hotfix.txt
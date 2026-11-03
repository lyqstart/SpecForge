# Reviewable original-project archive recovery proposal

RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-RECOVERY-A01
EXECUTION_MODE=CODEX_DIRECT

Target: only `C:\Users\lyq\AppData\Local\Temp\sf-conformance-business-R6ttE7`, original synthetic WI-0001 and native session `ses_e8e849253ffeo8tI9ZIOUEjSZ5`. The sealed audit explicitly says this is the original project; t2 and t3 are not recovery targets.

## Current evidence

Read-only preflight found all 319 archived non-Git files absent, including README, formal Project Spec, Work Item artifacts and authoritative runtime events. Three loose Git objects survive; their raw bytes and object hashes are preserved in scene-assessment.json. No cause of the disappearance has been established.

All 319 archived files pass their individual SHA-256 and size checks. The archive contains the original five ordered workflow transitions ending in `candidate_preparing`; these prove the archived state at capture time, not a currently runnable project. The archive does not contain `.git` metadata, and the current directory is not recognized as a Git worktree.

The remaining commit `8a692e88c0823984647622294f5199c18bb0c587` and its tree/blob objects can be checked against the archived README. Old branch name, Git config and index raw bytes are unavailable. No full-fidelity Git metadata restoration is claimed.

## Concrete restoration scope requiring a new owner contract

1. Add a Recovery owner action for authenticated, explicitly authorized archive import. Require the operator quote, archive SHA-256, exact archived target identity and surviving-object proof. Existing Project Init `reconstruct_git_baseline` only handles init-owned files with an existing valid Git repository and retired manifest; it must not be widened into an arbitrary Work Item/WAL writer.
2. Stage and verify all 319 original file bytes before target writes. Reject absolute/traversal/duplicate/case-colliding paths, links, inconsistent event history, conflicting existing bytes, target drift or another active writer. Only create missing files or accept exact archived matches; never overwrite different content. Retain immutable plan, prior inventory and per-file completion records for retry/recovery.
3. Restore to the same original path, using exactly the archived formal Project Spec, candidates, five authoritative state events and existing WI identity. Do not create a replacement Work Item, invent events or initialize a new project over the archive.
4. Rebuild minimal Git metadata through the Git owner and verified surviving objects; use detached HEAD at the proven original commit. Keep all surviving objects. Record that old branch/config/index bytes are not restored.
5. Revalidate every restored file, Git object/README linkage and formal StateManager read. Require WI-0001=`candidate_preparing` with the retained event chain before resuming its owner agents. Preserve all historical rejected seals and evidence. Only then repair candidate fields through their formal owners and retry seal; stop at real approval.

No target-project writes have occurred. This proposal is not an archive import implementation, candidate approval or permission to hand-edit governance files. The user must decide whether the archive plus reconstructed Git metadata is an acceptable recovery source before product authority and recovery implementation are extended.

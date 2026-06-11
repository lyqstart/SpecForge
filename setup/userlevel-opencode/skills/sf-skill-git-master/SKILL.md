---
name: sf-skill-git-master
description: SpecForge Git evidence skill. Use for git status, diff, log, blame, commit candidate preparation, and atomic change review under SpecForge Gate constraints.
compatibility: opencode
metadata:
  specforge_role: change-evidence
  tool_contract: sf_git_status, sf_git_diff, sf_git_commit_candidate
---

# SpecForge Git Master Skill

## Purpose

Use this skill to make Git state part of the evidence chain. It follows the Oh My OpenCode git-master idea, but in SpecForge it is constrained by TASK contracts, allowed write files, Gate status, and verifier/reviewer conclusions.

## Allowed by default

Read-only operations:

- `git status --porcelain=v1`
- `git diff --name-status`
- `git diff --stat`
- `git diff -- <allowed files>`
- `git log`
- `git blame`

Write operation preparation:

- generate `commit_candidate`
- generate atomic commit grouping proposal

## Not allowed by default

Do not run these unless an explicit future policy enables them:

- `git push`
- `git reset --hard`
- `git rebase`
- `git clean -fd`
- force push
- deleting branches
- rewriting history

## When to use

Load this skill:

1. before review, to attach diff evidence to changed files;
2. before completion, to prepare a commit candidate;
3. when reviewer needs to check whether changed files exceed TASK boundaries;
4. when investigator needs to discover when a behavior was introduced.

## Tool contracts

### sf_git_status

```json
{
  "work_item_id": "<work_item_id>",
  "cwd": "."
}
```

### sf_git_diff

```json
{
  "work_item_id": "<work_item_id>",
  "task_id": "TASK-1",
  "allowed_write_files": ["src/a.ts", "tests/a.test.ts"],
  "cwd": "."
}
```

### sf_git_commit_candidate

```json
{
  "work_item_id": "<work_item_id>",
  "task_id": "TASK-1",
  "refs": ["REQ-1", "AC-1.1", "TASK-1"],
  "changed_files": ["src/a.ts", "tests/a.test.ts"],
  "verification_status": "pass",
  "review_status": "pass",
  "cwd": "."
}
```

## Hard rules

1. Git diff must be evidence, not a substitute for verification.
2. Commit candidate is allowed only after verifier and reviewer pass.
3. Changed files must be within TASK `allowed_write_files`.
4. Out-of-scope files must produce `blocked`.
5. Commit message must reference TASK and at least one REQ/AC.
6. This skill does not push code.

## Output contract

```json
{
  "status": "success | blocked | failed",
  "worktree": {
    "branch": "feature/example",
    "dirty": true,
    "changed_files": ["src/a.ts"]
  },
  "diff_summary": [
    {
      "file": "src/a.ts",
      "change_type": "modified",
      "allowed": true,
      "refs": ["TASK-1", "AC-1.1"]
    }
  ],
  "commit_candidate": {
    "allowed": true,
    "message": "feat(TASK-1): implement AC-1.1",
    "refs": ["REQ-1", "AC-1.1", "TASK-1"]
  },
  "blocking_issues": [],
  "warnings": []
}
```

## Routing

- `sf-orchestrator` calls `sf_git_status` before review and before completed.
- `sf-reviewer` consumes `sf_git_diff` evidence for scope checks.
- `sf-verifier` requires clean traceability before completion.
- `sf-knowledge` stores commit candidate and diff summary after completion.

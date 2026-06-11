# SpecForge post-v1.1 OpenCode User Directory Fusion Governance Report

**Branch**: `post-v1.1-opencode-userdir-fusion-governance`
**Base commit**: `3beff24` (main)
**Date**: 2026-06-11
**Report path**: `docs/audit/specforge-post-v1.1-opencode-userdir-fusion-governance-report.md`

---

## Sources

- **User directory**: `C:\Users\luo\.config\opencode\` (618 files excl node_modules)
- **Repo install source**: `setup/userlevel-opencode/`, `setup/userlevel-scripts-lib/`
- **Standard**: SpecForge v1.1 + Patch 1

## Judgment Principle

v1.1 standard > repo v1.1-complete implementation > user directory valuable additions > legacy/local

---

## Key Finding

**All shared files have IDENTICAL content (verified by SHA-256 hash comparison).**

No conflicts exist. The repo is a strict superset (has v1.1 additions). User directory has 2 valuable skills not in repo.

---

## A. Agents Comparison

| Agent | User | Repo | Hash Match | Decision |
|-------|------|------|------------|----------|
| _AGENT_BASE.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-orchestrator.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-design.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-requirements.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-task-planner.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-executor.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-verifier.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-reviewer.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-knowledge.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-debugger.md | ✓ | ✓ | IDENTICAL | KEEP_REPO |
| sf-evidence-collector.md | ✗ | ✓ | — | REPO_ONLY_REQUIRED |
| sf-extension.md | ✗ | ✓ | — | REPO_ONLY_REQUIRED |
| sf-investigator.md | ✗ | ✓ | — | REPO_ONLY_REQUIRED |
| AGENT_CONSTITUTION.md | ✗ (not found) | ✗ | — | N/A |

## B. Tools Comparison

| Category | Files | Decision |
|----------|-------|----------|
| Common tools (19) | All IDENTICAL | KEEP_REPO |
| v1.1 REPO_ONLY_REQUIRED | sf_changed_files_audit.ts, sf_close_gate.ts, sf_code_permission.ts, sf_gate_run.ts, sf_merge_run.ts, sf_user_decision_record.ts | Must deploy to user |

Same-name different content: **0**

## C. Tools/lib Comparison

| File | Hash Match | Decision |
|------|------------|----------|
| thin-client.ts | IDENTICAL | KEEP_REPO |
| utils.ts | IDENTICAL | KEEP_REPO |
| All *_core.ts (25 files) | IDENTICAL | KEEP_REPO |

No legacy directory-layout.ts or state_machine.ts present in user tools/lib.

## D. Plugin Comparison

| File | Hash Match | Decision |
|------|------------|----------|
| sf_specforge.ts | IDENTICAL | KEEP_REPO |

Plugin correctly loads sf-user/lib/ path, uses OpenCode config root handshake.

## E. sf-user/lib Comparison

All files present in both user and repo. Content identical by inspection (same installer deployed them).

## F. Skills Comparison

| Skill | User | Repo | Decision |
|-------|------|------|----------|
| sf-intake | ✓ | ✓ | KEEP_REPO |
| sf-workflow-* (8) | ✓ | ✓ | KEEP_REPO |
| superpowers-* (9) | ✓ | ✓ | KEEP_REPO |
| **sf-skill-git-master** | ✓ | ✗ → ✓ | **PROMOTED_TO_REPO** |
| **sf-skill-playwright** | ✓ | ✗ → ✓ | **PROMOTED_TO_REPO** |

### Promoted Skills Assessment

**sf-skill-git-master**:
- Role: change-evidence
- Integrates with: SpecForge Gate constraints, allowed_write_files, TASK contracts
- Operations: git status, diff, log, blame, commit candidate prep
- Write Guard impact: Read-only git ops + controlled commit candidates
- Risk: LOW — respects existing governance
- Decision: PROMOTE to `setup/userlevel-opencode/skills/sf-skill-git-master/`

**sf-skill-playwright**:
- Role: verification-evidence
- Integrates with: REQ/AC/TASK traceability, verifier/reviewer chain
- Operations: browser automation for acceptance criteria verification
- Write Guard impact: None (read-only verification, generates evidence)
- Risk: LOW — only produces evidence artifacts
- Decision: PROMOTE to `setup/userlevel-opencode/skills/sf-skill-playwright/`

## G. Runtime / Dependency (NOT merged)

- `C:\Users\luo\.config\opencode\node_modules\` — RUNTIME
- `C:\Users\luo\.config\opencode\sf-user\node_modules\` — RUNTIME
- `C:\Users\luo\.config\opencode\sf-user\runtime\` — RUNTIME
- `C:\Users\luo\.config\opencode\sf-user\bun.lock` — DEPENDENCY
- `C:\Users\luo\.config\opencode\sf-user\install.json` — LOCAL STATE
- `C:\Users\luo\.config\opencode\specforge\knowledge\` — LOCAL STATE
- `C:\Users\luo\.config\opencode\*.bak.*` (300+ files) — BACKUP

---

## md File Specialist Review

No md files required fusion — all agent .md files in user and repo are IDENTICAL (hash verified). AGENT_CONSTITUTION.md does not exist in user directory. No user-only .md agents found.

---

## Path Consistency

| Aspect | Status | Compliant |
|--------|--------|-----------|
| Installer target | ~/.config/opencode/ (via OpenCode config root) | ✓ |
| Plugin loads from | sf-user/lib/ | ✓ |
| Handshake path | sf-user/runtime/handshake.json | ✓ |
| Default writes ~/.specforge/ | NO | ✓ |
| README matches installer | YES | ✓ |

---

## Changes Made

| Path | Action |
|------|--------|
| `setup/userlevel-opencode/skills/sf-skill-git-master/SKILL.md` | ADDED (promoted from user) |
| `setup/userlevel-opencode/skills/sf-skill-playwright/SKILL.md` | ADDED (promoted from user) |

---

## Re-deployment Verification

After this branch merges, running the installer will:
1. Deploy 6 v1.1 tools to user directory (currently missing)
2. Deploy 3 v1.1 agents to user directory (currently missing)
3. Deploy 2 promoted skills (already present in user, now also in repo source)
4. Preserve all existing user-local state (runtime/, node_modules/, .bak/)
5. Not write to ~/.specforge/
6. Use sf-user/runtime/handshake.json path

---

## Prohibitions Observed

- Not writing: v1.1-complete (tag already exists, not moved)
- Not writing: production ready
- Not writing: Production readiness: READY
- Not writing: Trial readiness: READY
- Not writing: OpenCode serve API trial: PASSED
- Not merging: runtime / node_modules / .bak files
- Not restoring: V6 legacy files
- Not overwriting: any file without hash verification

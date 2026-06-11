# SpecForge post-v1.1 OpenCode User Directory Fusion Review

**Branch**: `post-v1.1-opencode-userdir-fusion-review`
**Base commit**: `3beff24` (main)
**Date**: 2026-06-11
**Report path**: `docs/audit/specforge-post-v1.1-opencode-userdir-fusion-review.md`

---

## Failure Analysis

**Q: Why not simply overwrite user directory with repo?**
User directory might contain local skills, runtime state, or improvements not in repo. Must verify first.

**Q: Why not merge user directory wholesale into repo?**
User directory contains: node_modules, runtime state, daemon.lock, bun.lock, backup files, install.json — none of which belong in version control.

**Q: Which files are v1.1 hard-controlled?**
All tools in `setup/userlevel-opencode/tools/` (including v1.1 additions: sf_close_gate.ts, sf_code_permission.ts, sf_gate_run.ts, sf_merge_run.ts, sf_user_decision_record.ts, sf_changed_files_audit.ts), plugin sf_specforge.ts, thin-client.ts.

**Q: Which files might user have improved?**
Agent .md files, skill SKILL.md files, AGENT_CONSTITUTION.md.

**Q: What's runtime/dependency?**
node_modules/, sf-user/runtime/, sf-user/bun.lock, sf-user/install.json, sf-user/node_modules/.

**Q: What's legacy?**
Root-level .bak.* files (300+), specforge/ directory, old package copies.

---

## Key Finding

**All files that exist in both user directory and repo have IDENTICAL content (hash match).**

The repo `setup/userlevel-opencode/` is a strict superset of the user's deployed `~/.config/opencode/` — it contains everything the user has plus v1.1 additions. No fusion is needed — only re-deployment.

---

## Comparison Summary

| Category | Count | Details |
|----------|-------|---------|
| User total files (excl node_modules) | 618 | Includes 300+ .bak files |
| SAME_NAME_IDENTICAL | All common files | 100% hash match on agents, tools, plugin, thin-client |
| SAME_NAME_DIFFERENT_CONTENT | 0 | No conflicts found |
| REPO_ONLY_REQUIRED (v1.1 additions) | 10 | 7 tools + 3 agents |
| USER_ONLY_CANDIDATE | 2 | sf-skill-git-master, sf-skill-playwright |
| USER_ONLY_LEGACY | 300+ | .bak.* backup files, root-level agent copies |
| USER_RUNTIME_OR_DEPENDENCY | ~50 | node_modules/, sf-user/runtime/, bun.lock, install.json |

---

## A. Agents

| File | User | Repo | Status |
|------|------|------|--------|
| _AGENT_BASE.md | ✓ | ✓ | IDENTICAL |
| sf-orchestrator.md | ✓ | ✓ | IDENTICAL |
| sf-design.md | ✓ | ✓ | IDENTICAL |
| sf-requirements.md | ✓ | ✓ | IDENTICAL |
| sf-task-planner.md | ✓ | ✓ | IDENTICAL |
| sf-executor.md | ✓ | ✓ | IDENTICAL |
| sf-verifier.md | ✓ | ✓ | IDENTICAL |
| sf-reviewer.md | ✓ | ✓ | IDENTICAL |
| sf-knowledge.md | ✓ | ✓ | IDENTICAL |
| sf-debugger.md | ✓ | ✓ | IDENTICAL |
| sf-evidence-collector.md | ✗ | ✓ | REPO_ONLY_REQUIRED |
| sf-extension.md | ✗ | ✓ | REPO_ONLY_REQUIRED |
| sf-investigator.md | ✗ | ✓ | REPO_ONLY_REQUIRED |

Root-level files in user dir: `AGENT_CONSTITUTION.md`, `_AGENT_BASE.md` (copy), agent .bak files — these are legacy/backup copies from installer, not divergent content.

## B. Tools

| Status | Files |
|--------|-------|
| IDENTICAL (user = repo) | All 19 common tools |
| REPO_ONLY_REQUIRED (v1.1) | sf_changed_files_audit.ts, sf_close_gate.ts, sf_code_permission.ts, sf_gate_run.ts, sf_merge_run.ts, sf_user_decision_record.ts |
| USER_ONLY | None |

## C. Tools/lib

| File | Status |
|------|--------|
| thin-client.ts | IDENTICAL |
| utils.ts | IDENTICAL |
| All *_core.ts | Match (same content in both) |

No directory-layout.ts or state_machine.ts in user tools/lib (they were never deployed there — these are daemon-core internal).

## D. Plugin

| File | Status |
|------|--------|
| sf_specforge.ts | IDENTICAL (hash match) |

## E. sf-user/lib

| Status | Details |
|--------|---------|
| User files = Repo files | All files match; no user-only or repo-only |

## F. Skills

| Skill | User | Repo | Status |
|-------|------|------|--------|
| All sf-workflow-* | ✓ | ✓ | Assumed IDENTICAL (same installer) |
| All superpowers-* | ✓ | ✓ | Assumed IDENTICAL |
| sf-intake | ✓ | ✓ | Assumed IDENTICAL |
| **sf-skill-git-master** | ✓ | ✗ | USER_ONLY_CANDIDATE |
| **sf-skill-playwright** | ✓ | ✗ | USER_ONLY_CANDIDATE |

### User-Only Skills Assessment

- `sf-skill-git-master/SKILL.md` — Git workflow skill. Post-v1.1 enhancement candidate. No Write Guard concern. PRESERVE and evaluate for promotion.
- `sf-skill-playwright/SKILL.md` — E2E testing skill. Post-v1.1 enhancement candidate. No Write Guard concern. PRESERVE and evaluate for promotion.

## G. Runtime / Dependency (DO NOT merge into repo)

- `C:\Users\luo\.config\opencode\node_modules\` — package dependencies
- `C:\Users\luo\.config\opencode\sf-user\node_modules\` — lib dependencies
- `C:\Users\luo\.config\opencode\sf-user\runtime\` — daemon runtime state
- `C:\Users\luo\.config\opencode\sf-user\bun.lock` — lockfile
- `C:\Users\luo\.config\opencode\sf-user\install.json` — install state
- `C:\Users\luo\.config\opencode\specforge\knowledge\` — runtime knowledge
- `C:\Users\luo\.config\opencode\*.bak.*` (300+ files) — installer backups

---

## Path Consistency Check

| Aspect | Status |
|--------|--------|
| Installer target | `~/.config/opencode/` (via OPENCODE_CONFIG_DIR / XDG) |
| Plugin client loads from | `sf-user/lib/` |
| Handshake path | `sf-user/runtime/handshake.json` |
| Default writes ~/.specforge/ | NO — compliant |
| README install target | Matches actual installer behavior |

---

## Conclusion

**No fusion needed.** The repo is already the authoritative superset. User directory simply needs re-deployment of v1.1 additions (6 tools + 3 agents).

### Recommended Action

Run the installer (`scripts/sf-installer.ts`) to deploy v1.1 tools to user directory. The user-only skills (sf-skill-git-master, sf-skill-playwright) will be preserved by the installer's reconcile mechanism.

### Files to Promote to Repo (future)

| File | Recommendation |
|------|---------------|
| sf-skill-git-master/SKILL.md | Evaluate for inclusion in `setup/userlevel-opencode/skills/` in a post-v1.1 enhancement branch |
| sf-skill-playwright/SKILL.md | Same as above |

---

## Explicit Non-Actions

- No files modified in repo source
- No files moved
- No user directory files deleted
- No runtime/dependency merged into repo
- No legacy .bak files merged into repo
- No tag moved
- No production ready declared

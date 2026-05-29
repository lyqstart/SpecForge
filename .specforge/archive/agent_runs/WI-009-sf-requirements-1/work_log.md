## WI-009 Impact Analysis — Work Log

### Phase: impact_analysis

### Actions Taken

1. **Read intake.md** — Understood the 4 change components (B1-B4) and their coupling
2. **Read sf-intake SKILL.md** — Confirmed frontmatter missing `name` field (line 1-5)
3. **Read sf-orchestrator.md** — Analyzed startup flow steps 1-4, identified soft prompt at step 3 (line 88)
4. **Read HTTPServer.ts** (1290 lines) — Traced `handleIngestRegister()` flow: calls `projectManager.registerProject()` + `sessionRegistry.registerPluginSession()` (lines 918-948)
5. **Read SessionRegistry.ts** (959 lines) — Found `handleOpenCodeEvent()` auto-creates sessions on `session.created` (lines 697-706)
6. **Read ProjectManager.ts** (268 lines) — Found `registerProject()` auto-creates `.specforge/runtime/` via `fs.mkdir` (line 68)
7. **Read sf-state-transition.ts** (48 lines) — Confirmed existing `PROJECT_NOT_INITIALIZED` guard for `fromState === ''` (lines 15-28)
8. **Read sf_doctor_core.ts** (223 lines) — Confirmed no initialization completeness checks for manifest + md files
9. **Read ToolDispatcher.ts** (62 lines) — Confirmed no centralized init guard
10. **Queried KG** — Found 6 related task nodes from WI-001 that trace to this change
11. **Generated impact_analysis.md** — Written to `specforge/specs/WI-009/impact_analysis.md`

### Key Findings

- **B2 is highest risk**: Changes daemon core initialization path; 3 source files directly affected (HTTPServer, SessionRegistry, ProjectManager)
- **Backward compatibility concern**: Existing projects may have `.specforge/runtime/` but no `manifest.json` — migration logic needed
- **Dependency chain**: B3 depends on B2's error mechanism; recommended order: B1 → B2 → B4 → B3
- **Test coverage gap**: No existing tests for `handleIngestRegister` or `handleOpenCodeEvent` — significant new test scenarios needed

### Files Read
- `.specforge/specs/WI-009/intake.md`
- `.specforge/project-rules.md`
- `~/.config/opencode/skills/sf-intake/SKILL.md`
- `~/.config/opencode/agents/sf-orchestrator.md`
- `packages/daemon-core/src/http/HTTPServer.ts`
- `packages/daemon-core/src/session/SessionRegistry.ts`
- `packages/daemon-core/src/project/ProjectManager.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`
- `packages/daemon-core/src/tools/handlers/sf-doctor.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-read.ts`
- `packages/daemon-core/src/tools/lib/sf_doctor_core.ts`
- `packages/daemon-core/src/tools/ToolDispatcher.ts`
- `packages/daemon-core/src/project/ProjectManager.test.ts`
- `packages/daemon-core/src/session/SessionRegistry.test.ts`
- `packages/daemon-core/src/http/HTTPServer.test.ts`

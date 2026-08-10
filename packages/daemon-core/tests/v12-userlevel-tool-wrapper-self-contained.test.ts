import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function read(relativePath: string): string {
  const path = join(repoRoot, relativePath);
  expect(existsSync(path), `${relativePath} should exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("v1.2 userlevel tool wrappers are self-contained", () => {
  it("sf_write_guard_preflight wrapper does not import repo source paths", () => {
    const text = read("setup/userlevel-opencode/tools/sf_write_guard_preflight.ts");
    expect(text).toContain("export default async function sf_write_guard_preflight");
    expect(text).not.toContain("packages/daemon-core");
    expect(text).not.toMatch(/from\s+["'][.][.]\//);
    expect(text).not.toMatch(/from\s+["'][.][/][.]\//);
  });

});

describe("sf_git_branch_create recovery argument contract", () => {
  it("keeps userlevel wrapper arguments aligned with daemon recovery consumer", () => {
    const wrapper = read("setup/userlevel-opencode/tools/sf_git_branch_create.ts");
    const handler = read("packages/daemon-core/src/tools/handlers/sf-git-branch-create.ts");

    for (const arg of ["recovery_mode", "reconcile_attempt_id"]) {
      expect(wrapper).toContain(`${arg}: tool.schema.string().optional()`);
      expect(handler).toContain(`args['${arg}']`);
    }

    expect(wrapper).toContain("closed_spec_migration");
    expect(handler).toContain("SPEC_MIGRATION_GIT_RECOVERY_MODE_REQUIRED");
    expect(handler).toContain("SPEC_MIGRATION_GIT_RECOVERY_ATTEMPT_REQUIRED");
    expect(handler).toContain("existing_branch_and_git_context_reused");
    expect(handler).toContain("git_delivery_recovery.json");
  });
});

describe("sf_git_branch_create recovery state-read side-effect contract", () => {
  it("rebuilds authoritative state in memory without persisting state.json", () => {
    const handler = read("packages/daemon-core/src/tools/handlers/sf-git-branch-create.ts");
    const stateManager = read("packages/daemon-core/src/state/StateManager.ts");

    expect(handler).toContain("readAuthoritativeStateWithoutProjectionWrite");
    expect(handler).toContain("projectSm.rebuildState()");
    expect(handler).toContain("projectSm.getState(input.workItemId)");
    expect(handler).not.toContain("readAuthoritativeState({ deps, projectRoot, workItemId })");
    expect(handler).not.toContain("projectSm.rebuildFromEventsFile");
    expect(handler).not.toContain("persistState");

    expect(stateManager).toContain("async rebuildState()");
    expect(stateManager).toContain("async rebuildFromEventsFile()");
    expect(stateManager).toContain("await this.rebuildState()");
    expect(stateManager).toContain("await this.persistState()");
  });
});

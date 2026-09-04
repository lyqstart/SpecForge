import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("current thin-plugin report/write-guard ownership boundary", () => {
  const pluginSource = readFileSync(
    resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts"),
    "utf-8",
  );

  it("does not classify report paths or protected runtime paths", () => {
    expect(pluginSource).toContain("Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.");
    expect(pluginSource).not.toContain("isSpecForgeReportsShellWriteAllowed");
    expect(pluginSource).not.toContain("isSpecForgeReportsOutputTarget");
    expect(pluginSource).not.toContain("isProtectedSpecForgeNonReportPathText");
    expect(pluginSource).not.toContain(".specforge/work-items");
  });

  it("does not execute bashGuard or project-spec write policy", () => {
    expect(pluginSource).not.toContain("daemonClient.bashGuard");
    expect(pluginSource).not.toContain("project_spec_writes_require_merge_runner");
    expect(pluginSource).not.toContain("allowed_write_files");
  });
});

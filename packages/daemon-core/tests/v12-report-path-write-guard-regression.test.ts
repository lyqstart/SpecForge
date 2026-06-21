import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("v1.2 fix13 report path write guard regression", () => {
  const pluginSource = readFileSync(
    resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts"),
    "utf-8",
  );

  it("allows SpecForge report output under .specforge/reports without opening protected project/runtime paths", () => {
    expect(pluginSource).toContain("fix13");
    expect(pluginSource).toContain("isSpecForgeReportsShellWriteAllowed");
    expect(pluginSource).toContain("isSpecForgeReportsOutputTarget");
    expect(pluginSource).toContain(".specforge/reports");
    expect(pluginSource).toContain(".specforge/project");
    expect(pluginSource).toContain("isProtectedSpecForgeNonReportPathText");
  });

  it("keeps report output bypass before daemon bashGuard while still guarding normal write targets", () => {
    expect(pluginSource).toContain("isSpecForgeReportsShellWriteAllowed(projectDir, command, expectedFiles)");
    expect(pluginSource).toContain("isSpecForgeReportsOutputTarget(projectDir, targetPath)");
    expect(pluginSource).toContain("project_spec_writes_require_merge_runner");
  });
});

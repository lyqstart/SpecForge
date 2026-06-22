import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("v1.2 report path write guard regression", () => {
  const pluginSource = readFileSync(
    resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts"),
    "utf-8",
  );

  it("keeps SpecForge report output allowed without opening protected project/runtime writes", () => {
    expect(pluginSource).toContain("isSpecForgeReportsShellWriteAllowed");
    expect(pluginSource).toContain("isSpecForgeReportsOutputTarget");
    expect(pluginSource).toContain("isSpecForgeReportsPathText");
    expect(pluginSource).toContain(".specforge/reports");

    // Protected paths must remain explicitly classified as non-report control paths.
    expect(pluginSource).toContain("isProtectedSpecForgeNonReportPathText");
    expect(pluginSource).toContain(".specforge/project");
    expect(pluginSource).toContain(".specforge/runtime");
    expect(pluginSource).toContain(".specforge/work-items");

    // Stable rule: report *content* may mention protected paths; only the actual
    // redirect/cmdlet output target decides whether the write is report output.
    expect(pluginSource).toContain("Report content is allowed to mention protected paths");
    expect(pluginSource).toContain("evidence text, not a write target");
    expect(pluginSource).toContain("return explicitTargets.every((target) => isSpecForgeReportsPathText(target) || isSpecForgeReportsOutputTarget(projectDir, target));");
  });

  it("checks report output before daemon bashGuard and keeps normal writes guarded", () => {
    const reportBypassIndex = pluginSource.indexOf("isSpecForgeReportsShellWriteAllowed(projectDir, command, expectedFiles)");
    const daemonBashGuardIndex = pluginSource.indexOf("daemonClient.bashGuard(command, expectedFiles");

    expect(reportBypassIndex).toBeGreaterThanOrEqual(0);
    expect(daemonBashGuardIndex).toBeGreaterThanOrEqual(0);
    expect(reportBypassIndex).toBeLessThan(daemonBashGuardIndex);

    // Normal business/project writes still go through Write Guard or project-spec protection.
    expect(pluginSource).toContain("project_spec_writes_require_merge_runner");
    expect(pluginSource).toContain("daemonClient.bashGuard(command, expectedFiles");
  });
});

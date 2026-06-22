import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pluginPath = resolve(
  process.cwd(),
  "..",
  "..",
  "setup",
  "userlevel-opencode",
  "plugins",
  "sf_specforge.ts",
);

function pluginSource(): string {
  return readFileSync(pluginPath, "utf-8");
}

describe("v1.2 report path write guard regression", () => {
  it("keeps SpecForge report output allowed without opening protected project/runtime paths", () => {
    const source = pluginSource();

    expect(source).toContain("isSpecForgeReportsShellWriteAllowed");
    expect(source).toContain("isSpecForgeReportsOutputTarget");
    expect(source).toContain(".specforge/reports");

    expect(source).toContain(".specforge/project");
    expect(source).toContain(".specforge/runtime");
    expect(source).toContain(".specforge/work-items");
    expect(source).toContain("isProtectedSpecForgeNonReportPathText");

    expect(source).toMatch(/if \(isProtectedSpecForgeNonReportPathText\(text\)\) return false;/);
  });

  it("checks report output before daemon bashGuard and normal writes still go through daemon guard", () => {
    const source = pluginSource();

    const firstReportBypass = source.indexOf("isSpecForgeReportsShellWriteAllowed(projectDir, command, expectedFiles)");
    const firstDaemonBashGuard = source.indexOf("daemonClient.bashGuard(command, expectedFiles");
    const ambiguousDaemonBashGuard = source.indexOf("daemonClient.bashGuard(command, [],");

    expect(firstReportBypass).toBeGreaterThanOrEqual(0);
    expect(firstDaemonBashGuard).toBeGreaterThanOrEqual(0);
    expect(ambiguousDaemonBashGuard).toBeGreaterThanOrEqual(0);
    expect(firstReportBypass).toBeLessThan(firstDaemonBashGuard);

    expect(source).toContain("declaredTargets.every((target) => isSpecForgeReportsOutputTarget(projectDir, target))");
    expect(source).toContain("explicitTargets.every((target) => isSpecForgeReportsPathText(target) || isSpecForgeReportsOutputTarget(projectDir, target))");
    expect(source).toContain("result = await daemonClient.bashGuard(command, expectedFiles");
  });
});

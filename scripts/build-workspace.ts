import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bunExecutable = process.execPath;

const packageBuildOrder = [
  "types",
  "version-unification",
  "configuration",
  "service-management",
  "host-profile",
  "self-healing",
  "multimodal",
  "observability",
  "permission-engine",
  "opencode-adapter",
  "migration",
  "scope-gate",
  "workflow-runtime",
  "plugin-loader",
  "cli",
  "daemon-core",
];

function runPackageBuild(packageName: string): void {
  const cwd = path.join(rootDir, "packages", packageName);
  console.log(`\n[build-workspace] Building @specforge/${packageName}`);

  const packageJsonPath = path.join(cwd, "package.json");
  const packageJsonFile = Bun.file(packageJsonPath);
  if (!packageJsonFile.exists()) {
    throw new Error(`[build-workspace] Missing package.json for @specforge/${packageName}: ${packageJsonPath}`);
  }

  const result = Bun.spawnSync({
    cmd: [bunExecutable, "run", "build"],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  const exitCode = result.exitCode ?? 1;
  if (exitCode !== 0) {
    console.error(`[build-workspace] FAILED @specforge/${packageName} exitCode=${exitCode}`);
    process.exit(exitCode);
  }

  console.log(`[build-workspace] OK @specforge/${packageName}`);
}

console.log("[build-workspace] Deterministic workspace build start");
console.log(`[build-workspace] Bun executable: ${bunExecutable}`);

for (const packageName of packageBuildOrder) {
  runPackageBuild(packageName);
}

console.log("\n[build-workspace] Deterministic workspace build complete");

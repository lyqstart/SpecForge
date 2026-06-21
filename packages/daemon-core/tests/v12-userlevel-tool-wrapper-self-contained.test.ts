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

  it("sf_extension_subflow wrapper does not import repo source paths", () => {
    const text = read("setup/userlevel-opencode/tools/sf_extension_subflow.ts");
    expect(text).toContain("export default async function sf_extension_subflow");
    expect(text).not.toContain("packages/daemon-core");
    expect(text).not.toMatch(/from\s+["'][.][.]\//);
    expect(text).not.toMatch(/from\s+["'][.][/][.]\//);
  });
});
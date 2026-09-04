import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

import {
  resolveOpenCodeConfigRoot,
  resolveSpecForgeManifestPath,
  resolveSpecForgeUserPath,
  resolveSpecForgeUserRoot,
} from '@specforge/types/user-level-paths';
import {
  EnterprisePathResolver,
  PersonalPathResolver,
} from "../../src/daemon/path-resolver";
import { getGlobalStorePath } from "../../src/tools/lib/sf_knowledge_base_core";

const originalOpenCodeConfig = process.env.OPENCODE_CONFIG_DIR;
const originalXdg = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalOpenCodeConfig === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfig;
  }

  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
});

describe("user-level path boundary", () => {
  it("keeps OpenCode and current SpecForge user roots separate", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    const userRoot = path.join(os.homedir(), ".specforge");
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveOpenCodeConfigRoot()).toBe(configRoot);
    expect(resolveSpecForgeManifestPath()).toBe(
      path.join(userRoot, "specforge-manifest.json"),
    );
    expect(resolveSpecForgeUserRoot()).toBe(userRoot);
    expect(resolveSpecForgeUserPath("host-profile.json")).toBe(
      path.join(userRoot, "host-profile.json"),
    );
  });

  it("keeps the global knowledge store under the current SpecForge user root", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    expect(getGlobalStorePath()).toBe(
      path.join(os.homedir(), ".specforge", "knowledge", "insights.json"),
    );
  });

  it("keeps Personal project runtime inside the project", () => {
    const resolver = new PersonalPathResolver();
    const projectRoot = path.resolve("C:/tmp/project-a");

    expect(resolver.resolveProjectRuntimeDir(projectRoot)).toBe(
      path.join(projectRoot, ".specforge", "runtime"),
    );
  });

  it("moves Enterprise project runtime under the current SpecForge projects root", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    const resolver = new EnterprisePathResolver();
    const projectRoot = path.resolve("C:/tmp/project-b");
    const runtime = resolver.resolveProjectRuntimeDir(projectRoot);

    expect(runtime.startsWith(path.join(os.homedir(), ".specforge", "projects"))).toBe(true);
  });

  it("keeps daemon runtime and handshake under the current SpecForge user root", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    const resolver = new PersonalPathResolver();

    expect(resolver.resolveDaemonRuntimeDir()).toBe(
      path.join(os.homedir(), ".specforge", "runtime"),
    );
    expect(resolver.resolveHandshakePath()).toBe(
      path.join(os.homedir(), ".specforge", "runtime", "daemon.sock.json"),
    );
  });
});

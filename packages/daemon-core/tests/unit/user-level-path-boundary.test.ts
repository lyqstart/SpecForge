import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";

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
  it("keeps Manifest at OpenCode root and runtime data under sf-user", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveOpenCodeConfigRoot()).toBe(configRoot);
    expect(resolveSpecForgeManifestPath()).toBe(
      path.join(configRoot, "specforge-manifest.json"),
    );
    expect(resolveSpecForgeUserRoot()).toBe(
      path.join(configRoot, "sf-user"),
    );
    expect(resolveSpecForgeUserPath("host-profile.json")).toBe(
      path.join(configRoot, "sf-user", "host-profile.json"),
    );
  });

  it("keeps the global knowledge store under OpenCode sf-user/knowledge", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    expect(getGlobalStorePath()).toBe(
      path.join(configRoot, "sf-user", "knowledge", "insights.json"),
    );
  });

  it("keeps Personal project runtime inside the project", () => {
    const resolver = new PersonalPathResolver();
    const projectRoot = path.resolve("C:/tmp/project-a");

    expect(resolver.resolveProjectRuntimeDir(projectRoot)).toBe(
      path.join(projectRoot, ".specforge", "runtime"),
    );
  });

  it("moves Enterprise project runtime under OpenCode sf-user/projects", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    const resolver = new EnterprisePathResolver();
    const projectRoot = path.resolve("C:/tmp/project-b");
    const runtime = resolver.resolveProjectRuntimeDir(projectRoot);

    expect(runtime.startsWith(path.join(configRoot, "sf-user", "projects"))).toBe(true);
    expect(runtime.includes(`${path.sep}.specforge${path.sep}projects`)).toBe(false);
  });

  it("keeps daemon runtime and handshake under OpenCode sf-user/runtime", () => {
    const configRoot = path.resolve("C:/tmp/specforge-opencode-test");
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    const resolver = new PersonalPathResolver();

    expect(resolver.resolveDaemonRuntimeDir()).toBe(
      path.join(configRoot, "sf-user", "runtime"),
    );
    expect(resolver.resolveHandshakePath()).toBe(
      path.join(configRoot, "sf-user", "runtime", "handshake.json"),
    );
  });
});

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultPathResolver } from "../../src/utils/path-resolver.js";

describe("PathResolver current user root", () => {
  let resolver: DefaultPathResolver;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    resolver = new DefaultPathResolver();
    originalEnv = { ...process.env };
    delete process.env.OPENCODE_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves the default OpenCode sf-user root", () => {
    expect(resolver.resolveInstallRoot()).toBe(
      path.join(os.homedir(), ".config", "opencode", "sf-user")
    );
  });

  it("resolves OPENCODE_CONFIG_DIR/sf-user without HOME", () => {
    const configRoot = path.resolve("/tmp/opencode-config");
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    process.env.HOME = "";
    process.env.USERPROFILE = "";
    expect(resolver.resolveInstallRoot()).toBe(path.join(configRoot, "sf-user"));
  });

  it("resolves XDG_CONFIG_HOME/opencode/sf-user without HOME", () => {
    const xdgRoot = path.resolve("/tmp/xdg-config");
    process.env.XDG_CONFIG_HOME = xdgRoot;
    process.env.HOME = "";
    process.env.USERPROFILE = "";
    expect(resolver.resolveInstallRoot()).toBe(path.join(xdgRoot, "opencode", "sf-user"));
  });

  it("supports an explicit override", () => {
    expect(resolver.resolveInstallRoot("relative/path")).toBe(path.resolve("relative/path"));
  });

  it("reads USERPROFILE on Windows and reports a missing value", () => {
    resolver.platform = () => "win32";
    process.env.USERPROFILE = "C:\\Users\\TestUser";
    expect(resolver.resolveHomeDirectory()).toBe("C:\\Users\\TestUser");

    process.env.USERPROFILE = "";
    expect(() => resolver.resolveHomeDirectory()).toThrow(/USER_HOME_NOT_SET/);
  });

  it("reads HOME on POSIX and reports a missing value", () => {
    resolver.platform = () => "linux";
    process.env.HOME = "/home/testuser";
    expect(resolver.resolveHomeDirectory()).toBe("/home/testuser");

    process.env.HOME = "";
    expect(() => resolver.resolveHomeDirectory()).toThrow(/USER_HOME_NOT_SET/);
  });

  it("returns the supported platform and architecture enums", () => {
    expect(["win32", "darwin", "linux"]).toContain(resolver.platform());
    expect(["x64", "arm64"]).toContain(resolver.arch());
  });
});

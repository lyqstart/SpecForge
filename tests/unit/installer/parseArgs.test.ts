import { describe, it, expect } from "vitest"
import { parseArgs } from "../../../scripts/sf-installer"
import type { CLIOptions } from "../../../scripts/sf-installer"

describe("parseArgs", () => {
  describe("subcommand parsing", () => {
    it("should parse 'install' subcommand", () => {
      const opts = parseArgs(["install"])
      expect(opts.subcommand).toBe("install")
    })

    it("should parse 'upgrade' subcommand", () => {
      const opts = parseArgs(["upgrade"])
      expect(opts.subcommand).toBe("upgrade")
    })

    it("should parse 'uninstall' subcommand", () => {
      const opts = parseArgs(["uninstall"])
      expect(opts.subcommand).toBe("uninstall")
    })

    it("should parse 'verify' subcommand", () => {
      const opts = parseArgs(["verify"])
      expect(opts.subcommand).toBe("verify")
    })

    it("should set subcommand to null when no subcommand provided", () => {
      const opts = parseArgs([])
      expect(opts.subcommand).toBeNull()
    })

    it("should set subcommand to null when only options provided", () => {
      const opts = parseArgs(["--force", "--dry-run"])
      expect(opts.subcommand).toBeNull()
    })
  })

  describe("--target option", () => {
    it("should default target to process.cwd()", () => {
      const opts = parseArgs(["install"])
      expect(opts.target).toBe(process.cwd())
    })

    it("should parse --target with a path", () => {
      const opts = parseArgs(["install", "--target", "/tmp/myproject"])
      expect(opts.target).toContain("myproject")
    })

    it("should resolve relative --target paths", () => {
      const opts = parseArgs(["install", "--target", "./relative/path"])
      // Should be an absolute path after resolution
      expect(opts.target).toMatch(/^\/|^[A-Z]:\\/)
    })
  })

  describe("boolean flags", () => {
    it("should parse --force flag", () => {
      const opts = parseArgs(["install", "--force"])
      expect(opts.force).toBe(true)
    })

    it("should parse --purge flag", () => {
      const opts = parseArgs(["uninstall", "--purge"])
      expect(opts.purge).toBe(true)
    })

    it("should parse --dry-run flag", () => {
      const opts = parseArgs(["install", "--dry-run"])
      expect(opts.dryRun).toBe(true)
    })

    it("should parse --skip-deps flag", () => {
      const opts = parseArgs(["install", "--skip-deps"])
      expect(opts.skipDeps).toBe(true)
    })

    it("should parse --version flag", () => {
      const opts = parseArgs(["--version"])
      expect(opts.showVersion).toBe(true)
    })

    it("should default all boolean flags to false", () => {
      const opts = parseArgs(["install"])
      expect(opts.force).toBe(false)
      expect(opts.purge).toBe(false)
      expect(opts.dryRun).toBe(false)
      expect(opts.skipDeps).toBe(false)
      expect(opts.showVersion).toBe(false)
    })
  })

  describe("multiple options combined", () => {
    it("should parse --force --dry-run --skip-deps together", () => {
      const opts = parseArgs(["install", "--force", "--dry-run", "--skip-deps"])
      expect(opts.subcommand).toBe("install")
      expect(opts.force).toBe(true)
      expect(opts.dryRun).toBe(true)
      expect(opts.skipDeps).toBe(true)
    })

    it("should parse subcommand with --target and flags", () => {
      const opts = parseArgs(["upgrade", "--target", "/tmp/proj", "--force"])
      expect(opts.subcommand).toBe("upgrade")
      expect(opts.target).toContain("proj")
      expect(opts.force).toBe(true)
    })

    it("should parse --purge with uninstall and --dry-run", () => {
      const opts = parseArgs(["uninstall", "--purge", "--dry-run"])
      expect(opts.subcommand).toBe("uninstall")
      expect(opts.purge).toBe(true)
      expect(opts.dryRun).toBe(true)
    })
  })

  describe("argument order flexibility", () => {
    it("should parse flags before subcommand", () => {
      const opts = parseArgs(["--force", "install"])
      expect(opts.subcommand).toBe("install")
      expect(opts.force).toBe(true)
    })

    it("should parse --target before subcommand", () => {
      const opts = parseArgs(["--target", "/tmp/x", "install"])
      expect(opts.subcommand).toBe("install")
      expect(opts.target).toContain("x")
    })
  })
})

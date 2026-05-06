import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseArgs } from "../../../scripts/sf-installer"
import { InstallerError, InstallerErrorCode } from "../../../scripts/lib/errors"

describe("parseArgs — V3.5 简化版", () => {
  let mockExit: ReturnType<typeof vi.spyOn>
  let mockStderr: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as any)
    mockStderr = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    mockExit.mockRestore()
    mockStderr.mockRestore()
  })

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
      const opts = parseArgs(["--force"])
      expect(opts.subcommand).toBeNull()
    })
  })

  describe("boolean flags", () => {
    it("should parse --force flag", () => {
      const opts = parseArgs(["upgrade", "--force"])
      expect(opts.force).toBe(true)
    })

    it("should parse --version flag", () => {
      const opts = parseArgs(["--version"])
      expect(opts.showVersion).toBe(true)
    })

    it("should default all boolean flags to false", () => {
      const opts = parseArgs(["install"])
      expect(opts.force).toBe(false)
      expect(opts.showVersion).toBe(false)
    })
  })

  describe("已移除参数报错", () => {
    it("should exit with code 1 and output error for --target", () => {
      expect(() => parseArgs(["install", "--target", "/tmp"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("--target"))
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("已不再支持"))
    })

    it("should exit with code 1 and output error for --project-level", () => {
      expect(() => parseArgs(["install", "--project-level"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("--project-level"))
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("已不再支持"))
    })

    it("should exit with code 1 and output error for --runtime-only", () => {
      expect(() => parseArgs(["install", "--runtime-only"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("--runtime-only"))
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("已不再支持"))
    })

    it("should output hint about V3.5 changes for --target", () => {
      expect(() => parseArgs(["--target", "user"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("V3.5"))
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("用户级目录"))
    })

    it("should output hint about Plugin 自动初始化 for --project-level", () => {
      expect(() => parseArgs(["--project-level"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("Plugin 自动初始化"))
    })

    it("should output hint about Plugin 自动初始化 for --runtime-only", () => {
      expect(() => parseArgs(["--runtime-only"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("Plugin 自动初始化"))
    })
  })

  describe("未知参数报错", () => {
    it("should throw for unknown --flags", () => {
      expect(() => parseArgs(["install", "--unknown-flag"])).toThrow(InstallerError)
    })

    it("should throw with descriptive message for unknown flags", () => {
      try {
        parseArgs(["install", "--foo-bar"])
        expect.fail("should have thrown")
      } catch (e) {
        expect(e).toBeInstanceOf(InstallerError)
        expect((e as InstallerError).message).toContain("--foo-bar")
      }
    })
  })

  describe("argument order flexibility", () => {
    it("should parse flags before subcommand", () => {
      const opts = parseArgs(["--force", "install"])
      expect(opts.subcommand).toBe("install")
      expect(opts.force).toBe(true)
    })
  })
})

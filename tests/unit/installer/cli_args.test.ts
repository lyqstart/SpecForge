import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseArgs } from "../../../scripts/sf-installer"
import { InstallerError, InstallerErrorCode } from "../../../scripts/lib/errors"

describe("parseArgs — V3.5 已移除参数错误提示", () => {
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

  describe("--target 已移除", () => {
    it("should exit with code 1 for --target", () => {
      expect(() => parseArgs(["install", "--target", "/tmp"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it("should output error message with '已不再支持' and hint about 用户级目录", () => {
      expect(() => parseArgs(["install", "--target", "/tmp"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith("错误: 参数 --target 已不再支持。")
      expect(mockStderr).toHaveBeenCalledWith("V3.5 起所有组件统一部署到用户级目录。")
    })
  })

  describe("--project-level 已移除", () => {
    it("should exit with code 1 for --project-level", () => {
      expect(() => parseArgs(["install", "--project-level"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it("should output error message mentioning Plugin 自动初始化", () => {
      expect(() => parseArgs(["install", "--project-level"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith("错误: 参数 --project-level 已不再支持。")
      expect(mockStderr).toHaveBeenCalledWith("V3.5 起项目级运行时由 Plugin 自动初始化，无需手动操作。")
    })
  })

  describe("--runtime-only 已移除", () => {
    it("should exit with code 1 for --runtime-only", () => {
      expect(() => parseArgs(["install", "--runtime-only"])).toThrow()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it("should output error message mentioning Plugin 自动初始化", () => {
      expect(() => parseArgs(["install", "--runtime-only"])).toThrow()
      expect(mockStderr).toHaveBeenCalledWith("错误: 参数 --runtime-only 已不再支持。")
      expect(mockStderr).toHaveBeenCalledWith("V3.5 起项目级运行时由 Plugin 自动初始化，无需手动操作。")
    })
  })

  describe("未知参数报错", () => {
    it("should throw for unknown --flags", () => {
      expect(() => parseArgs(["install", "--unknown-flag"])).toThrow(InstallerError)
    })

    it("should throw for --global (not supported)", () => {
      expect(() => parseArgs(["install", "--global"])).toThrow(InstallerError)
    })

    it("should throw for --verbose (not a known flag)", () => {
      expect(() => parseArgs(["install", "--verbose"])).toThrow(InstallerError)
    })
  })

  describe("valid flags still work", () => {
    it("should parse --version", () => {
      const opts = parseArgs(["--version"])
      expect(opts.showVersion).toBe(true)
    })

    it("should parse --force with upgrade", () => {
      const opts = parseArgs(["upgrade", "--force"])
      expect(opts.subcommand).toBe("upgrade")
      expect(opts.force).toBe(true)
    })

    it("should parse verify subcommand", () => {
      const opts = parseArgs(["verify"])
      expect(opts.subcommand).toBe("verify")
    })

    it("should parse uninstall subcommand", () => {
      const opts = parseArgs(["uninstall"])
      expect(opts.subcommand).toBe("uninstall")
    })
  })
})

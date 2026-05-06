import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  resolveUserLevelDirectory,
  posixToNative,
  nativeToPosix,
  normalizeLongPathForWindows,
} from "../../../scripts/lib/paths"
import * as path from "node:path"
import * as os from "node:os"

describe("paths module", () => {
  describe("resolveUserLevelDirectory", () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
      vi.restoreAllMocks()
    })

    it("should use OPENCODE_CONFIG_DIR when set", () => {
      process.env.OPENCODE_CONFIG_DIR = "/custom/opencode/dir"
      const result = resolveUserLevelDirectory()
      expect(result).toBe(path.resolve(path.normalize("/custom/opencode/dir")))
    })

    it("should use OPENCODE_CONFIG_DIR with relative path", () => {
      process.env.OPENCODE_CONFIG_DIR = "./relative/path"
      const result = resolveUserLevelDirectory()
      expect(result).toBe(path.resolve(path.normalize("./relative/path")))
    })

    it("should use ~/.config/opencode/ on all platforms when OPENCODE_CONFIG_DIR is not set", () => {
      delete process.env.OPENCODE_CONFIG_DIR
      const result = resolveUserLevelDirectory()

      // All platforms (including Windows) use ~/.config/opencode/
      // This matches OpenCode's actual behavior
      expect(result).toBe(
        path.resolve(
          path.normalize(path.join(os.homedir(), ".config", "opencode"))
        )
      )
    })

    it("should return an absolute path", () => {
      delete process.env.OPENCODE_CONFIG_DIR
      const result = resolveUserLevelDirectory()
      expect(path.isAbsolute(result)).toBe(true)
    })
  })

  describe("posixToNative", () => {
    it("should convert forward slashes to backslashes on Windows", () => {
      // This test verifies the logic; actual behavior depends on platform
      const input = "agents/sf-orchestrator.md"
      const result = posixToNative(input)

      if (process.platform === "win32") {
        expect(result).toBe("agents\\sf-orchestrator.md")
      } else {
        expect(result).toBe("agents/sf-orchestrator.md")
      }
    })

    it("should handle nested paths", () => {
      const input = "tools/lib/sf_state_read_core.ts"
      const result = posixToNative(input)

      if (process.platform === "win32") {
        expect(result).toBe("tools\\lib\\sf_state_read_core.ts")
      } else {
        expect(result).toBe("tools/lib/sf_state_read_core.ts")
      }
    })

    it("should handle paths without separators", () => {
      expect(posixToNative("file.txt")).toBe("file.txt")
    })
  })

  describe("nativeToPosix", () => {
    it("should convert backslashes to forward slashes", () => {
      expect(nativeToPosix("agents\\sf-orchestrator.md")).toBe(
        "agents/sf-orchestrator.md"
      )
    })

    it("should handle nested paths with backslashes", () => {
      expect(nativeToPosix("tools\\lib\\sf_state_read_core.ts")).toBe(
        "tools/lib/sf_state_read_core.ts"
      )
    })

    it("should leave forward slashes unchanged", () => {
      expect(nativeToPosix("agents/sf-orchestrator.md")).toBe(
        "agents/sf-orchestrator.md"
      )
    })

    it("should handle paths without separators", () => {
      expect(nativeToPosix("file.txt")).toBe("file.txt")
    })
  })

  describe("normalizeLongPathForWindows", () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, "platform", { value: originalPlatform })
    })

    it("should return path unchanged on non-Windows platforms", () => {
      Object.defineProperty(process, "platform", { value: "linux" })
      const longPath = "a".repeat(300)
      expect(normalizeLongPathForWindows(longPath)).toBe(longPath)
    })

    it("should return path unchanged on Windows when <= 260 chars", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      const shortPath = "C:\\Users\\test\\file.txt"
      expect(normalizeLongPathForWindows(shortPath)).toBe(shortPath)
    })

    it("should add \\\\?\\ prefix on Windows when > 260 chars", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      const longPath = "C:\\Users\\test\\" + "a".repeat(260)
      expect(normalizeLongPathForWindows(longPath)).toBe("\\\\?\\" + longPath)
    })

    it("should not add prefix if already present", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      const longPath = "\\\\?\\" + "C:\\Users\\test\\" + "a".repeat(260)
      expect(normalizeLongPathForWindows(longPath)).toBe(longPath)
    })

    it("should handle UNC paths on Windows when > 260 chars", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      const uncPath = "\\\\server\\share\\" + "a".repeat(260)
      expect(normalizeLongPathForWindows(uncPath)).toBe(
        "\\\\?\\UNC\\server\\share\\" + "a".repeat(260)
      )
    })

    it("should not modify UNC paths that are <= 260 chars", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      const uncPath = "\\\\server\\share\\file.txt"
      expect(normalizeLongPathForWindows(uncPath)).toBe(uncPath)
    })
  })
})

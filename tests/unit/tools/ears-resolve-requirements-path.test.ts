/**
 * Unit tests for resolveRequirementsPath function
 * Validates: Requirements 10.2, 10.3
 */

import { describe, it, expect } from "vitest"
import * as path from "node:path"
import { resolveRequirementsPath } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("resolveRequirementsPath", () => {
  const specDir = path.resolve("/project/specs/my-spec")

  describe("拒绝绝对路径", () => {
    it("should reject Unix absolute path starting with /", () => {
      const result = resolveRequirementsPath("/etc/passwd", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Absolute path not allowed: /etc/passwd")
      }
    })

    it("should reject Windows absolute path starting with C:\\", () => {
      const result = resolveRequirementsPath("C:\\Windows\\system32", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Absolute path not allowed: C:\\Windows\\system32")
      }
    })

    it("should reject Windows absolute path starting with D:/", () => {
      const result = resolveRequirementsPath("D:/some/path", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Absolute path not allowed: D:/some/path")
      }
    })

    it("should reject lowercase drive letter (e.g., c:\\)", () => {
      const result = resolveRequirementsPath("c:\\Users\\test", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Absolute path not allowed: c:\\Users\\test")
      }
    })
  })

  describe("拒绝路径遍历", () => {
    it("should reject path containing .. at the start", () => {
      const result = resolveRequirementsPath("../secret.md", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Path traversal not allowed: ../secret.md")
      }
    })

    it("should reject path containing .. in the middle", () => {
      const result = resolveRequirementsPath("sub/../../../etc/passwd", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Path traversal not allowed: sub/../../../etc/passwd")
      }
    })

    it("should reject path containing .. with backslash separators", () => {
      const result = resolveRequirementsPath("sub\\..\\..\\secret.md", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Path traversal not allowed: sub\\..\\..\\secret.md")
      }
    })

    it("should reject path that is just '..'", () => {
      const result = resolveRequirementsPath("..", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("Path traversal not allowed: ..")
      }
    })
  })

  describe("合法路径解析", () => {
    it("should accept simple filename", () => {
      const result = resolveRequirementsPath("requirements.md", specDir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.resolvedPath).toBe(path.resolve(specDir, "requirements.md"))
      }
    })

    it("should accept relative path within spec directory", () => {
      const result = resolveRequirementsPath("sub/requirements.md", specDir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.resolvedPath).toBe(path.resolve(specDir, "sub/requirements.md"))
      }
    })

    it("should accept path with current directory reference (.)", () => {
      const result = resolveRequirementsPath("./requirements.md", specDir)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.resolvedPath).toBe(path.resolve(specDir, "./requirements.md"))
      }
    })
  })

  describe("错误消息安全性", () => {
    it("should not expose absolute path in error messages for absolute path rejection", () => {
      const result = resolveRequirementsPath("/etc/passwd", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // Error message should only contain the relative path, not the specDir
        expect(result.error).not.toContain(specDir)
      }
    })

    it("should not expose absolute path in error messages for traversal rejection", () => {
      const result = resolveRequirementsPath("../secret.md", specDir)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).not.toContain(specDir)
      }
    })
  })
})

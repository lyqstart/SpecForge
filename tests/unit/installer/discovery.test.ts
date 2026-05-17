/**
 * Discovery Module — Boundary Case Unit Tests
 *
 * Tests edge cases and error conditions for the Discovery Module:
 * - Empty source directory (after excluding .gitkeep) → SOURCE_DIR_EMPTY error
 * - Non-existent source directory → SOURCE_DIR_NOT_FOUND error
 * - Unreadable source directory (permission error) → SOURCE_DIR_NOT_READABLE error
 * - Skills directory nested structure (only deploys SKILL.md)
 * - Mixed path separators on Windows (output always POSIX)
 *
 * Requirements: 1.7, 1.6
 */

import { describe, it, expect, afterEach } from "vitest"
import { join } from "node:path"
import { mkdir, writeFile, chmod } from "node:fs/promises"
import { createTempDir, cleanupTempDir } from "../../helpers/fixtures"
import { buildDesiredState } from "../../../scripts/lib/discovery"

// ============================================================
// Helpers
// ============================================================

/** Track temp dirs for cleanup */
const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    // Restore permissions before cleanup (in case chmod was used)
    try {
      await chmod(dir, 0o755)
    } catch {
      // ignore
    }
    await cleanupTempDir(dir)
  }
  tempDirs.length = 0
})

// ============================================================
// Tests
// ============================================================

describe("Discovery Module — Boundary Cases", () => {
  describe("SOURCE_DIR_EMPTY error (Requirement 1.7)", () => {
    it("should return SOURCE_DIR_EMPTY when source directory is completely empty", async () => {
      const sourceDir = await createTempDir("discovery-empty-")
      tempDirs.push(sourceDir)

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("SOURCE_DIR_EMPTY")
        expect(result.error.path).toBe(sourceDir)
      }
    })

    it("should return SOURCE_DIR_EMPTY when source directory only contains .gitkeep files", async () => {
      const sourceDir = await createTempDir("discovery-gitkeep-")
      tempDirs.push(sourceDir)

      // Create directories with only .gitkeep files
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await mkdir(join(sourceDir, "tools", "lib"), { recursive: true })
      await mkdir(join(sourceDir, "plugins"), { recursive: true })
      await mkdir(join(sourceDir, "skills"), { recursive: true })

      await writeFile(join(sourceDir, "agents", ".gitkeep"), "", "utf-8")
      await writeFile(join(sourceDir, "tools", ".gitkeep"), "", "utf-8")
      await writeFile(join(sourceDir, "tools", "lib", ".gitkeep"), "", "utf-8")
      await writeFile(join(sourceDir, "plugins", ".gitkeep"), "", "utf-8")
      await writeFile(join(sourceDir, "skills", ".gitkeep"), "", "utf-8")

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("SOURCE_DIR_EMPTY")
        expect(result.error.path).toBe(sourceDir)
      }
    })

    it("should return SOURCE_DIR_EMPTY when source directory only contains excluded files", async () => {
      const sourceDir = await createTempDir("discovery-excluded-")
      tempDirs.push(sourceDir)

      // Create package.json and package-lock.json (excluded by discovery)
      await writeFile(
        join(sourceDir, "package.json"),
        JSON.stringify({ name: "test" }),
        "utf-8"
      )
      await writeFile(
        join(sourceDir, "package-lock.json"),
        JSON.stringify({}),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("SOURCE_DIR_EMPTY")
      }
    })
  })

  describe("SOURCE_DIR_NOT_FOUND error (Requirement 1.7)", () => {
    it("should return SOURCE_DIR_NOT_FOUND when source directory does not exist", async () => {
      const sourceDir = join(
        await createTempDir("discovery-notfound-"),
        "nonexistent"
      )
      // Track the parent for cleanup
      tempDirs.push(join(sourceDir, ".."))

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("SOURCE_DIR_NOT_FOUND")
        expect(result.error.path).toBe(sourceDir)
      }
    })

    it("should return SOURCE_DIR_NOT_FOUND when path points to a file instead of directory", async () => {
      const parentDir = await createTempDir("discovery-file-")
      tempDirs.push(parentDir)

      const filePath = join(parentDir, "not-a-directory")
      await writeFile(filePath, "I am a file", "utf-8")

      const result = await buildDesiredState({ sourceDir: filePath })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("SOURCE_DIR_NOT_FOUND")
        expect(result.error.path).toBe(filePath)
      }
    })
  })

  describe("SOURCE_DIR_NOT_READABLE error (Requirement 1.7)", () => {
    // Permission tests only work reliably on Unix-like systems
    const isUnix = process.platform !== "win32"

    it.skipIf(!isUnix)(
      "should return SOURCE_DIR_NOT_READABLE when source directory has no read permission",
      async () => {
        const sourceDir = await createTempDir("discovery-noperm-")
        tempDirs.push(sourceDir)

        // Create a file so the directory isn't empty
        await mkdir(join(sourceDir, "agents"), { recursive: true })
        await writeFile(
          join(sourceDir, "agents", "sf-test.md"),
          "content",
          "utf-8"
        )

        // Remove read permission
        await chmod(sourceDir, 0o000)

        const result = await buildDesiredState({ sourceDir })

        // Restore permissions for cleanup
        await chmod(sourceDir, 0o755)

        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error.code).toBe("SOURCE_DIR_NOT_READABLE")
          expect(result.error.path).toBe(sourceDir)
          expect((result.error as { cause: Error }).cause).toBeInstanceOf(Error)
        }
      }
    )
  })

  describe("Skills directory nested structure (Requirement 1.1)", () => {
    it("should only deploy SKILL.md from skill directories, ignoring other files", async () => {
      const sourceDir = await createTempDir("discovery-skills-")
      tempDirs.push(sourceDir)

      // Create a skill directory with SKILL.md and other files
      const skillDir = join(sourceDir, "skills", "sf-my-skill")
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, "SKILL.md"), "# My Skill", "utf-8")
      await writeFile(join(skillDir, "README.md"), "# Readme", "utf-8")
      await writeFile(join(skillDir, "helper.ts"), "export {}", "utf-8")
      await writeFile(join(skillDir, "config.json"), "{}", "utf-8")

      // Create parent package.json for version reading
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state

      // Only SKILL.md should be discovered
      expect(entries.size).toBe(1)
      const skillEntry = entries.get("skills/sf-my-skill/SKILL.md")
      expect(skillEntry).toBeDefined()
      expect(skillEntry!.componentType).toBe("skill")
      expect(skillEntry!.relativePath).toBe("skills/sf-my-skill/SKILL.md")

      // Other files should NOT be in results
      expect(entries.has("skills/sf-my-skill/README.md")).toBe(false)
      expect(entries.has("skills/sf-my-skill/helper.ts")).toBe(false)
      expect(entries.has("skills/sf-my-skill/config.json")).toBe(false)
    })

    it("should discover SKILL.md from multiple skill directories", async () => {
      const sourceDir = await createTempDir("discovery-multi-skills-")
      tempDirs.push(sourceDir)

      // Create multiple skill directories
      const skills = ["sf-workflow-a", "sf-workflow-b", "superpowers-c"]
      for (const skill of skills) {
        const skillDir = join(sourceDir, "skills", skill)
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), `# ${skill}`, "utf-8")
      }

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state
      expect(entries.size).toBe(3)

      for (const skill of skills) {
        const entry = entries.get(`skills/${skill}/SKILL.md`)
        expect(entry).toBeDefined()
        expect(entry!.componentType).toBe("skill")
      }
    })

    it("should skip skill directories that do not contain SKILL.md", async () => {
      const sourceDir = await createTempDir("discovery-no-skillmd-")
      tempDirs.push(sourceDir)

      // Create a skill directory WITHOUT SKILL.md
      const skillDir = join(sourceDir, "skills", "sf-incomplete")
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, "README.md"), "# Incomplete", "utf-8")

      // Create a valid skill directory WITH SKILL.md
      const validSkillDir = join(sourceDir, "skills", "sf-valid")
      await mkdir(validSkillDir, { recursive: true })
      await writeFile(join(validSkillDir, "SKILL.md"), "# Valid", "utf-8")

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state
      expect(entries.size).toBe(1)
      expect(entries.has("skills/sf-valid/SKILL.md")).toBe(true)
      expect(entries.has("skills/sf-incomplete/README.md")).toBe(false)
    })

    it("should ignore .gitkeep in skills directory", async () => {
      const sourceDir = await createTempDir("discovery-skills-gitkeep-")
      tempDirs.push(sourceDir)

      // Create skills directory with .gitkeep and a valid skill
      await mkdir(join(sourceDir, "skills"), { recursive: true })
      await writeFile(join(sourceDir, "skills", ".gitkeep"), "", "utf-8")

      const skillDir = join(sourceDir, "skills", "sf-test")
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, "SKILL.md"), "# Test", "utf-8")

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state
      expect(entries.size).toBe(1)
      expect(entries.has("skills/sf-test/SKILL.md")).toBe(true)
      // .gitkeep should not appear
      expect(entries.has("skills/.gitkeep")).toBe(false)
    })
  })

  describe("Path output always POSIX (Requirement 1.6)", () => {
    it("should output paths with forward slashes regardless of OS", async () => {
      const sourceDir = await createTempDir("discovery-posix-")
      tempDirs.push(sourceDir)

      // Create files in nested directories
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await mkdir(join(sourceDir, "tools", "lib"), { recursive: true })
      await mkdir(join(sourceDir, "skills", "sf-test"), { recursive: true })

      await writeFile(
        join(sourceDir, "agents", "sf-orchestrator.md"),
        "# Agent",
        "utf-8"
      )
      await writeFile(
        join(sourceDir, "tools", "lib", "sf_core.ts"),
        "export {}",
        "utf-8"
      )
      await writeFile(
        join(sourceDir, "skills", "sf-test", "SKILL.md"),
        "# Skill",
        "utf-8"
      )

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state

      // All paths should use forward slashes (POSIX format)
      for (const [key, entry] of entries) {
        expect(key).not.toContain("\\")
        expect(entry.relativePath).not.toContain("\\")
        expect(entry.relativePath).toBe(key)
      }

      // Verify specific expected paths
      expect(entries.has("agents/sf-orchestrator.md")).toBe(true)
      expect(entries.has("tools/lib/sf_core.ts")).toBe(true)
      expect(entries.has("skills/sf-test/SKILL.md")).toBe(true)
    })

    it("should handle source directory path with mixed separators on Windows", async () => {
      const sourceDir = await createTempDir("discovery-mixedpath-")
      tempDirs.push(sourceDir)

      // Create a deployable file
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(
        join(sourceDir, "agents", "sf-test.md"),
        "# Test",
        "utf-8"
      )

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      // On Windows, the sourceDir will naturally contain backslashes.
      // The discovery module should still produce POSIX paths in output.
      // On Unix, this test verifies that forward slashes work fine.
      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state

      // Output paths must always be POSIX regardless of input path format
      for (const [key, entry] of entries) {
        expect(key).not.toContain("\\")
        expect(entry.relativePath).not.toContain("\\")
      }

      expect(entries.has("agents/sf-test.md")).toBe(true)
    })

    it("should produce consistent POSIX paths for tools/lib nested structure", async () => {
      const sourceDir = await createTempDir("discovery-nested-posix-")
      tempDirs.push(sourceDir)

      // Create tools/lib structure (two levels deep)
      await mkdir(join(sourceDir, "tools", "lib"), { recursive: true })
      await writeFile(
        join(sourceDir, "tools", "sf_tool.ts"),
        "export {}",
        "utf-8"
      )
      await writeFile(
        join(sourceDir, "tools", "lib", "sf_helper.ts"),
        "export {}",
        "utf-8"
      )

      // Create parent package.json
      await writeFile(
        join(sourceDir, "..", "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      )

      const result = await buildDesiredState({ sourceDir })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const { entries } = result.state

      // Verify nested path uses forward slashes
      expect(entries.has("tools/sf_tool.ts")).toBe(true)
      expect(entries.has("tools/lib/sf_helper.ts")).toBe(true)

      const toolEntry = entries.get("tools/sf_tool.ts")
      expect(toolEntry!.componentType).toBe("tool")

      const libEntry = entries.get("tools/lib/sf_helper.ts")
      expect(libEntry!.componentType).toBe("tool_lib")
    })
  })
})

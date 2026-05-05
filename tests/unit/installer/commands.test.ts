import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  deployFile,
  removeFile,
  readManifest,
  writeManifest,
  getSourceVersion,
} from "../../../scripts/sf-installer"
import type { ManifestFile, CLIOptions } from "../../../scripts/sf-installer"
import * as fs from "fs"
import * as path from "path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

describe("command guards and error handling", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-test-cmd-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-test-src-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  describe("install guard — already installed", () => {
    it("should detect existing manifest (install would abort)", () => {
      // Write a manifest to simulate already-installed state
      const manifest: ManifestFile = {
        version: "1.0.0",
        installed_at: new Date().toISOString(),
        source_dir: sourceDir,
        files: {},
      }
      writeManifest(targetDir, manifest)

      // readManifest should return the existing manifest
      const existing = readManifest(targetDir)
      expect(existing).not.toBeNull()
      expect(existing!.version).toBe("1.0.0")
    })
  })

  describe("upgrade/uninstall guard — not installed", () => {
    it("should return null manifest when not installed (upgrade would abort)", () => {
      const manifest = readManifest(targetDir)
      expect(manifest).toBeNull()
    })

    it("should return null manifest when not installed (uninstall would abort)", () => {
      const manifest = readManifest(targetDir)
      expect(manifest).toBeNull()
    })
  })

  describe("upgrade guard — same version", () => {
    it("should detect same version via getSourceVersion", () => {
      // Write source package.json with version 1.0.0
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ version: "1.0.0" })
      )

      // Write manifest with same version
      const manifest: ManifestFile = {
        version: "1.0.0",
        installed_at: new Date().toISOString(),
        source_dir: sourceDir,
        files: {},
      }
      writeManifest(targetDir, manifest)

      const sourceVersion = getSourceVersion(sourceDir)
      const existing = readManifest(targetDir)
      expect(sourceVersion).toBe(existing!.version)
    })

    it("should detect different version for upgrade", () => {
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ version: "2.0.0" })
      )

      const manifest: ManifestFile = {
        version: "1.0.0",
        installed_at: new Date().toISOString(),
        source_dir: sourceDir,
        files: {},
      }
      writeManifest(targetDir, manifest)

      const sourceVersion = getSourceVersion(sourceDir)
      const existing = readManifest(targetDir)
      expect(sourceVersion).not.toBe(existing!.version)
    })
  })

  describe("dry-run — no file operations", () => {
    it("deployFile with dryRun=true should not create file", () => {
      // Create source file
      const relPath = "test-file.txt"
      fs.writeFileSync(path.join(sourceDir, relPath), "content")

      const op = deployFile(sourceDir, targetDir, relPath, true)
      expect(op.type).toBe("创建")
      // File should NOT exist in target
      expect(fs.existsSync(path.join(targetDir, relPath))).toBe(false)
    })

    it("removeFile with dryRun=true should not delete file", () => {
      // Create file in target
      const relPath = "existing.txt"
      fs.writeFileSync(path.join(targetDir, relPath), "content")

      const op = removeFile(targetDir, relPath, true)
      expect(op.type).toBe("删除")
      // File should still exist
      expect(fs.existsSync(path.join(targetDir, relPath))).toBe(true)
    })
  })

  describe("source file missing — skip and continue", () => {
    it("deployFile should skip when source file does not exist", () => {
      const op = deployFile(sourceDir, targetDir, "nonexistent.txt", false)
      expect(op.type).toBe("跳过")
      expect(op.reason).toContain("源文件不存在")
    })
  })

  describe("deployFile — create and update", () => {
    it("should create file when target does not exist", () => {
      const relPath = "new-file.txt"
      fs.writeFileSync(path.join(sourceDir, relPath), "hello")

      const op = deployFile(sourceDir, targetDir, relPath, false)
      expect(op.type).toBe("创建")
      expect(fs.readFileSync(path.join(targetDir, relPath), "utf-8")).toBe(
        "hello"
      )
    })

    it("should update file when target already exists", () => {
      const relPath = "existing.txt"
      fs.writeFileSync(path.join(sourceDir, relPath), "new content")
      fs.writeFileSync(path.join(targetDir, relPath), "old content")

      const op = deployFile(sourceDir, targetDir, relPath, false)
      expect(op.type).toBe("更新")
      expect(fs.readFileSync(path.join(targetDir, relPath), "utf-8")).toBe(
        "new content"
      )
    })

    it("should create nested directories as needed", () => {
      const relPath = "deep/nested/dir/file.txt"
      const srcDir = path.dirname(path.join(sourceDir, relPath))
      fs.mkdirSync(srcDir, { recursive: true })
      fs.writeFileSync(path.join(sourceDir, relPath), "deep content")

      const op = deployFile(sourceDir, targetDir, relPath, false)
      expect(op.type).toBe("创建")
      expect(
        fs.readFileSync(path.join(targetDir, relPath), "utf-8")
      ).toBe("deep content")
    })
  })

  describe("removeFile — delete and skip", () => {
    it("should delete existing file", () => {
      const relPath = "to-delete.txt"
      fs.writeFileSync(path.join(targetDir, relPath), "content")

      const op = removeFile(targetDir, relPath, false)
      expect(op.type).toBe("删除")
      expect(fs.existsSync(path.join(targetDir, relPath))).toBe(false)
    })

    it("should skip when file does not exist", () => {
      const op = removeFile(targetDir, "nonexistent.txt", false)
      expect(op.type).toBe("跳过")
      expect(op.reason).toContain("文件不存在")
    })
  })

  describe("getSourceVersion", () => {
    it("should return version from package.json", () => {
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ version: "3.2.1" })
      )
      expect(getSourceVersion(sourceDir)).toBe("3.2.1")
    })

    it("should return 0.0.0 when package.json does not exist", () => {
      expect(getSourceVersion(sourceDir)).toBe("0.0.0")
    })

    it("should return 0.0.0 when version field is missing", () => {
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ name: "test" })
      )
      expect(getSourceVersion(sourceDir)).toBe("0.0.0")
    })
  })
})

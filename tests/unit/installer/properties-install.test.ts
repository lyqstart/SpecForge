import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { mkdtemp, rm } from "node:fs/promises"
import * as fs from "fs"
import * as path from "path"
import { tmpdir } from "node:os"

import {
  deployFile,
  removeFile,
  mergeOpenCodeJson,
  writeManifest,
  FILE_REGISTRY,
  RUNTIME_DIRS,
} from "../../../scripts/sf-installer"
import type { ManifestFile } from "../../../scripts/sf-installer"

// ============================================================================
// Generators
// ============================================================================

/** Alphanumeric string safe for filenames and JSON keys */
const arbSafeString = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,14}$/)

/** Generate a random sf-prefixed agent name */
const arbSfAgentName = fc.constantFrom(
  "sf-orchestrator", "sf-design", "sf-executor", "sf-reviewer",
  "sf-debugger", "sf-requirements", "sf-task-planner", "sf-verifier"
)

/** Generate a random non-sf agent name */
const arbNonSfAgentName = arbSafeString.filter(
  (s) => !s.startsWith("sf-") && !s.startsWith("sf_") && s !== "__proto__" && s !== "constructor"
)

/** Generate a random file content string */
const arbFileContent = fc.string({ minLength: 1, maxLength: 200 })

/** Generate a simple safe filename */
const arbSafeFilename = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,9}$/)

// ============================================================================
// Property Tests
// ============================================================================

describe("Property Tests — Install/Uninstall", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-prop-inst-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-prop-inst-src-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  /**
   * Property 1: install deploys all files
   * For any subset of registry files in source, all get deployed to target.
   *
   * **Validates: Requirements 2.1**
   */
  it("Property 1: install deploys all source files to target", () => {
    fc.assert(
      fc.property(
        fc.array(arbSafeFilename, { minLength: 1, maxLength: 5 }),
        fc.array(arbFileContent, { minLength: 1, maxLength: 5 }),
        (filenames, contents) => {
          // Deduplicate filenames
          const unique = [...new Set(filenames)]
          if (unique.length === 0) return

          // Create source files (simulate a registry subset)
          const registry: string[] = []
          for (let i = 0; i < unique.length; i++) {
            const relPath = `deploy/${unique[i]}.txt`
            const sourcePath = path.join(sourceDir, relPath)
            const dir = path.dirname(sourcePath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(sourcePath, contents[i % contents.length])
            registry.push(relPath)
          }

          // Deploy all files (simulating install)
          for (const relPath of registry) {
            deployFile(sourceDir, targetDir, relPath, false)
          }

          // Verify: every file in registry exists in target
          for (const relPath of registry) {
            const targetPath = path.join(targetDir, relPath)
            expect(fs.existsSync(targetPath)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 8: runtime data immutability
   * install/uninstall don't modify runtime data files.
   *
   * **Validates: Requirements 5.4, 6.5**
   */
  it("Property 8: install/uninstall preserves runtime data", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dir: fc.constantFrom(...RUNTIME_DIRS),
            filename: arbSafeFilename,
            content: arbFileContent,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (runtimeFiles) => {
          // Create runtime data files
          const fileStates: Array<{ path: string; content: string }> = []

          for (const rf of runtimeFiles) {
            const relPath = `${rf.dir}/${rf.filename}.json`
            const fullPath = path.join(targetDir, relPath)
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, rf.content)
            fileStates.push({ path: relPath, content: rf.content })
          }

          // Simulate install: deploy some SF files (not touching runtime dirs)
          const sfFile = "test-sf-file.txt"
          const sfSourcePath = path.join(sourceDir, sfFile)
          fs.writeFileSync(sfSourcePath, "sf content")
          deployFile(sourceDir, targetDir, sfFile, false)

          // Simulate uninstall: remove the SF file
          removeFile(targetDir, sfFile, false)

          // Verify: all runtime data files unchanged
          for (const state of fileStates) {
            const fullPath = path.join(targetDir, state.path)
            expect(fs.existsSync(fullPath)).toBe(true)
            expect(fs.readFileSync(fullPath, "utf-8")).toBe(state.content)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10: uninstall removes all manifest files
   * For any manifest file list, uninstall removes them all.
   *
   * **Validates: Requirements 6.1**
   */
  it("Property 10: uninstall removes all files listed in manifest", () => {
    fc.assert(
      fc.property(
        fc.array(arbSafeFilename, { minLength: 1, maxLength: 5 }),
        fc.array(arbFileContent, { minLength: 1, maxLength: 5 }),
        (filenames, contents) => {
          // Deduplicate
          const unique = [...new Set(filenames)]
          if (unique.length === 0) return

          // Create files in target and build manifest
          const manifestFiles: Record<string, string> = {}
          for (let i = 0; i < unique.length; i++) {
            const relPath = `uninstall-test/${unique[i]}.txt`
            const fullPath = path.join(targetDir, relPath)
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, contents[i % contents.length])
            manifestFiles[relPath] = "fakehash"
          }

          // Simulate uninstall: remove all manifest files
          for (const relPath of Object.keys(manifestFiles)) {
            removeFile(targetDir, relPath, false)
          }

          // Verify: none of the manifest files exist
          for (const relPath of Object.keys(manifestFiles)) {
            const fullPath = path.join(targetDir, relPath)
            expect(fs.existsSync(fullPath)).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11: uninstall config cleanup
   * Removes sf-* from opencode.json, preserves non-sf-*.
   *
   * **Validates: Requirements 6.2, 6.3**
   */
  it("Property 11: uninstall removes sf-* agents and preserves non-sf-* agents", () => {
    fc.assert(
      fc.property(
        fc.array(arbSfAgentName, { minLength: 1, maxLength: 4 }),
        fc.array(
          fc.tuple(arbNonSfAgentName, arbSafeString),
          { minLength: 1, maxLength: 4 }
        ),
        (sfAgents, nonSfAgentPairs) => {
          // Build opencode.json with both sf-* and non-sf-* agents
          const config: any = { agent: {} }
          for (const name of sfAgents) {
            config.agent[name] = `.opencode/agents/${name}.md`
          }
          const nonSfAgents: Record<string, string> = {}
          for (const [name, value] of nonSfAgentPairs) {
            config.agent[name] = value
            nonSfAgents[name] = value
          }
          if (Object.keys(nonSfAgents).length === 0) return

          fs.writeFileSync(
            path.join(targetDir, "opencode.json"),
            JSON.stringify(config, null, 2)
          )

          // Also need a source opencode.json for the remove function
          fs.writeFileSync(
            path.join(sourceDir, "opencode.json"),
            JSON.stringify({ agent: {} }, null, 2)
          )

          // Perform remove
          mergeOpenCodeJson(targetDir, sourceDir, "remove")

          // Read result
          const result = JSON.parse(
            fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
          )

          // Verify: no sf-* agents remain
          for (const name of Object.keys(result.agent || {})) {
            expect(name.startsWith("sf-")).toBe(false)
          }

          // Verify: all non-sf-* agents preserved
          for (const [name, value] of Object.entries(nonSfAgents)) {
            expect(result.agent[name]).toBe(value)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 12: uninstall doesn't delete user files
   * Files not in manifest remain untouched after uninstall.
   *
   * **Validates: Requirements 7.2**
   */
  it("Property 12: uninstall preserves files not in manifest", () => {
    let iterCount = 0
    fc.assert(
      fc.property(
        fc.array(arbSafeFilename, { minLength: 1, maxLength: 3 }),
        fc.array(arbSafeFilename, { minLength: 1, maxLength: 3 }),
        fc.array(arbFileContent, { minLength: 1, maxLength: 6 }),
        (manifestNames, userNames, contents) => {
          iterCount++
          // Deduplicate and ensure no overlap
          const uniqueManifest = [...new Set(manifestNames)]
          const uniqueUser = [...new Set(userNames)].filter(
            (n) => !uniqueManifest.includes(n)
          )
          if (uniqueManifest.length === 0 || uniqueUser.length === 0) return

          // Use unique subdirectory per iteration to avoid cross-contamination
          const iterDir = path.join(targetDir, `iter-${iterCount}`)
          fs.mkdirSync(iterDir, { recursive: true })

          // Create manifest files in target
          const manifestFiles: Record<string, string> = {}
          for (let i = 0; i < uniqueManifest.length; i++) {
            const relPath = `project/${uniqueManifest[i]}.txt`
            const fullPath = path.join(iterDir, relPath)
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, contents[i % contents.length])
            manifestFiles[relPath] = "hash"
          }

          // Create user files in target (not in manifest)
          const userFiles: Array<{ path: string; content: string }> = []
          for (let i = 0; i < uniqueUser.length; i++) {
            const relPath = `project/${uniqueUser[i]}.txt`
            const fullPath = path.join(iterDir, relPath)
            const content = contents[(i + uniqueManifest.length) % contents.length]
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, content)
            userFiles.push({ path: relPath, content })
          }

          // Simulate uninstall: only remove manifest files
          for (const relPath of Object.keys(manifestFiles)) {
            removeFile(iterDir, relPath, false)
          }

          // Verify: user files still exist with same content
          for (const uf of userFiles) {
            const fullPath = path.join(iterDir, uf.path)
            expect(fs.existsSync(fullPath)).toBe(true)
            expect(fs.readFileSync(fullPath, "utf-8")).toBe(uf.content)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

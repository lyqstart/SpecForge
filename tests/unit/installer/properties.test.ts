import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { mkdtemp, rm } from "node:fs/promises"
import * as fs from "fs"
import * as path from "path"
import { tmpdir } from "node:os"

import {
  isSpecForgeFile,
  mergeOpenCodeJson,
  mergePackageJson,
  detectConflicts,
  deployFile,
  removeFile,
  FILE_REGISTRY,
} from "../../../scripts/sf-installer"
import type { ManifestFile } from "../../../scripts/sf-installer"

// ============================================================================
// Generators
// ============================================================================

/** Alphanumeric string safe for filenames and JSON keys */
const arbSafeString = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,14}$/)

/** Generate a random non-sf agent name (does NOT start with sf- or sf_) */
const arbNonSfAgentName = arbSafeString.filter(
  (s) => !s.startsWith("sf-") && !s.startsWith("sf_") && s !== "__proto__" && s !== "constructor"
)

/** Generate a random sf-prefixed agent name */
const arbSfAgentName = fc.constantFrom("sf-orchestrator", "sf-design", "sf-executor", "sf-reviewer", "sf-custom")

/** Generate a random agent path value */
const arbAgentPath = arbSafeString.map((s) => `.opencode/agents/${s}.md`)

/** Generate a random opencode.json with non-sf agents, $schema, and permission */
const arbOpenCodeJson = fc.record({
  schema: fc.option(fc.webUrl(), { nil: undefined }),
  permission: fc.option(
    fc.record({
      edit: fc.constantFrom("allow", "ask", "deny"),
      task: fc.constantFrom("allow", "ask", "deny"),
    }),
    { nil: undefined }
  ),
  nonSfAgents: fc.dictionary(arbNonSfAgentName, arbAgentPath, { minKeys: 0, maxKeys: 5 }),
})

/** Generate a random package.json with various fields */
const arbPackageJson = fc.record({
  name: arbSafeString,
  version: fc.constantFrom("1.0.0", "2.1.3", "0.5.0", "3.0.0-beta"),
  scripts: fc.option(fc.dictionary(arbSafeString, arbSafeString, { minKeys: 0, maxKeys: 3 }), { nil: undefined }),
  dependencies: fc.option(fc.dictionary(arbSafeString, fc.constantFrom("^1.0.0", "~2.0.0", "3.0.0"), { minKeys: 0, maxKeys: 3 }), { nil: undefined }),
  devDependencies: fc.option(fc.dictionary(arbSafeString, fc.constantFrom("^1.0.0", "~2.0.0", "3.0.0"), { minKeys: 0, maxKeys: 3 }), { nil: undefined }),
})

/** Generate a random filename (for isSpecForgeFile testing) */
const arbFilename = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_-]{0,30}$/),
  fc.constant("sf-").chain(() => arbSafeString.map((s) => "sf-" + s)),
  fc.constant("sf_").chain(() => arbSafeString.map((s) => "sf_" + s))
)

// ============================================================================
// Property Tests
// ============================================================================

describe("Property Tests — Core Correctness", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-prop-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-prop-src-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  /**
   * Property 2: opencode.json merge safety
   * For any valid opencode.json with non-sf-* agents and $schema/permission,
   * merge preserves them.
   *
   * **Validates: Requirements 2.4, 5.5, 10.1, 10.2, 10.5**
   */
  it("Property 2: opencode.json merge preserves non-sf agents, $schema, and permission", () => {
    fc.assert(
      fc.property(
        arbOpenCodeJson,
        fc.array(arbSfAgentName, { minLength: 1, maxLength: 4 }),
        (config, sfAgents) => {
          // Build target opencode.json with non-sf agents
          const targetConfig: any = {}
          if (config.schema) targetConfig.$schema = config.schema
          if (config.permission) targetConfig.permission = config.permission
          targetConfig.agent = { ...config.nonSfAgents }

          fs.writeFileSync(
            path.join(targetDir, "opencode.json"),
            JSON.stringify(targetConfig, null, 2)
          )

          // Build source opencode.json with sf-* agents
          const sourceConfig: any = { agent: {} }
          for (const name of sfAgents) {
            sourceConfig.agent[name] = `.opencode/agents/${name}.md`
          }
          fs.writeFileSync(
            path.join(sourceDir, "opencode.json"),
            JSON.stringify(sourceConfig, null, 2)
          )

          // Perform merge (add mode)
          mergeOpenCodeJson(targetDir, sourceDir, "add")

          // Read result
          const result = JSON.parse(
            fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
          )

          // Verify: non-sf agents preserved
          for (const [name, value] of Object.entries(config.nonSfAgents)) {
            expect(result.agent[name]).toBe(value)
          }

          // Verify: $schema preserved
          if (config.schema) {
            expect(result.$schema).toBe(config.schema)
          }

          // Verify: permission preserved
          if (config.permission) {
            expect(result.permission).toEqual(config.permission)
          }

          // Verify: sf-* agents added
          for (const name of sfAgents) {
            expect(result.agent[name]).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3: package.json merge safety
   * For any valid package.json, merge only touches devDependencies.
   *
   * **Validates: Requirements 2.5, 10.3, 10.4**
   */
  it("Property 3: package.json merge only touches devDependencies", () => {
    fc.assert(
      fc.property(
        arbPackageJson,
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 10 }), { minKeys: 1, maxKeys: 5 }),
        (pkg, sourceDevDeps) => {
          // Write target package.json
          const targetPkg: any = { name: pkg.name, version: pkg.version }
          if (pkg.scripts) targetPkg.scripts = pkg.scripts
          if (pkg.dependencies) targetPkg.dependencies = pkg.dependencies
          if (pkg.devDependencies) targetPkg.devDependencies = pkg.devDependencies

          fs.writeFileSync(
            path.join(targetDir, "package.json"),
            JSON.stringify(targetPkg, null, 2)
          )

          // Write source package.json with devDependencies to merge
          const sourcePkg = { devDependencies: sourceDevDeps }
          fs.writeFileSync(
            path.join(sourceDir, "package.json"),
            JSON.stringify(sourcePkg, null, 2)
          )

          // Perform merge (add mode)
          mergePackageJson(targetDir, sourceDir, "add")

          // Read result
          const result = JSON.parse(
            fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
          )

          // Verify: name, version, scripts, dependencies unchanged
          expect(result.name).toBe(pkg.name)
          expect(result.version).toBe(pkg.version)
          if (pkg.scripts) expect(result.scripts).toEqual(pkg.scripts)
          if (pkg.dependencies) expect(result.dependencies).toEqual(pkg.dependencies)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 5: conflict detection blocks user file overwrite
   * For any file at a registry path without manifest, conflict is detected.
   *
   * **Validates: Requirements 3.2, 7.1, 7.3**
   */
  it("Property 5: conflict detection detects user files at SF registry paths", () => {
    fc.assert(
      fc.property(
        fc.subarray(FILE_REGISTRY, { minLength: 1, maxLength: 5 }),
        (filesToPlace) => {
          // Place user files at registry paths (no manifest)
          for (const relPath of filesToPlace) {
            const fullPath = path.join(targetDir, relPath)
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, "user content")
          }

          // Detect conflicts with no manifest
          const report = detectConflicts(targetDir, null)

          // Every placed file should be detected as a conflict
          for (const relPath of filesToPlace) {
            const found = report.conflicts.some(
              (c) => c.path === relPath && c.reason === "user_file_at_sf_path"
            )
            expect(found).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6: isSpecForgeFile prefix identification
   * Returns true iff filename starts with sf- or sf_.
   *
   * **Validates: Requirements 3.3**
   */
  it("Property 6: isSpecForgeFile returns true iff starts with sf- or sf_", () => {
    fc.assert(
      fc.property(arbFilename, (filename) => {
        const result = isSpecForgeFile(filename)
        const expected = filename.startsWith("sf-") || filename.startsWith("sf_")
        expect(result).toBe(expected)
      }),
      { numRuns: 200 }
    )
  })

  /**
   * Property 14: dry-run idempotency
   * deployFile/removeFile with dryRun=true doesn't change filesystem.
   *
   * **Validates: Requirements 7.5**
   */
  it("Property 14: dry-run does not modify filesystem", () => {
    fc.assert(
      fc.property(
        arbSafeString,
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.boolean(),
        (filename, content, fileExists) => {
          // Setup: optionally create a file in target
          const relPath = filename
          const targetPath = path.join(targetDir, relPath)

          if (fileExists) {
            fs.writeFileSync(targetPath, content)
          }

          // Also create source file for deployFile
          fs.writeFileSync(path.join(sourceDir, relPath), "source content")

          // Snapshot filesystem state
          const existedBefore = fs.existsSync(targetPath)
          const contentBefore = existedBefore
            ? fs.readFileSync(targetPath, "utf-8")
            : null

          // Execute with dryRun=true
          deployFile(sourceDir, targetDir, relPath, true)
          removeFile(targetDir, relPath, true)

          // Verify: filesystem unchanged
          const existsAfter = fs.existsSync(targetPath)
          expect(existsAfter).toBe(existedBefore)
          if (existedBefore) {
            expect(fs.readFileSync(targetPath, "utf-8")).toBe(contentBefore)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

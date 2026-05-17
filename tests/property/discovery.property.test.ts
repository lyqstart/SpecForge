/**
 * Property-based tests for Discovery Module
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.8**
 *
 * Property 1: Discovery produces correct desired state
 * Property 2: Discovery hash integrity
 *
 * NOTE: This test requires Bun runtime because the discovery module uses
 * Bun.file() and Bun.CryptoHasher internally. Run with: bun test
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { buildDesiredState } from "../../scripts/lib/discovery"
import type { ManagedComponentType } from "../../scripts/lib/types"

// ============================================================
// Helpers
// ============================================================

/** Track temp dirs for cleanup */
const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir)
  }
  tempDirs.length = 0
})

/**
 * Represents a file to be created in the temp directory.
 * relativePath is POSIX-style relative to the source dir.
 */
interface TestFile {
  relativePath: string
  componentType: ManagedComponentType
  content: string
}

/**
 * Represents an excluded file that should NOT appear in results.
 */
interface ExcludedFile {
  relativePath: string
  content: string
}

/**
 * Generator for valid deployable file definitions.
 * Produces files with sf-/sf_ prefix matching discovery patterns.
 */
function arbDeployableFiles(): fc.Arbitrary<TestFile[]> {
  const identifier = fc.stringMatching(/^[a-z][a-z0-9_]{2,12}$/)
  const content = fc.string({ minLength: 1, maxLength: 500 })

  const agentFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `agents/sf-${id}.md`,
    componentType: "agent" as ManagedComponentType,
    content: c,
  }))

  const toolFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `tools/sf_${id}.ts`,
    componentType: "tool" as ManagedComponentType,
    content: c,
  }))

  const toolLibFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `tools/lib/sf_${id}.ts`,
    componentType: "tool_lib" as ManagedComponentType,
    content: c,
  }))

  const pluginFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `plugins/sf_${id}.ts`,
    componentType: "plugin" as ManagedComponentType,
    content: c,
  }))

  const skillFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `skills/sf-${id}/SKILL.md`,
    componentType: "skill" as ManagedComponentType,
    content: c,
  }))

  // Generate 0-3 files from each category, then combine and deduplicate
  return fc
    .tuple(
      fc.array(agentFile, { minLength: 0, maxLength: 3 }),
      fc.array(toolFile, { minLength: 0, maxLength: 3 }),
      fc.array(toolLibFile, { minLength: 0, maxLength: 3 }),
      fc.array(pluginFile, { minLength: 0, maxLength: 3 }),
      fc.array(skillFile, { minLength: 0, maxLength: 3 })
    )
    .map(([agents, tools, toolLibs, plugins, skills]) => {
      const all = [...agents, ...tools, ...toolLibs, ...plugins, ...skills]
      // Deduplicate by relativePath
      const seen = new Set<string>()
      return all.filter((f) => {
        if (seen.has(f.relativePath)) return false
        seen.add(f.relativePath)
        return true
      })
    })
    .filter((files) => files.length > 0) // Ensure at least one file
}

/**
 * Generator for excluded files that should NOT appear in discovery results.
 */
function arbExcludedFiles(): fc.Arbitrary<ExcludedFile[]> {
  const content = fc.string({ minLength: 1, maxLength: 100 })

  return fc
    .tuple(
      // .gitkeep files in various directories
      fc.array(
        fc.constantFrom(
          "agents/.gitkeep",
          "tools/.gitkeep",
          "plugins/.gitkeep",
          "skills/.gitkeep"
        ),
        { minLength: 0, maxLength: 4 }
      ),
      // node_modules files
      fc.array(
        content.map((c) => ({
          relativePath: "node_modules/some-package/index.js",
          content: c,
        })),
        { minLength: 0, maxLength: 1 }
      ),
      // package.json and package-lock.json
      fc.array(
        fc.constantFrom("package.json", "package-lock.json"),
        { minLength: 0, maxLength: 2 }
      )
    )
    .map(([gitkeeps, nodeModules, packageFiles]) => {
      const excluded: ExcludedFile[] = []
      for (const gk of gitkeeps) {
        excluded.push({ relativePath: gk, content: "" })
      }
      for (const nm of nodeModules) {
        excluded.push(nm)
      }
      for (const pf of packageFiles) {
        excluded.push({ relativePath: pf, content: "{}" })
      }
      // Deduplicate
      const seen = new Set<string>()
      return excluded.filter((f) => {
        if (seen.has(f.relativePath)) return false
        seen.add(f.relativePath)
        return true
      })
    })
}

/**
 * Create the directory structure and files in a temp directory.
 * Uses Node.js fs APIs for cross-runtime compatibility.
 */
async function setupTempDir(
  sourceDir: string,
  deployableFiles: TestFile[],
  excludedFiles: ExcludedFile[]
): Promise<void> {
  // Create all necessary directories
  const dirs = new Set<string>()
  for (const file of [...deployableFiles, ...excludedFiles]) {
    const parts = file.relativePath.split("/")
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"))
    }
  }

  for (const dir of dirs) {
    await mkdir(join(sourceDir, dir), { recursive: true })
  }

  // Write all files using Node.js writeFile
  for (const file of deployableFiles) {
    await writeFile(join(sourceDir, file.relativePath), file.content, "utf-8")
  }
  for (const file of excludedFiles) {
    await writeFile(join(sourceDir, file.relativePath), file.content, "utf-8")
  }
}

/**
 * Independently compute SHA-256 hash of a file using Node.js crypto.
 * This provides an independent verification separate from Bun.CryptoHasher
 * used by the discovery module.
 */
async function independentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Create a package.json in the parent directory for version reading.
 */
async function createParentPackageJson(sourceDir: string): Promise<void> {
  const parentDir = join(sourceDir, "..")
  await writeFile(
    join(parentDir, "package.json"),
    JSON.stringify({ name: "test-project", version: "1.0.0" }),
    "utf-8"
  )
}

// ============================================================
// Property Tests
// ============================================================

describe("Discovery Module Properties", () => {
  // Property 1: Discovery produces correct desired state
  //
  // For any valid .opencode/ directory structure containing arbitrary combinations
  // of .md files in agents/, .ts files in tools/ and tools/lib/, .ts files in plugins/,
  // and SKILL.md files in skills/{name}/, the Discovery Module SHALL return exactly
  // the set of deployable files (excluding .gitkeep, node_modules/, package.json,
  // package-lock.json) with correct ManagedComponentType classification based on
  // directory location.
  //
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.8
  it("Property 1: Discovery produces correct desired state", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDeployableFiles(),
        arbExcludedFiles(),
        async (deployableFiles, excludedFiles) => {
          // Setup temp directory
          const sourceDir = await createTempDir("discovery-prop1-")
          tempDirs.push(sourceDir)

          await setupTempDir(sourceDir, deployableFiles, excludedFiles)
          await createParentPackageJson(sourceDir)

          // Run discovery
          const result = await buildDesiredState({ sourceDir })

          // Must succeed
          expect(result.ok).toBe(true)
          if (!result.ok) return

          const { entries } = result.state

          // Verify: entries precisely match deployable files
          expect(entries.size).toBe(deployableFiles.length)

          for (const file of deployableFiles) {
            const entry = entries.get(file.relativePath)
            expect(entry).toBeDefined()
            if (!entry) continue

            // Verify correct componentType classification
            expect(entry.componentType).toBe(file.componentType)

            // Verify relativePath matches
            expect(entry.relativePath).toBe(file.relativePath)

            // Verify size is positive
            expect(entry.size).toBeGreaterThan(0)

            // Verify sourceHash is a valid SHA-256 hex string
            expect(entry.sourceHash).toMatch(/^[0-9a-f]{64}$/)
          }

          // Verify: excluded files are NOT in results
          for (const excluded of excludedFiles) {
            expect(entries.has(excluded.relativePath)).toBe(false)
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  // Property 2: Discovery hash integrity
  //
  // For any file discovered by the Discovery Module, the sourceHash in the
  // DesiredState entry SHALL equal the SHA-256 hash independently computed
  // from the file's content.
  //
  // Validates: Requirements 1.5
  it("Property 2: Discovery hash integrity", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDeployableFiles(),
        async (deployableFiles) => {
          // Setup temp directory
          const sourceDir = await createTempDir("discovery-prop2-")
          tempDirs.push(sourceDir)

          await setupTempDir(sourceDir, deployableFiles, [])
          await createParentPackageJson(sourceDir)

          // Run discovery
          const result = await buildDesiredState({ sourceDir })

          // Must succeed
          expect(result.ok).toBe(true)
          if (!result.ok) return

          const { entries } = result.state

          // For each discovered file, independently compute SHA-256
          // and verify it matches the sourceHash
          for (const [relativePath, entry] of entries) {
            const filePath = join(sourceDir, relativePath)
            const expectedHash = await independentHash(filePath)

            expect(entry.sourceHash).toBe(expectedHash)
          }
        }
      ),
      { numRuns: 20 }
    )
  })
})

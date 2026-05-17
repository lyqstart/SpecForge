/**
 * 验证 fast-check 生成器基础设施正确工作
 */
import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  arbRelativePath,
  arbManagedComponentType,
  arbSha256,
  arbDesiredStateEntry,
  arbCurrentStateEntry,
  arbFileReconcileInput,
  arbManifest,
} from "./generators"

describe("fast-check generators", () => {
  it("arbRelativePath generates valid POSIX paths", () => {
    fc.assert(
      fc.property(arbRelativePath(), (path) => {
        // Must use forward slashes only
        expect(path).not.toContain("\\")
        // Must match one of the known directory patterns
        const validPatterns = [
          /^agents\/sf-[a-z0-9_]+\.md$/,
          /^tools\/sf_[a-z0-9_]+\.ts$/,
          /^tools\/lib\/sf_[a-z0-9_]+\.ts$/,
          /^plugins\/sf_[a-z0-9_]+\.ts$/,
          /^skills\/[a-z0-9_]+\/SKILL\.md$/,
        ]
        const matchesAny = validPatterns.some((p) => p.test(path))
        expect(matchesAny).toBe(true)
      }),
      { numRuns: 200 }
    )
  })

  it("arbManagedComponentType generates valid types", () => {
    fc.assert(
      fc.property(arbManagedComponentType(), (type) => {
        expect(["agent", "tool", "tool_lib", "plugin", "skill"]).toContain(type)
      }),
      { numRuns: 50 }
    )
  })

  it("arbSha256 generates valid 64-char hex strings", () => {
    fc.assert(
      fc.property(arbSha256(), (hash) => {
        expect(hash).toHaveLength(64)
        expect(hash).toMatch(/^[0-9a-f]{64}$/)
      }),
      { numRuns: 100 }
    )
  })

  it("arbDesiredStateEntry generates valid entries", () => {
    fc.assert(
      fc.property(arbDesiredStateEntry(), (entry) => {
        expect(entry.relativePath).toBeDefined()
        expect(entry.componentType).toBeDefined()
        expect(entry.sourceHash).toHaveLength(64)
        expect(entry.size).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 }
    )
  })

  it("arbCurrentStateEntry generates entries with optional hashes", () => {
    let hasUndefinedCurrentHash = false
    let hasDefinedCurrentHash = false
    let hasUndefinedManifestHash = false
    let hasDefinedManifestHash = false

    fc.assert(
      fc.property(arbCurrentStateEntry(), (entry) => {
        expect(entry.relativePath).toBeDefined()
        expect(entry.componentType).toBeDefined()
        expect(entry.size).toBeGreaterThanOrEqual(0)
        expect(typeof entry.existsOnDisk).toBe("boolean")

        if (entry.currentHash === undefined) hasUndefinedCurrentHash = true
        else hasDefinedCurrentHash = true
        if (entry.manifestHash === undefined) hasUndefinedManifestHash = true
        else hasDefinedManifestHash = true
      }),
      { numRuns: 200 }
    )

    // Verify both defined and undefined values are generated
    expect(hasUndefinedCurrentHash).toBe(true)
    expect(hasDefinedCurrentHash).toBe(true)
    expect(hasUndefinedManifestHash).toBe(true)
    expect(hasDefinedManifestHash).toBe(true)
  })

  it("arbFileReconcileInput generates all hash combinations", () => {
    let hasAllDefined = false
    let hasAllUndefined = false
    let hasMixed = false

    fc.assert(
      fc.property(arbFileReconcileInput(), (input) => {
        expect(input.relativePath).toBeDefined()
        expect(input.componentType).toBeDefined()
        expect(typeof input.isManagedComponent).toBe("boolean")

        const defined = [input.sourceHash, input.currentHash, input.manifestHash].filter(
          (h) => h !== undefined
        ).length

        if (defined === 3) hasAllDefined = true
        else if (defined === 0) hasAllUndefined = true
        else hasMixed = true
      }),
      { numRuns: 500 }
    )

    // Verify diverse combinations are generated
    expect(hasAllDefined).toBe(true)
    expect(hasAllUndefined).toBe(true)
    expect(hasMixed).toBe(true)
  })

  it("arbManifest generates valid UserLevelManifest objects", () => {
    fc.assert(
      fc.property(arbManifest(), (manifest) => {
        expect(manifest.schema_version).toBe("1.0")
        expect(manifest.install_mode).toBe("user_level")
        expect(manifest.shared_version).toMatch(/^\d+\.\d+\.\d+$/)
        expect(manifest.installed_at).toBeDefined()
        expect(manifest.updated_at).toBeDefined()
        expect(Array.isArray(manifest.managed_agents)).toBe(true)
        expect(typeof manifest.managed_agent_hashes).toBe("object")
        expect(typeof manifest.files).toBe("object")

        // Validate file entries
        for (const [path, entry] of Object.entries(manifest.files)) {
          expect(path).toBeDefined()
          expect(entry.sha256).toHaveLength(64)
          expect(entry.size).toBeGreaterThanOrEqual(0)
          expect(["agent", "tool", "tool_lib", "plugin", "skill"]).toContain(entry.type)
        }
      }),
      { numRuns: 50 }
    )
  })
})

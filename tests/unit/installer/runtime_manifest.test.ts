/**
 * Unit tests for RuntimeManifest read/write
 *
 * Requirements: 7.4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"

import { readRuntimeManifest, writeRuntimeManifest } from "../../../scripts/lib/runtime_manifest"
import type { RuntimeManifest } from "../../../scripts/lib/types"

describe("readRuntimeManifest", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "specforge-runtime-manifest-read-"))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should return null when manifest file does not exist", async () => {
    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when specforge directory does not exist", async () => {
    const result = await readRuntimeManifest(join(testDir, "nonexistent"))
    expect(result).toBeNull()
  })

  it("should return null when manifest contains invalid JSON", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    await writeFile(join(specforgeDir, "runtime-manifest.json"), "not valid json {{{", "utf-8")

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when manifest is missing schema_version", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when schema_version is not '1.0'", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "2.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when created_at is missing", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when updated_at is missing", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when files is missing", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when files is an array instead of object", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: [],
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when a file entry has non-number mtime", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {
        "config/state.json": { mtime: "not-a-number", size: 100 },
      },
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when a file entry has non-number size", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const invalid = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {
        "config/state.json": { mtime: 1700000000000, size: null },
      },
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(invalid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should return null when a file entry has Infinity mtime", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    // JSON.stringify converts Infinity to null, so we write manually
    const content = `{"schema_version":"1.0","created_at":"2024-01-01T00:00:00.000Z","updated_at":"2024-01-01T00:00:00.000Z","files":{"a.json":{"mtime":null,"size":100}}}`
    await writeFile(join(specforgeDir, "runtime-manifest.json"), content, "utf-8")

    const result = await readRuntimeManifest(testDir)
    expect(result).toBeNull()
  })

  it("should successfully read a valid RuntimeManifest with empty files", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const valid: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-06-15T12:30:00.000Z",
      files: {},
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(valid, null, 2),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).not.toBeNull()
    expect(result!.schema_version).toBe("1.0")
    expect(result!.created_at).toBe("2024-01-01T00:00:00.000Z")
    expect(result!.updated_at).toBe("2024-06-15T12:30:00.000Z")
    expect(result!.files).toEqual({})
  })

  it("should successfully read a valid RuntimeManifest with file entries", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const valid: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-06-15T12:30:00.000Z",
      files: {
        "config/state.json": { mtime: 1700000000000, size: 256 },
        "runtime/cache.json": { mtime: 1700000001000, size: 1024 },
        "knowledge/graph.json": { mtime: 1700000002000, size: 4096 },
      },
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(valid, null, 2),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).not.toBeNull()
    expect(result!.files["config/state.json"]).toEqual({ mtime: 1700000000000, size: 256 })
    expect(result!.files["runtime/cache.json"]).toEqual({ mtime: 1700000001000, size: 1024 })
    expect(result!.files["knowledge/graph.json"]).toEqual({ mtime: 1700000002000, size: 4096 })
  })

  it("should handle mtime value of 0 as valid", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const valid: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {
        "file.json": { mtime: 0, size: 0 },
      },
    }
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify(valid),
      "utf-8"
    )

    const result = await readRuntimeManifest(testDir)
    expect(result).not.toBeNull()
    expect(result!.files["file.json"]).toEqual({ mtime: 0, size: 0 })
  })
})

describe("writeRuntimeManifest", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "specforge-runtime-manifest-write-"))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create specforge directory and write manifest", async () => {
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-06-15T12:30:00.000Z",
      files: {
        "config/state.json": { mtime: 1700000000000, size: 256 },
      },
    }

    const result = await writeRuntimeManifest(testDir, manifest)
    expect(result).toBe(true)

    const manifestPath = join(testDir, "specforge", "runtime-manifest.json")
    expect(existsSync(manifestPath)).toBe(true)

    const content = await readFile(manifestPath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.schema_version).toBe("1.0")
    expect(parsed.created_at).toBe("2024-01-01T00:00:00.000Z")
    expect(parsed.updated_at).toBe("2024-06-15T12:30:00.000Z")
    expect(parsed.files["config/state.json"]).toEqual({ mtime: 1700000000000, size: 256 })
  })

  it("should overwrite existing manifest", async () => {
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    await writeFile(
      join(specforgeDir, "runtime-manifest.json"),
      JSON.stringify({ old: "data" }),
      "utf-8"
    )

    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-07-01T00:00:00.000Z",
      files: {
        "new-file.json": { mtime: 1700000005000, size: 512 },
      },
    }

    const result = await writeRuntimeManifest(testDir, manifest)
    expect(result).toBe(true)

    const content = await readFile(join(specforgeDir, "runtime-manifest.json"), "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.schema_version).toBe("1.0")
    expect(parsed.files["new-file.json"]).toEqual({ mtime: 1700000005000, size: 512 })
    expect(parsed.old).toBeUndefined()
  })

  it("should produce valid JSON with 2-space indentation and trailing newline", async () => {
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }

    await writeRuntimeManifest(testDir, manifest)

    const content = await readFile(
      join(testDir, "specforge", "runtime-manifest.json"),
      "utf-8"
    )
    // Should end with newline
    expect(content.endsWith("\n")).toBe(true)
    // Should be 2-space indented
    expect(content).toContain('  "schema_version"')
  })

  it("should write manifest that can be read back correctly (roundtrip)", async () => {
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-03-15T10:20:30.000Z",
      updated_at: "2024-03-15T10:20:30.000Z",
      files: {
        "config/state.json": { mtime: 1710498030000, size: 128 },
        "config/project.json": { mtime: 1710498030000, size: 64 },
        "knowledge/graph.json": { mtime: 1710498031000, size: 2048 },
      },
    }

    const writeResult = await writeRuntimeManifest(testDir, manifest)
    expect(writeResult).toBe(true)

    const readResult = await readRuntimeManifest(testDir)
    expect(readResult).not.toBeNull()
    expect(readResult).toEqual(manifest)
  })

  it("should handle manifest with many file entries", async () => {
    const files: Record<string, { mtime: number; size: number }> = {}
    for (let i = 0; i < 50; i++) {
      files[`runtime/file-${i}.json`] = { mtime: 1700000000000 + i * 1000, size: i * 100 }
    }

    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files,
    }

    const writeResult = await writeRuntimeManifest(testDir, manifest)
    expect(writeResult).toBe(true)

    const readResult = await readRuntimeManifest(testDir)
    expect(readResult).not.toBeNull()
    expect(Object.keys(readResult!.files)).toHaveLength(50)
  })

  it("should write to specforge/runtime-manifest.json path", async () => {
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      files: {},
    }

    await writeRuntimeManifest(testDir, manifest)

    // Verify exact path
    const expectedPath = join(testDir, "specforge", "runtime-manifest.json")
    expect(existsSync(expectedPath)).toBe(true)
  })
})

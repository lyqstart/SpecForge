/**
 * Unit tests for Legacy Manifest Adapter
 *
 * Validates Requirements: 11.1
 *
 * Tests:
 * - Old format with flat sha256 strings
 * - Old format with partial FileEntry (missing type/size)
 * - Non-legacy format returns adapted: false
 * - Correct componentType inference from paths
 */
import { describe, it, expect } from "vitest"
import {
  tryAdaptLegacyManifest,
  isLegacyManifest,
  inferComponentType,
  adaptLegacyManifest,
  type LegacyAdapterResult,
} from "../../../scripts/lib/legacy_manifest_adapter"

// ============================================================
// tryAdaptLegacyManifest — unified entry point
// ============================================================

describe("tryAdaptLegacyManifest", () => {
  describe("Old format with flat sha256 strings", () => {
    it("should adapt manifest with flat sha256 string values in files", () => {
      const legacyData = {
        version: "3.4.0",
        installed_at: "2024-01-15T10:00:00.000Z",
        updated_at: "2024-03-20T14:30:00.000Z",
        files: {
          "agents/sf-orchestrator.md": "a".repeat(64),
          "tools/sf_state_read.ts": "b".repeat(64),
          "tools/lib/utils.ts": "c".repeat(64),
          "plugins/sf_specforge.ts": "d".repeat(64),
          "skills/sf-workflow/SKILL.md": "e".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest).not.toBeNull()
      expect(result.manifest!.schema_version).toBe("1.0")
      expect(result.manifest!.shared_version).toBe("3.4.0")
      expect(result.manifest!.installed_at).toBe("2024-01-15T10:00:00.000Z")
      expect(result.manifest!.updated_at).toBe("2024-03-20T14:30:00.000Z")
      expect(result.manifest!.install_mode).toBe("user_level")

      // Verify files are converted to FileEntry format
      const files = result.manifest!.files
      expect(files["agents/sf-orchestrator.md"]).toEqual({
        sha256: "a".repeat(64),
        size: 0,
        type: "agent",
      })
      expect(files["tools/sf_state_read.ts"]).toEqual({
        sha256: "b".repeat(64),
        size: 0,
        type: "tool",
      })
      expect(files["tools/lib/utils.ts"]).toEqual({
        sha256: "c".repeat(64),
        size: 0,
        type: "tool_lib",
      })
      expect(files["plugins/sf_specforge.ts"]).toEqual({
        sha256: "d".repeat(64),
        size: 0,
        type: "plugin",
      })
      expect(files["skills/sf-workflow/SKILL.md"]).toEqual({
        sha256: "e".repeat(64),
        size: 0,
        type: "skill",
      })
    })

    it("should emit migration warning when adapting flat sha256 format", () => {
      const legacyData = {
        version: "3.3.0",
        files: {
          "agents/sf-executor.md": "f".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.warning).toBeDefined()
      expect(result.warning).toContain("Migration")
      expect(result.warning).toContain("legacy manifest format")
    })

    it("should map legacy 'version' field to 'shared_version'", () => {
      const legacyData = {
        version: "2.0.0",
        files: {
          "agents/sf-test.md": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.shared_version).toBe("2.0.0")
      expect(result.warning).toContain("version")
    })

    it("should default shared_version to '0.0.0' when no version info exists", () => {
      const legacyData = {
        installed_at: "2024-01-01T00:00:00.000Z",
        files: {
          "tools/sf_tool.ts": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.shared_version).toBe("0.0.0")
    })
  })

  describe("Old format with partial FileEntry (missing type/size)", () => {
    it("should adapt manifest with entries that have sha256 but no type/size", () => {
      const legacyData = {
        shared_version: "3.4.0",
        installed_at: "2024-02-01T00:00:00.000Z",
        updated_at: "2024-02-15T00:00:00.000Z",
        source_dir: "/old/source/path",
        files: {
          "agents/sf-orchestrator.md": { sha256: "a".repeat(64) },
          "tools/sf_state_read.ts": { sha256: "b".repeat(64) },
          "tools/lib/sf_core.ts": { sha256: "c".repeat(64) },
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest).not.toBeNull()

      const files = result.manifest!.files
      expect(files["agents/sf-orchestrator.md"]).toEqual({
        sha256: "a".repeat(64),
        size: 0,
        type: "agent",
      })
      expect(files["tools/sf_state_read.ts"]).toEqual({
        sha256: "b".repeat(64),
        size: 0,
        type: "tool",
      })
      expect(files["tools/lib/sf_core.ts"]).toEqual({
        sha256: "c".repeat(64),
        size: 0,
        type: "tool_lib",
      })
    })

    it("should preserve existing size/type when present in partial entries", () => {
      const legacyData = {
        source_dir: "/old/path",
        shared_version: "3.4.0",
        installed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {
          "agents/sf-test.md": {
            sha256: "a".repeat(64),
            size: 1024,
            type: "agent",
          },
          "tools/sf_tool.ts": { sha256: "b".repeat(64) },
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      // Entry with full info should preserve it
      expect(result.manifest!.files["agents/sf-test.md"].size).toBe(1024)
      expect(result.manifest!.files["agents/sf-test.md"].type).toBe("agent")
      // Entry without size/type should get defaults
      expect(result.manifest!.files["tools/sf_tool.ts"].size).toBe(0)
      expect(result.manifest!.files["tools/sf_tool.ts"].type).toBe("tool")
    })
  })

  describe("Non-legacy format returns adapted: false", () => {
    it("should return adapted: false for current format manifest", () => {
      const currentFormat = {
        schema_version: "1.0",
        shared_version: "3.5.0",
        install_mode: "user_level",
        installed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-06-15T12:00:00.000Z",
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: { "sf-orchestrator": "abc123" },
        files: {
          "agents/sf-orchestrator.md": {
            sha256: "a".repeat(64),
            size: 1024,
            type: "agent",
          },
        },
      }

      const result = tryAdaptLegacyManifest(currentFormat)

      expect(result.adapted).toBe(false)
      expect(result.manifest).toBeNull()
      expect(result.warning).toBeUndefined()
    })

    it("should return adapted: false for null input", () => {
      const result = tryAdaptLegacyManifest(null)

      expect(result.adapted).toBe(false)
      expect(result.manifest).toBeNull()
    })

    it("should return adapted: false for non-object input", () => {
      expect(tryAdaptLegacyManifest("string")).toEqual({ adapted: false, manifest: null })
      expect(tryAdaptLegacyManifest(42)).toEqual({ adapted: false, manifest: null })
      expect(tryAdaptLegacyManifest(true)).toEqual({ adapted: false, manifest: null })
      expect(tryAdaptLegacyManifest([])).toEqual({ adapted: false, manifest: null })
    })

    it("should return adapted: false for empty object without manifest fields", () => {
      const result = tryAdaptLegacyManifest({})

      expect(result.adapted).toBe(false)
      expect(result.manifest).toBeNull()
    })

    it("should return adapted: false for object with schema_version 1.0 and valid structure", () => {
      const data = {
        schema_version: "1.0",
        shared_version: "3.5.0",
        installed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {},
      }

      const result = tryAdaptLegacyManifest(data)

      expect(result.adapted).toBe(false)
      expect(result.manifest).toBeNull()
    })
  })

  describe("Correct componentType inference from paths", () => {
    it("should infer 'agent' for paths under agents/", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "agents/sf-orchestrator.md": "a".repeat(64),
          "agents/sf-executor.md": "b".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["agents/sf-orchestrator.md"].type).toBe("agent")
      expect(result.manifest!.files["agents/sf-executor.md"].type).toBe("agent")
    })

    it("should infer 'tool' for paths under tools/ (top-level)", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "tools/sf_state_read.ts": "a".repeat(64),
          "tools/sf_design_gate.ts": "b".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["tools/sf_state_read.ts"].type).toBe("tool")
      expect(result.manifest!.files["tools/sf_design_gate.ts"].type).toBe("tool")
    })

    it("should infer 'tool_lib' for paths under tools/lib/", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "tools/lib/sf_gate_types.ts": "a".repeat(64),
          "tools/lib/utils.ts": "b".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["tools/lib/sf_gate_types.ts"].type).toBe("tool_lib")
      expect(result.manifest!.files["tools/lib/utils.ts"].type).toBe("tool_lib")
    })

    it("should infer 'plugin' for paths under plugins/", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "plugins/sf_specforge.ts": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["plugins/sf_specforge.ts"].type).toBe("plugin")
    })

    it("should infer 'skill' for paths under skills/", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "skills/sf-workflow-feature-spec/SKILL.md": "a".repeat(64),
          "skills/superpowers-brainstorming/SKILL.md": "b".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["skills/sf-workflow-feature-spec/SKILL.md"].type).toBe("skill")
      expect(result.manifest!.files["skills/superpowers-brainstorming/SKILL.md"].type).toBe("skill")
    })

    it("should default to 'tool' for unrecognized paths", () => {
      const legacyData = {
        version: "1.0.0",
        files: {
          "unknown/some-file.ts": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.files["unknown/some-file.ts"].type).toBe("tool")
    })
  })

  describe("Preserved fields", () => {
    it("should preserve shared_version when present (prefer over version)", () => {
      const legacyData = {
        version: "2.0.0",
        shared_version: "3.5.0",
        source_dir: "/old/path",
        installed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-06-01T00:00:00.000Z",
        files: {
          "agents/sf-test.md": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.shared_version).toBe("3.5.0")
    })

    it("should preserve installed_at and updated_at timestamps", () => {
      const legacyData = {
        version: "3.0.0",
        installed_at: "2023-06-15T08:30:00.000Z",
        updated_at: "2024-01-20T16:45:00.000Z",
        files: {
          "tools/sf_tool.ts": "a".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.installed_at).toBe("2023-06-15T08:30:00.000Z")
      expect(result.manifest!.updated_at).toBe("2024-01-20T16:45:00.000Z")
    })

    it("should extract managed_agents from agent file paths", () => {
      const legacyData = {
        version: "3.0.0",
        files: {
          "agents/sf-orchestrator.md": "a".repeat(64),
          "agents/sf-executor.md": "b".repeat(64),
          "agents/sf-reviewer.md": "c".repeat(64),
          "tools/sf_tool.ts": "d".repeat(64),
        },
      }

      const result = tryAdaptLegacyManifest(legacyData)

      expect(result.adapted).toBe(true)
      expect(result.manifest!.managed_agents).toContain("sf-orchestrator")
      expect(result.manifest!.managed_agents).toContain("sf-executor")
      expect(result.manifest!.managed_agents).toContain("sf-reviewer")
      expect(result.manifest!.managed_agents).toHaveLength(3)
    })
  })
})

// ============================================================
// isLegacyManifest — detection logic
// ============================================================

describe("isLegacyManifest", () => {
  it("should detect manifest without schema_version but with manifest fields", () => {
    expect(isLegacyManifest({
      version: "3.0.0",
      files: { "agents/sf-test.md": "a".repeat(64) },
    })).toBe(true)
  })

  it("should detect manifest with 'version' but no 'shared_version'", () => {
    expect(isLegacyManifest({
      schema_version: "0.9",
      version: "3.0.0",
      files: {},
    })).toBe(true)
  })

  it("should detect manifest with source_dir field", () => {
    expect(isLegacyManifest({
      schema_version: "0.9",
      shared_version: "3.0.0",
      source_dir: "/some/path",
      files: {},
    })).toBe(true)
  })

  it("should detect manifest with flat string file values", () => {
    expect(isLegacyManifest({
      schema_version: "0.9",
      shared_version: "3.0.0",
      files: { "agents/sf-test.md": "a".repeat(64) },
    })).toBe(true)
  })

  it("should NOT detect current format as legacy", () => {
    expect(isLegacyManifest({
      schema_version: "1.0",
      shared_version: "3.5.0",
      files: {
        "agents/sf-test.md": { sha256: "a".repeat(64), size: 100, type: "agent" },
      },
    })).toBe(false)
  })

  it("should NOT detect null as legacy", () => {
    expect(isLegacyManifest(null)).toBe(false)
  })

  it("should NOT detect non-object as legacy", () => {
    expect(isLegacyManifest("string")).toBe(false)
    expect(isLegacyManifest(123)).toBe(false)
  })

  it("should NOT detect empty object as legacy (no manifest fields)", () => {
    expect(isLegacyManifest({})).toBe(false)
  })
})

// ============================================================
// inferComponentType — path-based type inference
// ============================================================

describe("inferComponentType", () => {
  it("should infer 'agent' for agents/ paths", () => {
    expect(inferComponentType("agents/sf-orchestrator.md")).toBe("agent")
    expect(inferComponentType("agents/sf-executor.md")).toBe("agent")
  })

  it("should infer 'tool_lib' for tools/lib/ paths (before tool)", () => {
    expect(inferComponentType("tools/lib/sf_gate_types.ts")).toBe("tool_lib")
    expect(inferComponentType("tools/lib/utils.ts")).toBe("tool_lib")
  })

  it("should infer 'tool' for tools/ top-level paths", () => {
    expect(inferComponentType("tools/sf_state_read.ts")).toBe("tool")
    expect(inferComponentType("tools/sf_design_gate.ts")).toBe("tool")
  })

  it("should infer 'plugin' for plugins/ paths", () => {
    expect(inferComponentType("plugins/sf_specforge.ts")).toBe("plugin")
  })

  it("should infer 'skill' for skills/ paths", () => {
    expect(inferComponentType("skills/sf-workflow/SKILL.md")).toBe("skill")
    expect(inferComponentType("skills/superpowers-brainstorming/SKILL.md")).toBe("skill")
  })

  it("should default to 'tool' for unrecognized paths", () => {
    expect(inferComponentType("unknown/file.ts")).toBe("tool")
    expect(inferComponentType("config.json")).toBe("tool")
  })

  it("should handle backslash paths by normalizing", () => {
    expect(inferComponentType("agents\\sf-test.md")).toBe("agent")
    expect(inferComponentType("tools\\lib\\utils.ts")).toBe("tool_lib")
    expect(inferComponentType("plugins\\sf_specforge.ts")).toBe("plugin")
  })
})

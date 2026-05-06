import { describe, it, expect } from "vitest"
import {
  canonicalizeJson,
  computeAgentConfigHash,
} from "../../../scripts/lib/crypto"

describe("crypto module", () => {
  describe("canonicalizeJson", () => {
    it("should sort object keys alphabetically", () => {
      const obj = { z: 1, a: 2, m: 3 }
      expect(canonicalizeJson(obj)).toBe('{"a":2,"m":3,"z":1}')
    })

    it("should sort nested object keys recursively", () => {
      const obj = { b: { z: 1, a: 2 }, a: 1 }
      expect(canonicalizeJson(obj)).toBe('{"a":1,"b":{"a":2,"z":1}}')
    })

    it("should preserve array order", () => {
      const obj = { arr: [3, 1, 2] }
      expect(canonicalizeJson(obj)).toBe('{"arr":[3,1,2]}')
    })

    it("should handle null values", () => {
      expect(canonicalizeJson(null)).toBe("null")
    })

    it("should handle undefined values", () => {
      expect(canonicalizeJson(undefined)).toBe(undefined)
    })

    it("should handle primitive values", () => {
      expect(canonicalizeJson("hello")).toBe('"hello"')
      expect(canonicalizeJson(42)).toBe("42")
      expect(canonicalizeJson(true)).toBe("true")
    })

    it("should handle empty objects", () => {
      expect(canonicalizeJson({})).toBe("{}")
    })

    it("should handle empty arrays", () => {
      expect(canonicalizeJson([])).toBe("[]")
    })

    it("should produce compact JSON without spaces", () => {
      const obj = { key: "value", nested: { a: 1 } }
      const result = canonicalizeJson(obj)
      expect(result).not.toContain(" ")
    })

    it("should produce deterministic output for agent config", () => {
      const config1 = {
        mode: "primary",
        model: "anthropic/claude-sonnet-4-20250514",
        prompt: "{file:./agents/sf-orchestrator.md}",
        permission: {
          task: "allow",
          edit: "allow",
          bash: "allow",
          skill: "allow",
        },
      }

      // Same config with different key order
      const config2 = {
        permission: {
          skill: "allow",
          bash: "allow",
          task: "allow",
          edit: "allow",
        },
        prompt: "{file:./agents/sf-orchestrator.md}",
        model: "anthropic/claude-sonnet-4-20250514",
        mode: "primary",
      }

      expect(canonicalizeJson(config1)).toBe(canonicalizeJson(config2))
    })

    it("should handle arrays of objects with sorted keys", () => {
      const obj = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] }
      expect(canonicalizeJson(obj)).toBe(
        '{"items":[{"a":1,"b":2},{"c":3,"d":4}]}'
      )
    })
  })

  describe("computeAgentConfigHash", () => {
    it("should produce a 64-character hex string", () => {
      const config = {
        mode: "primary",
        model: "anthropic/claude-sonnet-4-20250514",
        prompt: "{file:./agents/sf-orchestrator.md}",
        permission: {
          task: "allow",
          edit: "allow",
          bash: "allow",
          skill: "allow",
        },
      }
      const hash = computeAgentConfigHash(config)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("should produce same hash for same config regardless of key order", () => {
      const config1 = {
        mode: "primary",
        model: "test-model",
        prompt: "test-prompt",
        permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" },
      }

      const config2 = {
        permission: { skill: "allow", bash: "allow", edit: "allow", task: "allow" },
        prompt: "test-prompt",
        model: "test-model",
        mode: "primary",
      }

      expect(computeAgentConfigHash(config1)).toBe(
        computeAgentConfigHash(config2)
      )
    })

    it("should produce different hash for different configs", () => {
      const config1 = {
        mode: "primary",
        model: "model-a",
        prompt: "prompt",
        permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" },
      }

      const config2 = {
        mode: "primary",
        model: "model-b",
        prompt: "prompt",
        permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" },
      }

      expect(computeAgentConfigHash(config1)).not.toBe(
        computeAgentConfigHash(config2)
      )
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mergeOpenCodeJson } from "../../../scripts/sf-installer"
import * as fs from "fs"
import * as path from "path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

describe("mergeOpenCodeJson", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-test-target-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-test-source-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  describe("add mode", () => {
    it("should add sf-* agents from source to target", () => {
      const sourceConfig = {
        agent: {
          "sf-orchestrator": { model: "claude" },
          "sf-executor": { model: "claude" },
        },
      }
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify(sourceConfig)
      )
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify({ agent: {} })
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.agent["sf-orchestrator"]).toEqual({ model: "claude" })
      expect(result.agent["sf-executor"]).toEqual({ model: "claude" })
    })

    it("should preserve non-sf-* agents in target", () => {
      const sourceConfig = {
        agent: { "sf-orchestrator": { model: "claude" } },
      }
      const targetConfig = {
        agent: { "my-custom-agent": { model: "gpt-4" } },
      }
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify(sourceConfig)
      )
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify(targetConfig)
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.agent["my-custom-agent"]).toEqual({ model: "gpt-4" })
      expect(result.agent["sf-orchestrator"]).toEqual({ model: "claude" })
    })

    it("should preserve $schema and permission fields", () => {
      const sourceConfig = {
        $schema: "https://opencode.ai/schema.json",
        permission: "ask",
        agent: { "sf-orchestrator": { model: "claude" } },
      }
      const targetConfig = {
        $schema: "https://custom-schema.json",
        permission: "deny",
        agent: {},
      }
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify(sourceConfig)
      )
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify(targetConfig)
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      // Target's existing $schema and permission should be preserved
      expect(result.$schema).toBe("https://custom-schema.json")
      expect(result.permission).toBe("deny")
    })

    it("should add $schema from source if target lacks it", () => {
      const sourceConfig = {
        $schema: "https://opencode.ai/schema.json",
        agent: { "sf-orchestrator": { model: "claude" } },
      }
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify(sourceConfig)
      )
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify({ agent: {} })
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.$schema).toBe("https://opencode.ai/schema.json")
    })

    it("should create target file if it does not exist", () => {
      const sourceConfig = {
        agent: { "sf-orchestrator": { model: "claude" } },
      }
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify(sourceConfig)
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.agent["sf-orchestrator"]).toEqual({ model: "claude" })
    })

    it("should throw on invalid JSON in target file", () => {
      fs.writeFileSync(
        path.join(sourceDir, "opencode.json"),
        JSON.stringify({ agent: { "sf-x": {} } })
      )
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        "{ invalid json }"
      )

      expect(() => mergeOpenCodeJson(targetDir, sourceDir, "add")).toThrow()
    })

    it("should do nothing if source file does not exist", () => {
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify({ agent: { "my-agent": {} } })
      )

      mergeOpenCodeJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.agent["my-agent"]).toEqual({})
    })
  })

  describe("remove mode", () => {
    it("should remove sf-* agents from target", () => {
      const targetConfig = {
        agent: {
          "sf-orchestrator": { model: "claude" },
          "sf-executor": { model: "claude" },
          "my-agent": { model: "gpt-4" },
        },
      }
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify(targetConfig)
      )

      mergeOpenCodeJson(targetDir, sourceDir, "remove")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.agent["sf-orchestrator"]).toBeUndefined()
      expect(result.agent["sf-executor"]).toBeUndefined()
      expect(result.agent["my-agent"]).toEqual({ model: "gpt-4" })
    })

    it("should do nothing if target file does not exist", () => {
      // Should not throw
      expect(() =>
        mergeOpenCodeJson(targetDir, sourceDir, "remove")
      ).not.toThrow()
    })

    it("should handle target with no agent field", () => {
      fs.writeFileSync(
        path.join(targetDir, "opencode.json"),
        JSON.stringify({ $schema: "test" })
      )

      mergeOpenCodeJson(targetDir, sourceDir, "remove")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "opencode.json"), "utf-8")
      )
      expect(result.$schema).toBe("test")
    })
  })
})

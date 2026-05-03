import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  checkDesignGate,
  hasRequirementReferences,
} from "../../../.opencode/tools/lib/sf_design_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_design_gate", () => {
  const testDir = join(tmpdir(), `specforge-design-gate-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("gate pass", () => {
    it("should pass when design.md exists and references requirements (Chinese)", async () => {
      const content = `# 设计文档

## 概述

本设计基于需求 1 和需求 2 的要求。

## 架构

System architecture.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })

    it("should pass when design.md references requirements (English)", async () => {
      const content = `# Design Document

## Overview

This design implements Requirement 1 and Requirement 2.

## Architecture

System architecture.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })
  })

  describe("gate fail", () => {
    it("should fail when design.md does not exist", async () => {
      const result = await checkDesignGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toContain("design.md not found")
      expect(result.next_action).toBe("revise")
    })

    it("should fail when design.md does not reference requirements", async () => {
      const content = `# Design Document

## Overview

This is a design document without any requirement references.

## Architecture

Some architecture description.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(
        result.blocking_issues.some((i) => i.includes("需求编号"))
      ).toBe(true)
      expect(result.next_action).toBe("revise")
    })
  })

  describe("helper: hasRequirementReferences", () => {
    it("should detect '需求 1'", () => {
      expect(hasRequirementReferences("基于需求 1 的设计")).toBe(true)
    })

    it("should detect '需求12'", () => {
      expect(hasRequirementReferences("实现需求12")).toBe(true)
    })

    it("should detect 'Requirement 1'", () => {
      expect(hasRequirementReferences("Implements Requirement 1")).toBe(true)
    })

    it("should detect 'Requirement12'", () => {
      expect(hasRequirementReferences("See Requirement12")).toBe(true)
    })

    it("should return false when no requirement numbers", () => {
      expect(hasRequirementReferences("Some design content")).toBe(false)
    })

    it("should return false for just the word 'requirement' without number", () => {
      expect(hasRequirementReferences("This is a requirement")).toBe(false)
    })
  })
})

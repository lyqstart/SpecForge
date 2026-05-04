import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  checkTraceMatrix,
  extractRequirementIds,
  extractDesignReqReferences,
  extractDesignSections,
  extractTaskDesignReferences,
} from "../../../.opencode/tools/lib/sf_trace_matrix_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_trace_matrix", () => {
  const testDir = join(tmpdir(), `specforge-trace-matrix-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  // ============================================================
  // Full coverage scenario (pass)
  // ============================================================

  describe("full coverage (pass)", () => {
    it("should pass when all requirements are covered in design and all designs are covered in tasks", async () => {
      const requirements = `# 需求文档

### 需求 1：用户登录

验收标准...

### 需求 2：用户注册

验收标准...
`
      const design = `# 设计文档

## 3.1 登录模块设计

实现需求 1 的登录功能。

## 3.2 注册模块设计

实现需求 2 的注册功能。
`
      const tasks = `# 任务列表

## 任务 1

实现设计 3.1 的登录模块。

## 任务 2

实现设计 3.2 的注册模块。
`
      await writeFile(join(specDir, "requirements.md"), requirements, "utf-8")
      await writeFile(join(specDir, "design.md"), design, "utf-8")
      await writeFile(join(specDir, "tasks.md"), tasks, "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.uncovered_requirements).toHaveLength(0)
      expect(result.uncovered_designs).toHaveLength(0)
      expect(result.coverage_summary.requirement_coverage_pct).toBe(100)
      expect(result.coverage_summary.design_coverage_pct).toBe(100)
    })

    it("should pass with English requirement format", async () => {
      const requirements = `# Requirements

### Requirement 1: User Login

Acceptance criteria...

### Requirement 2: User Registration

Acceptance criteria...
`
      const design = `# Design Document

## 2.1 Login Module

Design for Requirement 1.

## 2.2 Registration Module

Design for Requirement 2.
`
      const tasks = `# Task List

## Task 1

Implement Design 2.1 login module.

## Task 2

Implement Design 2.2 registration module.
`
      await writeFile(join(specDir, "requirements.md"), requirements, "utf-8")
      await writeFile(join(specDir, "design.md"), design, "utf-8")
      await writeFile(join(specDir, "tasks.md"), tasks, "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.uncovered_requirements).toHaveLength(0)
      expect(result.uncovered_designs).toHaveLength(0)
    })
  })

  // ============================================================
  // Partial coverage (fail with uncovered items)
  // ============================================================

  describe("partial coverage (fail)", () => {
    it("should fail when some requirements are not covered in design", async () => {
      const requirements = `# 需求文档

### 需求 1：用户登录

验收标准...

### 需求 2：用户注册

验收标准...

### 需求 3：密码重置

验收标准...
`
      const design = `# 设计文档

## 3.1 登录模块设计

实现需求 1 的登录功能。

## 3.2 注册模块设计

实现需求 2 的注册功能。
`
      const tasks = `# 任务列表

## 任务 1

实现设计 3.1 的登录模块。

## 任务 2

实现设计 3.2 的注册模块。
`
      await writeFile(join(specDir, "requirements.md"), requirements, "utf-8")
      await writeFile(join(specDir, "design.md"), design, "utf-8")
      await writeFile(join(specDir, "tasks.md"), tasks, "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.uncovered_requirements).toContain("3")
      expect(result.coverage_summary.total_requirements).toBe(3)
      expect(result.coverage_summary.covered_requirements).toBe(2)
      expect(result.coverage_summary.requirement_coverage_pct).toBe(67)
    })

    it("should fail when some design sections are not covered in tasks", async () => {
      const requirements = `# 需求文档

### 需求 1：用户登录

验收标准...
`
      const design = `# 设计文档

## 3.1 登录模块设计

实现需求 1 的登录功能。

## 3.2 安全模块设计

安全相关设计，也基于需求 1。
`
      const tasks = `# 任务列表

## 任务 1

实现设计 3.1 的登录模块。
`
      await writeFile(join(specDir, "requirements.md"), requirements, "utf-8")
      await writeFile(join(specDir, "design.md"), design, "utf-8")
      await writeFile(join(specDir, "tasks.md"), tasks, "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.uncovered_designs.length).toBeGreaterThan(0)
      expect(result.coverage_summary.design_coverage_pct).toBeLessThan(100)
    })
  })

  // ============================================================
  // No coverage (fail)
  // ============================================================

  describe("no coverage (fail)", () => {
    it("should fail when design does not reference any requirements", async () => {
      const requirements = `# 需求文档

### 需求 1：用户登录

验收标准...

### 需求 2：用户注册

验收标准...
`
      const design = `# 设计文档

## 3.1 模块 A

模块 A 的设计，没有引用任何需求。
`
      const tasks = `# 任务列表

一些任务内容，没有引用任何设计章节。
`
      await writeFile(join(specDir, "requirements.md"), requirements, "utf-8")
      await writeFile(join(specDir, "design.md"), design, "utf-8")
      await writeFile(join(specDir, "tasks.md"), tasks, "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.uncovered_requirements).toContain("1")
      expect(result.uncovered_requirements).toContain("2")
      expect(result.coverage_summary.covered_requirements).toBe(0)
      expect(result.coverage_summary.requirement_coverage_pct).toBe(0)
    })
  })

  // ============================================================
  // Missing files (fail)
  // ============================================================

  describe("missing files (fail)", () => {
    it("should fail when requirements.md is missing", async () => {
      await writeFile(join(specDir, "design.md"), "# Design", "utf-8")
      await writeFile(join(specDir, "tasks.md"), "# Tasks", "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.coverage_summary.total_requirements).toBe(0)
      expect(result.coverage_summary.requirement_coverage_pct).toBe(0)
    })

    it("should fail when design.md is missing", async () => {
      await writeFile(join(specDir, "requirements.md"), "### 需求 1\n内容", "utf-8")
      await writeFile(join(specDir, "tasks.md"), "# Tasks", "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.coverage_summary.total_requirements).toBe(0)
    })

    it("should fail when tasks.md is missing", async () => {
      await writeFile(join(specDir, "requirements.md"), "### 需求 1\n内容", "utf-8")
      await writeFile(join(specDir, "design.md"), "## 概述\n需求 1", "utf-8")

      const result = await checkTraceMatrix(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.coverage_summary.total_requirements).toBe(0)
    })

    it("should fail when spec directory does not exist", async () => {
      const result = await checkTraceMatrix("NON-EXISTENT", testDir)

      expect(result.status).toBe("fail")
      expect(result.coverage_summary.total_requirements).toBe(0)
      expect(result.coverage_summary.requirement_coverage_pct).toBe(0)
    })
  })

  // ============================================================
  // Extraction helper functions
  // ============================================================

  describe("extractRequirementIds", () => {
    it("should extract Chinese requirement IDs", () => {
      const content = `### 需求 1：用户登录\n### 需求 2：注册\n### 需求 10：设置`
      const ids = extractRequirementIds(content)
      expect(ids).toContain("1")
      expect(ids).toContain("2")
      expect(ids).toContain("10")
    })

    it("should extract English requirement IDs", () => {
      const content = `### Requirement 1: Login\n### Requirement 2: Register`
      const ids = extractRequirementIds(content)
      expect(ids).toContain("1")
      expect(ids).toContain("2")
    })

    it("should extract REQ-XXX style IDs", () => {
      const content = `REQ-001 and REQ-F001 and REQ_AUTH_01`
      const ids = extractRequirementIds(content)
      expect(ids).toContain("REQ-001")
      expect(ids).toContain("REQ-F001")
      expect(ids).toContain("REQ_AUTH_01")
    })

    it("should extract numbered section IDs", () => {
      const content = `## 1. User Login\n## 2. Registration\n## 12. Settings`
      const ids = extractRequirementIds(content)
      expect(ids).toContain("1")
      expect(ids).toContain("2")
      expect(ids).toContain("12")
    })

    it("should return unique IDs", () => {
      const content = `### 需求 1：登录\n### 需求 1：重复`
      const ids = extractRequirementIds(content)
      expect(ids.filter((id) => id === "1")).toHaveLength(1)
    })

    it("should return empty array for content without requirements", () => {
      const content = `# Some document\n\nNo requirements here.`
      const ids = extractRequirementIds(content)
      expect(ids).toHaveLength(0)
    })
  })

  describe("extractDesignReqReferences", () => {
    it("should extract Chinese requirement references", () => {
      const content = `本设计基于需求 1 和需求 2 的要求。`
      const refs = extractDesignReqReferences(content)
      expect(refs).toContain("1")
      expect(refs).toContain("2")
    })

    it("should extract English requirement references", () => {
      const content = `Implements Requirement 1 and Requirement 3.`
      const refs = extractDesignReqReferences(content)
      expect(refs).toContain("1")
      expect(refs).toContain("3")
    })

    it("should extract REQ-XXX references", () => {
      const content = `Based on REQ-001 and REQ-F002.`
      const refs = extractDesignReqReferences(content)
      expect(refs).toContain("REQ-001")
      expect(refs).toContain("REQ-F002")
    })

    it("should return unique references", () => {
      const content = `需求 1 在这里，需求 1 又在这里。`
      const refs = extractDesignReqReferences(content)
      expect(refs.filter((r) => r === "1")).toHaveLength(1)
    })
  })

  describe("extractDesignSections", () => {
    it("should extract ## level headings", () => {
      const content = `# Title\n\n## 3.1 Login Module\n\nContent\n\n## 3.2 Register Module\n\nContent`
      const sections = extractDesignSections(content)
      expect(sections).toContain("3.1 Login Module")
      expect(sections).toContain("3.2 Register Module")
    })

    it("should extract ### level headings", () => {
      const content = `## Parent\n\n### 3.1.1 Sub Section\n\nContent`
      const sections = extractDesignSections(content)
      expect(sections).toContain("3.1.1 Sub Section")
    })

    it("should not extract # level headings", () => {
      const content = `# Title\n\n## Section`
      const sections = extractDesignSections(content)
      expect(sections).not.toContain("Title")
      expect(sections).toContain("Section")
    })

    it("should return empty array for content without headings", () => {
      const content = `Just some text without any headings.`
      const sections = extractDesignSections(content)
      expect(sections).toHaveLength(0)
    })
  })

  describe("extractTaskDesignReferences", () => {
    it("should extract Chinese design references", () => {
      const content = `实现设计 3.1 的登录模块。\n实现设计 3.2 的注册模块。`
      const refs = extractTaskDesignReferences(content)
      expect(refs).toContain("3.1")
      expect(refs).toContain("3.2")
    })

    it("should extract English design references", () => {
      const content = `Implement Design 3.1 login module.\nImplement Design 3.2 register module.`
      const refs = extractTaskDesignReferences(content)
      expect(refs).toContain("3.1")
      expect(refs).toContain("3.2")
    })

    it("should extract § symbol references", () => {
      const content = `See §3.1 and §3.2 for details.`
      const refs = extractTaskDesignReferences(content)
      expect(refs).toContain("3.1")
      expect(refs).toContain("3.2")
    })

    it("should extract multi-level references", () => {
      const content = `设计 3.1.2 的子模块`
      const refs = extractTaskDesignReferences(content)
      expect(refs).toContain("3.1.2")
    })

    it("should return empty array for content without design references", () => {
      const content = `# Tasks\n\nJust some tasks without design references.`
      const refs = extractTaskDesignReferences(content)
      expect(refs).toHaveLength(0)
    })
  })
})

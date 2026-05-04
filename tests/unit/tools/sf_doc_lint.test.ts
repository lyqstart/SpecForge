import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  lintDocument,
  hasHeading,
  hasTaskBreakdownContent,
  getTaskSections,
  hasVerificationCommands,
} from "../../../.opencode/tools/lib/sf_doc_lint_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_doc_lint", () => {
  const testDir = join(tmpdir(), `specforge-doc-lint-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("requirements lint", () => {
    it("should pass when all required sections are present", async () => {
      const content = `# 需求文档

## 简介

This is the introduction.

## 术语表

| 术语 | 定义 |
|------|------|
| API | Application Programming Interface |

## 需求

### 需求 1: 用户登录
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should pass with English section names", async () => {
      const content = `# Requirements Document

## Introduction

Overview of the project.

## Glossary

Terms and definitions.

## Requirements

### Requirement 1
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail when missing Introduction section", async () => {
      const content = `# 需求文档

## 术语表

Terms here.

## 需求

Requirements here.
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("error")
      expect(result.issues[0].message).toContain("简介")
    })

    it("should fail when missing all required sections", async () => {
      const content = `# 文档

Some random content without proper sections.
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(3)
    })

    it("should fail when file does not exist", async () => {
      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("error")
      expect(result.issues[0].message).toContain("File not found")
    })
  })

  describe("design lint", () => {
    it("should pass when design sections exist and no task breakdown", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

## 接口

API interface definitions.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail when no design sections exist", async () => {
      const content = `# 文档

## 概述

Some overview without design sections.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues.some((i) => i.message.includes("设计相关章节"))).toBe(
        true
      )
    })

    it("should fail when design doc contains task breakdown", async () => {
      const content = `# 设计文档

## 架构

Architecture here.

## 任务拆分

Task 1: Do something
Task 2: Do something else
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      expect(
        result.issues.some((i) => i.message.includes("任务拆分"))
      ).toBe(true)
    })

    it("should fail when design doc contains '## Task' pattern", async () => {
      const content = `# Design Document

## Architecture

Architecture here.

## Task 1: Implementation

Steps to implement.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      expect(
        result.issues.some((i) => i.message.includes("任务拆分"))
      ).toBe(true)
    })
  })

  describe("tasks lint", () => {
    it("should pass when all tasks have verification_commands", async () => {
      const content = `# 任务列表

## Task 1: Setup project

Description of task 1.

verification_commands:
- npm run test
- npm run build

## Task 2: Implement feature

Description of task 2.

verification_commands:
- npm run test:unit
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail when a task is missing verification_commands", async () => {
      const content = `# 任务列表

## Task 1: Setup project

Description of task 1.

verification_commands:
- npm run test

## Task 2: Implement feature

Description of task 2 without verification commands.
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].message).toContain("Task 2")
      expect(result.issues[0].message).toContain("verification_commands")
    })

    it("should fail when no task sections found", async () => {
      const content = `# 任务列表

No tasks defined yet.
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues[0].message).toContain("未找到任何任务章节")
    })
  })

  describe("helper: hasHeading", () => {
    it("should find heading with # prefix", () => {
      expect(hasHeading("# Introduction\n\nContent", ["introduction"])).toBe(
        true
      )
    })

    it("should find heading with ## prefix", () => {
      expect(hasHeading("## 术语表\n\nContent", ["术语表"])).toBe(true)
    })

    it("should be case-insensitive", () => {
      expect(hasHeading("## GLOSSARY\n\nContent", ["glossary"])).toBe(true)
    })

    it("should not match non-heading text", () => {
      expect(hasHeading("This is about glossary terms", ["glossary"])).toBe(
        false
      )
    })
  })

  describe("helper: hasTaskBreakdownContent", () => {
    it("should detect 任务拆分", () => {
      expect(hasTaskBreakdownContent("## 任务拆分\n\nTasks")).toBe(true)
    })

    it("should detect Task Breakdown", () => {
      expect(hasTaskBreakdownContent("## Task Breakdown\n\nTasks")).toBe(true)
    })

    it("should detect ## Task pattern", () => {
      expect(hasTaskBreakdownContent("## Task 1: Do something")).toBe(true)
    })

    it("should not match 'Task' in body text", () => {
      expect(hasTaskBreakdownContent("This task is important")).toBe(false)
    })
  })

  describe("helper: getTaskSections", () => {
    it("should extract task sections from markdown", () => {
      const content = `# Title

## Section 1

Content 1

## Section 2

Content 2
`
      const sections = getTaskSections(content)
      expect(sections).toHaveLength(2)
      expect(sections[0].title).toBe("Section 1")
      expect(sections[1].title).toBe("Section 2")
    })

    it("should return empty array when no ## headings", () => {
      const content = `# Title

Just some content.
`
      const sections = getTaskSections(content)
      expect(sections).toHaveLength(0)
    })
  })

  describe("helper: hasVerificationCommands", () => {
    it("should detect verification_commands field", () => {
      expect(hasVerificationCommands("verification_commands:\n- npm test")).toBe(
        true
      )
    })

    it("should be case-insensitive", () => {
      expect(
        hasVerificationCommands("Verification_Commands:\n- npm test")
      ).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasVerificationCommands("Just some task description")).toBe(false)
    })
  })

  describe("bugfix lint", () => {
    it("should pass when all required bugfix sections are present (Chinese)", async () => {
      const content = `# Bugfix 分析

## 当前行为

系统返回 500 错误。

## 预期行为

系统应返回 200 成功。

## 不变行为

其他 API 端点不受影响。

## 根因分析

数据库连接池耗尽导致超时。
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "bugfix", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should pass when all required bugfix sections are present (English)", async () => {
      const content = `# Bugfix Analysis

## Current Behavior

System returns 500 error.

## Expected Behavior

System should return 200 success.

## Unchanged Behavior

Other API endpoints are not affected.

## Root Cause Analysis

Database connection pool exhaustion causes timeout.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "bugfix", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail when missing all required sections", async () => {
      const content = `# Bugfix

Some random content without proper sections.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "bugfix", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(4)
    })

    it("should fail when bugfix.md does not exist", async () => {
      const result = await lintDocument(workItemId, "bugfix", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("error")
      expect(result.issues[0].message).toContain("File not found")
    })

    it("should fail when missing only root cause analysis", async () => {
      const content = `# Bugfix

## 当前行为

Current.

## 预期行为

Expected.

## 不变行为

Unchanged.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "bugfix", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].message).toContain("根因分析")
    })
  })
})

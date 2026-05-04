import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  checkDesignGate,
  checkDesignGateDesignFirst,
  hasRequirementReferences,
  hasArchitectureSection,
  hasModuleBoundaries,
  hasDataModelOrInterface,
} from "../../../.opencode/tools/lib/sf_design_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as fc from "fast-check"

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


describe("sf_design_gate - Design-First mode", () => {
  const testDir = join(tmpdir(), `specforge-design-gate-df-${Date.now()}`)
  const workItemId = "WI-DF-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should pass in Design-First mode with architecture, modules, and interface", async () => {
    const content = `# 设计文档

## 架构概述

系统采用分层架构。

## 模块划分

- 模块 A: 负责数据处理
- 模块 B: 负责展示

## 接口定义

\`\`\`typescript
interface UserService {
  getUser(id: string): User
}
\`\`\`
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "feature_spec_design_first")

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
    expect(result.next_action).toBe("continue")
  })

  it("should fail in Design-First mode when missing architecture section", async () => {
    const content = `# 设计文档

## 模块划分

- 模块 A: 负责数据处理

## 接口定义

interface UserService {}
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "feature_spec_design_first")

    expect(result.status).toBe("fail")
    expect(result.blocking_issues.some(i => i.includes("架构"))).toBe(true)
    expect(result.next_action).toBe("revise")
  })

  it("should fail in Design-First mode when missing module boundaries", async () => {
    const content = `# 设计文档

## 架构概述

系统采用分层架构。

## 数据模型

\`\`\`typescript
interface User { id: string }
\`\`\`
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "feature_spec_design_first")

    expect(result.status).toBe("fail")
    expect(result.blocking_issues.some(i => i.includes("模块") || i.includes("组件"))).toBe(true)
    expect(result.next_action).toBe("revise")
  })

  it("should fail in Design-First mode when missing data model/interface", async () => {
    const content = `# 设计文档

## 架构概述

系统采用分层架构。

## 模块划分

- 模块 A: 负责处理
- 模块 B: 负责展示

## 其他细节

一些普通的描述文字，没有定义任何结构。
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "feature_spec_design_first")

    expect(result.status).toBe("fail")
    expect(result.blocking_issues.some(i => i.includes("数据模型") || i.includes("接口"))).toBe(true)
    expect(result.next_action).toBe("revise")
  })

  it("should use V1 behavior when workflow_type is not provided (default)", async () => {
    // Content with requirement references but no architecture section
    const content = `# 设计文档

基于需求 1 的设计。
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir)

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
  })

  it("should use V1 behavior when workflow_type is feature_spec", async () => {
    // Content without requirement references
    const content = `# 设计文档

Some design without requirement references.
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "feature_spec")

    expect(result.status).toBe("fail")
    expect(result.blocking_issues.some(i => i.includes("需求编号"))).toBe(true)
  })

  it("should use V1 behavior when workflow_type is bugfix_spec", async () => {
    const content = `# 设计文档

基于需求 1 的修复设计。
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")

    const result = await checkDesignGate(workItemId, testDir, "bugfix_spec")

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
  })
})

describe("Design-First helper functions", () => {
  describe("hasArchitectureSection", () => {
    it("should detect '## 架构'", () => {
      expect(hasArchitectureSection("## 架构\n\n内容")).toBe(true)
    })

    it("should detect '## Architecture'", () => {
      expect(hasArchitectureSection("## Architecture\n\ncontent")).toBe(true)
    })

    it("should detect '## 概述'", () => {
      expect(hasArchitectureSection("## 概述\n\n内容")).toBe(true)
    })

    it("should detect '# Overview'", () => {
      expect(hasArchitectureSection("# Overview\n\ncontent")).toBe(true)
    })

    it("should return false when no architecture section", () => {
      expect(hasArchitectureSection("# Design\n\nSome content")).toBe(false)
    })
  })

  describe("hasModuleBoundaries", () => {
    it("should detect '模块'", () => {
      expect(hasModuleBoundaries("系统分为三个模块")).toBe(true)
    })

    it("should detect '组件'", () => {
      expect(hasModuleBoundaries("核心组件包括")).toBe(true)
    })

    it("should detect 'Module'", () => {
      expect(hasModuleBoundaries("Auth Module handles")).toBe(true)
    })

    it("should detect 'Component'", () => {
      expect(hasModuleBoundaries("React Component")).toBe(true)
    })

    it("should return false when no module boundaries", () => {
      expect(hasModuleBoundaries("Some plain text")).toBe(false)
    })
  })

  describe("hasDataModelOrInterface", () => {
    it("should detect '数据模型'", () => {
      expect(hasDataModelOrInterface("定义数据模型如下")).toBe(true)
    })

    it("should detect '接口'", () => {
      expect(hasDataModelOrInterface("接口定义")).toBe(true)
    })

    it("should detect 'Data Model'", () => {
      expect(hasDataModelOrInterface("Data Model definition")).toBe(true)
    })

    it("should detect 'Interface'", () => {
      expect(hasDataModelOrInterface("interface UserService")).toBe(true)
    })

    it("should detect '类型定义'", () => {
      expect(hasDataModelOrInterface("类型定义如下")).toBe(true)
    })

    it("should return false when no data model or interface", () => {
      expect(hasDataModelOrInterface("Some plain text")).toBe(false)
    })
  })
})

// Property 10: design gate workflow dispatch
describe("Feature: specforge-v2-efficiency, Property 10: design gate workflow dispatch", () => {
  it("should correctly dispatch based on workflow_type", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          workflowType: fc.constantFrom("feature_spec", "bugfix_spec", "feature_spec_design_first"),
          hasReqRefs: fc.boolean(),
          hasArch: fc.boolean(),
          hasModules: fc.boolean(),
          hasInterface: fc.boolean(),
        }),
        async ({ workflowType, hasReqRefs, hasArch, hasModules, hasInterface }) => {
          const localDir = join(
            tmpdir(),
            `specforge-pbt-dg-${Date.now()}-${Math.random().toString(36).slice(2)}`
          )
          const workItemId = "WI-PBT"
          const specDir = join(localDir, "specforge", "specs", workItemId)
          await mkdir(specDir, { recursive: true })

          try {
            // Build content based on flags
            let content = "# 设计文档\n\n"
            if (hasReqRefs) content += "基于需求 1 的设计。\n\n"
            if (hasArch) content += "## 架构概述\n\n系统架构描述。\n\n"
            if (hasModules) content += "## 模块划分\n\n模块 A 和模块 B。\n\n"
            if (hasInterface) content += "## 接口定义\n\ninterface Service {}\n\n"

            await writeFile(join(specDir, "design.md"), content, "utf-8")

            const result = await checkDesignGate(workItemId, localDir, workflowType)

            // Verify result structure
            expect(result).toHaveProperty("status")
            expect(result).toHaveProperty("blocking_issues")
            expect(result).toHaveProperty("warnings")
            expect(result).toHaveProperty("next_action")
            expect(["pass", "fail", "blocked"]).toContain(result.status)

            if (workflowType === "feature_spec" || workflowType === "bugfix_spec") {
              // V1 behavior: checks requirement references
              if (hasReqRefs) {
                expect(result.status).toBe("pass")
              } else {
                expect(result.status).toBe("fail")
                expect(result.blocking_issues.some(i => i.includes("需求编号"))).toBe(true)
              }
            } else if (workflowType === "feature_spec_design_first") {
              // Design-First: checks architecture, modules, interface (NOT requirement refs)
              if (hasArch && hasModules && hasInterface) {
                expect(result.status).toBe("pass")
              } else {
                expect(result.status).toBe("fail")
              }
              // Should NOT check requirement references in design-first mode
              expect(result.blocking_issues.every(i => !i.includes("需求编号"))).toBe(true)
            }
          } finally {
            await rm(localDir, { recursive: true, force: true })
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

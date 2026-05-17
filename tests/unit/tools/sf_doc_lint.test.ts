import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  lintDocument,
  hasHeading,
  hasTaskBreakdownContent,
  getTaskSections,
  hasVerificationCommands,
  hasStandardizedMarkers,
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

### REQ-1 用户登录

Requirements here.
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(1)
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
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(3)
    })

    it("should fail when file does not exist", async () => {
      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("error")
      expect(result.issues[0].message).toContain("File not found")
    })

    it("should pass V6 architecture boundary validation in requirements", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界，以便在后续需求讨论中迅速拒绝超出范围的提案，避免范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力，并把每项写入"不做边界"章节：
   - LLM Provider 层。
   - IDE / 编辑器插件。
   - 多租户协作。
   - 云服务。
   - 自动化部署 DevOps。
   - LLM 评估 / 微调。
2. WHEN 后续模块 spec 或 ADR 中出现上述 6 项的实现计划，THE Review_Process SHALL 判定该 spec 或 ADR 需先修改本文档的"不做边界"章节后方可继续。
3. THE Requirements_Document SHALL 声明 V5 遗留概念全部保留但重新组织位置（下沉到 Daemon 内部或作为扩展），不在 V6.0 删除任何 V5 既有语义。

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   - Skill 是否被调用。
   - Workflow 是否按预期执行。
   - Workflow 执行结果偏离预期。
3. THE Requirements_Document SHALL 在 REQ-27 的质量门槛章节显式把"10 类场景在 5 分钟内定位根因"列为 V6.0 发版必过项。
4. WHEN 某类排障场景无法在 5 分钟内定位根因，THE Observability_Subsystem SHALL 被判定为不满足 V6.0 质量门槛。

### REQ-1: 产品定位与核心设计原则

**User Story:** 作为 SpecForge 架构决策者，我希望 V6 的产品定位和核心设计原则被明确地落在权威文档中，以便所有后续模块的决策都有统一的判准。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail V6 architecture boundary validation in requirements when missing REQ-2", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力：
   - LLM Provider 层。
   - IDE / 编辑器插件。
   - 多租户协作。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_boundary")).toBe(true)
    })

    it("should fail V6 architecture boundary validation in requirements when wrong number of boundaries", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界，以便在后续需求讨论中迅速拒绝超出范围的提案，避免范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力，并把每项写入"不做边界"章节：
   - LLM Provider 层。
   - IDE / 编辑器插件。
   - 多租户协作。
   - 云服务。
   - 自动化部署 DevOps。
   // Missing LLM 评估 / 微调 - only 5 boundaries
2. WHEN 后续模块 spec 或 ADR 中出现上述 6 项的实现计划，THE Review_Process SHALL 判定该 spec 或 ADR 需先修改本文档的"不做边界"章节后方可继续。
3. THE Requirements_Document SHALL 声明 V5 遗留概念全部保留但重新组织位置（下沉到 Daemon 内部或作为扩展），不在 V6.0 删除任何 V5 既有语义。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_boundary")).toBe(true)
    })

    it("should fail V6 architecture north star validation in requirements when missing REQ-3", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })

    it("should fail V6 architecture north star validation in requirements when missing north star goal", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   - Skill 是否被调用。
   - Workflow 是否按预期执行。
   - Workflow 执行结果偏离预期。
2. THE Requirements_Document SHALL 在 REQ-27 的质量门槛章节显式把"10 类场景在 5 分钟内定位根因"列为 V6.0 发版必过项。
3. WHEN 某类排障场景无法在 5 分钟内定位根因，THE Observability_Subsystem SHALL 被判定为不满足 V6.0 质量门槛。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })

    it("should fail V6 architecture north star validation in requirements when wrong number of scenarios", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   // Missing 3 scenarios: Skill 是否被调用、Workflow 是否按预期执行、Workflow 执行结果偏离预期
3. THE Requirements_Document SHALL 在 REQ-27 的质量门槛章节显式把"10 类场景在 5 分钟内定位根因"列为 V6.0 发版必过项。
4. WHEN 某类排障场景无法在 5 分钟内定位根因，THE Observability_Subsystem SHALL 被判定为不满足 V6.0 质量门槛。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })

    it("should fail V6 architecture north star validation in requirements when missing specific scenarios", async () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   - Skill 是否被调用。
   - Workflow 是否按预期执行。
   - 其他未定义场景。
3. THE Requirements_Document SHALL 在 REQ-27 的质量门槛章节显式把"10 类场景在 5 分钟内定位根因"列为 V6.0 发版必过项。
4. WHEN 某类排障场景无法在 5 分钟内定位根因，THE Observability_Subsystem SHALL 被判定为不满足 V6.0 质量门槛。
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })
  })

  describe("design lint", () => {
    it("should pass when design sections exist and no task breakdown", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### DD-1 核心模块设计

Core module design.

## 接口

API interface definitions.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should pass V6 architecture design principles validation", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### 北极星目标（对齐 REQ-3）

**5 分钟内从发生问题定位到根因**，覆盖 10 类排障场景（Gate 反复失败、Agent 偏离 prompt、Tool 调用错误、权限拒绝、升级 / 安装失败、状态机卡住、并发死锁、Skill 是否被调用、Workflow 是否按预期执行、Workflow 执行结果偏离预期）。

此目标在 REQ-27 门槛 2 作为 V6.0 发版必过项；Observability 子系统的一切设计围绕该目标展开。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail V6 architecture design principles validation when missing principles", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
// Missing principles 4 and 5

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_principle")).toBe(true)
    })

    it("should fail V6 architecture design principles validation when wrong order", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_principle")).toBe(true)
    })

    it("should fail V6 architecture design principles validation when wrong text", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **Something different**：This is not the correct principle.
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_principle")).toBe(true)
    })

    it("should fail V6 architecture boundary validation when missing boundary section", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_boundary")).toBe(true)
    })

    it("should fail V6 architecture boundary validation when wrong number of boundaries", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps。
// Only 5 boundaries, missing LLM 评估 / 微调

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_or_reordered_boundary")).toBe(true)
    })

    it("should fail V6 architecture north star validation in design when missing north star section", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })

    it("should fail V6 architecture north star validation in design when missing north star goal", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### 北极星目标（对齐 REQ-3）

覆盖 10 类排障场景（Gate 反复失败、Agent 偏离 prompt、Tool 调用错误、权限拒绝、升级 / 安装失败、状态机卡住、并发死锁、Skill 是否被调用、Workflow 是否按预期执行、Workflow 执行结果偏离预期）。

此目标在 REQ-27 门槛 2 作为 V6.0 发版必过项；Observability 子系统的一切设计围绕该目标展开。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
    })

    it("should fail V6 architecture north star validation in design when missing scenarios", async () => {
      const content = `# 设计文档

## 架构

System architecture description.

### 核心设计原则（对齐 REQ-1.2）

1. **Daemon 是唯一的 Source of Truth**：任何组件都不得绕过 Daemon 修改权威状态。
2. **SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为**：OpenCode 的 plugin hook、事件 schema、tool 参数变化被 Adapter 层吸收，不得泄漏到 Daemon 核心。
3. **程序硬控优先于 Prompt 控制（继承 V5）**：能在代码里以 Gate / Permission / schema 硬约束的规则，不交给 prompt。
4. **可观测性是一级组件，不是附加能力**：Event Bus、CAS、事件日志从 day-1 就是核心，不是"后期再接监控"。
5. **扩展性优先于完备性**：V6.0 先把 Adapter、Skill、Tool、Workflow、Gate、Config 的扩展点定死，再逐步补完内置实现。

### 北极星目标（对齐 REQ-3）

**5 分钟内从发生问题定位到根因**，覆盖 8 类排障场景（Gate 反复失败、Agent 偏离 prompt、Tool 调用错误、权限拒绝、升级 / 安装失败、状态机卡住、并发死锁、Skill 是否被调用）。

此目标在 REQ-27 门槛 2 作为 V6.0 发版必过项；Observability 子系统的一切设计围绕该目标展开。

### V6 不做边界（对齐 REQ-2、REQ-26）

**架构层**：LLM Provider 层、IDE / 编辑器插件、多租户协作、云服务、自动化部署 DevOps、LLM 评估 / 微调。

**版本层（V6.0 内不做）**：V5→V6 数据迁移工具、国际化、Web UI（V6.0 内）、多租户 / 云服务、Telegram 直接集成（改由 OpenClaw 桥接）。

### DD-1 核心模块设计

Core module design.
`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)

      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_north_star")).toBe(true)
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

## Task 1: Setup

Content 1

## Task 2: Implementation

Content 2
`
      const sections = getTaskSections(content)
      expect(sections).toHaveLength(2)
      expect(sections[0].title).toBe("Task 1: Setup")
      expect(sections[1].title).toBe("Task 2: Implementation")
    })

    it("should extract Chinese task headings", () => {
      const content = `# 任务列表

## 任务 1: 初始化

内容 1

## 任务 2: 实现

内容 2
`
      const sections = getTaskSections(content)
      expect(sections).toHaveLength(2)
      expect(sections[0].title).toBe("任务 1: 初始化")
      expect(sections[1].title).toBe("任务 2: 实现")
    })

    it("should ignore non-task headings like 任务依赖图", () => {
      const content = `# 任务列表

## 概述

一些概述内容

## Task 1: Setup

Content 1

## 任务依赖图

依赖关系

## 备注

一些备注
`
      const sections = getTaskSections(content)
      expect(sections).toHaveLength(1)
      expect(sections[0].title).toBe("Task 1: Setup")
    })

    it("should return empty array when no task headings", () => {
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

  describe("standardized marker format warnings", () => {
    it("should not warn when requirements uses REQ-N format", async () => {
      const content = `# 需求文档\n\n## 简介\n\nIntro.\n\n## 术语表\n\nTerms.\n\n## 需求\n\n### REQ-1 用户登录\n\nDesc.\n`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should not warn when requirements uses legacy 需求 N format", async () => {
      const content = `# 需求文档\n\n## 简介\n\nIntro.\n\n## 术语表\n\nTerms.\n\n## 需求\n\n### 需求 1 用户登录\n\nDesc.\n`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should warn when requirements has no recognizable markers", async () => {
      const content = `# 需求文档\n\n## 简介\n\nIntro.\n\n## 术语表\n\nTerms.\n\n## 需求\n\n### 用户登录功能\n\nDesc.\n`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "requirements", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("warning")
      expect(result.issues[0].message).toContain("REQ-N")
    })

    it("should not warn when design uses DD-N format", async () => {
      const content = `# 设计文档\n\n## 架构\n\nArch.\n\n### DD-1 数据模型\n\nModel.\n`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should not warn when design uses legacy numbered sections", async () => {
      const content = `# 设计文档\n\n## 架构\n\nArch.\n\n### 3.1 数据模型设计\n\nModel.\n`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should warn when design has no recognizable markers", async () => {
      const content = `# 设计文档\n\n## 架构\n\nArch.\n\n### 数据模型设计\n\nModel.\n`
      await writeFile(join(specDir, "design.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "design", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe("warning")
      expect(result.issues[0].message).toContain("DD-N")
    })

    it("should not warn when tasks uses TASK-N format", async () => {
      const content = `# 任务列表\n\n### TASK-1 实现核心\n\nverification_commands:\n- bun test\n`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should not warn when tasks uses legacy Task N format", async () => {
      const content = `# 任务列表\n\n## Task 1: 实现核心\n\nverification_commands:\n- bun test\n`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
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

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { lintDocument } from "../../../.opencode/tools/lib/sf_doc_lint_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_doc_lint V6 debug", () => {
  const testDir = join(tmpdir(), `specforge-doc-lint-debug-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("debug V6 architecture design principles", async () => {
    const content = `# 设计文档

## 架构

SpecForge V6 架构文档。

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
    
    console.log("Result status:", result.status)
    console.log("Issues:", JSON.stringify(result.issues, null, 2))
    
    expect(result.status).toBe("pass")
  })
})
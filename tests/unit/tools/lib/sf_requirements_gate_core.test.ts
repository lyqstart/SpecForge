/**
 * Unit tests for sf_requirements_gate_core KG sync integration (V4.0)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { checkRequirementsGate } from "../../../../.opencode/tools/lib/sf_requirements_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_requirements_gate_core - KG sync integration", () => {
  const testDir = join(tmpdir(), `specforge-req-gate-kg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-KG-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")
  const knowledgeDir = join(testDir, "specforge", "knowledge")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await mkdir(knowledgeDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  const validRequirementsContent = `# 需求文档

## 用户故事

作为用户，我希望能够登录系统。

## 验收标准

- 用户可以使用邮箱登录

## 术语表

| 术语 | 定义 |
|------|------|
| API | 应用程序接口 |

### 需求 1 登录功能

用户可以登录。

### 需求 2 注册功能

用户可以注册。
`

  describe("Gate pass + KG enabled + sync succeeds", () => {
    it("should return kg_sync field with summary when KG is enabled and sync succeeds", async () => {
      // Setup: KG enabled
      await writeFile(
        join(configDir, "project.json"),
        JSON.stringify({ knowledge_graph_enabled: true }),
        "utf-8"
      )
      // Setup: valid requirements.md with parseable requirements
      await writeFile(join(specDir, "requirements.md"), validRequirementsContent, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.kg_sync).toBeDefined()
      expect(result.kg_sync).not.toBeNull()
      expect(result.kg_sync!.nodes_added).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Gate pass + KG enabled + sync fails", () => {
    it("should still pass with warning when KG sync fails", async () => {
      // Setup: KG enabled
      await writeFile(
        join(configDir, "project.json"),
        JSON.stringify({ knowledge_graph_enabled: true }),
        "utf-8"
      )
      // Setup: valid requirements.md
      await writeFile(join(specDir, "requirements.md"), validRequirementsContent, "utf-8")
      // Setup: corrupt graph.json to cause sync failure
      await writeFile(join(knowledgeDir, "graph.json"), "not valid json{{{", "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.warnings.some(w => w.includes("KG sync"))).toBe(true)
    })
  })

  describe("Gate pass + KG disabled", () => {
    it("should pass without kg_sync field when KG is disabled", async () => {
      // Setup: KG disabled
      await writeFile(
        join(configDir, "project.json"),
        JSON.stringify({ knowledge_graph_enabled: false }),
        "utf-8"
      )
      // Setup: valid requirements.md
      await writeFile(join(specDir, "requirements.md"), validRequirementsContent, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.kg_sync).toBeNull()
    })
  })
})

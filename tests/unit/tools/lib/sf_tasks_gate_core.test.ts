/**
 * Unit tests for sf_tasks_gate_core KG sync integration (V4.0)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkTasksGate } from "../../../../.opencode/tools/lib/sf_tasks_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_tasks_gate_core - KG sync integration", () => {
  const testDir = join(tmpdir(), `specforge-tasks-gate-kg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-KG-003"
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

  const validTasksContent = `# 任务列表

## Task 1: 实现核心功能

实现基础功能模块。

- 修改文件: \`src/core.ts\`
- verification_commands: \`bun test\`

## Task 2: 编写测试

编写单元测试。

- 修改文件: \`tests/core.test.ts\`
- verification_commands: \`bun test\`
`

  describe("Gate pass + KG enabled + sync succeeds", () => {
    it("should return kg_sync field with summary when KG is enabled and sync succeeds", async () => {
      // Setup: KG enabled
      await writeFile(
        join(configDir, "project.json"),
        JSON.stringify({ knowledge_graph_enabled: true }),
        "utf-8"
      )
      // Setup: valid tasks.md
      await writeFile(join(specDir, "tasks.md"), validTasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

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
      // Setup: valid tasks.md
      await writeFile(join(specDir, "tasks.md"), validTasksContent, "utf-8")
      // Setup: corrupt graph.json to cause sync failure
      await writeFile(join(knowledgeDir, "graph.json"), "not valid json{{{", "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

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
      // Setup: valid tasks.md
      await writeFile(join(specDir, "tasks.md"), validTasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.kg_sync).toBeNull()
    })
  })
})

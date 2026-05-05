/**
 * Unit tests for sf_verification_gate_core KG sync integration (V4.0)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkVerificationGate } from "../../../../.opencode/tools/lib/sf_verification_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_verification_gate_core - KG sync integration", () => {
  const testDir = join(tmpdir(), `specforge-verif-gate-kg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-KG-004"
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

  const validVerificationContent = `# 验证报告

## 单元测试结果

All tests passed ✅

## 端到端测试结果

e2e tests: 5 passed, 0 failed

## 总结

所有测试通过，功能验证完成。
`

  describe("Gate pass + KG enabled + sync succeeds", () => {
    it("should return kg_sync field with summary when KG is enabled and sync succeeds", async () => {
      // Setup: KG enabled
      await writeFile(
        join(configDir, "project.json"),
        JSON.stringify({ knowledge_graph_enabled: true }),
        "utf-8"
      )
      // Setup: valid verification report
      await writeFile(join(specDir, "verification_report.md"), validVerificationContent, "utf-8")
      // Setup: spec files for syncFromSpec to parse (verification scope syncs all)
      await writeFile(join(specDir, "requirements.md"), `# 需求\n\n### 需求 1 功能A\n\n描述`, "utf-8")
      await writeFile(join(specDir, "design.md"), `# 设计\n\n## 3.1 架构\n\n基于需求 1`, "utf-8")
      await writeFile(join(specDir, "tasks.md"), `# 任务\n\n## Task 1: 实现\n\n- 修改文件: \`src/a.ts\`\n- verification_commands: \`bun test\``, "utf-8")

      const result = await checkVerificationGate(workItemId, testDir)

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
      // Setup: valid verification report
      await writeFile(join(specDir, "verification_report.md"), validVerificationContent, "utf-8")
      // Setup: corrupt graph.json to cause sync failure
      await writeFile(join(knowledgeDir, "graph.json"), "not valid json{{{", "utf-8")

      const result = await checkVerificationGate(workItemId, testDir)

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
      // Setup: valid verification report
      await writeFile(join(specDir, "verification_report.md"), validVerificationContent, "utf-8")

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.kg_sync).toBeNull()
    })
  })
})

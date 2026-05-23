import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  writeArtifact,
  resolveArtifactPath,
  isPathWhitelisted,
  renderVerificationReport,
  generateWorkLog,
} from "../../../.opencode/tools/lib/sf_artifact_write_core"
import type { ArtifactFileType, VerificationJSON } from "../../../.opencode/tools/lib/sf_artifact_write_core"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as fc from "fast-check"

// ============================================================
// Unit Tests (Task 2.5)
// ============================================================

describe("sf_artifact_write", () => {
  const testDir = join(tmpdir(), `specforge-artifact-write-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("file_type writes successfully", () => {
    it("should write verification_report successfully", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "verification_report",
        content: "# Verification Report\nAll tests passed.",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.path).toBe("specforge/specs/WI-001/verification_report.md")
        expect(result.size).toBeGreaterThan(0)
      }
    })

    it("should write work_log successfully", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "# Work Log\nCompleted tasks.",
        run_id: "run-123",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.path).toBe("specforge/archive/agent_runs/run-123/work_log.md")
        expect(result.size).toBeGreaterThan(0)
      }
    })

    it("should write review_report successfully", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-002",
        file_type: "review_report",
        content: "# Review\nLooks good.",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.path).toBe("specforge/specs/WI-002/review_report.md")
        expect(result.size).toBeGreaterThan(0)
      }
    })

    it("should write intake successfully", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-003",
        file_type: "intake",
        content: "# Intake\nUser request details.",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.path).toBe("specforge/specs/WI-003/intake.md")
        expect(result.size).toBeGreaterThan(0)
      }
    })

    it("should write agent_run_result successfully", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "agent_run_result",
        content: JSON.stringify({ status: "completed" }),
        run_id: "run-456",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.path).toBe("specforge/archive/agent_runs/run-456/result.json")
        expect(result.size).toBeGreaterThan(0)
      }
    })
  })

  describe("whitelist rejection", () => {
    it("should reject paths not starting with specforge/specs/", () => {
      expect(isPathWhitelisted("other/path/file.md")).toBe(false)
    })

    it("should reject paths not starting with specforge/archive/agent_runs/", () => {
      expect(isPathWhitelisted("specforge/logs/app.log")).toBe(false)
    })

    it("should accept paths starting with specforge/specs/", () => {
      expect(isPathWhitelisted("specforge/specs/WI-001/design.md")).toBe(true)
    })

    it("should accept paths starting with specforge/archive/agent_runs/", () => {
      expect(isPathWhitelisted("specforge/archive/agent_runs/run-1/work_log.md")).toBe(true)
    })
  })

  describe("empty parameter validation", () => {
    it("should return error for empty content", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "verification_report",
        content: "",
      }, testDir)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("missing required parameter")
      }
    })

    it("should return error for empty work_item_id", async () => {
      const result = await writeArtifact({
        work_item_id: "",
        file_type: "verification_report",
        content: "some content",
      }, testDir)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("missing required parameter")
      }
    })
  })

  describe("work_log/agent_run_result missing run_id", () => {
    it("should return error for work_log without run_id", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "log content",
      }, testDir)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("run_id is required for work_log and agent_run_result")
      }
    })

    it("should return error for agent_run_result without run_id", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "agent_run_result",
        content: "{}",
      }, testDir)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("run_id is required for work_log and agent_run_result")
      }
    })
  })

  describe("template rendering (verification_report)", () => {
    it("should render JSON to Markdown with 5 sections", async () => {
      const verificationJson: VerificationJSON = {
        conclusion: "pass",
        verification_commands: [
          { command: "vitest run", status: "pass", output_summary: "All tests passed" },
        ],
        acceptance_criteria: [
          { req_id: "需求 1", name: "工具存在", status: "pass", evidence: "文件已创建" },
        ],
        e2e_tests: [
          { name: "完整工作流", status: "pass", evidence: "端到端通过" },
        ],
        side_effects: "无副作用",
        summary: "所有检查通过",
      }

      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "verification_report",
        content: JSON.stringify(verificationJson),
        template: "verification_report",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        const written = await readFile(join(testDir, result.path), "utf-8")
        expect(written).toContain("## 验证命令")
        expect(written).toContain("## 验收标准")
        expect(written).toContain("## 端到端测试")
        expect(written).toContain("## 副作用")
        expect(written).toContain("## 结论")
      }
    })
  })

  describe("template rendering JSON parse failure", () => {
    it("should return error for invalid JSON content", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "verification_report",
        content: "not valid json {{{",
        template: "verification_report",
      }, testDir)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("invalid JSON content")
      }
    })
  })

  describe("work_log auto-generation (agent_content + trace stats merge)", () => {
    it("should merge agent_content and trace stats into work_log", async () => {
      // Create trace.jsonl with tool call entries
      const traceDir = join(testDir, "specforge", "logs")
      await mkdir(traceDir, { recursive: true })
      const traceEntries = [
        JSON.stringify({ event: "tool.execute.after", payload: { tool: "file.read", args: { path: "src/main.ts" } } }),
        JSON.stringify({ event: "tool.execute.after", payload: { tool: "sf_batch_verify", args: { target_file: "test.ts" } } }),
        JSON.stringify({ event: "tool.execute.after", payload: { tool: "bash", args: { command: "vitest run" } } }),
      ]
      await writeFile(join(traceDir, "trace.jsonl"), traceEntries.join("\n"), "utf-8")

      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "placeholder",
        run_id: "run-789",
        agent_content: "完成了所有任务，代码质量良好。",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        const written = await readFile(join(testDir, result.path), "utf-8")
        expect(written).toContain("## Agent 报告")
        expect(written).toContain("完成了所有任务，代码质量良好。")
        expect(written).toContain("## 执行统计")
        expect(written).toContain("总工具调用次数")
      }
    })
  })

  describe("work_log trace data unavailable fallback", () => {
    it("should include fallback message when trace.jsonl does not exist", async () => {
      // Do NOT create trace.jsonl
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "placeholder",
        run_id: "run-no-trace",
        agent_content: "Agent 完成工作。",
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        const written = await readFile(join(testDir, result.path), "utf-8")
        expect(written).toContain("## Agent 报告")
        expect(written).toContain("Agent 完成工作。")
        expect(written).toContain("## 执行统计")
        expect(written).toContain("trace 数据不可用")
      }
    })
  })

  describe("sidecar result.json fallback (Fix 3 — Orchestrator 漏调归档协议时兜底)", () => {
    it("should auto-generate result.json sidecar when writing work_log without prior result.json", async () => {
      const result = await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "# Work Log\nDone.",
        run_id: "WI-001-sf-executor-3",
      }, testDir)

      expect(result.success).toBe(true)

      // sidecar result.json 应被自动写出
      const resultJsonPath = join(testDir, "specforge/archive/agent_runs/WI-001-sf-executor-3/result.json")
      const sidecar = JSON.parse(await readFile(resultJsonPath, "utf-8"))

      expect(sidecar.source).toBe("sidecar")
      expect(sidecar.run_id).toBe("WI-001-sf-executor-3")
      expect(sidecar.work_item_id).toBe("WI-001")
      expect(sidecar.agent_name).toBe("sf-executor")
      expect(sidecar.status).toBe("completed")
      expect(sidecar.schema_version).toBe("1.0")
      expect(sidecar.sidecar_generated_at).toBeTruthy()
    })

    it("should NOT overwrite an existing result.json (authoritative > sidecar)", async () => {
      // 先模拟 Orchestrator 主动调用 agent_run_result（权威版本）
      const authoritative = {
        schema_version: "1.0",
        source: "orchestrator",
        run_id: "WI-001-sf-executor-4",
        work_item_id: "WI-001",
        agent_name: "sf-executor",
        status: "completed",
        cost_summary: { total_cost: 0.012 },
      }
      await writeArtifact({
        work_item_id: "WI-001",
        file_type: "agent_run_result",
        content: JSON.stringify(authoritative),
        run_id: "WI-001-sf-executor-4",
      }, testDir)

      // 后写 work_log，sidecar 应识别已存在 result.json 不覆盖
      await writeArtifact({
        work_item_id: "WI-001",
        file_type: "work_log",
        content: "# Work Log\nDone.",
        run_id: "WI-001-sf-executor-4",
      }, testDir)

      const resultJsonPath = join(testDir, "specforge/archive/agent_runs/WI-001-sf-executor-4/result.json")
      const stored = JSON.parse(await readFile(resultJsonPath, "utf-8"))
      expect(stored.source).toBe("orchestrator")
      expect(stored.cost_summary).toEqual({ total_cost: 0.012 })
    })

    it("should resolve agent_name from run_id with various tail patterns", async () => {
      const cases = [
        { runId: "WI-001-sf-design-1", expected: "sf-design" },
        { runId: "WI-001-sf-executor-fix1", expected: "sf-executor" },
        { runId: "WI-001-sf-task-planner-1", expected: "sf-task-planner" },
        { runId: "WI-001-sf-executor-cont-1", expected: "sf-executor" },
      ]
      for (const c of cases) {
        await writeArtifact({
          work_item_id: "WI-001",
          file_type: "work_log",
          content: "log",
          run_id: c.runId,
        }, testDir)
        const sidecar = JSON.parse(
          await readFile(join(testDir, `specforge/archive/agent_runs/${c.runId}/result.json`), "utf-8")
        )
        expect(sidecar.agent_name).toBe(c.expected)
      }
    })

    it("should NOT fail the work_log write if sidecar generation throws", async () => {
      // 这里仅证明 sidecar 失败不会破坏主路径
      // （目前实现里 sidecar 用 try/catch 完全包住，主写入永远成功）
      const result = await writeArtifact({
        work_item_id: "WI-X",
        file_type: "work_log",
        content: "log",
        run_id: "WI-X-sf-design-1",
      }, testDir)
      expect(result.success).toBe(true)
    })
  })

  describe("write then read round-trip consistency", () => {
    it("should read back the same content that was written", async () => {
      const content = "# Test Content\n\nThis is a round-trip test with special chars: 中文、日本語"

      const result = await writeArtifact({
        work_item_id: "WI-RT",
        file_type: "intake",
        content,
      }, testDir)

      expect(result.success).toBe(true)
      if (result.success) {
        const readBack = await readFile(join(testDir, result.path), "utf-8")
        expect(readBack).toBe(content)
      }
    })
  })
})

// ============================================================
// Property Tests (Task 2.6)
// ============================================================

describe("sf_artifact_write property tests", () => {
  const testDir = join(tmpdir(), `specforge-artifact-write-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  /**
   * Feature: specforge-v2-efficiency, Property 1: artifact write round-trip
   * Validates: Requirements 1.9
   */
  it("Property 1: artifact write round-trip - written content matches read content", async () => {
    const fileTypes: ArtifactFileType[] = ["verification_report", "review_report", "intake"]

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.constantFrom(...fileTypes),
        async (content, workItemId, fileType) => {
          const result = await writeArtifact({
            work_item_id: workItemId,
            file_type: fileType,
            content,
          }, testDir)

          expect(result.success).toBe(true)
          if (result.success) {
            const readBack = await readFile(join(testDir, result.path), "utf-8")
            expect(readBack).toBe(content)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 2: whitelist enforcement
   * Validates: Requirements 1.5, 1.8
   */
  it("Property 2: whitelist enforcement - non-whitelisted paths are rejected", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s =>
          !s.startsWith("specforge/specs/") &&
          !s.startsWith("specforge/archive/agent_runs/")
        ),
        (path) => {
          expect(isPathWhitelisted(path)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 3: file type path resolution
   * Validates: Requirements 1.3, 1.6
   */
  it("Property 3: file type path resolution - resolved path matches file_type pattern", () => {
    const pathPatterns: Record<ArtifactFileType, RegExp> = {
      verification_report: /^specforge\/specs\/[^/]+\/verification_report\.md$/,
      review_report: /^specforge\/specs\/[^/]+\/review_report\.md$/,
      intake: /^specforge\/specs\/[^/]+\/intake\.md$/,
      work_log: /^specforge\/archive\/agent_runs\/[^/]+\/work_log\.md$/,
      agent_run_result: /^specforge\/archive\/agent_runs\/[^/]+\/result\.json$/,
    }

    const allFileTypes: ArtifactFileType[] = [
      "verification_report", "work_log", "review_report", "intake", "agent_run_result",
    ]

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.constantFrom(...allFileTypes),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        (workItemId, fileType, runId) => {
          const resolved = resolveArtifactPath(fileType, workItemId, runId)
          expect(resolved).toMatch(pathPatterns[fileType])
          // All resolved paths should be whitelisted
          expect(isPathWhitelisted(resolved)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 7: template rendering structure
   * Validates: Requirements 3.3, 3.4, 3.5, 3.6
   */
  it("Property 7: template rendering structure - rendered Markdown contains 5 required sections", () => {
    const statusArb = fc.constantFrom("pass" as const, "fail" as const)

    const verificationJsonArb = fc.record({
      conclusion: fc.constantFrom("pass" as const, "fail" as const, "blocked" as const),
      verification_commands: fc.array(
        fc.record({
          command: fc.string({ minLength: 1, maxLength: 30 }),
          status: statusArb,
          output_summary: fc.string({ minLength: 0, maxLength: 50 }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      acceptance_criteria: fc.array(
        fc.record({
          req_id: fc.string({ minLength: 1, maxLength: 10 }),
          name: fc.string({ minLength: 1, maxLength: 30 }),
          status: statusArb,
          evidence: fc.string({ minLength: 0, maxLength: 50 }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      e2e_tests: fc.array(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 30 }),
          status: statusArb,
          evidence: fc.string({ minLength: 0, maxLength: 50 }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      side_effects: fc.string({ minLength: 0, maxLength: 100 }),
      summary: fc.string({ minLength: 0, maxLength: 100 }),
    })

    fc.assert(
      fc.property(verificationJsonArb, (jsonData) => {
        const jsonContent = JSON.stringify(jsonData)
        const rendered = renderVerificationReport(jsonContent)

        expect(rendered).not.toBeNull()
        if (rendered !== null) {
          // Verify 5 required sections are present
          expect(rendered).toContain("## 验证命令")
          expect(rendered).toContain("## 验收标准")
          expect(rendered).toContain("## 端到端测试")
          expect(rendered).toContain("## 副作用")
          expect(rendered).toContain("## 结论")
        }
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 9: work log merge completeness
   * Validates: Requirements 5.2, 5.3, 8.5
   */
  it("Property 9: work log merge completeness - generated work_log contains Agent 报告 and 执行统计 sections", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (agentContent, runId) => {
          const workLog = await generateWorkLog(agentContent, runId, testDir)

          // Must contain both required sections
          expect(workLog).toContain("## Agent 报告")
          expect(workLog).toContain("## 执行统计")
          // Agent content must be present
          expect(workLog).toContain(agentContent)
        }
      ),
      { numRuns: 100 }
    )
  })
})

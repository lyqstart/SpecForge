/**
 * Property-based tests for Gate mode dispatch correctness
 *
 * **Validates: Requirements 11.1, 11.2, 11.4, 11.5**
 *
 * Property 10: For any (gate_type, mode, document_content), Gate returns pass iff
 * all required sections present and pass conditions met; no mode = V3.5 behavior
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import {
  checkRequirementsGate,
  parseSections,
  REQUIREMENTS_GATE_SPECS,
  type RequirementsGateMode,
} from "../../.opencode/tools/lib/sf_requirements_gate_core"
import {
  checkDesignGate,
  DESIGN_GATE_SPECS,
  type DesignGateMode,
} from "../../.opencode/tools/lib/sf_design_gate_core"
import {
  checkVerificationGate,
  VERIFICATION_GATE_SPECS,
  type VerificationGateMode,
} from "../../.opencode/tools/lib/sf_verification_gate_core"

// ============================================================
// Test Fixtures
// ============================================================

let testBaseDir: string
const TEST_WORK_ITEM_ID = "WI-GATE-MODE-TEST"

beforeEach(() => {
  testBaseDir = join(tmpdir(), `specforge-gate-mode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const specDir = join(testBaseDir, "specforge", "specs", TEST_WORK_ITEM_ID)
  mkdirSync(specDir, { recursive: true })

  // Create manifest with supported schema_version for compatibility check
  const manifestDir = join(testBaseDir, "specforge")
  writeFileSync(
    join(manifestDir, "manifest.json"),
    JSON.stringify({ schema_version: "1.0", installed_at: new Date().toISOString() })
  )
})

afterEach(() => {
  try {
    rmSync(testBaseDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
})

// ============================================================
// Helpers
// ============================================================

/**
 * Generate a markdown document with specified sections
 */
function generateMarkdownWithSections(sections: Record<string, string>): string {
  let doc = "# Test Document\n\n"
  for (const [name, content] of Object.entries(sections)) {
    doc += `## ${name}\n\n${content}\n\n`
  }
  return doc
}

/**
 * Write a file in the spec directory
 */
function writeSpecFile(fileName: string, content: string): void {
  const specDir = join(testBaseDir, "specforge", "specs", TEST_WORK_ITEM_ID)
  writeFileSync(join(specDir, fileName), content)
}

/**
 * Arbitrary for non-empty section content (at least 20 chars to pass content checks)
 */
const arbSectionContent = fc.string({ minLength: 20, maxLength: 200 }).map((s) => s || "This is valid content for the section that passes checks")

/**
 * Arbitrary for empty or whitespace-only content
 */
const arbEmptyContent = fc.constantFrom("", " ", "\n", "\t", "  \n  ")

// ============================================================
// Property 10: Gate mode dispatch correctness
// ============================================================

describe("Property 10: Gate mode dispatch correctness", () => {
  describe("Requirements Gate mode dispatch", () => {
    const reqModes: RequirementsGateMode[] = ["change_request", "refactor", "investigation"]
    const arbReqMode = fc.constantFrom(...reqModes)

    it("returns pass when all required sections are present and non-empty with valid content", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbReqMode,
          async (mode) => {
            const spec = REQUIREMENTS_GATE_SPECS.find((s) => s.mode === mode)!
            // Build a document with all required sections filled
            const sections: Record<string, string> = {}
            for (const sectionName of spec.requiredSections) {
              if (sectionName === "风险评估") {
                sections[sectionName] = "高"
              } else if (sectionName === "不变行为声明") {
                sections[sectionName] = "所有现有 API 接口的输入输出行为保持不变，不影响外部调用方"
              } else {
                sections[sectionName] = "这是一段有效的内容，用于满足 section 非空检查要求。包含足够的详细信息。"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("pass")
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when any required section is missing", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbReqMode,
          fc.nat(),
          async (mode, sectionIdxSeed) => {
            const spec = REQUIREMENTS_GATE_SPECS.find((s) => s.mode === mode)!
            // Remove one section
            const missingIdx = sectionIdxSeed % spec.requiredSections.length
            const sections: Record<string, string> = {}
            for (let i = 0; i < spec.requiredSections.length; i++) {
              if (i === missingIdx) continue // skip this section
              const sectionName = spec.requiredSections[i]
              if (sectionName === "风险评估") {
                sections[sectionName] = "高"
              } else if (sectionName === "不变行为声明") {
                sections[sectionName] = "所有现有 API 接口的输入输出行为保持不变"
              } else {
                sections[sectionName] = "有效内容，满足非空检查要求。"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("Missing section"))).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when target file does not exist", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbReqMode,
          async (mode) => {
            // Don't write any file
            const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("File not found"))).toBe(true)
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe("Design Gate mode dispatch", () => {
    const designModes: DesignGateMode[] = ["change_request", "ops_task", "refactor", "investigation"]
    const arbDesignMode = fc.constantFrom(...designModes)

    it("returns pass when all required sections are present and pass conditions met", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDesignMode,
          async (mode) => {
            const spec = DESIGN_GATE_SPECS.find((s) => s.mode === mode)!
            const sections: Record<string, string> = {}
            for (const sectionName of spec.requiredSections) {
              if (sectionName === "操作步骤") {
                sections[sectionName] = "1. 备份数据库\n2. 执行迁移脚本\n3. 验证数据完整性"
              } else if (sectionName === "回滚方案") {
                sections[sectionName] = "1. 恢复数据库备份\n2. 回退迁移脚本\n3. 验证回退结果"
              } else if (sectionName === "回滚触发条件") {
                sections[sectionName] = "当迁移后数据校验失败或服务健康检查不通过时触发回滚"
              } else if (sectionName === "数据和证据") {
                sections[sectionName] = "通过性能测试数据表明，当前方案在 P99 延迟上优于基线方案 30%，测试覆盖了 1000 个并发请求场景"
              } else if (sectionName === "建议") {
                sections[sectionName] = "建议采用方案 A 进行实施，具体步骤包括：1. 部署新版本 2. 灰度发布 3. 全量切换"
              } else {
                sections[sectionName] = "这是一段有效的内容，用于满足 section 非空检查要求。包含足够的详细信息来通过检查。"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, { mode })
            expect(result.status).toBe("pass")
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when any required section is missing", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDesignMode,
          fc.nat(),
          async (mode, sectionIdxSeed) => {
            const spec = DESIGN_GATE_SPECS.find((s) => s.mode === mode)!
            const missingIdx = sectionIdxSeed % spec.requiredSections.length
            const sections: Record<string, string> = {}
            for (let i = 0; i < spec.requiredSections.length; i++) {
              if (i === missingIdx) continue
              const sectionName = spec.requiredSections[i]
              if (sectionName === "操作步骤") {
                sections[sectionName] = "1. 步骤一\n2. 步骤二"
              } else if (sectionName === "回滚方案") {
                sections[sectionName] = "1. 回滚步骤一\n2. 回滚步骤二"
              } else if (sectionName === "回滚触发条件") {
                sections[sectionName] = "当健康检查失败时触发回滚"
              } else if (sectionName === "数据和证据") {
                sections[sectionName] = "性能测试数据表明方案可行，覆盖了多种场景"
              } else if (sectionName === "建议") {
                sections[sectionName] = "建议采用方案 A，具体步骤如下..."
              } else {
                sections[sectionName] = "有效内容，满足非空检查要求。"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("Missing section"))).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when target file does not exist", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDesignMode,
          async (mode) => {
            const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("File not found"))).toBe(true)
          }
        ),
        { numRuns: 20 }
      )
    })

    it("ops_task mode fails when rollback does not cover all steps", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat({ max: 5 }).filter((n) => n >= 2),
          async (stepCount) => {
            const steps = Array.from({ length: stepCount }, (_, i) => `${i + 1}. 操作步骤 ${i + 1}`).join("\n")
            // Only provide 1 rollback item (less than steps)
            const sections: Record<string, string> = {
              "操作目标": "完成数据库迁移",
              "前置条件": "数据库备份已完成",
              "操作步骤": steps,
              "回滚方案": "1. 恢复备份",
              "回滚触发条件": "当健康检查失败时触发",
              "风险评估": "中等风险",
              "影响范围": "生产环境数据库",
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile("ops_plan.md", content)

            const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, { mode: "ops_task" })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("回滚方案未覆盖"))).toBe(true)
          }
        ),
        { numRuns: 20 }
      )
    })

    it("investigation mode fails when evidence is insufficient", async () => {
      const sections: Record<string, string> = {
        "调查结论": "经过调查，方案 A 是最优选择",
        "数据和证据": "少",
        "建议": "建议采用方案 A 进行实施，具体步骤包括部署和验证",
        "限制": "时间有限，未能覆盖所有场景",
      }
      const content = generateMarkdownWithSections(sections)
      writeSpecFile("findings_report.md", content)

      const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, { mode: "investigation" })
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("数据和证据"))).toBe(true)
    })
  })

  describe("Verification Gate mode dispatch", () => {
    const verModes: VerificationGateMode[] = ["refactor", "ops_task", "change_request"]
    const arbVerMode = fc.constantFrom(...verModes)

    it("returns pass when all required sections are present and pass conditions met", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVerMode,
          async (mode) => {
            const spec = VERIFICATION_GATE_SPECS.find((s) => s.mode === mode)!
            const sections: Record<string, string> = {}
            for (const sectionName of spec.requiredSections) {
              if (sectionName === "测试结果") {
                sections[sectionName] = "All 150 tests passed ✅\nNo regressions detected"
              } else if (sectionName === "代码质量改善") {
                sections[sectionName] = "圈复杂度从 15 降低到 8，代码行数减少 20%"
              } else if (sectionName === "操作结果") {
                sections[sectionName] = "数据库迁移成功完成，所有表结构已更新"
              } else if (sectionName === "预期结果对比") {
                sections[sectionName] = "所有操作结果与 ops_plan.md 预期一致，健康检查通过"
              } else if (sectionName === "回归测试覆盖") {
                sections[sectionName] = "回归测试覆盖了所有受影响的 API 端点和数据流"
              } else if (sectionName === "受影响区域验证") {
                sections[sectionName] = "用户认证模块、订单处理模块均已验证通过"
              } else {
                sections[sectionName] = "有效内容，满足非空检查要求。"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("pass")
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when any required section is missing", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVerMode,
          fc.nat(),
          async (mode, sectionIdxSeed) => {
            const spec = VERIFICATION_GATE_SPECS.find((s) => s.mode === mode)!
            const missingIdx = sectionIdxSeed % spec.requiredSections.length
            const sections: Record<string, string> = {}
            for (let i = 0; i < spec.requiredSections.length; i++) {
              if (i === missingIdx) continue
              const sectionName = spec.requiredSections[i]
              if (sectionName === "测试结果") {
                sections[sectionName] = "All tests passed ✅"
              } else if (sectionName === "代码质量改善") {
                sections[sectionName] = "复杂度降低"
              } else if (sectionName === "操作结果") {
                sections[sectionName] = "操作成功"
              } else if (sectionName === "预期结果对比") {
                sections[sectionName] = "结果一致"
              } else if (sectionName === "回归测试覆盖") {
                sections[sectionName] = "已覆盖"
              } else if (sectionName === "受影响区域验证") {
                sections[sectionName] = "已验证"
              } else {
                sections[sectionName] = "有效内容"
              }
            }
            const content = generateMarkdownWithSections(sections)
            writeSpecFile(spec.targetFile, content)

            const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("Missing section"))).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("returns fail when target file does not exist", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVerMode,
          async (mode) => {
            const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, { mode })
            expect(result.status).toBe("fail")
            expect(result.blocking_issues.some((i) => i.includes("File not found"))).toBe(true)
          }
        ),
        { numRuns: 20 }
      )
    })

    it("refactor mode fails when tests have failures", async () => {
      const sections: Record<string, string> = {
        "测试结果": "148 tests passed, 2 tests FAILED ❌\nFailure in auth.test.ts",
        "代码质量改善": "圈复杂度降低",
      }
      const content = generateMarkdownWithSections(sections)
      writeSpecFile("verification_report.md", content)

      const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, { mode: "refactor" })
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("失败的测试"))).toBe(true)
    })

    it("ops_task mode fails when results mismatch expected", async () => {
      const sections: Record<string, string> = {
        "操作结果": "数据库迁移完成",
        "预期结果对比": "表 users 的结构与预期不匹配，缺少 email_verified 列",
      }
      const content = generateMarkdownWithSections(sections)
      writeSpecFile("verification_report.md", content)

      const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, { mode: "ops_task" })
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("不一致"))).toBe(true)
    })
  })

  describe("Backward compatibility: no mode = V3.5 behavior", () => {
    it("Requirements Gate without mode checks requirements.md (existing behavior)", async () => {
      // Write a valid requirements.md
      const content = `# 需求文档

## 用户故事

作为开发者，我希望能够快速创建项目。

## 验收标准

1. 项目创建成功
2. 目录结构正确

## 术语表

- SpecForge: 项目管理工具
`
      writeSpecFile("requirements.md", content)

      const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir)
      expect(result.status).toBe("pass")
    })

    it("Requirements Gate without mode fails when requirements.md missing", async () => {
      const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir)
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("requirements.md not found"))).toBe(true)
    })

    it("Design Gate without mode checks design.md for requirement references", async () => {
      // Write a valid design.md with requirement references
      const content = `# 设计文档

## 架构

本设计实现需求 1 和需求 2 的功能。

refs: [REQ-1, REQ-2]
`
      writeSpecFile("design.md", content)

      const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir)
      expect(result.status).toBe("pass")
    })

    it("Design Gate without mode fails when design.md missing", async () => {
      const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir)
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("design.md not found"))).toBe(true)
    })

    it("Verification Gate without mode checks for verification files", async () => {
      const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir)
      // Without verification files, should fail
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some((i) => i.includes("验证结果文件"))).toBe(true)
    })
  })

  describe("Unknown mode handling", () => {
    it("Requirements Gate with unknown mode returns fail with warning", async () => {
      const result = await checkRequirementsGate(TEST_WORK_ITEM_ID, testBaseDir, {
        mode: "unknown_mode" as RequirementsGateMode,
      })
      expect(result.status).toBe("fail")
      expect(result.warnings.some((w) => w.includes("Unsupported mode"))).toBe(true)
    })

    it("Design Gate with unknown mode returns fail with warning", async () => {
      const result = await checkDesignGate(TEST_WORK_ITEM_ID, testBaseDir, undefined, {
        mode: "unknown_mode" as DesignGateMode,
      })
      expect(result.status).toBe("fail")
      expect(result.warnings.some((w) => w.includes("Unsupported mode"))).toBe(true)
    })

    it("Verification Gate with unknown mode returns fail with warning", async () => {
      const result = await checkVerificationGate(TEST_WORK_ITEM_ID, testBaseDir, {
        mode: "unknown_mode" as VerificationGateMode,
      })
      expect(result.status).toBe("fail")
      expect(result.warnings.some((w) => w.includes("Unsupported mode"))).toBe(true)
    })
  })

  describe("parseSections correctness", () => {
    it("correctly extracts sections from markdown with ## headings", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(
            fc.string({ minLength: 2, maxLength: 20 }).filter((s) => !s.includes("#") && !s.includes("\n")),
            fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes("#"))
          ), { minLength: 1, maxLength: 5 }),
          (sectionPairs) => {
            // Build markdown
            let md = "# Document\n\n"
            const expectedSections: Record<string, string> = {}
            for (const [name, content] of sectionPairs) {
              md += `## ${name}\n\n${content}\n\n`
              expectedSections[name] = content
            }

            const sectionNames = sectionPairs.map(([name]) => name)
            const parsed = parseSections(md, sectionNames)

            for (const name of sectionNames) {
              // parseSections should find non-empty content for each section
              expect(parsed[name]?.trim()).toBe(expectedSections[name].trim())
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("returns empty string for sections not found in document", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => !s.includes("#") && !s.includes("\n")),
          (sectionName) => {
            const md = "# Document\n\nSome content without any sections.\n"
            const parsed = parseSections(md, [sectionName])
            expect(parsed[sectionName]).toBe("")
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})

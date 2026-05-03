import { readStateFile } from "./.opencode/tools/lib/sf_state_read_core"
import { executeTransition } from "./.opencode/tools/lib/sf_state_transition_core"
import { lintDocument } from "./.opencode/tools/lib/sf_doc_lint_core"
import { checkRequirementsGate } from "./.opencode/tools/lib/sf_requirements_gate_core"
import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const baseDir = process.cwd()

async function test() {
  console.log("=== 1: 读取初始状态 (all) ===")
  let r = await readStateFile("all", baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 2: 创建 WI-1 ===")
  r = await executeTransition({ work_item_id: "WI-1", from_state: "", to_state: "intake", evidence: "test", workflow_type: "feature_spec" }, baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 3: 读取 WI-1 ===")
  r = await readStateFile("WI-1", baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 4: intake→requirements (合法) ===")
  r = await executeTransition({ work_item_id: "WI-1", from_state: "intake", to_state: "requirements", evidence: "done" }, baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 5: requirements→development (非法，应拒绝) ===")
  r = await executeTransition({ work_item_id: "WI-1", from_state: "requirements", to_state: "development", evidence: "skip" }, baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 6: 状态不一致 (from=intake, 实际=requirements) ===")
  r = await executeTransition({ work_item_id: "WI-1", from_state: "intake", to_state: "requirements_gate" }, baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 7: requirements→requirements_gate (合法) ===")
  r = await executeTransition({ work_item_id: "WI-1", from_state: "requirements", to_state: "requirements_gate", evidence: "req done" }, baseDir)
  console.log(JSON.stringify(r, null, 2))

  // 创建测试用的 requirements.md
  const specDir = join(baseDir, "specforge/specs/WI-1")
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, "requirements.md"), `# 需求文档\n\n## 简介\n测试\n\n## 术语表\n- 计算器\n\n## 需求\n\n### 需求 1\n用户故事：作为用户我希望...\n\n#### 验收标准\n1. THE system SHALL...`)

  console.log("\n=== 8: sf_doc_lint (requirements) ===")
  r = await lintDocument("WI-1", "requirements", baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 9: sf_requirements_gate ===")
  r = await checkRequirementsGate("WI-1", baseDir)
  console.log(JSON.stringify(r, null, 2))

  // 测试缺少章节的文档
  writeFileSync(join(specDir, "requirements_bad.md"), `# 需求文档\n\n## 简介\n测试\n\n没有术语表和需求章节`)
  console.log("\n=== 10: sf_doc_lint (缺少章节) ===")
  // 临时替换文件名测试
  const { renameSync } = require("fs")
  renameSync(join(specDir, "requirements.md"), join(specDir, "requirements_good.md"))
  renameSync(join(specDir, "requirements_bad.md"), join(specDir, "requirements.md"))
  r = await lintDocument("WI-1", "requirements", baseDir)
  console.log(JSON.stringify(r, null, 2))
  r = await checkRequirementsGate("WI-1", baseDir)
  console.log(JSON.stringify(r, null, 2))

  console.log("\n=== 11: events.jsonl 完整记录 ===")
  console.log(readFileSync(join(baseDir, "specforge/runtime/events.jsonl"), "utf-8"))

  console.log("\n=== 12: state.json 最终状态 ===")
  console.log(readFileSync(join(baseDir, "specforge/runtime/state.json"), "utf-8"))
}

test().catch(console.error)

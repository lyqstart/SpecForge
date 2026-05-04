# SpecForge V2.0 需求文档

> 基于 V1 的 9 轮测试（第 1~9 轮）总结的架构改进需求。
> V1 的 prompt 优化已到极限，以下需求需要机制层面的改动。
> 完整版本路线图见 `specforge/ROADMAP.md`。

---

## 1. sf_artifact_write 工具（新增 Custom Tool）

**问题根因：** sf-verifier 和 sf-reviewer 的 permission.edit = deny（只读角色），但任务要求它们写 verification_report.md 和 work_log.md。当前只能用 bash 绕过，导致 PowerShell/Python 转义问题、多次重试、产物污染风险。

**需求：**
- 新增 `sf_artifact_write` Custom Tool
- 参数：`work_item_id`、`file_type`（verification_report / work_log / review_report）、`content`（字符串）
- 只允许写入白名单路径：
  - `specforge/specs/<work_item_id>/verification_report.md`
  - `specforge/archive/agent_runs/<run_id>/work_log.md`
  - `specforge/specs/<work_item_id>/review_report.md`
- 禁止写入业务代码文件
- 返回值包含：`{ success: true, path: "...", size: N }`

**预期效果：**
- 消除 bash 写文件的转义问题
- 消除 PowerShell/Python 方式选择的试错时间
- 产物写入从 2-5 次 bash 降到 1 次工具调用

---

## 2. sf_batch_verify 工具（新增 Custom Tool）

**问题根因：** sf-verifier 每次都要现场生成批量验证 Python 脚本，模型花 37-43 秒生成脚本，还经常遇到转义问题。

**需求：**
- 新增 `sf_batch_verify` Custom Tool
- 参数：`work_item_id`、`target_file`（要验证的文件路径）、`checks`（检查项数组）
- 每个检查项：`{ name, pattern, should_exist, type: "present|absent|count" }`
- 工具内部用 Node.js/Bun 执行正则匹配，返回结构化结果
- 返回值：`{ total, passed, failed, results: [{ name, status, found }] }`

**预期效果：**
- 消除模型现场生成验证脚本的时间（节省 ~120 秒）
- 消除 PowerShell 转义问题
- 验证从 5-6 次 bash 降到 1 次工具调用

---

## 3. verification_report 模板化渲染

**问题根因：** sf-verifier 现场"创作"长篇 Markdown 报告，模型花 63 秒生成报告内容。

**需求：**
- sf-verifier 只返回结构化 JSON 结果给 Orchestrator
- Orchestrator 或 sf_artifact_write 工具负责将 JSON 渲染为 Markdown 报告
- JSON 格式：
  ```json
  {
    "conclusion": "pass",
    "checks": [{ "id": "VC-1", "name": "...", "status": "pass", "evidence": "..." }],
    "acceptance_criteria": [{ "req_id": "REQ-001", "status": "pass" }],
    "e2e": [{ "name": "...", "status": "pass" }],
    "side_effects": "none"
  }
  ```

**预期效果：**
- 消除 63 秒报告创作时间
- 报告格式统一，gate 检查更可靠

---

## 4. work_log 由 Orchestrator 自动生成

**问题根因：** Agent 自报的 toolcall 统计不可信（第 9 轮自报 11 次，实际 16 次）。

**需求：**
- work_log.md 的以下字段由 Orchestrator 从 trace 自动生成：
  - toolcall 统计（read/write/bash/grep/skill 各多少次）
  - 总耗时
  - 产物文件列表
- Agent 只需要提供：任务摘要、执行过程描述、遇到的问题、最终结论
- Orchestrator 在子 Agent 完成后合并两部分，写入 work_log.md

**预期效果：**
- toolcall 统计 100% 准确
- 消除 Agent 写 work_log 的 1-2 次 bash 调用

---

## 5. Gate 结果结构化记录

**问题根因：** sf_verification_gate 等 Gate 工具的 result_preview 在 plugin hook 中为空（OpenCode 平台限制），导致 gate fail 原因只能从后续 prompt 倒推。

**需求：**
- Gate 工具在 events.jsonl 中记录结构化结果：
  ```json
  {
    "type": "gate_result",
    "gate": "sf_verification_gate",
    "status": "fail",
    "blocking_issues": [{ "code": "MISSING_E2E_SECTION", "message": "..." }]
  }
  ```
- 即使 OpenCode 的 result_preview 为空，我们自己的 events.jsonl 要有完整记录

**预期效果：**
- gate fail 原因可从日志直接判定，不需要猜

---

## 6. Design-First 工作流测试

**说明：** V1 实现了 feature_spec_design_first 工作流但未测试。V2 需要补充测试。

---

## 7. 会话恢复测试

**说明：** V1 实现了会话恢复机制但未测试。V2 需要补充测试。

---

## 8. Quick Change 效率目标

**V2 目标：**

| 指标 | V1 实际 | V2 目标 |
|------|---------|---------|
| sf-verifier toolcalls | 16 | ≤ 8 |
| verification 阶段耗时 | 5m | ≤ 90s |
| Quick Change 总耗时 | 8m | ≤ 4m |
| report 写入次数 | 2-5 | 1 |
| work_log 统计准确性 | 不可信 | 100% |

---

## 优先级排序

| 优先级 | 需求 | 理由 |
|--------|------|------|
| P0 | sf_artifact_write 工具 | 解决只读 Agent 写文件的架构矛盾 |
| P0 | sf_batch_verify 工具 | 消除验证脚本现场生成的时间浪费 |
| P1 | verification_report 模板化 | 消除报告创作时间 |
| P1 | Gate 结果结构化记录 | 提升日志可审计性 |
| P2 | work_log 自动生成 | 提升统计准确性 |
| P2 | Design-First 测试 | 补充测试覆盖 |
| P2 | 会话恢复测试 | 补充测试覆盖 |

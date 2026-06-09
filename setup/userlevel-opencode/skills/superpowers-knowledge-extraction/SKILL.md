# superpowers-knowledge-extraction

> 知识提取框架流程 — sf-knowledge Agent 必须严格按以下 6 个 Phase 顺序执行。

## 框架流程

### Phase 1：证据盘点

明确列出本次复盘的信息来源清单：

| 数据源 | 路径 | 内容 |
|--------|------|------|
| 主 Agent 会话 | `.specforge/sessions/{session_id}/conversation.jsonl` | 完整会话（含 tool 调用、AI 推理、用户输入） |
| 子 Agent 会话 | `.specforge/sessions/{sub_session_id}/conversation.jsonl` | 通过 metadata.json 的 parent_session_id 关联 |
| 状态流转事件 | `.specforge/runtime/events.jsonl` | 状态流转 + Gate 结果 |
| 子 Agent 执行结果 | `.specforge/work-items/{work_item_id}/evidence/result.json` | 成功/失败/错误类型 |
| 文件变更 | `.specforge/work-items/{work_item_id}/evidence/files_changed.json` | 变更列表 |
| 工作日志 | `.specforge/work-items/{work_item_id}/evidence/work_log.md` | 执行过程记录 |
| 需求文档 | `.specforge/work-items/{work_item_id}/candidates/requirements.md` | 需求 |
| 设计文档 | `.specforge/work-items/{work_item_id}/candidates/design.md` | 设计 |
| 任务文档 | `.specforge/work-items/{work_item_id}/candidates/tasks.md` | 任务 |
| Knowledge Graph | `.specforge/knowledge/graph.json` | 关系追溯 |
| 运行痕迹 | `.specforge/logs/trace.jsonl` | 完整 trace |
| Gate 日志 | `.specforge/logs/gate.log` | Gate 调用记录 |

**评估证据强度：**
- 轻量（仅有会话记录，无失败事件）→ 快速扫描，仅提取设计决策
- 标准（有 Gate 失败或 executor 重试）→ 完整分析
- 强证据（有 debugger 介入或多次返工）→ 深度分析，重点关注根因

### Phase 2：关键事件识别

从证据中识别以下类型的关键事件：

1. **Gate 失败→修复循环**：哪个 Gate 失败了？失败原因？怎么修复的？
2. **Executor 重试**：为什么第一次失败？第二次怎么成功的？
3. **Debugger 介入**：什么问题触发了 debugger？怎么解决的？
4. **Review 发现的问题**：reviewer 指出了什么？怎么修复的？
5. **设计决策**：为什么选择方案 A 而不是方案 B？
6. **用户反馈导致的返工**：用户不满意什么？怎么调整的？

**输出 JSON Schema：**

```json
{
  "events": [
    {
      "type": "gate_failure | executor_retry | debugger_intervention | review_issue | design_decision | user_rework",
      "description": "事件描述",
      "evidence_refs": ["文件路径或事件 ID"]
    }
  ]
}
```

### Phase 3：根因分析

对每个关键事件执行三层分析：

| 层次 | 问题 | 示例 |
|------|------|------|
| 表象 | 发生了什么？ | "executor 写的 server.mjs 启动后立即退出" |
| 直接原因 | 为什么发生？ | "没有处理 EADDRINUSE 错误，端口被占用时静默失败" |
| 机制性根因 | 什么结构性问题导致这类事件可能反复发生？ | "Node.js 网络服务如果不显式处理启动错误，默认行为是静默失败" |

### Phase 4：泛化 + 边界检查

对每个有价值的根因执行泛化：

- **Step 1：识别具体事件** — "WI-001 的 executor 在写 server.mjs 时忘了加 error handling"
- **Step 2：提取机制性根因** — "Node.js HTTP 服务器如果不处理 EADDRINUSE 错误会静默失败"
- **Step 3：泛化为通用规则** — "任何网络服务启动时必须处理端口占用错误"
- **Step 4：反例检查** — 列举至少 1 个"看似适用但实际不适用"的反例场景（填入 `anti_conditions`）
- **Step 5：适用边界声明** — 明确"只适用于哪些场景"（填入 `applicability`），包括技术栈、运行环境、前提条件

**泛化判断标准：**
- 仅适用于当前项目 → **不提取**（跳过）
- 适用于同类技术栈 → 提取为 `stack_experience`
- 适用于所有项目 → 提取为 `failure_pattern` 或 `checklist`

**输出 JSON Schema：**

```json
{
  "generalizations": [
    {
      "specific_event": "具体事件描述",
      "root_cause": "机制性根因",
      "general_rule": "泛化后的通用规则",
      "anti_conditions": ["反例场景1", "反例场景2"],
      "applicability": "适用边界描述（技术栈/环境/前提条件）"
    }
  ]
}
```

### Phase 5：知识条目生成

为每个泛化结果生成结构化知识条目。

**置信度硬规则：**

| 等级 | 判定条件 |
|------|----------|
| **high** | 需同时满足：有明确失败事件 + 有修复证据 + 修复后验证通过 + 可泛化到其他项目 + 与已有知识无冲突 |
| **medium** | 有证据支撑但泛化有限（如仅适用于特定技术栈），或缺少验证通过证据 |
| **low** | 基于推测、单一现象、无修复证据、或泛化路径不清晰 |

**去重规则：**

1. 生成 `normalized_key`（格式 `<category>:<核心动作短语>`），与全局知识库已有条目精确比对
2. 检查适用范围重叠：`applicable_file_patterns` 交集 ≥ 50% 且 `tags` 交集 ≥ 2 → 潜在重复
3. 对潜在重复条目，合并为已有条目的更新版本（递增 version），而非新增

使用 `sf_knowledge_base` 工具的 `check_duplicate` 操作执行去重检测。

**输出 JSON Schema：**

```json
{
  "entries": [
    {
      "title": "≤100 字符的通用标题",
      "content": "≤2000 字符的详细内容",
      "category": "failure_pattern | modification_pattern | stack_experience | workflow_tip | checklist",
      "tags": ["关键词标签"],
      "applicable_file_patterns": ["*.ts"],
      "confidence": "high | medium | low",
      "anti_conditions": ["不适用条件"],
      "applicability": "适用边界描述",
      "normalized_key": "<category>:<核心动作短语>"
    }
  ]
}
```

### Phase 6：质量自检

检查每个知识条目是否满足以下标准：

| 检查项 | 标准 | 不通过时处理 |
|--------|------|-------------|
| 标题通用性 | 不含项目特定名称（如 WI-001、specforge） | 重写标题 |
| 可操作性 | 有明确的预防/检测/修复步骤 | 补充步骤或降低置信度 |
| 适用范围 | file_patterns 和 tags 明确 | 补充或标记为 low confidence |
| 跨项目可复用 | 不是项目特例 | 跳过，不入库 |
| 敏感信息 | content/title 中无密钥、token、密码、内部 URL | 脱敏处理（替换为 `<REDACTED>`） |

**敏感信息扫描模式：**
- API Key / Secret：`[A-Za-z0-9_-]{20,}` 且上下文含 key/secret/token
- 密码：`password\s*[:=]\s*\S+`
- 内部 URL：`https?://[^/]*\.(internal|local|corp)\b`
- 环境变量值：`[A-Z_]+=\S{10,}`

发现敏感信息时替换为 `<REDACTED>` 后再入库。

## 质量标准总结

一个合格的知识条目必须：
1. 标题通用（不含项目特定名称）
2. 内容可操作（有明确步骤）
3. 适用范围清晰（file_patterns + tags）
4. 跨项目可复用（不是项目特例）
5. 无敏感信息泄露

## 复盘报告

提取完成后生成 Retro_Report，保存到 `.specforge/archive/retro/{work_item_id}/retro_report.md`。

报告结构：
```markdown
# 复盘报告 — {work_item_id}

## 概要
- 证据强度：轻量/标准/强
- 关键事件数：N
- 提取知识条目数：M
- 置信度分布：high=X, medium=Y, low=Z

## 关键事件
[Phase 2 输出]

## 根因分析
[Phase 3 输出]

## 提取的知识条目
[Phase 5 输出摘要]

## 跳过的候选
[未通过 Phase 6 质量自检的条目及原因]
```

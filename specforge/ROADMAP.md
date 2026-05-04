# SpecForge 版本路线图

> 基于 v0.5 工程化总体方案 + 9 轮测试反馈制定。

---

## 已完成

### V1 MVP
- 15/15 项全部实现
- 8 个 Agent + 7 个 Custom Tool + 1 个 Plugin + 2 个 Skill
- Feature Spec Requirements-First 工作流
- 第 1-4 轮测试验证

### V1 Complete
- 10/10 项全部实现（2 项未测试：Design-First、会话恢复）
- 新增：3 种工作流状态机、sf_trace_matrix、sf_permission_guard、sf_checkpoint
- 新增：5 个 Superpowers Skill、Agent Run Archive
- 第 5-9 轮测试验证
- 263 个单元测试

---

## V1.1（补充测试 + 文档）

| 任务 | 状态 |
|------|------|
| Design-First 工作流测试 | 待做 |
| 会话恢复测试 | 待做 |
| 更新 README.md | 待做 |

---

## V2.0（效率版）

**目标：** 解决 verifier 效率问题和只读 Agent 写文件的架构矛盾。

| # | 需求 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | sf_artifact_write 工具 | P0 | 只读 Agent 写白名单路径的产物文件 |
| 2 | sf_batch_verify 工具 | P0 | 批量正则验证，消除现场生成脚本 |
| 3 | verification_report 模板化 | P1 | verifier 返回 JSON，工具渲染 Markdown |
| 4 | Gate 结果结构化记录 | P1 | gate fail 原因写入 events.jsonl |
| 5 | work_log 由 Orchestrator 自动生成 | P2 | toolcall 统计从 trace 提取，不让 Agent 自报 |

**验收标准：**
- Quick Change 总耗时 ≤ 4 分钟
- sf-verifier toolcalls ≤ 8
- verification 阶段 ≤ 90 秒

---

## V2.1（工具版）

| # | 需求 | 说明 |
|---|------|------|
| 1 | install / upgrade / uninstall 命令 | 完善安装体系 |
| 2 | /sf-trace 调试命令 | 查看最近 N 条 trace |
| 3 | /sf-log 调试命令 | 查看指定日志文件 |
| 4 | /sf-cost 调试命令 | 查看 token 消耗统计 |

---

## V3.0（智能版）

| # | 需求 | 说明 |
|---|------|------|
| 1 | sf-retro-agent | 复盘 Agent，分析失败模式 |
| 2 | 复盘工作流 | retro 阶段，生成改进建议 |
| 3 | 知识候选与全局知识合并 | 从复盘中提取可复用知识 |
| 4 | 成本记录与审计 | token 消耗按 Agent/阶段统计 |

---

## V3.1（扩展版）

| # | 需求 | 说明 |
|---|------|------|
| 1 | change_request 工作流 | 变更请求流程 |
| 2 | refactor 工作流 | 重构流程 |
| 3 | ops_task 工作流 | 运维任务流程 |
| 4 | investigation 工作流 | 调查分析流程 |
| 5 | 并行任务控制 | 多 executor 并行执行 |
| 6 | Context Monitor | 上下文限制检测 |

---

## V4.0（平台版）

| # | 需求 | 说明 |
|---|------|------|
| 1 | Knowledge Graph | 需求→设计→任务→代码关系图 |
| 2 | Provider Fallback | 通过网关层实现模型切换 |
| 3 | Context Builder / Capability Broker | 按需加载上下文和能力 |

---

## V0.5 方案实现对照

| 范围 | 规划项数 | 已实现 | 未实现 | 完成率 |
|------|----------|--------|--------|--------|
| V1 MVP | 15 | 15 | 0 | 100% |
| V1 Complete | 10 | 10（2 未测试） | 0 | 100% |
| V2（原规划） | 11 | 0 | 11 | 0% |

V0.5 原规划的 V2（11 项）已拆分为 V2.0 ~ V4.0 四个版本，按优先级分批实现。

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
| Design-First 工作流测试 | ✅ 第 10 轮验证通过 |
| 会话恢复测试 | 待做（降级为 V2 补充测试） |
| 更新 README.md | 待做 |

---

## V2.0（效率版）

**目标：** 解决 verifier 效率问题和只读 Agent 写文件的架构矛盾。
**状态：** ✅ 完成（第 11-12 轮测试验证）

| # | 需求 | 状态 |
|---|------|------|
| 1 | sf_artifact_write 工具 | ✅ 完成 |
| 2 | sf_batch_verify 工具 | ✅ 完成 |
| 3 | verification_report 模板化 | ✅ 完成 |
| 4 | Gate 结果结构化记录 | ✅ 完成 |
| 5 | work_log 由工具自动生成 | ✅ 完成 |
| 6 | Design-First 专用 design_gate | ✅ 完成 |

**效果：**
- sf-verifier toolcalls：16 → 4-5（-69%）
- verifier bash 调用：12 → 0（-100%）
- 批量验证：Python 脚本 → sf_batch_verify
- 报告写入：bash/Python → sf_artifact_write

**已知限制（受模型响应速度制约）：**
- Quick Change 总耗时 6-8 分钟（目标 4 分钟，模型思考时间占主导）
- verification 阶段 90-150 秒（verifier 本身 45-65 秒，Orchestrator 后处理占余量）

---

## V2.1（工具版）

| # | 需求 | 说明 |
|---|------|------|
| 1 | install / upgrade / uninstall 命令 | 完善安装体系 |
| 2 | /sf-trace 调试命令 | 查看最近 N 条 trace |
| 3 | /sf-log 调试命令 | 查看指定日志文件 |
| 4 | /sf-cost 调试命令 | 查看 token 消耗统计 |

---

## V3.0（智能版 — 成本追踪）

**目标：** Token 消耗和成本追踪能力。
**状态：** ✅ 完成（第 13 轮测试验证）

| # | 需求 | 状态 |
|---|------|------|
| 1 | sf_cost_tracker Plugin | ✅ 完成 |
| 2 | sf_cost_report Custom Tool | ✅ 完成 |
| 3 | /sf-cost 命令 | ✅ 完成 |
| 4 | Agent Run Archive 成本集成 | ✅ 完成 |

**效果：**
- 自动捕获真实 Token 使用量（input/output/reasoning/cache）
- 支持按 Work Item / Agent / Phase / Model 四维度聚合
- 用户可通过"查看成本报告"获取成本摘要

**已知限制：**
- cost=$0 当模型未配置单价时（如 glm-5.1）
- work_item_id="unknown"（Plugin 无法获取 SpecForge 业务概念）

---

## V3.1（上下文压缩感知与会话记录版）

**目标：** 上下文压缩配置、压缩感知、完整会话记录。
**状态：** ✅ 完成（第 14-15 轮测试验证）

| # | 需求 | 状态 |
|---|------|------|
| 1 | OpenCode 压缩配置（compaction） | ✅ 完成 |
| 2 | sf_checkpoint 压缩上下文增强 | ✅ 完成 |
| 3 | 压缩事件记录与 Orchestrator 感知 | ✅ 完成 |
| 4 | 会话完整记录（sf_session_recorder Plugin） | ✅ 完成 |
| 5 | 向后兼容（424 个测试通过） | ✅ 完成 |

**效果：**
- 子 Agent 会话自动保存（task 工具完成时触发）
- 主 Agent 会话自动保存（session.idle 时触发）
- 保存到 specforge/sessions/{session_id}/（conversation.jsonl + metadata.json）
- 压缩前注入 SpecForge 业务上下文到压缩提示词
- 压缩事件记录到 events.jsonl

**已知限制：**
- 压缩功能未实际触发（17 轮测试中 token 消耗未达阈值）
- 跨会话续接推迟到 V3.4

---

## V3.2（Orchestrator Prompt 拆分版）

**目标：** 将 1369 行单体 sf-orchestrator.md 拆分为路由层 + 工作流 Skill。
**状态：** ✅ 完成（第 16 轮测试验证）

| # | 需求 | 状态 |
|---|------|------|
| 1 | sf-orchestrator.md 精简为路由层（≤400 行） | ✅ 完成（399 行） |
| 2 | sf-workflow-feature-spec Skill | ✅ 完成（204 行） |
| 3 | sf-workflow-bugfix-spec Skill | ✅ 完成（184 行） |
| 4 | sf-workflow-design-first Skill | ✅ 完成（218 行） |
| 5 | sf-workflow-quick-change Skill | ✅ 完成（158 行） |
| 6 | Skill 加载协议 | ✅ 完成 |
| 7 | 向后兼容（424 个测试通过） | ✅ 完成 |

**效果：**
- sf-orchestrator.md：1369 行 → 399 行（-71%）
- Skill 按需加载，总上下文量减少 55%
- AI 指令遵从性提升（Skill 加载协议正确执行）
- 新增工作流只需创建 Skill 文件 + 路由表加一行

---

## V3.3（并行任务控制版）

**目标：** development 阶段支持独立 Task 并行执行。
**状态：** ✅ 完成（第 17 轮测试验证）

| # | 需求 | 状态 |
|---|------|------|
| 1 | Task 独立性分析（Independence_Analysis） | ✅ 完成 |
| 2 | 并行调度协议（max_parallel_executors 可配置） | ✅ 完成 |
| 3 | 并行执行结果处理 | ✅ 完成 |
| 4 | 并行失败重试适配 | ✅ 完成 |
| 5 | Agent Run Archive 并行适配 | ✅ 完成 |
| 6 | 4 个 Workflow Skill 更新 | ✅ 完成 |
| 7 | 向后兼容与串行回退 | ✅ 完成 |
| 8 | 并行执行可观测性 | ✅ 完成 |

**效果：**
- Independence_Analysis 基于 files_to_modify 交集判断
- 独立 Task 在同一消息中并行调度（最大并行数可配置，默认 3）
- 文件冲突时自动回退串行（Serial_Fallback）
- result.json 新增 parallel_batch/parallel_peers 字段

**已知限制：**
- 并行实际触发待多文件项目验证（单文件项目所有 Task 修改同一文件，必然串行）

---

## V3.4（扩展版 — 新工作流 + 跨会话续接）

| # | 需求 | 说明 |
|---|------|------|
| 1 | 跨会话续接 | 子 Agent Session 压缩/耗尽后，提取关键上下文传递到新 Session 继续 |
| 2 | change_request 工作流 | 变更请求流程 |
| 3 | refactor 工作流 | 重构流程 |
| 4 | ops_task 工作流 | 运维任务流程 |
| 5 | investigation 工作流 | 调查分析流程 |

---

## V4.0（平台版）

**目标：** Knowledge Graph + Context Builder / Capability Broker（跳过 Provider Fallback）。

| # | 需求 | 说明 |
|---|------|------|
| 1 | Knowledge Graph 数据模型与存储 | 需求→设计→任务→代码关系图，JSON 文件持久化 |
| 2 | Knowledge Graph 读写工具 | sf_knowledge_graph Custom Tool，支持 CRUD 和 sync_from_spec |
| 3 | Knowledge Graph 查询与影响分析 | sf_knowledge_query Custom Tool，支持影响分析和路径追溯 |
| 4 | Knowledge Graph 自动维护协议 | Gate 工具内部自动同步 Graph（pass 时触发） |
| 5 | Context Builder 基础版 | sf_context_build Custom Tool，数据源：Knowledge Graph + Agent_Run_Archive（files_changed.json + result.json）。数据源接口可扩展，为 V5.0 知识库接入预留扩展点 |
| 6 | Capability Broker | 集成到 sf_context_build，Skill Fragment 按需提取和注入 |
| 7 | Orchestrator 调度协议更新 | 集成 Context Builder 到 4 个 Workflow Skill |
| 8 | Knowledge Graph 可视化查询 | /sf-graph 调试命令 |
| 9 | 向后兼容与测试完整性 | 424 个现有测试通过，Gate 工具保持输入输出契约不变 |

**已跳过：** Provider Fallback（通过网关层实现模型切换），推迟到后续版本。

---

## V5.0（知识积累闭环版）

**目标：** 基于 V3.1 的完整会话记录和 V4.0 的 Knowledge Graph，实现会话复盘→知识提取→知识库→智能检索的完整闭环。

| # | 需求 | 说明 |
|---|------|------|
| 1 | 会话复盘与分析工具 | 解析 specforge/sessions/ 下的 conversation.jsonl，对完整会话进行结构化分析（关键决策、错误模式、解决方案、执行路径） |
| 2 | 知识提取与分类 | 从会话分析结果中自动提取可复用的知识条目，按类别分类（修改模式、常见错误解决方案、框架最佳实践、文件类型特定经验等） |
| 3 | 知识库持久化存储 | 结构化知识库（如 specforge/knowledge/insights.json），支持知识条目的增删改查和版本管理 |
| 4 | 知识检索与匹配 | 根据 Task 特征（修改文件、任务描述、工作流阶段）从知识库中检索相关知识条目 |
| 5 | Context Builder 升级版 | 扩展 sf_context_build 的数据源，从 V4.0 的 Agent_Run_Archive 基本匹配升级为知识库语义检索，注入更精准的历史经验 |
| 6 | 知识质量管理 | 知识条目的有效性评估、过期清理、冲突检测 |

**与 V4.0 的关系：** V4.0 的 Context Builder 数据源接口设计为可扩展，V5.0 通过新增知识库数据源适配器接入，不需要重构 Context Builder 核心逻辑。

---

## V0.5 方案实现对照

| 范围 | 规划项数 | 已实现 | 未实现 | 完成率 |
|------|----------|--------|--------|--------|
| V1 MVP | 15 | 15 | 0 | 100% |
| V1 Complete | 10 | 10（2 未测试） | 0 | 100% |
| V2（原规划） | 11 | 0 | 11 | 0% |

V0.5 原规划的 V2（11 项）已拆分为 V2.0 ~ V4.0 四个版本，按优先级分批实现。

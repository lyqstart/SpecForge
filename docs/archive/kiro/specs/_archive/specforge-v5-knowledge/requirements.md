# 需求文档

## 简介

SpecForge V5.0（知识积累闭环版）基于 V3.1 的完整会话记录和 V4.0 的 Knowledge Graph，实现**会话复盘→知识提取→全局知识库→智能检索注入**的完整闭环。

核心理念：
- **自动化优先**：知识积累在后台静默进行，不打扰用户，仅关键决策时请求审核
- **从个例到一般**：通过结构化的泛化流程，将项目特定经验抽象为跨项目可复用的通用知识
- **应用为王**：知识的价值在于被精准检索和注入到正确的上下文中
- **跨项目复用**：全局知识库存储在用户级目录，所有项目自动共享

### 当前系统状态

- 9 个 Agent（1 个 primary + 7 个 subagent + 本次新增 1 个）→ V5.0 后为 10 个
- 15 个 Custom Tool
- 5 个 Plugin
- 11 个 Skill + 本次新增 1 个（superpowers-knowledge-extraction）
- 657 个单元测试
- V4.0 Knowledge Graph 已实现（graph.json、syncFromSpec、Context Builder）
- V3.1 会话记录已实现（specforge/sessions/{session_id}/conversation.jsonl + metadata.json）
- Context Builder 有 `ContextDataSource` 可扩展接口

### V5.0 核心问题

**问题 1：历史经验未被系统化利用**

V3.1 的 sf_session_recorder 将完整会话（主 Agent + 子 Agent）保存到 `specforge/sessions/`，但这些数据仅作为原始记录存在。会话中包含大量有价值的决策过程、错误排查路径、解决方案，但无法被后续任务自动检索和复用。

**问题 2：经验无法跨项目传递**

当前所有数据（会话记录、Agent Run Archive、Knowledge Graph）都是项目内的。开发者在项目 A 中积累的经验，在项目 B 中完全无法利用。

**问题 3：Context Builder 数据源有限**

V4.0 的 Context Builder 仅有两个数据源（Knowledge Graph 和 Agent_Run_Archive），匹配精度有限（仅基于文件路径交集），缺少基于任务语义特征的智能匹配。

### V5.0 设计原则

1. **自动化优先**：Work Item 完成后自动触发复盘和知识提取，无需用户操作
2. **AI 驱动的泛化**：知识提取由专门的 sf-knowledge Agent 执行，加载 superpowers-knowledge-extraction Skill 确保提取质量
3. **全局知识库**：存储在 `~/.config/opencode/specforge/knowledge/`，跨项目自动共享
4. **分类可扩展**：初始提供 5 个知识类别，支持用户自定义新类别
5. **置信度分级**：高置信度知识自动入库，低置信度标记为候选等待用户审核
6. **ContextDataSource 适配器接入**：通过 V4.0 预留的可扩展接口新增知识库数据源
7. **向后兼容**：所有变更保持与 V4.0 的向后兼容，657 个现有测试继续通过
8. **显式启用**：知识库功能通过配置项控制，默认关闭

## 术语表

- **sf-knowledge**：知识积累专用子 Agent（第 9 个子 Agent），负责会话复盘、知识提取、泛化抽象
- **Global_Knowledge_Store**：全局知识库，存储在 `~/.config/opencode/specforge/knowledge/insights.json`，跨项目共享
- **Knowledge_Entry**：知识条目，知识库中的最小单元
- **Knowledge_Category**：知识分类，可扩展的类别标签
- **superpowers-knowledge-extraction**：知识提取 Skill，定义 sf-knowledge Agent 的提取框架流程
- **Confidence_Level**：置信度等级（high / medium / low），决定知识条目是否自动入库
- **Generalization**：泛化，将项目特定经验抽象为跨项目通用知识的过程
- **Knowledge_DataSource**：知识库数据源适配器，实现 V4.0 的 `ContextDataSource` 接口
- **Retro_Report**：复盘报告，sf-knowledge Agent 对 Work Item 的结构化分析产物

## 需求

### REQ-1 sf-knowledge 子 Agent

**用户故事：** 作为 SpecForge 用户，我希望有一个专门的 Agent 负责知识积累工作，在后台自动完成复盘和知识提取，不打扰我的正常开发流程。

#### 验收标准

1. THE sf-knowledge Agent SHALL 定义在 `.opencode/agents/sf-knowledge.md`，mode 为 subagent，permission.task = deny，permission.edit = ask（仅通过 sf_knowledge_base Tool 写入知识库），permission.bash = allow
2. THE sf-knowledge Agent SHALL 由 Orchestrator 在 Work Item 状态流转到 `completed` 后自动调度，作为异步后处理步骤
3. THE sf-knowledge Agent 的执行失败 SHALL NOT 影响 Work Item 的 `completed` 状态，仅记录警告日志到 events.jsonl
4. THE sf-knowledge Agent SHALL 在执行时加载 `superpowers-knowledge-extraction` Skill，按照 Skill 定义的框架流程执行复盘和知识提取
5. THE sf-knowledge Agent SHALL 读取当前 Work Item 的所有相关数据源（详见 REQ-2 信息来源清单），生成复盘报告并提取知识条目
6. THE sf-knowledge Agent SHALL 将提取的知识条目写入全局知识库（Global_Knowledge_Store），高置信度条目状态为 `candidate`（仅限项目内可见），经用户确认后提升为 `active`（进入全局库跨项目共享）；低置信度条目标记为 `candidate` 状态等待审核
7. THE sf-knowledge Agent SHALL 在完成后向 Orchestrator 报告提取摘要：提取了多少条知识、多少条自动入库、多少条待审核
8. THE Orchestrator SHALL 将 sf-knowledge Agent 的提取摘要简要展示给用户（一行摘要），不要求用户做任何操作

### REQ-2 知识提取 Skill（superpowers-knowledge-extraction）

**用户故事：** 作为 SpecForge 维护者，我希望知识提取过程有一个标准化的框架流程（Skill），确保每次提取的质量一致，能可靠地从个例中抽象出通用知识。

#### 验收标准

1. THE superpowers-knowledge-extraction Skill SHALL 定义在 `.opencode/skills/superpowers-knowledge-extraction/SKILL.md`
2. THE Skill SHALL 定义以下框架流程（sf-knowledge Agent 必须按顺序执行）：

**Phase 1：证据盘点**
- 明确列出本次复盘的信息来源清单：
  - `specforge/sessions/{session_id}/conversation.jsonl` — 主 Agent 完整会话（含 tool 调用、AI 推理、用户输入）
  - `specforge/sessions/{sub_session_id}/conversation.jsonl` — 子 Agent 完整会话（通过 metadata.json 的 parent_session_id 关联）
  - `specforge/runtime/events.jsonl` — 状态流转事件 + Gate 结果
  - `specforge/archive/agent_runs/{run_id}/result.json` — 子 Agent 执行结果（成功/失败/错误类型）
  - `specforge/archive/agent_runs/{run_id}/files_changed.json` — 文件变更列表
  - `specforge/archive/agent_runs/{run_id}/work_log.md` — 工作日志
  - `specforge/specs/{work_item_id}/requirements.md` — 需求文档
  - `specforge/specs/{work_item_id}/design.md` — 设计文档
  - `specforge/specs/{work_item_id}/tasks.md` — 任务文档
  - `specforge/knowledge/graph.json` — Knowledge Graph（关系追溯）
  - `specforge/logs/trace.jsonl` — 完整运行痕迹
  - `specforge/logs/gate.log` — Gate 调用日志
- 评估证据强度（轻量/标准/强证据），决定复盘深度

**Phase 2：关键事件识别**
- 从证据中识别以下类型的关键事件：
  - Gate 失败→修复循环（哪个 Gate 失败了？失败原因？怎么修复的？）
  - Executor 重试（为什么第一次失败？第二次怎么成功的？）
  - Debugger 介入（什么问题触发了 debugger？怎么解决的？）
  - Review 发现的问题（reviewer 指出了什么？怎么修复的？）
  - 设计决策（为什么选择方案 A 而不是方案 B？）
  - 用户反馈导致的返工（用户不满意什么？怎么调整的？）

**Phase 3：根因分析**
- 对每个关键事件执行三层分析：
  - 表象：发生了什么
  - 直接原因：为什么发生
  - 机制性根因：什么结构性问题导致这类事件可能反复发生

**Phase 4：泛化三步法 + 边界检查**
- 对每个有价值的根因执行泛化：
  - Step 1：识别具体事件 — "WI-001 的 executor 在写 server.mjs 时忘了加 error handling"
  - Step 2：提取机制性根因 — "Node.js HTTP 服务器如果不处理 EADDRINUSE 错误会静默失败"
  - Step 3：泛化为通用规则 — "任何网络服务启动时必须处理端口占用错误"
  - Step 4：反例检查 — 列举至少 1 个"看似适用但实际不适用"的反例场景（填入 `anti_conditions`）
  - Step 5：适用边界声明 — 明确"只适用于哪些场景"（填入 `applicability`），包括技术栈、运行环境、前提条件
- 泛化判断标准：
  - 仅适用于当前项目 → 不提取（跳过）
  - 适用于同类技术栈 → 提取为 stack_experience
  - 适用于所有项目 → 提取为 failure_pattern 或 checklist

**Phase 5：知识条目生成**
- 为每个泛化结果生成结构化知识条目
- 评估置信度（high/medium/low），置信度硬规则：
  - **high**：需同时满足——有明确失败事件 + 有修复证据 + 修复后验证通过 + 可泛化到其他项目 + 与已有知识无冲突
  - **medium**：有证据支撑但泛化有限（如仅适用于特定技术栈），或缺少验证通过证据
  - **low**：基于推测、单一现象、无修复证据、或泛化路径不清晰
- 去重检测：
  - Step 1：生成 `normalized_key`（格式 `<category>:<核心动作短语>`），与全局知识库已有条目的 normalized_key 精确比对
  - Step 2：检查适用范围重叠——若 `applicable_file_patterns` 交集 ≥ 50% 且 `tags` 交集 ≥ 2，判定为潜在重复
  - Step 3：对潜在重复条目，合并为已有条目的更新版本（递增 version），而非新增
  - 注：语义相似度匹配留 V5.1（需 embedding 支持）

**Phase 6：质量自检**
- 检查每个知识条目是否满足：
  - 标题是否通用（不含项目特定名称）
  - 内容是否可操作（有明确的预防/检测/修复步骤）
  - 适用范围是否明确（file_patterns、tags）
  - 是否真的跨项目可复用（不是项目特例）
  - 敏感信息扫描：检查 content、title 中是否包含密钥、token、密码、内部 URL 等敏感信息，发现则脱敏处理（替换为 `<REDACTED>`）后再入库

3. THE Skill SHALL 定义知识条目的质量标准：不含项目特定名称、有明确的可操作步骤、适用范围清晰、跨项目可复用
4. THE Skill SHALL 要求 sf-knowledge Agent 在提取完成后生成复盘报告（Retro_Report），保存到 `specforge/archive/retro/{work_item_id}/retro_report.md`
5. THE Skill SHALL 定义输出 JSON Schema，sf-knowledge Agent 的每个 Phase 输出必须符合对应 Schema：
   - Phase 2 输出：`{ "events": [{ "type": string, "description": string, "evidence_refs": string[] }] }`
   - Phase 4 输出：`{ "generalizations": [{ "specific_event": string, "root_cause": string, "general_rule": string, "anti_conditions": string[], "applicability": string }] }`
   - Phase 5 输出：`{ "entries": [Knowledge_Entry] }`（符合 REQ-3 AC-4 定义的完整字段结构）

### REQ-3 全局知识库存储

**用户故事：** 作为开发者，我希望知识库存储在用户级全局目录中，所有项目自动共享，以便在项目 A 中积累的经验能在项目 B 中自动被利用。

#### 验收标准

1. THE Global_Knowledge_Store SHALL 持久化存储在 `~/.config/opencode/specforge/knowledge/insights.json`
2. THE Global_Knowledge_Store 的顶层结构 SHALL 为：`{ "version": "1.0", "categories": [...], "entries": [...], "metadata": { "total_entries": N, "last_updated": "<ISO8601>" } }`
3. THE `categories` 数组 SHALL 包含初始 5 个类别：`failure_pattern`（失败模式）、`modification_pattern`（修改模式）、`stack_experience`（框架经验）、`workflow_tip`（工作流技巧）、`checklist`（检查清单），并支持用户通过 `add_category` 操作新增自定义类别
4. EACH Knowledge_Entry SHALL 包含以下字段：`id`（唯一标识，格式 `KE-<timestamp>-<seq>`）、`title`（通用标题，≤100 字符）、`content`（详细内容，≤2000 字符）、`category`（分类）、`tags`（关键词标签列表）、`applicable_file_patterns`（适用文件模式，如 `["*.ts", "*.test.ts"]`）、`confidence`（high/medium/low）、`status`（active/candidate/archived）、`source_project`（来源项目名）、`source_work_item`（来源 Work Item ID）、`usage_count`（被检索命中次数）、`helpful_count`（注入后任务成功次数）、`rejected_count`（注入后被用户/Agent 忽略或任务失败次数）、`last_used_at`（最后命中时间）、`anti_conditions`（不适用条件列表，描述什么场景下不应使用此知识）、`applicability`（适用边界描述，明确适用的技术栈/场景/前提条件）、`verification_status`（验证状态：`verified` / `unverified` / `disproved`）、`normalized_key`（归一化键，用于去重比对，格式为 `<category>:<核心动作短语>`）、`created_at`、`updated_at`、`version`（整数，每次更新递增）
5. THE sf_knowledge_base Custom Tool SHALL 实现在 `.opencode/tools/sf_knowledge_base.ts`，核心逻辑在 `.opencode/tools/lib/sf_knowledge_base_core.ts`
6. THE sf_knowledge_base 工具 SHALL 支持以下操作：`add`、`update`、`remove`（标记 archived）、`get`、`list`（支持分类/标签/状态过滤）、`search`、`add_category`、`quality_check`
7. THE sf_knowledge_base 工具 SHALL 使用原子写入策略（写临时文件→rename），确保写入失败不破坏已有数据
8. WHEN insights.json 不存在时，THE sf_knowledge_base 工具 SHALL 自动创建空的 Global_Knowledge_Store
9. THE sf_knowledge_base_core 模块 SHALL 可独立测试，不依赖 OpenCode 运行时环境

### REQ-4 知识检索与上下文注入

**用户故事：** 作为 SpecForge 用户，我希望在执行任务时系统能自动从全局知识库中检索相关经验并注入到 Agent 的上下文中，以便获得精准的历史经验指导。

#### 验收标准

1. THE Knowledge_DataSource 类 SHALL 实现 V4.0 的 `ContextDataSource` 接口，作为 Context Builder 的第三个数据源
2. THE Knowledge_DataSource SHALL 从 TaskQueryParams 中提取检索参数：将 `task_description` 分词为 keywords，将 `target_files` 转换为 file_patterns，将 `phase` 映射为优先的 Knowledge_Category
3. THE Knowledge_DataSource SHALL 实现多维度匹配：关键词匹配（title + content + tags）+ 文件模式匹配（applicable_file_patterns）+ 分类过滤
4. THE Knowledge_DataSource SHALL 为每个匹配条目计算 Relevance_Score（0-100）：关键词匹配度（0-40）+ 文件模式匹配度（0-30）+ 知识质量分（0-20，基于 usage_count、helpful_count 和 confidence）+ 时效性分（0-10）
5. THE Knowledge_DataSource SHALL 设置最低注入阈值：relevance_score < 60 的条目不注入上下文（注：基于 embedding 的语义匹配留 V5.1）
6. THE Knowledge_DataSource SHALL 返回 top-5 相关知识条目（仅 relevance_score ≥ 60 的），转换为 ContextFragment（source_type="knowledge_base"，priority=5，高于 Archive 的 priority=4）
7. THE Knowledge_DataSource SHALL 在 sf_context_build_core 中注册为第三个数据源，注册条件为 `knowledge_base_enabled` 配置项为 true
8. WHEN 知识条目被检索命中并注入时，THE 系统 SHALL 自动递增该条目的 `usage_count` 并更新 `last_used_at`，同时保留 `match_reasons`（匹配原因列表）供用户审计
9. THE Context Builder 输出的 Task_Context SHALL 新增 `## 知识库经验` 章节，展示检索到的知识条目摘要及 match_reasons
10. WHEN 全局知识库为空或无匹配结果（所有条目 relevance_score < 60）时，THE Knowledge_DataSource SHALL 返回空数组，不影响其他数据源

### REQ-5 知识浏览与审核

**用户故事：** 作为开发者，我希望能方便地浏览和审核知识库中的条目，确认候选知识、查看知识质量、管理知识生命周期。

#### 验收标准

1. THE Orchestrator SHALL 支持 `/sf-knowledge` 命令，展示知识库概览：总条目数（按分类和状态分组）、最近提取的 5 条知识、待审核的候选条目数
2. THE Orchestrator SHALL 支持 `/sf-knowledge search <关键词>` 命令，手动检索知识库并展示匹配结果（含 relevance_score 和 match_reasons）
3. THE Orchestrator SHALL 支持 `/sf-knowledge review` 命令，展示所有 `candidate` 状态的知识条目，用户可逐条确认（activate）或拒绝（archive）
4. THE Orchestrator SHALL 支持 `/sf-knowledge detail <entry_id>` 命令，展示单个知识条目的完整信息（含来源项目、提取上下文、使用统计）
5. THE 知识条目的展示格式 SHALL 便于人类阅读：标题、分类标签、适用范围、内容摘要、置信度、使用次数

### REQ-6 知识质量管理

**用户故事：** 作为 SpecForge 维护者，我希望知识库具备自动质量管理能力，能识别过期、低质量和冲突的条目，保持知识库的高质量。

#### 验收标准

1. THE sf_knowledge_base 工具 SHALL 支持 `quality_check` 操作，识别以下质量问题：
   - 过期条目（stale）：`last_used_at` 超过 90 天且 `usage_count` < 3
   - 低置信度长期未确认：`status=candidate` 且 `created_at` 超过 30 天
   - 冲突条目：相同 `category` + 相似 `tags`（交集 ≥ 2）但 `content` 建议矛盾
2. THE `quality_check` 操作 SHALL 返回质量报告：`{ "total_active": N, "stale": [...], "unconfirmed_candidates": [...], "conflicting_pairs": [...], "healthy": N }`
3. THE Orchestrator SHALL 在知识库条目超过 50 条时，每 10 个 Work Item 完成后自动触发一次 `quality_check`，将结果摘要展示给用户
4. THE sf_knowledge_base 工具 SHALL 支持 `cleanup` 操作，将 `stale` 条目批量标记为 `archived`

### REQ-7 跨项目知识共享

**用户故事：** 作为开发者，我希望在项目 A 中积累的知识能自动在项目 B 中被利用，无需手动同步或配置。

#### 验收标准

1. THE 全局知识库路径 `~/.config/opencode/specforge/knowledge/insights.json` SHALL 被所有安装了 SpecForge 的项目自动共享（sf_knowledge_base_core 读写全局路径）
2. EACH Knowledge_Entry SHALL 包含 `source_project` 字段记录来源项目。检索可见性规则：`status=active` 的条目对所有项目可见（全局共享）；`status=candidate` 的条目仅对 `source_project` 匹配的项目可见（项目内）
3. THE Knowledge_DataSource 在检索时 SHALL 仅检索 `status=active` 的条目（跨项目共享）+ 当前项目的 `status=candidate` 条目，按相关性评分排序
4. THE 安装器（sf-installer.ts）SHALL 在 install 时检查全局知识库目录是否存在，不存在则创建空目录结构，并提供一键启用选项：
   - 新项目安装时：询问用户是否启用知识库功能（交互式提示，默认 No）
   - 已有项目升级时：默认不启用（`knowledge_base_enabled` 保持 false），仅在用户显式选择时启用
   - 提供 `--enable-knowledge` CLI 参数支持非交互式启用
5. WHEN 多个项目同时运行时，THE sf_knowledge_base 工具 SHALL 使用文件锁（.lock 文件）串行化写操作，防止并发写入冲突。文件锁机制须满足：
   - 锁文件路径：`~/.config/opencode/specforge/knowledge/insights.lock`
   - 锁文件内容包含：持有者 PID、获取时间戳、项目标识
   - 锁超时：30 秒未释放视为过期锁，可被强制接管
   - 崩溃恢复：获取锁前检查持有者 PID 是否存活（`process.kill(pid, 0)`），PID 不存在则清除过期锁
   - 获取锁失败时最多重试 3 次（间隔 1 秒），仍失败则记录警告并跳过本次写入（不阻塞主流程）

### REQ-8 向后兼容与测试完整性

**用户故事：** 作为 SpecForge 维护者，我希望所有 V5.0 变更保持与 V4.0 的向后兼容并通过所有 657 个现有测试。

#### 验收标准

1. THE SpecForge 系统 SHALL 确保所有 657 个现有单元测试在 V5.0 变更应用后继续通过
2. THE sf_context_build_core 模块 SHALL 新增 Knowledge_DataSource 注册能力，但保持现有 `buildContext` 函数签名和返回结构不变
3. THE 现有 15 个 Custom Tool 文件 SHALL 不做功能性修改
4. THE 现有 5 个 Plugin 文件 SHALL 不做任何修改
5. THE Knowledge_Base 功能 SHALL 通过 `specforge/config/project.json` 中的 `knowledge_base_enabled` 字段（布尔值，默认 false）控制启用/禁用
6. WHEN `knowledge_base_enabled` 为 false 时，THE SpecForge 系统 SHALL 与 V4.0 行为完全一致——Knowledge_DataSource 不注册，sf-knowledge Agent 不被调度
7. THE `opencode.json` SHALL 新增 sf-knowledge Agent 的注册条目
8. FOR ALL 新增的核心模块（sf_knowledge_base_core），对应的单元测试 SHALL 覆盖核心逻辑、边界条件和错误处理路径
9. THE AGENTS.md 文档 SHALL 更新以反映 V5.0 新增的 Agent、Tool 和 Skill

### REQ-9 效果反馈机制

**用户故事：** 作为 SpecForge 维护者，我希望系统能追踪知识注入后的实际效果（任务成功/失败），以便自动淘汰无效知识、提升有效知识的优先级。

#### 验收标准

1. WHEN 知识条目被注入到 Task Context 后，THE 系统 SHALL 在该 Task 执行完成时记录反馈：
   - Task 成功完成（无重试、无 debugger 介入）→ 递增该条目的 `helpful_count`
   - Task 失败或需要重试/debugger 介入 → 递增该条目的 `rejected_count`
2. THE 反馈记录 SHALL 由 Orchestrator 在 Task 状态流转到 `completed` 或 `blocked` 时自动触发，通过 sf_knowledge_base 工具的 `record_feedback` 操作执行
3. THE Knowledge_DataSource 在计算知识质量分时 SHALL 纳入反馈数据：`quality_score = base_confidence_score + (helpful_count * 2) - (rejected_count * 3)`，quality_score 下限为 0
4. WHEN 某条目 `rejected_count` ≥ 5 且 `helpful_count` = 0 时，THE 系统 SHALL 自动将其 `status` 降级为 `archived`，并在下次 quality_check 中报告
5. THE sf_knowledge_base 工具 SHALL 新增 `record_feedback` 操作，参数为 `{ entry_id: string, outcome: "helpful" | "rejected", task_id?: string, work_item_id?: string }`
6. THE 反馈数据 SHALL 持久化在 Knowledge_Entry 的 `helpful_count` 和 `rejected_count` 字段中，不单独存储反馈日志（V5.0 简化方案）

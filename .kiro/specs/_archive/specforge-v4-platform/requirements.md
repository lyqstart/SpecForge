# 需求文档

## 简介

SpecForge V4.0（平台版）为系统引入两大核心能力：**Knowledge Graph（知识图谱）** 和 **Context Builder / Capability Broker（上下文构建器 / 能力代理）**。Provider Fallback 已明确跳过，不在 V4.0 范围内。

### 当前系统状态

经过 17 轮测试验证，SpecForge 当前拥有：
- 8 个 Agent（1 个 primary + 7 个 subagent）
- 12 个 Custom Tool（状态管理、Gate、文档 lint、追溯矩阵、批量验证、成本报告等）
- 5 个 Plugin（事件记录、成本追踪、权限守卫、检查点、会话记录）
- 11 个 Skill（4 个工作流 Skill + 7 个 Superpowers Skill）
- 424 个单元测试
- 4 种工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change）
- 并行任务执行（V3.3）、会话记录与压缩感知（V3.1）、Orchestrator Prompt 拆分（V3.2）

### V4.0 核心问题

**问题 1：缺少结构化关系管理**

当前 SpecForge 的规格文档（requirements.md → design.md → tasks.md → 代码文件）之间的关系是隐式的：
- `sf_trace_matrix` 工具通过正则匹配检查需求→设计→任务的引用完整性，但这是一次性检查，不持久化关系
- 需求变更时无法自动识别受影响的设计决策、任务和代码文件
- 代码文件与需求之间的映射关系不可查询
- 跨 Work Item 的知识复用无结构化支持

**问题 2：上下文和能力加载不精准**

当前 SpecForge 的上下文和能力加载策略是静态的：
- Orchestrator 在 V3.2 中实现了 Workflow Skill 按需加载，但加载粒度是整个 Skill 文件
- 子 Agent 调度时，Orchestrator 在 prompt 中传递固定的上下文信息（work_item_id、spec_directory、archive_path 等），不根据任务特征动态调整
- 子 Agent 无法获取与当前任务相关的历史执行经验（如同类 Task 的成功/失败模式）
- Skill 加载是全量的——即使只需要 Skill 中的某个方法论片段，也必须加载整个 SKILL.md

### V4.0 设计原则

1. **渐进式构建**：Knowledge Graph 从文件级关系开始，不追求完整的语义级代码分析
2. **Custom Tool 实现**：Knowledge Graph 的读写操作实现为 Custom Tool，保持与现有架构一致
3. **JSON 文件存储**：Knowledge Graph 使用 JSON 文件存储，不引入外部图数据库依赖
4. **Prompt 增强而非代码重构**：Context Builder 主要通过增强 Orchestrator 的调度 prompt 实现，不改变子 Agent 的契约
5. **向后兼容**：所有变更必须保持与 V3.3 的向后兼容，424 个现有单元测试必须继续通过
6. **最小变更**：优先通过 Prompt 协议更新和少量新 Tool 实现，避免大规模重构
7. **显式启用**：Knowledge Graph 功能通过配置项显式启用，未启用时系统行为与 V3.3 完全一致

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，运行在独立 Session 中
- **Custom_Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件，使用 Zod schema 进行输入验证
- **Plugin**：OpenCode 事件钩子扩展，可以监听和拦截系统事件
- **Skill**：`.opencode/skills/` 目录下的 SKILL.md 文件，本质是 prompt 指令，由 Agent 按需加载
- **Work_Item**：SpecForge 中的工作单元，拥有唯一 ID（如 WI-001）和工作流状态
- **Knowledge_Graph**：需求→设计→任务→代码之间的结构化关系图，以 JSON 文件持久化存储
- **Graph_Node**：Knowledge Graph 中的节点，代表一个可追溯的实体（需求、设计决策、任务、代码文件）
- **Graph_Edge**：Knowledge Graph 中的有向边，代表两个 Graph_Node 之间的关系，存储方向为下游方向（requirement→design→task→code_file）
- **Graph_Store**：Knowledge Graph 的持久化存储文件（`specforge/knowledge/graph.json`），JSON 格式
- **Impact_Analysis**：基于 Knowledge Graph 的影响分析，给定一个变更节点，沿指定方向（下游/上游/双向）查找所有受影响的节点
- **Context_Builder**：上下文构建器，根据当前任务特征从多个数据源（Knowledge Graph、Agent_Run_Archive、tasks.md）中提取相关上下文，注入到子 Agent 的调度 prompt 中
- **Capability_Broker**：能力代理，根据当前任务特征决定需要加载哪些 Skill 片段和工具提示，实现按需能力供给
- **Task_Context**：Context Builder 为特定 Task 构建的上下文包，包含相关需求摘要、设计决策、历史执行经验等
- **Skill_Fragment**：Skill 文件中的一个独立方法论片段，可被 Capability Broker 单独提取和注入
- **Execution_History**：从 Agent_Run_Archive 中提取的历史执行经验，包括成功模式、失败模式、常见错误等
- **sf_knowledge_graph**：Knowledge Graph 读写 Custom Tool，负责节点和边的 CRUD 操作
- **sf_knowledge_query**：Knowledge Graph 查询 Custom Tool，负责关系查询和影响分析
- **sf_context_build**：Context Builder Custom Tool，根据任务特征构建 Task_Context
- **Agent_Run_Archive**：子 Agent 执行完成后的归档目录（`specforge/archive/agent_runs/<run_id>/`）
- **Trace_Matrix**：需求→设计→任务的追溯矩阵，由 `sf_trace_matrix` 工具生成
- **Gate**：阶段质量门禁，检查阶段产物是否满足最低质量标准
- **Workflow_Skill**：工作流 Skill 文件，包含特定工作流的阶段执行协议（V3.2 引入）
- **Routing_Layer**：sf-orchestrator.md 精简版，包含通用协议和工作流路由逻辑（V3.2 引入）

## 需求

### 需求 1：Knowledge Graph 数据模型与存储

**用户故事：** 作为 SpecForge 维护者，我希望系统拥有一个结构化的知识图谱数据模型，能够表达需求、设计、任务、代码文件之间的关系，以便后续的影响分析和上下文构建有可靠的数据基础。

#### 验收标准

1. THE Knowledge_Graph 数据模型 SHALL 定义以下 Graph_Node 类型：`requirement`（需求，对应 requirements.md 中的一个需求条目）、`design_decision`（设计决策，对应 design.md 中的一个架构/接口/组件决策）、`task`（任务，对应 tasks.md 中的一个 Task）、`code_file`（代码文件，对应项目中的一个源文件路径）
2. THE Knowledge_Graph 数据模型 SHALL 定义以下 Graph_Edge 类型，边的存储方向统一为下游方向：`traces_to`（requirement→design_decision，表示需求被该设计决策实现）、`decomposes_to`（design_decision→task，表示设计决策被分解为该任务）、`modifies`（task→code_file，表示任务修改了该文件）、`implements`（code_file→requirement，表示代码文件实现了该需求，由系统从 requirement→design→task→code_file 链路自动推导生成）
3. FOR ALL Graph_Node，THE 数据模型 SHALL 包含以下公共字段：`id`（全局唯一标识符，格式 `<work_item_id>:<type>:<序号>`，如 `WI-001:requirement:1`）、`type`（节点类型）、`work_item_id`（所属 Work Item）、`label`（人类可读的简短描述，最大 200 字符）、`metadata`（可选的类型特定元数据对象）、`created_at`（ISO8601 时间戳）、`updated_at`（ISO8601 时间戳）
4. THE `metadata` 字段 SHALL 根据节点类型包含以下信息：对 `code_file` 类型必须包含 `path`（文件路径）；对 `requirement` 类型可选包含 `source_file`（来源文件路径）和 `req_id`（原始需求编号如"需求 1"）；对 `design_decision` 类型可选包含 `source_file` 和 `design_id`（原始设计编号）；对 `task` 类型可选包含 `source_file` 和 `task_id`（原始任务编号如"Task 1"）
5. FOR ALL Graph_Edge，THE 数据模型 SHALL 包含以下字段：`source`（源节点 ID）、`target`（目标节点 ID）、`type`（边类型）、`work_item_id`（所属 Work Item）、`inferred`（布尔值，标识该边是否为系统自动推导生成，默认 false）、`created_at`（ISO8601 时间戳）
6. THE Graph_Store SHALL 持久化存储在 `specforge/knowledge/graph.json`，采用 JSON 格式，顶层结构为 `{ "version": "1.0", "nodes": [...], "edges": [...] }`
7. THE Knowledge Graph 功能 SHALL 通过 `specforge/config/project.json` 中的 `knowledge_graph_enabled` 字段（布尔值，默认 true）显式控制启用/禁用
8. WHEN `knowledge_graph_enabled` 为 true 且 Graph_Store 文件不存在时，THE sf_knowledge_graph 工具 SHALL 自动创建空的 Graph_Store（`{ "version": "1.0", "nodes": [], "edges": [] }`）
9. WHEN `knowledge_graph_enabled` 为 false 时，THE 所有 KG 相关操作（Gate 同步、Context Builder KG 查询）SHALL 跳过，系统行为与 V3.3 完全一致
10. THE Graph_Store SHALL 支持跨 Work Item 的节点和边存储，不同 Work Item 的图数据共存于同一个 Graph_Store 文件中
11. THE sf_knowledge_graph 工具 SHALL 使用原子写入（atomic write）策略写入 graph.json：先写入临时文件，再 rename 替换原文件，确保写入失败不会破坏已有数据
12. THE sf_knowledge_graph 工具 SHALL 使用文件锁（.lock 文件）串行化所有写操作，防止并发写入导致数据丢失（读取旧版本→写入→覆盖其他写入者的变更）

### 需求 2：Knowledge Graph 读写工具

**用户故事：** 作为 SpecForge 的 Orchestrator，我希望通过 Custom Tool 对 Knowledge Graph 进行节点和边的增删改查操作，以便在工作流各阶段自动维护关系图。

#### 验收标准

1. THE sf_knowledge_graph Custom Tool SHALL 实现在 `.opencode/tools/sf_knowledge_graph.ts`，核心逻辑实现在 `.opencode/tools/lib/sf_knowledge_graph_core.ts`
2. THE sf_knowledge_graph 工具 SHALL 支持以下操作（通过 `operation` 参数区分）：`add_nodes`（批量添加节点）、`add_edges`（批量添加边）、`remove_nodes`（批量删除节点及其关联边）、`update_node`（更新单个节点的 label 或元数据）、`sync_from_spec`（从 spec 文件自动解析并同步节点和边）
3. WHEN 执行 `add_nodes` 操作时，THE sf_knowledge_graph 工具 SHALL 验证每个节点的 `id` 格式符合 `<work_item_id>:<type>:<序号>` 规范，`type` 为合法的节点类型之一，且 `id` 在 Graph_Store 中不重复
4. WHEN 执行 `add_edges` 操作时，THE sf_knowledge_graph 工具 SHALL 验证 `source` 和 `target` 节点在 Graph_Store 中存在，`type` 为合法的边类型之一，且不创建重复边（相同 source、target、type 的边视为重复）
5. WHEN 执行 `remove_nodes` 操作时，THE sf_knowledge_graph 工具 SHALL 同时删除与被删除节点关联的所有边（级联删除），防止悬挂边
6. WHEN 执行 `sync_from_spec` 操作时，THE sf_knowledge_graph 工具 SHALL 接受 `scope` 参数（`"requirements"` | `"design"` | `"tasks"` | `"verification"`），根据 scope 决定同步范围：`requirements` 只同步 requirement 节点；`design` 同步 design_decision 节点和 traces_to 边；`tasks` 同步 task 节点、code_file 节点、decomposes_to 边和 modifies 边；`verification` 执行全量同步并推导 implements 边
7. THE `sync_from_spec` 操作 SHALL 采用幂等策略：对于已存在的节点更新其 `label`、`metadata` 和 `updated_at`，对于不存在的节点创建新节点，对于 spec 文件中已删除的条目移除对应节点和边
8. WHEN scope 为 `"tasks"` 或 `"verification"` 时，THE `sync_from_spec` 操作 SHALL 自动推导 `implements` 边：沿 requirement→design_decision→task→code_file 链路，为每个 code_file 节点生成指向其链路起点 requirement 节点的 `implements` 边，并标记 `inferred: true`
9. THE sf_knowledge_graph 工具 SHALL 在每次写操作完成后返回操作摘要：`{ "nodes_added": N, "nodes_updated": N, "nodes_removed": N, "edges_added": N, "edges_removed": N }`
10. IF Graph_Store 文件 JSON 解析失败时，THEN THE sf_knowledge_graph 工具 SHALL 返回结构化错误信息（`{ success: false, error: "..." }`），不抛出未捕获异常，且不覆盖已损坏的文件（保留原文件供人工恢复）

### 需求 3：Knowledge Graph 查询与影响分析工具

**用户故事：** 作为 SpecForge 用户，我希望能够查询知识图谱中的关系，并在需求或设计变更时获得影响分析报告，以便了解变更的波及范围。

#### 验收标准

1. THE sf_knowledge_query Custom Tool SHALL 实现在 `.opencode/tools/sf_knowledge_query.ts`，核心逻辑实现在 `.opencode/tools/lib/sf_knowledge_query_core.ts`
2. THE sf_knowledge_query 工具 SHALL 支持以下查询操作（通过 `query_type` 参数区分）：`get_node`（获取单个节点详情及其直接关联）、`get_neighbors`（获取指定节点的所有邻居节点）、`get_subgraph`（获取指定 Work Item 的完整子图）、`get_overview`（获取 Graph_Store 的统计摘要）、`impact_analysis`（影响分析）、`trace_path`（追溯路径查询）
3. WHEN 执行 `impact_analysis` 查询时，THE sf_knowledge_query 工具 SHALL 支持 `direction` 参数：`downstream`（沿边的存储方向遍历，如需求变更→影响哪些设计/任务/代码）、`upstream`（沿边的反方向遍历，如代码文件→追溯到哪些需求）、`both`（双向遍历）。默认值为 `downstream`
4. THE `impact_analysis` 查询 SHALL 从指定的起始节点出发，沿指定方向的 Graph_Edge 进行广度优先遍历，返回所有直接和间接受影响的节点列表，每个节点附带 `depth`（到起始节点的跳数）
5. THE `impact_analysis` 查询 SHALL 支持 `max_depth` 参数（默认值 3），限制遍历深度，防止在大图中产生过多结果
6. THE `impact_analysis` 查询 SHALL 默认排除 `inferred: true` 的边（如 implements），防止推导边造成影响范围污染（如 downstream 遍历时从 code_file 经 implements 跳回 requirement）。SHALL 支持 `include_inferred` 参数（默认 false）允许显式包含推导边
7. WHEN 执行 `trace_path` 查询时，THE sf_knowledge_query 工具 SHALL 查找从源节点到目标节点的路径（最短路径优先），支持 `max_depth`（默认 5）和 `max_paths`（默认 10）参数限制搜索范围，防止在有环图中路径爆炸
7. WHEN 执行 `get_overview` 查询时，THE sf_knowledge_query 工具 SHALL 返回 Graph_Store 的统计摘要：总节点数（按类型分组）、总边数（按类型分组）、涉及的 Work Item 列表
8. THE sf_knowledge_query 工具 SHALL 支持 `filter` 参数，允许按 `work_item_id`、`node_type`、`edge_type` 过滤查询结果
9. WHEN 查询的节点 ID 在 Graph_Store 中不存在时，THE sf_knowledge_query 工具 SHALL 返回 `{ "found": false, "message": "Node not found: <id>" }`，不抛出异常
10. THE sf_knowledge_query 工具 SHALL 返回结构化的查询结果，包含 `query_type`、`result_count`、`nodes`（节点列表）、`edges`（边列表）字段

### 需求 4：Knowledge Graph 自动维护协议

**用户故事：** 作为 SpecForge 用户，我希望 Knowledge Graph 在工作流推进过程中自动维护，无需手动操作，以便关系图始终与规格文档保持同步。

#### 验收标准

1. WHEN `knowledge_graph_enabled` 为 true 且 sf_requirements_gate 工具执行且 Gate 结果为 pass 时，THE sf_requirements_gate 工具 SHALL 在内部调用 `syncFromSpec` 核心函数（scope="requirements"）同步 requirements.md 中的需求节点
2. WHEN `knowledge_graph_enabled` 为 true 且 sf_design_gate 工具执行且 Gate 结果为 pass 时，THE sf_design_gate 工具 SHALL 在内部调用 `syncFromSpec` 核心函数（scope="design"）同步 design.md 中的设计决策节点和 requirement→design_decision 的 traces_to 边
3. WHEN `knowledge_graph_enabled` 为 true 且 sf_tasks_gate 工具执行且 Gate 结果为 pass 时，THE sf_tasks_gate 工具 SHALL 在内部调用 `syncFromSpec` 核心函数（scope="tasks"）同步 tasks.md 中的任务节点、design_decision→task 的 decomposes_to 边和 task→code_file 的 modifies 边
4. WHEN `knowledge_graph_enabled` 为 true 且 sf_verification_gate 工具执行且 Gate 结果为 pass 时，THE sf_verification_gate 工具 SHALL 在内部调用 `syncFromSpec` 核心函数（scope="verification"）执行最终同步，包括自动推导 code_file→requirement 的 implements 边（标记 `inferred: true`）
5. THE 自动维护协议 SHALL 集成到 4 个 Gate 工具（sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate）的核心逻辑中，作为 Gate 判定为 pass 后的自动后处理步骤
6. WHEN `knowledge_graph_enabled` 为 false 时，THE 4 个 Gate 工具 SHALL 完全跳过 KG 同步步骤，Gate 判定逻辑和返回结果与 V3.3 行为完全一致
7. IF Gate 工具内部的 `syncFromSpec` 操作失败时，THEN THE Gate 工具 SHALL 记录警告日志但仍然返回 Gate pass 结果——Knowledge Graph 同步失败不应影响 Gate 的判定结果和返回值
8. THE Gate 工具 SHALL 在返回结果中包含 Knowledge Graph 同步摘要（新增/更新/删除的节点和边数量），作为 Gate 返回结构的一部分（`kg_sync` 可选字段），便于 Orchestrator 向用户展示

### 需求 5：Context Builder 上下文构建

**用户故事：** 作为 SpecForge 用户，我希望 Orchestrator 在调度子 Agent 时能根据当前任务特征自动构建精准的上下文，以便子 Agent 获得与任务最相关的信息，减少无关上下文的 Token 浪费。

#### 验收标准

1. THE sf_context_build Custom Tool SHALL 实现在 `.opencode/tools/sf_context_build.ts`，核心逻辑实现在 `.opencode/tools/lib/sf_context_build_core.ts`
2. WHEN Orchestrator 调度 sf-executor 执行某个 Task 时，THE Orchestrator SHALL 先调用 `sf_context_build`（task_id、work_item_id）构建 Task_Context
3. THE sf_context_build 工具 SHALL 从 Knowledge Graph 中查询与指定 Task 相关的需求摘要和设计决策摘要，查询方式为：沿边的反方向（upstream）从 task 节点遍历，经 decomposes_to 边到达 design_decision 节点，再经 traces_to 边到达 requirement 节点
4. THE sf_context_build 工具 SHALL 从 Agent_Run_Archive（`specforge/archive/agent_runs/`）中查询与当前 Task 修改相同文件的历史执行记录，查询机制为：（a）优先从 Knowledge Graph（task→code_file 的 modifies 边）获取当前 Task 的目标文件列表，如果 KG 无数据则从 tasks.md 解析 `修改文件` 字段；（b）扫描 `specforge/archive/agent_runs/` 下所有 `<run_id>/` 目录；（c）读取每个 run 的 `files_changed.json`，检查其 `files[].path` 与当前 Task 目标文件列表是否存在交集；（d）对于匹配的 run，读取 `result.json` 提取 `status`、`task_description`、`error_type`、`error_summary` 字段；（e）将匹配结果聚合为成功模式（status="success" 的执行的关键步骤摘要）和失败模式（status="failure" 的失败原因和解决方案摘要）
5. THE sf_context_build 工具 SHALL 将构建的 Task_Context 格式化为结构化文本，包含以下章节：`## 相关需求`（需求编号和摘要）、`## 设计决策`（相关设计决策摘要）、`## 历史经验`（同类文件的成功/失败模式）、`## 注意事项`（从历史失败中提取的注意事项）
6. THE Task_Context 的总长度 SHALL 不超过 3000 字符（约 1000 Token），超过时按优先级截断：历史经验 > 注意事项 > 设计决策摘要 > 需求摘要（优先保留最有价值的信息，因为 executor 已有完整的 requirements.md 和 design.md 作为输入，Task_Context 中的需求/设计摘要是辅助信息）
7. WHEN 所有数据源（Knowledge Graph、Agent_Run_Archive、tasks.md）均无法提供与指定 Task 相关的信息时，THE sf_context_build 工具 SHALL 返回空的 Task_Context（`{ "context": "", "sources": [] }`），不报错。单个数据源无结果不影响其他数据源的查询——各数据源独立查询，任何一个有结果即返回非空上下文
8. THE sf_context_build 工具 SHALL 在返回结果中包含 `sources` 字段，列出 Task_Context 中引用的所有数据来源（Graph 节点 ID、Archive run_id），便于追溯
9. THE sf_context_build 工具的数据源接口 SHALL 设计为可扩展架构——V4.0 支持两种数据源（Knowledge Graph 和 Agent_Run_Archive），数据源通过统一的适配器接口接入，便于 V5.0 新增知识库数据源时无需重构核心逻辑
10. THE sf_context_build_core 模块 SHALL 定义 `ContextDataSource` 接口，每种数据源实现该接口的 `query(params: TaskQueryParams): Promise<ContextFragment[]>` 方法，Context Builder 核心逻辑遍历所有已注册的数据源收集上下文片段

### 需求 6：Capability Broker 能力按需供给

**用户故事：** 作为 SpecForge 维护者，我希望系统能根据当前任务特征决定需要加载哪些 Skill 片段，实现比 V3.2 更细粒度的能力按需供给，以便减少不必要的 Skill 全量加载带来的 Token 浪费。

#### 验收标准

1. THE Capability_Broker 逻辑 SHALL 集成到 sf_context_build 工具中（作为 `include_capabilities: true` 参数），不单独创建新的 Custom Tool
2. WHEN `include_capabilities` 为 true 时，THE sf_context_build 工具 SHALL 根据任务特征（任务描述中的关键词、修改文件类型、所处工作流阶段）推荐需要加载的 Skill_Fragment 列表
3. THE Capability_Broker SHALL 维护一个 Skill_Fragment 索引文件（`specforge/config/skill_fragments.json`），定义每个 Skill 文件中可独立提取的片段及其触发条件
4. THE skill_fragments.json SHALL 包含以下结构：每个条目包含 `fragment_id`（片段唯一标识）、`skill_file`（来源 Skill 文件路径）、`section_heading`（片段在 Skill 文件中的章节标题）、`triggers`（触发关键词列表）、`description`（片段功能描述）
5. WHEN Orchestrator 调度子 Agent 时，THE Orchestrator SHALL 将 Capability_Broker 推荐的 Skill_Fragment 完整内容直接注入到子 Agent 的调度 prompt 中，而非要求子 Agent 加载整个 Skill 文件
6. THE Capability_Broker 的推荐结果 SHALL 包含 `recommended_fragments` 列表（每个元素包含 `fragment_id`、`reason`、`content`（从 Skill 文件中提取的完整片段内容）、`estimated_tokens`（该片段的预估 Token 量））和总 `estimated_tokens`（所有推荐片段的预估 Token 总量）
7. WHEN 没有匹配的 Skill_Fragment 时，THE Capability_Broker SHALL 返回空的推荐列表，Orchestrator 按 V3.3 的现有协议加载完整 Skill
8. THE Capability_Broker SHALL 不改变现有的 Skill 加载协议——当 Capability_Broker 无法提供推荐时，系统回退到 V3.3 的全量 Skill 加载行为

### 需求 7：Orchestrator 调度协议更新

**用户故事：** 作为 SpecForge 用户，我希望 Orchestrator 的子 Agent 调度协议更新为集成 Knowledge Graph 和 Context Builder，以便子 Agent 在执行时获得更精准的上下文和能力支持。

#### 验收标准

1. THE Orchestrator 的 development 阶段调度协议 SHALL 更新为：在调度 sf-executor 前，先调用 `sf_context_build`（task_id、work_item_id、include_capabilities=true）构建 Task_Context 和能力推荐
2. THE Orchestrator SHALL 将 Task_Context 的内容作为额外上下文段落注入到 sf-executor 的调度 prompt 中，位于任务描述之后、输出要求之前
3. WHEN Capability_Broker 返回非空的 recommended_fragments 时，THE Orchestrator SHALL 将推荐的 Skill_Fragment 完整内容注入到 sf-executor 的调度 prompt 中，替代全量 Skill 加载
4. THE Orchestrator 的 requirements、design、tasks 阶段调度协议 SHALL 更新为：在调度子 Agent 前，调用 `sf_context_build`（work_item_id、phase）构建阶段上下文。阶段上下文的跨 Work Item 匹配规则为：从 Knowledge Graph 中查找其他 Work Item 中与当前阶段相关的节点（按 node_type 匹配：requirements 阶段匹配 requirement 节点，design 阶段匹配 design_decision 节点，tasks 阶段匹配 task 节点），按 label 关键词相似度排序，取 top-5 作为参考上下文
5. THE 调度协议更新 SHALL 集成到 4 个 Workflow Skill 中，确保所有工作流类型都受益于 Context Builder
6. THE Orchestrator SHALL 在调度子 Agent 时向用户报告 Context Builder 的构建摘要：引用了多少个 Graph 节点、多少条历史经验、推荐了多少个 Skill Fragment、预估注入的 Token 量
7. WHEN sf_context_build 工具调用失败时，THE Orchestrator SHALL 回退到 V3.3 的调度协议（不注入额外上下文），记录警告日志但不阻塞工作流

### 需求 8：Knowledge Graph 可视化查询命令

**用户故事：** 作为 SpecForge 用户，我希望通过调试命令查询和浏览 Knowledge Graph 的内容，以便了解系统中的关系结构和影响范围。

#### 验收标准

1. THE Orchestrator SHALL 支持 `/sf-graph` 调试命令，调用 `sf_knowledge_query` 展示 Knowledge Graph 概览
2. WHEN 用户输入 `/sf-graph` 时，THE Orchestrator SHALL 调用 `sf_knowledge_query`（query_type="get_overview"）展示 Graph_Store 的统计摘要：总节点数（按类型分组）、总边数（按类型分组）、涉及的 Work Item 列表
3. WHEN 用户输入 `/sf-graph <work_item_id>` 时，THE Orchestrator SHALL 调用 `sf_knowledge_query`（query_type="get_subgraph", work_item_id=<id>）展示指定 Work Item 的完整子图，以结构化文本格式呈现节点和边的关系
4. WHEN 用户输入 `/sf-graph impact <node_id>` 时，THE Orchestrator SHALL 调用 `sf_knowledge_query`（query_type="impact_analysis", node_id=<id>, direction="downstream"）执行影响分析，展示受影响的节点列表及影响路径
5. THE `/sf-graph` 命令的输出 SHALL 采用结构化文本格式，包含清晰的层级关系展示，便于用户理解关系结构

### 需求 9：向后兼容与测试完整性

**用户故事：** 作为 SpecForge 维护者，我希望所有 V4.0 变更保持与 V3.3 的向后兼容并通过所有 424 个现有单元测试，确保新功能的引入不破坏任何现有功能。

#### 验收标准

1. THE SpecForge 系统 SHALL 确保 `tests/unit/` 中的所有 424 个现有单元测试在 V4.0 变更应用后继续通过
2. THE 4 个 Gate 工具（sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate）SHALL 新增 Knowledge Graph 同步能力，但保持现有的输入参数和输出结构契约不变——新增的 `kg_sync` 字段为可选附加字段，不影响现有调用方对 Gate 结果的解析
3. THE 现有 12 个 Custom Tool 中除上述 4 个 Gate 工具外的其余 8 个 Custom Tool 文件 SHALL 不做任何功能性修改
4. THE 现有 5 个 Plugin 文件 SHALL 不做任何修改
5. THE 现有 7 个子 Agent 的 prompt 文件（`.opencode/agents/sf-*.md`，sf-orchestrator.md 除外）SHALL 不做功能性修改，但可以增加输出格式规范
6. THE `opencode.json` 配置文件 SHALL 不做任何修改
7. WHEN `knowledge_graph_enabled` 为 false 时，THE SpecForge 系统 SHALL 与 V3.3 行为完全一致——Gate 工具跳过 KG 同步，Context Builder 跳过 KG 查询，所有现有功能正常运行
8. WHEN sf_context_build 工具返回空的 Task_Context 时，THE Orchestrator 的调度行为 SHALL 与 V3.3 完全一致
9. THE sf_knowledge_graph_core 和 sf_knowledge_query_core 模块 SHALL 可独立测试，不依赖 OpenCode 运行时环境
10. FOR ALL 新增的 Custom Tool 核心模块，对应的单元测试 SHALL 覆盖核心逻辑、边界条件（空图、单节点图、环形引用、超大图性能）和错误处理路径（文件读写失败、JSON 解析失败不覆盖原文件）
11. FOR ALL 4 个被修改的 Gate 工具，对应的单元测试 SHALL 新增 Knowledge Graph 同步相关的测试用例，覆盖：同步成功、同步失败（验证仍返回 pass）、`knowledge_graph_enabled=false`（跳过同步）三种场景
12. THE AGENTS.md 文档 SHALL 更新以反映 V4.0 新增的 Custom Tool 和 Gate 工具内置的 Knowledge Graph 自动同步能力

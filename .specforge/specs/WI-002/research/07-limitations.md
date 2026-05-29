# 07 — 限制与未覆盖项（步骤 7）

> 复述 `investigation_plan.md §调查范围-不包含` 的 4 项研究死角，补充 research 过程中新发现的盲点，并以单独段落记录工具/状态裂缝实证（供 findings_report 留 hook）。

---

## 7.1 Plan 已识别的研究死角（复述）

复制自 `investigation_plan.md` L69-L72：

1. **多客户端并发竞争实测缺席**：本调查不做 TUI / Telegram bot / Web UI 同时连接的压测，推荐方案在并发竞争下的具体行为只能基于代码推断，不能保证 100% 准确。
2. **WAL 写入吞吐数量级缺数据**：方案 D 涉及的 WAL 写入频率只能基于"现有 events.jsonl 增长速率"做粗估，不做实测基准。
3. **OpenCode 版本变更对 hook 稳定性的影响**：仅基于 `opencode_specforge_integration_answers.md` 文档时点状态，不追踪 OpenCode 主线最新变化。
4. **`.specforge/manifest.json` 缺失场景的全量行为**：仅作为初始化耦合点的实证之一被引用，不展开成独立子问题。

---

## 7.2 Research 过程中新发现的盲点

按发现顺序：

### N1 — Daemon 全局 StateManager 的 statePath 嵌套行为未实测

`02 症状 2 Hop 3` 推导出 Daemon.ts L53 把 `runtimeDir` 当 projectPath 传给 StateManager，导致 PersonalPathResolver 把 statePath 嵌套为 `<runtimeDir>/.specforge/runtime/state.json`。**未实际启动 daemon 验证此嵌套文件是否存在**。可能：
- DaemonConfig.getRuntimeDir() 的真实返回值不同（未读源码）
- 测试或运行时干预了 path 推导
- 嵌套 statePath 确实存在但当前会话视野外

**影响**：症状 2 的根因 (1) "双 StateManager" 结论强；根因 (2) "嵌套 statePath 是空 workItems 的实际写入位置之一" 是推断而非直接观察。**推荐 design 阶段验证**。

### N2 — ProjectManager 内部 per-project StateManager 的调用方未确认

ProjectManager.ts L63 创建了 per-project StateManager 并存进 `ProjectContext.stateManager`，但**没有 grep 出 caller 调用 `ctx.stateManager.transition()`**。
- 可能：ProjectContext 被分发给其它子系统但只读 wal/dataDir 等字段，stateManager 字段实际未被使用
- 可能：caller 在测试代码或工作流引擎内部，本会话未读

**影响**：`05 5.5 Phase 1` 计划"消除 per-project StateManager"成立性高；但完全的"调用方影响面"未盘清。

### N3 — WorkflowEngine 的实现未读

Daemon.ts L60-L75 注入 `onTransition` 钩子，但 `@specforge/workflow-runtime` 包的 WorkflowEngine.transitionFull 实现未读。本 research 假设它最终都调到 onTransition，但**可能存在跳过 onTransition 的旁路**（如 WorkflowEngine 内部直接读写 state.json）。

**影响**：症状 2 根因链 Hop 2 的"WorkflowEngine 经 onTransition → 全局 stateManager"是基于注释推断；若 WorkflowEngine 有旁路写入，可能影响 Phase 1 的工作量评估。

### N4 — EventBus 持久化钩子的真实影响

Daemon.ts L143-L146 注册了 EventBus.setPersistenceHook，所有带 projectId 的 event 都会被 EventLogger 写入。**EventLogger.append() 的真实存储路径未读**——可能与 WAL.appendEvent 写同一 events.jsonl，也可能写到不同位置（如 logs/events.jsonl）。

**影响**：D2（内存权威性）的"events.jsonl 是单一权威源"成立的前提是**所有进入 daemon 的事件都汇入同一 events.jsonl**——若 EventLogger 写到别处，会形成"事件流分裂"，**D 方案需要先收敛**。

### N5 — 现有 `session.activated/terminated` 事件是否被发布

RecoverySubsystem L485-L523 `reconnectOldSessions` 从 events.jsonl 读 session.activated/terminated 做差集，但**当前代码中没有 grep 到任何 producer 发布这两个事件**（SessionRegistry.handleSessionEvent L617-L653 只 consume）。`01 C6 隐式契约 (4)` 标记为"悬空契约"。本 research 未对 production 部署的 events.jsonl 做实证检查——**`.specforge/runtime/events.jsonl` size = 0 不能否证其它环境的状态**。

**影响**：D 方案 startupReplay 的设计需要确认"是引入新的 session.* 事件 schema，还是接管悬空的现有 schema"。

### N6 — DaemonConfig 的实现未读

`05 5.5 Phase 1` 的工作量评估假设 DaemonConfig.getRuntimeDir() 一次性可改，但未读 DaemonConfig.ts。可能存在 config schema 演进或多个调用点。

### N7 — HTTPServer 还有未读区域

本 research 只读了 HTTPServer L880-L1275（共 ~400 行），HTTPServer 总长 1275 行，**前 880 行未读**。可能存在：
- 其它 ingest endpoints 的 sessionId 处理模式（参考 vs 反例）
- 鉴权层与 sessionId 的关系
- 与 EventBus / EventLogger 的额外耦合点

**缓解**：本 research 推荐方案的修复点（L1130-L1148）已精确定位，前 880 行的盲点对推荐路径影响有限；但 Phase 1/Phase 2 实施时需补读。

### N8 — events.jsonl 的真实增长速率与 compaction 需求未量化

`06 6.1` 估算 Phase 2 后 1 年累计 MB-GB 级，但**无实测**。OpenCode tool 调用频率（每分钟多少次）、touched 事件如果写 WAL 的频率上限，都未量化。**plan-level dead-spot 2 的另一种表述**。

### N9 — Property 21 重写的兼容性边界

`05 5.5 Phase 3` 计划重写 Property 21 措辞，但**未读所有引用此 Property 的文档** —— RecoverySubsystem L13-L17 注释 + `.kiro/specs/service-management/design.md` + tests 都可能引用。重写时若漏掉某处，会形成"代码与文档不一致"裂缝。

### N10 — 子 agent 会话与插件会话在 SessionRegistry 内的并存语义

研究中观察到 SessionRegistry 有两种会话来源（HTTPServer.handleIngestRegister 创建 plugin session L161；EventBus.handleSessionEvent 创建子 agent session L617-L654），但**两者在 4 个 Map 中共用 sessionId 命名空间**。本 research 没有专门讨论"子 agent session 与 plugin session 是否会 sessionId 冲突"——理论上 UUIDv7 不冲突，但**两类会话的语义差异在推荐方案下是否需要分裂存储**未展开。

---

## 7.3 相关问题（同源裂缝实证）

> 这是 **pointer 段落**，不展开成独立子问题。本节为 findings_report 留 hook，让 sf-design 在 §7（限制与未回答的问题）汇总时有现成材料引用。每条引用本会话或源码位置作证据。

### 实证 1：WI-001 daemon 内存有、磁盘 state.json 无

- **现象**：`sf_state_read WI-001` 返回 WI-001 的状态数据；同时 `.specforge/runtime/state.json` 的 `workItems` 数组为空（本会话 `02 症状 2` 实证素材确认）
- **解释**：参 `02 症状 2 Hop 3-5` 的"双 StateManager + statePath 嵌套"链
- **属性**：这是症状 2 的鲜活现场，本 research 推荐方案 Phase 1 直接解决

### 实证 2：`.specforge/manifest.json` 缺失阻塞所有 `sf_state_transition`

- **现象**：本次会话曾踩到 `PROJECT_NOT_INITIALIZED` 错误
- **代码位置**：`packages/daemon-core/src/tools/handlers/sf-state-transition.ts` L15-L28 —— fromState='' 时硬性 guard 检查 `<baseDir>/.specforge/manifest.json`
- **解释**：初始化耦合点。manifest.json 是 daemon 之外的"项目契约"，但 sf_state_transition 工具把它当作前置检查；这与 daemon 内部架构正交但耦合
- **属性**：plan §调查范围-不包含 第 4 项已识别为研究死角，本 research 不展开。建议 findings_report 提及 "manifest.json 的生命周期管理（创建/校验/迁移）属另一个 WI"

### 实证 3：双目录约定不一致（带点 vs 不带点）

- **现象**：
  - **系统 prompt 写**：`specforge/specs/` 作为 spec 产物路径
  - **实际工具行为**：`sf_artifact_write` 写到 `.specforge/specs/`（带点）
  - **配置位置**：`specforge/config/project.json` 在不带点目录、`.specforge/manifest.json` 在带点目录顶层；本 work item 的 `.specforge/specs/WI-002/` 在带点目录
  - **代码层面证据**：`packages/daemon-core/src/daemon/path-resolver.ts` L128 `path.join(projectPath, '.specforge', 'runtime')` 全用带点；`packages/daemon-core/src/tools/handlers/sf-state-transition.ts` L17 `join(baseDir, '.specforge', 'manifest.json')` 同样带点
- **解释**：可能历史上有过 `specforge/` → `.specforge/` 的迁移，但用户文档（system prompt）未同步
- **属性**：与 daemon 架构正交，属"目录布局规范"问题。`intake.md` L50 已声明"项目目录布局规范"识别为相关但正交问题，**单独 WI 处理**

### 实证 4：`sf_requirements_gate` 隐式要求 H2 下必须有非空 intro body

- **现象**：本次会话 plan 阶段产出 investigation_plan.md 时，`## 调查范围` 标题直接接 `### 包含` 子标题，被 sf_requirements_gate 拒绝；中间补一段 intro 文字后通过
- **解释**：Gate 工具内部规则隐含"H2 下必须存在非空段落 / 段落不允许直接接 H3"——但 skill 文档（sf-workflow-investigation）未明示此约束
- **属性**：与 daemon 架构正交，属"Gate 工具的隐式契约暴露不足"。**单独 WI 处理**

---

## 7.4 限制声明的整体边界

本 research 产出的所有结论的**最大置信范围**：

- ✅ **代码事实层面**：所有引用的源码行号、字段、函数签名都基于真实 read 操作；行号在本会话时点的 git working tree 准确
- ✅ **症状-根因映射层面**：症状 1 的精确代码位置（HTTPServer L1130-L1148）证据强；症状 2 的"双 StateManager + statePath 嵌套"是基于代码事实的推断链，每一跳都有源码支撑
- ⚠️ **运行时实证层面**：仅 `.specforge/runtime/state.json` / `events.jsonl` / `manifest.json` 被实际读取；嵌套 statePath（如 `~/.specforge/runtime/.specforge/runtime/state.json`）未实测确认存在
- ⚠️ **方案推荐层面**：A+D 是基于 10 维度填表 + 4 个 hybrid 判定的结论；**未实施任何代码变更，所有方案的实际效果有待 design 与 development 阶段验证**
- ⚠️ **未覆盖的代码区域**：HTTPServer 前 880 行、WorkflowEngine 实现、DaemonConfig 实现、EventBus 实现、ExtensionLoader、HandshakeManager —— 这些模块的契约未提取，**可能存在影响推荐方案的额外耦合点**

任何超出上述范围的结论都属于推断，使用者（包括 sf-design 在 findings_report 阶段）应在引用时注明置信度。

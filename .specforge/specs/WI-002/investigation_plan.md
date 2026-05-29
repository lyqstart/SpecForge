# Investigation Plan: WI-002 — Daemon 架构重设计

> 本文件是 **research 阶段的执行蓝图**，不是调查结论本身。
> 所有"该选 A/B/D 中的哪一个"由 sf-executor 在 research 阶段填表后由 sf-design 在 report 阶段汇总，**plan 阶段不预设答案**。

---

## 调查目标

本次调查要回答的核心问题，拆为 5 个可被报告章节直接对应的子问题：

### Q1 — 现状契约重建
**当前 daemon 在"会话身份 / 状态权威 / 持久化 / 多客户端接入"四个维度上各自的真实契约是什么？**
不重述需求，而是从源码反推**实际生效的契约**——包括契约的明示部分（接口签名、Property 20/21 等注释化不变式）和隐式部分（"HTTPServer 入参 `sessionId` 没被合并到 payload"这种代码事实形成的隐含契约）。

### Q2 — 方案 A / B / D 的多维度结构性对比
**沿"模块边界 / 数据流 / 状态机 / 迁移成本 / 与现有代码的兼容度 / 可观测性"等若干维度，三个方案各自的优劣是什么？**
研究阶段必须产出一张可逐维度填值的对比矩阵（维度模板见 §调查方法 步骤 3）。

### Q3 — Hybrid 组合的可行性
**三个方案是否互斥？是否存在"A 解眼前痛点 + D 解长期可恢复性"这样的 hybrid 路径？hybrid 的边界条件是什么？**
明确列出"哪些 hybrid 是真正成立的组合"vs"哪些只是把两个方案的负担相加"。

### Q4 — 推荐方案的目标架构与迁移路径
**对推荐方案，模块边界、状态机、关键数据流应该长什么样？从现状到目标架构如何分阶段迁移（每阶段的可独立交付边界与回滚点）？**
迁移路径必须能映射回 `.specforge/runtime/state.json` 和 `events.jsonl` 的现有形态，不能假设"绿地重写"。

### Q5 — 推荐方案在 4 条 project-rules 非功能约束下的表现
**推荐方案在「可靠性 / 兼容性 / 可观测性 / 性能数量级」四条约束下，分别会有什么影响？** 特别要回答："多客户端会聚点"语义在新架构下由哪个模块承担。

---

## 调查范围

本节定义 research 阶段必须读取的源码与文档边界，并显式登记 plan 阶段就能识别的"研究死角"，避免 research 阶段越界或在限制不明的情况下下结论。范围基于 intake.md §调查范围，并补充必读文件清单。

### 包含（直接复用 intake.md §调查范围-包含，并细化必读源码清单）

**必读源码**（research 阶段 executor 必须逐文件提取契约证据）：
- `packages/daemon-core/src/daemon/Daemon.ts` — 顶层组装，了解模块依赖图
- `packages/daemon-core/src/session/SessionRegistry.ts` — 重点 `handleOpenCodeEvent`（L513-L567）、`registerPluginSession`、`getSnapshot/restoreFromSnapshot`
- `packages/daemon-core/src/session/AgentIdentity.ts` — sessionId 生成与身份语义
- `packages/daemon-core/src/http/HTTPServer.ts` — 重点 L913-L1148 事件摄取入口、L1130-L1148 `handleOpenCodeEvent` HTTP 适配层
- `packages/daemon-core/src/project/ProjectManager.ts` — 项目隔离边界
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts` — 已有的 WAL/rebuild/consistency 能力，方案 D 的演进起点
- `packages/daemon-core/src/wal/`（如存在）— WAL 子系统现状
- `packages/daemon-core/src/state/StateManager.ts`（如存在）— `rebuildState()` 实现
- `packages/service-management/src/plugin/reconnecting-daemon-client.ts` — 插件侧重连语义、ID 使用方

**必读文档**：
- `.kiro/specs/service-management/design.md` L1-L130（多客户端拓扑）
- `docs/archive/OPENCODE_INTEGRATION_BRIEF.md`
- `docs/archive/opencode_specforge_integration_answers.md` L1-L200（hook 稳定性边界）

**实证素材**：
- `.specforge/runtime/state.json` — 用作"磁盘持久态裂缝"的现场样本
- `.specforge/runtime/events.jsonl` — 用作"半 WAL 现状"的现场样本
- `sf_state_read WI-001` 返回值 vs `state.json` 内容差异

### 不包含（直接复用 intake.md，加 plan 阶段识别的研究死角）

- 单机 → 多机部署的扩展性
- 性能基准测试 / 实测数据
- 安全模型（鉴权、权限、审计）
- 知识库 / KG 子系统
- 项目目录布局规范（在 findings_report 以 pointer 一段提及，单独 WI 处理）

**plan 阶段识别的研究死角**（research 阶段无法回答，需在 findings_report §限制 中显式声明）：
- **多客户端并发竞争实测缺席**：本调查不做 TUI / Telegram bot / Web UI 同时连接的压测，因此推荐方案在并发竞争下的具体行为只能基于代码推断，不能保证 100% 准确
- **WAL 写入吞吐数量级缺数据**：方案 D 涉及的 WAL 写入频率只能基于"现有 events.jsonl 增长速率"做粗估，不做实测基准
- **OpenCode 版本变更对 hook 稳定性的影响**：仅基于 `opencode_specforge_integration_answers.md` 文档时点状态，不追踪 OpenCode 主线最新变化
- **`.specforge/manifest.json` 缺失场景的全量行为**：仅作为初始化耦合点的实证之一被引用，不展开成独立子问题

---

## 调查方法

> **执行约束**：research 阶段只有 1 个 sf-executor 串行执行。所有步骤必须可被单线程顺序完成，不能假设并行 fan-out。

### 步骤 1：契约提取（回答 Q1）

对必读源码清单中的每个文件，executor 按统一模板提取契约：

| 字段 | 说明 |
|------|------|
| 文件路径 | `packages/...` |
| 模块职责 | 用一句话总结"我是 X" |
| 对外接口 | 列出公开方法签名（不抄全文，只摘签名+用途） |
| 持有的可变状态 | Map / 文件 / 缓存等 |
| 与其它模块的依赖 | 调用了谁、被谁调用 |
| 显式不变式 | 注释里写明的 Property / 假设 |
| **隐式契约** | 从代码事实反推出的、未在注释中说明但已成事实的约定（例：HTTPServer.handleOpenCodeEvent 把顶层 sessionId 丢弃，等于隐式约定"opencode.event 不走 sessionId 路由"） |

> **判定标准**：每个文件的"隐式契约"字段至少要尝试提取 1 条，没有就明确写"无"。这条字段是后续 Q2 对比"哪个方案破坏了哪个隐式契约"的关键。

### 步骤 2：症状到根因的证据链补全

executor 围绕 intake.md 描述的两个核心症状，补完证据链：

**症状 1**：`[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined`
- 必须串联：插件 register（HTTPServer L913-L938 `handleIngestRegister`） → daemon 颁发 sessionId → 插件后续 event 发送（HTTP body 顶层 sessionId） → HTTPServer L1130-L1148 调 SessionRegistry.handleOpenCodeEvent 时**只传 payload**，HTTP 顶层 sessionId **丢失** → SessionRegistry.handleOpenCodeEvent（L513）四步映射全部 miss → 兜底 WARN
- 证据形式：每一跳引用源码行号

**症状 2**：sf_state_read WI-001 有值 vs state.json `workItems: []`
- 必须串联：sf_state_transition 写入路径 → daemon 内存 Map → state.json flush 时机 → 哪一跳没把 WI-001 写穿到磁盘
- 证据形式：列出写入路径的每一跳，标注"flush 触发条件"

### 步骤 3：方案对比矩阵（回答 Q2）

executor 必须填出下表（**plan 阶段不预设答案，只规定维度和判定标准**）：

| 维度 | 判定标准 | 方案 A | 方案 B | 方案 D |
|------|----------|--------|--------|--------|
| **D1 — ID 一致性** | 是否消除了"daemon sessionId / OpenCode sessionID"双 ID 歧义？多客户端会聚点能否用单一 key 路由？ | | | |
| **D2 — 内存权威性** | 状态权威源在哪里？daemon 内存 / state.json / events.jsonl 三者出现分歧时谁说了算？ | | | |
| **D3 — 磁盘可恢复性** | daemon 重启后能否完整恢复"插件会话↔项目"绑定？能否恢复"工作项状态"？ | | | |
| **D4 — 模块边界变化** | SessionRegistry / RecoverySubsystem / HTTPServer / StateManager 中哪些模块的职责需要重组？变动幅度量级（一行 / 一文件 / 一模块 / 跨模块）？ | | | |
| **D5 — 对现有插件协议的兼容性** | `reconnecting-daemon-client.ts` 当前的 ID 使用方式是否需要变更？是否需要插件升级才能工作？ | | | |
| **D6 — 迁移成本** | 现有 `state.json` 和 `events.jsonl` 是否需要数据迁移？是否需要双写过渡期？ | | | |
| **D7 — 可观测性影响** | 现有"No session binding found"类日志会变成什么？是否需要新增 trace 点？ | | | |
| **D8 — debugability** | 出现"事件路由失败"时，开发者排查从哪个文件入手？路径变长还是变短？ | | | |
| **D9 — 与 Property 20/21 的兼容** | RecoverySubsystem 中已声明的 Property 20（一致性修复）和 Property 21（重连仅限启动期）在该方案下是否仍然成立？需要扩展 / 收紧 / 重写？ | | | |
| **D10 — 失败盲点** | 该方案在哪些场景下**仍然**会出现"事件丢路"或"状态不一致"？（用于诚实回答"这不是银弹"） | | | |

> **填表规则**：每个格子至少包含"结论 + 引用的源码行号或文档段落"。空格子等于该方案在该维度未被评估，report 阶段会被识别为缺口。

### 步骤 4：Hybrid 可行性筛查（回答 Q3）

对 3 个两两组合 (A+B / A+D / B+D) 和 1 个三合一 (A+B+D)，executor 各回答：
- 是否存在矛盾？（如 B 的"用 OpenCode sessionID 当 key" vs A 的"保留 daemon sessionId 作主键" 是直接互斥的）
- 如果不矛盾，组合后**收益是否大于负担**？（用步骤 3 的矩阵格子对比）
- 给出"成立 / 不成立 / 部分成立"的明确判定

### 步骤 5：推荐方案的目标架构与迁移路径（回答 Q4）

> **plan 阶段不指定推荐方案**。executor 在步骤 3-4 完成后，按以下结构输出推荐：

1. **推荐结论一句话**：选 X（X ∈ {A, B, D, hybrid-XY}），理由不超过 3 条
2. **目标架构图**：mermaid `graph TD`，标出模块边界与数据流主路径
3. **状态机**：会话生命周期 / 工作项生命周期 各一张状态图（mermaid `stateDiagram-v2`）
4. **关键数据流**：至少画出 (a) 插件 register → 颁发身份 → 第一条 event 路由 (b) daemon 重启 → 恢复绑定 → 接受第一条新 event
5. **迁移路径**：分阶段清单。每阶段必须含 (i) 范围 (ii) 可独立交付的产物 (iii) 回滚条件 (iv) 与现有 `state.json` / `events.jsonl` 的兼容方式

### 步骤 6：非功能约束影响分析（回答 Q5）

按 project-rules.md 表格的 4 个维度（性能 / 可靠性 / 兼容性 / 可观测性）分别评估推荐方案，明确点名"多客户端会聚点"语义在新架构由哪个模块承担。

### 步骤 7：诚实声明限制

executor 必须以**显式段落**复述本 plan §调查范围-不包含 中识别的研究死角，并补充 research 过程中新发现的盲点。

---

## 预期产出格式

`findings_report.md` 章节骨架：

```markdown
# Findings Report: WI-002 — Daemon 架构重设计调查

## 1. 执行摘要
- 推荐方案：<X>
- 核心理由：3 条 bullet
- 风险与未覆盖项：3 条 bullet

## 2. 现状契约（回答 Q1）
### 2.1 模块契约表
（步骤 1 的产物，按文件一节）
### 2.2 双症状证据链
（步骤 2 的产物）
- 症状 1：事件路由失败
- 症状 2：内存权威态 vs 磁盘持久态裂缝

## 3. 方案对比（回答 Q2）
### 3.1 维度定义与判定标准
（复述本 plan §调查方法 步骤 3 的表头）
### 3.2 对比矩阵
（步骤 3 填表产物）
### 3.3 维度级讨论
（对每个维度，1 段文字阐释"为什么这个方案在这个维度上是这个结论"）

## 4. Hybrid 组合可行性（回答 Q3）
### 4.1 A+B / A+D / B+D / A+B+D 逐一判定
### 4.2 成立的 hybrid 与其边界

## 5. 推荐方案（回答 Q4）
### 5.1 推荐结论
### 5.2 目标架构图（mermaid）
### 5.3 状态机（mermaid）
### 5.4 关键数据流
### 5.5 分阶段迁移路径

## 6. 非功能约束影响（回答 Q5）
按 4 维度逐条

## 7. 限制与未回答的问题
- 步骤 7 的产物
- 关于"项目目录布局规范"的 pointer 段落（单独 WI 处理）

## 8. 附录
### A.1 源码行号引用索引
### A.2 实证素材文件清单
```

> **粒度要求**：报告中每个结论性陈述必须能对应到 (a) 源码行号 (b) 文档段落 (c) 实证文件 三者之一。executor 在 research 过程中**先采证、后下结论**，不允许凭印象写。

---

## 完成判据

本 plan 自身的完成判据：
- [x] 包含 4 个必需 section：调查目标 / 调查范围 / 调查方法 / 预期产出格式
- [x] 调查目标拆为 5 个核心子问题
- [x] 调查方法给出 7 个步骤的串行执行序列
- [x] 调查方法包含一个 10 维度的对比矩阵模板
- [x] 显式识别 4 项研究死角并登记到"不包含"
- [x] 不预设推荐结论

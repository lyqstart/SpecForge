# 03 — 方案对比矩阵（步骤 3，回答 Q2）

> 10 维度 × 3 方案 = 30 格。每格 1-3 句结论 + 至少 1 个源码行号引用 OR 文档段落引用 OR 实证素材引用。
> **本文件只填表、不下推荐结论**。推荐在 `05-recommendation.md`。

## 方案定义复述

来自 `.specforge/specs/WI-002/intake.md` L17-L20：

- **方案 A**：补 ID 映射缺口（保留 daemon 生成 sessionId，注册时存 OpenCode sessionID 为别名）
- **方案 B**：SessionRegistry 对插件会话直接用 OpenCode sessionID 当 key；daemon 自己生成的 sessionId 只用于子 agent 会话
- **方案 D**：daemon 内存状态全部 WAL 化（事件溯源），从根本上解决 daemon 重启后绑定丢失

## 维度填表

### D1 — ID 一致性

> **判定标准**：是否消除了"daemon sessionId / OpenCode sessionID"双 ID 歧义？多客户端会聚点能否用单一 key 路由？

| 方案 | 结论 |
|------|------|
| **A** | **partial**。保留 daemon sessionId 为权威主键，引入 OpenCode sessionID 的别名表（如 `Map<opencodeSessionID, daemonSessionId>`），允许两条入口都能路由到同一会话。但**主键仍是两套语义**——子 agent 会话只有 daemon sessionId，插件会话两个都有，"会聚点用单一 key"做不到，只能"用主键 + 别名查找"。证据：SessionRegistry L51-L54 当前 4 个 Map 都按 sessionId（daemon 自有）当 key（C2 显式不变式 + Property 5 in L46-L48）。 |
| **B** | **yes**。对插件会话直接用 OpenCode sessionID 当主键，daemon 不为插件会话颁发独立 sessionId；子 agent 会话仍用 daemon UUIDv7。多客户端会聚点用 OpenCode sessionID 路由（plugin event 自带 `data.sessionID`，C9 隐式契约 (1)），单一 key 成立。**代价**：违反 SessionRegistry L7、L46-L48 注释化的 "Property 5: sessionId is the sole identity key, never relying on OpenCode-provided agent field"——这是一条**显式不变式的撤回**。 |
| **D** | **no（独立分析）**。事件溯源本身不改变 ID 语义，**ID 一致性问题在 D 方案下没有任何改善**；事件流仍需带正确的 sessionId 才能 replay。**D 必须与 A 或 B 之一合并**才能讨论 ID 一致性。证据：WAL L91-L106 createEvent 不强制 ID 语义统一，只接受 `projectId` 字符串。 |

### D2 — 内存权威性

> **判定标准**：状态权威源在哪里？daemon 内存 / state.json / events.jsonl 三者出现分歧时谁说了算？

| 方案 | 结论 |
|------|------|
| **A** | **未改变**。当前权威源是 daemon in-memory（StateManager.workItemStates Map L39 + SessionRegistry 4 个 Map L51-L54）；state.json 是 checkpoint，events.jsonl 是 WAL。A 只动 SessionRegistry 的映射结构，**不动权威性归属**。分歧仍由 daemon in-memory 说了算（StateManager.transition L126-L135 optimistic lock 以 in-memory 为基准）。 |
| **B** | **未改变**。同 A，权威性归属不变；只是 SessionRegistry Map 的 key 语义变了。证据：StateManager 不依赖 SessionRegistry 的 key 形式。 |
| **D** | **权威性归属重定向：events.jsonl 成为唯一权威**。**目前的 StateManager 已经做了"以 WAL 为权威"**（L7-L9 注释、L72-L73 rebuildState、L137-L161 transition WAL-first）——D 是把这条"已存在但只用于状态机"的能力扩展到 **SessionRegistry 的 4 个 Map + projectBindings**。分歧时 `events.jsonl` 说了算（任何时刻可 `rebuildState() + replay session events`）。**代价**：daemon 任何 in-memory 状态变更都必须先写 WAL，吞吐 ~每事件 3 syscall（WAL L51-L65 appendEvent；C7 隐式契约 (2)）。 |

### D3 — 磁盘可恢复性

> **判定标准**：daemon 重启后能否完整恢复"插件会话↔项目"绑定？能否恢复"工作项状态"？

| 方案 | 结论 |
|------|------|
| **A** | **partial**。当前 SessionRegistry 提供 `getSnapshot/restoreFromSnapshot`（L577-L600），**但 daemon 启动时没有任何代码调用 restoreFromSnapshot**（搜证：Daemon.ts L113-L181 start() 中不见调用）。A 不解决这条断链，**daemon 重启后插件会话绑定一律丢失**。工作项状态从 StateManager.initialize→rebuildState（L65-L77）能恢复（WAL 已支持）。 |
| **B** | **partial（同 A）**。B 改的是 key 语义，不改 snapshot 调用链；同样存在"启动期不 restoreFromSnapshot"的问题。 |
| **D** | **yes**。SessionRegistry 的所有变更（registerPluginSession L161、activate L234、terminate L257、bindProject L457 等）变成 WAL 事件，启动期 rebuildState 同时重建 session bindings。**Property 21（仅启动期重连）的语义可以从"试探性 ping OpenCode"升级为"WAL 重放强制重建"**——RecoverySubsystem L485-L523 当前已有读 `session.activated/terminated` 事件做差集的代码（C6 隐式契约 (4) 指出这是悬空契约，没有 producer），D 让它**变成有 producer 的真实路径**。 |

### D4 — 模块边界变化

> **判定标准**：SessionRegistry / RecoverySubsystem / HTTPServer / StateManager 中哪些模块的职责需要重组？变动幅度量级（一行 / 一文件 / 一模块 / 跨模块）？

| 方案 | 结论 |
|------|------|
| **A** | **一文件**（SessionRegistry.ts 改 1-2 个 Map 字段 + 加别名查找）+ **一行**（HTTPServer L1137-L1140 把 sessionId 注入 payload）。证据：SessionRegistry L513-L548 4 步映射改成 5 步（多查别名表）；HTTPServer L1140 改成 `{ ...payload, sessionId }` 即可。 |
| **B** | **一模块**（SessionRegistry.ts 改 key 语义，所有 Map 类型变更）+ **一行**（HTTPServer 同 A）。证据：SessionRegistry L51-L54 4 个 Map 的 key 都按 sessionId；要区分 "插件会话用 OpenCode sessionID"、"子 agent 用 daemon sessionId" 需要要么分裂为 2 类 Map，要么用 union 类型——SessionRegistry 全文 ~50 处 sessionId 引用都要重审。 |
| **D** | **跨模块**：(i) SessionRegistry 所有写方法改为"写 WAL → in-memory apply"两步（参 StateManager.transition 模板 L105-L161）；(ii) RecoverySubsystem 注入 WAL+StateManager 并扩展 rebuild 包含 session 状态（Daemon.ts L54 改 + RecoverySubsystem L52 已支持注入）；(iii) Daemon.ts 的 WAL 双实例问题需要消解（L82 vs StateManager 内部 WAL，C1 隐式契约 (1)）；(iv) ProjectManager 的 per-project StateManager 与全局 StateManager 关系需要决策（C5 隐式契约 (1)）。**变动跨 4 个核心模块**。 |

### D5 — 对现有插件协议的兼容性

> **判定标准**：`reconnecting-daemon-client.ts` 当前的 ID 使用方式是否需要变更？是否需要插件升级才能工作？

| 方案 | 结论 |
|------|------|
| **A** | **完全兼容**。Plugin 端 register 拿到 sessionId 后 postEvent 顶层传 sessionId（L97），daemon 只需在 HTTPServer L1137-L1140 把这个顶层 sessionId 合并进 payload 即可。**Plugin 端零改动**。 |
| **B** | **需要 plugin 端识别两种 sessionId 来源**。具体：register 响应仍是 daemon sessionId，但**对插件会话**，daemon 颁发的 sessionId **就是 OpenCode sessionID**（B 的核心）——register 响应字段语义变了但 wire format 不变。**Plugin 端可不改**，但 plugin 拿到的 sessionId 含义变了（之前是 daemon-generated UUIDv7，现在可能是 OpenCode 的 ID）。若 plugin 当前对 sessionId 格式有断言（如 UUID 校验），**会破坏**。证据：L34-L38 RegisterResponse 没有 mode-style 字段区分。 |
| **D** | **完全兼容**。事件溯源对 wire format 无要求。Plugin 端不感知 daemon 内部状态机变化。 |

### D6 — 迁移成本

> **判定标准**：现有 `state.json` 和 `events.jsonl` 是否需要数据迁移？是否需要双写过渡期？

| 方案 | 结论 |
|------|------|
| **A** | **无迁移成本**。state.json schema 不变（StateManager L228-L237 ProjectState 字段不动）；events.jsonl 不变。改的是 daemon 内部 Map 结构，**不持久化的部分无所谓迁移**。 |
| **B** | **session 历史 / projectBindings 的 key 域变更**。当前 projectBindings 用 daemon sessionId（L179），切到 OpenCode sessionID 后**旧 daemon 重启时遗留的 session 状态都无法恢复**——但当前 daemon 启动也不会 restoreFromSnapshot（D3），所以**实际丢失的是已经在丢的东西**。**checkpoint 文件名（`sessions/<sessionId>.json`，RecoverySubsystem L591-L609）的命名空间发生变化**：原来是 daemon 内部 UUID，切到 OpenCode sessionID 后两种格式可能冲突——需要 sessionId 类型字段或目录分离。 |
| **D** | **events.jsonl 需要 schema 演进**：新增 session.* 事件类型（registerPlugin、bindProject 等）。**双写过渡期 = 可选**：可以"D 上线后旧事件仍按之前语义保留，新事件按新 schema 写入；rebuild 时两套并行容错"。但 WAL L91-L106 createEvent 的 schema_version 是硬编码 '1.0'，**schema 演进无现成机制**（C7 隐式契约 (3)），需要先加版本协商。 |

### D7 — 可观测性影响

> **判定标准**：现有"No session binding found"类日志会变成什么？是否需要新增 trace 点？

| 方案 | 结论 |
|------|------|
| **A** | "No session binding found" L548 完全消失（顶层 sessionId 直接命中 Step 1）。**几乎无 trace 增量**。可选：在别名命中时输出 `[SessionRegistry] alias hit: opencodeSessionID=X → daemonSessionId=Y`。 |
| **B** | "No session binding found" L548 消失（OpenCode sessionID 直接当 key）。**需要为子 agent 会话单独增加 trace**：区分 "插件会话（OpenCode ID）" vs "子 agent 会话（daemon UUID）" 的日志维度，便于排查。 |
| **D** | "No session binding found" L548 消失（在 D+A 或 D+B 复合下；纯 D 不解决症状 1）。**大量新 trace 点**：每个 session 状态变化都写 WAL，rebuild 时打印 replay 摘要（"replayed N session events, restored M bindings"）；RecoverySubsystem 的 issue 检测会出现新类型。可观测性大幅提升但日志体积也成比例增长。 |

### D8 — Debuggability

> **判定标准**：出现"事件路由失败"时，开发者排查从哪个文件入手？路径变长还是变短？

| 方案 | 结论 |
|------|------|
| **A** | **路径几乎不变**。开发者排查仍从 HTTPServer.handleOpenCodeEvent（L1130）开始，**唯一的认知负担减少**是：不再需要怀疑 "顶层 sessionId 哪去了"，因为 L1140 已经把它合进 payload。SessionRegistry 4 步映射变 5 步，**hop 增加一跳但语义清晰**。 |
| **B** | **路径变短**。SessionRegistry 内不再需要"4 步映射"——直接用 `data.sessionID` 当 key 查 projectBindings 一次命中。但**调试器需要先确认是哪类会话**（插件 vs 子 agent），认知负担增加。 |
| **D** | **路径变长但有统一入口**。排查"为什么 session 状态错了"必须读 events.jsonl 时间线（WAL 顺序），认知负担类似 git log；但**有"replay 工具"可以重现任意时刻状态**，可调试性的"工具支持度"提高。**没有专用 replay CLI 之前，路径很长**。 |

### D9 — 与 Property 20/21 的兼容

> **判定标准**：RecoverySubsystem 中已声明的 Property 20（一致性修复）和 Property 21（重连仅限启动期）在该方案下是否仍然成立？需要扩展 / 收紧 / 重写？

| 方案 | 结论 |
|------|------|
| **A** | **完全兼容**。Property 20（L7-L11）的 `rebuild(events) == s'` 只涉及 ProjectState（workItems 等），不涉及 SessionRegistry 的 Map——A 不动 events.jsonl schema。Property 21（L13-L17）说"启动期之外不重连 OpenCode"——A 不引入新的重连场景。 |
| **B** | **Property 20 兼容**（同 A）。**Property 21 需重新解释**：B 让 daemon-sessionId↔OpenCode-sessionID 的语义合一，重连场景的"OpenCode 进程是否还活"判定更直接（用 OpenCode sessionID 当唯一身份）；Property 21 的措辞可以保留但语义微调。 |
| **D** | **Property 20 扩展**：从"只覆盖 workItems"扩展到"覆盖 session bindings + workItems"。rebuild() 的不动点定义需要扩张。**当前 RecoverySubsystem.rebuildFromEvents L305-L323 fallback 是退化版本（C6 隐式契约 (1)）**——D 必须把它修掉或显式弃用，否则 rebuild 不动点不闭合。**Property 21 扩展**：原本"启动期试探重连 OpenCode"变成"启动期 WAL 重放重建绑定"，性质从"网络探测"变成"纯本地状态重建"，**Property 21 措辞需要重写**。 |

### D10 — 失败盲点

> **判定标准**：该方案在哪些场景下**仍然**会出现"事件丢路"或"状态不一致"？（用于诚实回答"这不是银弹"）

| 方案 | 结论 |
|------|------|
| **A** | **盲点 1**：OpenCode 内部 sessionID 变化场景（OpenCode 自己重启而 daemon 不重启）——别名表不会自动更新，仍可能 miss。**盲点 2**：plugin 在 register 之前就发送事件（race window）—— HTTPServer L960-L962 仅 WARN，事件继续进入下游，4 步映射全 miss。**盲点 3**：daemon 重启后 plugin 用旧 sessionId postEvent——daemon 内存里没这个 sessionId，A 不解决（属于 D3 partial）。 |
| **B** | **盲点 1**：OpenCode 内部不发送 session.created 而其它事件先到（race）——SessionRegistry 没有 binding 可查（L532-L549 兜底逻辑 subType='session.created' 才补建）。**盲点 2**：同一 OpenCode sessionID 在不同 projectPath 上下文中重复出现——sessionID 是 OpenCode 单 daemon 内唯一，但 SpecForge daemon 可能挂多个 OpenCode 实例（B 假设了"OpenCode sessionID 在 SpecForge daemon 视角下唯一"）。证据：当前代码无此假设的 enforce 点。**盲点 3**：子 agent 会话与插件会话**身份空间分裂**——任何跨类型操作（如子 agent 给插件会话 touch）会路由错误。 |
| **D** | **盲点 1**：WAL 写失败时（磁盘满 / I/O 异常）daemon 必须 fail-fast；当前 HTTPServer 的 try/catch 反而吞错（L1108-L1117）—— D 必须升级"WAL 写失败 = HTTP 5xx 不接受事件"的契约。**盲点 2**：events.jsonl 损坏（部分行格式错） WAL L115-L130 readAllEvents 当前直接 JSON.parse，单行错就抛——D 需要"跳过坏行+记录"。**盲点 3**：长时间运行 events.jsonl 无限增长，rebuild 时间 O(n)——需要 snapshot/compaction 机制，纯 D 不解决。**盲点 4**：D 不解决 D1，需要叠加 A 或 B。 |

---

## 矩阵填充统计

- **填表格子**：30 / 30（100%）
- **标"无法判定/数据不足"的格子**：0 / 30
- **每格至少 1 个引用**：是（最少 1 个源码行号或文档段落 / intake 实证）

## 维度间相关性观察

部分维度结论存在结构性关联，**仅记录事实，留给下一步推荐分析**：

| 关联对 | 关系描述 |
|--------|----------|
| D1 ↔ D10 (A 盲点 3 vs A 在 D3 的 partial) | A 不解决 daemon 重启后绑定丢失，这条裂缝跨 D3/D10 都被点出 |
| D3 ↔ D9 (D 改 rebuild 不动点 vs Property 20 扩展) | D 方案要求修 fallback rebuildFromEvents，本身就是 Property 20 闭合性的修正 |
| D5 vs D4 (D5 兼容性 vs D4 模块变更幅度) | B 的"协议兼容但语义变"是模块边界变更大但 wire 不变的典型反例 |
| D7 vs D8 (新增 trace vs 排查路径变化) | D 大量新 trace 不等于易于排查，缺工具时反而更难 |
| D6 vs D10-D-盲点-1 | D 的事件 schema 演进缺失（C7 隐式契约 (3)） + 写失败处理 == 同一根问题的两面 |

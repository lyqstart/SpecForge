# Work Log: WI-002-sf-design-1 (investigation_plan)

## 任务摘要

为 WI-002（daemon 架构重设计调查）制定 **investigation_plan.md**——即 research 阶段的执行蓝图，描述"怎么调查"，不预设"调查结论"。

## 执行过程

### 1. 输入材料读取
- 读 `.specforge/specs/WI-002/intake.md`：吸收核心问句、深度档位（蓝图级 b）、候选方向 A/B/D、成本约束（禁止并行 fan-out）、范围内/外清单、5 项实证素材
- 读 `.specforge/project-rules.md`：吸收 4 条硬性约束（不改业务代码 / 读写范围 / 用户审批硬卡点 / 串行 research）和 4 维非功能约束（性能 / 可靠性 / 兼容性 / 可观测性）

### 2. 关键源码抽查（按指令要求的 2-3 个文件）

**抽查 1：`packages/daemon-core/src/http/HTTPServer.ts` L913-L1148**
- L913-L938 `handleIngestRegister`：插件 register 时**daemon 颁发 sessionId**，返回给插件
- L949-L1003 `handleIngestEvent`：通用 ingest 入口，request 接收 `{ sessionId, type, data, ts }`
- L1010-L1043 `routeIngestEvent`：按 type 分发，**注意 L1013：`const sessionId = request.sessionId ?? ''`** 即 HTTP 顶层 sessionId 被解出
- L1130-L1148 `handleOpenCodeEvent`（HTTP 适配层）：**调用 `sessionRegistry.handleOpenCodeEvent(payload.subType, payload)` 时，HTTP 顶层 `sessionId` 没有合并到 `payload` 中**——这是 intake 描述的"丢弃"症状的精确代码位置

**抽查 2：`packages/daemon-core/src/session/SessionRegistry.ts` L513-L567 `handleOpenCodeEvent`**
- 关键发现：**实际已经实现了 4 步映射逻辑**
  1. L520-L523：`data.sessionId`（daemon sessionId）+ projectBindings.has → 用
  2. L526-L529：`data.sessionID`（OpenCode sessionID）+ projectBindings.has → 用（**此处已经有"用 OpenCode sessionID 作 key"的代码**，即方案 B 的部分形态已存在）
  3. L532-L539：按 projectPath 线性扫描 projectBindings 找匹配
  4. L542-L551：兜底——`session.created + projectPath` 时新注册，否则 WARN
- 结论：根因不是"映射逻辑没写"，而是 **HTTPServer 没把入口 sessionId 合并进 payload，导致 1/2 两条映射路径的入参都是 undefined**。这个细节对 research 阶段的 Q1 隐式契约提取至关重要——必须区分"代码事实"和"声称的功能"。

**抽查 3：`packages/daemon-core/src/recovery/RecoverySubsystem.ts` L1-L120**
- 文件顶部已声明 **Property 20（recovery consistency repair）** 和 **Property 21（reconnect 仅限启动期）**——意味着 daemon 已有"WAL → rebuildState → consistency check → repair"的能力链
- L82-L120 `checkAndRepair`：通过 WAL.readAllEvents + StateManager.rebuildState 做一致性校验
- 结论：**方案 D（WAL 化）不是从零开始**，已经有相当份量的基础设施。research 阶段在评估方案 D 的"迁移成本"维度时不能假装"全新开发"

### 3. 调查方法的设计权衡

- **不预设答案**：plan 里所有对比矩阵格子留空，仅规定维度（10 项）和判定标准
- **维度选择遵循 intake.md 的 4 维实证 + project-rules 的 4 条非功能约束**：D1（ID 一致性）和 D2/D3（权威性/可恢复性）覆盖核心症状；D4-D6 覆盖工程成本；D7-D8 覆盖可观测性 / debugability；D9 覆盖与现有 Property 20/21 的兼容；D10 强制 research 阶段诚实声明每个方案的失败盲点
- **强制"隐式契约"提取**：从抽查 1 的发现反向推出——code 与 claim 经常不一致，光看接口签名不够，必须从代码事实倒推"实际生效的契约"
- **研究死角主动登记**：识别 4 项 research 阶段无法回答的问题（多客户端并发实测 / WAL 吞吐数量级 / OpenCode 版本变化 / manifest 缺失全量行为），登记到"不包含"

### 4. 工具调用统计
- read：5 次（intake.md / project-rules.md / SessionRegistry.ts 片段 / HTTPServer.ts 片段 / RecoverySubsystem.ts 片段）
- grep：1 次（定位 handleOpenCodeEvent 在 SessionRegistry 的行号）
- glob：3 次（确认 3 个核心源码文件路径）
- write：2 次（investigation_plan.md / 本 work_log）
- sf_doc_lint：1 次自检

## 识别的隐藏假设 / 给 research 阶段重点关注的发现

> 以下仅作为"plan 阶段抽查时观察到的事实陈述"传递给 orchestrator，不构成调查结论。research 阶段应独立验证。

1. **HTTPServer L1130-L1148 是症状 1 的精确代码位置**：`handleOpenCodeEvent` 调用 `sessionRegistry.handleOpenCodeEvent(payload.subType ?? 'unknown', payload)` 时丢弃了 HTTP 顶层 `sessionId`。research 阶段填证据链时这里是关键一跳。

2. **SessionRegistry.handleOpenCodeEvent 已实现 4 步映射**（包括"用 OpenCode sessionID 作 key"，即方案 B 的雏形已在代码里）。这意味着：
   - 方案 A（补 ID 映射）的"补"字会被部分推翻——映射代码本身已存在，缺的是 **HTTPServer 这一层把入参合并到 payload**
   - 方案 B（直接用 OpenCode sessionID）的实现成本可能比 intake.md 暗示的更低，因为代码已经接受这条路径

3. **RecoverySubsystem 已声明 Property 20/21 并实现 checkAndRepair 框架**：方案 D 的"事件溯源"在 daemon 里有相当份量的基础设施。research 阶段评估方案 D 时不能用"全新开发"假设其成本。

4. **State 写入路径未抽查**：plan 阶段未深入 `sf_state_transition` → daemon 内存 → state.json flush 的完整链路。research 阶段步骤 2"症状 2 证据链"必须独立查证。

## intake.md 完整性观察

- intake.md 整体完备，无修改建议
- 唯一微小观察：intake §候选方向 写"方案 A：补 ID 映射缺口"，但抽查显示 SessionRegistry 内已有映射代码，缺口在 HTTPServer 适配层而非 SessionRegistry 本身。这不是 intake 错误，而是 research 阶段需要细化的契约。

## 最终结论

产物：
- `.specforge/specs/WI-002/investigation_plan.md`（投递给 sf-executor 在 research 阶段执行）
- `.specforge/archive/agent_runs/WI-002-sf-design-1/work_log.md`（本文件）

调查目标拆分为 **5 个核心子问题** Q1-Q5。
调查方法包含 **7 个串行步骤**（契约提取 / 证据链补全 / 方案对比矩阵 / hybrid 筛查 / 推荐方案 / 非功能影响 / 限制声明）。
对比矩阵规定了 **10 个维度**。
显式登记 **4 项研究死角**到"不包含"。

self_check：
- passed: 4 个必需 section 全部包含，调查方法可单线程执行，未预设推荐结论，研究死角已登记
- failed: 无

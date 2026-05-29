# Intake: WI-002 — Daemon 架构重设计调查

## 调查任务

**核心问句**：如果重新设计 SpecForge daemon，整体架构应该长什么样？

## 调查背景与动机

### 已发现的症状
- 日志现象：`[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined`
- 根因（前次会话已定位）：插件会话存在 daemon 生成的 `sessionId` 与 OpenCode 自带 `sessionID` 两套 ID，无映射；`handleOpenCodeEvent` 还丢弃了 HTTP 顶层的 `sessionId`，导致事件无法路由

### 已确认的护城河（不可放弃）
- daemon 是 **TUI / CLI / Telegram bot / Web UI 多客户端的机器级单例会聚点**
- "去 daemon、纯文件化" 方案已被排除

### 已被列入考察的候选方向
- **方案 A**：补 ID 映射缺口（保留 daemon 生成 sessionId，注册时存 OpenCode sessionID 为别名）
- **方案 B**：SessionRegistry 对插件会话直接用 OpenCode sessionID 当 key；daemon 自己生成的 sessionId 只用于子 agent 会话
- **方案 D**：daemon 内存状态全部 WAL 化（事件溯源），从根本上解决 daemon 重启后绑定丢失

### 实证素材（来自本会话）
- 现存 WI-001 卡在 daemon 内存的 intake 状态、`.specforge/runtime/state.json` 的 `workItems` 数组为空
  → "daemon 内存权威态 vs 磁盘持久态" 的鲜活样本
- `.specforge/manifest.json` 缺失会让任何 `sf_state_transition` 直接失败
  → 初始化耦合点的实证
- `.specforge/runtime/events.jsonl` 已存在但 daemon 状态不是从它回放出来的
  → 半 WAL 现状，是方案 D 的演进起点

## 调查深度档位

**蓝图级 (b)**：横向对比 A/B/D（含可能的 hybrid 组合），输出推荐方案 + 目标架构图、关键模块边界、状态机/数据流、分阶段迁移路径。

**不出代码**。关键接口签名、文件清单、WAL schema 等字段级细节留给后续 design 工作流。

## 调查范围

### 包含
- daemon 内部架构（SessionRegistry / HTTPServer / ProjectManager / RecoverySubsystem 的职责重组）
- 持久化层重设计（WAL / 事件溯源 / state.json 结构）
- 多客户端协议层（HTTP 路由、事件流、断线重连语义）
- 与 OpenCode plugin 的集成边界（hook 稳定性、双 ID 映射契约）
- 项目隔离与并发锁模型

### 不包含
- 单机 → 多机部署的扩展性
- 性能基准测试 / 实测数据
- 安全模型（鉴权、权限、审计）
- 知识库 / KG 子系统
- **项目目录布局规范**（识别为相关但正交问题，在 findings_report 中以 pointer 形式提及一段，单独 WI 处理）

## 预期产出格式

`findings_report.md` 包含：
- 调查结论：A / B / D（及可能的 hybrid）的对比表 + 明确推荐
- 数据和证据：每条对比维度引用源码位置（`packages/daemon-core/src/...`）和文档段落
- 建议：推荐方案的目标架构图（文本/mermaid）、模块边界、状态机、迁移路径分阶段清单
- 限制：未覆盖的边界、推荐结论的适用前提

## 时间与成本约束

- **低成本优先**：不并行 fan-out。research 阶段单 executor 串行调查。
- **执行三段式**：sf-design plan → sf-executor research → sf-design report
- **硬卡点**：进入任何"写代码"环节前必须用户明确同意。investigation 工作流本身不产代码，但下游若进入 design/development 阶段必须暂停征求同意。

## 调查输入材料

### 源码（packages/daemon-core/src/）
- `daemon/Daemon.ts`
- `session/SessionRegistry.ts`（重点：`handleOpenCodeEvent`）
- `session/AgentIdentity.ts`
- `http/HTTPServer.ts`（重点：L913-L1148 事件摄取）
- `project/ProjectManager.ts`
- `recovery/RecoverySubsystem.ts`

### 插件源码（packages/service-management/src/）
- `plugin/reconnecting-daemon-client.ts`

### 架构文档
- `.kiro/specs/service-management/design.md`（L1-L130，多客户端拓扑）
- `docs/archive/OPENCODE_INTEGRATION_BRIEF.md`
- `docs/archive/opencode_specforge_integration_answers.md`（L1-L200，hook 稳定性边界）

### 实证素材
- `.specforge/runtime/state.json`
- `.specforge/runtime/events.jsonl`
- `sf_state_read` 返回的 WI-001 vs state.json 内容不一致现象

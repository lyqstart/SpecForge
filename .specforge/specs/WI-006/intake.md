# WI-006 Intake: SessionRegistry WAL 化（Phase 2 — D 方案核心）

## 变更类型

change_request — 修改现有模块（SessionRegistry / WAL / RecoverySubsystem / HTTPServer）

## 业务背景与动机

这是 WI-002 调查产出的 A+D Hybrid 分阶段迁移路径中的 **Phase 2**。

- Phase 0（方案 A 部分）已由 WI-003 完成：HTTPServer L1137-L1140 把顶层 sessionId 合并进 payload
- Phase 1（WAL/StateManager 单例化 + RecoverySubsystem 依赖注入）已由 WI-004 / WI-005 完成
- **本 WI 完成后**：SessionRegistry 的所有写操作走 WAL-first，daemon 重启后可通过 WAL 重放完整恢复 session bindings

当前问题：
1. SessionRegistry 的 4 个 Map（pendingSessions / activeSessions / projectBindings / aliasMap）仅内存态
2. daemon 重启后插件用旧 sessionId postEvent 路由全 miss → "No session binding found" WARN
3. WAL.createEvent 的 schema_version 硬编码 '1.0'，无演进机制 → 新增 session.* category 前必须先建立协商
4. HTTPServer 吞 WAL 写错 → daemon 在磁盘异常时仍接受事件但状态不持久
5. WAL.readAllEvents 单行 JSON.parse 失败即抛 → events.jsonl 任何损坏导致整个 rebuild 失败

## 变更范围

### 前置：WAL schema_version 协商机制
- 当前：WAL.createEvent L91-L106 的 schema_version 硬编码 '1.0'（C7 隐式契约 (3)）
- 目标：引入 schema_version 协商/演进机制，支持新增 category='session' 事件

### 核心：SessionRegistry WAL 化
1. **新增 WAL event categories**：
   - `session.registered` — registerPluginSession / registerPending
   - `session.bound` — bindProject
   - `session.activated` — activate
   - `session.terminated` — terminate
   - `session.alias_bound` — alias 表建立
   - `session.touched` — touch（高频，需 throttle）

2. **SessionRegistry 所有写方法改为 WAL-first**（参 StateManager.transition L137-L161 模板）：
   - `registerPluginSession` L161
   - `registerPending`
   - `activate` L234
   - `terminate` L257
   - `bindProject` L457
   - `handleOpenCodeEvent` 的 fallback registerPluginSession

3. **新增 `SessionRegistry.startupReplay(events)` 方法**：
   - 从 events.jsonl 读取 category='session' 事件
   - 重放 registered/activated/bound/terminated/alias_bound
   - 恢复 pendingSessions / activeSessions / projectBindings / aliasMap

4. **RecoverySubsystem.checkAndRepair** 在 rebuild 阶段调用 SessionRegistry.startupReplay

### 增强：失败盲点处理（D10-D 盲点 1/2）
5. **WAL 写失败 fail-fast**：
   - 升级 HTTPServer L1108-L1117 当前吞错的 try/catch
   - WAL 写失败 = HTTP 5xx，不接受事件

6. **WAL 坏行容忍机制**：
   - 升级 WAL L115-L130 readAllEvents 的单行错就抛行为
   - 改为"跳过坏行 + 记录"

### 性能：高频事件 throttle
7. **session.touched 类高频事件的 throttle 策略**：避免 WAL 写灌水

### 兼容性
8. **旧 events.jsonl 兼容**：遇到旧文件（无 category='session'）rebuild 时自动跳过

## 不在本 WI 范围

- Property 21 措辞重写（Phase 3 处理）
- 删除老的 detectOldSessions 代码（Phase 3 处理）
- events.jsonl 的 snapshot/compaction 机制（独立 WI，针对长运行场景）
- ProjectManager 的多项目 StateManager 拆分

## 前置条件（已满足）

- [x] Phase 0（WI-003）：HTTPServer L1137-L1140 把顶层 sessionId 合并进 payload
- [x] Phase 1（WI-004 / WI-005）：WAL/StateManager 单例化 + RecoverySubsystem 依赖注入

## 受影响模块

| 模块 | 变更类型 | 影响描述 |
|------|---------|---------|
| `packages/daemon-core/src/WAL.ts` | 修改 | schema_version 协商 + 坏行容忍 |
| `packages/daemon-core/src/SessionRegistry.ts` | 重大修改 | WAL-first 写 + startupReplay |
| `packages/daemon-core/src/RecoverySubsystem.ts` | 修改 | rebuild 阶段调 startupReplay |
| `packages/daemon-core/src/HTTPServer.ts` | 修改 | WAL 写失败 fail-fast |
| 测试文件 | 新增 | e2e 测试覆盖 daemon 重启路由恢复 |

## 风险评估

**高** — 跨 4 个核心模块变更，涉及 WAL schema 演进和所有 SessionRegistry 写路径

## 约束

- 高成本（数周级），串行执行
- 可能需要跨会话续接（上下文耗尽时按 sf_continuity 协议处理）
- 写代码前必须用户明确同意
- development 阶段前需确认 tasks 拆分粒度
- 能并行就并行处理

## 参考资料

- WI-002 research/05-recommendation.md §5.5 Phase 2 + §5.3.1 会话生命周期状态机 + §5.4.2 daemon 重启数据流
- WI-002 research/03-comparison-matrix.md D6-D / D7-D / D10-D

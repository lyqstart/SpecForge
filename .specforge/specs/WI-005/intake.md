# WI-005 Intake — WAL/StateManager 单例化（Phase 1）

## 变更背景与动机

WI-002 investigation 揭示了 daemon 核心架构中的多个隐式契约问题（C1-C10），其中最关键的根因是：
- **WAL 多实例竞态**（C1 隐式契约 (1)）：Daemon.ts L82 持有一个 WAL、StateManager 内部持有一个 WAL、ProjectManager 为每个项目又创建独立 WAL，所有实例可能指向同一 events.jsonl 文件，`_lastSeq` 各算各的
- **RecoverySubsystem 不注入 WAL/StateManager**（C1 隐式契约 (3) / C6 隐式契约 (1)）：导致 fallback rebuild 路径返回 `workItems: []`，覆盖真实 state.json —— 这是 WI-001 "内存幽灵"的精准根因
- **path-resolver 嵌套 statePath**（C1 隐式契约 (2)）：Daemon.ts L53 把 runtimeDir 当 projectPath 传入，PersonalPathResolver 再次拼接出 `<runtimeDir>/.specforge/runtime/state.json`
- **ProjectManager per-project StateManager**（C5 隐式契约 (1)）：每个项目注册时创建独立 WAL + StateManager，与 daemon 全局 StateManager 形成多写者

## 变更范围（Scope）

### 包含
1. **消除 Daemon.ts L82 单独的 `this.wal`**：改为引用 `this.stateManager.getWal()` 或从 stateManager 暴露统一 WAL 实例
2. **修复 path-resolver.ts 嵌套 statePath**：path-resolver.ts 把 runtimeDir 当 projectPath 传入的嵌套问题
3. **RecoverySubsystem 注入 wal + stateManager**（Daemon.ts L54 修复）：修复 WI-001 内存幽灵的精准根因
4. **ProjectManager.ts L63 不再为每个项目创建独立 StateManager**：改为引用 daemon 全局 stateManager 或显式只为多项目场景延迟创建

### 不包含
- SessionRegistry WAL 化（Phase 2 处理）
- Property 21 重写（Phase 3 处理）
- HTTPServer 的 sessionId 合并修复（Phase 0 前置 WI 应已完成）

## 必读素材

| 素材 | 路径 | 用途 |
|------|------|------|
| 推荐方案 §5.5 Phase 1 | `.specforge/specs/WI-002/research/05-recommendation.md` §5.5 | 完整范围、回滚条件、兼容方式 |
| 现状契约表 | `.specforge/specs/WI-002/research/01-contracts.md` | Daemon / StateManager / WAL / ProjectManager / RecoverySubsystem 现状契约（含 9 个隐式契约） |
| 方案对比矩阵 | `.specforge/specs/WI-002/research/03-comparison-matrix.md` | D2-D / D3-D / D4-D / D9-D 维度判定 |

## 期望产出

- 1 个内部重构 PR
- e2e 测试：daemon 重启后 workItems 从 events.jsonl rebuild 正确
- events.jsonl schema 保持不变（向后兼容）
- 旧嵌套位置的 state.json 可作为孤儿文件保留，记录 cleanup 任务到 verification 阶段

## 前置条件

- Phase 0 已完成（HTTPServer.handleOpenCodeEvent sessionId 合并修复）
- SpecForge 工具裂缝修复已完成（避免本 WI 被 Gate 实现缺陷反复阻塞）

## 约束

- **成本**：中等（数天级），串行执行
- **审批**：写代码前必须用户明确同意
- **回滚条件**：若 RecoverySubsystem 真实 rebuild 路径在某种 events.jsonl 状态下抛错（旧 fallback 反而容忍），先 revert 注入部分，其它结构清理保留
- **并行化**：能并行就并行处理

## 受影响功能模块

- `packages/daemon-core/src/daemon/Daemon.ts` — WAL 双实例消除、RecoverySubsystem 注入修复
- `packages/daemon-core/src/daemon/path-resolver.ts` — 嵌套 statePath 修复
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts` — 接受注入的 WAL + StateManager
- `packages/daemon-core/src/project/ProjectManager.ts` — 消除 per-project StateManager
- `packages/daemon-core/src/state/StateManager.ts` — 可能需要暴露 getWal() 方法
- `packages/daemon-core/src/wal/WAL.ts` — 被引用变化

## 关联 Work Item

- WI-001（feature_spec, intake）— 发现幽灵问题的原始 WI
- WI-002（investigation, completed）— 调查根因，产出推荐方案
- WI-003（bugfix_spec, completed）— 工具裂缝修复
- WI-004（change_request, completed）— Phase 0（HTTPServer sessionId 合并）

## 风险初评

- **中高风险**：涉及 daemon 核心组件的实例生命周期变更，影响状态持久化和恢复路径
- **回滚策略**：按 §5.5 Phase 1 (iii)，RecoverySubsystem 注入可独立 revert，结构清理保留

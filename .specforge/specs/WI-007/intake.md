# WI-007 Intake: Property 21 重写与悬空契约清理（Phase 3 — 收尾）

## 变更类型

change_request — 修改现有注释/文档 + 删除废弃代码路径

## 业务背景与动机

这是 WI-002 调查产出的 A+D Hybrid 分阶段迁移路径中的 **Phase 3（收尾）**。

- Phase 0（WI-003）：HTTPServer L1137-L1140 把顶层 sessionId 合并进 payload ✅
- Phase 1（WI-004 / WI-005）：WAL/StateManager 单例化 + RecoverySubsystem 依赖注入 ✅
- Phase 2（WI-006）：SessionRegistry WAL 化 — startupReplay 方法已实现，所有写操作已 WAL-first ✅
- **本 WI（Phase 3）**：收尾清理 — 重写 Property 21 措辞、删除不再被调用的老代码路径、同步文档

当前问题：
1. RecoverySubsystem L13-L17 Property 21 注释仍描述"启动期重连 OpenCode 进程"，但实际行为已变为"启动期 WAL 重放重建 session 状态"（Phase 2 引入的 startupReplay）
2. RecoverySubsystem L443-L523 的 detectOldSessions / reconnectOldSessions 老路径是"网络探测 OpenCode 进程"的实现，Phase 2 完成后该路径已被 startupReplay 替代，成为悬空代码（C6 隐式契约 (4) 证据）
3. .kiro/specs/ 和 docs/ 中提及 Property 21 的文档仍使用旧措辞
4. SpecForge 内部架构文档（如 docs/archive/OPENCODE_INTEGRATION_BRIEF.md）需同步更新

## 变更范围

### 1. 重写 Property 21 注释化不变式
- **位置**：`packages/daemon-core/src/recovery/RecoverySubsystem.ts` L13-L17
- **从**："启动期重连 OpenCode 进程"
- **改为**："启动期 WAL 重放重建 session 状态"
- **依据**：WI-002 research/03-comparison-matrix.md D9-D："Property 21 措辞需要重写" — 性质从"网络探测"变成"纯本地状态重建"

### 2. 删除 detectOldSessions / reconnectOldSessions 老路径
- **位置**：`packages/daemon-core/src/recovery/RecoverySubsystem.ts` L443-L523
- **确认安全**：Phase 2 的 SessionRegistry.startupReplay 已替代此路径的全部功能
- **兼容性策略**：若有外部测试依赖老 detectOldSessions API，保留 API 签名但内部转调 startupReplay

### 3. 更新 .kiro/specs/ 和 docs/ 中 Property 21 相关位置
- 搜索所有提及 "Property 21"、"reconnectOldSessions"、"detectOldSessions" 的文件
- 统一措辞为"WAL 重放重建 session 状态"

### 4. 同步更新 SpecForge 内部架构文档
- `docs/archive/OPENCODE_INTEGRATION_BRIEF.md` 等
- 确保与 Phase 2 的新架构一致

## 不在本 WI 范围

- 任何新增功能（Phase 3 仅做收尾和文档同步）
- events.jsonl 的 snapshot/compaction 机制
- ProjectManager 多项目 StateManager 拆分
- 性能优化或新的测试覆盖

## 前置条件（已满足）

- [x] Phase 0（WI-003）：HTTPServer 顶层 sessionId 合并 ✅
- [x] Phase 1（WI-004 / WI-005）：WAL/StateManager 单例化 + RecoverySubsystem 依赖注入 ✅
- [x] Phase 2（WI-006）：SessionRegistry WAL 化 — startupReplay 已实现 ✅
  - 验证结果：7/7 acceptance criteria PASS（静态分析确认）
  - RecoverySubsystem 已注入 SessionRegistry 并在 checkAndRepair 中调用 startupReplay

## 受影响模块

| 模块 | 变更类型 | 影响描述 |
|------|---------|---------|
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | 修改+删除 | Property 21 注释重写 L13-L17；删除 detectOldSessions/reconnectOldSessions L443-L523 |
| `.kiro/specs/*` | 修改 | Property 21 措辞更新 |
| `docs/*` | 修改 | Property 21 相关文档同步 |
| `docs/archive/OPENCODE_INTEGRATION_BRIEF.md` | 修改 | 架构文档同步 |

## 风险评估

**低** — 主要是删代码 + 写文档/注释，不涉及业务逻辑变更。唯一风险是 detectOldSessions 的外部消费者兼容性（通过保留 API 签名缓解）。

## 约束

- 低成本（数天级）
- 写代码前必须用户明确同意
- 能并行就并行处理

## 期望产出

1. Property 21 注释重写（RecoverySubsystem L13-L17）
2. 老代码删除 PR（detectOldSessions / reconnectOldSessions）
3. 文档同步 PR（.kiro/specs/ + docs/ 中所有 Property 21 引用）
4. 若有外部测试依赖老 API，保留签名转调 startupReplay

## 必读素材（子 Agent 必须读取）

1. `.specforge/specs/WI-002/research/05-recommendation.md` §5.5 Phase 3 — 变更范围精确定义
2. `.specforge/specs/WI-002/research/01-contracts.md` C6 段 — RecoverySubsystem 隐式契约 (4) 悬空契约证据
3. `.specforge/specs/WI-002/research/03-comparison-matrix.md` D9-D — Property 20/21 在 D 方案下的兼容性扩展
4. `.specforge/specs/WI-006/verification_report.md` — Phase 2 验证结果，确认 startupReplay 已就位
5. `packages/daemon-core/src/recovery/RecoverySubsystem.ts` — 需修改的目标文件

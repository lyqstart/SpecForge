# SpecForge Project Rules — WI-002 self-investigation

## 调查对象

本次工作的"项目"是 **SpecForge 本身**（即当前仓库 `D:\code\temp\SpecForge`）。
具体范围限定为 `packages/daemon-core/` 和 `packages/service-management/` 两个包。

## 硬性约束（所有子 Agent 必须遵守）

### 1. 不修改任何业务代码
本次工作流是 **investigation**（调查），不产代码。任何子 Agent 都不得修改：
- `packages/**` 下的任何 `.ts` / `.js` 文件
- 任何配置文件（`package.json` / `tsconfig.json` / `*.config.*`）
- 任何 `.kiro/` 和 `docs/` 目录的现有文档

### 2. 仅允许读取与写入

允许**读取**的范围：
- `packages/daemon-core/src/**`（所有源码）
- `packages/service-management/src/**`
- `.kiro/specs/**` 和 `docs/**`（现有架构文档）
- `.specforge/runtime/**`（实证素材）

允许**写入**的范围：
- `specforge/specs/WI-002/**`（本次调查的所有产物）
- `specforge/archive/agent_runs/<run_id>/**`（子 Agent 自己的 archive）
- 调查中间产物可写在 `specforge/specs/WI-002/research/`

### 3. 用户审批硬卡点

下游若需进入 design / development 阶段写代码，**必须先经用户明确同意**。
investigation 工作流本身不会触发代码写入，但 findings_report 的"建议"段落
不得鼓动 orchestrator 直接进入 development。

### 4. 成本约束

- research 阶段**禁止并行 fan-out**，串行单 executor
- 子 Agent 调度时尽量复用已加载文件内容，避免重复读

## 非功能性约束映射（供 sf-requirements / sf-design 参考）

| 维度 | 约束 |
|------|------|
| 性能 | 不要求基准测试，仅需在 findings 里讨论数量级（如 WAL 写入频率） |
| 可靠性 | 推荐方案必须保留"多客户端会聚点"语义和 daemon 重启后状态可恢复能力 |
| 兼容性 | 推荐方案的迁移路径必须考虑现有 `.specforge/runtime/state.json` 和 `events.jsonl` 的演进 |
| 可观测性 | 推荐方案应说明对现有日志（如 `[SessionRegistry] No session binding found ...`）的影响 |

## 技术栈（仅供参考，无决策）

- Runtime: Bun + Node.js
- 语言: TypeScript（strict mode）
- 包结构: monorepo（`packages/*`）
- 持久化: JSON 文件 + JSONL 事件日志（现状），可能演进到 WAL（待调查结论）

## 备注

完整的 dev-environment.md / prod-environment.md **故意省略**，因为本次是
对 SpecForge 自身代码的调查，不存在独立"目标产品"，不需要技术栈决策流程。

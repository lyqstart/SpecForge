# 契约模型后续事项实施报告

> 实施日期：2026-07-24
> 接手文档：`docs/design/contract-model-followups-handoff.md`
> 基线提交：`b904420352f7ac19a4f223e86870417a9f9e6bfb`

## 1. 事实与架构归属

### CONFIRMED

- daemon 活跃工作流由 `packages/daemon-core` 的配置驱动入口、`state_machine.ts`、`state-coordinator-v11.ts`、`gate-runner-v11.ts` 和 `merge-runner-v11.ts` 共同执行。
- `.specforge/project/**` 仍只能由 Merge Runner 写入；本次实现没有修改仓库内任何 `.specforge/project/**` 文件。
- 契约/命名空间登记的唯一公开写入入口是 `sf_contract_register`，其输出是 Work Item candidate 和 candidate manifest，不直接写 project 真相源。
- 跨模块契约 Schema 已迁到 `@specforge/types`；daemon 读取侧不再依赖已退役的 workflow-runtime Extension Registry 实现。
- 用户级模板、installer registry、workflow renderer 和 daemon handler 已同步到 `contract_change` / `contract_integrity_gate`。

### 实际治理归属

| 能力 | 首要责任层 |
|---|---|
| 轻量契约登记 | Contract / Workflow Skill / Runtime State |
| 反向依赖完整性 | Gate |
| TS/JS 代码对账 | Verification Gate |
| 登记落盘 | User Decision / Merge Runner |
| extension 技术债 | Tool Schema / Tool Handler / Runtime |
| workflow_type 投影 | Tool Handler / Runtime projection |
| tasks 命令格式 | Agent contract / Tasks Gate |

## 2. 实施结果

| Handoff 项 | 能力结论 | 结果 |
|---|---|---|
| 1. 契约完整性 gate | `SUPPORTED` | 新增 hard gate `contract_integrity_gate`。只对本次 registry delta 强制；未修改 registry 时 N/A；空/缺失旧 registry 按 brownfield 空基线处理。删除契约、删除 shared enum 值或修改已登记 surface/rule/owner/interface 时，会扫描 candidate 投影后的 Project Spec，并列出仍使用旧表面的显式 `[contract:...]` 消费方。 |
| 2. AST 代码↔契约对账 | `PARTIALLY_SUPPORTED` | Verification Gate 对本 WI 的 authoritative changed-files delta 执行 TS/JS AST 检查；显式绑定到已登记 shared enum 类型的非法字符串会 hard fail。未支持语言明确列为 warning，不冒充已检查。public interface 与自然语言 invariant 尚无可确定执行的机器 Schema，未伪造覆盖。 |
| 3. 轻量治理车道 | `SUPPORTED` | 新增 `contract_change` / `contract_change_path`。只允许显式、无冲突的 registry-only 分类；不生成 requirements/design/tasks，不进入 implementation，不释放 code permission；仍执行 candidate gates、用户审批、Merge Runner、post-merge verification 和 close。 |
| 4. extension v11/v12 整合 | `SUPPORTED` | 删除 daemon v11/v12 重复实现、旧 handler、旧 wrapper、旧 gate、旧 artifact 写入类型与相关 RC slice。namespace type 与 contract 统一走 `sf_contract_register`。历史 `extension_request` 仅在 Close Gate 保留只读恢复兼容，不能再由公开 artifact writer 创建。 |
| 5. workflow-runtime 死代码 | `SUPPORTED` | 删除 OO `Runtime`、`RuntimeInit`、`StateMachine`、`GateRunner` 及只验证这些死类的测试；同时删除无生产消费者的旧 `ExtensionRegistry` / `ExtensionSubflow`，将仍需的契约类型迁到共享类型包。 |
| 6. merge workflow_type 投影 | `SUPPORTED` | merge 返回投影优先读取 candidate manifest、work_item、trigger 中的权威 `workflow_type`，仅在缺失时按 path 兜底；`change_request` 不再被多对一路径错标成 `feature_spec`。 |
| 7. tasks verification_commands | `SUPPORTED` | Task Planner 与 writing-plans skill 统一使用 `unit/property/integration/e2e/regression` 类型化映射；property 命令必须有 `CP-N` refs。 |
| 8. contract_gap 活体演示 | `INSUFFICIENT_EVIDENCE` | 代码、状态恢复路径和受治理登记机械件已验证；当前环境没有 Bun、没有 live daemon handshake，也没有一次真实 LLM executor 时间线，因此不能把单元/集成测试冒充“Agent 主动 block”的活体证据。 |

## 3. 关键闭环

### 契约登记

```text
显式 registry-only 分类
→ contract_change
→ sf_contract_register 写 candidate
→ candidate gates（含 contract_integrity_gate）
→ 用户审批
→ Merge Runner 写 project 真相源并递增版本
→ post-merge verification
→ close
```

`contract-authoring` 集成测试已实际生成 candidate、记录绑定 candidate/gate-summary hash 的用户审批、调用 Merge Runner、验证正式 registry 与 `project_spec_version=PSV-0002`，并确认 WI 中不存在 requirements/design/tasks。

### 反向依赖

`contract_integrity_gate` 先把同一 manifest 中的 Project Spec markdown candidate 投影到当前 project spec，再检查破坏性 contract delta。因此同一 WI 同步修复消费方可以通过；只改 registry、遗留显式消费方仍引用被删值时会失败并报告具体文件和值。

### AST 覆盖边界

当前确定性规则只判断 TS/JS 中可直接证明的显式类型绑定：

- 有类型标注的变量、参数、属性初始化；
- `as` / `satisfies`；
- 对已知显式类型变量的后续赋值；
- JSDoc 可解析类型。

未显式绑定的普通字符串不猜测；Python/Go/Rust/Java 等未实现语言进入 `unsupported_files` warning。public interface / invariant 若要升级为 hard enforcement，需要先增加结构化、可执行的 contract schema，不能从自由文本 `surface` / `rule` 安全推断。

## 4. 可复核验证

### 通过

- `@specforge/types` TypeScript no-emit build：通过。
- `@specforge/workflow-runtime` TypeScript no-emit build：通过。
- `@specforge/daemon-core` TypeScript no-emit build：通过。
- workflow-runtime v11：14 files，233 tests 全部通过。
- daemon 相关回归：11 files，61 tests 全部通过，包括：
  - contract change 路由与状态边界；
  - contract integrity 反向依赖；
  - TS/JS AST shared enum 对账；
  - approval + Merge Runner 登记闭环；
  - merge workflow_type 投影；
  - HTTP compatibility route；
  - installer/deployment source consistency。
- types：20 tests 全部通过。
- 新增/核心改动文件 Prettier check：通过。
- `git diff --check`：通过。
- 静态消费者审计：生产源码中不存在 `RuntimeInit`、`new Runtime(`、旧 extension subflow handler/wrapper 或 `.specforge/project/extensions/extension_registry.json` 活跃引用。

### 已确认的仓库基线失败

- 全量 daemon 侦察运行观察到大量旧测试仍使用 `intake` / `design` 等废弃状态、依赖 live daemon 或用户目录部署、以及受 sandbox 限制的 HOME 写入；该次运行结果为 83 个 test files 通过、47 个失败，1025 tests 通过、270 个失败、17 个跳过。新增契约测试在同次运行中通过。
- 全量 workflow-runtime 侦察运行有 1581 tests 通过、15 个既有失败，并出现 worker OOM；失败涉及 active WorkflowEngine 旧期望、crash recovery、ESM spy、seal actor 等。本次删除后的 `tests/v11` 定向套件 233/233 通过。
- `v11-agent-skill-contract-alignment.test.ts` 的新增 typed-command 检查通过；同文件既有全局检查仍因未改动的 `sf-workflow-architecture-change/SKILL.md` governance block 缺少 `quick_change` 而失败。

上述基线问题不构成本报告各新增能力“全仓测试全部通过”的证据；本报告没有作此声明。

## 5. 尚缺证据与获取方法

### `contract_gap` 活体演示

需要具备真实 daemon + OpenCode executor 的环境，按以下只读证据口径验收：

1. 将真实 feature WI 推进到 `implementation_running`；
2. 任务要求一个尚未登记的新跨模块 shared enum；
3. 保存 executor 原始输出，确认 `blocked` 与 `blocker_type=contract_gap`；
4. 走独立 `contract_change` 登记、审批与 Merge；
5. 从 StateManager `events.jsonl` 证明原 WI 从合法断点恢复；
6. 保存最终代码与 verification evidence，证明使用合并后的权威值。

应返回完整事件时间线、WI ID、Git/部署版本、daemon handshake/version、工具调用结果和必要脱敏说明。

### 用户级 live 部署一致性

仓库 setup 源、installer registry 与静态一致性测试已经通过；当前环境没有 Bun，且未授权/未执行用户级 installer upgrade，因此 live 用户目录副本状态为 `INSUFFICIENT_EVIDENCE`。需在目标环境运行 installer upgrade/verify 与 SHA256 consistency check 后，才能宣称已部署一致。

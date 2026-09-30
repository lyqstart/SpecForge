# 契约治理 — 未完成事项接手文档（Handoff）

<!-- SPECFORGE_NON_AUTHORITY_NOTICE_3:START -->
> 文档状态：SUPERSEDED HISTORICAL HANDOFF（已被替代的历史交接文件）
>
> 本文件只表示特定时间点的待办和交接背景，不再作为当前开发要求或设计权威。
> 已完成、取消或被后续决策替代的事项不得继续从本文件恢复为要求。
> 当前有效规则以 `docs/design/SpecForge架构一致性治理最终实施方案.md` 为唯一权威。
<!-- SPECFORGE_NON_AUTHORITY_NOTICE_3:END -->

> 生成日期: 2026-07-24
> 面向: 接手这些工作的工程师（无需读原始对话即可理解）
> 关联主文档: `docs/design/specforge-design-governance-contract-model.md`（契约模型设计 + 已完成部分的验证记录 + 变更审计索引）
> 关联规则: `AGENTS.md`（证据先行、架构归属优先、最小但**完整**的治理扩展、**绝不再造死锁**）
> 实施结果: `docs/design/contract-model-followups-implementation-report.md`
> 2026-07-25 增量: fj1 Semantic Closure 生产者—消费者契约治理见
> `docs/design/semantic-closure-contract-governance.md`

## 0. 背景（一页读懂）
SpecForge 是一个用"工作流 + 门禁（gate）+ 受治理写入"来约束 AI 改代码的系统。本轮做了一个**跨模块契约模型**：把"共享枚举 / 不变量 / 公共接口 / 扩展点"登记进项目真相源 `.specforge/project/extension_registry.json` 的 `contracts` 块，并用确定性门禁强制设计/代码引用这些登记过的契约（不许 agent 自编）。

**已完成并验证闭环**（详见主文档）：
- 受治理登记工具 `sf_contract_register`（候选 → gate → 用户审批 → merge 落盘）。
- 设计期对账门禁 `spec_consistency_gate`（校验设计里的 `[contract:KIND:ID owner=OWNER]` 引用是否解析到已登记契约、owner 是否一致）。
- 修复了两个会伤及真相源的 bug：`ensureProjectInit` 每次连接清空注册表、merge 后注册表版本号不同步。
- installer verify 增加 wrapper schema 静态干跑（防"一个 schema 写错拖垮全部工具"）。

**本文件覆盖的是"未完成/待接手"的部分。** 每一项都不是"快速项"，因为它们要么带设计决策、要么直接触碰 **brownfield（存量成熟项目）兼容** 与 **死锁风险**——本项目最忌讳"新增一道门禁却没有恢复路径 → 把流程卡死"（历史上 WI-0001 就是这么卡死的）。

### 术语速查
- **真相源 / project spec**: `.specforge/project/**`，只能由 Merge Runner 写。
- **候选 candidate**: 某个 Work Item 目录下的 `candidates/**`，是"提议"，未生效。
- **gate**: 确定性检查，产出 `gates/<id>.json` 与 `gate_summary.md`。`hard_gate` 拦截，`soft_gate` 告警。
- **workflow_path / workflow_type**: 粗路由（如 `requirement_change_path`）/ 工作流身份（如 `feature_spec`）。
- **brownfield-safe**: 对存量项目/未登记区域优雅降级（warn 不 block），只对新增/改动 delta 强制。
- **契约引用语法**: `[contract:KIND:ID( owner=OWNER)?]`，KIND ∈ {shared_enum, invariant, public_interface, extension_point}。

---

## 1. 完整性 gate（契约变更的反向依赖 / 悬空引用检查）

**问题**
现在的 `spec_consistency_gate` 只校验**当前 Work Item 自己的设计候选**里的契约引用。它抓不到"契约变了、别处引用变悬空"这类问题。典型场景：某个已登记的 `shared_enum` 删掉/改名了一个取值，项目里别的模块设计/代码还在引用旧值——没有任何门禁会发现这些**遗留消费方**。这正是当初审计要解决的"改公用模块必须重构所有消费方"的诉求（设计主文档 §3 影响分析）。

**根因**
- `spec_consistency_gate`（`packages/daemon-core/src/tools/lib/gate-runner-v11.ts`，搜索 `registerGate('spec_consistency_gate'`）的输入是 `resolveWorkItemSpecArtifacts(kind:'design')`——只读本 WI 候选设计，作用域是"单 WI 前向校验"，不是"契约变更 → 全库反向扫描"。
- 系统当前**没有**"契约 delta → 消费方穷举"的机制。

**解决办法（建议）**
新增一道**完整性检查**，在契约（尤其 shared_enum 取值、public_interface 签名）发生变更时：
1. 计算契约 delta（对比 merge 前后的 `contracts` 块：哪些 id/取值/签名被删或改）。
2. 反向扫描全项目规格（`.specforge/project/**` 的 module design/requirements + trace）里的 `[contract:...]` 引用与（进一步）代码里的字面引用，列出所有受影响消费方。
3. 有悬空引用（引用了被删的 id/取值）→ 失败；要求消费方对齐纳入同一受治理变更或显式分阶段迁移，才收口。

复用点：契约读取用 `packages/daemon-core/src/tools/lib/contracts-registry.ts`（`findSharedEnum` / `isRegisteredEnumValue` / `getEnumOwner`）。门禁注册用 `gate-runner-v11.ts` 的 `registerGate` 模式，产出报告用 `makeReport`。
**关键风险（必须先解决，否则复制 WI-0001 死锁）**
- **死锁风险 1**：把它做成新的 *required* gate 后，`sf-v11-gate-run.ts` 里的 `candidateGateSetCoversRequiredGates` / `autoAdvance*` 会检查"所有 required gate 是否产出报告"。若新 gate 没被正确纳入 `required-gates.ts` 的 `getRequiredGates()`，会因"缺 required gate"卡住状态自动推进。改 required 集合务必同步这三处：`required-gates.ts`、各 `configs/workflows/builtin/*.json` 的 gate 组合、`sf-v11-gate-run.ts` 覆盖判定。
- **死锁风险 2（brownfield）**：存量项目大量既有引用可能本就"悬空"（从未登记）。若上线即对存量一刀切硬拦，等于把所有历史债务变成阻断。**必须**：只对本次变更 delta 强制、存量违规基线豁免（grandfather），空注册表/未登记区域 skip（参照 `spec_consistency_gate` 的 brownfield-skip 与主文档 §6）。

**验收**
- 单元：删一个已登记枚举取值 + 造一个引用旧值的设计文件 → gate 失败并列出该消费方；引用全部对齐 → 通过；空注册表 → skip。
- 端到端：一次契约变更 WI，故意留一个悬空引用，确认被拦且给出可执行的对齐指引（不是死路）。

---

## 2. 切片 3b — AST 级代码↔契约对账

**问题**
`spec_consistency_gate` 校验的是**设计文本**里的 `[contract:...]` 标记。它管不到**真实代码**：executor 完全可以在代码里写死一个不在注册表里的枚举字符串、fork 一个本该继承的扩展点、或绕过某个"必经"的不变量（例如"写文件必经 PathService"），只要设计文本没露馅就查不出来。

**根因**
- 契约的"符合规则"对**共享枚举/接口/不变量**本质是**代码层面**的（字面值必须是权威成员、消费方必须正确用接口、必经调用不能绕过），但目前没有任何一处对**改动代码**做 AST 级检查。
- 预防层（`sf-executor` agent 的 `contract_gap` 约定，见 `setup/userlevel-opencode/agents/sf-executor.md`）依赖 agent 自觉；机械兜底目前只到"设计文本引用"这一层。

**解决办法（建议）**
新增一道 verify 期门禁（或扩展现有 verification 阶段），对本 WI 改动的代码做 AST 级对账：
- shared_enum：扫描改动代码中对应字段/常量的**字面量**，必须是注册表登记的取值集合成员。
- public_interface：消费方对接口的调用/实现签名与登记契约一致。
- invariant：静态可判的"必经 Y"（如 PathService）——检测直接文件写而未经服务的调用点。
- 从改动的 `changed_files_audit` / git delta 取"本次改了哪些文件"，只扫 delta（brownfield 友好）。

**边界（诚实标注）**
- **分语言**：AST 解析要按语言实现（TS 可用 TypeScript 编译器 API / ts-morph；其它语言各自）。建议先只做 TS/JS，其它语言留 TODO，且未覆盖语言明确 skip 而不是假通过。
- 这是"较大"项，天然多切片；不要试图一次做全语言全契约类型。

**风险**
- 同样的 brownfield 死锁风险：只对 delta 强制，存量豁免；未支持的语言/构造 skip。

**验收**
- 单元：TS 文件里写一个非登记枚举字面量 → 失败；改成权威取值 → 通过；未支持语言 → skip。

---

## 3. 契约登记轻量治理车道

**问题**
往注册表加**一个枚举**这种纯粹的"项目规格登记"，目前被迫走完整的 `change_request`（`requirement_change_path`）：intake → 影响分析 → **requirements 候选 → design 候选 → tasks 候选** → 4 类候选门禁 → 审批 → merge，实测约 30 分钟、要跑多个子代理、4 轮 gate（见主文档 §16 Step 2）。这让契约模型"能用但很难用"。

**根因**
- `required_files_gate`（`gate-runner-v11.ts`）对非 `code_only_fast_path` / 非 `rollback_path` 的路径，在 `candidate_phase=full` 下**要求 requirements+design+tasks 全套候选**。契约登记本质只产出一个 `extension_registry.json` 候选，却被这条规则要求补齐整套 feature 规格。
- 没有一条"项目规格微变更"的专用工作流路径：既需要**用户审批 + merge**（因为它写真相源），又不该需要 requirements/design/tasks。现有 `code_only_fast_path` 恰好相反（跳过审批/merge），不适用。

**解决办法（建议）**
新增一条受治理的"契约/项目规格微变更"路径（例如 `contract_change_path`，或复用/收窄 `design_change_path`）：
- 状态机：`created → intake_ready →（candidate_prepared）→ gates_running → approval_required → approved → merge → closed`，**不经过 requirements/design/tasks 生成**。
- `required_files_gate`：为该路径豁免 requirements/design/tasks 候选要求（参照它已对 `code_only_fast_path`/`rollback_path` 的豁免写法：`gate-runner-v11.ts` 里 `if (ctx.workflowPath !== 'code_only_fast_path' && ctx.workflowPath !== 'rollback_path')`）。只要求 `candidate_manifest` + `extension_registry` 候选。
- 保留：`candidate_manifest_gate` / `path_policy_gate` / `schema_gate` / `spec_consistency_gate` / 用户审批 / merge（因为它写真相源，审批不能省）。
- 分类：`sf-orchestrator` 识别"纯契约登记/项目规格微变更"→ 选该路径。注意本项目对**工作流身份边界**是失败关闭的（Step 4 见过编排器拒绝把 feature 硬塞 quick_change），所以新路径的准入条件要写清楚、可判定，避免被滥用来绕过真正需要 design 的变更。

**需要改的文件（起点）**
- `packages/daemon-core/src/tools/lib/state_machine.ts`（`WORKFLOW_PATH_TO_TYPE` / `WORKFLOW_TYPE_TO_PATH` / `FINAL_TRANSITIONS`）。
- `configs/workflows/builtin/`（新增该工作流定义 JSON，参照 `quick_change.json` 但去掉 requirements/design/tasks、保留审批+merge）。
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts`（`required_files_gate` 豁免）与 `required-gates.ts`（该路径的 gate 组合）。
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts`（`VALID_WORKFLOW_PATHS` / `USER_APPROVAL_REQUIRED_PATHS` 要包含新路径）。
- `sf-orchestrator` agent 的分类规则（`setup/userlevel-opencode/agents/sf-orchestrator.md`）。

**风险**
- 别把"需要 design 的真实变更"误导进轻量车道（治理身份被稀释）。准入判定要保守、失败关闭。
- 改 `VALID_WORKFLOW_PATHS` 等集合是全链路的，要同步 gate/decision/merge 各处校验，否则会在某一环 fail-closed 卡住。

**验收**
- 用轻量车道登记一个枚举：无需 requirements/design/tasks，仍经用户审批 + merge 落盘；`spec_consistency_gate` 照跑；全程无死锁。

---

## 4. extension 子系统 v11/v12 整合（技术债）

**问题**
仓库里存在**两套**"扩展登记"机制，互不相通、且都不能真正完成"登记并落盘到 project"：
- daemon v11：`packages/daemon-core/src/tools/lib/extension-subflow-v11.ts` / `extension-registry.ts` / `sf-v11-extension.ts`（写候选 + ExtensionGate，但缺"批准后写 project"步、疑似无 opencode 入口真正驱动）。
- opencode v12 wrapper：`setup/userlevel-opencode/tools/sf_extension_subflow.ts` + `packages/daemon-core/src/tools/lib/extension-subflow-v12.ts`（纯内存、不落盘，且 registry 路径指向**不同**位置 `.specforge/project/extensions/extension_registry.json`，与真实文件 `.specforge/project/extension_registry.json` 不一致，见主文档 §14.4）。

**根因**
历史上两次迭代（v11/v12）留下的并行实现，没有收敛；`sf_contract_register`（本轮新增）已经提供了一条**能用的**受治理登记路径（候选 → gate → 审批 → merge），使这两套 extension 子系统的"登记"职责变得多余或重复。

**解决办法（建议，务必先审计再删）**
1. **使用审计**：确认 opencode 里 `sf_extension_subflow` wrapper 实际调用的是哪个 daemon handler、是否有活跃调用；确认 `sf-v11-extension` 是否有入口。用 `grep` + 运行时日志（`.specforge/logs/tool_calls.jsonl` / runtime events）判定活线。
2. **保留一条**与 `sf_contract_register` 一致的干净治理路径（若类型命名空间登记也应走同一 候选→gate→审批→merge 管道）。
3. **删除死的/重复的**，并统一 registry 路径（消除 `.specforge/project/extensions/...` 这个不一致路径）。

**风险**
- 删除前必须确认无活跃消费者（含 opencode agent 提示词里对这些工具的引用）。
- 属跨"工具 + handler + wrapper + 路径约定"的重构，要一次性保持一致。

**验收**
- 只剩一条扩展/类型登记路径，与契约登记同管道；死代码删除后全套测试 + installer verify 通过。

---

## 5. workflow-runtime 死代码删除（审计已完成，删除待办）

**问题**
`packages/workflow-runtime/src/v11/runtime/` 下的 `Runtime` / `RuntimeInit` / `StateMachine` / `GateRunner`（OO 风格运行时）与 daemon 实际使用的运行时**并存两套**。本轮排障中**两次**被这些死代码误导（`RuntimeInit` 的"无条件写模板"、`StateMachine` 的"只能 resume 到前期状态"的转换表——都不是 daemon 的真实行为）。

**根因 / 审计结论（CONFIRMED）**
- daemon 活跃路径 = 配置驱动的 `WorkflowEngine`（`packages/daemon-core/src/daemon/Daemon.ts` 引入，经 `createV11WorkflowEngine` + `configs/workflows/builtin/*.json`）+ daemon-core 自己的 `gate-runner-v11.ts` / `state_machine.ts`（`FINAL_TRANSITIONS`，**权威转换表**）/ `merge-runner-v11.ts`。
- `v11/runtime/` 的那几个 OO 类**从不被 daemon 实例化**（`packages/*/src` 全库无 `new Runtime(`；`@specforge/workflow-runtime` 的真实消费者只有 `contracts-registry.ts` 引类型、`Daemon.ts` 引 `WorkflowEngine`）。
- **已处置**：已给这三个类加 `@deprecated` 标注，指向活线、并写明两处已知误导（提交 `574f67f`），防止后人再误读。

**解决办法（删除）**
1. 跨包消费者审计：这些类经 `packages/workflow-runtime/src/v11/index.ts` 导出为公共 API，且其它包 `node_modules` 里有该包副本；删除前 grep 全仓（含 tests、node_modules 引用）确认无真实消费者。
2. 删除类 + 从 `v11/index.ts` 去掉导出 + 删除/迁移该包自身的 `Runtime`/`StateMachine`/`GateRunner`/`RuntimeInit` 相关测试（`packages/workflow-runtime/tests/**`）。
3. 构建验证：`bun run build`（workflow-runtime 先于 daemon-core）+ 全套测试通过。

**风险**
- 删公共导出可能断其它包构建；务必先审计消费者。低价值高风险，单列为独立 WI。

**验收**
- 死代码删除后：全仓构建 + 测试通过；`grep -r "RuntimeInit\|new Runtime(" packages/*/src` 为空；文档更新。

---

## 6. `sf_merge_run` 返回值 `workflow_type` 投影错标（Step 2 观察 a）

**问题**
一个 `change_request` 的 WI，在 `sf_merge_run` 返回的 `state_auto_advance` 里 `workflow_type` 被标成 `feature_spec`（而权威 `state.json` 是正确的 `change_request`）。不阻断流程，但会误导读返回值/日志的人或逻辑。

**根因**
`workflow_type` 在部分返回路径是**从 `workflow_path` 反推**的，而反推是多对一：`packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts` 的 `workflowTypeFromPath()` 把 `requirement_change_path` 映射成 `feature_spec`——但 `change_request` **也**用 `requirement_change_path`。仅凭 path 无法区分 `feature_spec` 与 `change_request`，于是反推得到错误身份。

**解决办法**
在这些返回/事件投影处，优先取**权威 workflow_type**（`work_item.json` / 运行时状态里记录的 `workflow_type`），仅在缺失时才用 `workflowTypeFromPath` 兜底。检查所有调用 `workflowTypeFromPath` 及构造 `state_auto_advance` / `transitionContext.workflow_type` 的地方（`sf-v11-gate-run.ts`、`merge-runner-v11.ts` / `sf-v11-merge.ts`、`state-coordinator-v11.ts`）。

**风险 / 验收**
- 低风险（只影响返回值投影，不动权威状态）。验收：change_request WI 的 merge 返回 `workflow_type=change_request`。

---

## 7. tasks.md `verification_commands` 旧格式 warning（Step 2 观察 d）

**问题**
Step 2 中 tasks 门禁对 `tasks.md` 的 `verification_commands` 报了 2 个**格式 warning**（非阻塞，未影响合并）。

**根因（待确认）**
`tasks.md` 里 `verification_commands` 用了旧格式，与当前 tasks 门禁/解析期望的格式不符。具体解析在 `packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts`（tasks 门禁）附近——**接手时请先核对**该 warning 的确切来源与期望格式，不要仅凭本条描述下结论（本项目要求证据先行）。

**解决办法**
统一 `tasks.md` 模板/生成器（`sf-task-planner` 产出）与门禁解析器对 `verification_commands` 的格式约定；把 warning 要么消除、要么明确为可接受。

**风险 / 验收**
- 低风险。验收：新生成的 tasks.md 不再触发该 warning，或门禁明确接受新旧两种格式。

---
## 8. `contract_gap` 实现期闭环 — 活体演示（低优先级）

**问题**
契约模型"预防半场"的最后一环——executor 在**实现代码时**遇到"需要一个未登记的跨模块共享值"，应当返回 `blocked(blocker_type: contract_gap)` 而**不是自编**，随后走受治理登记，再从断点 resume 用权威值实现——尚未做**活体端到端演示**。

**根因 / 现状（重要：机械件已验证，不死锁）**
- 这条闭环的机械件都已确认可用：
  - 状态机支持 `implementation_running → blocked → implementation_ready → implementation_running`（`packages/daemon-core/src/tools/lib/state_machine.ts` `FINAL_TRANSITIONS`）——**不死锁**。
  - 受治理登记（`sf_contract_register` → gate → 审批 → merge）已端到端验证（主文档 Step 2）。
  - 验证期机械兜底 `spec_consistency_gate` 已验证：无论 executor 老实报 gap 还是自编，未登记/owner 不符的引用都会被确定性拦下（主文档 Step 3）。
- 唯一未演示的是 **agent 行为本身**（executor 主动识别缺口并 block，而非自编）——这是非确定性 LLM 行为，其安全网已证。

**解决办法（演示步骤）**
驱动一条 `feature_spec` WI 到 `implementation_running`：任务需要一个**未登记**的新枚举（如 `DeviceLinkState`）→ 观察 executor 报 `blocked(contract_gap)` → 用 `sf_contract_register` 登记（或既有 owner 模块走治理）→ resume 回 `implementation_running` → 用权威值实现。契约引用/blocker 语义定义见 `setup/userlevel-opencode/agents/sf-executor.md`（搜 `contract_gap`）。
**风险 / 验收**
- 成本高（要跑完整 feature_spec 到实现态）、依赖 agent 当场表现；价值主要是"信心演示"，机械正确性已由上面几条兜住。可最后做。
- 验收：一次真实 WI 里出现 `blocked(contract_gap)` → 登记 → resume → 实现用权威值的完整时间线（`.specforge/runtime/events.jsonl` 可查）。

---

## 9. 通用注意事项（给接手人）

1. **证据先行**：不要把历史报告/本文件当作事实终点。关键结论回到源码、配置、`.specforge/runtime/events.jsonl`、git 对象、运行结果核对。本文件标了"待确认"的地方（如第 7 条）尤其要自查。
2. **绝不再造死锁**：任何新增 gate/检查都必须自带恢复路径；对 brownfield/存量违规必须优雅降级（warn/skip，只对 delta 强制）。参照 `spec_consistency_gate` 的 brownfield-skip 与主文档 §6。
3. **改真相源只能经 Merge Runner**；工具只写候选。别手改 `.specforge/project/**`。
4. **同步四处一致**：core 源码 + dist（服务器 pull 后 rebuild）+ 用户级 wrapper（`bun scripts/sf-installer.ts upgrade --force` + `verify`）+ 相关测试。
5. **改 required gate 集合**要同步：`required-gates.ts`、`configs/workflows/builtin/*.json`、`sf-v11-gate-run.ts` 的覆盖/自动推进判定——否则会卡死状态推进。
6. **两套状态机/运行时**：daemon 权威是 daemon-core 的 `state_machine.ts` + `WorkflowEngine`；`workflow-runtime/v11/runtime/**` 已 `@deprecated`，别当权威。
7. 部署：源码改在 Windows（`d:\code	emp\SpecForge`），远程 Linux 服务器 svr3 部署（`git pull` + `bun run build` + tmux 重启 daemon；用户级改动另需 installer upgrade + verify）。单一维护者，不走 PR。

## 10. 优先级建议
1)（可用性痛点，纯增量、风险可控）第 3 条 轻量车道 → 2) 第 1 条 完整性 gate（先定 brownfield 策略）→ 3) 第 6/7 条 小修 → 4) 第 2 条 AST（分语言多切片）→ 5) 第 4/5 条 债务清理 → 6) 第 8 条 活体演示。

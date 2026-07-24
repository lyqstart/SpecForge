# SpecForge 设计治理能力强化 — 契约模型与落地方案

> 状态: DRAFT（讨论汇总，待评审后按切片实施）
> 生成日期: 2026-07-24
> 适用范围: SpecForge 自身治理链（sf-design agent / gates / skills / runtime / project-spec 契约记录）
> 原则依据: AGENTS.md（证据先行、架构归属优先、最小但完整的治理扩展、修能力不硬编码特例）

---

## 0. 定位

本方案源于对 `sf-design` 设计 Agent 的审计与一系列讨论。讨论中所举的例子（跨模块枚举取值、PathService 使用约定、公用模块变更）是**症状标本，不是待办清单**。目标是建立一个**通用治理能力**，覆盖以下一整类问题及未来所有同类问题：

1. 设计脱离真实架构（在架构外改、凭空发明）；
2. 违反跨切面不变量/约定（PathService、分层、状态权威等）；
3. 偏离跨模块共享契约（枚举/接口/DTO——自编或不引用权威定义）；
4. 契约/架构变更没有完整传播到所有受影响的代码/数据（悬空引用、消费方漏迁移）；
5. 没有闭环强制（要么没抓到，要么抓到就甩给用户）。

这是一次 SpecForge 自身的最小但完整的治理能力扩展，应按治理切片实施，不硬编码特例。

---

## 1. 统摄性不变量（方案宪法）

> 任何变更完成后，该变更触及（或被触及）的每一条**已登记契约**，都必须与**代码和数据**处于一致状态；一致性由**确定性检查**在**设计 / 实现 / 验证**三点强制；达成一致由**闭环恢复**驱动，只有遇到真正的决策 / 授权 / 证据缺口才升级给用户。

---

## 2. 契约模型（机制通用，规则可注册）

一小组**契约类型**，每种自带同一“五元生命周期”：

```
声明(注册表) → 符合规则(代码怎么算遵守) → 影响/传播规则(改它波及什么)
→ 强制点(设计/实现/验证哪一处查) → 恢复路由(违反了怎么自动回收)
```

| 类型 | 符合规则 | 变更影响 | 可校验性 |
|---|---|---|---|
| 不变量 / 约定（X 必经 Y、分层、状态权威） | 静态 / AST 机械校验 | 找出所有违反点 | 机械 |
| 共享取值集（枚举 / 状态 / 错误码） | 引用必须是权威成员 | 反向引用扫描 + 穷尽性 + 持久化数据 | 机械 |
| 公共接口 / API 契约（签名 / 类型 / 事件 / DTO） | 消费方正确使用 | 反向依赖穷举消费方 | 机械（语义变更需评审） |
| 扩展点（port / interface） | 实现 + 注入扩展，不 fork | 新实现登记 | 机械 + 评审 |
| 所有权（模块 owns X） | 仅 owner 定义 / 修改 | 跨模块写入告警 | 机械 |

- **新约定 = 注册一条新条目**，通用机器自动适用，不加特例代码。
- **边界（诚实标注）**：通用性在框架 / 生命周期，非 100% 自动。每条契约标注“机械可校验（gate 硬拦）”或“仅语义可审（设计门禁 + 评审）”。

**契约文件装什么**：上述 4 类机器可读注册表 + `architecture.md` / `decisions.md` / `glossary.md` 三类人读叙述。**当前实现细节一律不进**（那是代码，进了必漂移）。

**事实 vs 契约（来源不同）**：

| 维度 | 权威来源 | design 怎么取 |
|---|---|---|
| 事实（真实组件、调用链、当前实现） | 代码 / 配置 / 运行时（ground truth） | 按任务范围读相关模块，不读全部 |
| 契约 / 约定 / 意图 | 策展的权威记录（注册表 + 叙述） | 每次都读（便宜、确定） |

---

## 3. 责任层 — 改在哪里

- **契约记录（真相源）**：落在现有 `.specforge/project/`（叙述 md + 机器可读 JSON 注册表）；播种 / 变更走候选 → gate → 审批 → 合并；`normalizeModuleRegistry` 作 bootstrap 入口。
- **sf-design agent**：硬规则——跨模块共享契约 / 枚举 / 接口必须引用权威定义，禁止自编；需要新共享取值 = 跨模块契约变更，走 system_governance / owning module；能沿扩展点扩展就优先扩展以缩小影响半径。
- **Gate（核心确定性对账）**：
  - 强化 design gate（已确认它能独立判定 system_governance、逼出七章节 + capability_verdict，不能自声明绕过）；
  - 把 `spec_consistency_gate` 从 MVP 空壳做成**真实的代码↔契约对账**（枚举成员、路径服务、公共接口引用、所有权），共享契约冲突升 hard_gate；
  - 新增**完整性 gate**：契约变更后**无悬空旧引用、消费方全部对齐**才收口。
- **影响分析**：契约变更必须先分“动的是公共契约 / 语义 还是 内部实现”；仅前者触发**全库反向依赖扫描**穷举消费方，覆盖签名 / 类型 / 枚举 / 事件 / 语义 / 持久化数据 / wire format；全部消费方重构纳入同一受治理变更或显式分阶段迁移。
- **Skill（workflow 编排）**：少量——接入强化 gate、定义契约 gate 失败的闭环打回分支、保证影响分析 + 消费方重构进 tasks、架构变更路由到 architecture-change。
- **Runtime / Orchestrator**：闭环恢复路由 + 架构变更调度（见 §4、§5）。

---

## 4. 闭环恢复路由（每道检查必须自带，否则就是新死锁）

| 失败类型 | 处置 | 停给用户？ |
|---|---|---|
| Agent 可修（正解已知、无需新授权） | 自动打回责任 Agent 修 → 重跑 gate（**带次数上限**，超限才升级） | 否 |
| 需要决策（无权做的选择，如新增跨模块取值） | 走治理决策点 | 是（合理） |
| 证据不足 / blocked | 补证据 / 调查 | 是（合理） |

复用 HardStop 已有分类（operator_error 同轮自动恢复）。目标：把“停”压缩到真决策，其余自动恢复，决策后自动续跑。

---

## 5. 架构变更路由（按影响半径，自动驱动到审批点）

- **局部、仅本功能需要、不跨模块** → **同 WI 内升级**：solution_design → system_governance，workflow_path → architecture_change_path，范围变更需重新审批。
- **跨模块 / 动共享契约 / 独立价值 / 高影响** → **新开受治理架构变更 WI** + 依赖 + 原 WI **自动 resume**。
- 两者都自动驱动到“合并进真相源需审批”这个**合法停点**，批完自动续跑；不甩“你自己想架构”给用户。

---

## 6. 与现有（成熟）项目融合 — 防死锁核心

成熟项目（如 fj1）代码成熟但契约注册表空 / TODO。直接强制消费空注册表 → 要么全卡死、要么空过。融合策略是必需项：

1. **发现 + 策展增量播种**注册表，不大爆炸；或惰性采纳（碰到哪块登记哪块）。
2. **未登记区域优雅降级**：已登记违反 = 硬拦；未纳入治理 = warn 不拦。
3. **存量违规基线豁免（grandfather）**：记为已知债务，**只对新增 / 改动 delta 强制**——绝不对存量一刀切硬拦（否则复制 WI-0001 死锁）。
4. **分阶段上线**：observe/warn → delta 强制 →（债务清完）全局强制。
5. 全部走现有 project-spec 容器与治理。

---

## 7. 验证与测试

- 单元：每类契约的符合规则 + 影响规则；完整性 gate 的“悬空引用检测”。
- 属性 / 回归：把**枚举、PathService、公用模块**三个例子做成**验收用例**，证明通用机制覆盖它们。
- 闭环：gate 失败 → 自动打回 → 重跑 → 上限升级 的端到端。
- 融合：空注册表不死锁、存量违规不阻断、delta 违规被拦。
- 一致性：core 源码 + dist + 用户级 wrapper + installer + 各 skill 同步。

---

## 8. 动手前必须先核验的证据项（evidence-first，防止再造死锁）

1. **闭环缺口 A**：gate 失败 → orchestrator 自动打回 Agent → 重跑，是真自动还是会停给用户？（读 orchestrator 循环）
2. **闭环缺口 B**：跨 WI 依赖 + 原 WI 自动 resume 是否端到端实现？（读跨 WI 依赖 / resume）
3. **各 workflow skill 当前步骤序列**：是否已含这些门禁，需插入还是仅指向？
4. 注册表容器现有结构 / `extension_registry.json` 现状。

---

## 9. 实施切片（从小到大，每片独立可验证可闭环）

1. **切片 1（最小、最急）**：sf-design 加共享契约 / 枚举硬规则 + `spec_consistency_gate` 做实（枚举成员 + 所有权对账） + 测试。附带闭环打回分支。
2. **切片 2**：契约注册表 schema + 发现 / 播种工具 + 未登记降级 + 存量豁免 / delta 强制。
3. **切片 3**：契约变更影响分析（反向依赖扫描） + 完整性 gate。
4. **切片 4**：闭环恢复路由补齐（视 §8 核验结果） + 架构变更 in-flow / 新 WI 路由。
5. **切片 5**：skill 编排接入 + 分阶段上线开关。

---

## 10. 已确认的既有事实（审计证据，支撑本方案）

- `sf_design_gate_core.ts` 的 `evaluateSystemGovernanceRequirement` **从 trigger_result 分类独立判定 system_governance**，不依赖 Agent 自声明，防绕过 —— 架构优先在“治理是否显著”这层已被硬拦。
- `spec_consistency_gate`（`gate-runner-v11.ts`）当前是 **soft_gate + “MVP weak implementation”**，实现只 `passed: true`，**不做任何跨模块一致性校验** —— 这是 ③ 缺口的直接证据。
- sf-design agent 当前有 MODULE_CODE 身份一致性约束，但**无**“跨模块共享枚举 / 取值必须引用权威定义、禁止自编”的规则。

---

## 建议下一步

按 evidence-first，先完成 §8 的核验（尤其两个闭环缺口 + skill 步骤序列），再动切片 1；确认“加了 gate 是否真能自动闭环”，避免重蹈 WI-0001 死锁。

---

# 补充（评审讨论 2026-07-24）

## 11. 契约权限模型（谁能改、怎么保证落实）

契约是 project 真相源（`.specforge/project/**`）的一部分，遵循与项目规格相同的权限链（依据 `write-guard-v11.ts`：普通 Agent 写 `.specforge/project/**` 属违规）：

| 环节 | 角色 |
|---|---|
| 提议（写候选） | `sf-design` 写 `candidates/project/modules/<M>/…` |
| 决策（批准） | 用户，经 `sf_user_decision_record`；跨模块/共享契约变更必须用户批准 |
| 落盘（机械写真相源） | **只有 Merge Runner** 能写 `.specforge/project/**`，其余被 write-guard 拒 |
| 类型命名空间 | `extension_registry.json` 经 Extension Subflow（`sf-extension`）；design 禁止直接改 |

- **结论**：无单个 Agent 能直接改契约，必须 `design 提议 → gate → 用户批准 → merge runner 落盘`。消费方 WI 无权写别的模块拥有的契约定义。
- **新增缺口**：每条契约需绑定 `owner`（哪个模块拥有该枚举/接口/不变量），并强制“消费方 WI 不得修改 owner 的契约”。

**落实保证（多层）**：write-guard 机械写权限（最强，落盘后不可手工改）→ 三点确定性对账 → 完整性 gate → 闭环恢复 → 治理更新路径。当前主缺口：`spec_consistency_gate` 是空壳，第 2 层“代码符合契约”尚无保证。

## 12. 契约与规格文档的关系 + 文件映射

契约有两半：**可强制的真相（机器可读注册表，gate 读它对账）** 与 **人读的意图与应用（叙述规格，引用契约）**。原则：**叙述文档引用契约，不得复述权威取值**（否则漂移）。

| 契约概念 | 落到的文件 | 现状/缺口 |
|---|---|---|
| 类型命名空间 | `extension_registry.json` | 存在，但只登记类型名 |
| 共享取值集（枚举/状态/错误码） | **扩展 `extension_registry.json`**（新增 `shared_enums`） | 缺口（③核心） |
| 不变量/约定（PathService/分层） | 机器可读：`extension_registry`（新增 `invariants`）；叙述：`architecture.md` | 缺口 |
| 公共接口/API 契约 | 机器可读：`extension_registry`（新增 `public_interfaces`）；叙述：`modules/<M>/design.md` | 缺口 |
| 扩展点 | `extension_registry`（新增 `extension_points`） | 缺口 |
| 所有权（每条契约 owner） | `extension_registry`（新增 `contract_ownership`）+ `spec_manifest`（模块级已有） | 缺口 |
| 决策（为什么） | `decisions.md` | 未填 |
| 索引/范围化 | `design_index.md` / `trace_matrix.md` | 未填 |

- **衔接**：契约作为 project 真相源天然走现有 候选→gate→审批→merge 管道，不需新管道。
- **建议（reuse 而非另起）**：把机器可读契约**扩展进 `extension_registry.json` 的 schema**（新增上述命名空间），复用现成 Extension Subflow + gate + merge（= `extend_existing`）。
- **注意**：连 SpecForge 自身仓库的 architecture/design_index/glossary/decisions 都是 TODO 占位、extension_registry 全空——机制无种子数据，印证 §6 播种策略连 SpecForge 自身也要用。

## 13. 两个 Agent 契约驱动 + contract_gap 闭环（落实的预防半场）

“落实” = 预防（agent 按契约）+ 检测（gate 对账），两半缺一不可（“agent 应当遵守”正是之前失败的东西，必须 gate 兜底）。

**现状证据**：
- `sf-executor` 读 TASK 合同 + `project-rules.md` + **相邻代码**，**不读契约注册表** → 这是它照局部代码编造/误用跨模块枚举的根源。
- `sf-design` 只为类型登记读 `extension_registry`，无“必须引用权威取值/接口、禁自编”硬约束。

**增量**：
- **sf-design**：契约注册表列为强制输入；设计候选必须引用契约 id；禁止自编共享取值/接口。
- **sf-executor**：契约注册表 + 设计的契约引用列为强制输入；实现必须用被引用的权威值/接口/不变量；**新增 `blocker_type: contract_gap`** —— 需要契约里没有的共享取值/行为时 `blocked` 上报，**不得发明**。
- **contract_gap 闭环**：executor 遇缺口 → `blocked(contract_gap)` → orchestrator 路由到 owner 模块的受治理契约变更（design 提议→审批→merge 落盘）→ 契约更新后原 TASK 自动 resume 用权威值实现。把“自己编”从物理上堵死：要么用权威值，要么走治理把它变成权威值。
- **为什么两个都要**：只 executor 按契约 → design 可能合法写出越界设计被忠实实现；只 design 按契约 → executor 边写边偏离。design 最早最便宜、executor 最后一道预防。

---

# 14. §8 证据核验结果（2026-07-24，含对方案的修正）

四项均以一手源码/配置证据核验。

## 14.1 闭环缺口 A（gate 失败自动打回）— 结论：基本已实现（对我们要扩展的 gate 有利）
- `configs/workflows/builtin/*.json`：`gates_running --fail--> gates_failed --> candidate_preparing`，`retry: {maxAttempts:3, onExhausted:"blocked"}`；close gate `verification_done --fail--> implementation_running`，retry 3。`StateMachine.ts` LEGAL_TRANSITIONS 允许该回环。
- `sf-orchestrator.md`：门禁失败先判根因——候选内容/结构错 → 重调责任 Agent 修同一候选、重跑门禁;工具/契约/路径/运行时错 → 停业务流、重调 sf-design 更新 capability_verdict、先修治理链。
- SKILL 上限:`sf-workflow-feature-spec/SKILL.md` 阶段 5b“每阶段最多一次修复,失败后报阻塞”。
- **对方案的意义**:把 ③ 的契约对账放进 `spec_consistency_gate`(候选门禁簇)和 close gate,**自动骑用现有打回回环**——契约违规被 gate 抓到 → 自动回 candidate_preparing → sf-design/executor 修 → 重跑。**Gap A 对我们要动的 gate 基本已闭合。**
- 残留:`merge_ready_gate/post_merge_gate/code_permission_release_gate` 失败直接 `blocked`(可恢复但不自动回环);“每阶段一次修复”上限对迭代式契约修复可能偏紧(可调)。

## 14.2 闭环缺口 B（跨 WI 依赖 + 自动 resume）— 结论：未实现（**修正 §5**）
- 无 WI↔WI 依赖图、无“前置 WI 关闭即自动 resume 依赖 WI”。只有**单 WI 内** blocked→resume(extension subflow `recoverMainFlow`、HardStop `resume_from_step`、手动 blocked→resume)。
- `architecture_change` 是分类期选定的 **workflow_type(in-flow)**,不是被 spawn 并等待的子 WI。
- **修正 §5**:架构变更**默认走 in-flow 升级(Model A)**——同一 WI 升 system_governance / architecture_change_path。**Model B(独立架构 WI + 依赖 + 自动 resume)当前不被支持**,它本身需要先建“跨 WI 依赖”能力(更大扩展);过渡期只能**手动排序**(功能 WI 置 blocked/superseded → 单独架构 WI → 新功能 WI),不是自动。是否要建跨 WI 依赖能力,列为独立后续决策。

## 14.3 工作流步骤序列 — 结论：已实现，但 refactor 缺 spec_consistency（**新增修正**）
- `pre_implementation_gates` 组合含 `spec_consistency_gate` 的:feature_spec、design_first、change_request、architecture_change;**refactor.json 缺 `spec_consistency_gate`**。
- design 在候选门禁内校验(无独立 design 状态);强化 `sf_design_gate_core` 骑用现有候选门禁。
- **修正 §9 切片**:切片 1 把 `spec_consistency_gate` 做实后,**同时要把它加进 `refactor.json` 的组合**(重构常动共享契约,不能漏)。

## 14.4 extension_registry 归属 — 结论：已实现，验证“扩展它”为正确 reuse 路径
- 治理写路径:sf-extension 提候选 → ExtensionGate(hard) → 用户决策 → Merge 写 `.specforge/project/extension_registry.json`;`PathPolicy` **硬拦** agent 直写(`agent_cannot_write_extension_registry`)。
- **对方案的意义**:把契约命名空间(`shared_enums/invariants/public_interfaces/extension_points/contract_ownership`)**扩展进 extension_registry.json**,直接复用这套 governed subflow + hard gate + merge + PathPolicy 硬拦 → 名副其实的 `extend_existing`,并继承写权限保证。
- **动手前须先解决的不一致**:`extension-subflow-v12.ts` 指向**不同路径** `.specforge/project/extensions/extension_registry.json`,而 v11 与实际文件用 `.specforge/project/extension_registry.json`。**扩展 schema 前必须先确认 v11/v12 哪个是活线**,否则改错地方。

## 14.5 核验小结对切片的影响
- 切片 1(③)可**直接骑用现有 gate 打回回环**,风险低;做实 `spec_consistency_gate` + 补进 refactor 组合 + sf-design/executor 契约驱动。
- 架构变更**只用 in-flow 升级**;跨 WI 依赖自动 resume 不在近期范围。
- 扩展 extension_registry 前,先裁决 v11/v12 registry 路径不一致。

---

# 15. 实施进度（切片 1）

| 步骤 | 内容 | 状态 | 提交 |
|---|---|---|---|
| 1 | 契约注册表容器(schema `contracts` 块可选 + `contracts-registry.ts` 读助手 + init 模板 + 测试) | ✅ 已合并 | `58ed4d1` |
| 2 | `sf-design`/`sf-executor` 契约驱动 + `contract_gap` blocker(预防层) | ✅ 已合并 | `bddd1f8` |
| 3a | `spec_consistency_gate` 做实(设计候选 `[contract:...]` 引用对账,brownfield-safe)+ 加进 refactor + 测试 | ✅ 已合并 | `d57f7c1` |
| 3b | 对改动代码做 AST 级契约对账(字面量枚举值/接口实现/PathService 绕过) | ⬜ 未做(更大,单列,分语言) | — |

**部署要求(切片 1 累积,尚未部署)**:
- daemon 侧(步骤 1、3a + refactor.json + workflow-runtime 类型):`git pull` → `bun run build` → **重启 daemon**。
- 用户级 agent(步骤 2):**`bun scripts/sf-installer.ts upgrade --force` + verify**。
- 两者都需要。契约注册表默认空 → 全程 brownfield-safe(warn 不 block),不会卡住现有 fj1 流程。

**契约引用语法(agent 与 gate 已对齐)**:`[contract:KIND:ID( owner=OWNER)?]`,KIND ∈ {shared_enum, invariant, public_interface, extension_point}。

**下一步选项**:部署验证一轮 / 继续 3b / 开始播种真实契约(把 SpecForge 或 fj1 的跨模块枚举登记进 contracts 块,让 gate 从 brownfield-skip 转为实际对账)。

---

# 16. 契约治理写入路径(sf_contract_register)+ extension 技术债

## 已交付(提交 `ed1d113`)
- **`sf_contract_register`**:契约"提议填单"工具。读当前 `extension_registry.json` → 在 `contracts` 块加一条契约(dedup 守卫)→ 写 `candidates/project/extension_registry.json` → 在 `candidate_manifest.json` 登记显式条目(target = 声明过的 `.specforge/project/extension_registry.json`)。
- **不改合并中枢、不开后门**:因 target 是声明过的 project 文件,`inferManifestEntries`(收件员)**原样回显**该显式条目 → 走既有 候选门禁 → 用户决策 → Merge Runner(唯一授权写者)落盘。测试已验证"收件员回显"成立。
- daemon handler + dispatcher 注册 + 用户级 wrapper + installer registry + 3 测试。

## 评估结论:extension 两套并存 = 需保留职责、当前实现是债
- 职责(缺类型/契约 → 治理登记)**需要**,不删。
- 但 daemon v11(缺"批准后写 project"步、疑似无 opencode 入口)与 opencode v12 wrapper(纯内存、不落盘)**都不能真正完成登记**,且互不相通。
- **单独立"extension 子系统整合"工作项**:先审计使用 → 保留一条与契约合并路径一致的干净治理路径 → 删死的/重复的。**不混进本次;`sf_contract_register` 不依赖它们。**

## 端到端验证(待部署后)
注册一条真实契约 → gate → 批准 → merge 落盘 → `spec_consistency_gate` 从 brownfield-skip 转为实际对账 → 真跑一次 executor 遇未登记值 `blocked(contract_gap)` → 治理登记 → resume。

### 部署期缺陷修复(提交 `535f202`)
- **Zod v4 record arity bug**:`sf_contract_register.ts` wrapper 用了单参 `tool.schema.record(tool.schema.any())`。Zod v4 要求 `record(keySchema, valueSchema)`,单参使 value 类型为 undefined。opencode 启动解析全部工具 schema 时 `ToolRegistry.all` 抛 `TypeError: undefined is not an object (evaluating 'r._zod')`,导致**整个工具注册表崩溃、所有目录下提示词无响应**。
- 证据:opencode 日志 `err_cf216bf6/err_226f68d5`(一手);源码对比确认 `sf_state_transition`/`sf_safe_bash` 均用正确双参形式,仅新增的 `sf_contract_register` 单参。
- 修复:改为 `record(tool.schema.string(), tool.schema.any())`。仅用户级 wrapper,部署 = installer upgrade --force + verify + 重开 opencode(无需重建/重启 daemon)。
- **遗留治理增强(单列)**:installer `verify` 应加一步"加载全部 wrapper schema 干跑",提前拦截这类"一个 schema 写错拖垮全部工具"。

### Step 1 结果(CONFIRMED,fj1 / WI-0003)
- opencode 创建 WI-0003(change_request / requirement_change_path / created),调用 `sf_contract_register` 返回 `success:true`,`contract_ref=[contract:shared_enum:GpsStatus owner=CORE]`。
- ✅ 候选 `candidates/project/extension_registry.json` 的 `contracts.shared_enums` 含 GpsStatus。
- ✅ `candidate_manifest.json` 有显式条目 `candidates/project/extension_registry.json → .specforge/project/extension_registry.json`(replace/extension_registry)——**收件员原样回显验证成立,不走后门**。
- ✅ 真相源 `contracts` 块为**空**(`grep -c GpsStatus`=0):bootstrap 规范化只补了空容器,契约内容未泄漏,仍待 merge 落盘。假设 B(绕过真相源)已排除。

### Step 2 结果(CONFIRMED,fj1 / WI-0003 merged)
- 编排器把 WI-0003 走完整 change_request 治理链:intake → impact_analysis(sf-requirements) → design(sf-design) → tasks(sf-task-planner) → candidate gate → 用户决策 → `sf_merge_run`。
- ✅ **契约经受治理路径落盘**:合并后真相源 `contracts.shared_enums` 含 GpsStatus(`grep -c`=1);`sf_merge_run` 返回 `success/merged_count:1`;`state.json` WI-0003 `merged`/`change_request`。全程无手改真相源、无绕过 gate。
- ✅ **闭环恢复(§4)运行验证**:candidate gate 跑 4 轮,前 3 轮 `workflow_specific_gate`/`required_files_gate` 失败 → 自动 `gates_failed → candidate_preparing` 回退 → 责任 agent 修复(补 requirements candidate、design 加 `analysis_scope: system_governance`、加 REQ-1 引用)→ 重跑,第 4 轮 9/9 通过 → `approval_required`。**无死锁、无伪造通过、失败未甩给用户**。

### Step 2 暴露的治理观察(CONFIRMED,非阻塞,单列跟进)
1. **`workflow_type` 投影错标**:`sf_merge_run.state_auto_advance.workflow_type="feature_spec"`,而权威 `state.json`=`change_request`。权威状态正确,缺陷在 transition/merge 的返回值投影层。
2. **PSV 版本 desync**:合并后真相源 `project_spec_version` 仍=`PSV-0001`,但 `sf_merge_run` 报 `spec_manifest_updated:true / PSV-0003`。假设(待验证):`sf_contract_register` 把旧版本号原样抄进候选 + `replace` 合并不对齐版本字段 + spec_manifest 独立自增 → 三者脱节。此外 spec_manifest 变更前已是 PSV-0002 而 registry 是 PSV-0001(WI-0003 之前就存在的历史 desync)。
3. **契约登记治理路径过重**:纯注册表加一枚举被 `candidate_phase=full` 要求 requirements+design+tasks 全套候选,4 轮 gate/~30min。契约登记缺一条轻量治理车道(design 缺口)。
4. tasks.md `verification_commands` 旧格式 2 个 warning(非阻塞)。

### Step 3 阻断缺陷:bootstrap 静默清空真相源(CONFIRMED,已修 `d65c5f5`)
Step 3 验证 `spec_consistency_gate` 时发现它仍走 brownfield-skip。逐层取证锁定根因(全程一手证据,排除了"读取逻辑 bug""创建 WI 触发""daemon 重启"等假设):
- **现象**:merge 后真相源含 GpsStatus(CONFIRMED),但 gate 读到空;真相源被重置成 `updated_by_work_item:null` 的空模板。
- **触发点(复现锁定)**:放哨兵 `SENTINEL_PROBE` 后,**重开 opencode、未输入任何提示词**,哨兵即被抹(mtime 变、grep 0)。→ 触发点 = **opencode 启动连 daemon**,非创建 WI(复现:建 WI 前后 mtime 不变)、非 daemon 重启(startedAt 未变)。
- **根因(源码)**:`HTTPServer` 在项目 register/sync 时调 `ensureProjectInit`(注释自称"幂等")。其 `system_file` 写循环只对 `manifest.json`/`observability.json`/`spec_manifest.json` 做"非空则保留",**漏了 `extension_registry.json`**;内容≠空模板时用空模板覆盖。契约模型前注册表恒等于空模板(无 diff、不覆盖)所以潜伏;merge 写入 GpsStatus 后每次 opencode 启动都把它连同 namespaces 一起清空。
- **责任层**:项目 bootstrap(`ensureProjectInit`),非 gate/契约工具/StateManager。
- **修复**:把 `project/extension_registry.json` 加进"非空则保留"名单,与 `spec_manifest.json` 一致(bootstrap 只创建、不覆盖治理真相源;内容只由 merge_runner 写)。加回归测试(create-when-missing / preserve-contracts / preserve-namespaces),daemon-core + HTTPServer 测试通过。
- **部署**:daemon-core `git pull` + `bun run build` + 重启 daemon。GpsStatus 已被清空,需修复部署后重新走一遍登记+merge(顺带重验闭环),再继续 Step 3。

### 修复验证 + Step 3 结果(CONFIRMED,fj1)
- **修复生效**:部署后放哨兵 `SENTINEL_PROBE` → **重开 opencode(未输入)** → `grep -c`=1(修复前会变 0)。bootstrap 不再清空真相源。
- **Step 3 真实对账**:复用 WI-0004,design 候选引用三种情况,`sf_gate_run gate_ids=[spec_consistency_gate]` 返回 `status=failed`、`input_files` 含 design 候选(真读了):
  - `SENTINEL_PROBE owner=CORE` → `contract_ref_0_ok` **passed**;
  - `BOGUS_ENUM` → `contract_ref_1_resolves` **failed/error**(未登记);
  - `SENTINEL_PROBE owner=WRONGMOD` → `contract_ref_2_owner` **failed/error**(owner 漂移)。
- 结论:`spec_consistency_gate` 从 brownfield-skip 转为**确定性代码↔契约对账**,覆盖当初审计发现的"跨模块契约一致性无人强制"核心缺口。
- 注:哨兵为诊断探针(受治理写入路径已在 Step 2 端到端证明);两验证点只关心真相源有无已登记契约 + gate 如何读,与契约来源无关。

## 契约闭环端到端验证总结(截至当前)
| 环节 | 状态 | 证据 |
|---|---|---|
| 受治理登记(candidate→gate→审批→merge 落盘) | ✅ CONFIRMED | Step 2,WI-0003 merged,GpsStatus 落真相源 |
| 闭环恢复(gate 失败自动打回修复重跑) | ✅ CONFIRMED | Step 2,4 轮 gate 无死锁 |
| 真相源持久化(不被 bootstrap 清空) | ✅ CONFIRMED(修 `d65c5f5`) | 哨兵挺过 opencode 重启 |
| 设计期对账(spec_consistency_gate 真实校验) | ✅ CONFIRMED | Step 3,3 种情况判定正确 |
| 实现期 `contract_gap` 闭环(executor 遇未登记→blocked→登记→resume) | ⬜ 待验证(Step 4,重流程) | — |

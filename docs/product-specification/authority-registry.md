# SpecForge Authority Registry

> Status: ACTIVE / AUTHORITY_REGISTRY
>
> Effective date: 2026-10-11
>
> Registry version: 1.17
>
> Product owner: SpecForge 产品负责人
>
> Initial establishing baseline: main@5204a1611d9a1f02f96da637e6ec1c2acd35a8d0

## 1. 唯一产品权威

SpecForge 当前唯一产品规格为：

docs/product-specification/specforge-product-specification.md

规格版本：

SPS-1.0

本 Registry 只声明权威关系、文件角色和裁决记录，不承载独立产品需求，因此不构成第二套产品规格。

## 2. 权威规则

1. 当前产品需求、架构、产品边界、模块范围、运行模型、路径模型和验收标准，只能由 SpecForge Product Specification 定义。
2. 产品负责人作出新的产品裁决时，必须同步更新 Product Specification；不得长期依赖聊天记录、handoff、issue、Kiro 或实现代码保存产品决定。
3. ADR 用于记录重要架构决策及理由。ADR 不得形成与 Product Specification 并列的产品权威；会改变当前产品行为的 ADR 必须同步更新 Product Specification。
4. 模块设计、标准、实现计划、tasks、测试、报告和代码必须服从 Product Specification。它们可以证明实现现状，但不能反向创造产品需求。
5. 历史内容不得通过“仍被测试或脚本消费”自动恢复为权威。
6. Future Capability Registry 只保存未来候选能力，不进入当前 release scope。

## 3. 文件角色登记

| 位置 | 当前角色 | 产品权威 |
|---|---|---:|
| docs/product-specification/specforge-product-specification.md | 当前唯一产品规格 | YES |
| docs/product-specification/authority-registry.md | 权威登记与文件角色 | REGISTRY ONLY |
| docs/adr/** | 架构决策记录；必须与当前产品规格一致 | NO |
| docs/project-status.md | 唯一当前执行状态与下一合法动作；不承载产品决定 | NO |
| docs/rule/specforge-execution-mode-and-evidence-protocol.md | 执行与证据规则（外部执行模式、恢复链、证据协议）；不是产品规格 | NO（EXECUTION & EVIDENCE RULE） |
| docs/rule/specforge-active-development-rules.md | 当前活动开发规则（新会话必须完整读取）；经验规则唯一当前载体 | NO（DEVELOPMENT RULE） |
| docs/rule/specforge-development-error-ledger-and-experience.md | 开发错误台账：历史错误、审计与经验演化证据；不再要求每会话全文读取，按任务关键词定向检索 | NO（HISTORICAL EVIDENCE + TARGETED SEARCH） |
| docs/design/SpecForge架构一致性治理最终实施方案.md | 架构一致性与契约治理的从属技术合同 | NO |
| docs/design/windows-lpac-node-readonly-contract.md | SPS §9.2.1–§9.2.7 / D20–D26 的有限隔离验证、单进程生产采用与受控工具/共同消费者/部署从属合同；各阶段门禁不得跳过 | NO |
| docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md | 2026-10-06 前完整治理实施方案的原样历史快照；只用于追溯规则演进 | NO（HISTORICAL EVIDENCE） |
| docs/conventions/** | 当前实现合同的派生说明；必须可追溯到 SPS、已登记 Contract 或真实代码，不得独立定义产品 | NO（DERIVED REFERENCE） |
| docs/user/**, docs/cli/** | 面向用户和运维者的当前版本使用说明；必须与已发布入口、安装器和运行合同一致 | NO（DERIVED OPERATING DOCUMENTATION） |
| docs/engineering-lessons/** | 工程经验的主题化索引或说明；活动规则仍只由 active-development-rules 承载 | NO（REFERENCE） |
| docs/archive/** | 旧规格、旧标准、旧设计、实施记录、报告、审计与 Kiro 材料的统一历史归档 | NO |
| docs/design/**（除上列从属合同外） | 当前不得新增并行设计权威；新增设计必须先登记角色 | NO |
| .kiro/** | 根目录禁止存在；历史内容只可位于 docs/archive/kiro/** | FORBIDDEN ROOT |
| docs/roadmap/future-capability-registry.md | 未来能力登记册 | NO |
| packages/**, setup/**, scripts/** | 当前实现和消费者证据 | NO |
| tests/** | 验证消费者与证据 | NO |
| README / prompts | 导航或使用说明 | NO |

`docs/archive/**` 中的文件必须保持可追溯，但不得作为当前需求、设计或执行状态输入。测试若读取归档文件，只能验证历史证据未丢失，不能据此约束当前产品行为。

`docs/rule/` 只允许保存本 Registry 已登记的当前规则文件。事故专用规则、已完成阶段脚本规则和其他不再持续约束开发的材料必须进入 `docs/archive/rule/**`，不得以活动目录位置暗示当前效力。

## 4. 当前产品负责人裁决

以下裁决已经吸收进 SPS-1.0：

| ID | 裁决 |
|---|---|
| D18 | 命令写入漏洞修复先采用安全封堵：保留 Runtime 内部受控只读操作，无法隔离的脚本、解释器、子进程、构建和测试命令明确拒绝，不宣称这些执行功能可用。对应 SPS §9.2；任何角色、活动任务或已有授权不得绕过此边界。 |
| D19 | 无分支 detached Git 项目在实施前可以建立新的用户确认基线与 WI 分支；由现有 Git plan/create owner 以完整提交、索引/跟踪字节和不可变计划绑定执行，原子建立引用、保留可恢复审计，不声称恢复旧分支，不创建提交或改写业务文件。对应 SPS §9.2；新分支决定不替代默认主线 Git Merge 确认，也不解除 D18。 |
| D20 | 批准有限隔离验证方案，先完成隔离验收：仅 Windows x64 LPAC + Job Object 的 `windows-lpac-node-readonly/v1`，不可变副本、固定 Node、无应用文件写权限、无网络或扩展 capability。先更新正式合同，再以自有合成夹具完成真实隔离、攻防、后代进程、中断和恢复验收，之后才接产品工具、共同证据消费者、发布部署及原 WI；任何未证明属性都不得通过或降级到普通子进程。`sf_safe_bash` 保持 D18 只读。对应 SPS §9.2；从属合同为 `docs/design/windows-lpac-node-readonly-contract.md`，提案归档只证明裁决来源，不取代正式合同。 |
| D21 | 仅授权自有合成环境的 `windows-lpac-node-readonly-registry-read-experiment/v1` 实验：在D20相同LPAC/Job/固定Node/无文件写入及无网络/COM边界上增加恰好registryRead一个capability，以真实token/SID、系统读取、假用户配置/凭据哨兵、继承和回收证据判定结果。该能力不是少数键白名单，拒绝或未知不能算通过；不追加其他能力或修改已有ACL。先正式合同后合成实验，不注册为业务profile，不部署，不运行原WI。采用进产品须基于完整实验和隔离矩阵另行裁决；D18及D20生产边界保持不变。对应SPS §9.2.2。 |
| D22 | 用户选择“采用单进程首期方案”：首期候选收窄为 Windows x64 `windows-lpac-node-single-process-readonly/v1`，仅不创建子进程的只读 Node 内置测试和可证明原证据语义的冻结内联验收。固定 Node24.19、恰好 registryRead、真实 LPAC、创建前 child-process restriction 并读回1、DETACHED、禁止 native addons、Job进程1/总内存1GiB/每管道1MiB/墙钟至多120s；无应用写入和网络，不扩大系统权限。需要子进程或不能证明命令语义的测试明确拒绝/not_executed，不改封存Task、不降验收、不转普通宿主。先完成新的完整合成矩阵，旧多进程9/15超额和未验收结果保留，不能借旧较弱配置充数。该决定不批准产品执行；D21完整证据后的独立生产采用、public接线、共同消费者和部署门禁继续有效。对应SPS §9.2.3。 |
| PO-001 | Migration 模块退出当前产品；schema validation 保留为文件 owner / contract 责任，不等同 Migration |
| D23 | 用户明确“批准两项，继续完成全部修复”：允许在Bootstrap的ENOBUFS阻断下仅修复自身32MiB有界输出及回归，恢复真实READY后继续；依据D22完整单进程合成矩阵采用 `windows-lpac-node-single-process-readonly/v1` 进入产品闭环实施。先正式合同，再sf-orchestrator拥有的plan与sf-verifier拥有的run、不可关闭真实身份/状态/HardStop/独立验证许可、受信producer与不可变回执、共同消费者SP-I01、固定资产安装部署SP-D01，全部通过后才由原WI owner恢复同一WI。限制沿用D22，sf_safe_bash仍只读；不自动放行代码权限、宣告状态或合并业务。该决定批准实施和验收后部署，不声称产品链路已通过。对应SPS §9.2.4。 |
| D24 | 用户批准有限恢复方案：按 SPS §9.2.5 在 D23 固定单进程 LPAC 内新增精确同步调用的单调差值观测。仅字面量 perf_hooks 解构 performance 与无参数 now，源/绑定/测量区间严格证明，计时命令 v2 与专用证明配对，旧 v1 保持。先正式合同，再正反例、三平台回归、共同消费者、取消恢复及正式部署真实工具验收；不放宽权限/预算、不批准业务 Candidate 或业务实现，完成后恢复原 WI 候选与 Gate。 |
| D25 | 用户明确“批准该有限扩展，继续完整修复”：按 SPS §9.2.6 补齐显式冻结 filesystem 的验证源身份，绑定既有 scope/baseline 与当前物理源清单和所选字节；保留 Git plan/v1，新 filesystem plan/v2 严格判别。先正式合同、完整实现、同等隔离与共同消费者验收、正式部署，再从原 WI 真实断点恢复。不 git init、不改已批准业务 Task、不扩大 LPAC、不重放既有审批或实施。 |
| D26 | 用户批准有限语义扩展及 sf-verifier 指令冲突修复：按 SPS §9.2.7 引入受词法绑定、完整引用/写入检查和冻结本地源图约束的数组数值读取、Object.keys 与有限记录键读取；新命令 v3/有限键证明严格配对，旧 v1/v2 保持，未知继续拒绝。先合同、实现、完整验收和同步部署，再恢复原 t7 WI 真实断点；不放宽隔离/权限、不改冻结业务 Task、不批准业务 Candidate。 |
| D01 | events.jsonl 是持久化工作流状态事实源；state.json 是可重建 checkpoint/projection |
| D02 | Daemon 是独立共享服务；生命周期由部署环境、CLI 或 service manager 管理；Thin Plugin 不启动/停止/重启 Daemon |
| D03 | 当前用户级数据根为 <OpenCode config>/sf-user；用户主目录 ~/.specforge 退役为非当前写入目标 |
| D04 | SpecForge user-level installer 是正式部署模型；npm-global CLI + specforge init ~/.specforge 不是当前产品部署合同 |
| D05 | OpenCode Adapter 是当前已启用的核心集成模块；真实 Daemon production consumer、release `specforged` 部署链和 OpenCode 1.18.34 端到端验证已完成。Adapter 不得管理 Daemon 生命周期 |
| D06 | OpenClaw 不属于当前产品；进入 Future Capability Registry |
| D07 | Multimodal、Self-Healing 不属于当前产品；进入 Future Capability Registry |
| D08 | 第三方 Plugin Loader / runtime plugin system 不属于当前产品；Thin Plugin 作为第一方 OpenCode 接入组件继续保留 |
| D09 | 当前不启用完整 v1.3 多视角 Project Spec；只吸收成熟 Core 规则，views/ADR Detail/ATAM/DDD/SRE 等进入 Future Capability Registry |
| D10 | NSSM 退出当前产品、安装器、发布物与运行依赖；当前 OS service registration 仅支持 Linux `systemd --user`，Windows 保留直接启动独立 Daemon 进程的能力但不提供系统服务注册或开机自启动；任何未来 Windows 服务宿主须重新裁决 |
| D11 | First-party Thin Plugin 采用唯一用户级全局部署：只安装到 `<OpenCode config>/plugins/`；项目初始化不得生成项目级副本；自动发现入口只暴露一个 Plugin 函数，依赖注入实现放在 `sf-user/lib/` |
| D12 | Git ignore 决定必须由受控 Tool 落实到根 `.gitignore`；只有“当前哈希来源 + 已知可再生产物 + Git 实际 ignored + 未跟踪”同时成立时 changed-files audit 才可排除。业务代码临时扩界必须走带原因和完整历史的 `code_permission extend`，不得把可再生产物伪装成 Module code path，也不得以 ignore 绕过普通源文件审计 |
| D13 | 正式 Daemon 生命周期由短命令 `specforge daemon ...` 操作；Installer 安装/升级回执必须暴露 CLI 目录和一次性、幂等的 PATH 配置方法，但不得静默改写用户 PATH。绝对路径只用于诊断与首次环境配置，不是日常操作入口 |
| D14 | 已成功 Atomic Spec Merge 并进入 `closed` 的原 Work Item，若当前正式 Project Spec 可由 Runtime 一手证据证明仍由该次 Merge 产生且规格本身无效，必须通过专用补偿恢复原子归档旧代 Candidate/Gate/Decision/Merge/Verification/Close 证据、失效旧审批，并仅以受控事件返回 `candidate_preparing`；不得复用普通 `recover_invalid_closure`、不得放宽 `closed` 终态、不得在成功 Merge 后调用通用审批失效、不得创建替代 Work Item或手改真相源。恢复后必须重新生成 Candidate、重新通过 Gate、取得新的显式用户批准、重新 Atomic Spec Merge、Verification/Formal Version 与 Close。 |
| D15 | 每一代进入 Gate/审批/Merge 的 Candidate 必须在 seal 时由 Runtime 重新绑定当前正式 Project Spec Version 与 `spec_manifest.json` 原始字节哈希；同一 Gate Attempt 必须不可变封存该代全部 Candidate、Manifest、分类、影响与触发依据，Gate Summary 只描述本次 Attempt 的报告；审批和 Merge 必须验证当前 Candidate 集与该次通过 Attempt、当前 Project Spec 基线完全一致。Requirements Gate 必须拒绝仅在索引、表格或引用中声明而没有正式需求正文与验收标准的 REQ。任一绑定或正文完整性不成立时必须在审批或写入正式规格前失败关闭，并经合法恢复回到 `candidate_preparing` 重新生成，不得继承旧代通过证据。 |
| D16 | Candidate 不能只证明“这些字节被封存”，还必须证明“这些字节基于当前真实实现”。Runtime 在每次进入 `candidate_preparing` 时必须从 `trigger_result.impact_scope.planned_code_paths` 生成只读 implementation baseline，记录真实文件存在性、大小和 SHA-256；Architecture、Design、Tasks 必须绑定同一 snapshot，seal 必须拒绝基线漂移以及与现有文件冲突的 greenfield/new-file/implementation-missing 声明，并把 baseline 纳入 Gate Attempt seal。当前代 Requirement 定义只允许 `REQ-<MODULE_CODE>-<NNN>`，Design、Tasks、Trace 中每个 REQ 引用必须逐字解析到当前权威 Requirements 的唯一正文；“短号映射”、不同位宽或说明性别名不能建立同一性。Candidate seal、Gate 与下游消费者必须共享目标平台解析后的文件身份；Windows 大小写别名只能形成一个输入和一个证据 owner，其他平台保持其大小写语义。 |
| D17 | Verification 与 Close 必须共同校验验证证据的来源、内容身份和时间：L5 人工验收不得以报告自身或 Agent 自述作原始证据，声明时间不得晚于 Runtime/原 Close 时点。原 WI 已关闭而该共享判据直接证明实现或验证证据无效时，普通 Close 补偿恢复须先不可变归档原代证据并取得明确确认，仅受控返回 `implementation_ready`；保留原合并规格、用户 Candidate 决定、状态事件和代码权限撤销事实。规格本身无效仍使用 D14 专用路径。 |
| AR-DEC-01 | 《SpecForge 架构一致性治理最终实施方案》保留为从属技术治理合同，服从 SPS 与 Authority Registry，不再自称产品权威 |
| AR-DEC-02 | 旧规格、旧设计、旧标准、实施文件、报告和审计统一进入 docs/archive/**，不再散布为并行当前目录 |
| AR-DEC-03 | 仓库根 .kiro 退役；可复用内容必须进入当前权威或实现合同，剩余材料归档至 docs/archive/kiro/** |
| AR-DEC-04 | 根 AGENTS.md 是新会话稳定入口；scripts/project-session-bootstrap.mjs 是只读恢复器；docs/project-status.md 是唯一当前执行状态文件 |
| AR-DEC-05 | SpecForge 开发只有两种外部执行模式：CODEX_DIRECT 与 WORKBUDDY_COORDINATED；执行与证据规则的唯一依据为 docs/rule/specforge-execution-mode-and-evidence-protocol.md（执行与证据规则，不是产品规格）；WORKBUDDY_COORDINATED 下 WorkBuddy 自述不能替代 Codex 独立审核 |
| VR-DEC-01 | 当前 SpecForge 开启新的产品版本纪元，首个正式产品版本为 1.0.0；旧版本号只保留历史证据，不表达兼容或产品谱系承诺 |
| VR-DEC-02 | 新产品 Git Tag 使用 `specforge-v<semver>`；既有 `v*` Tag 保留为历史，不删除、不改写 |
| VR-DEC-03 | 产品版本与 schema、协议、工作流格式等技术合同版本独立演进；不得因产品版本重排而机械修改技术合同版本 |
| VR-DEC-04 | 当前产品与发布消费者中的 V6/V3.5 品牌和发布身份收敛到新纪元；ADR、迁移脚本、Derived-From、旧测试与报告中的版本引用作为历史证据保留，禁止全仓机械替换 |
| AR-DEC-06 | 活动经验规则与历史账本分离：`docs/rule/specforge-active-development-rules.md` 是新会话必须完整读取的当前活动规则；历史错误、审计与经验演化证据完整保留在历史账本中，不再要求全文读取；新会话读取活动规则后，按任务关键词、涉及模块和适用 EXP 对历史账本执行定向检索；新的历史错误继续追加到账本，需要长期执行的新规则必须同时进入活动规则文件 |

## 5. 解释优先级

当仓库内容冲突时，按以下顺序处理：

1. 已写入当前 Product Specification 的产品负责人裁决。
2. 当前 Product Specification。
3. 与 Product Specification 一致的 Accepted ADR。
4. 与上位规则一致且已登记角色的模块设计和 Contract。
5. 当前实现代码。
6. 自动化测试与发布消费者。
7. `docs/archive/**` 中的历史报告、handoff、旧标准、Kiro 工作规格和其他来源材料。

如果第 3 至第 7 层与第 1 至第 2 层冲突，应记录为 conformance gap 并修改下游消费者；不得反向修改当前产品规格以迁就旧实现。

## 6. 规格变更协议

任何未来产品范围变化必须遵循：

产品负责人明确决定
→ 更新 Product Specification
→ 必要时更新 ADR
→ 更新模块设计 / Implementation Plan
→ 更新代码和测试
→ 更新发布消费者
→ 验证并记录证据

不得先修改代码或 release gate，再由实现事实反向定义产品。

## 7. ADR-014 关闭条件

初始化事故恢复裁决：用户于本轮明确同意“使用 Git 内容基线重建”。对应产品合同归 SPS §10.1 的 Project Init owner 显式重建动作；其权限限于哈希绑定的初始化事故补偿，不授予旧布局迁移或 Work Item 状态写入权。

封存项目恢复裁决：用户于 2026-11-03 明确回复“同意按封存归档恢复原项目”，接受同路径恢复封存文件并用已核验对象重建 detached 原提交，不声称恢复旧分支或旧索引。稳定合同归 SPS §3.6，责任为 Recovery owner，必须先完成隔离校验、不可变计划和可恢复发布；Project Init 不扩权，恢复授权不等于 Candidate 批准。

配置受控入口的权威归属：SPS §5.1–5.2 定义 `sf_project_config` 的项目 JSON producer、激活和恢复边界，SPS release-surface 机器块登记发布面。此入口是用户批准的六项验收补齐方案中的最小治理扩展；说明文档 producer 不得冒充运行时 JSON producer，受控入口不能管理用户凭据或放宽 HardStop。

只读自检和模型交付的稳定合同分别归 SPS §5.2 与 §10.2。`sf_doctor` 不承担配置激活或项目初始化；异步消息接收不承担模型/工具完成证明。实现、模板和使用说明应消费这些同一语义，不建立新的 producer、治理状态或产品权威。

本 Registry 与 SPS-1.0 建立后，ADR-014 所要求的“显式 authority registry + 唯一正式产品规格”已经建立。

六项独立审查后用户明确要求修复硬链接越权与补齐能力判断：对应合同细化归于 SPS §9.2 与 §10.2。写前拒绝多硬链接目标；外部接口未提供的可选模型能力保持未知，不从默认值生成支持或不支持事实。

ADR-014 本身继续保留为 Authority Model Recovery 的历史决策证据，不删除、不改写为新的产品规格。

原 WI 验证断点的受限恢复归 SPS §6.2 和现有状态协调/WAL owner。它落实用户要求从真实断点恢复且不得重放已成功阶段的既有边界；不属于新的应用执行权限或 Candidate 批准。实现、Agent 指令和安装资产必须共同消费事件身份、当前审批/实施证据、撤权和 HardStop 检查，不得仅增加一条无条件状态边。

Contract 登记 bootstrap 身份一致性及历史空清单的严格物化归 SPS §6.3，由既有 Work Item 初始化与 Contract owner 负责。用户要求修复真实 POC 登记死锁；原件存档与身份复核不能由 Agent 手工写 manifest 替代，原 WI 使用既有候选准备恢复路径，不新增工作流身份或代码权限。

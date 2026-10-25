# SPS 符合性审计记录

本报告是本次审计的历史证据快照，不是产品权威或并行当前状态文件。

- 执行模式：CODEX_DIRECT。
- RUN_ID：CODEX-SF-20261024-SPS-AUDIT-A01。
- 审计基线：main@e7a48491b98aa5a61a99610a245e6c86d6c2dc25；Bootstrap READY，本地与远端一致，起始工作区 CLEAN。
- 权威：SPS-1.0，产品版本 1.0.21；规格 SHA-256 `b1bc0c10e23e7dc1eeeed340284ff7b3116c7a657f29e0f58c4abfde7435980d`。
- 时间：2026-10-24 开始，2026-10-25（Asia/Shanghai）收口；原始执行记录使用真实 UTC。
- 目标：验证当前实现是否符合规格；不实施产品修复、不推进业务 Work Item。
- 停因：AUTHORITY_CONFLICT，已确认下游发布指令与规格不一致。

## 结论

**不能声明当前 SpecForge 已全面符合 SPS-1.0。** 已找到一项可复核的当前发布消费者不一致；本次已执行的 425 项测试全部通过，但这些测试不能证明全部规范条款或完整真实用户闭环。本报告不是全量审计完成声明。

## CONFIRMED：已发布 Verifier 指令仍宣称被禁用的能力

权威要求：SPS §9.2 / D18 明确禁止通过 `sf_safe_bash` 执行脚本、构建和测试，也不允许转到备用执行器。SPS §19 第19项要求代码、提示、模板和安装资产与当前模型一致；§20 明确派生消费者不一致也是 conformance gap。

直接证据：`setup/userlevel-opencode/agents/sf-verifier.md` 第98–99行仍告知 Agent 可以通过 `sf_safe_bash` 运行测试；第177行还给出 Docker/Python 测试示例，第273行沿用测试命令执行说明。第277行同时正确声明 D18 禁令。这里存在同一正式 Agent 文件内部的相反能力说明，不能以末尾存在正确规则代替全文消费者同步。

`011-verifier-conflict.json` 保存精确行内容与源码/安装副本哈希；`verifier-source-snapshot.txt` 保存完整原始字节。当前用户级安装副本与仓库文件逐字节相同，SHA-256 均为 `1a4d9211b292fcbf12e78858fae57b2a410da4e95fc8f01184a114d635813520`。

责任层：Agent guidance / Deployment consumer。能力判断：CONTRACT_CONFLICT（下游消费者自相矛盾，上位 SPS 的禁令明确）。这是已部署的指令缺陷，不是仅存在于历史归档的文字。

尚未证明：没有证据证明当前运行时允许执行这些命令，也没有本轮真实模型会因此误执行的观察。当前 shell 拒绝回归反而通过。修复方向应为统一全部消费者到当前规格，不能放宽执行边界来满足旧指令。本轮未修复。

## 本轮实际验证

| 原始证据前缀 | 验证对象 | 结果 | 证明边界 |
|---|---|---|---|
| 006-scope | Scope Gate 全包，发布面、权限责任、路径、Thin Plugin、安装事务和正式发布预检 | 30文件 / 134项通过，退出0 | 包括静态契约、生产函数和临时安装集成；不等于所有说明文本语义正确 |
| 007-behavior | HTTP与写前hook、配置激活丢失/重启、候选封存/代际绑定、审计新鲜度 | 7文件 / 82项通过，退出0 | 生产入口的隔离夹具和实际本地HTTP；部分owner使用测试替身 |
| 008-state-write | 事件历史完整性、内部只读执行器、硬链接边界、metadata与module schema | 5文件 / 189项通过，退出0 | 包含真实子进程重启、轮转历史、拒绝无副作用及合法操作；不是实际OpenCode宿主完整业务流程 |
| 009-adapter | 模型能力来源及未知/真假值边界 | 2文件 / 20项通过，退出0 | 单元/接口夹具；不得称为本轮真实模型推理验收 |
| 010-installed-integrity.json | 当前用户级安装清单与实际文件逐字节校验 | 1.0.21，112文件，无不一致 | 证明安装清单内部完整性；不证明当前进程加载身份或全部文件与当前源码等价 |

共44个测试文件、425项测试通过。每组命令、工作目录、时间、stdout、stderr和数字内部退出码见同前缀四件套。执行载体最终返回码在本次工具原始记录中；不得把中间失败替换为通过。

独立源码复核：Thin Plugin 的 `tool.execute.before` 等待 `checkNativeTool`；native-write-boundary 调用统一 `checkWrite`、读取权威owner并拒绝多硬链接；`StateManager.rebuildState` 读取WAL、验证历史见证和迁移历史，再重建内存；`authoritative-work-items` 通过项目owner读取状态。以上只能证明已检查的具体链路，不能外推全部入口。

## §19 验收覆盖索引

下表用于区分已检查内容和剩余证据，不是20项均通过的声明。

| 条款 | 本轮证据 / 剩余边界 |
|---|---|
| 1 唯一产品权威 | 完整读取Registry/SPS；Bootstrap及006权威投影检查通过 |
| 2 发布检查不消费旧Kiro权威 | 006 authority与release precheck通过 |
| 3 无旧用户根写入 | 006路径消费者检查；未对全部运行入口做文件系统级穷尽观察 |
| 4 Manifest及私有根 | 006路径/安装测试；010实际安装清单位置和112文件核验 |
| 5 插件无Daemon生命周期所有权 | 006插件测试与入口源码；未在本轮实际OpenCode中遍历全部事件 |
| 6 共享Daemon及离线拒绝 | 007实际HTTP与离线拒绝；本轮未重启用户共享Daemon |
| 7 事件重放 | 008真实进程、历史丢失/损坏/轮转检查及StateManager源码 |
| 8 无第二WAL合同 | 006相关契约支持；未完成全仓语义调用穷尽审查 |
| 9 初始化仅Core | 008当前module schema支持；本轮未另做完整用户级初始化实测 |
| 10 受控Candidate链 | 007封存/代际/拒绝检查；未在真实宿主完成全链和真实用户审批 |
| 11 metadata不是状态权威 | 008 metadata owner、007旧投影拒绝及owner读取源码 |
| 12 真实写边界 | 007/008 hook+HTTP、硬链接、shell拒绝；不声明OS沙箱或并发替换隔离 |
| 13 Migration退出发布 | 006发布集合检查；未逐个穷尽所有持久化文件owner |
| 14 未来能力排除 | 006发布/安装集合检查 |
| 15 Adapter真实consumer/E2E | 009能力回归；旧真实provider结果仅是历史线索，未提升为本轮端到端验收 |
| 16 Version责任 | 006版本边界回归；未独立逐函数审查全部导出 |
| 17 Installer清单/生命周期 | 006实际临时安装/升级/卸载/回滚消费者测试及010当前安装校验 |
| 18 Scope Gate仅发布 | 006 no-runtime-scope检查及precheck源码 |
| 19 全部消费者一致 | **已确认不符合：当前Verifier源文件和安装文件存在相反执行能力说明** |
| 20 Future未进入验收范围 | 006发布权威投影；本报告未把未来能力缺失判为缺陷 |

## 证据解释与剩余问题

当前规格限制通用测试执行是一项已明确的产品决定；因此“拒绝测试执行”本身不能被审计为实现不符合。产品能否完成用户期望的自动开发闭环，是另一项需要单独验证和可能需要产品决策的问题，不能被425项通过掩盖。

旧 `2026-10-24-final-six-acceptance` 报告指向1.0.19的Shell反例，不能直接用作1.0.21现存缺陷。最新候选修复报告也明确没有完成原业务项目的全部验收。它们只作为取证线索，本轮未以Agent报告自述证明旧缺陷关闭或全产品通过。

遇到权威冲突后按项目规则停止扩展审计。后续应先消除已发布Verifier指令冲突，再继续尚缺的全条款源码映射、当前安装版真实宿主全链验证和产品目标验收；不得用新增静态字符串测试替代行为证据。

## 执行异常与写入分类

- 001–004：Bun在受限环境报 `CouldntReadCurrentDirectory`，测试未执行。直接原生入口同样失败；经工具批准的沙箱外执行可以启动。保留失败，不作为产品测试失败。
- 005：Vitest 1.6.1因只设maxWorkers而与默认minThreads冲突，未收集测试；读取仓库正式 `test-workspace.ts` 后按其 `--maxWorkers=1 --minWorkers=1` 重跑为006。责任为本轮调用参数，未改产品。
- 若干大文件输出发生截断，按分块或结构化字段补读；不把截断内容当成完整验收证据。复用EXP-007/008/117/261。
- EXPERIENCE_FILE_READ=YES；ACTIVE_EXPERIENCE_RULES_FILE_READ=YES；APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-007,EXP-021,EXP-044,EXP-261,EXP-276,EXP-282；REPEATED_ERROR_CHECK=PASS（取证策略）；HISTORICAL_LEDGER_SEARCH=上述EXP及规格一致关键词，重点读取ERR-1851/1852/1853。
- TRUTH_SOURCE_WRITES：无；未改业务项目、产品规格或当前状态文件。
- REPOSITORY_TRACKED_WRITES：无产品代码/模板修改；新增本审计归档证据未提交。
- RUNTIME_OBSERVER_WRITES：测试临时夹具、运行器缓存和子进程输出；未启动/停止用户共享Daemon。未做全文件系统穷尽副作用监控。
- EXTERNAL_EVIDENCE_WRITES：仅本审计证据目录；此处位于仓库archive中，未混称产品实现变更。
- 未提交、未推送、未创建PR。阶段停点为本报告的已确认冲突；原业务恢复指令未执行。

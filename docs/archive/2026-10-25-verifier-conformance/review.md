# SpecForge 规格实现与真实业务链审计

RUN_ID=CODEX-SF-20261025-VERIFIER-CONFORMANCE-A01
EXECUTION_MODE=CODEX_DIRECT

当前结论：**SpecForge 尚不满足 SPS-1.0 整体符合条件。** Verifier 已确认的指令冲突已修复、部署并验证；另外发现五项确定缺口。真实OpenCode业务完成三专业Agent候选及handoff，在正式Candidate封存处被拒绝。隔离复现确认Runtime错误判定正确事实后，本轮验收停止，最终权威状态为`candidate_preparing`。后续Gate/批准/Merge/实现/Verification/Close没有真实闭环证据。

## 判定口径

- **已实现**：列出的具体源码、回归或真实操作证明对应能力，结论仅在标注范围内成立。单元测试不是用户批准、实际业务验收或生产部署全链证明。
- **未实现**：一手证据直接显示当前消费者或实现违反条款。不会把 D18 明确排除的通用测试执行能力重新算作当前必备功能。
- **证据不足**：只有局部能力证据，或目标环境、生产可达性、真实后续阶段尚未验证。不等于证明能力不存在。

逐段/逐条原文、行号、判定和证据组见 [clause-matrix.md](D:/code/SpecForge/docs/archive/2026-10-25-verifier-conformance/clause-matrix.md)。其中正文审计单元包含解释段落，不是独立功能数量，不计算“完成率”。173 个机器发布条目单列在 [clause-matrix.json](D:/code/SpecForge/docs/archive/2026-10-25-verifier-conformance/clause-matrix.json)；发布表面通过不等于173项业务均已验收。

矩阵采用保守逐项判定：不能只因同模块有代码及测试，就将该段所有子要求标为已实现。44个有明确边界的审计单元列为已实现，3个条款单元存在直接反例，其余362个单元缺少完整逐项证明；这些数字不是独立需求计数，亦不表示362项功能不存在。复杂条款的已知局部实现和欠缺证据均保留在对应证据组。

## 已完成的修复与部署（CONFIRMED）

1. Verifier、验证 Skill、feature_spec 委派、Orchestrator/Base 摘要统一到 D18：只能核验合法已有证据；不运行测试/构建/应用，不换执行器；缺证据为 blocked/skipped/not_executed。
2. Verifier 关闭路径改为 `verification_done → sf_close_gate → closed`，删除内部函数/不存在工具调用，原子落盘归 Runtime，变更审计归正式工具 owner。
3. 辅助环境文件仅在正式 Contract 声明时作为必需输入；保留正式 Project Spec Manifest/复制版本核对，纠正旧 Trace 路径及未部署 Agent 权威引用。
4. 最终产品资产候选：`commit-67baed1b0e9e4a331fbca262c196696e85f5a8d4`。产品二进制版本仍为1.0.21，未变更运行时实现；资产身份以候选与逐文件哈希区分。
5. 正式安装器完成事务升级。相对原部署最终变化集合是五个指令资产；112文件与最终清单及源码一致，两个二进制哈希和mtime均未变。证据：043–047、installed-final-paths.json；审计结束时074再次独立核验112文件一致。
6. 真实OpenCode会话工具记录确认新版验证Skill被加载；Verifier回答缺少证据必须blocked，未调用测试执行器。最终路径版也由全新进程加载验证（host03）。回答本身仅证明指令理解，运行时拒绝能力由shell/native边界回归另证。

## 确认的未收口项

|ID|规格|事实与证据|责任层|结论|
|---|---|---|---|---|
|GAP-CONSUMER-D18|§9.2、§19.19|已安装 `superpowers-tdd/SKILL.md` 第14、20、25行仍要求实际运行Red/Green/Refactor测试；sf-executor完成定义仍要求verification_command真跑通。源文件和安装清单可复算，非推测。|Workflow Skill / Agent / Deployment consumer|未实现：全局指令一致性。Verifier修复不等于所有消费者修复。|
|GAP-CONSUMER-PATH|§4.2、§19.19|Daemon `sf_artifact_write_core.ts` 使用runtime/logs/trace.jsonl；全局AGENTS、其他Agent及已安装旧tool_lib仍引用logs/trace.jsonl，多个Agent引用未部署AGENT_CONSTITUTION文件。|Agent / Template / Deployment consumer|未实现：路径与权威消费者完整一致性。未证明这些旧tool_lib在生产中可达，不将静态漂移夸大为真实日志丢失。|
|GAP-ADAPTER-EVENT|§10.2 event subscription/translation|052使用真实OpenCode HTTP runtime和源码Adapter，模型已回复，订阅30秒后返回done且无事件；生产HTTPServer事件入口只调用SessionRegistry，OpenCodeRuntimeClient没有事件订阅方法，Adapter入队仅由显式pushEvent/simulateEvent触发。现有生命周期测试明确使用注入。|Adapter / Daemon integration|未实现：生产事件到中立订阅流的桥接。提示投递已实现，翻译器存在；不能据此认定整个Adapter不存在。|
|GAP-DESIGN-OWNER|§19.19 消费者一致性|sf-design第254/808行要求同步并写trace_delta；正式sf-artifact-write owner表第955/956行只允许sf-task-planner。真实设计会话尝试写入后收到ARTIFACT_OWNER_MISMATCH，required_agent=sf-task-planner、hard_stop=false，随后交接给原owner。|Agent / Artifact Contract consumer|CONTRACT_CONFLICT：指令与产物owner不一致；Runtime拒绝正确，不应通过放宽owner解决。|
|GAP-BASELINE-FALSE-POSITIVE|§6.3 第544行|067真实封存返回事实冲突；068相同文件现场、全部正确绑定：不含术语的准确事实对照通过，带限定范围的greenfield说明及仅引用术语的说明均被拒绝。implementation-baseline.ts第310行起按分句关键词判断，存在任一既有文件即扫描所有业务语句。|Runtime / Candidate seal validation|RUNTIME_DEFECT：未实现正确区分事实声明、局部范围和术语解释；不是通过删词绕过即可宣称已修复。|

## 真实业务链最终停点

- 环境：实际已安装OpenCode及智谱`glm-5.3`，共享Daemon未重启；合成业务项目`C:\Users\lyq\AppData\Local\Temp\sf-conformance-business-R6ttE7`。原会话`ses_e8e849253ffeo8tI9ZIOUEjSZ5`，唯一工作项`WI-0001`。未读取t2、未修改t3。
- 已直接发生：正式初始化、Intake/分析、workflow_selected、Runtime基线、candidate_preparing；需求/设计/任务规划三owner完成候选与有效handoff；格式错误和owner错误由真实工具拒绝并留存。
- 2026-10-25 06:05:30 UTC：正式`candidate_preparing → candidate_prepared`返回`CANDIDATE_IMPLEMENTATION_TRUTH_INVALID`、`state_advanced=false`。三个候选使用错误字段`implementation_baseline_snapshot_id`，而当前合同要求`implementation_baseline_id`，这部分拒绝正确；同时包含对正确业务范围说明的误判，068已独立排除绑定错误复现。
- 随后Orchestrator受控更新了自己的impact_analysis，并开始委派sf-design修订；未完成重新封存。本轮069在确认Runtime缺陷后取消该合成验收会话，没有伪造业务HardStop，也未直接修改治理文件。062载体退出0仅表示观察会话已结束，**不表示业务成功**。
- 070保全319个业务现场文件，071读取全部原会话与子会话；072正式StateManager HTTP读取与归档事件独立一致：只有WI-0001，状态仍`candidate_preparing`。073在观察宿主停止后再次固化319文件，见sealed-business-files.json；会话与工具时间线见final-sessions.json及business-timeline.json。
- 未到达：候选封存成功、正式Gate Attempt、用户批准、Atomic Merge、Implementation、Verification、Formal Version、Close。因此这些后续阶段本轮真实链结论均为`INSUFFICIENT_EVIDENCE`，源码/自动测试不提升为真实业务通过。

后续顺序：先修复Runtime事实误判及消费者冲突，验证正反例并部署；再由原owner修正基线字段、REQ/DD正文与逐字引用，从原WI合法断点重新封存。不得修改审批、扩大D18执行范围或用canonical映射掩盖不存在的需求正文。本轮只实施用户明确指定的Verifier修复，其余缺口已审计留证，未夹带扩大产品修复范围。

这些缺口不修改SPS产品范围。TDD通用执行能力的恢复须遵守D18另行隔离执行架构验收，不能以修改提示词或换执行器绕过。

## 已有实现证据与尚缺证据

|领域|已直接证明|尚未证明|
|---|---|---|
|状态、配置、Candidate、恢复|StateManager/WAL重放、分段完整性；配置四层合并/activation/CAS；候选基线/seal/Gate Attempt/审批绑定；两类终态补偿的源码和自动回归|这些全部异常路径在本次真实OpenCode业务中的逐一触发；不能用测试中的审批代替真实用户决定|
|权限与Write Guard|内部只读解释器拒绝外部执行；原生写前、硬链接、HardStop与审计新鲜度回归|所有平台/所有未知宿主工具的完备性；不声明OS级沙箱|
|交付与CLI|正式升级/verify、隔离安装/升级/回滚、真实部署CLI帮助和Daemon状态|真实用户安装uninstall未执行；Linux systemd真实环境未验证；所有CLI命令生产闭环未逐一执行|
|OpenCode|实际连接Daemon、实际provider元数据、真实Verifier与Skill加载、正式业务工具调用；实际部署Daemon→Adapter→OpenCode创建/查询/取消及纯文本提示/模型回复（048/051）|真实链停在封存拒绝，后续批准→Merge→实现→Verification→Close仍需修复后另行取证|
|Workflow职责隔离|Daemon生产实例未启用Workflow持久化回调；依赖边界有回归|workflow-runtime仍公开导出WorkflowPersistence，具有文件写入/恢复实现；未证明所有正式消费者不可达，不能宣告全面隔离，也不能直接断言双活状态源|
|Schema与日志|已检查owner的结构验证、损坏拒绝、配置脱敏回归|“每一类持久化文件、每一首次读写入口”的完整穷举证明；任意输入不泄漏的全称证明|

下一步取证必须针对缺口：真实链从原WI合法状态续行；Linux要求独立Linux服务环境；持久化/Schema要求完整export→生产调用图与owner入口枚举。未经证实的路径不进入“已实现”。

生产路径的证据边界：本次业务专业Agent由OpenCode原生`task`工具委派；048/051是对已部署Daemon kernel/session HTTP入口的独立探针。后者证明正式HTTP owner真实调用Adapter并到达模型，不证明本次业务委派自身经过该Adapter，也不证明自动业务编排已消费其中立事件流。§19.15整体端到端条件因此仍为证据不足。

## 自动回归与失败记录

选定套件共7,063个测试用例（不把重复重跑计为新覆盖）：daemon2128、root729、scope134、configuration197、adapter918、permission375、workflow1516、service226、observability47、host-profile2、version2、CLI789。

这不是“单次全绿”：Scope首次3项因旧manifest哈希失败，刷新固定候选后134通过；CLI首次788通过1失败，补回正式路径后对应5项通过；Trace路径定向首次25通过1失败，纠正旧测试合同后26通过。最后提示词增量均重跑相关26项。Host Profile/Version的Vitest4拒绝minWorkers，改用支持参数后各2通过。所有失败原文保留。

真实载体024退出1：长HTTP请求fetch failed，已保留消息；没有据此认定产品缺陷。035采用官方prompt_async恢复原会话与WI，不重复创建。调查中路径拼写/PowerShell通配符错误亦已记录，不能用于“能力不存在”的结论。

本轮057只读调用Requirements核心校验器检查真实候选，检出REQ-001至REQ-006六处缺少模块域；已安装sf-requirements指令本身明确要求canonical ID，因此当前事实是Agent产物不合规。这个外部只读探针不是正式Gate，不能冒充正式Gate失败或恢复成功。首次handoff缺少escalation_signals的工具拒绝及后续修正也完整保留。

进一步回到最初真实task输入，首次偏离发生在Orchestrator委派：它要求“全部REQ定义和引用使用三位canonical ID（REQ-001起始；AC使用AC-001起）”，将缺少模块域的短号错当canonical，并在设计委派中要求DD-001起始。专业Agent随后产出对应短号，未拒绝与自身正式指令冲突的委派。因此不能只将问题归给Requirements产物或下游Executor；当前可直接证明的是Agent编排层的错误委派与错误复核，正式Gate是否能兜底/恢复仍单独取证。

`sf_doc_lint` 的真实返回是pass/0 issues；源码hasStandardizedMarkers明确接受旧短号读取兼容，因此这个pass不证明本代编号符合规范。Orchestrator仍声称“三位canonical ID”并将短号向设计传递，这只是Agent错误判断，不是已验收事实。设计Contract两次INVALID_ARTIFACT_JSON拒绝后第三次受控写入成功，证明该入口存在真实格式拒绝与原owner修正路径；也不能据此宣称整个Gate恢复闭环完成。

任务规划首次写入被INVALID_TASK_ARTIFACT_CONTRACT拒绝，后续任务/Trace写入成功。任务候选自行声明REQ-CORE-001等规范编号与上游REQ-001等短号等价；066以真实文件运行引用核心校验得到7条REQUIREMENT_REFERENCE_UNRESOLVED（任务6条、Trace 1条），并保留每个输入文件哈希。这印证§6.4禁止“canonical映射”替代逐字正文解析的必要性，仍不冒充正式Gate结果。

设计阶段曾停在OpenCode原生external_directory请求，目标仅host-profile.json。自动审批审核最初因主机/用户名/路径信息会进入智谱模型上下文拒绝放行；用户明确授权本次读取后，054以once放行。没有持久权限、业务Candidate批准或SpecForge HardStop豁免。原始主机清单会话仅留本地忽略日志，脱敏副本保留原始哈希。

## 写入与观察者影响

- TRUTH_SOURCE_WRITES：SpecForge产品开发未启动自身Work Item；临时合成业务项目的.specforge写入仅来自正式Runtime/工具。正式SPS/Authority Registry未修改。
- REPOSITORY_TRACKED_WRITES：五个提示资产、两个回归文件、活动经验/历史账本、唯一project-status及归档证据；.gitattributes为两份审计目录禁用换行转换，保证Git对象与封存字节一致。Git分支/提交保留修复历史。
- RUNTIME_OBSERVER_WRITES：OpenCode会话数据库与日志、Daemon连接/会话/诊断、合成项目Runtime事件、测试临时fixture；未读取或修改t2、未修改t3。
- EXTERNAL_EVIDENCE_WRITES：本归档的原始命令、stdout/stderr、数字退出码、源字节快照、安装哈希及真实会话证据。用户级安装资产由正式installer事务修改，属于部署写入，另由014/022/031/044和安装清单记录，不混作纯观察日志。

原始命令使用真实UTC。证据中的Agent叙述与工具返回分开解释，最终状态只由权威事件/受控读取确认；报告不把“没发现”当作“证明不存在”。

manifest.sha256封存本阶段证据并自校验；忽略的原始.log保留本地，其哈希仍记录在清单中。后续Git暂存、对象字节复核、提交、main快进与推送回执以delivery-*.raw.log追加保存，不回写已封存journal，避免证据清单自引用。已有修复提交933fa4f、6b51b20、f2c6922、67baed1保留，部署候选仍以最后一个产品资产提交67baed1及112文件哈希识别；后续审计归档提交不伪装成重新构建的二进制版本。

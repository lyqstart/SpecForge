# SpecForge 架构一致性治理当前交接提示词

> **文件性质**：非权威当前交接文件
> **唯一产品设计依据**：`docs/design/SpecForge架构一致性治理最终实施方案.md`
> **当前主线活动实施文件**：`docs/implementation/architecture-consistency/P0-contract-consumer-closure.md`
> **已关闭独立缺陷实施文件**：`docs/implementation/architecture-consistency/P0-project-spec-version-binding-defect.md`
> **本轮已验证实现提交**：`main@95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`
> **重要说明**：新会话开始时必须重新读取 GitHub `main` 当前 HEAD，不得把上述 SHA 当成永远不变的基线。

继续 SpecForge 架构一致性治理能力的开发和验证。


## 零、修改前强制经验读取门禁

在分析、设计、修改代码、修改文档、生成批处理、生成命令、制作补丁或运行验证之前，必须先完整读取：

```text
docs/rule/specforge-development-error-ledger-and-experience.md
```

至少必须读取其中：

```text
第三部分：工程经验总则
第四部分：修改前强制检查
```

开始工作前必须记录：

```text
EXPERIENCE_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-...（至少一项）
REPEATED_ERROR_CHECK=PASS
```

无法读取、规则冲突或不能确认适用经验时，必须停止修改，不得凭记忆继续。

本门禁适用于代码、测试、Markdown、JSON、配置、CMD/BAT、PowerShell、Python 辅助程序、补丁包、压缩包、安装器、Git 命令和真实项目验证。

### 0.1 上一轮失败补录与本轮经验重读门禁

每一轮调查、设计、修改、脚本生成、打包或验证开始前，必须先盘点上一轮及历史尚未登记的全部失败，包括仓库测试、类型检查、构建、Git、命令、脚本、包生成、下载交付、工具调用和助手侧预处理失败。

每个失败必须先写入 `docs/rule/specforge-development-error-ledger-and-experience.md`，具备ERR编号、事实证据、分类、根因、影响、正确做法、EXP类防护、回归或机器防护和当前状态。

补录完成后，必须重新读取更新后的最新版经验台账，再确定本轮适用经验。禁止读取旧版本后补录，却继续使用补录前的经验判断。

每轮首次修改前必须记录：

```text
PRIOR_FAILURE_RECONCILIATION=PASS
BACKFILLED_ERROR_IDS=ERR-...或NONE
UNRECORDED_FAILURES=0
EXPERIENCE_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-...（至少一项）
REPEATED_ERROR_CHECK=PASS
BASELINE_EVIDENCE=远程HEAD、权威文件版本、本地状态和上轮证据
```

强制顺序：

```text
失败盘点
→ 错误补录
→ 类经验和防护补齐
→ UNRECORDED_FAILURES=0
→ 重新学习最新版经验
→ 重复错误检查
→ 基线和范围冻结
→ 首次修改
```

存在未补录失败、失败没有根因或类防护、没有重读补录后的经验文件、同类错误再次出现但未说明旧防护为何失效，或者 `REPEATED_ERROR_CHECK` 不是PASS时，必须停止。

失败后不得直接重试、改版本号或重新打包。必须先记录失败、学习经验并增加防复发措施，再开始下一轮。

## 一、仓库与权威入口

远程仓库：

```text
https://github.com/lyqstart/SpecForge.git
```

目标分支：

```text
main
```

在分析、设计、修改或给出操作命令前，必须先从 GitHub 当前远程 `main` 读取：

```text
docs/design/SpecForge架构一致性治理最终实施方案.md
```

该文件是开发 SpecForge 架构一致性治理与契约治理能力的唯一当前产品设计依据。

同时读取当前主线活动实施文件和当前阻断缺陷实施文件：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
docs/implementation/architecture-consistency/P0-project-spec-version-binding-defect.md
```

两个实施文件都不是第二权威源。前者记录仍处于 `IN_PROGRESS` 的 Contract Consumer P0 主线，后者记录已经通过真实项目验证关闭的 Project Spec Version Binding 独立产品缺陷。与唯一权威文件冲突时，以唯一权威文件为准。

开始工作前必须记录并报告：

```text
远程仓库地址
远程分支
远程 HEAD commit SHA
权威文件路径及所在 commit SHA
活动实施文件路径、状态及所在 commit SHA
本地分支和本地 HEAD（如使用本地证据）
工作区状态（如使用本地证据）
本地与远程是否一致
```

远程、本地、上传副本或旧提示词不一致时，必须先报告差异并固定本次基线，禁止混用不同版本。

## 二、必须区分三类规则

以后每条规则、差距、缺陷、修改决定和测试结论都必须标记适用范围。

### `PRODUCT_DEVELOPMENT`

只约束当前如何开发和验证 SpecForge 产品，例如：

```text
读取远程权威文件
固定 commit SHA
修改前治理分析
冻结修改范围
测试、类型检查、构建
维护实施文件
SpecForge 不使用 SpecForge 自治理自己
```

### `PROJECT_GOVERNANCE`

描述完成后的 SpecForge 治理业务项目时必须自动执行的行为，例如：

```text
Architecture、Data Model、Module Design、Contract 和 Trace 的正式链路
Gate 的检查与阻断
Impact Scope 自动推导
Code Permission
Actual Scope Audit
Verification 和 Close
```

业务项目不直接读取《SpecForge架构一致性治理最终实施方案.md》或 P0 实施文件。这些规则必须落实到 SpecForge 的程序、Tool、Skill、Agent、Workflow、Gate、Runtime、项目模板和测试中。

### `BOTH`

既约束当前开发 SpecForge，也必须成为以后治理业务项目的不变式，例如：

```text
唯一真相源
Fail Closed
证据不足不得猜测
生产者和消费者必须完整
影响范围必须完整
正式关系必须原子变化
实际修改不得越过批准范围
不能以 warning 冒充机器强制
```

当前开发阶段由人工治理和普通软件工程验证执行；产品完成后由 SpecForge 程序自动执行。

## 三、沟通和分析方式

始终站在架构和业务视角说明问题，顺序必须是：

```text
业务目标
→ 所处流程
→ 参与角色与治理对象
→ 正常行为
→ 异常行为及风险
→ 最后说明对应程序、Tool、Skill、Agent、Gate 或源码文件
```

出现代码名词时必须立即解释其业务意义。不得只报文件名、函数名或技术缩写。

每个问题必须明确区分：

```text
权威方案缺口
实际代码缺陷
测试覆盖缺口
实现证据不足
产品尚未达到最终完成边界
```

“没有找到证据”不得直接写成“代码一定有 Bug”；证据不足必须标记：

```text
INSUFFICIENT_EVIDENCE
```

## 四、当前已完成内容

已经完成：

```text
唯一权威文件建立
其他冲突文件降级为非权威资料
本地与 GitHub main 同步
固定 SpecForge 自身开发执行协议
明确权威文件是开发 SpecForge 的产品设计依据
明确业务项目不直接读取该权威文件
区分 SpecForge 产品开发、业务项目治理行为和一次性产品实施 Phase
明确三个核心 Gate 的最终 Hard 行为
明确 Contract 消费关系以 Trace 为唯一真相源
明确 Trace Delta 使用 ADD、REMOVE
完成权威规则—源码—测试静态对账
完成 P0 Contract 消费者闭环根因分析和完整实现设计
完成 `main@57c5eb5` 精确源码取证
完成正式治理前置结论和最小修改范围冻结
完成 P0 隔离工作副本实现和 67 项行为验证
完成用户仓库 95 项目标测试，0 失败
完成 TypeScript no-emit
完成 daemon-core build
完成全仓 deterministic build
完成 29 文件实际范围审计
完成 P0 实现提交并同步远程
```

本轮已验证实现提交：

```text
95befe8b35812aeb09e4d9e68f4497e12b3ac2a9
fix(governance): bind project spec versions and close lifecycle gaps
```

其中 P0 Contract Consumer 主线实现提交仍为：

```text
60cbbd3829c67d67f99cf76570b59fb6fa79b35d
fix(governance): close contract consumer trace loop
```

新会话必须以 GitHub 当前 `main` 实际 HEAD 为准。如果已经存在更新提交，先读取更新内容，不得回退到 `95befe8`。

## 五、当前 P0 缺陷

缺陷编号：

```text
GOV-DEFECT-CONTRACT-CONSUMER-001
```

名称：

```text
Contract 正式消费者与实际代码消费者未形成 Trace 驱动闭环
```

当前定性：

```text
权威方案：已经闭环
程序实现、仓库自动化验证、提交和远程同步：已完成
WorkDesk 真实 OpenCode + SpecForge 项目验证：尚未执行
活动实施状态：IN_PROGRESS
优先级：P0
```

核心问题：

```text
现有 Contract Integrity 检查仍主要依赖显式文档标记、文本搜索和部分代码检查
没有以 Prospective Trace 形成唯一、可反向查询、可原子变更的消费者事实
```

最终必须实现：

```text
DD-* constrained_by Contract-ID

Current Trace
+ ADD
- REMOVE
= Prospective Trace

Module Contract 被其他 Module 消费
→ BLOCK

Contract 变化
→ 反向展开全部消费 DD
→ 推导全部消费 Module
→ 补全 Impact Scope
→ 冻结 Code Permission

正式 Trace 消费者
↔
实际生产代码 Module 依赖
↔
Verification 证据
```

不得新增：

```text
第二套消费者 Registry
Module 定义中的独立消费者列表
新的 Contract Gate
新的 Trace 系统
新的 Relation 类型
```

## 六、当前活动实施文件的使用规则

当前唯一活动实施文件：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
```

其当前状态应为：

```text
IN_PROGRESS
```

P0 Contract Consumer 实现已经提交并同步远程；自动化测试、类型检查和构建已经完成。当前仍缺 WorkDesk 真实 OpenCode + SpecForge 业务链路验证，因此状态保持 `IN_PROGRESS`。

实施过程中发现新影响时，必须先更新该实施文件，再扩大代码修改范围。

完成后在同一文件中补充：

```text
完成 commit SHA
实际修改文件
架构、Contract、Trace 对账
实际范围审计
测试、类型检查和构建结果
真实项目验证
未解决问题
INSUFFICIENT_EVIDENCE
```

然后把状态改为：

```text
COMPLETED
```

同一个 P0 问题不得再建立独立实施报告、交接文件或“最终修正版”。

## 七、文件交付、替换与单一完整压缩包规则

> **适用范围**：`PRODUCT_DEVELOPMENT`。这是以后所有新会话和文件交付必须遵守的固定操作规则。

### 7.1 同一轮只允许一次下载

同一轮修改、诊断或验证，用户只下载一个完整压缩包。不得把补丁、应用脚本、验证脚本、Manifest 或说明拆成多个下载链接。

完整交付包固定结构：

```text
<bundle-name>/
  patch/
    <仅包含仓库相对路径下的完整替换文件>
  scripts/
    apply.py        # 有仓库写入时必须提供
    validate.py     # 修改包必须提供
    diagnose.py     # 仅诊断包按需提供
  manifest.json
  README.txt
```

允许应用和验证分两步执行，但两步脚本必须已经位于同一个下载包中，不得在应用成功后再要求用户第二次下载验证文件。

诊断轮次也必须采用单一完整压缩包；若只有诊断脚本，`patch/` 和 `apply.py` 可以省略。

### 7.2 文件修改方式

当需要修改用户本地仓库中的文件时：

```text
由 ChatGPT 在工作环境中完成文件修改
→ 完成编码、格式和内容验证
→ 冻结 patch/ 中的完整替换文件
→ 从最终 patch/ 字节生成 apply.py、validate.py 和 manifest.json
→ 把全部产物封装为一个完整交付包
→ 用户只负责解压、运行包内脚本和反馈最小结果区块
```

禁止要求用户通过 PowerShell、sed、手工文本替换或内联多行 Python 修改仓库文件。

用户本地允许执行的操作仅包括：

```text
解压一个完整交付包
运行包内 scripts/apply.py
运行包内 scripts/validate.py 或 scripts/diagnose.py
Git 暂存
提交
推送（仅在用户明确同意时）
删除已确认不再需要的交付包和备份
```

### 7.3 外层交付包与 patch/ 内容边界

外层完整交付包可以并且应当包含：

```text
patch/
scripts/
manifest.json
README.txt
```

其中 `patch/` 只能包含预期的仓库替换文件，并必须保留仓库相对路径。`patch/` 内禁止 README、临时文件、日志、缓存和其他附带文件。

### 7.4 发布单元冻结与清理

完整交付包生命周期固定为：

```text
下载一次
→ 解压
→ 运行 apply.py（如有）
→ 运行 validate.py 或 diagnose.py
→ 验证 Git 差异和反馈区块
→ 提交或确认安装成功
→ 删除本地交付包和无用备份
```

验证或提交失败时保留交付包、备份和错误日志；只有确认成功后才能清理。

ChatGPT 生成交付包前必须自行检查：

```text
同一轮只有一个下载包
外层包结构符合固定目录
patch/ 只包含预期完整文件
仓库相对路径正确
UTF-8 编码正确
没有行尾空格
没有重复文件
没有 __pycache__、.pyc 或临时文件
apply.py、validate.py、Manifest 均由最终 patch/ 字节派生
Manifest 记录包内文件 SHA256
失败不会自动提交、推送或清理证据
git diff --check 预期可通过
```

## 八、CMD 命令最小反馈规则

> **适用范围**：`PRODUCT_DEVELOPMENT`。以后所有新会话提供的 CMD 命令都必须遵守。

CMD 可以在本地输出完整执行过程，但命令末尾必须生成一个独立的最小反馈区块：

```text
===== FEEDBACK TO CHATGPT =====
RESULT=SUCCESS 或 FAILED
STEP=<本次完整步骤名称>
LOCAL_HEAD=<适用时>
REMOTE_HEAD=<适用时>
DIVERGENCE=<适用时>
WORKTREE=CLEAN 或 DIRTY
TESTS=<适用时>
TYPECHECK=<适用时>
BUILD=<适用时>
PACKAGE_CLEANUP=<适用时>
FAILED_STAGE=<失败时>
ERROR_LOG=<失败时>
===== END FEEDBACK =====
```

用户运行后只需要反馈该区块，不需要粘贴全部正常执行日志。

失败时，命令必须：

```text
保留安装包和错误日志
明确 FAILED_STAGE
输出足够定位问题的最小错误信息
不得继续提交、推送或清理
```

成功时，反馈区块必须足以判断：

```text
步骤是否完成
本地和远程版本是否一致
工作区是否干净
测试、类型检查和构建是否通过
安装包是否已按规则清理
```

不得要求用户从长日志中自行筛选结果。

## 九、当前下一项工作

P0 Contract Consumer 程序实现、自动化测试、类型检查、构建、提交和远程同步已经完成。

P0-PSV-BINDING-001 及同轮治理修复已经完成仓库验证、提交和远程同步：

```text
提交：95befe8b35812aeb09e4d9e68f4497e12b3ac2a9
范围：19 个文件
内容：
- Project Spec Version Binding 修复
- 历史测试夹具与当前治理 Contract 对齐
- code_only_fast_path Close Gate 适用性修复
- 开发错误经验门禁与单一完整交付包规则
- 仓库根 AGENTS.md 经验门禁消费者闭环
```

提交与验证事实：

```text
验证基线：main@fd93b966f4663335133aca9612112dc4fe2e37ff
已验证实现提交：95befe8b35812aeb09e4d9e68f4497e12b3ac2a9
实现提交已同步远程 main：是
当前远程 HEAD：每次新会话实时读取，不在本文件中自引用状态对账提交 SHA
目标测试：9 个文件、106 项测试通过、0 失败
TypeScript no-emit：通过
daemon-core build：通过
全仓 deterministic build：通过
git diff --check：通过
完整字节级变更证据审计：通过
提交与推送：完成
本地与远程：一致
工作区：干净
用户级安装来源：main@c5ed2f1cb74b807812dab8dae3255afaacff1bd9
用户级安装升级：完成
安装 Manifest、Tool、Skill、Agent 与源码一致性：119/119
安装 Manifest 完整性与 installer verify：通过
遗留用户主目录 `.specforge`、旧 sf-user Manifest、错误嵌套 runtime：均不存在
daemon / OpenCode：升级前由用户手工停止，升级后尚未启动
```

V15 WorkDesk 前置审计事实：

```text
WorkDesk branch：main
WorkDesk HEAD：254e24646d10c6f71fc150ac80f689d007392170
WorkDesk working tree：DIRTY
Project Spec Version：PSV-0002
WI-0003 candidate_manifest.base_spec_version：PSV-0001
WI-0003 tracked files：0
WI-0003 untracked files：8
WI-0003 字面引用总数：109
  - WI-0003 自身产物：8
  - Runtime 状态文件：2
  - Observability / payload 历史证据：99
  - Project Spec / Module Design / Contract / Trace / 其他 WI 正式引用：0
```

Observability 和 payload 是必须保留的历史证据，不是活跃消费者。Runtime 状态仍是权威引用，且当前 Work Item 创建器按 `.specforge/work-items` 目录最大编号分配下一 ID，因此不得仅删除 WI-0003 目录后直接重建同一编号。

V16 Runtime 与编号审计事实：

```text
Work Item目录：WI-0001、WI-0002、WI-0003
Runtime state ID：WI-0001、WI-0002、WI-0003
Runtime event ID：WI-0001、WI-0002、WI-0003
WI-0003 Runtime状态：workflow_selected
当前分配器下一编号：WI-0004
WI-0004状态冲突：无
WI-0003正式阻断引用：0
WorkDesk既有 tracked status：4个 porcelain `M`，但 Git规范化 blob与HEAD一致、未暂存、普通 diff为空，分类为 `STAT_ONLY_CONTENT_NEUTRAL`
```

恢复决策：

```text
WI-0003 是修复前创建并按计划停在 workflow_selected 的活跃历史对象。
不得删除目录、人工改 candidate_manifest 或直接编辑 Runtime。
通过正式 sf_state_transition 将 WI-0003 标记为 superseded。
保留 WI-0003、Runtime events、Observability 和 payload 全部历史证据。
随后由分配器创建 WI-0004，真实验证新版创建器把 candidate_manifest.base_spec_version 绑定为 PSV-0002。
```

V19 WorkDesk 真实创建验证事实：

```text
WI-0003：workflow_selected → superseded，正式状态机执行成功
WI-0003历史目录、Runtime events、Observability和payload：全部保留
新Work Item：未提供ID，由分配器自动创建WI-0004
WI-0004 candidate_manifest.base_spec_version：PSV-0002
WI-0004 candidate_manifest.entries：[]
WI-0004 Runtime状态：created
Candidate / 业务代码修改：无
P0-PSV-BINDING-001：CLOSED_REAL_PROJECT_VALIDATED
```

V19 辅助脚本执行事实：

```text
第一次运行：5个治理文件已精确写入，随后因daemon/OpenCode仍运行在PROCESS_BOUNDARY停止
第二次运行：daemon/OpenCode已停止，但脚本在目标哈希识别前要求工作区干净，拒绝自身5文件精确目标状态
SpecForge远程、本地HEAD：均保持11481fb010917f0cb98d0ed11bd208ecc9add349
提交与推送：均未执行
WorkDesk写入：未执行
```

该问题属于开发辅助脚本的前置顺序和可重入状态建模缺陷，不改变
`P0-PSV-BINDING-001` 的真实验证结论，也不改变 Contract Consumer P0 的完成边界。
V20 必须从精确V19目标状态继续验证，不回退已记录的真实证据。
WorkDesk文件和index保持原状；不得为获得clean展示执行refresh、重写或换行转换。

V20 经验门禁失败事实：

```text
零写入进程前置检查：通过
源状态：EXACT_V19_TARGET
V20目标文件：5/5已应用
失败点：经验门禁仍要求重构前旧段落中的固定文本
TypeScript、构建、WorkDesk审计、提交和推送：未执行
```

V21 从精确V20目标状态继续，修复文档与固定文本消费者同步后复跑完整验证。

V21 验证执行事实：

```text
零写入进程前置检查：通过
源状态：EXACT_V20_TARGET
V21增量文件：3/3已应用；总工作区范围仍为批准的5文件
经验门禁、TypeScript、daemon-core build、全仓build、git diff --check、installer verify：全部通过
WorkDesk状态范围：通过
失败点：校验器错误要求WI-0004 trigger_result.json包含project_spec_version
真实生产契约：trigger_result保存路径选择骨架；Project Spec创建基线由candidate_manifest.base_spec_version保存
WorkDesk写入、提交、推送：均未执行
```

V22 最终验证事实：

```text
零写入进程前置检查：通过
源状态：EXACT_V21_TARGET
V22增量文件：3/3已应用；总工作区范围仍为批准的5文件
经验门禁：PASS
TypeScript no-emit：PASS
daemon-core build：PASS
全仓 deterministic build：PASS
git diff --check：PASS
installer verify：PASS（119/119）
daemon / OpenCode：STOPPED
WI-0003 Runtime状态：superseded
WI-0004 Runtime状态：created
WI-0004 candidate_manifest.base_spec_version：PSV-0002
WI-0004 candidate_manifest.entries：[]
WI-0004 trigger_result：符合真实生产者skeleton
Project Spec Version权威产物：candidate_manifest.base_spec_version
WorkDesk状态范围：4个STAT_ONLY_CONTENT_NEUTRAL + 8个WI-0003文件 + 7个WI-0004文件
WorkDesk文件与index：未修改
Project Modules：CLI、CORE、DOMAIN、REPORTING、STORAGE
Project Contract：0
Module Contract文件：5
正式Trace治理关系：0
场景准备结论：READY_FOR_CONTRACT_CONSUMER_SCENARIO_DESIGN
```

`P0-PSV-BINDING-001` 已完成真实项目验证并关闭。
`GOV-DEFECT-CONTRACT-CONSUMER-001` 仍为 `IN_PROGRESS`，不得把Work Item创建链验证
冒充完整Contract Consumer端到端验收。

V24 WorkDesk源码与Contract基线审计事实：

```text
SpecForge：main@553a6e4bcf414118dc4e038d96d4b1f1f980870f，工作区干净
WorkDesk：main@254e24646d10c6f71fc150ac80f689d007392170
WorkDesk状态：调查前后porcelain字节等价，index未修改
Project Modules：CORE、CLI、DOMAIN、REPORTING、STORAGE
Project Contract：0
Module contracts.json文件：5
正式Contract Registry条目：4
legacy internal namespace条目：2
Module Design constrained_by文本：16
正式Project Trace治理关系：0
WorkItemStatus源码文件：4
WorkItemRepository源码文件：2
ReportFormatter源码文件：3
```

V24 原始摘要中的 `DIRECT_PERSISTENCE_OUTSIDE_STORAGE=1` 是辅助取证脚本误报。
唯一命中来自 `src/cli/main.ts` 注释中的 `no direct fs / Bun.file calls`。
去除注释后，CLI、DOMAIN、REPORTING均无 `node:fs`、`fs`、`Bun.file(...)`
可执行调用；真实文件系统API只位于 `src/storage/json-file-store.ts`。
该误报不构成WorkDesk产品缺陷，但必须作为脚本/证据缺陷记录并修复。

WI-0004 已冻结为第一阶段真实场景：

```text
场景名称：WorkItemStatus Project Contract同ID规范化与正式Trace激活
当前Module Contract：DOMAIN/contracts.json中的WorkItemStatus
目标Project Contract：extension_registry.json中的WorkItemStatus
Contract来源：DATA-WD-003
正式消费者：
- DD-DOMAIN-003
- DD-STORAGE-001
- DD-REPORTING-002
- DD-CLI-002
保留并建立owner内正式关系：
- ReportFormatter ↔ DD-REPORTING-001
- WorkItemRepository ↔ DD-STORAGE-001
- PERSISTENCE_VIA_REPOSITORY ↔ DD-STORAGE-001
显式代码绑定目标：
- src/domain/transitions.ts
- src/storage/repository.ts
- src/reporting/formatters.ts
- src/cli/main.ts
```

该场景不是 `CON-PROM-001` 显式Promotion：
当前正式Trace为空，旧Module Contract没有可合法REMOVE的正式关系。
WI-0004先完成同ID规范化、Project Contract新增、多个消费者、Impact Scope、
Code Permission、实际代码对账、原子Merge、Verification和Close。
随后使用独立Work Item验证：

```text
WI-0005：WorkItemStatus破坏性变更/删除阻断
WI-0006：ReportFormatter正式Module→Project Promotion
```

WI-0004 Phase 1真实运行结果：

```text
Runtime最终状态：gates_failed
第一次Candidate Gate：5 passed / 5 failed
一次正式修复后第二次Candidate Gate：6 passed / 4 failed
Project Contract、DOMAIN Module Contract、Trace Delta候选内容：正确
candidate_manifest.entries：仅extension_registry 1项
User Decision / Merge / Code Permission / 业务代码修改：均未执行
```

确认的SpecForge产品缺陷：

```text
ERR-067：混合Candidate生产者导致Runtime Manifest缺项
ERR-068：Candidate Gate不按Classification要求产物
ERR-069：V25提示词和文档使用不存在的gates_passed状态
ERR-070：sf-design仍调用sf_safe_bash写治理产物并触发可避免HardStop
```

V26 已冻结并实现的产品修复：

```text
Runtime在candidate_preparing→candidate_prepared边界按Classification物化完整Manifest
已有显式Project Contract条目与规范Architecture、Module Design、Module Contract、Trace Delta统一收口
未变化的CORE Requirement和Project Data Model Candidate只保留为历史证据，不进入Manifest或Merge
Candidate required_files和workflow_specific Gate按正式Classification执行
Classification缺失时保持原有严格配置并失败关闭
sf-design和architecture_change Skill禁止sf_safe_bash写治理产物
Candidate Gate正式通过状态统一为approval_required
```

V26 只有在以下全部通过后才允许提交、升级用户级安装并推送：

```text
Manifest物化、状态边界、Classification Gate、Agent/Skill、Contract和Spec一致性回归
TypeScript no-emit
daemon-core build
全仓deterministic build
git diff --check
installer verify
用户级upgrade后再次verify
WorkDesk调查前后Git状态字节等价
权威文件未修改
```

V26成功后的下一项完整工作是：

```text
用户上传V26证据包
→ 用户手工启动daemon和OpenCode
→ WI-0004从gates_failed恢复到candidate_preparing
→ 不新增、不删除、不重写现有Candidate
→ candidate_preparing→candidate_prepared触发Runtime Manifest物化
→ Manifest精确包含extension_registry、architecture、DOMAIN design、DOMAIN module_contract、trace_delta
→ CORE Requirement和Project Data Model Candidate保留但不进入Manifest
→ 运行Candidate Gate一次
→ 通过时进入approval_required并立即停止
→ 不记录User Decision、不Merge、不释放Code Permission、不修改业务代码
```

真实场景至少覆盖：

```text
新建 Project Contract
登记多个 DD 消费者
Contract 变更时自动展开 Impact Scope
Code Permission 覆盖消费 Module
实际代码消费者与正式 Trace 对账
删除或破坏性变更的阻断
Module Contract 升级为 Project Contract
原子 Merge、Verification 和 Close
```

当前完成边界：

```text
P0-PSV-BINDING-001 已通过真实项目创建验证关闭
GOV-DEFECT-CONTRACT-CONSUMER-001 仍保持 IN_PROGRESS
Contract增加、消费者展开、实际代码对账、破坏性变更、Promotion、Merge、Verification和Close尚未真实端到端验证
不得启用最终 Hard Enforcement
不得把自动化测试或仅完成Work Item创建冒充完整真实业务项目验收
```

任何需要 daemon 或 OpenCode 的步骤，必须先明确告诉用户，由用户手工执行。

## 十、P0 已冻结实施边界

主要生产实现：

```text
packages/daemon-core/src/tools/lib/governance-trace-model.ts
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/src/tools/lib/contract-integrity.ts
packages/daemon-core/src/tools/lib/contracts-registry.ts
packages/daemon-core/src/tools/lib/code-contract-verifier.ts
packages/daemon-core/src/tools/lib/gate-runner-v11.ts
packages/daemon-core/src/tools/lib/merge-runner-v11.ts
packages/daemon-core/src/tools/lib/verification-report-contract.ts
packages/daemon-core/src/tools/lib/verification-governance-contract.ts
```

必须同步：

```text
sf-design
sf-task-planner
sf-verifier
feature_spec / architecture_change / design_first
contract_change / quick_change / spec_migration Workflow Skill
```

原 P0 Contract Consumer 实现冻结范围内明确不修改：

```text
sf_trace_matrix_core
impact-analysis
gate-chain
changed-files-audit
code-permission-service-v11
Contract Schema
```

该冻结清单只描述 `GOV-DEFECT-CONTRACT-CONSUMER-001` 的原实施范围。当前独立跟进缺陷允许修改 `gate-chain.ts`，但仅用于删除已被正式 Close Handler 绕过的重复 `code_only_fast_path` 过滤；Workflow 适用性唯一责任层已经收敛到 `close-gate.ts`，未新增 Gate 或第二套规则。

完整文件路径、原因和测试文件范围以活动实施文件第 19、20、21 节为准。

明确不处理：

```text
其他 P1/P2 差距
Requirement 治理扩展
所有语言的通用静态分析
最终 Gate Hard 收口
daemon 生命周期
服务器部署
fj1
GOV-DEBT-001 packages/daemon-core/.specforge
```

当前实现包已覆盖上述生产范围；`verification-governance-contract.ts` 和 `spec_migration` Skill 是实施中通过一手调用链及既有回归证据确认的最小扩展，原因已经回写活动实施文件第 19、23、25 节。

## 十一、P0 完成条件

必须覆盖活动实施文件中的全部回归场景，至少包括：

```text
Trace ADD / REMOVE 合法与非法操作
DD constrained_by Contract 合法关系
跨 Module 消费 Internal Contract 阻断
Project Contract 多 Module 消费
Contract 删除后的悬空消费者
完整与不完整 Module→Project Promotion
Impact Scope 自动展开全部消费者
Code Permission 覆盖全部消费 Module
生产代码实际消费但 Trace 未登记
未支持语言的人工审查证据
Fast Path 不得漏过 Contract/Trace 变化
Contract、Design、Trace 原子 Merge
Verification 和 Close 闭环
部署态 Tool、Skill、Agent 与源码一致
```

修改完成后必须执行：

```text
相关单元测试
属性测试（适用时）
集成测试
端到端测试（适用时）
回归测试
TypeScript no-emit
相关 package build
必要的全仓 deterministic build
git diff --check
git status --short
```

最终报告必须明确：

```text
实际修改
架构一致性
Contract 一致性
Trace 一致性
实际范围审计
测试与构建
权威文件是否需要同步
活动实施文件是否已更新
仍未解决问题
INSUFFICIENT_EVIDENCE
```

## 十一.一、V23 提交前最终状态对账

```text
V22证据包：已审计
证据包文件数：61
工程验证日志：6项全部EXIT=0
SpecForge实际修改范围：5个批准文件
权威文件：未修改
WorkDesk：只读审计，未修改文件或index
V23允许增量：仅current-handoff、经验库、经验门禁测试
提交范围：当前全部5个批准文件
提交后下一阶段：设计WI-0004最小完整Contract Consumer真实场景
```

V23 成功执行时必须在同一脚本中完成：

```text
零写入前置检查
→ 精确识别EXACT_V22_TARGET或EXACT_V23_TARGET
→ 应用3文件状态对账
→ 复跑全部验证
→ 暂存精确5文件
→ 提交
→ 推送yc/main
→ 远程HEAD与本地HEAD一致
→ 工作区干净
```

## 十二、daemon、OpenCode、提交和推送边界

不得自动启动、停止或重启 daemon。

不得自动启动 OpenCode。

任何需要 daemon 或 OpenCode 的步骤，必须先明确告诉用户，由用户手工执行。

不操作服务器，不操作 fj1。

未经用户明确要求，不推送远程仓库。

不得删除：

```text
C:\Users\luo\.config\opencode
C:\Users\luo\.specforge
```

## 十三、后续路线

当前先完成 WorkDesk 真实新项目 P0 验证。P0 状态达到 `COMPLETED` 后，再逐项处理：

```text
P1：Contract 完整兼容性分类
P1：Trace 架构语义闭包
P1：删除 Contract 后悬空关系及 Promotion 扩展回归
P2：唯一权威源结构性回归测试
P2：同一 WI 架构闭环防退化测试
全部 P0/P1/P2 和 Phase 11 条件满足后再决定最终三个核心 Gate Hard
GOV-DEBT-001 延期污染问题
```

不得提前把自动化测试冒充真实 OpenCode + SpecForge 业务项目验收。

不要重新生成全仓巨大日志。优先使用针对性的源码读取、测试和小范围证据。

## V26实际执行结果与V27隔离验证边界（2026-08-04）

```text
V26 RESULT=FAILED
FAILED_STAGE=WORKDESK_WI0004_EVIDENCE
ERROR=missing hard_stop.json
PATCH_FILES_APPLIED=0/13
COMMIT/INSTALL/PUSH=NOT_PERFORMED
SpecForge main/远程HEAD=d6dc931072aca519354fb4bc0857a64aacc58961
```

根因已经由源码和现场resolution日志证明：`hard_stop.json` 是活动锁；`sf_hard_stop_resolve` 把完整原记录写入 `hard_stop_resolution.jsonl` 后删除活动锁。恢复后缺少活动文件是正常结果。

V27固定执行边界：

```text
只读验证真实SpecForge远程、本地、工作区和进程边界
只读审计WorkDesk；hard_stop_resolution.jsonl为稳定历史证据
WorkDesk证据不足只标记INSUFFICIENT_EVIDENCE，不阻断独立源码修复
从SpecForge HEAD导出隔离副本
仅在隔离副本应用13文件补丁
运行定向测试、TypeScript、daemon-core build、全仓build、git diff --check
在隔离OPENCODE_CONFIG_DIR执行installer install + verify
不修改真实SpecForge工作区
不修改WorkDesk
不提交、不安装到真实用户目录、不推送
```

V27隔离验证成功前，不得启动daemon/OpenCode，不得恢复WI-0004。

## V27失败结果与V28隔离验证边界（2026-08-04）

```text
V27定向测试：73/73通过
失败阶段：TYPECHECK-DAEMON-CORE
workspace内部声明未准备：6项模块解析错误
本次补丁真实类型错误：2处可选workflowPath被收窄为必填string
真实SpecForge写入：未执行
WorkDesk写入：未执行
真实安装、提交、推送：未执行
```

V28保持原13文件范围，只在隔离副本执行：

```text
按正式workspace顺序预构建daemon-core内部依赖声明
定向测试
紧接daemon-core TypeScript noEmit
缺省workflowPath失败关闭回归
daemon-core build
全仓deterministic build
git diff --check
隔离OPENCODE_CONFIG_DIR installer install + verify
```

V28成功前不得启动daemon/OpenCode，不得恢复WI-0004，不得修改真实仓库、WorkDesk或用户级安装。

## V28—V33完成事实与WI-0004当前冻结状态（2026-08-04）

本节是本文件中最新的当前状态；此前V26、V27、V28“待执行”段落仅保留历史过程。

```text
远程仓库=https://github.com/lyqstart/SpecForge.git
目标分支=main
当前实现提交=a0333ba56854b26780960823b25db2faf67f080f
V28隔离验证=SUCCESS
V29真实应用=SUCCESS_EXACT_13_FILES
V30提交推送=SUCCESS
V33用户级升级=SUCCESS
installer verify=119/119
源码与部署一致性=119/119
SpecForge工作区=V33证据时CLEAN
WorkDesk=V33升级前后UNCHANGED
```

WI-0004真实恢复已经证明：

```text
Runtime在candidate_preparing→candidate_prepared自动物化5项Manifest
extension_registry、architecture、DOMAIN design、DOMAIN module_contract、trace_delta全部进入Manifest
历史CORE Requirement和Project Data Model Candidate被排除
Classification驱动Candidate和专业Gate范围正确
sf-design真实重试只使用sf_artifact_write，未使用sf_safe_bash
```

新的真实阻断为 `ERR-075`：

```text
Design Gate只扫描模块Design Candidate并要求system_governance
Write Guard正确限制显式非默认模块Design只允许solution_design
Project Architecture Candidate已声明system_governance但未被Design Gate消费
sf_artifact_write返回DESIGN_SCOPE_CONTRACT_MISMATCH
Candidate未修改
Gate未重跑
WI-0004当前状态=candidate_preparing
```

修复边界：不放宽Write Guard，不修改WorkDesk。Design Gate必须从冻结Candidate Manifest读取Project Architecture Candidate作为系统治理载体；Manifest外历史文件不得计入。V34冻结8文件，仅做隔离验证。V34成功前保持daemon/OpenCode停止，不回退或继续WI-0004。

## V34失败与V35隔离验证边界（2026-08-04）

V34未进入隔离应用阶段：

```text
RESULT=FAILED
FAILED_STAGE=SOURCE_HASH
BUNDLE_INTEGRITY=PASS
实际P0文件SHA256=094a08e41c74b418907d98757594833d8988dc24916c4df9f5c837509159d6af
V34错误预期SHA256=6bf1688ca749c56ef3364d98e7623ba2e2167d19ee64dbbe3b609a06e99348d2
真实SpecForge、WorkDesk、用户级安装、WI-0004=均未修改
daemon/OpenCode=停止
```

实际哈希与 `main@a0333ba56854b26780960823b25db2faf67f080f` 已提交文件一致。
V34生成器错误地复用了V30提交前的旧临时树，导致声明HEAD与Source Contract不一致。

V35只允许：

```text
按a0333ba精确字节重建8文件Source Contract
保留V34的ERR-075产品修复方向
增加ERR-076 / EXP-054及对应经验门禁
在Git HEAD导出的隔离副本中完成测试、TypeScript、构建、diff和installer验证
```

WI-0004继续保持 `candidate_preparing`。V35成功证据复核前，不得回退状态、修改Candidate、
运行Gate、启动daemon/OpenCode、修改真实SpecForge或用户级安装。


## V35失败与V36隔离验证边界（2026-08-04）

```text
V35 RESULT=FAILED
FAILED_STAGE=TARGETED-TESTS
BASELINE/SOURCE_CONTRACT=PASS_EXACT_A0333BA
ISOLATED_PATCH=APPLIED_8_OF_8
DEPENDENCY_PREPARATION=PASS
TESTS=124 passed / 3 failed
真实SpecForge、WorkDesk、用户级安装、WI-0004=未修改
```

失败闭包：

```text
ERR-077：Architecture载体新测试断言与Bun运行器不兼容
ERR-078：Design阶段错误提前要求Requirement Candidate和Requirements Gate
ERR-079：Orchestrator行数测试把末尾换行计为额外逻辑行
```

V36允许11文件：V35原实现和文档、`gate-runner-v11.ts`、Candidate Phase独立回归、Orchestrator测试。V36必须先运行未打补丁基线A/B控制，再应用补丁并完成定向测试、TypeScript、daemon-core build、全仓build、`git diff --check` 和隔离installer verify。

WI-0004继续冻结在 `candidate_preparing`。V36成功、真实应用、提交、用户级升级完成前，不得启动daemon/OpenCode，不得修改Candidate、回退状态或运行Gate。

## V36失败与V37隔离验证边界（2026-08-04）

```text
V36 RESULT=FAILED
FAILED_STAGE=TARGETED-TESTS
SOURCE_CONTRACT=PASS_EXACT_A0333BA
BASELINE_CONTROL=PASS_EXPECTED_2_FAILS
ISOLATED_PATCH=APPLIED_11_OF_11
DEPENDENCY_PREPARATION=PASS
TESTS=129 passed / 1 failed
唯一失败=经验门禁仍断言V35旧状态
真实SpecForge、WorkDesk、用户级安装、WI-0004=未修改
daemon/OpenCode=停止
```

V36产品代码和其余129项测试通过。唯一缺陷为 `ERR-080`：经验台账已经更新ERR-075/076当前状态，但经验门禁仍要求上一轮V35临时状态，形成状态生产者与固定文本消费者冲突。

V37保持V36精确11文件和产品实现不变，只同步ERR-075—ERR-080状态、EXP-058、经验门禁和两份状态文档。V37必须重新执行A/B基线控制、130项定向测试、TypeScript、daemon-core build、全仓build、`git diff --check` 和隔离installer verify。

WI-0004继续冻结在 `candidate_preparing`。V37成功、真实应用、提交和用户级升级完成前，不得启动daemon/OpenCode，不得修改Candidate、回退状态或运行Gate。

## V37失败与V38隔离验证边界（2026-08-04）

```text
V37 RESULT=FAILED
FAILED_STAGE=GIT-DIFF-CHECK
SOURCE_CONTRACT=PASS_EXACT_A0333BA
BASELINE_CONTROL=PASS_EXPECTED_2_FAILS
ISOLATED_PATCH=APPLIED_11_OF_11
EXPERIENCE_STATE_CONTRACT=PASS_ATOMIC_V37
TARGETED_TESTS=130/130
TYPECHECK=PASS
DAEMON_CORE_BUILD=PASS
WORKSPACE_BUILD=PASS
唯一失败=两个Markdown文件新增EOF空白行
真实SpecForge、WorkDesk、用户级安装、WI-0004=未修改
daemon/OpenCode=停止
```

V38保持V37产品实现和精确11文件范围不变，新增ERR-081/EXP-059，对全部目标文本文件执行“一个且仅一个LF结尾”的字节级检查，并重新运行完整验证链。

WI-0004继续冻结在 `candidate_preparing`。V38成功、真实应用、提交和用户级升级完成前，不得启动daemon/OpenCode，不得修改Candidate、回退状态或运行Gate。

## V38成功与V39过程治理补录边界（2026-08-04）

V38隔离验证全部通过，真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

V39补录：

```text
ERR-082=证据收集CMD换行和组合语法失败
ERR-083=压缩包下载链接缺失或损坏
ERR-084=V37生成器脆弱文本锚点两次失败
ERR-085=修改前经验门禁没有强制先补录全部既往失败
ERR-086=生成器错误依赖跨工具临时目录
ERR-087=生成器按记忆使用不存在的旧锚点
```

V39保持V38产品代码和精确11文件范围不变，补录ERR-082—ERR-087、EXP-060—EXP-065，并把“先补录失败、再重读经验、再开始修改”的门禁同步到本文件、经验台账、经验门禁测试和验证器。

WI-0004继续冻结在 `candidate_preparing`。V39成功、真实应用、提交和用户级升级完成前，不得启动daemon/OpenCode，不得修改Candidate、回退状态或运行Gate。

## V39/V40成功与V41提交前状态闭包（2026-08-04）

```text
V39_ISOLATED_VALIDATION=SUCCESS
V40_REAL_REPOSITORY_APPLY=SUCCESS
V40_PATCH_ACTION_REAL_REPOSITORY=APPLIED_11_OF_11
V40_TARGETED_TESTS=PASS
V40_TYPECHECK=PASS
V40_DAEMON_CORE_BUILD=PASS
V40_WORKSPACE_BUILD=PASS
V40_GIT_DIFF_CHECK=PASS
V40_INSTALLER_ISOLATED_VERIFY=PASS
V40_FINAL_SCOPE=PASS_EXACT_11_FILES
V40_WORKDESK_AUDIT=PASS_UNCHANGED
V40_REAL_INSTALL_ACTION=NOT_PERFORMED
V40_COMMIT_ACTION=NOT_PERFORMED
V40_PUSH_ACTION=NOT_PERFORMED
```

V40已把V39验证通过的精确11文件应用到真实SpecForge。产品实现、过程治理门禁和测试均已在真实工作树重新验证。

V40应用后的状态文件仍保存“V39待真实应用”描述，因此不得直接提交。V41只允许更新：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
docs/implementation/architecture-consistency/current-handoff.md
docs/rule/specforge-development-error-ledger-and-experience.md
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
```

V41不修改产品代码，不扩大最终11文件范围。V41必须验证当前工作树精确等于V40的11个目标哈希，更新4个状态消费者后重新执行过程门禁、130项定向测试、TypeScript、daemon-core build、全仓build、`git diff --check`、隔离installer verify和最终精确11文件审计。

V41成功后下一步才是提交和推送。提交前不得安装用户级组件，不得启动daemon/OpenCode，不得继续WI-0004。

## V42提交推送闭包与下一阶段边界（2026-08-04）

V42提交内容保持V41验证通过的精确11文件，其中4个状态消费者在提交前对账为稳定的提交后状态。完整提交前验证包括：

```text
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0
REPEATED_ERROR_CHECK=PASS
TARGETED_TESTS=PASS
TYPECHECK=PASS
DAEMON_CORE_BUILD=PASS
WORKSPACE_BUILD=PASS
GIT_DIFF_CHECK=PASS
INSTALLER_ISOLATED_VERIFY=PASS
FINAL_SCOPE=PASS_EXACT_11_FILES
WORKDESK_AUDIT=PASS_UNCHANGED
```

V42成功路径必须同时满足：

```text
COMMIT_ACTION=COMMITTED_EXACT_11_FILES
PUSH_ACTION=PUSHED_MAIN
LOCAL_HEAD_AFTER_COMMIT=REMOTE_HEAD_AFTER_PUSH
WORKTREE=CLEAN
```

本文件不写入包含自身内容的提交SHA，避免自引用提交。实际SHA、提交标题、远程核对和11文件清单以 `SpecForge-v42-commit-evidence-*.zip` 为正式执行证据。

V42不执行用户级安装，不修改WorkDesk或WI-0004。下一阶段按顺序执行：

```text
用户级安装升级与119/119一致性验证
→ 用户手工启动daemon
→ 用户手工启动OpenCode
→ 在当前WI-0004 candidate_preparing现场重跑正式Candidate准备和Gate
→ 通过时进入approval_required并立即停止
```

WorkDesk重验期间禁止修改Candidate内容、运行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V43真实重验、V44失败与V45边界（2026-08-04）

```text
SPECFORGE_HEAD=c01d09866aeef93d64bd08026bf0ccff654f51cd
V43_USERLEVEL_UPGRADE=SUCCESS
WORKDESK_STATE=gates_failed
CANDIDATE_CONTENT_CHANGED=NO
MANIFEST_ENTRIES=5
MANIFEST_EXCLUDED_HISTORY=2
ERR-078=CLOSED_WORKDESK_REAL_RETEST
ERR-075=BLOCKED_BY_ERR-088
```

V44隔离验证结果：

```text
REAL_ARCHITECTURE_TITLE_TEST=PASS
ARCHITECTURE_CARRIER_TEST=PASS
DESIGN_GOVERNANCE_TESTS=PASS
INVESTIGATION_GATE_TESTS=3_FAILED
FIXED_TEXT_CONSUMER_TESTS=2_FAILED
REAL_REPOSITORY_WRITE=NONE
WORKDESK_WRITE=NONE
USERLEVEL_INSTALL=NONE
```

失败分类：

```text
ERR-088=真实Architecture标题需要受控后缀兼容
ERR-089=V44使用\s导致标题匹配跨行吞掉首条正文
ERR-090=两个固定文本消费者未与最终状态生产者同步
```

V45允许精确8文件：共享Matcher、Architecture Carrier真实标题测试、Matcher专项回归、既有经验门禁、ERR-088专项测试、经验台账和两份状态文档。产品架构、Contract、Gate职责、Write Guard、Agent/Skill、状态机均不变。

WorkDesk保持 `gates_failed`。V45隔离验证、真实应用、提交、用户级升级完成前，不得修改Candidate、回退状态或再次运行Gate。

## V45唯一测试转义失败与V46边界（2026-08-04）

```text
V45_BASELINE_CONTROL=PASS
V45_ISOLATED_PATCH=APPLIED_EXACT_8_FILES
V45_TARGETED_TESTS=143 passed / 1 failed
PRODUCT_MATCHER_TESTS=PASS
REAL_ARCHITECTURE_TITLE=PASS
INVESTIGATION_GATES=PASS
DESIGN_GOVERNANCE=PASS
EXPERIENCE_GATE=PASS
FAILED_TEST=ERR-088—ERR-090专项测试第54行
REAL_REPOSITORY_WRITE=NONE
WORKDESK_WRITE=NONE
USERLEVEL_INSTALL=NONE
```

唯一失败ERR-091：

```text
正式P0文本=标题内部空白全部使用[ \t]（字面量反斜杠+t）
测试普通字符串=标题内部空白全部使用[ <TAB>]（运行时制表符）
```

V46不修改产品Matcher、Architecture Carrier或Investigation逻辑，只把专项测试改为 `String.raw`，补录ERR-091/EXP-069，并同步全部状态消费者。最终范围仍为精确8文件。

WorkDesk保持 `gates_failed`。V46隔离验证、真实应用、提交和用户级升级完成前，不得修改Candidate、回退状态或再次运行Gate。

## V46唯一String.raw非ASCII失败与V47边界（2026-08-04）

```text
V46_BASELINE_CONTROL=PASS
V46_ISOLATED_PATCH=APPLIED_EXACT_8_FILES
V46_TARGETED_TESTS=143 passed / 1 failed
PRODUCT_MATCHER_TESTS=PASS
REAL_ARCHITECTURE_TITLE=PASS
INVESTIGATION_GATES=PASS
DESIGN_GOVERNANCE=PASS
FAILED_TEST=ERR-088—ERR-091专项测试第59行
EXPECTED_RUNTIME_VALUE=\u6807\u9898...（字面量Unicode转义）
P0_ACTUAL_VALUE=中文正文 + 字面量\t
REAL_REPOSITORY_WRITE=NONE
WORKDESK_WRITE=NONE
USERLEVEL_INSTALL=NONE
```

ERR-092说明：在当前Bun测试转换链中，`String.raw` 的非ASCII模板内容被暴露为Unicode转义源文本。V47改用普通中文字符串并对反斜杠做双重转义。

V47不修改产品Matcher、Architecture Carrier或Matcher专项产品测试，只补录ERR-092/EXP-070并同步固定文本消费者。最终范围仍为精确8文件。

WorkDesk保持 `gates_failed`。V47隔离验证、真实应用、提交和用户级升级完成前，不得修改Candidate、回退状态或再次运行Gate。

## V47隔离成功与V48真实应用边界（2026-08-04）

```text
V47_RESULT=SUCCESS
V47_BASELINE_CONTROL=PASS
V47_TARGETED_TESTS=PASS_144
V47_TYPECHECK=PASS
V47_DAEMON_CORE_BUILD=PASS
V47_WORKSPACE_BUILD=PASS
V47_GIT_DIFF_CHECK=PASS
V47_INSTALLER_ISOLATED_VERIFY=PASS
V47_FINAL_SCOPE=PASS_EXACT_8_FILES
V47_WORKDESK_AUDIT=PASS_UNCHANGED
V47_REAL_REPOSITORY_WRITE=NONE
```

V47证明：

```text
真实Project Architecture破折号标题可以识别
标准标题和直接括号标题继续兼容
标题匹配不会跨行吞掉下一行首条正文
嵌入式标题、无受控分隔符后缀和空说明继续拒绝
Requirements、Design和Architecture Carrier消费者共同通过
ERR-090—ERR-092固定文本验证缺陷闭合
```

V48只允许把V47精确8文件应用到真实SpecForge，并重新执行144项定向测试、TypeScript、daemon-core build、全仓build、`git diff --check`和隔离installer verify。

WorkDesk保持 `gates_failed`，Candidate内容保持不变。V48不提交、不推送、不安装真实用户级组件，不运行WI-0004 Gate。

## V48真实应用成功与V49提交前状态闭包（2026-08-04）

```text
V48_RESULT=SUCCESS
V48_PATCH_ACTION_REAL_REPOSITORY=APPLIED_EXACT_8_FILES
V48_TARGETED_TESTS=PASS_144
V48_TYPECHECK=PASS
V48_DAEMON_CORE_BUILD=PASS
V48_WORKSPACE_BUILD=PASS
V48_GIT_DIFF_CHECK=PASS
V48_INSTALLER_ISOLATED_VERIFY=PASS
V48_FINAL_SCOPE=PASS_EXACT_8_FILES
V48_WORKTREE=DIRTY_EXACT_8_FILES
V48_WORKDESK_AUDIT=PASS_UNCHANGED
V48_REAL_INSTALL_ACTION=NOT_PERFORMED
V48_COMMIT_ACTION=NOT_PERFORMED
V48_PUSH_ACTION=NOT_PERFORMED
```

V48已经把V47验证通过的精确8文件应用到真实SpecForge。共享Matcher、真实Architecture标题、Investigation和Design Governance消费者均在真实工作树重新验证通过。

V49只允许更新现有8文件中的5个状态消费者：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
docs/implementation/architecture-consistency/current-handoff.md
docs/rule/specforge-development-error-ledger-and-experience.md
packages/daemon-core/tests/unit/specforge-development-err088.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
```

以下3个产品/回归文件必须保持V48哈希：

```text
packages/daemon-core/src/tools/lib/sf_section_matcher.ts
packages/daemon-core/tests/design-governance-architecture-carrier.test.ts
packages/daemon-core/tests/section-matcher-real-title-regression.test.ts
```

V49成功后进入提交推送。提交前不安装真实用户级组件，不修改WorkDesk或WI-0004，不运行Gate。

## V50提交推送闭包与下一阶段边界（2026-08-04）

V50提交内容保持V49验证通过的精确8文件，其中5个状态消费者在提交前对账为稳定的提交后状态。提交前完整验证必须满足：

```text
PRIOR_FAILURE_RECONCILIATION=PASS
UNRECORDED_FAILURES=0
REPEATED_ERROR_CHECK=PASS
TARGETED_TESTS=PASS_144
TYPECHECK=PASS
DAEMON_CORE_BUILD=PASS
WORKSPACE_BUILD=PASS
GIT_DIFF_CHECK=PASS
INSTALLER_ISOLATED_VERIFY=PASS
COMMIT_SCOPE=PASS_EXACT_8_FILES
WORKDESK_AUDIT=PASS_UNCHANGED
```

V50成功路径：

```text
COMMIT_ACTION=COMMITTED_EXACT_8_FILES
PUSH_ACTION=PUSHED_MAIN
LOCAL_HEAD_AFTER_COMMIT=REMOTE_HEAD_AFTER_PUSH
WORKTREE=CLEAN
REAL_INSTALL_ACTION=NOT_PERFORMED
WI0004_ACTION=NOT_PERFORMED
```

本文件不写入包含自身内容的提交SHA。实际SHA、提交标题、远程核对和8文件清单以V50证据包为正式执行证据。

V50完成后按顺序执行：

```text
用户级安装升级与119/119一致性验证
→ 用户手工启动daemon
→ 用户手工启动OpenCode
→ 只读确认WI-0004仍为gates_failed且Candidate未改变
→ 按Runtime允许的受控恢复路径重新进入gates_running
→ 只运行一次正式Candidate Gate
→ 成功进入approval_required后立即停止
```

WorkDesk重验期间禁止修改Candidate、运行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V51用户级升级、WorkDesk重验成功与V52边界（2026-08-04）

```text
SPECFORGE_HEAD=07962406e8ddae9daaf456a4cb185dfe0a340cf3
V51_USERLEVEL_UPGRADE=SUCCESS
MANIFEST=119/119
MANAGED_AGENTS=9/9
WORKDESK_STATE_BEFORE=gates_failed
RECOVERY_PATH=gates_failed→candidate_preparing→candidate_prepared→gates_running
GATE_RUN_COUNT=1
GATES=10/10 PASSED
WORKDESK_STATE_AFTER=approval_required
CANDIDATE_CONTENT_CHANGED=NO
ERR-075=CLOSED_WORKDESK_REAL_RETEST
ERR-088=CLOSED_WORKDESK_REAL_RETEST
```

真实重验确认：

```text
Project Architecture Candidate正确承担system_governance
DOMAIN Module Design保持solution_design
带破折号说明的Solution Strategy真实标题正确识别
Requirement Candidate未被错误要求
Manifest外历史Candidate未被扫描
```

本轮还产生一次可避免HardStop：

```text
HARD_STOP_ID=HS-1785858808264
REASON=SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN
TRIGGER=sf_safe_bash执行certutil/Get-FileHash只读哈希
RESOLUTION=operator_error
BLOCKED_ACTION_DISPOSITION=abandon
SAFE_ALTERNATIVE=Read完整内容快照
FINAL_HARD_STOP=RESOLVED
```

Write Guard与HardStop恢复协议工作正确；缺陷位于验证指令和主编排代理的只读证据工具选择。V52只修改主编排代理、两项过程测试和三份状态/经验文档，共精确7文件。

WI-0004保持 `approval_required`。V52不得运行User Decision、Merge、Code Permission、业务代码、Verification或Close，不得修改WorkDesk或Candidate。

## V52证据消费者假阴性与V53边界（2026-08-05）

```text
V52_RESULT=FAILED
V52_FAILED_STAGE=OPENCODE_EVIDENCE
V52_ONLY_MISSING_ASSERTION=HARD_STOP_ID=HS-1785858808264
V52_PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
V52_WORKDESK_WRITE=NOT_PERFORMED
V52_WI0004_ACTION=NOT_PERFORMED
V52_TESTS_NOT_STARTED=YES
```

OpenCode一手日志真实表达为：

```text
发现真实 HardStop：HS-1785858808264
hard_stop_id=HS-1785858808264
HARD_STOP_STATUS=RESOLVED（HS-1785858808264...）
```

因此V52失败属于证据消费者固定格式假阴性，不是HardStop证据不足，也不是V52七文件方案失败。

V53保持V52精确7文件范围，验证器改为要求以下事实组全部成立：

```text
HardStop ID
SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN
operator_error
blocked_action_disposition=abandon
retry_original_action=false
最终HardStop已解除
Gate 10/10通过且最终approval_required
```

WI-0004继续保持 `approval_required`。V53不得运行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V53基线测试漂移与V54边界（2026-08-05）

```text
V53_RESULT=FAILED
V53_FAILED_STAGE=BASELINE-CONTROL
V53_STABLE_TESTS=73 PASSED
V53_STALE_TESTS=2 FAILED
V53_PATCH_APPLIED=NO
V53_REAL_REPOSITORY_WRITE=NONE
V53_WORKDESK_WRITE=NONE
```

两个失败均来自同一旧契约消费者：

```text
packages/daemon-core/tests/unit/v11-hard-stop-artifact-closure.test.ts
```

当前正式实现规定：

```text
work_item.json=元数据
必填=schema_version + work_item_id
status=禁止字段
权威状态=StateManager/events.jsonl
```

旧测试仍要求 `status` 必填，并把含 `status` 的样例视为合法。

V54冻结精确8文件：V53七文件加该旧测试文件。V54不修改 `artifact-schema-validation.ts`，只同步测试消费者和fixture，并要求补丁前精确重现2项失败、补丁后同一文件全部通过。

WI-0004继续保持 `approval_required`，不得运行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V54通过数量硬编码假阴性与V55边界（2026-08-05）

```text
V54_RESULT=FAILED
V54_FAILED_STAGE=BASELINE_KNOWN_ERR096
V54_PROCESS_EXIT=1
V54_ACTUAL_PASS=52
V54_ACTUAL_FAIL=2
V54_ACTUAL_TOTAL=54
V54_EXPECTED_FAILURE_SET=EXACT_2_MATCHED
V54_ONLY_MISSING_ASSERTION=49 pass
V54_PATCH_APPLIED=NO
V54_REAL_REPOSITORY_WRITE=NONE
V54_WORKDESK_WRITE=NONE
```

V54已经取得ERR-096所需的一手事实，但验证器错误固定无关通过数量。

V55保持精确8文件，已知失败验证改为：

```text
提取全部(fail)测试名
失败集合必须精确等于ERR-096两项
fail计数必须为2
Ran total必须等于pass+fail
不固定pass数量
```

WI-0004继续保持 `approval_required`，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V55封包静态审计作用域修正（2026-08-05）

```text
FIRST_PACKAGE_ATTEMPT=BLOCKED_BY_STATIC_AUDIT
ERR-098=SELF_CAUGHT
ZIP_CREATED_ON_FIRST_ATTEMPT=NO
USER_ACTION_REQUIRED_ON_FIRST_ATTEMPT=NO
REAL_REPOSITORY_WRITE=NONE
WORKDESK_WRITE=NONE
```

V55验证器必须在 `verify_v54_failure` 中保留 `49 pass`，证明V54原始失败；但 `BASELINE_KNOWN_ERR096` 当前解析算法不得再固定该数量。

最终封包审计分别检查两个作用域，并使用V54真实日志验证失败集合、pass/fail/total关系。

## V55实际8文件成功与摘要旧常量不一致、V56边界（2026-08-05）

```text
V55_RESULT=SUCCESS
V55_TARGET_HASH_COUNT=8
V55_GIT_DIFF_FILE_COUNT=8
V55_MANIFEST_FILE_COUNT=8
V55_TARGETED_TESTS=PASS
V55_TYPECHECK=PASS
V55_BUILD=PASS
V55_INSTALLER_VERIFY=PASS
V55_WORKDESK_AUDIT=PASS_UNCHANGED
V55_SUMMARY_PATCH_SCOPE=7_FILES_INCORRECT
V55_SUMMARY_FINAL_SCOPE=7_FILES_INCORRECT
V55_SUMMARY_ERROR_IDS=ERR-093,ERR-094_INCOMPLETE
```

V55产品与测试结果有效，但证据摘要不满足内部一致性，不能进入真实应用。

V56保持精确8文件，摘要字段必须由Manifest派生，并增加：

```text
TARGET_FILE_COUNT=8
SUMMARY_MANIFEST_TARGET_CONSISTENCY=PASS
BACKFILLED_ERROR_IDS=Manifest正式值
ISOLATED_PATCH_ACTION=APPLIED_EXACT_8_FILES
FINAL_SCOPE=PASS_EXACT_8_FILES
```

WI-0004继续保持 `approval_required`。不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V56验证器模块依赖失败与V57边界（2026-08-05）

```text
V56_RESULT=FAILED
V56_FAILED_STAGE=UNEXPECTED
V56_ERROR=NameError: name 're' is not defined
V56_FAILURE_FUNCTION=verify_v55_evidence_mismatch
V56_PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
V56_REAL_INSTALL_ACTION=NOT_PERFORMED
V56_WORKDESK_WRITE=NOT_PERFORMED
V56_WI0004_ACTION=NOT_PERFORMED
V56_TESTS_STARTED=NO
```

根因：

```text
模块级函数调用re.findall
验证器没有模块级import re
另一个执行块中的局部import re不可被模块级函数使用
compile静态检查无法发现NameError
```

V57保持精确8文件范围。验证器增加模块级 `import re`，并在压缩包生成前实际加载最终脚本、调用V55和V56证据对账函数。

V57成功摘要必须同时满足：

```text
V56_FAILURE_RECONCILIATION=PASS_ERR-100
V55_EVIDENCE_RECONCILIATION=PASS_ERR-099
TARGET_FILE_COUNT=8
ISOLATED_PATCH_ACTION=APPLIED_EXACT_8_FILES
FINAL_SCOPE=PASS_EXACT_8_FILES
BACKFILLED_ERROR_IDS=ERR-093—ERR-100完整集合
```

WI-0004继续保持 `approval_required`，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V57实际成功与经验规则摘要遗漏、V58边界（2026-08-05）

```text
V57_RESULT=SUCCESS
V57_TARGET_FILE_COUNT=8
V57_TARGETED_TESTS=86/86 PASS
V57_TYPECHECK=PASS
V57_DAEMON_CORE_BUILD=PASS
V57_WORKSPACE_BUILD=PASS
V57_GIT_DIFF_CHECK=PASS
V57_INSTALLER_VERIFY=119 FILES
V57_WORKDESK_AUDIT=PASS_UNCHANGED
V57_MANIFEST_EXPERIENCE_RULES=EXP-004...EXP-079
V57_SUMMARY_EXPERIENCE_RULES=EXP-004...EXP-076
```

V57产品验证有效，但摘要仍遗漏 `EXP-077,EXP-078`，不能直接进入真实应用。

V58保持精确8文件。摘要中的全部经验治理字段必须从Manifest原子派生：

```text
PRIOR_FAILURE_RECONCILIATION
BACKFILLED_ERROR_IDS
UNRECORDED_FAILURES
EXPERIENCE_FILE_READ
APPLICABLE_EXPERIENCE_RULES
REPEATED_ERROR_CHECK
```

V58成功必须报告 `V57_EVIDENCE_RECONCILIATION=PASS_ERR-101`，且适用经验规则包含EXP-077、EXP-078、EXP-079。

WI-0004继续保持 `approval_required`，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## 新会话接续与验证效率强制规则（2026-08-05）

### 1. 新会话读取顺序

新会话不能只依赖本文件，也不能依赖模型跨会话记忆。固定读取顺序：

```text
1. GitHub远程main当前HEAD
2. docs/design/SpecForge架构一致性治理最终实施方案.md
3. 本文件 current-handoff.md
4. docs/rule/specforge-development-error-ledger-and-experience.md
5. 最新成功证据包的summary.json、manifest.json、target-hashes.json和Git patch
6. 当前远程源码事实
```

权威层级：

```text
唯一权威实施方案
> 当前远程源码与正式契约
> current-handoff.md交接事实
> 历史实施文档和对话记忆
```

本文件只负责当前阶段、证据索引、下一动作和操作边界；不得覆盖唯一权威实施方案。

### 2. 当前稳定接续事实

```text
REMOTE_MAIN_BASELINE=07962406e8ddae9daaf456a4cb185dfe0a340cf3
AUTHORITY_COMMIT=08629b58c6aad82bf669a35e1f2bc8473cfa7ef3
AUTHORITY_SHA256=98410b513692acc049403c9cc8d2b6264edbb3cbc2d0798089e7458ac6674ccd
V59_ISOLATED_VALIDATION=SUCCESS
V59_EVIDENCE_SHA256=c690707c1b98a3cdb29b401af433fdd52c182f6245f3806a0647bc56b3963995
V59_TARGET_FILE_COUNT=8
V59_TARGETED_TESTS=PASS
V59_TYPECHECK=PASS
V59_DAEMON_CORE_BUILD=PASS
V59_WORKSPACE_BUILD=PASS
V59_GIT_DIFF_CHECK=PASS
V59_INSTALLER_ISOLATED_VERIFY=PASS
V59_WORKDESK_AUDIT=PASS_UNCHANGED
V59_PACKAGE_INTEGRITY_AUDIT=ERR-102_CLOSED
V60_ISOLATED_VALIDATION=FAILED
V60_FAILED_STAGE=ISOLATED_BASELINE_ERR096
V60_FAILURE_CLASS=VALIDATOR_DEFECT
V60_ERROR_ID=ERR-103
V60_SEMANTIC_FAILURE_SET=PASS_ERR096_EXACT_2
V60_COUNTS=PASS_52_FAIL_2_TOTAL_54
V60_REAL_REPOSITORY_APPLY=NOT_PERFORMED
V60_USERLEVEL_DEPLOYMENT=NOT_PERFORMED
V60_COMMIT_PUSH=NOT_PERFORMED
V61_EXECUTION=FAILED
V61_FAILED_STAGE=REMOTE_HEAD
V61_FAILURE_CLASS=ENVIRONMENT_FAILURE
V61_ERROR_ID=ERR-104
V61_LOCAL_BRANCH=main
V61_LOCAL_HEAD=07962406e8ddae9daaf456a4cb185dfe0a340cf3
V61_LOCAL_WORKTREE=CLEAN
V61_REMOTE_URL=https://github.com/lyqstart/SpecForge.git
V61_REAL_REPOSITORY_APPLY=NOT_PERFORMED
V61_USERLEVEL_DEPLOYMENT=NOT_PERFORMED
V61_COMMIT_PUSH=NOT_PERFORMED
V62_PACKAGE_GENERATION=FAILED
V62_FAILURE_CLASS=PACKAGE_PREFLIGHT_DEFECT
V62_ERROR_ID=ERR-105
V62_FORBIDDEN_CACHE=scripts/__pycache__/run.cpython-313.pyc
V62_ZIP_GENERATED=NO
V62_REAL_REPOSITORY_APPLY=NOT_PERFORMED
V63_REMOTE_HEAD_CONTRACT=GIT_DEFAULT_THEN_GIT_OPENSSL_THEN_OFFICIAL_GITHUB_REF_API
V63_PUSH_CONTRACT=EXPLICIT_FORCE_WITH_LEASE_AND_REMOTE_FACT_RECHECK
V63_BYTECODE_CONTRACT=ZERO_PYC_AFTER_EVERY_PYTHON_STAGE
V63_ACTUAL_RESULT=READ_FROM_V63_EXECUTION_EVIDENCE
WORKDESK_WI0004_STATE=approval_required
WORKDESK_WRITE=NOT_PERFORMED
```

WI-0004的正式Gate已经只运行一次并10/10通过。不得为了验证SpecForge自身修改再次运行Gate，也不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close，除非用户后续明确启动WorkDesk业务项目生命周期。

### 3. 失败分类先于修改

任何失败必须先归入一个且仅一个主类：

```text
PRODUCT_DEFECT
TEST_DRIFT
VALIDATOR_DEFECT
ENVIRONMENT_FAILURE
PACKAGE_PREFLIGHT_DEFECT
EVIDENCE_REPORTING_DEFECT
```

处理规则：

```text
PRODUCT_DEFECT / TEST_DRIFT
→ 可以重新执行影响分析并调整仓库修改范围

VALIDATOR_DEFECT / PACKAGE_PREFLIGHT_DEFECT / EVIDENCE_REPORTING_DEFECT
→ 不得扩大产品模块、架构、契约或Runtime范围
→ 只修验证器、过程经验和必要状态消费者

ENVIRONMENT_FAILURE
→ 保留原始证据
→ 使用批准的替代入口
→ 不得误报为产品缺陷
```

不得以“后来通过”覆盖中间失败。每个实际失败必须有ERR、根因、EXP类防护和机器回归或封包预检。

### 4. 连续验证器失败的停止重构规则

同一任务连续出现两个验证器、封包或结果摘要缺陷时，必须停止复制上一版继续打补丁，先完成：

```text
列出所有重复事实源
→ 删除手工文件数量、错误ID、经验规则和状态常量
→ 重构为Manifest单一事实源
→ 拆分纯证据解析函数与有副作用执行函数
→ 用真实历史证据调用全部变更函数
→ 通过后才生成下一包
```

不得继续采用：

```text
复制上一版
→ 修改一个字符串
→ 交给用户运行
→ 再根据下一个错误继续修补
```

### 5. Manifest单一事实源

以下字段必须只由Manifest派生：

```text
changed_paths
target_file_count
source_hashes
target_hashes
backfilled_error_ids
unrecorded_failures
experience_file_read
applicable_experience_rules
repeated_error_check
patch_scope
final_scope
```

成功前必须满足：

```text
set(Manifest.changed_paths)
= set(target-hashes.json)
= set(Git diff paths)
= 实际修改文件集合

summary.target_file_count
= len(Manifest.changed_paths)

summary经验治理字段
= Manifest.prior_failure_reconciliation全部字段
```

禁止在验证器多个位置重复手工维护 `7_FILES`、`8_FILES`、ERR列表或EXP列表。

### 6. 验证器交付前自检

交给用户运行前必须依次完成：

```text
compile最终脚本
→ importlib实际加载最终脚本
→ 验证模块级依赖可见
→ 使用真实历史证据包调用所有新增或修改的纯解析函数
→ 对正向与失败证据各执行一次
→ 生成临时summary
→ 对账summary、Manifest、target hashes和Git diff
→ 检查RUN.cmd
→ 最后生成ZIP
```

只执行 `compile()`、字符串搜索或人工阅读，不能作为验证器完成证据。

### 7. 证据按语义和集合验证

运行日志验证使用事实组合，不绑定人工合成字段或单一自然语言格式。

正确方式：

```text
ID、原因、状态、动作、结果分别形成事实组
→ 每组允许正式来源中的多种表达
→ 所有事实组必须同时成立
```

已知失败验证必须比较精确失败集合，并校验：

```text
actual_failed_tests == approved_failed_tests
fail_count == len(approved_failed_tests)
total_count == pass_count + fail_count
```

不得固定与缺陷判定无关的pass数量。

### 8. 稳定状态优先

经验台账和交接状态优先使用稳定生命周期：

```text
IDENTIFIED
FIX_IMPLEMENTED
ISOLATED_VALIDATED
REAL_APPLIED
COMMITTED
USERLEVEL_DEPLOYED
REAL_PROJECT_VALIDATED
CLOSED
```

V版本、commit SHA、证据包路径和时间戳放在对应证据段，不为每次重试反复改写多个状态消费者。

### 9. 用户执行应是最后一步

凡是可以在封包环境中完成的无副作用检查，必须在交付前完成。用户只负责运行必须依赖其本地真实仓库、Bun、Windows用户级目录或手工daemon/OpenCode生命周期的步骤。

每轮仍固定：

```text
一个完整ZIP
+ 一条可直接复制的CMD命令
```

涉及daemon或OpenCode的启动、停止、重启，只告知用户，由用户手工操作。

### 10. 当前下一步

V60在隔离基线控制中因ERR-103停止。V61已用真实V60日志完成语义失败集合解析预检，但在远程HEAD读取时遭遇ERR-104环境失败并在任何真实写入前停止。

V62实现了ERR-104远程读取回退，但封包期默认py_compile重新生成 `__pycache__`，Manifest预检以ERR-105阻断，V62 ZIP未生成。

V63继续使用同一精确8文件产品范围和远程三层入口，并把所有封包期Python步骤改为零字节码执行。默认Git、Git OpenSSL和官方GitHub Ref API返回的远程SHA都必须与Manifest基线精确一致；不得把网络回退解释为放宽基线。V63的实际结果、commit SHA、远程HEAD和用户级119/119结果只以V63执行证据包为准。

```text
V60_FAILURE_RECONCILIATION=PASS_ERR-103
V61_FAILURE_RECONCILIATION=PASS_ERR-104_ENVIRONMENT_FAILURE
V62_FAILURE_RECONCILIATION=PASS_ERR-105_PACKAGE_PREFLIGHT_DEFECT
V63_REMOTE_HEAD_FALLBACK=DEFAULT_GIT_OPENSSL_GITHUB_API
V63_BYTECODE_PREFLIGHT=ZERO_CACHE_EACH_STAGE
CURRENT_TASK_STATUS=EXECUTION_CONTRACT_FROZEN
NEXT_ACTION=RUN_V63_AND_AUDIT_EXECUTION_EVIDENCE
WORKDESK_WI0004_ACTION=NONE
```

不得再次运行WorkDesk Gate。V63失败时必须按实际阶段保留证据并停止；V63成功后以其证据包确认提交、推送和用户级部署结果。

## V63真实提交、用户级升级成功与ERR-106—ERR-107状态闭包（2026-08-05）

V63执行证据确认：

```text
V63_BASELINE_HEAD=07962406e8ddae9daaf456a4cb185dfe0a340cf3
V63_COMMIT_SHA=688cf64c6e190a707f9f0e7306db5cf474f0ae35
V63_REMOTE_HEAD_AFTER_PUSH=688cf64c6e190a707f9f0e7306db5cf474f0ae35
V63_PATCH_ACTION=APPLIED_EXACT_8_FILES
V63_COMMIT_ACTION=COMMITTED_EXACT_8_FILES
V63_PUSH_ACTION=PUSHED_MAIN
V63_USERLEVEL_UPGRADE_COMMAND=PASS_EXIT_0
V63_INSTALLER_VERIFY=PASS_119_FILES
V63_WORKDESK_WRITE=NOT_PERFORMED
V63_WI0004_ACTION=NOT_PERFORMED
V63_USER_DECISION_ACTION=NOT_PERFORMED
V63_MERGE_ACTION=NOT_PERFORMED
V63_CODE_PERMISSION_ACTION=NOT_PERFORMED
V63_DAEMON_ACTION=NOT_PERFORMED
V63_OPENCODE_ACTION=NOT_PERFORMED
```

V63最终失败阶段是 `USERLEVEL_VERIFY`，错误为 `files=None`。该错误不是用户级安装失败。V63验证器读取的是正确文件：

```text
%USERPROFILE%\.config\opencode\specforge-manifest.json
```

错误发生在Schema消费：

```text
V63_VALIDATOR_EXPECTED_FILES_TYPE=list
V63_ACTUAL_FILES_TYPE=object
V63_ACTUAL_FILES_COUNT=119
```

同时，V63只在自定义Manifest校验完成后设置安装动作状态，因此ERR-106先发生时，摘要错误保留：

```text
REAL_INSTALL_ACTION=NOT_PERFORMED
```

V64使用V63真实Manifest和脚本重构证据消费，并在任何仓库修改前重新执行正式installer verify、Manifest 119项、Agent 9项和逐文件哈希检查。V64不重复用户级升级；动作事实和验证事实分别报告。V64不修改产品Agent、Runtime、Gate或WorkDesk，只提交以下5个治理状态与回归消费者：

```text
docs/rule/specforge-development-error-ledger-and-experience.md
docs/implementation/architecture-consistency/current-handoff.md
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
packages/daemon-core/tests/unit/specforge-development-err088.test.ts
```

```text
ERR106_FAILURE_CLASS=VALIDATOR_DEFECT
ERR106_ROOT_CAUSE=MANIFEST_SCHEMA_OBJECT_LIST_CONFUSION
ERR106_STATUS=CLOSED
ERR107_FAILURE_CLASS=EVIDENCE_REPORTING_DEFECT
ERR107_ROOT_CAUSE=ACTION_STATUS_UPDATED_AFTER_POST_ACTION_VALIDATION
ERR107_STATUS=CLOSED
V63_PRODUCT_STATUS=USERLEVEL_DEPLOYED
V64_REAL_INSTALL_ACTION=NOT_PERFORMED
V63_USERLEVEL_UPGRADE=CONFIRMED_SUCCESS
CURRENT_REMOTE_HEAD_BEFORE_V64=688cf64c6e190a707f9f0e7306db5cf474f0ae35
V64_TASK_STATUS=CLOSED
P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED
P0_OVERALL_STATUS=IN_PROGRESS
P0_COMPLETION_EVIDENCE_MISSING=CODE_PERMISSION,ACTUAL_CODE_CONSUMER,DESTRUCTIVE_CHANGE,PROMOTION,MERGE,VERIFICATION,CLOSE
P1_ACTION=NOT_STARTED
NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1
WORKDESK_WI0004_STATE=approval_required
WORKDESK_WI0004_ACTION=NONE
```

不得再次运行WorkDesk Gate，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。后续新任务必须重新读取远程唯一权威文件并执行新的影响分析。
## V65 P0父阶段与V64子任务状态边界闭包（2026-08-05）

V64关闭的是ERR-106—ERR-107用户级证据消费子任务，不是P0 Contract Consumer整体实施。现有一手证据只能证明：

```text
WI-0004正式Gate=10/10通过
WI-0004最终状态=approval_required
Candidate内容=未改变
ERR-075、ERR-088真实项目重验=通过
```

P0实施文件仍为 `IN_PROGRESS`，并明确缺少以下真实闭环证据：

```text
Code Permission覆盖全部消费者
实际代码消费者与正式Trace对账
Contract删除或删值的破坏性变更阻断
Module Contract到Project Contract显式Promotion
原子Merge
Verification
Close
```

因此状态必须分层记录：

```text
V64_TASK_STATUS=CLOSED
P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1
```

`P0_OVERALL_STATUS=COMPLETED` 之前不得把P1、P2或最终Hard Enforcement作为当前实施动作。当前用户边界继续保持：不再次运行WI-0004 Gate，不执行User Decision、Merge、Code Permission、业务代码、Verification或Close。该边界未解除前，P0保持 `IN_PROGRESS`，缺失证据继续标记 `INSUFFICIENT_EVIDENCE`。
## V65测试消费者漂移与V66闭包边界（2026-08-05）

V65先在隔离副本应用精确4文件，并正确建立P0父阶段与V64子任务的分层状态。新增独立状态回归通过，但两个既有固定文本消费者仍要求已废止的无作用域状态：

```text
FAILED_STAGE=ISOLATED-TARGETED-TESTS
FAILURE_CLASS=TEST_DRIFT
FAILED_TEST_1=SpecForge development experience pre-read gate > requires every delivery round to use one complete downloadable bundle
FAILED_TEST_2=ERR-088—ERR-107 real title and validation regression governance > keeps the WorkDesk evidence and no-second-run boundary exact
ACTUAL_COUNTS=PASS_4_FAIL_2_TOTAL_6
PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
COMMIT_ACTION=NOT_PERFORMED
PUSH_ACTION=NOT_PERFORMED
WORKDESK_WRITE=NOT_PERFORMED
WI0004_ACTION=NOT_PERFORMED
```

两个失败都来自同一旧断言：

```text
expect current-handoff contains CURRENT_TASK_STATUS=CLOSED
```

该断言与ERR-108要求的作用域状态冲突。V67保持V65的业务状态结论不变，并把全部已知状态消费者原子同步为：

```text
V64_TASK_STATUS=CLOSED
P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1
```

V67继承精确6文件：V65的3个治理文档、1个独立状态回归，加上两个实际失败的既有测试消费者。V67只用V65真实失败日志执行纯解析和正反例，不再通过修改隔离工作树伪造历史失败；随后在隔离副本和真实仓库应用精确6文件并执行定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、WorkDesk不变审计后单次提交并推送。

```text
ERR109_FAILURE_CLASS=TEST_DRIFT
ERR109_ROOT_CAUSE=STATE_PRODUCER_CHANGED_WITHOUT_FULL_FIXED_TEXT_CONSUMER_INVENTORY
ERR109_STATUS=CLOSED_AFTER_V67_VALIDATION
V65_REAL_REPOSITORY_ACTION=NOT_PERFORMED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1
WORKDESK_WI0004_ACTION=NONE
```

不得运行WorkDesk Gate，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V66历史失败伪复现与V67闭包边界（2026-08-05）

V66在任何真实写入前停止：

```text
RESULT=FAILED
FAILED_STAGE=V65_FAILURE_PARSER
ERROR=expected nonzero return code
PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
COMMIT_ACTION=NOT_PERFORMED
PUSH_ACTION=NOT_PERFORMED
WORKDESK_WRITE=NOT_PERFORMED
WI0004_ACTION=NOT_PERFORMED
```

V66包内的V65真实日志纯解析已经能够识别原始 `4 pass / 2 fail / 6 total` 和精确两个失败测试；实际错误发生在有副作用的历史复现步骤。该步骤从当前包的 `patch/` 目录复制4个文件，而这些文件已经是V66目标版本，不是冻结的V65目标版本，因此两个旧测试在复现阶段变成 `6 pass / 0 fail`，随后被“必须非零退出码”正确阻断。

固定事实：

```text
V65_REAL_FAILURE_SET=EXACT_2
V65_REAL_COUNTS=PASS_4_FAIL_2_TOTAL_6
V66_REPRODUCER_ACTUAL_COUNTS=PASS_6_FAIL_0_TOTAL_6
V66_REPRODUCER_SOURCE=V66_CURRENT_TARGET_FILES
V66_REAL_REPOSITORY_ACTION=NOT_PERFORMED
V66_WORKDESK_ACTION=NOT_PERFORMED
```

V67删除有副作用的历史失败复现函数。历史失败控制只消费不可变的一手日志和摘要：

```text
V65真实失败日志
→ 纯解析失败身份、退出码和数量关系
V66执行摘要与隔离日志
→ 纯解析ERR-110原因和零真实动作
当前8aed基线
→ 直接应用精确6文件
→ 运行目标测试和完整工程验证
```

```text
ERR110_FAILURE_CLASS=VALIDATOR_DEFECT
ERR110_ROOT_CAUSE=HISTORICAL_REPRODUCER_REUSED_CURRENT_TARGET_PATCH
ERR110_STATUS=CLOSED_AFTER_V67_VALIDATION
V67_TARGET_FILE_COUNT=6
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
NEXT_ACTION=RESOLVE_P0_CONTINUATION_BOUNDARY_BEFORE_P1
WORKDESK_WI0004_ACTION=NONE
```

不得运行WorkDesk Gate，不得执行User Decision、Merge、Code Permission、业务代码、Verification或Close。

## V67封包前ERR-111—ERR-112闭包（2026-08-05）

V67封包前静态对账发现并在交付前阻断两个过程缺陷：

```text
ERR-111=PACKAGE_PREFLIGHT_DEFECT
ERR-111_ROOT_CAUSE=GENERATED_STATUS_DOCUMENTS_ENDED_WITH_EXTRA_BLANK_LINE
ERR-111_REPEATED_CLASS=ERR-081
ERR-112=EVIDENCE_REPORTING_DEFECT
ERR-112_ROOT_CAUSE=GIT_DIFF_BINARY_OMITS_UNTRACKED_NEW_TEST
REAL_REPOSITORY_ACTION=NOT_PERFORMED
WORKDESK_ACTION=NOT_PERFORMED
```

ERR-111由 `git diff --check` 在 `current-handoff.md` 和 `P0-contract-consumer-closure.md` 报告 `new blank line at EOF`。V67按EXP-059把所有生成文本规范化为一个且仅一个LF，并在Manifest生成前执行字节级EOF检查。

ERR-112来自精确6文件集合中的新增测试：

```text
packages/daemon-core/tests/unit/specforge-p0-phase-boundary.test.ts
SOURCE_CONTRACT=ABSENT
```

未暂存的新增文件不会进入 `git diff --binary`，因此旧证据捕获方式不能满足“Manifest路径集合=Git diff路径集合=实际修改集合”。V67在隔离验证完成后先暂存精确6文件，验证cached diff路径集合，再由 `git diff --cached --binary` 生成完整证据；隔离仓库随后删除，不影响真实仓库。

```text
ERR111_STATUS=CLOSED_BEFORE_V67_DELIVERY
ERR112_STATUS=CLOSED_BEFORE_V67_DELIVERY
V67_EVIDENCE_DIFF_SOURCE=ISOLATED_CACHED_EXACT_CHANGED_PATHS
V67_TARGET_FILE_COUNT=6
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WORKDESK_WI0004_ACTION=NONE
```

## V67成功与P0独立真实项目验证边界（2026-08-05）

V67执行证据已经完成状态生产者与全部已知固定文本消费者的原子闭包：

```text
V67_RESULT=SUCCESS
V67_BASELINE_HEAD=8aed1e0329cddd823e5c643ed16df99549d4d94e
V67_COMMIT_SHA=f06b45d508026173aff53f45823a08fd59907772
V67_REMOTE_HEAD_AFTER_PUSH=f06b45d508026173aff53f45823a08fd59907772
V67_TARGET_FILE_COUNT=6
V67_ISOLATED_VALIDATION=PASS
V67_REAL_VALIDATION=PASS
V67_WORKDESK_AUDIT=PASS_UNCHANGED
V67_USERLEVEL_AUDIT=PASS_UNCHANGED
```

P0剩余证据不能通过再次推进WorkDesk `WI-0004`取得。该Work Item继续冻结在 `approval_required`，Candidate、User Decision、Merge、Code Permission、业务代码、Verification和Close均不得改变。

P0后续真实验证改由独立临时业务项目承担：

```text
P0_VALIDATION_PROJECT=D:\code\temp\SpecForge-P0-Validation
P0_VALIDATION_PROJECT_PURPOSE=GOV_DEFECT_CONTRACT_CONSUMER_001_REAL_PROJECT_EVIDENCE
P0_VALIDATION_PROJECT_RELATION_TO_WORKDESK=NONE
P0_VALIDATION_PROJECT_RELATION_TO_PHASE11=NOT_PHASE11_EVIDENCE
P0_VALIDATION_PROJECT_SPEC_DIR=CREATED_ONLY_BY_SPECFORGE_RUNTIME
```

V68只准备普通业务代码种子、三阶段验证提示词和Git基线，不创建或手写 `.specforge`，不启动daemon/OpenCode，不运行任何业务Work Item。后续由用户手工启动daemon和OpenCode，并按顺序执行：

```text
WI-0001：
建立Project Architecture、Data Model、DOMAIN/STORAGE/REPORTING/CLI Module；
建立Project Contract WorkItemStatus及4个正式DD消费者；
建立REPORTING内部Module Contract ReportFormat；
完成Impact Scope、Gate、User Decision、原子Merge、Code Permission、
四个代码消费者修改、Verification和Close。

WI-0002：
先提交遗漏消费者同步的WorkItemStatus破坏性删除/删值候选并证明Gate阻断；
保留失败证据后，在同一正式治理边界内修正为合法变更并完成闭环。

WI-0003：
新增CLI对REPORTING内部ReportFormat的跨Module需求；
执行完整Module Contract到Project Contract Promotion，
包含旧关系REMOVE、新关系ADD、Design、兼容/迁移、原子Merge、
Code Permission、实际代码对账、Verification和Close。
```

只有三项真实场景证据全部完成、42项矩阵对账无缺口且没有 `INSUFFICIENT_EVIDENCE` 时，P0才允许改为 `COMPLETED`。该独立项目验证不替代权威 Phase 11；Phase 11仍须在最终三个核心Gate已经全部Hard后使用另一个全新业务项目执行。

```text
P0_PHASE1_STATUS=REAL_PROJECT_VALIDATED_AT_APPROVAL_REQUIRED
P0_OVERALL_STATUS=IN_PROGRESS
P0_CONTINUATION_BOUNDARY=ISOLATED_REAL_PROJECT
P0_COMPLETION_EVIDENCE_MISSING=CODE_PERMISSION,ACTUAL_CODE_CONSUMER,DESTRUCTIVE_CHANGE,PROMOTION,MERGE,VERIFICATION,CLOSE
P1_ACTION=NOT_STARTED
WORKDESK_WI0004_STATE=approval_required
WORKDESK_WI0004_ACTION=NONE
V68_ACTION=PREPARE_ISOLATED_P0_VALIDATION_PROJECT
NEXT_ACTION=USER_MANUALLY_OPEN_OPENCODE_AND_PASTE_VERIFIED_UNICODE_WI0001
```


## V68封包前ERR-113闭包（2026-08-05）

V68独立项目种子在交付前的纯ES Module功能预检中发现：`src/cli/main.js` 顶层直接调用 `pathToFileURL(process.argv[1])`，在无脚本参数的模块导入场景抛出 `ERR_INVALID_ARG_TYPE`。该失败发生在最终ZIP生成前，真实SpecForge、WorkDesk、用户级安装、daemon、OpenCode和独立验证项目均未改变。

```text
ERR-113_CLASS=PACKAGE_PREFLIGHT_DEFECT
ERR-113_ROOT_CAUSE=CLI_ENTRYPOINT_ASSUMED_PROCESS_ARGV_1_ALWAYS_PRESENT
ERR-113_FIX=GUARD_OPTIONAL_ENTRY_ARGUMENT_BEFORE_PATH_TO_FILE_URL
ERR-113_REGRESSION=PURE_ESM_IMPORT_AND_DIRECT_CLI_BOTH_PASS
V68_TARGET_FILE_COUNT=6
V68_REAL_ACTION=NOT_PERFORMED_BEFORE_USER_RUN
```

V68最终范围由原5个P0边界生产者/消费者文件增加经验台账，共精确6文件；新增范围只记录ERR-113和EXP-090，不改变Project Architecture、Data Model、Module Design、Project Contract、Module Contract、Gate或Runtime。


## V68封包前ERR-114闭包（2026-08-05）

ERR-113回归断言首次加入 `specforge-development-experience-gate.test.ts` 时，错误引用另一个测试块中的局部变量 `experience`。语法转译未报告该名称解析错误；完整作用域审计在最终ZIP生成前阻断。

```text
ERR-114_CLASS=PACKAGE_PREFLIGHT_DEFECT
ERR-114_ROOT_CAUSE=ASSERTION_REFERENCED_LOCAL_PRODUCER_FROM_DIFFERENT_TEST_SCOPE
ERR-114_FIX=READ_EXPERIENCE_LEDGER_IN_CURRENT_TEST_SCOPE
ERR-114_REGRESSION=TYPESCRIPT_PROGRAM_UNDEFINED_IDENTIFIER_CHECK_PASS
V68_FINAL_SCOPE=EXACT_6_FILES
```

该修正不扩大6文件范围，不改变独立项目内容、SpecForge产品、Runtime、WorkDesk或用户级安装。


## V68成功与ERR-115 Windows Unicode剪贴板闭包（2026-08-05）

V68执行证据确认独立P0验证项目已经建立并保持与WorkDesk、SpecForge源码和Phase 11隔离：

```text
V68_RESULT=SUCCESS
V68_COMMIT_SHA=ba451d6f3a12739a76faa1a858f8fac699c310b6
V68_VALIDATION_PROJECT=D:\code\temp\SpecForge-P0-Validation
V68_VALIDATION_PROJECT_HEAD=b7fa10bdd40bc6c55a9fdfd151e6e31bde39b57f
V68_VALIDATION_PROJECT_TESTS=PASS
V68_WORKDESK_AUDIT=PASS_UNCHANGED
V68_USERLEVEL_AUDIT=PASS_UNCHANGED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
```

用户随后手工启动daemon和OpenCode，但在提交WI-0001前发现：

```text
SOURCE_FILE=prompts/WI-0001.txt
SOURCE_ENCODING=UTF-8
FAILED_TRANSPORT=type "prompts\WI-0001.txt" | clip
OBSERVED_RESULT=OPENCODE_PASTE_GARBLED
WI0001_ACTION=NOT_PERFORMED
```

该问题登记为 `ERR-115 / PACKAGE_PREFLIGHT_DEFECT`。根因不是提示词文件错误，而是旧命令没有建立UTF-8解码和Windows Unicode剪贴板传输契约。`current-handoff.md`只能记录状态，不能单独防止复发。

V69新增唯一批准入口：

```text
scripts/windows/copy-utf8-to-clipboard.cmd
→ scripts/windows/copy-utf8-to-clipboard.py
→ utf-8-sig严格解码
→ Win32 CF_UNICODETEXT写入
→ GetClipboardData回读
→ 与原提示词逐字符一致
```

固定禁止：

```text
type <UTF-8文件> | clip
chcp后直接管道复制
PowerShell剪贴板兜底
仅凭退出码或终端显示宣布中文正确
```

V69只有在用户Windows上使用真实 `WI-0001.txt` 完成 `CLIPBOARD_UNICODE_ROUNDTRIP=PASS` 后，才允许应用、提交和推送精确8文件。V69不修改验证项目业务代码或 `.specforge`，不运行WI-0001，不执行Gate、User Decision、Merge、Code Permission、Verification或Close。

```text
ERR115_STATUS=FIX_IMPLEMENTED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_ACTION=NOT_PERFORMED
WORKDESK_WI0004_ACTION=NONE
NEXT_ACTION=USER_MANUALLY_OPEN_OPENCODE_AND_PASTE_VERIFIED_UNICODE_WI0001
```


## V69失败、ERR-116与V70 CMD包装调用闭包（2026-08-05）

V69在精确8文件隔离测试、TypeScript、daemon-core构建、全仓构建和 `git diff --check` 通过后，首次执行真实WI-0001剪贴板往返时停止：

```text
V69_FAILED_STAGE=ISOLATED_CLIPBOARD_ROUNDTRIP
V69_ERROR=copy-utf8-to-clipboard.cmd不是内部或外部命令
V69_PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
V69_COMMIT_ACTION=NOT_PERFORMED
V69_PUSH_ACTION=NOT_PERFORMED
V69_WI0001_ACTION=NOT_PERFORMED
```

该失败登记为 `ERR-116 / VALIDATOR_DEFECT`。Unicode工具没有被启动，因此不能据此判断工具失败。根因是验证器把含双引号的完整 `call` 命令作为 `cmd.exe /c` 参数传递；Python的Windows参数序列化产生字面量 `\"`，而CMD不把反斜杠解释为引号转义。

V70固定调用方式：

```text
生成独立ASCII CMD包装文件
→ 包装文件内部使用call "helper.cmd" "prompt.txt"
→ cmd.exe /d /c只接收无空格包装文件名
→ 从包装文件目录启动
→ 禁止把含嵌套引号的完整命令字符串作为/c参数
```

V70在任何真实仓库写入前必须：读取V69不可变summary与原始日志完成纯解析对账；使用含空格合成路径验证包装文件文本；证明不存在字面量反斜杠引号；再在用户Windows使用真实WI-0001完成 `CF_UNICODETEXT` 逐字符往返。

```text
ERR115_STATUS=FIX_IMPLEMENTED
ERR116_STATUS=FIX_IMPLEMENTED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_ACTION=NOT_PERFORMED
WORKDESK_WI0004_ACTION=NONE
NEXT_ACTION=USER_MANUALLY_OPEN_OPENCODE_AND_PASTE_VERIFIED_UNICODE_WI0001
```


## V70失败、ERR-117与V71稳定状态消费者闭包（2026-08-05）

V70在远程、本地、权威文件、V68/V69历史证据和目标状态预检通过后，于精确8文件隔离定向测试阶段停止。失败集合只有两项：

```text
SpecForge development experience pre-read gate > requires every delivery round to use one complete downloadable bundle
ERR-088—ERR-116 real title and validation regression governance > keeps the WorkDesk evidence and no-second-run boundary exact
```

一手日志计数满足：

```text
FAIL_COUNT=2
TOTAL_COUNT=PASS_COUNT+FAIL_COUNT
EXIT_CODE=1
```

根因是目标文档生产者已使用V70状态，但两个固定文本测试仍要求V69字面值。真实仓库、WorkDesk、用户级安装、WI-0001、提交、推送、daemon和OpenCode均未被V70改变。

该失败登记为 `ERR-117 / TEST_DRIFT`。V71不再把错误关闭状态和下一动作绑定某次尝试的V编号：

```text
错误生命周期状态=IDENTIFIED/FIX_IMPLEMENTED/ISOLATED_VALIDATED/REAL_APPLIED/COMMITTED/CLOSED
V版本、证据包、commit SHA=只放证据字段
全部固定文本消费者=从同一稳定状态契约对账
```

V71使用V70不可变summary和原始Bun日志纯解析精确失败集合，并对全部8个目标文件扫描版本绑定状态。只有定向测试、TypeScript、构建、`git diff --check` 和真实Windows `CF_UNICODETEXT` 往返全部通过后，才应用、提交和推送。

```text
V70_FAILURE_RECONCILIATION=PASS_TEST_DRIFT_EXACT_2
ERR115_STATUS=CLOSED
ERR116_STATUS=CLOSED
ERR117_STATUS=CLOSED
ERR115_CLOSURE_EVIDENCE=V71_WINDOWS_CLIPBOARD_ROUNDTRIP_PASS
ERR116_CLOSURE_EVIDENCE=V71_WRAPPER_CMD_REAL_EXECUTION_PASS
ERR117_CLOSURE_EVIDENCE=V71_ALL_FIXED_TEXT_CONSUMERS_PASS
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_ACTION=NOT_PERFORMED
WORKDESK_WI0004_ACTION=NONE
NEXT_ACTION=USER_MANUALLY_OPEN_OPENCODE_AND_PASTE_VERIFIED_UNICODE_WI0001
```

## WI-0001真实Gate阻断、ERR-118—ERR-120与Runtime修复边界（2026-08-05）

独立项目 `D:\code\temp\SpecForge-P0-Validation` 已通过正式Runtime创建WI-0001。基础业务测试10/10通过。Candidate内容问题经多轮正式Gate反馈修正后，最终Gate Run #7为9/10通过，唯一失败为 `candidate_manifest_gate`：DOMAIN、STORAGE、REPORTING、CLI四个新模块均缺少Manifest中的 `requirements.md` 和 `trace.md`，但对应八个Candidate文件实际存在。

源码对账确认：Runtime能够发现这八个文件，却在 `requirement_changed=false` 时排除模块Requirements，并固定排除全部 `module_trace`；Gate则无条件要求新模块五件套。另有 `project_contract_changed=true` 未被Project Contract物化条件消费，导致存在的extension_registry Candidate被排除。

```text
ERR118_CLASS=PRODUCT_DEFECT
ERR119_CLASS=PRODUCT_DEFECT
ERR120_CLASS=PRODUCT_DEFECT
WI0001_STATE=gates_failed
WI0001_GATE_RESULT=9_OF_10
USER_DECISION_ACTION=NOT_PERFORMED
MERGE_ACTION=NOT_PERFORMED
CODE_PERMISSION_ACTION=NOT_PERFORMED
IMPLEMENTATION_ACTION=NOT_PERFORMED
VERIFICATION_ACTION=NOT_PERFORMED
CLOSE_ACTION=NOT_PERFORMED
WORKDESK_ACTION=NONE
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
```

本轮产品修复只改变Runtime Candidate Manifest物化契约和Orchestrator专业Agent委派边界；Gate的新模块完整性规则保持不变。修复、自动化验证、提交、推送和用户级升级完成前，不得在独立项目重跑Gate。升级后由用户手工启动daemon/OpenCode，只允许从现有 `gates_failed` 恢复到 `candidate_preparing → candidate_prepared → gates_running` 并运行一次正式Gate；不得重建WI-0001、手工编辑Manifest、修改已正确Candidate或执行用户决定。

```text
ERR118_STATUS=FIX_IMPLEMENTED
ERR119_STATUS=FIX_IMPLEMENTED
ERR120_STATUS=FIX_IMPLEMENTED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_THEN_RESUME_WI0001_ONCE
```

### V72封包前ERR-121单LF闭包

V72最终静态Git对账发现3个治理文档结尾多一个空白行，分类为 `PACKAGE_PREFLIGHT_DEFECT`。产品代码、真实仓库、独立项目、WorkDesk、用户级安装和WI-0001均未改变。目标字节已统一为单个LF结尾，并把单LF与 `git diff --check` 放在Manifest和ZIP生成之前。

```text
ERR121_STATUS=CLOSED_PREFLIGHT
```

### V72封包前ERR-122断言参数闭包

V72固定文本消费者审计发现，一个 `toContain` 调用把新下一动作放在第二参数。该参数只作为失败提示，不会验证业务事实。修正为两个独立断言，并加入断言API语义门禁；产品Runtime、独立项目、WorkDesk、用户级安装和WI-0001均未改变。

```text
ERR122_STATUS=CLOSED_PREFLIGHT
BACKFILLED_ERROR_IDS=ERR-118,ERR-119,ERR-120,ERR-121,ERR-122
```

## V72 Bun入口失败、ERR-123与V73验证器闭包边界（2026-08-05）

V72在任何真实仓库写入前停止。已完成的事实包括远程与本地HEAD一致、权威文件一致、11文件源哈希一致、WorkDesk只读快照和隔离worktree创建。失败发生在隔离worktree中的首条Bun命令：

```text
V72_FAILED_STAGE=UNHANDLED
V72_ERROR=FileNotFoundError [WinError 2]
V72_EFFECTIVE_STAGE=ISOLATED_DEPENDENCIES
V72_COMMAND=bun install --frozen-lockfile
V72_PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
V72_COMMIT_ACTION=NOT_PERFORMED
V72_PUSH_ACTION=NOT_PERFORMED
V72_WI0001_ACTION=NOT_PERFORMED
```

失败分类为 `ERR-123 / VALIDATOR_DEFECT`。根因是Python `shell=False` 把Bun命令名直接交给Windows CreateProcess，而本机Bun通过CMD shim解析。V73不改变11文件产品修复内容，只修交付验证器：

```text
所有Bun命令=静态ASCII CMD包装文件
CMD入口=%COMSPEC% /d /c
首次动作=bun --version真实预检
FileNotFoundError=转换为具体失败阶段
用户级upgrade成功=立即记录动作事实
```

不得在V73成功部署前重跑WI-0001 Gate。V73成功后，用户手工启动daemon和OpenCode，只从现有 `gates_failed` 恢复并运行一次正式Gate。

```text
ERR123_STATUS=FIX_IMPLEMENTED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_STATE=gates_failed
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_THEN_RESUME_WI0001_ONCE
```

## V73工作区类型声明顺序失败、ERR-124与V74验证器闭包边界（2026-08-05）

V73已正确解决Windows Bun shim启动问题。隔离worktree中：

```text
bun install --frozen-lockfile=PASS_1059_PACKAGES
targeted tests=PASS_52_OF_52
```

随后独立执行daemon-core TypeScript no-emit时失败，缺失模块精确为：

```text
@specforge/permission-engine
@specforge/workflow-runtime
@specforge/service-management
@specforge/observability
```

这些都是workspace内部包。`bun install`只建立workspace链接；这些包的`package.json`把类型入口指向`dist/**/*.d.ts`，而V73在确定性workspace build生成声明前运行daemon-core TypeScript检查。因此该失败不证明V72产品补丁存在类型错误。

```text
ERR124_CLASS=VALIDATOR_DEFECT
ERR124_ROOT_CAUSE=DAEMON_CORE_TYPECHECK_RAN_BEFORE_WORKSPACE_DECLARATION_PRODUCERS
V73_FAILED_STAGE=ISOLATED-TYPECHECK
V73_TARGETED_TESTS=PASS_52_OF_52
V73_PATCH_ACTION_REAL_REPOSITORY=NOT_PERFORMED
V73_COMMIT_ACTION=NOT_PERFORMED
V73_PUSH_ACTION=NOT_PERFORMED
V73_WI0001_ACTION=NOT_PERFORMED
```

V74保持原精确11文件产品范围，不修改Runtime方案、Gate规则、WorkDesk或独立项目。固定验证顺序为：

```text
定向测试
→ 确定性workspace build（生成全部workspace类型声明）
→ daemon-core TypeScript no-emit
→ daemon-core相关构建复核
→ git diff --check
```

V74必须读取V73不可变summary、commands和两份原始日志，证明安装成功、52项测试通过、失败发生在workspace build之前，并验证上述四个缺失包均是声明生产者未准备。V74成功提交、推送和用户级升级前，不得重跑WI-0001 Gate。

```text
ERR124_STATUS=FIX_IMPLEMENTED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_STATE=gates_failed
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_THEN_RESUME_WI0001_ONCE
```

## V74真实提交部署、最终状态失败与V75构建生成物闭包（2026-08-05）

V74已完成原冻结11文件的隔离验证、真实仓库验证、提交、推送和用户级升级。正式证据为：

```text
V74_COMMIT_SHA=58d507821d2ae78c8a77b2b949514086ce1f7510
V74_REMOTE_HEAD_AFTER_PUSH=58d507821d2ae78c8a77b2b949514086ce1f7510
V74_PATCH_ACTION=APPLIED_EXACT_11_FILES
V74_USERLEVEL_UPGRADE=PASS
V74_USERLEVEL_VERIFY=PASS_119_FILES
V74_WORKDESK_WRITE=NOT_PERFORMED
V74_WI0001_ACTION=NOT_PERFORMED
```

V74最终失败发生在提交、推送和用户级升级之后。全仓构建中的 `scripts/render-workflow-docs.ts` 根据 `configs/workflows/builtin/architecture_change.json` 重新生成：

```text
setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md
```

该文件未进入V74批准的11文件集合。V74只执行了 `git diff --check`，没有在每次全仓构建后立即比较完整 `git status` 集合，因此把存在范围外生成修改的验证阶段错误报告为PASS，并在提交推送后才由 `FINAL_STATUS` 发现。

```text
ERR125_CLASS=VALIDATOR_DEFECT
ERR125_ROOT_CAUSE=BUILD_OUTPUT_NOT_AUDITED_AS_EXACT_CHANGED_PATH_SET_BEFORE_PASS_AND_COMMIT
ERR126_CLASS=TEST_DRIFT
ERR126_ROOT_CAUSE=GENERATED_ARCHITECTURE_CHANGE_SKILL_NOT_SYNCHRONIZED_WITH_WORKFLOW_JSON
```

V75只提交该确定性生成文件，并补充开发经验、当前交接、P0状态和独立回归测试。不得修改V74 Runtime修复、Gate规则、业务项目或WI-0001。V75验证必须在每次 workspace build 后立即执行：

```text
bun scripts/render-workflow-docs.ts --check
→ git status完整路径集合 == Manifest.changed_paths
→ git diff --check
```

提交后必须再次运行workspace build与renderer检查，并要求SpecForge工作树完全干净。V74用户级升级已经把同一生成字节部署到用户级目录，因此V75不重复升级，只执行正式installer verify。

```text
ERR118_STATUS=USERLEVEL_DEPLOYED
ERR119_STATUS=USERLEVEL_DEPLOYED
ERR120_STATUS=USERLEVEL_DEPLOYED
ERR123_STATUS=CLOSED
ERR124_STATUS=CLOSED
ERR125_STATUS=CLOSED
ERR126_STATUS=CLOSED
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0001_STATE=gates_failed
WI0001_GATE_ACTION=NOT_PERFORMED
NEXT_ACTION=RESTART_DAEMON_OPENCODE_AND_RESUME_EXISTING_WI0001_GATE_ONCE_AFTER_V75_SUCCESS
```

## WI-0001关闭后正式Git Merge缺口与V76修复边界（2026-08-05）

独立项目WI-0001已取得以下真实证据：

```text
Candidate Gate=10/10 passed
User Decision=approved
Project Spec Merge=24 candidates, PSV-0002
Code Permission=exact 4 files
Implementation Commit=69d5fd64
Governance Evidence Commit=10fd4ff7
bun test=10/10 passed
Verification Gate=passed
Formal Version Gate=passed
Close Gate=32/32 passed
Authoritative State=closed
```

关闭后的Git现场证明仓库交付尚未完成：

```text
CURRENT_BRANCH=feature/architecture-change-project-contract-wi-0001
CURRENT_HEAD=10fd4ff7c6640877794a89ed73cc50533d330a42
DEFAULT_MAIN=b7fa10bdd40bc6c55a9fdfd151e6e31bde39b57f
MAIN_CONTAINS_IMPLEMENTATION_COMMIT=NO
MAIN_CONTAINS_GOVERNANCE_EVIDENCE_COMMIT=NO
UNCOMMITTED_CLOSE_ARTIFACTS=4
```

未提交Close产物精确为：

```text
.specforge/work-items/WI-0001/work_item.json
.specforge/work-items/WI-0001/close_gate.md
.specforge/work-items/WI-0001/filesystem_diff_evidence.json
.specforge/work-items/WI-0001/gates/close_gate.json
```

因此V76修复三个缺陷：

```text
ERR-127=正常architecture-change主链遗漏正式Git Merge阶段
ERR-128=closed但未进入main且工作树脏时错误报告完成
ERR-129=Merge工具缺少权威closed、Formal Version、祖先关系和实现指纹完整门禁
```

V76只修改SpecForge Git Governance、Orchestrator、architecture-change Skill、用户级Git工具入口、治理文档和回归测试；不修改权威文件、业务Candidate、Project Spec、业务代码、WorkDesk或WI-0002/WI-0003。

V76部署成功后恢复现有WI-0001，固定分两次用户边界执行：

```text
第一次：
读取closed权威状态和Git现场
→ 精确提交上述4个Close产物
→ sf_git_merge_plan
→ 到独立Git Merge用户确认处停止

第二次（仅在用户明确确认后）：
→ sf_git_merge_run(confirmed=true)
→ sf_git_post_merge_verify(work_item_id=WI-0001)
→ repository_delivery_complete=true后报告完成
```

```text
ERR127_STATUS=FIX_IMPLEMENTED
ERR128_STATUS=FIX_IMPLEMENTED
ERR129_STATUS=FIX_IMPLEMENTED
WI0001_GOVERNANCE_STATE=closed
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_PENDING_GIT_MERGE
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0002_ACTION=NOT_STARTED
WI0003_ACTION=NOT_STARTED
NEXT_ACTION=DEPLOY_V76_THEN_COMMIT_CLOSE_EVIDENCE_AND_PLAN_GIT_MERGE
```

### V76封包前ERR-130单LF重复错误闭包

V76首次静态检查在三个治理文档发现EOF空白行。该失败发生在真实仓库修改、测试、安装、提交、推送和ZIP生成之前，分类为`PACKAGE_PREFLIGHT_DEFECT`，与ERR-121同类。最终目标统一为一个LF结尾，并把单LF检查放在Manifest哈希和ZIP生成之前。

```text
ERR130_STATUS=CLOSED_PREFLIGHT
REPEATED_ERROR_CHECK=PASS_REPEATED_ERR121_GUARD_APPLIED
```

## V76测试阈值漂移、ERR-131与V77闭包边界（2026-08-05）

V76在隔离工作树应用精确14文件后，42项定向测试通过、1项失败。唯一失败为 Orchestrator 结构测试中的绝对行数断言：

```text
EXPECTED_LOGICAL_LINES=<320
REMOTE_E84_BASELINE_LOGICAL_LINES=335
V76_TARGET_LOGICAL_LINES=349
FAILED_TEST=Orchestrator governance execution closure > uses one Chinese governance chain to cover all five Orchestrator responsibilities
```

远程基线在V76产品补丁应用前已经违反旧阈值，因此该失败登记为 `ERR-131 / TEST_DRIFT`，不是正式Git Merge规则导致的产品缺陷。V77不提高阈值、不删除V76新增规则，而是把测试契约改为四个治理主链顶层章节按固定顺序各出现一次，并继续检查关键职责和禁止项。

V77范围为V76原14文件加两个真实测试消费者，共精确16文件：

```text
packages/daemon-core/tests/design-governance-orchestrator-closure.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
```

V77必须先在未应用目标的 `e84ab54` 隔离基线精确复现ERR-131唯一失败，再应用16文件并完成定向测试、workspace build、renderer check、TypeScript、daemon-core build、`git diff --check`和完整路径集合审计。成功后才能提交、推送和用户级升级。V77不得操作WorkDesk或独立项目WI-0001。

```text
ERR127_STATUS=FIX_IMPLEMENTED
ERR128_STATUS=FIX_IMPLEMENTED
ERR129_STATUS=FIX_IMPLEMENTED
ERR130_STATUS=CLOSED_PREFLIGHT
ERR131_STATUS=FIX_IMPLEMENTED
WI0001_GOVERNANCE_STATE=closed
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_PENDING_GIT_MERGE
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
NEXT_ACTION=USER_MANUALLY_RESTART_DAEMON_OPENCODE_AND_RESUME_CLOSED_WI0001_TO_CLOSE_EVIDENCE_CHECKPOINT_AND_MERGE_PLAN_ONLY
```

## WI-0001仓库消失、精确恢复与ERR-132—ERR-135闭包（2026-08-05）

V77部署成功后，用户准备恢复已关闭WI-0001执行Close证据checkpoint和Git Merge Plan时，发现原验证项目目录不存在。首次按目录名和目标提交扫描 `D:\code` 无结果，因此停止所有业务动作并执行只读恢复扫描。

只读扫描与恢复证据确认：

```text
RECOVERY_SCAN_STATUS=EXACT_GIT_REPOSITORY_FOUND
EXACT_REPO_COUNT=1
RECYCLE_MATCH_COUNT=1
RECOVERY_STATUS=EXACT_GIT_REPOSITORY_RESTORED
SOURCE_PATH=D:\$RECYCLE.BIN\S-1-5-21-3718819378-3414133018-2153639029-1001\$R3J59SB
RESTORED_PATH=D:\code\temp\SpecForge-P0-Validation
BRANCH=feature/architecture-change-project-contract-wi-0001
HEAD=10fd4ff7c6640877794a89ed73cc50533d330a42
MAIN=b7fa10bdd40bc6c55a9fdfd151e6e31bde39b57f
STATUS=PASS_EXACT_4_CLOSE_ARTIFACTS
SOURCE_RECYCLE_PAYLOAD=RETAINED_UNCHANGED
RECOVERY_EVIDENCE_SHA256=0091e05b28f730b368012301ab2a7f08436c746c9156a1b4769439926e1cdd82
```

恢复过程没有运行WI-0001、提交、Git Merge、daemon或OpenCode。四个未提交Close产物仍精确为：

```text
 M .specforge/work-items/WI-0001/work_item.json
?? .specforge/work-items/WI-0001/close_gate.md
?? .specforge/work-items/WI-0001/filesystem_diff_evidence.json
?? .specforge/work-items/WI-0001/gates/close_gate.json
```

本轮失败与防护：

```text
ERR132_CLASS=ENVIRONMENT_FAILURE
ERR132_STATUS=CLOSED_RECOVERED_EXACT_GIT_REPOSITORY
ERR133_CLASS=VALIDATOR_DEFECT
ERR133_STATUS=CLOSED
ERR134_CLASS=EVIDENCE_REPORTING_DEFECT
ERR134_STATUS=CLOSED
ERR135_CLASS=PACKAGE_PREFLIGHT_DEFECT
ERR135_STATUS=CLOSED_PREFLIGHT
```

恢复成功只恢复原Git现场，不改变正式交付状态：

```text
WI0001_GOVERNANCE_STATE=closed
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_PENDING_GIT_MERGE
P0_OVERALL_STATUS=IN_PROGRESS
P1_ACTION=NOT_STARTED
WI0002_ACTION=NOT_STARTED
WI0003_ACTION=NOT_STARTED
NEXT_ACTION=USER_MANUALLY_RESTART_DAEMON_OPENCODE_AND_RESUME_CLOSED_WI0001_TO_CLOSE_EVIDENCE_CHECKPOINT_AND_MERGE_PLAN_ONLY
```

## WI-0001 Merge Plan文件集合缺口、ERR-136—ERR-139闭包（2026-08-05）

### 当前远程与权威基线

```text
REMOTE_URL=https://github.com/lyqstart/SpecForge.git
REMOTE_BRANCH=main
REMOTE_HEAD=92792ec35cfddad42a7214e6822ba222c4e8fe7a
AUTHORITY_PATH=docs/design/SpecForge架构一致性治理最终实施方案.md
AUTHORITY_COMMIT=08629b58c6aad82bf669a35e1f2bc8473cfa7ef3
AUTHORITY_SHA256=98410b513692acc049403c9cc8d2b6264edbb3cbc2d0798089e7458ac6674ccd
```

### WI-0001真实Merge Plan证据

```text
CHECKPOINT_COMMIT=4f616d167f01ba24a63165f094386bd9157167c1
MERGE_PLAN_CAN_MERGE_REPORTED=true
MERGE_PLAN_BLOCKING_ISSUES_REPORTED=0
FORMAL_VERSION_IMPLEMENTATION_FILES_REPORTED=0
ACTUAL_NON_GOVERNANCE_DIFF_FILES=4
ACTUAL_DIFF_PATHS=src/cli/main.js,src/domain/status.js,src/reporting/formatter.js,src/storage/repository.js
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
POST_MERGE_VERIFY=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
```

### ERR-136产品修复

Formal Version此前只证明已登记文件内容，没有证明登记文件集合覆盖
`base_commit...source_head` 的全部非 `.specforge/**` Git Diff。

本次要求 Formal Version Gate、Git Merge Plan、Git Merge Run和Post-Merge Verify统一执行：

```text
snapshot.implementation_files
=
git diff --name-only base_commit...source_head
- .specforge/**
```

缺失或多余任一路径立即失败关闭。

```text
ERR136_CLASSIFICATION=PRODUCT_DEFECT
ERR136_STATUS=PRODUCT_FIX_ENGINEERING_VALIDATED_PENDING_COMMIT_DEPLOY_AND_REAL_WI_RECHECK
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_FAIL_CLOSED_RULES_ALREADY_APPLY
```

### ERR-137证据纠正

此前把缓存网页结果误报为当前远程 `main`。真实Git预检证明远程已经是
`92792ec35cfddad42a7214e6822ba222c4e8fe7a`，没有执行推送。

```text
ERR137_CLASSIFICATION=EVIDENCE_REPORTING_DEFECT
ERR137_STATUS=CLOSED_EVIDENCE_CORRECTED_NO_REMOTE_WRITE
REMOTE_MAIN_RECOVERY_ACTION=NOT_REQUIRED_REMOTE_ALREADY_92792EC
```

### V79失败与ERR-138

```text
FAILED_STAGE=APPLY_PATCH
ERROR=ANCHOR_COUNT_MISMATCH[binding_comparison]=0
FILES_CHANGED=0
```

```text
V79_FAILURE_CLASS=PACKAGE_PREFLIGHT_DEFECT
ERR138_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR138_STATUS=CLOSED_BY_TRANSACTIONAL_PREWRITE_VALIDATION
```

### V80失败与ERR-139

V80的全部转换仍在内存中执行，因此没有修改文件；但用于截取Post-Merge函数的结束标记
`\n}` 在源码中命中81次，完整转换失败。

```text
FAILED_STAGE=APPLY_PATCH
ERROR=SEGMENT_MARKER_MISMATCH[source_postmerge_segment]:start=1;end=81
FILES_CHANGED=0
V80_FAILURE_CLASS=PACKAGE_PREFLIGHT_DEFECT
ERR139_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR139_STATUS=FIX_INCLUDED_IN_V81_PENDING_REAL_EXECUTION
```

V81不再推断函数结束位置，只替换已经核对为唯一命中的语义代码块。

### 后续边界

```text
P0_OVERALL_STATUS=IN_PROGRESS
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_MERGE_BLOCKED_BY_ERR136
NEXT_ACTION=COMMIT_PUSH_DEPLOY_ERR136_THEN_REVALIDATE_CLOSED_WI0001_MERGE_PLAN_ONLY
```

在修复提交、正式安装和独立验证项目重新运行Merge Plan前，不得执行WI-0001 Git Merge。

## V81范围审计解析失败与ERR-140（2026-08-05）

V81已经完成6个批准文件的内存转换和实际写入，但范围审计错误地把：

```text
 M docs/implementation/architecture-consistency/current-handoff.md
```

解析为：

```text
ocs/implementation/architecture-consistency/current-handoff.md
```

因此停止在测试前，没有提交、推送、安装或执行WI-0001 Merge。

根因是V81的通用Git输出函数对完整输出调用 `strip()`，删除了第一行Porcelain状态中的语义前导空格；后续仍按固定三列截取路径，导致首个路径字符被删除。这与ERR-133属于同一已知错误类型，说明既有经验规则没有进入封包脚本机器预检。

V82取消使用Porcelain列解析，分别使用：

```text
git diff --name-only
git diff --cached --name-only
git ls-files --others --exclude-standard
```

核对未暂存、已暂存和未跟踪文件。

```text
ERR140_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR140_REPEATED_ERROR=ERR-133
ERR140_STATUS=FIX_INCLUDED_IN_V82_PENDING_REAL_EXECUTION
V81_FILES_CHANGED=EXACT_6_APPROVED_FILES
V81_COMMIT_ACTION=NOT_PERFORMED
V81_PUSH_ACTION=NOT_PERFORMED
V81_WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
```

## V82定向测试入口漂移与ERR-141（2026-08-05）

V82已完成ERR-140记录、精确6文件范围审计并进入定向测试，但测试命令从仓库根目录执行：

```text
bunx vitest run packages/daemon-core/tests/unit/...
```

实际使用了根目录 `vitest.config.ts`。该配置只匹配：

```text
tests/**/*.test.ts
tests/**/*.property.test.ts
```

因此没有发现 `packages/daemon-core/tests/**`。根目录未直接声明 `vitest`，`bunx`还临时解析到Vitest 4.1.5；daemon-core包自身声明Vitest 3.x并具有独立配置。

V83改为进入：

```text
packages/daemon-core
```

然后运行该包自己的：

```text
bun run test -- tests/unit/formal-version-git-closure-regression.test.ts tests/unit/post-close-git-merge-governance.test.ts tests/unit/specforge-development-experience-gate.test.ts
```

```text
ERR141_CLASSIFICATION=TEST_DRIFT
ERR141_PRODUCT_CODE_IMPACT=NONE
ERR141_STATUS=FIX_INCLUDED_IN_V83_PENDING_REAL_EXECUTION
V82_COMMIT_ACTION=NOT_PERFORMED
V82_PUSH_ACTION=NOT_PERFORMED
V82_WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
```

## V83—V87全量回归归因与隔离交付方法闭包（2026-08-05）

V83使用daemon-core包级入口完成了本次3个目标文件的定向回归：

```text
TARGETED_TEST_FILES=3
TARGETED_TESTS=19
TARGETED_PASSED=19
TARGETED_FAILED=0
TYPESCRIPT_NO_EMIT=PASS
DAEMON_CORE_BUILD=PASS
WORKSPACE_BUILD=PASS
GIT_DIFF_CHECK=PASS
```

daemon-core全量侦察结果为：

```text
TOTAL_TESTS=1550
PASSED_TESTS=1385
FAILED_TESTS=165
FAILED_TEST_FILES=37
```

失败分布包含旧状态名、live daemon单实例、用户目录运行态、历史源码字面断言及旧治理消费者，和仓库既有全量测试债务类型一致。该结果不能直接归因于ERR-136，也不能被后续成功覆盖。

### ERR-142：缺少同提交A/B基线即执行全量归因

V83先运行补丁版本全量测试，未先对精确 `92792ec...` 干净基线运行相同命令，因此不能证明165个失败是否由本次补丁新增。

```text
ERR142_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR142_STATUS=CLOSED_BY_FINAL_EXACT_HEAD_AB_GATE
```

最终交付命令必须在临时detached worktree对干净基线和最终补丁使用同一Bun、同一测试参数、隔离HOME/TEMP和固定seed执行全量测试，并比较规范化失败测试集合。补丁新增失败不为0时禁止提交和推送。

### ERR-143：Windows Bun CMD包装器直接CreateProcess失败

V84临时worktree创建成功后，Python以 `shell=False` 直接执行 `bun.cmd`，Windows返回 `WinError 2`。

```text
ERR143_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR143_STATUS=CLOSED_BY_COMSPEC_CALL_WRAPPER
```

`.cmd/.bat` 必须通过 `%COMSPEC% /d /s /c call` 执行；`.exe` 才允许直接CreateProcess。

### ERR-144：Git Bundle输出目录未预创建

V86在 `git bundle create` 前未创建 `evidence` 目录，Git无法创建 `.lock` 文件。V87先创建全部目录、生成Bundle并立即执行 `git bundle verify`，最终交接包成功且真实仓库未变化。

```text
ERR144_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR144_STATUS=CLOSED_BY_DIRECTORY_AND_BUNDLE_VERIFY_PREFLIGHT
HANDOFF_ZIP_SHA256=4341c9fffba87f10befcf8bc528a01ee6941a8b4e6574cb843ae14b012c6df2a
WORKING_DIFF_SHA256=c94aee67c21380dada82edf9f6676d70c71561d9f3592fb072fee93569a211fc
```

### 最终产品闭包补充

Post-Merge Verify除验证Formal Version时的实现提交外，还必须解析最终源分支HEAD，并证明：

```text
source_branch_head is ancestor of target_head
snapshot.implementation_files
=
git diff --name-only base_commit...source_branch_head
- .specforge/**
```

这样即使有人绕过受控Merge Runner，在Formal Version后向源分支新增业务文件并手工合并，Post-Merge Verify也会失败关闭。

```text
ERR136_STATUS=FIX_IMPLEMENTED_FINAL_SOURCE_BRANCH_FILE_SET_CONSUMER_INCLUDED
FINAL_DELIVERY_METHOD=COMPLETE_FILES_PLUS_SINGLE_FAIL_CLOSED_CMD
COMMIT_GATE=TARGETED_PASS_AND_EXACT_HEAD_AB_NEW_FAILURES_ZERO_AND_TYPECHECK_BUILD_DIFF_SCOPE_PASS
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
POST_MERGE_VERIFY=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
P0_OVERALL_STATUS=IN_PROGRESS
NEXT_ACTION=APPLY_VALIDATE_COMMIT_PUSH_AND_INSTALL_ERR136_THEN_RESTART_MANUALLY_AND_RECHECK_WI0001_MERGE_PLAN_ONLY
```

## V88全量A/B比较器误报与ERR-145闭包（2026-08-06）

V88在提交前完成最终产品定向测试：

```text
TARGETED_TESTS=20
TARGETED_PASSED=20
TARGETED_FAILED=0
```

随后全量A/B报告：

```text
BASELINE_FULL_EXIT=1
PATCHED_FULL_EXIT=1
BASELINE_FAILED_TEST_COUNT=121
PATCHED_FAILED_TEST_COUNT=154
PATCH_INTRODUCED_FAILED_TEST_COUNT=42
COMMIT_ACTION=NOT_PERFORMED
PUSH_ACTION=NOT_PERFORMED
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
V88_EVIDENCE_ZIP_SHA256=7f359b83a6fc1d37b2faf0576710d1d3fcf67ffb05d6508368771c7270a27514
```

证据复核确认，42项全部位于以下6个文件：

```text
tests/integration/api-endpoints.test.ts
tests/integration/daemon-integration.test.ts
tests/integration/daemon-lifecycle.test.ts
tests/integration/extension-loader.test.ts
tests/integration/pbt-state.test.ts
tests/performance.test.ts
```

baseline中A/B收集层级不一致实际共有8个文件。上述6个文件在patched侧产生42个具体失败；另外 `tests/unit/daemon.test.ts` 和 `tests/unit/governance-closure-core.test.ts` 在patched侧已正常收集。baseline侧8个文件均因workspace包 `dist` 入口未生成而在加载阶段失败，没有收集任何测试用例。V88比较器把baseline `SUITE_LEVEL_FAILURE` 与patched具体失败用例按字符串做差，产生42项错误归因。

```text
ERR145_CLASSIFICATION=VALIDATOR_DEFECT
ERR145_PRODUCT_CODE_IMPACT=NONE
ERR145_FALSE_NEW_FAILURE_COUNT=42
ERR145_AB_INCOMPARABLE_FILE_COUNT=8
ERR145_STATUS=FIX_INCLUDED_IN_V89_PENDING_REAL_EXECUTION
```

V89最终交付方法：

```text
创建baseline和patched两个detached临时工作树
→ 只在patched临时工作树应用完整6文件
→ 两侧执行相同bun install与workspace build
→ 两侧使用独立运行目录执行相同全量测试
→ Suite加载失败与用例失败分层比较
→ 定向测试、A/B、TypeScript、构建、Installer、Diff和范围全部通过
→ 才将完整6文件写入真实仓库
→ 提交、正常推送main、用户级upgrade与verify
```

```text
ERR136_STATUS=FIX_IMPLEMENTED_PENDING_V89_VALIDATION_COMMIT_DEPLOY_AND_REAL_WI_RECHECK
P0_OVERALL_STATUS=IN_PROGRESS
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_MERGE_BLOCKED_PENDING_ERR136_DEPLOYMENT
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
POST_MERGE_VERIFY=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=RUN_SINGLE_V89_FAIL_CLOSED_DELIVERY_THEN_MANUALLY_RESTART_AND_RECHECK_WI0001_MERGE_PLAN_ONLY
```

## V89封包前Git输出通道隔离与ERR-146（2026-08-06）

V89最终ZIP生成前使用V87 Git Bundle在隔离仓库执行完整文件替换演练。Git针对历史二进制ZIP路径输出CRLF warning；旧包装器把stderr合并到stdout，导致范围审计把警告文本误判为额外路径。

```text
ERR146_CLASSIFICATION=PACKAGE_PREFLIGHT_DEFECT
ERR146_STAGE=FINAL_PACKAGE_ISOLATED_REHEARSAL
ERR146_REAL_REPOSITORY_ACTION=NOT_PERFORMED
ERR146_REMOTE_ACTION=NOT_PERFORMED
ERR146_STATUS=CLOSED_PREFLIGHT_BEFORE_V89_DELIVERY
```

V89最终包装器对机器Git协议分别捕获stdout与stderr，成功时只解析stdout；stderr仅进入诊断日志。随后必须重新完成：

```text
Comparator纯函数回归
V88真实报告复算
Git Bundle隔离克隆完整文件替换
git diff --check
精确6文件路径和payload SHA256审计
最终ZIP成员与哈希审计
```

## WI-0001真实Merge Plan复检、ERR-136关闭与ERR-147恢复消费者缺口（2026-08-06）

V89已完成产品修复、对称临时工作树A/B验证、提交、推送和用户级升级：

```text
SPECFORGE_COMMIT=f756a95ae9486dc7f4d9922e890833f59d76dc72
REMOTE_HEAD_AFTER_PUSH=f756a95ae9486dc7f4d9922e890833f59d76dc72
TARGETED_TESTS=20/20_PASS
AB_INCOMPARABLE=0
AB_NEW_FAILURES=0
TYPESCRIPT_NO_EMIT=PASS
DAEMON_CORE_BUILD=PASS
WORKSPACE_BUILD=PASS
USERLEVEL_UPGRADE=PASS
USERLEVEL_VERIFY=PASS
```

用户随后在独立验证项目中只运行 `sf_git_merge_plan(WI-0001)`。真实复检结果：

```text
SOURCE_BRANCH=feature/architecture-change-project-contract-wi-0001
SOURCE_BRANCH_HEAD=4f616d167f01ba24a63165f094386bd9157167c1
SNAPSHOT_IMPLEMENTATION_FILES=[]
ACTUAL_NON_GOVERNANCE_IMPLEMENTATION_FILES=src/cli/main.js,src/domain/status.js,src/reporting/formatter.js,src/storage/repository.js
MISSING_FROM_SNAPSHOT=src/cli/main.js,src/domain/status.js,src/reporting/formatter.js,src/storage/repository.js
UNEXPECTED_IN_SNAPSHOT=none
BLOCKING_ISSUE=FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH
CAN_MERGE=false
REPOSITORY_DELIVERY_STATE=git_merge_blocked
GIT_MERGE_ACTION=NOT_PERFORMED
POST_MERGE_VERIFY=NOT_PERFORMED
```

该结果证明ERR-136在真实已关闭WI上失败关闭：

```text
ERR136_STATUS=CLOSED_REAL_WI_RECHECK_PASS
ERR136_REAL_WI_CAN_MERGE=false
ERR136_REAL_WI_MISSING_FROM_SNAPSHOT=4
```

### ERR-147：无效关闭恢复未消费Formal Version文件集合不一致

现有 `recover_invalid_closure` 只检查旧Formal Gate状态和基于当前实际范围重新计算的Git绑定。WI-0001的旧Formal Gate为passed，当前Git绑定本身合法；真正证明旧关闭无效的是：

```text
formal_version_snapshot.implementation_files=[]
!=
base_commit...source_head的4个非治理Git Diff路径
```

因此Merge Plan已经正确阻断，但恢复入口会返回：

```text
INVALID_CLOSURE_RECOVERY_NOT_PROVEN
```

这会把原WI锁在closed：既不能合并，也不能按既有受控补偿流程恢复到implementation_ready。

修复要求：

```text
recover_invalid_closure
→ 复用assertFormalVersionSnapshotForGitMerge
→ 只把持久化Formal Version不变量错误作为关闭无效证据
→ worktree dirty、当前分支错误等运行环境问题继续阻断
→ closure_recovery.json记录formal_version_snapshot哈希和验证错误
→ closed → implementation_ready
```

```text
ERR147_CLASSIFICATION=PRODUCT_DEFECT
ERR147_STATUS=FIX_IMPLEMENTED_PENDING_VALIDATION_COMMIT_DEPLOY_AND_REAL_RECOVERY
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_INVALID_CLOSURE_RECOVERY_RULE_ALREADY_APPLIES
P0_OVERALL_STATUS=IN_PROGRESS
WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_MERGE_BLOCKED_PENDING_CONTROLLED_INVALID_CLOSURE_RECOVERY
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_ERR147_THEN_RUN_RECOVER_INVALID_CLOSURE_ON_WI0001_ONLY
```

## V90运行时代码未切换、ERR-148闭包与WI-0001真实恢复（2026-08-06）

V90产品修改已提交、推送和用户级升级，但第一次真实恢复仍返回旧行为。V91只读取证证明：

```text
PRODUCT_HEAD=35c34c040ea5eb646bfac1417191ef38cf3675ab
SOURCE_ASSERT_PROBE=FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH_4_FILES
DIST_ASSERT_PROBE=FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH_4_FILES
FIRST_REAL_RECOVERY=INVALID_CLOSURE_RECOVERY_NOT_PROVEN
```

用户确认首次复检前没有按要求启动当前源码daemon。手工切换daemon后，持久化状态显示恢复已应用：

```text
RECOVERY_STATUS=applied
RECOVERY_TRANSITION=closed_TO_implementation_ready
INVALIDITY_REASONS=FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH,FORMAL_GIT_BINDING_FAILED
CODE_PERMISSION_REMAINED_REVOKED=true
PRODUCTION_CODE_MODIFIED=NO
```

```text
ERR147_STATUS=CLOSED_REAL_WI_RECOVERY_PASS
ERR148_CLASSIFICATION=ENVIRONMENT_FAILURE
ERR148_STATUS=CLOSED_BY_EXPLICIT_DAEMON_RESTART_AND_REAL_WI_RECOVERY
WI0001_STATE_AFTER_RECOVERY=implementation_ready
```

## WI-0001恢复后Formal Version重建失败与ERR-149—ERR-150（2026-08-06）

WI-0001已按ERR-147受控恢复并重新完成：

```text
closed → implementation_ready
→ implementation_running
→ implementation_done
→ verification_running
Executor=NO_PRODUCTION_CHANGE
Changed_Files_Audit=PASS_4_IN_SCOPE_0_OUT_OF_SCOPE
Verifier=PASS_11_0
Semantic_Closure=VALID
```

随后真实调用：

```text
sf_gate_run(work_item_id=WI-0001, gate_type=verification)
```

结果：

```text
VERIFICATION_GATE=passed
FORMAL_VERSION_GATE=failed
GATE_SUMMARY=failed
FORMAL_SNAPSHOT_REGENERATED=NO
SNAPSHOT_IMPLEMENTATION_FILES=[]
ACTUAL_NON_GOVERNANCE_FILES=src/cli/main.js,src/domain/status.js,src/reporting/formatter.js,src/storage/repository.js
MISSING_FROM_SNAPSHOT=4
STATE_BEFORE=verification_running
STATE_AFTER=verification_done
PRODUCTION_CODE_MODIFIED=NO
CLOSE_ACTION=NOT_PERFORMED
GIT_MERGE_ACTION=NOT_PERFORMED
```

根因对账：

```text
ERR149=Formal Version实际范围只消费瞬时观测，恢复后的新进程未从PASS changed_files_audit.md恢复4文件集合
ERR150=Gate Runner只判断verification_gate，忽略formal_version_gate失败与summary failed仍推进verification_done
```

产品修复范围冻结为：

```text
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts
packages/daemon-core/tests/unit/formal-version-recovery-chain.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
docs/rule/specforge-development-error-ledger-and-experience.md
docs/implementation/architecture-consistency/current-handoff.md
```

```text
ERR149_STATUS=FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY
ERR150_STATUS=FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_VERIFICATION_FORMAL_CLOSE_FAIL_CLOSED_RULES_ALREADY_APPLY
WI0001_CURRENT_STATE=verification_done_INCONSISTENT_WITH_FORMAL_VERSION_FAILED
WI0001_CLOSE_ACTION=NOT_PERFORMED
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_ERR149_ERR150_THEN_RUN_CONTROLLED_VERIFICATION_RECOVERY_AND_RETRY_GATE_ONLY
```

## WI-0001真实重试仍被治理日志遮蔽与ERR-151（2026-08-06）

V92已提交、推送、用户级升级并重启当前源码daemon。真实WI-0001完成补偿状态恢复后再次运行Verification Gate：

```text
VERIFICATION_GATE=passed
FORMAL_VERSION_GATE=failed
GATE_SUMMARY=failed
STATE_AUTO_ADVANCE=NOT_ATTEMPTED_verification_owned_gate_failed
FINAL_STATE=verification_running
FORMAL_SNAPSHOT_REGENERATED=NO
SNAPSHOT_IMPLEMENTATION_FILES=[]
ACTUAL_NON_GOVERNANCE_FILES=4
PRODUCTION_CODE_MODIFIED=NO
CLOSE_ACTION=NOT_PERFORMED
GIT_MERGE_ACTION=NOT_PERFORMED
```

ERR-150已通过真实WI验证关闭：复合Gate失败时不再推进`verification_done`。

ERR-149仍未闭环的精确根因：

```text
PASS_CHANGED_FILES_AUDIT=4_IMPLEMENTATION_FILES
WRITE_GUARD_LOG=NONEMPTY_GOVERNANCE_AND_BLOCKED_OPERATION_HISTORY
OLD_SELECTION=NONEMPTY_WRITE_GUARD_LOG_FIRST
FILTERED_IMPLEMENTATION_FILES=0
AUDIT_FALLBACK=NOT_REACHED
```

产品修复范围冻结为：

```text
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/tests/unit/formal-version-git-closure-regression.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
docs/rule/specforge-development-error-ledger-and-experience.md
docs/implementation/architecture-consistency/current-handoff.md
```

```text
ERR151_CLASSIFICATION=PRODUCT_DEFECT
ERR151_STATUS=FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY
ERR150_STATUS=CLOSED_REAL_WI_FAIL_CLOSED_PASS
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_DURABLE_EVIDENCE_AND_FAIL_CLOSED_RULES_ALREADY_APPLY
WI0001_CURRENT_STATE=verification_running
WI0001_CODE_PERMISSION=ENABLED
WI0001_CLOSE_ACTION=NOT_PERFORMED
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_ERR151_THEN_RETRY_VERIFICATION_GATE_ONLY
```

## V93真实复检、V94四方取证与ERR-152—ERR-153（2026-08-06）

V93已完成定向测试、对称全量A/B、TypeScript、构建、Installer、提交、推送和用户级升级：

```text
PRODUCT_HEAD=9984c894ba0fd7b0808588ff21c3fc63920fdc01
TARGETED_TESTS=40_OF_40_PASS
AB_INCOMPARABLE=0
AB_NEW_FAILURES=0
USERLEVEL_VERIFY=PASS
```

V93交付脚本实际修改文件为5个，但两处进度输出仍硬编码为`6_FILES`：

```text
TARGET_FILE_COUNT=5
ACTUAL_MODIFIED_FILE_COUNT=5
TEMP_PATCH_ACTION=APPLIED_EXACT_6_FILES_TO_PATCHED_WORKTREE
PATCH_ACTION=APPLIED_COMPLETE_FINAL_6_FILES
```

该问题只影响机器报告准确性，不改变Git实际范围；登记为`ERR-152 EVIDENCE_REPORTING_DEFECT`。后续封包器必须从Manifest动态输出目标文件数，不得复制上一版本常量。

重启目标提交daemon后，真实WI-0001只重试Verification Gate，结果：

```text
VERIFICATION_GATE=passed
FORMAL_VERSION_GATE=failed
GATE_SUMMARY=failed
STATE_AUTO_ADVANCE=NOT_ATTEMPTED
FINAL_STATE=verification_running
FORMAL_SNAPSHOT_REGENERATED=NO
SNAPSHOT_IMPLEMENTATION_FILES=[]
PRODUCTION_CODE_MODIFIED=NO
```

ERR-150真实失败关闭继续有效，但ERR-149尚未闭环。V94只读四方一致性取证证明：

```text
REMOTE_AND_LOCAL_PRODUCT_HEAD=9984c894ba0fd7b0808588ff21c3fc63920fdc01
AUDIT_EXTRACTED_FILES=4
DERIVE_ACTUAL_CHANGED_FILES=4
DERIVE_SOURCE=changed_files_audit.md
ACTUAL_GIT_IMPLEMENTATION_FILES=4
SOURCE_FORMAL_VERSION_RESULT=failed
SOURCE_FORMAL_SNAPSHOT_FILES=0
GOVERNANCE_SCOPE_ACTIVE=false
PRODUCT_REPOSITORY_UNCHANGED=YES
VALIDATION_REPOSITORY_UNCHANGED=YES
WI_ACTION=NOT_PERFORMED
```

最终根因：

```text
deriveActualChangedFiles
→ 正确返回PASS审计中的4个业务文件

auditActualGovernanceScope
→ 先读取governance_scope.active
→ active=false时提前返回actual_files=[]
→ 未调用deriveActualChangedFiles

inspectFormalGitBinding
→ 收到implementationFiles=[]
→ 与base...HEAD的4个业务文件对账失败
→ Formal Version快照不重建
```

`governance_scope.active`只表示Project Architecture/Data/Module范围治理是否启用，不能表示“没有实际实现文件”。兼容模式、恢复模式或范围治理未激活时，Formal Version仍必须消费Changed Files Audit和Git Diff完成文件集合闭环。

V95产品修复范围冻结为：

```text
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/tests/unit/formal-version-git-closure-regression.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
docs/rule/specforge-development-error-ledger-and-experience.md
docs/implementation/architecture-consistency/current-handoff.md
```

```text
ERR151_STATUS=IMPLEMENTATION_CORRECT_BUT_NOT_SUFFICIENT_TO_CLOSE_ERR149
ERR152_CLASSIFICATION=EVIDENCE_REPORTING_DEFECT
ERR152_STATUS=FIX_INCLUDED_IN_V95_DELIVERY_SCRIPT
ERR153_CLASSIFICATION=PRODUCT_DEFECT
ERR153_STATUS=FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_ACTUAL_SCOPE_FORMAL_VERSION_FAIL_CLOSED_RULES_ALREADY_APPLY
WI0001_CURRENT_STATE=verification_running
WI0001_CODE_PERMISSION=ENABLED
WI0001_CLOSE_ACTION=NOT_PERFORMED
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_ERR153_THEN_RETRY_WI0001_VERIFICATION_GATE_ONLY
```


## V95真实闭环、代码权限撤销时间证据与ERR-154（2026-08-06）

V95完成定向测试、对称全量A/B、TypeScript、构建、Installer、提交、推送和用户级升级：

```text
PRODUCT_HEAD=cb6d427216f0f8b99f2272ddc679441799c44544
TARGETED_TESTS=41_OF_41_PASS
AB_INCOMPARABLE=0
AB_NEW_FAILURES=0
USERLEVEL_VERIFY=PASS
```

重启目标daemon后，真实WI-0001只重试Verification Gate，ERR-149、ERR-151和ERR-153完成真实闭环：

```text
VERIFICATION_GATE=passed
FORMAL_VERSION_GATE=passed
GATE_SUMMARY=passed
STATE_AUTO_ADVANCE=verification_running_TO_verification_done
FORMAL_SNAPSHOT_HEAD=4f616d167f01ba24a63165f094386bd9157167c1
FORMAL_SNAPSHOT_IMPLEMENTATION_FILES=4
MISSING_FROM_SNAPSHOT=none
UNEXPECTED_IN_SNAPSHOT=none
PRODUCTION_CODE_MODIFIED=NO
```

随后按Architecture Change固定顺序显式执行`sf_code_permission(action=revoke)`。功能状态正确：

```text
STATE_BEFORE=verification_done
STATE_AFTER=verification_done
CODE_CHANGE_ALLOWED=false
CODE_PERMISSION_REVOKED=true
ALLOWED_WRITE_FILES=[]
ALLOWED_WRITE_FILES_SNAPSHOT_COUNT=16
FORMAL_VERSION_UNCHANGED=YES
PRODUCTION_CODE_MODIFIED=NO
```

但审计时间仍为旧撤权事件：

```text
LATEST_REVOKE_WORK_ITEM_UPDATED_AT=2026-08-06T01:50:12.895Z
CODE_PERMISSION_REVOKED_AT=2026-08-05T10:32:26.209Z
```

根因是显式撤权生产者使用`code_permission_revoked_at ?? now`，历史时间一旦存在就不会被当前撤权事件刷新；Close Gate兼容同步路径复制了相同字段写入逻辑。权限功能已撤销，但审计字段无法证明当前撤权事件何时发生。

V96范围冻结为：

```text
packages/daemon-core/src/tools/lib/code-permission-service-v11.ts
packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts
packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts
packages/daemon-core/tests/unit/specforge-development-experience-gate.test.ts
docs/rule/specforge-development-error-ledger-and-experience.md
docs/implementation/architecture-consistency/current-handoff.md
```

修复契约：

```text
显式revoke
→ 总是把code_permission_revoked_at和updated_at写成同一个当前事件时间

Close兼容同步
→ 复用同一权限事实助手
→ 已有撤权时间时不伪造新的撤权事件
→ 缺少撤权时间时才补齐

allowed_write_files_snapshot
→ 始终保留已有非空快照
→ 否则依次使用当前权限集合或Close传入的冻结快照
```

```text
ERR149_STATUS=CLOSED_REAL_WI_FORMAL_VERSION_REBUILD_PASS
ERR150_STATUS=CLOSED_REAL_WI_FAIL_CLOSED_PASS
ERR151_STATUS=CLOSED_REAL_WI_DURABLE_AUDIT_PASS
ERR152_STATUS=CLOSED_DELIVERY_REPORTING_DYNAMIC_COUNT_PASS
ERR153_STATUS=CLOSED_REAL_WI_COMPATIBILITY_SCOPE_PASS
ERR154_CLASSIFICATION=PRODUCT_DEFECT
ERR154_STATUS=FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_REVOKE_RECHECK
AUTHORITY_REVISION=NOT_REQUIRED_EXISTING_AUDIT_PROVENANCE_AND_FAIL_CLOSED_RULES_ALREADY_APPLY
WI0001_CURRENT_STATE=verification_done
WI0001_CODE_PERMISSION=REVOKED_FUNCTIONALLY_WITH_STALE_AUDIT_TIMESTAMP
WI0001_CLOSE_ACTION=NOT_PERFORMED
WI0001_GIT_MERGE_ACTION=NOT_PERFORMED
WI0002_ACTION=NOT_PERFORMED
WI0003_ACTION=NOT_PERFORMED
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_ERR154_THEN_REPEAT_EXPLICIT_REVOKE_ONCE_AND_VERIFY_TIMESTAMP_BEFORE_CLOSE
```

<!-- ERR155_ERR166_V8_HANDOFF:START -->
## ERR-155—ERR-166 V8 交接状态

- 远程基线：`main@04a98a5dd0d0ac7410e58975238e04a3fe7335ee`；V5 用户现场已通过 `git ls-remote` 精确校验。
- 权威文件：`docs/design/SpecForge架构一致性治理最终实施方案.md`，commit `08629b58c6aad82bf669a35e1f2bc8473cfa7ef3`，SHA256 `98410b513692acc049403c9cc8d2b6264edbb3cbc2d0798089e7458ac6674ccd`。
- WI-0002 第一次 Gate 失败证据保持原样；Candidate 修复冻结；禁止 Gate 重跑；未操作 WI-0003。
- V1：`ERR-160 / EXP-132`，固定文本次数断言。
- V2：`ERR-161 / EXP-133`，ZIP 双层目录。
- V3：`ERR-162 / EXP-134`，CMD 内联 IF 命令链未进入 Python。
- V4：`ERR-163 / EXP-135`，未解析 Windows `bun.cmd`。
- V5：`ERR-164 / EXP-136`，`bun x vitest` 使用临时下载环境，无法加载工作树的 `vitest/config`；真实产品文件尚未落盘。
- V6：`ERR-165 / EXP-137`，错误要求根目录固定存在 `node_modules/vitest/package.json`；真实产品文件尚未落盘，临时工作树清理已证明通过。
- V7：`ERR-166 / EXP-138`，目标测试把 daemon-core 工作目录误当仓库根目录；A/B 36/36 可比且无新增失败，真实产品文件尚未落盘，临时工作树清理已通过。
- V8 冻结修改范围仍为 11 个产品源码、Agent、测试和实施记录文件。
- V8 从 `packages/daemon-core` 工作区正式 `test`/`tsc`/`build` 入口执行，目标测试通过显式仓库根解析器读取仓库级文件。
- V8 控制台只输出 `BEGIN/END FEEDBACK TO CHATGPT` 之间的结构化字段，目标测试失败时额外输出稳定失败标识，完整过程保存在 `execution-details.log`.
- 明确不修改：P0 Validation 项目、WorkDesk、WI-0001、WI-0002 现场、WI-0003、权威实施方案。
- 当前状态：`PACKAGE_READY_PENDING_USER_APPLICATION_AND_VALIDATION`。
<!-- ERR155_ERR166_V8_HANDOFF:END -->

<!-- ERR167_DAEMON_STARTUP_README_CONTRACT_HANDOFF:START -->
## ERR-167 daemon 启动 README 契约修复交接

```text
REMOTE_BASELINE=dc7db378025b95df4278872c57b57afd9d83ef46
CLASSIFICATION=PRODUCT_DEFECT
ROOT_CAUSE=README把CLI客户端占位请求误写为daemon进程启动与状态入口，并宣称未实现的detach
SUPPORTED_START_COMMAND=bun run packages/daemon-core/src/index.ts
SUPPORTED_HEALTH_ENDPOINT=/api/v1/healthz
DAEMON_MODE=FOREGROUND_ONLY_CURRENTLY
CLI_DAEMON_LIFECYCLE=NOT_SUPPORTED_CURRENTLY
MODIFIED_FILE_COUNT=7
VALIDATION_PROJECT_MODIFIED=NO
WORKDESK_MODIFIED=NO
WI0002_ACTION=NOT_PERFORMED
AUTHORITY_REVISION=NOT_REQUIRED
STATUS=PACKAGE_READY_PENDING_USER_APPLICATION_AND_VALIDATION
```
<!-- ERR167_DAEMON_STARTUP_README_CONTRACT_HANDOFF:END -->

<!-- ERR167_ERR168_V12_HANDOFF:START -->
## ERR-167 / ERR-168：daemon 启动 README 修复 V12 交接

- 远程基线：`main@dc7db378025b95df4278872c57b57afd9d83ef46`。
- ERR-167：README 把 legacy CLI 客户端占位调用误写为 daemon 进程启动入口，并宣称未实现的后台脱离模式。
- V11：直接 README 契约测试 3/3 通过；相关运行时测试采用 patched-only 合并调用，无法证明失败是否由补丁引入。
- ERR-168：V11 验证器缺少相关测试对称基线、逐文件隔离和稳定失败标识。
- V12：基线/补丁两个独立工作树；四个相关测试逐文件执行；按相对文件路径与完整测试名比较。
- V12 只有全部相关基线和补丁测试通过、目标测试通过、TypeScript/daemon-core build、全仓 build、installer verify、范围审计和 Git 检查通过后，才原子写入 7 个文件。
- 明确不修改：产品运行代码、权威方案、SpecForge-P0-Validation、WorkDesk、WI-0002 现场、用户级安装目录。
<!-- ERR167_ERR168_V12_HANDOFF:END -->

<!-- ERR167_ERR171_V14_HANDOFF:START -->
## daemon 启动 README 修复 V14 交接

- 远程基线：`main@dc7db378025b95df4278872c57b57afd9d83ef46`。
- ERR-167：三个 README 与真实 daemon 入口、HTTP 路由和后台运行能力漂移。
- ERR-168：V11 相关回归缺少对称基线和稳定测试标识。
- ERR-169：V12 加载失败反馈缺少结构化根因。
- ERR-170：V12/V13 在运行 daemon 测试前只安装依赖，未执行仓库确定性工作区构建，导致 `@specforge/permission-engine` 的 `dist/src/index.js` 不存在。
- ERR-171：V13 失败签名混入 baseline/patched 动态报告路径。
- V14 固定顺序：两个干净工作树 → 冻结依赖安装 → 全仓确定性构建 → workspace runtime entry 检查 → README 目标测试 → 四个相关测试逐文件 A/B → no-emit TypeScript → installer verify → 范围与 Git 审计 → 原子写入。
- 允许修改仍为 7 个文件；产品运行代码、权威方案、Validation 项目、WorkDesk、WI-0002 第一次失败证据和用户级安装目录均禁止修改。
<!-- ERR167_ERR171_V14_HANDOFF:END -->

<!-- ERR172_V15_HANDOFF:START -->
## daemon 启动 README 修复 V15 交接

- V14 的全部功能、构建和测试验证已通过，但三个治理文档各新增一个 EOF 空白行，最终 `git diff --check` 失败。
- 分类：`PACKAGE_PREFLIGHT_DEFECT`。
- 新登记：`ERR-172 / EXP-144`。
- V15 保持原 7 文件冻结范围，不修改产品运行代码、权威方案、Validation 项目、WorkDesk、WI-0002 第一次失败证据或用户级安装目录。
- V15 新顺序：包内文本卫生检查 → 临时工作树应用 payload → 早期 `git diff --check` → 精确 7 文件审计 → 冻结安装 → baseline/patched 构建 → runtime entry → 目标测试 → 相关测试逐文件 A/B → TypeScript → installer verify → 最终审计 → 原子写入。
<!-- ERR172_V15_HANDOFF:END -->

<!-- ERR174_GATE_ATTEMPT_HANDOFF:START -->
## WI-0002 第二次 Gate、ERR-174 与 Gate Attempt 修复边界

- 产品基线：`main@a09f06f9ab1e1aa588958d0bc173088c90433892`。
- WI-0002 第二次 Candidate Gate：9/10 通过，`workflow_specific_gate` 已通过，`contract_integrity_gate` 因当前 `trace_delta.md` 行格式失败。
- 严重治理事实：第二次运行覆盖了第一次 `gates/*.json` 和 `gate_summary.md`；第一次完整机器报告不再原样存在。
- 分类：`ERR-174 PRODUCT_DEFECT`。
- V19：新增不可变 `gate_attempts/attempt-NNNN`；固定 `gates/*.json` 和 `gate_summary.md` 继续作为 latest 兼容视图；已有 latest 在第一次升级后运行前形成 legacy snapshot。
- WI-0002 当前边界：保持 `gates_failed`，禁止第三次 Gate，禁止继续修改 Candidate，直到产品修复、提交部署、daemon 重启并完成第一次证据可恢复性审计。
- 当前证据状态：`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT`。
- V19 执行状态：在写入前 `ANCHOR_PREFLIGHT` 失败，分类 `ERR-175 PACKAGE_PREFLIGHT_DEFECT`；产品仓库、Validation 项目、WorkDesk 和 WI-0002 均未修改。
- V20 防复发：以唯一章节标题和相对章节边界定位权威插入点，并用远程权威文件原字节完成封包前转换预演。
<!-- ERR174_GATE_ATTEMPT_HANDOFF:END -->

<!-- ERR176_ERR177_TRACE_DELTA_HANDOFF:START -->
## WI-0002 V23 Trace Delta 根因与产品修复

- 产品基线：`main@521d4ddc8e113152291fae0542a7a8e75ec38a11`。
- V23 恢复审计：
  - 第一次完整 Gate 机器报告永久不可证明恢复；`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES` 持续；
  - `attempt-0001` 正确保存升级前第二次 latest，`source=legacy_latest_snapshot`；
  - `attempt-0002` 为 V23 唯一 Gate，新 Attempt 与 latest 兼容视图正确；
  - Gate Attempt 不可变证据修复验证成功。
- V23 Candidate 修复只把 cell 内 `|` 改成逗号，但 `contract_integrity_gate` 仍失败。
- 重新对照源码后确认真实根因：
  - 正式 Trace Relation 只允许 `constrained_by/enforces`；
  - 当前 Candidate 使用 `owned_by/consumed_by-*`，不属于正式 Trace；
  - parser 的通用消息 `Invalid Trace Delta operation` 误导了第一次诊断。
- 产品缺陷：
  - `ERR-176 / EXP-148`：Gate 诊断没有区分 Operation、Relation、endpoint；
  - `ERR-177 / EXP-149`：Task Planner 强制自检只覆盖 Operation，没有覆盖 Relation、正式 ID 和“无边变化则无 delta”。
- 修复范围：权威规则、Trace parser 诊断、Task Planner、Trace 模型测试、error ledger、handoff、P0 closure，共 7 文件。
- WI-0002 后续：
  1. 产品修复部署并重启 daemon/OpenCode；
  2. 只读比较正式 Trace 与 Candidate 需要的真实边变化；
  3. 若 Contract 值变化但边集合不变，删除 Governance Relation Delta 区段；
  4. 若确有消费者 DD 新增/删除，只生成 `DD-* constrained_by WorkItemStatus` 的真实 ADD/REMOVE；
  5. 只运行一次 Candidate Gate；
  6. 无论通过/失败都停，不执行 User Decision。
<!-- ERR176_ERR177_TRACE_DELTA_HANDOFF:END -->

<!-- ERR178_ERR181_GATE_RETRY_STATE_HANDOFF:START -->
## WI-0002 attempt-0003 通过与状态恢复

- 当前产品基线：`main@77f02f46045d08c84288a7db753b2c897632790a`。
- WI-0002 attempt-0003：Candidate Gate 10/10 passed；contract_integrity_gate passed；latest view 对应 attempt-0003。
- 当前 Work Item state 仍为 gates_failed，仅因为 attempt-0003 发生于状态恢复产品修复前。
- ERR-178 / EXP-150：Candidate Gate retry 状态闭环缺失。
- ERR-179 / EXP-151：V24 提示词遗漏起始状态 Tool 契约。
- ERR-180 / EXP-152：V25 整段源码锚点失败；无真实写入。
- ERR-181 / EXP-153：V26 仍使用组合式边界字符串；在 SEMANTIC_PATCH_PREVIEW 停止，无真实写入。
- V27：Handler 新增 `candidateGateRecoverySequence()`；gates_failed 完整重跑后沿合法边恢复到 gates_running，再使用现有最终判定收口。
- V27 产品部署后，当前 WI-0002 **禁止再次 Gate**；只读确认 attempt-0003/Candidate 未变化后，通过四个合法 sf_state_transition 恢复到 approval_required。
- 第一次完整 Gate 机器报告永久不可恢复：`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`；P0 总体不得宣布完成。
<!-- ERR178_ERR181_GATE_RETRY_STATE_HANDOFF:END -->

<!-- ERR182_ERR184_HISTORICAL_SEAL_RECONCILE_HANDOFF:START -->
## WI-0002 attempt-0003 seal reconciliation

- attempt-0003：Candidate Gate 10/10 passed，immutable history 与 latest view 均已证明。
- V27 后续状态恢复：
  - gates_failed→candidate_preparing：成功；
  - candidate_preparing→candidate_prepared：成功；
  - candidate_prepared→gates_running：成功；
  - gates_running→approval_required：被 `SEAL_TRANSITION_ACTOR_FORBIDDEN` 正确阻断。
- 当前 WI-0002 权威状态：`gates_running`。
- ERR-182 / EXP-154：产品缺少 gate_runner 消费历史 passed Attempt 完成 seal 的受控入口。
- ERR-183 / EXP-155：V27 提示词只核对状态边，没有核对 seal authorized actor。
- ERR-184 / EXP-156：V28 两次本地封包生成均在 ZIP 前因三引号嵌套 SyntaxError 停止，无用户仓库写入。
- V28：`sf_gate_run(reconcile_attempt_id=...)` 进入 reconciliation mode；不执行 Gate、不创建 Attempt，只接受最新完整 passed Attempt、latest view 一致且 Gate 输入未变化，然后由 gate_runner 完成状态 seal。
- V28 部署后 WI-0002 只允许使用 `reconcile_attempt_id=attempt-0003`；禁止普通 sf_gate_run。
- 第一次完整 Gate 机器报告仍永久不可恢复：`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`；P0 总体不得宣布完成。
<!-- ERR182_ERR184_HISTORICAL_SEAL_RECONCILE_HANDOFF:END -->

<!-- ERR185_ERR186_GATE_INPUT_SNAPSHOT_HANDOFF:START -->
## WI-0002 V28 reconciliation freshness 失败后的最终处理

- WI-0002 当前 Validation：`main@6801fd76bf4a435502fafccc4ba7f14bceb5fe56`，当前状态 `gates_running`。
- attempt-0003：
  - source=gate_run；
  - 10/10 Candidate Gates passed；
  - immutable Attempt 与 latest Gate view 一致；
  - 无 attempt-0004；
  - Candidate 未修改。
- V28 reconciliation：
  - 没有运行 Gate；
  - 没有创建新 Attempt；
  - 没有状态推进；
  - 在 `.specforge/project/modules/CORE/contracts.json` 返回 `RECONCILE_GATE_INPUT_MISSING`。
- 根因不是 Validation 文件丢失，而是 V28 证据模型错误：
  - `input_files` 是 Gate 输入/探测路径集合；
  - Project Governance Loader 会把默认 Module `contracts.json` 路径加入 inputFiles，即使文件并未 materialize；
  - attempt-0003 没有冻结路径存在状态/hash，因此无法安全做 historical freshness。
- ERR-185 / EXP-157：路径列表不能当历史快照。
- ERR-186 / EXP-158：reconciliation 能力必须建立在 Attempt 输入快照之上。
- 产品修复后：
  1. 新 Gate Attempt 生成 `input-snapshot.json`；
  2. historical reconciliation 只接受有 snapshot 的 Attempt；
  3. attempt-0003 永久保留，不再尝试 reconcile；
  4. WI-0002 从当前 `gates_running` 只运行一次正常 Candidate Gate，预期创建 `attempt-0004`；
  5. attempt-0004 必须 10/10 passed、生成 input-snapshot，其中未 materialize 的 CORE/contracts.json 记录 `exists=false`；
  6. Gate Runner 正常 seal 到 `approval_required` 后立即停止，等待 User Decision。
- 第一次完整 Gate 机器报告仍永久不可恢复：`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`，P0 总体不得宣布完成。
<!-- ERR185_ERR186_GATE_INPUT_SNAPSHOT_HANDOFF:END -->

<!-- ERR187_ERR188_GATE_PROJECT_ROOT_PREFLIGHT_HANDOFF:START -->
## WI-0002 attempt-0004 前的 V30 前置修复

- V29 产品修复已提交 `581812bad1b87abb7863e693cccad3175251bc7b`。
- OpenCode 执行 V29 后续提示词时：
  - project/branch/HEAD/state/attempt-0003/Candidate 证据均通过；
  - `sf_git_preflight.worktree_clean=false`，原因仅为 `.specforge/knowledge/graph.json` + `.specforge/work-items/WI-0002/**` 治理现场；
  - 按错误 Prompt 停止；
  - Gate run count=0；
  - attempt-0004 不存在；
  - state 仍 gates_running。
- ERR-187 / EXP-159：`worktree_clean` 不能机械作为已有 WI Gate 前置条件；后续改为“只允许已知治理 dirty paths，禁止任何非治理或 staged 漂移”。
- V29 产品源码复核同时发现 ERR-188 / EXP-160：
  - input snapshot producer 对 relative input path 使用 daemon cwd；
  - reconciliation consumer 同样未以 projectRoot 解析；
  - 这会污染未来不可变 snapshot。
- V30 在 attempt-0004 创建前修复 producer/consumer 的 projectRoot 一致路径解析。
- V30 后再运行一次正式 Candidate Gate，预期创建 attempt-0004 + 正确 input-snapshot 并 seal 到 approval_required。
- 第一次完整 Gate 机器报告仍不可恢复；`P0_OVERALL_COMPLETION_ALLOWED=NO`。
<!-- ERR187_ERR188_GATE_PROJECT_ROOT_PREFLIGHT_HANDOFF:END -->

<!-- ERR189_ERR191_COMPACTION_BOUNDARY_HANDOFF:START -->
## WI-0002 Compaction 越界事件与 V35 产品修复

- WI-0002 在 V34 合法完成：HardStop 恢复、语义分支、精确 4 文件实施、targeted 9/9、full 10/10、Changed Files Audit 4/4、`implementation_done`、Code Permission revoked。
- V34 当前用户边界明确规定此处停止，并禁止 Verification / Formal Version / Close / Git checkpoint/merge/push。
- OpenCode 随后发生 Compaction，恢复后错误读取旧 `prompts/WI-0002.txt` 和完整 workflow skill，越界执行：
  - implementation commit `85c5f5dd`；
  - Verification / Semantic Closure 修复 / Verification Gate；
  - Close Gate，WI-0002=`closed`；
  - governance commit `dc413fff`；
  - Git Merge Plan。
- `sf_git_merge_run` 尚未执行，main 尚未合并 WI-0002。
- 这是 ERR-189~191，不因后续 Gate/Close 成功而消失。
- V35 修复：`GOV-CONT-001`、Orchestrator 最新用户边界优先级、Continuity Snapshot `operation_boundary`、Continuation Prompt 授权优先、`architecture_change` 代码型 continuity。
- V35 完成前禁止确认 WI-0002 Git Merge。
- V35 后只读对账当前 closed/commits/merge plan，不重跑任何 Gate/Close、不修改 WI-0002，然后重新由用户决定 Git Merge。
- 第一次 Candidate Gate 完整机器报告仍永久不可恢复，`P0_OVERALL_COMPLETION_ALLOWED=NO`。
<!-- ERR189_ERR191_COMPACTION_BOUNDARY_HANDOFF:END -->

<!-- ERR192_POST_MERGE_TEST_ORCHESTRATION_HANDOFF:START -->
## WI-0002 Git 交付完成与 V37 编排纠正

- WI-0002 当前 Git 交付已完成：
  - main merge commit=`793f3b1814f17e75f6e6356ab8213197c41c6fad`
  - parents=`6801fd76...` + `dc413fff...`
  - feature head / implementation commit 均为 main HEAD 祖先
  - `sf_git_post_merge_verify.success=true`
  - `repository_delivery_complete=true`
  - `repository_delivery_state=closed_and_git_merged`
  - Formal Version after merge：implementation tree / base diff / file set 均匹配
  - Validation repo 无 remote，因此无 push 动作
- V37 Prompt 额外要求 Git Merge 后运行 `bun test`，该步骤被 closed-WI WriteGuard 正常阻断。
- 该阻断不属于产品缺陷；错误在 V37 orchestration：
  - 业务测试已在 Close 前完成：targeted 9/9，full 10/10，Verification Gate passed；
  - Git Merge 后正式职责是 repository identity/integrity verification，不重复业务 Verification。
- ERR-192 / EXP-164 已记录。
- 不修改 WriteGuard、Code Permission、Git merge/post-merge runtime。
- WI-0002 后续不得重跑 Verification / Close / Git Merge / post-merge verify。
- 下一阶段可以开始 WI-0003，但必须建立新的明确 OPERATION_BOUNDARY。
- 第一次 Candidate Gate 完整机器报告仍永久不可恢复：
  `FIRST_GATE_MACHINE_REPORT_RECOVERABLE=NO`
  `INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`
  `P0_OVERALL_COMPLETION_ALLOWED=NO`
<!-- ERR192_POST_MERGE_TEST_ORCHESTRATION_HANDOFF:END -->

<!-- SPECFORGE_ERR193_ERR210_PROMOTION_RECOVERY:START -->
## 2026-08-07 — WI-0003 Promotion 产品缺口与 V41～V60 取证闭环

固定错误事实：

- ERR-193：Module→Project Contract Promotion 有 Gate 契约，但缺少同构受控 Candidate Producer；`sf_contract_register(action=update)` 不能模拟 Promotion。
- ERR-194：`candidate_manifest.json` schema 未覆盖 Gate 消费的 `contract_promotions`。
- ERR-195：Promotion Gate 对旧 Contract `source_refs` 无条件要求 REMOVE，可能制造当前正式 Trace 中不存在的 phantom REMOVE。
- ERR-196：V41/V42 继续依赖大段源码全文字符串 anchor，连续 `promotion manifest write anchor count=0`。
- ERR-197：V43 同一路线继续触发 `handler args anchor count=0`。
- ERR-198：V44 同一路线继续触发 `integrity current keys anchor count=0`，证明逐个修“下一个 anchor”不是可接受交付方法。
- ERR-199：曾把 main 祖先 `77f02f46045d08c84288a7db753b2c897632790a` 误判为当前 remote HEAD；V45 用 `git ls-remote` 证明真实 main 为 `a7357c2088d7e3a56fc113a7bc86d19bf0df9d35`。
- ERR-200：V49 Python 直接执行 Windows `bun`，未解析真实 `bun.cmd` / `bun.exe`。
- ERR-201：V50 `mklink /J` 嵌套 CMD quoting 错误，baseline 测试未启动。
- ERR-202：V51 把失败测试名与汇总计数错误要求来自同一个 artifact。
- ERR-203：V52 在 baseline 命令真实失败原因未解释前就比较失败集合。
- ERR-204：V52 “临时源码树 + 真实 node_modules junction”改变 Vite/Vitest 模块解析，不是等价 workspace baseline。
- ERR-205：V54 比较器未规范化非语义前导空格，产生失败集合假差异。
- ERR-206：V47～V56 一度把当前 main 的 13-package 历史全仓测试债务扩大成 Promotion 本轮阻塞范围；V55/V56 后按因果边界重新收敛。
- ERR-207：V57 在交付前本地生成 ZIP 时首次 runner 生成器发生嵌套三引号 Python SyntaxError；该包未生成、未交付、未写用户仓库。修正为 runner 与 payload 分离，并在交付前执行 runner `py_compile` 与 ZIP reopen integrity。
- ERR-208：V57 的 scope audit 使用 `one(git status --porcelain).strip()` 后再按固定列切路径；`.strip()` 删除了整个输出第一行的结构性前导状态空格，导致第一条路径 `docs/...` 被误切成 `ocs/...`。V57 因此在隔离 worktree 范围审计阶段失败，真实仓库未写入。V58 改为 `git diff HEAD --name-only` + `git ls-files --others --exclude-standard` 直接取得精确变更文件集合，不再解析 porcelain 展示文本。
- ERR-209：V58 在已知当前 main 存在历史验证债务的前提下，没有先执行 clean-main daemon-core `tsc --noEmit` / build baseline，就把 post-patch `exit=2` 直接判为补丁失败；该判定缺少 A/B 因果证据。V59 改为同一 detached worktree、同一 frozen dependencies、同一命令先 baseline 后 patch，比较新增错误集合。
- ERR-210：V59 的 A/B build 比较器在 baseline/post workspace build 都 `exit=0` 时仍把普通成功日志尾部当“错误键”比较，将 `Bundled 368 modules in 474ms` 这类非确定耗时文本误判为新增 build error。V60 改为退出码优先：两侧均成功时不比较普通输出；仅有非零退出时才比较稳定错误键。

V55/V56 基线：

- `bun install --frozen-lockfile` PASS，Bun 1.3.11，worktree clean。
- 当前 main 全仓 13 个 package 存在既有失败。
- 声明/实际 Vitest major 分布一致：1.x=8、3.x=3、4.x=2；不是统一依赖漂移。
- 失败类型跨 Module Resolution、Test Framework API、Filesystem、Path/Fixture、Performance/Timeout、Property、Assertion、Unhandled Async；必须作为独立历史测试债务治理，不能无因果扩大 ERR-193～195 的批准范围。

经验索引：

- EXP-165：Gate 支持的结构化治理动作必须有同构受控 Producer。
- EXP-166：Manifest Schema 必须覆盖 Gate 消费的控制字段。
- EXP-167：REMOVE 只能删除当前正式 Trace 中真实存在的边。
- EXP-168：用户机器不能作为补丁逐 anchor 调试环境。
- EXP-169：按文件尺度选择完整文件或结构化修改方法。
- EXP-170：包交付验证必须覆盖真实应用、范围、测试、类型、构建和 diff。
- EXP-171：branch HEAD 优先以 `git ls-remote <remote> refs/heads/<branch>` 为一手证据。
- EXP-172：Windows 外部工具必须解析真实 `.cmd/.exe` shim。
- EXP-173：证据字段按真实 artifact provenance 读取，不强迫来自同一文件。
- EXP-174：A/B baseline 环境必须语义等价。
- EXP-175：比较键必须规范化非语义空格、路径与展示前缀。
- EXP-176：历史全仓测试债务不得无因果扩大窄补丁。
- EXP-177：生成执行器的脚本本身也是交付物；必须在交付 ZIP 前编译/解析 runner，并使用 payload 分离避免嵌套字符串语法风险。
- EXP-178：机器结构化输出不能先经过面向人类文本的全局 `strip()/trim()` 再按固定列解析；文件范围审计优先使用 Git 直接集合命令（`git diff --name-only HEAD` + `git ls-files --others --exclude-standard`），避免状态列、首行空格、rename 展示格式造成路径损坏。
- EXP-179：当当前 HEAD 已知存在历史验证债务时，窄补丁的静态检查/构建不得只看 post exit code；必须在语义等价环境中先跑 clean-head baseline，再用稳定错误键比较新增/消失错误。只有补丁新增错误才归因于本轮；baseline 既有错误必须单独登记且不得伪装成通过。
- EXP-180：build/test 的成功 stdout 不是错误身份。A/B 验证必须先比较命令退出契约：baseline/post 均成功即 PASS；baseline 成功而 post 失败必为新增回归；baseline 失败而 post 成功是改善；只有两侧都失败时才比较规范化稳定错误键，禁止把耗时、模块数量、缓存命中等非确定成功日志作为差异门禁。

本轮产品修复：`sf_contract_register(action=promote)` 只允许 `architecture_change_path`，受控地产生新的 Project Contract、退休旧 Module Contract Candidate，并登记 `contract_promotions`；Manifest Schema 校验 Promotion 控制字段；Gate 只对当前正式 Trace 真实存在的旧 source edge 要求 REMOVE。Runtime 状态机和最终 Manifest entries 物化权威不变。

WI-0003 仍保持原 Candidate 状态。产品修复部署后必须先调查并使用合法 Candidate invalidation/recovery/reprepare 路径，再重新生成 Promotion Candidate；不得直接运行已知无效 V39 Candidate Gate。

永久边界：
`FIRST_GATE_MACHINE_REPORT_RECOVERABLE=NO`
`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`
`P0_OVERALL_COMPLETION_ALLOWED=NO`
<!-- SPECFORGE_ERR193_ERR210_PROMOTION_RECOVERY:END -->

<!-- SPECFORGE_ERR211_ERR214_SPEC_MIGRATION_CONTRACT_REPAIR:START -->
## ERR-211 / ERR-212 / ERR-213 / ERR-214 — spec_migration Contract 归位能力与交付器回归
- **ERR-211**：Validation WI-0003 只读取证确认正式 `ReportFormat` 只存在于 Project `extension_registry.json`，REPORTING `contracts.json` 没有 Contract 对象；P0 Stage C 不具备真正 Module→Project Promotion 前置条件。
- 源码对账确认：`sf_spec_migration(action="prepare_repair")` 不生成 Project/Module Contract Candidates；现有 `sf_contract_register` 也不能表达 Project→Module damaged-spec relocation。
- 修复：扩展既有 Contract Tool，新增仅限 `spec_migration_path` 的 `repair_relocate_to_module`；保持 ID、要求 canonical owner、真实 DD source_refs、migration/compatibility，存在跨 Module 正式 Trace consumer 时 Fail Closed，并禁止独立 consumers 字段。
- Runtime/Gate/状态机均不增加新机制；Runtime 继续在 candidate_preparing→candidate_prepared 最终 materialize canonical Candidate entries。
- **ERR-212**：首次生成 V63 runner 时再次出现 ERR-207 同类“外层生成器字符串被内层三引号提前终止”的 SyntaxError，ZIP 未生成、用户仓库未执行。该错误属于 **REPEATED_CLASS=ERR-207 / EXP-177**；V64 改为大段内容全部独立 payload，runner 仅读取 payload 与短锚点。
- Validation/WI-0003 在产品修复期间冻结于 `candidate_preparing`，不得运行 Candidate Gate。
<!-- SPECFORGE_ERR211_ERR212_SPEC_MIGRATION_CONTRACT_REPAIR:END -->

- **ERR-213**：V64 在隔离 worktree 已成功应用 ERR-211 补丁并完成范围形成后，交付器 `content_audit` 要求 `current-handoff.md` 含字面量 `PRODUCT_RECOVERY_CAPABILITY_GAP`，但 V64 自身 payload 未生成该字段，因此在产品测试前产生假失败；真实 SpecForge 仓库、Validation/WI-0003、Git 历史均未写入。
- `PRODUCT_RECOVERY_CAPABILITY_GAP=YES`：ERR-211 的产品能力缺口已由源码与 Validation 一手证据确认；V65 在治理记录中显式保留该机器可审计结论。

- **ERR-214**：V65 在当前 main 已知 daemon-core TypeScript/build 存在历史 workspace 模块解析债务、且错误台账已经固化 EXP-179 的情况下，再次只运行 post-patch `tsc --noEmit` 并因 `exit=2` 阻断，重复 ERR-209 类错误。V65 的 ERR-211 定向测试已 `exit=0`，但没有 clean-main A/B，因此 TypeScript 失败不能归因于 ERR-211 产品补丁。
- `REPEATED_ERROR_CLASS=ERR-209`；`APPLICABLE_EXPERIENCE=EXP-179`。V66 在同一 detached worktree、同一 frozen dependencies、同一命令下先建立 clean-main tsc/daemon build/workspace build baseline，再应用补丁并只阻断新增稳定错误键；成功 stdout 不参与错误身份比较（继续遵守 EXP-180）。

<!-- SPECFORGE_ERR215_ERR217_RUNTIME_SCAFFOLD_PREPARE_REPAIR:START -->
## ERR-215 / ERR-216 / ERR-217 — Runtime 空 Candidate 脚手架与 prepare_repair 覆盖保护死锁
- P0 Validation WI-0004 在 `candidate_preparing` 的真实运行中确认：正常 Work Item 初始化会预建 `candidates/` 空目录和 `candidate_manifest.json` 空壳；manifest 为 Runtime canonical 1.0 scaffold，`entries=[]`。
- `prepareProjectSpecRepairCandidates()` 旧实现只按路径是否存在判断覆盖风险，因此连 Runtime 自己合法创建的空 scaffold 也返回 `PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES`，导致 `prepare_repair` 无法启动；而 ERR-211 `repair_relocate_to_module` 又要求 repair context 已建立，形成真实死锁。
- OpenCode 曾尝试 shell 删除 `.specforge/**` scaffold，被 Write Guard 以 `SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN` 正确阻断并按 operator_error 放弃。该次阻断证明手工/ shell 绕过不是恢复路径。
- 修复边界：不修改通用 Runtime / Work Item 初始化。只让 `prepare_repair` 接管严格匹配 Runtime canonical 空 scaffold 的状态：candidate 目录为空；manifest 若存在必须恰好只有 `schema_version/work_item_id/workflow_path/base_spec_version/merge_required/entries` 六个 canonical 字段，值与当前 WI/spec_migration/expected PSV 匹配且 `entries=[]`；repair plan 必须不存在。
- 任一真实 Candidate 文件/子目录、非空 entries、未知 authored 字段、WI/workflow/version 不匹配、非 canonical schema 或已存在 repair plan，继续 Fail Closed。
- staging 完成前不动 scaffold；最终接管阶段若文件系统提交失败，恢复原 Runtime 空 scaffold，禁止留下半成品。
- Validation/WI-0004 在产品修复、提交、部署/重启前冻结于 `candidate_preparing`；不得再重试 prepare_repair 或运行 Candidate Gate。
<!-- SPECFORGE_ERR215_RUNTIME_SCAFFOLD_PREPARE_REPAIR:END -->

- **ERR-216**：V69 已在 exact clean source 稳定复现 ERR-215，但交付器使用大型源码 full-text anchor，应用补丁时报 `expected exactly one anchor, got 0`。真实仓库未写入。`REPEATED_ERROR_CLASS=ERR-196/ERR-197/ERR-198`，复用 EXP-169。
- **ERR-217**：V70 已改成结构化行定位，但又额外要求 guard 与 `temporaryRoot` 之间必须原始行号紧邻，把合法空行/格式差异当成异常，产品补丁仍未应用。真实仓库、Validation/WI-0004、用户级安装均未写入。该错误继续属于 EXP-169 所覆盖的“大型源码修改方法不应依赖非语义文本布局”重复类。
- V71 不再解析函数内部布局：仅用唯一函数起点 `prepareProjectSpecRepairCandidates` 与其后的唯一 `// ── Classification ──` 作为结构边界，整段替换为已基于固定 commit 构造的最终函数；找不到唯一边界即 Fail Closed。

<!-- SPECFORGE_ERR218_ERR219_COMPATIBILITY_CONSUMER_PROOF:START -->
## ERR-218 / ERR-219 — Contract repair compatibility consumer proof
- ERR-218：WI-0004 已证明 ERR-215 在真实 WI 上修复成功，`prepare_repair` 成功接管 Runtime 空 scaffold；随后 `repair_relocate_to_module` 因 Project Governance `active=false` 被错误阻断。
- `active` 是 Architecture + Data + Modules 的全局 readiness；而 Contract 正式消费者的唯一真相源是 formal Trace 中 `DD-* constrained_by <Contract>`，消费者 Module 由 DD owner 推导。
- 修复不直接放行 `active=false`：对目标 Contract 的 `current_trace` consumer edges 逐边证明。每一条 `constrained_by -> target Contract` 边都必须在 `currentSnapshot.consumers` 中解析到 DD/Module；任一无法解析则 Fail Closed；全部可解析后继续执行原有跨 Module consumer 阻断。
- 不修改 Project Governance active 定义、不修改 Architecture/Data Model、Runtime 状态机、Gate，也不把 prose 或独立 `consumers[]` 当消费者真相源。
- WI-0004 在产品修复、提交和 daemon 重启前冻结于 `candidate_preparing`；现有 prepare_repair Candidate 保留，不运行 Gate。
- ERR-219：V73 在 ChatGPT 交付前自检阶段要求 handoff payload 含英文稳定字面量 `formal Trace`，而生成 payload 使用中文表述，导致 ZIP 创建前假失败。真实仓库和 Validation 均未写入。`REPEATED_ERROR_CLASS=ERR-213`，复用 EXP-182。
<!-- SPECFORGE_ERR218_ERR219_COMPATIBILITY_CONSUMER_PROOF:END -->
<!-- SPECFORGE_ERR220_TRACE_PHASE_INFERENCE_HANDOFF:START -->
## ERR-220 — WI-0004 Candidate Gate Trace-aware fallback
- WI-0004 已完成 Candidate materialization，最终 manifest 含 REPORTING/CLI design、extension_registry、REPORTING module_contract 和 `trace_delta`；Candidate Gate 尚未运行。
- 当前产品缺陷：Candidate Gate fallback 只识别 tasks / requirements / design；`spec_migration_path + design` profile 不含 `trace_gate`，而 full profile 包含。
- 正确单一来源：Runtime 冻结的 `candidate_manifest`。Trace 治理责任必须由 `resolveFrozenManifestArtifacts(... artifactTypes=['trace_delta'])` 消费；禁止目录扫描把 Classification 排除的历史 trace 文件重新算入当前 Candidate。
- `WorkItemSpecArtifactKind` 已正式包含 `trace_delta`，不存在 `trace` kind。V76 的 `kind:'trace'` 为 ERR-072 同类 TypeScript 契约失误，复用 EXP-052。
- ERR-220 修复范围冻结为 Gate Runner、专用回归测试及本交接/错误台账/P0 closure 五个文件；不修改 types、Runtime、Workflow、required-gates、trace_gate、权威文件或 Validation/WI-0004。
- V77 的用户执行命令未进入 Python，属于既有 ERR-014 同类交互式 CMD 控制流错误；V78 仅修正交付启动方式并把该重复错误写入台账，产品修复范围不扩大。
- 修复后必须先证明默认 phase 自动为 full 且 required Gates 包含 `trace_gate`，再允许回到 WI-0004 做 Candidate Gate 前置审查。Candidate Gate 完成后停止，不自动执行 User Decision。
- 永久边界不变：`FIRST_GATE_MACHINE_REPORT_RECOVERABLE=NO`；`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`；`P0_OVERALL_COMPLETION_ALLOWED=NO`。
- V79 commit/push 前置范围审计因再次对 porcelain 完整输出执行 `.strip()`，把 `docs/...` 错读为 `ocs/...` 后 Fail Closed；属于 ERR-133 / ERR-140 重复错误，复用 EXP-109 / EXP-116。V79 未暂存、未提交、未推送、未修改 WI-0004。V80 改用不依赖 porcelain 状态列的三路文件集合审计。
<!-- SPECFORGE_ERR220_TRACE_PHASE_INFERENCE_HANDOFF:END -->

<!-- SPECFORGE_ERR221_REPAIR_FREEZE_BINDING_HANDOFF:START -->
## ERR-221 — WI-0004 Project Spec repair plan / frozen Candidate binding
- SpecForge 当前产品基线：`36ddf60d0152178b43cc249a49bc5da3ce3f95c7`；ERR-220 已提交推送并由 daemon/OpenCode 重启加载。
- WI-0004 首次正式 Candidate Gate 已执行且只执行一次。新版 Attempt 机制先把旧 pending latest 兼容视图保存为 `attempt-0001 source=legacy_latest_snapshot`，真正 Gate 为 immutable `attempt-0002 source=gate_run`。
- `attempt-0002`：10 个 required Gates 中 9 PASS；`trace_gate=passed`；唯一失败 `workflow_specific_gate`。权威状态已自动收口为 `gates_failed`。禁止重跑 Gate、禁止 User Decision。
- V88 一手根因：repair plan 只在 `candidate_manifest_sha256` 上 stale；Project Spec precondition/current manifest/evidence paths 全部一致。
- 产品生命周期缺口：prepare_repair 绑定初始 Candidate Manifest；Runtime 在 `candidate_preparing -> candidate_prepared` 冻结最终 Manifest 后未同步 repair plan；Gate 正确消费最终 Manifest 因而失败。
- ERR-221 修复保持现有架构：Gate、Workflow、required-gates、StateManager、prepare_repair 的 Project Spec precondition 语义均不放宽。只在 Candidate freeze transaction 中同步 repair plan 的最终 Candidate hash，并在 transition 失败时连同 Manifest 一起回滚。
- 修复前必须证明 repair plan 仍绑定 freeze 前 Manifest；若旧 binding 已 stale，Runtime Fail Closed，不得自动修复未知漂移。
- V89 修改范围：`sf-state-transition.ts`、其单元测试、本 handoff、错误台账、P0 closure，共5文件；Validation/WI-0004 保持冻结。
- V89 成功仅代表产品补丁本地验证完成、待单独 commit/push。提交部署并由用户手工重启 daemon/OpenCode 后，必须先调查并使用正式 `gates_failed` Candidate recovery 路径；不得手改 repair plan，不得直接重复 Gate。
- 永久边界不变：`FIRST_GATE_MACHINE_REPORT_RECOVERABLE=NO`；`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`；`P0_OVERALL_COMPLETION_ALLOWED=NO`。
<!-- SPECFORGE_ERR221_REPAIR_FREEZE_BINDING_HANDOFF:END -->

<!-- SPECFORGE_ERR222_CONTROLLED_REPAIR_BINDING_RECOVERY_HANDOFF:START -->
## ERR-222 — WI-0004 历史 repair binding 受控恢复
- SpecForge 当前基线：`83d66358ac5b1f228e88f4d0ed1ca5a34f6907b9`（ERR-221 已提交推送）。
- WI-0004 当前业务治理状态保持 `gates_failed`；Candidate Gate 不重跑、User Decision 不运行。
- 历史 stale binding 仍存在：plan `sha256:1ba8b34c...`，当前冻结 Candidate `sha256:e4f716bc...`。ERR-221 只修复未来 freeze，不能安全地自动修改历史 WI。
- 当前正式产品事实：`sf_v11_spec_migration` 只有 inventory/plan/inspect_repair/prepare_repair；prepare/inspect 只允许 candidate_preparing；Gate retry 不调用 prepare_repair。因此现有 WI 缺少受控恢复入口。
- ERR-222 新增 `sf_v11_spec_migration(action=recover_repair_binding)`，只允许 authoritative `gates_failed`。它必须由最新 immutable failed Gate Attempt、精确 required Gate 集合、唯一 stale-binding failure、Candidate input snapshot、当前 Project Spec precondition、Candidate 中保存的 repair evidence/modules 联合授权。
- 成功动作只原子更新 repair plan 的 `candidate_manifest_sha256`，不修改 Candidate/Project Spec/状态/Attempt，不自动执行 Gate。
- V92 成功仅代表产品补丁本地验证完成、待单独 commit/push；Validation/WI-0004 在产品修复期间冻结。
- 产品提交后由用户手工重启 daemon/OpenCode，随后才能对真实 WI-0004 执行一次 `recover_repair_binding`；先审计恢复结果，再允许 Candidate Gate retry 一次；Gate 后立即停止，不自动执行 User Decision。
- 永久边界：`FIRST_GATE_MACHINE_REPORT_RECOVERABLE=NO`；`INSUFFICIENT_EVIDENCE_FIRST_GATE_MACHINE_REPORT=YES`；`P0_OVERALL_COMPLETION_ALLOWED=NO`。
<!-- SPECFORGE_ERR222_CONTROLLED_REPAIR_BINDING_RECOVERY_HANDOFF:END -->

<!-- SPECFORGE_CURRENT_EXECUTION_STATE:START -->
## CURRENT EXECUTION STATE — 2026-08-16
```text
GLOBAL_GOAL=用真实全新独立项目完成 Phase 11 E2E，并完成 Phase 12 Hard Enforcement 发布边界
CURRENT_STAGE=SPECFORGE_ERR629_ATOMIC_SPEC_MERGE_AUDIT_PROVENANCE_FIX_IMPLEMENTED_PENDING_VALIDATION
CURRENT_STAGE_STATUS=V399_READ_ONLY_ROOT_CAUSE_CLOSED;ERR629_SCOPE_FROZEN_EXACT_8;V400_VALIDATION_PENDING
GOAL_TASK_SCOPE_CANONICAL=PASS
GOAL_MODULE_CONTRACT_CANONICAL=PASS
POST_CHANGE_GOAL_RECONCILIATION=PASS
V348_USERLEVEL_SF_ORCHESTRATOR_UPGRADE=PASS
V348_INSTALLER_VERIFY=PASS_119_FILES
V348_SF_ORCHESTRATOR_SOURCE_TARGET_SHA_MATCH=PASS
V348_SF_ORCHESTRATOR_SHA256=0A529F47AF3C03786388CAA8D66B2927ACF9BD906C145E4BFDE345507C3D9EEB
V349_CORRECTIVE_BOOTSTRAP_LIVE_REF=PASS_EAF1D93232F5AE3DF5CEAF8B54E60758D1939F52
FRESH04_REQUIRED=YES
FRESH04_PHASE11_RESULT=ERR622_REAL_PROJECT_VALIDATED_BY_WI0002_CLOSED;WI0001_REVERIFICATION_PENDING
FRESH04_ERR557_RUNTIME_ACCEPTANCE=PASS_WORKFLOW_PATH_CANONICAL
FRESH04_ERR558_RUNTIME_ACCEPTANCE=PENDING_NOT_REACHED
FRESH04_ERR569_RUNTIME_ACCEPTANCE=PASS_REAL_PROJECT_ATTEMPT0006
FRESH04_ERR573_RUNTIME_ACCEPTANCE=PASS_REAL_PROJECT_ATTEMPT0006_FLAT_30_CODE_PATHS
FRESH04_ERR573_REPAIRED_CANDIDATE_SHA256=D03C73F590F2CDFB9EE672B2B4E37F32036F748FEA46330441243C1598D668F1
FRESH04_ERR576_RUNTIME_ACCEPTANCE=PASS_REAL_PROJECT_ATTEMPT0007
FRESH04_ATTEMPT0007=10_OF_10_PASS_ZERO_BLOCKING_ISSUES
FRESH04_ERR576_AFFECTED_MODULES=CORE
FRESH04_ERR576_MODULE_CONTRACT_REFS=INV-CORE-001,INV-CORE-002,INV-CORE-003,INV-CORE-004,PI-CORE-001,MovementType
FRESH04_ERR576_ILLEGAL_MODULE_CODE_AS_CONTRACT_REF=REMOVED
FRESH04_SPEC_CONSISTENCY_GATE=PASS_ATTEMPT0007
FRESH04_CONTRACT_INTEGRITY_GATE=PASS_ATTEMPT0007
FRESH04_TRACE_GATE=PASS_ATTEMPT0007
FRESH04_ATTEMPT0008=POST_MERGE_GATE_PASS
FRESH04_USER_DECISION=APPROVED_UD-WI-0001-1786688149681
FRESH04_ATOMIC_SPEC_MERGE=SUCCESS_PROJECT_SPEC_VERSION_PSV-0002
FRESH04_CODE_PERMISSION=REVOKED_AFTER_VERIFICATION
FRESH04_IMPLEMENTATION=SUCCESS_30_DECLARED_FILES_CHANGED_FILES_AUDIT_PASS
FRESH04_CLOSE=FAILED_AFTER_94786F8_FIX_ERR602_ERR603_ERR604_ERR605_STATE_REMAINS_VERIFICATION_DONE
FRESH04_REPAIR_WI=WI-0002
FRESH04_REPAIR_STATE=closed
FRESH04_REPAIR_ATTEMPT0002=8_OF_9_PASS_ONLY_SPEC_CONSISTENCY_MODULE_CORE_CONTRACTS_PATH_FAIL
FRESH04_REPAIR_CANDIDATE_SHA256=D03C73F590F2CDFB9EE672B2B4E37F32036F748FEA46330441243C1598D668F1
FRESH04_REPAIR_PROJECT_SPEC_MANIFEST_SHA256=C33134805681C14340998797C672441C35EFAFFF518E75D663DEC119B6C41E91
FRESH04_REPAIR_BLOCKER=NONE_ERR622_REAL_PROJECT_VALIDATED
FRESH04_REPAIR_RECOVERY_CHAIN=verification_done->post_merge_verified->verification_running->verification_done->closed
FRESH04_REPAIR_VERIFICATION_ATTEMPT0007=VERIFICATION_GATE_AND_FORMAL_VERSION_GATE_PASS_ZERO_BLOCKING_ZERO_WARNING
FRESH04_REPAIR_SEMANTIC_CLOSURE=VALID_PROVENANCE_INCLUDES_CANDIDATES_TRACE_DELTA_MD
FRESH04_REPAIR_CLOSE=PASS_30_OF_30_STATE_CLOSED
FRESH04_REPAIR_IMPLEMENTATION_STATE_CROSSING=NONE
ERR622_STATUS=REAL_PROJECT_VALIDATED_BY_FRESH04_WI0002_CLOSED
ERR579_STATUS=CLOSED_BY_SFV349_CORRECTIVE_BOOTSTRAP
ERR580_STATUS=CLOSED_IN_SAME_FRESH04_SESSION_BEFORE_GATE_RUN
ERR581_STATUS=CLOSED_BY_SFV352_PREPUBLISH_DELIVERY_RECOVERY
ERR582_STATUS=CLOSED_BY_SFV352_PREPUBLISH_DELIVERY_RECOVERY
ERR583_STATUS=CLOSED_BY_SFV356_ENGINEERING_VALIDATION_RECOVERY
ERR584_STATUS=CLOSED_BY_SFV356_RECOVERY_IDENTITY_AUDIT_FIX
ERR585_STATUS=CLOSED_BY_SFV355_UTF8_BOOTSTRAP_RECOVERY
ERR586_STATUS=CLOSED_BY_SFV356_STDIN_EVIDENCE_TRANSPORT
ERR587_STATUS=CLOSED_BY_SFV358_TARGETED_VALIDATION_AND_REPORT_CLEANUP
ERR588_STATUS=CLOSED_BY_SFV358_EXACT_LOGGING_CMD_DISCIPLINE
ERR589_STATUS=CLOSED_BY_SFV358_PERSISTED_STATE_RECONCILIATION
ERR590_STATUS=CLOSED_BY_SFV358_FIVE_FILE_RECOVERY_BASELINE
ERR591_STATUS=CLOSED_BY_SFV358_COMMAND_ANCHOR_PREPUBLISH_AUDIT
ERR592_STATUS=CLOSED_BY_SFV364_ENGINEERING_VALIDATION
ERR593_STATUS=CLOSED_AS_DOWNSTREAM_SYMPTOM_BY_SFV364_ENGINEERING_VALIDATION
ERR594_STATUS=CLOSED_BY_SFV364_ENGINEERING_VALIDATION
ERR595_STATUS=CLOSED_BY_WRITE_GUARD_AND_CONTROLLED_RECOVERY
ERR596_STATUS=CLOSED_PREPUBLISH_BY_EXACT_WEB_SOURCE_PLUS_LOCAL_HEAD_GUARD
ERR597_STATUS=CLOSED_PREPUBLISH_BY_SFV361_DATA_DRIVEN_TRANSFORM_GENERATOR
ERR598_STATUS=CLOSED_BY_SFV364_SECTION_SCOPED_HANDOFF_VALIDATION
ERR599_STATUS=CLOSED_PREPUBLISH_BY_SFV364_EXTERNAL_FIXTURE_NO_BUNDLE_IMPORT
ERR600_STATUS=CLOSED_BY_SFV366_UTF8_FINAL_VALIDATION
ERR601_STATUS=CLOSED_BY_FORMAL_HARDSTOP_RESOLUTION
ERR602_STATUS=ROOT_CAUSE_CLOSED_BY_SFV369_PRODUCT_FIX_PENDING_FRESH04_RECOVERY
ERR603_STATUS=CLOSED_BY_SFV369_ENGINEERING_VALIDATION
ERR604_STATUS=CLOSED_BY_SFV369_ENGINEERING_VALIDATION
ERR605_STATUS=PENDING_POST_PRODUCT_FIX_FRESH04_CONTROLLED_RECOVERY_AND_REVERIFICATION
ERR606_STATUS=CLOSED_BY_SUCCESSFUL_SFV371_RERUN
ERR607_STATUS=CLOSED_BY_SFV381_FINAL_ENGINEERING_VALIDATION_PENDING_FRESH04_RECOVERY
ERR608_STATUS=CLOSED_PREPUBLISH_BY_SFV373_STRUCTURE_SCOPED_AUTHORITY_ANCHOR
ERR609_STATUS=CLOSED_BY_SFV381_FINAL_ENGINEERING_VALIDATION
ERR610_STATUS=CLOSED_BY_SFV376_SYMBOL_SCOPED_STRUCTURE_RECOVERY
ERR611_STATUS=CLOSED_BY_SFV381_FINAL_ENGINEERING_VALIDATION
ERR612_STATUS=CLOSED_BY_SFV379_BYTE_POSITION_RECOVERY
ERR613_STATUS=CLOSED_BY_SFV379_BYTE_POSITION_RECOVERY
ERR614_STATUS=CLOSED_BY_SFV381_FINAL_ENGINEERING_VALIDATION
ERR615_STATUS=CLOSED_BY_SFV381_STATE_FINALIZATION
ERR616_STATUS=REAL_PROJECT_VALIDATED_BY_FRESH04_ATTEMPT0003_AND_PSV0003_MERGE
ERR617_STATUS=CLOSED_BY_V386_HERMETIC_AB_DIFFERENTIAL
UNRECORDED_FAILURES=0
LAST_COMPLETED_STAGE=PHASE11_FRESH04_WI0002_SPEC_MIGRATION_CLOSE
LAST_COMPLETED_STAGE_STATUS=WI0002_VERIFICATION_ATTEMPT0007_PASS;CLOSE_30_OF_30_PASS;STATE_CLOSED;BLOCKING_0;WARNINGS_0;HARD_STOP_NONE
CURRENT_BLOCKER=ERR-629_ATOMIC_SPEC_MERGE_SPEC_MANIFEST_WRITE_PROVENANCE_MISSING
REMOTE_HEAD_BASELINE=FFC35F52F9ED4E3BE2F61D621DC9F3694D3E860F
AUTHORITY_BASELINE_COMMIT=FFC35F52F9ED4E3BE2F61D621DC9F3694D3E860F
VALIDATION_PROJECT=D:\code\InventoryFlow-Phase11-Fresh-04
VALIDATION_PROJECT_BRANCH=fix/repair-project-spec-restore-core-module-definition-and-spec-wi-0002
VALIDATION_PROJECT_WORKTREE=DIRTY_RUNTIME_GOVERNANCE_PLUS_DAMAGED_PROJECT_SPEC_PLUS_WI0002_REPAIR_AND_ATTEMPT0002_EVIDENCE
VALIDATION_PROJECT_SPEC_DIR_EXISTS=YES
VALIDATION_PROJECT_INITIAL_BUSINESS_REQUEST=BUSINESS_REQUEST.md
CURRENT_WI=WI-0002
AUTHORITATIVE_WI_STATE=closed
LATEST_IMMUTABLE_EVIDENCE=WI-0002:verification-attempt-0007:PASS;close-gate:30_OF_30_PASS;state:CLOSED
HISTORICAL_VALIDATION_PROJECT=D:\code\InventoryFlow
HISTORICAL_WI=WI-0001
HISTORICAL_WI_STATE=NOT_VALID_FOR_FINAL_PHASE11_EVIDENCE
LATEST_PRODUCT_FIX=ERR622_PRODUCT_COMMIT_FFC35F52F9ED4E3BE2F61D621DC9F3694D3E860F_DEPLOYED_USERLEVEL_VERIFY_119_FILES_REAL_PROJECT_VALIDATED_WI0002_CLOSED
LATEST_DEVELOPMENT_FAILURE=ERR-631:CLOSED_BY_V401_LEDGER_EOF_FINALIZATION
HISTORICAL_PENDING_HARNESS_ERROR=ERR-480:FIX_IMPLEMENTED_PENDING_LIVE_RUNTIME_ACCEPTANCE
FAILURE_LEDGER_BACKFILL=ERR-481,ERR-482,ERR-483,ERR-484,ERR-485,ERR-486,ERR-487,ERR-488,ERR-489,ERR-490,ERR-491,ERR-492,ERR-493,ERR-494,ERR-495,ERR-496,ERR-497,ERR-498,ERR-499,ERR-500,ERR-501,ERR-502,ERR-503,ERR-504,ERR-505,ERR-506,ERR-507,ERR-508,ERR-509,ERR-510,ERR-511,ERR-512,ERR-513,ERR-514,ERR-515,ERR-516,ERR-517,ERR-518,ERR-519,ERR-520,ERR-521,ERR-522,ERR-523,ERR-524,ERR-525,ERR-526,ERR-527,ERR-528,ERR-529,ERR-530,ERR-531,ERR-532,ERR-533,ERR-534,ERR-535,ERR-536,ERR-537,ERR-538,ERR-539,ERR-540,ERR-541,ERR-542,ERR-543,ERR-544,ERR-545,ERR-546,ERR-547,ERR-548,ERR-549,ERR-550,ERR-551,ERR-552,ERR-553,ERR-554,ERR-555,ERR-556,ERR-557,ERR-558,ERR-559,ERR-560,ERR-561,ERR-562,ERR-563,ERR-564,ERR-565,ERR-566,ERR-567,ERR-568,ERR-569,ERR-571,ERR-572,ERR-573,ERR-574,ERR-575,ERR-576,ERR-577,ERR-578,ERR-579,ERR-580,ERR-581,ERR-582,ERR-583,ERR-584,ERR-585,ERR-586,ERR-587,ERR-588,ERR-589,ERR-590,ERR-591,ERR-592,ERR-593,ERR-594,ERR-595,ERR-596,ERR-597,ERR-598,ERR-599,ERR-600,ERR-601,ERR-602,ERR-603,ERR-604,ERR-605,ERR-606,ERR-607,ERR-608,ERR-609,ERR-610,ERR-611,ERR-612,ERR-613,ERR-614,ERR-615,ERR-616,ERR-617,ERR-618,ERR-619,ERR-620,ERR-621,ERR-622,ERR-623,ERR-624,ERR-625,ERR-626,ERR-627,ERR-628,ERR-629,ERR-630,ERR-631
PRIOR_FAILURE_RECONCILIATION=PASS
EXPERIENCE_FILE_READ=YES_LATEST_WITH_ERR628
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-002,EXP-004,EXP-007,EXP-011,EXP-015,EXP-019,EXP-020,EXP-060,EXP-087,EXP-093,EXP-100,EXP-119,EXP-135,EXP-193,EXP-195
PRODUCT_COMPLETION_STATUS=ERR622_REAL_PROJECT_VALIDATED_PHASE11_CONTINUES
REMAINING_PRODUCT_MILESTONES=WI0001_REVERIFICATION;PHASE11_FRESH04_CLOSE_RETRY;PHASE12_HARD_ENFORCEMENT_RELEASE_BOUNDARY
AUTHORITY_BRANCH=main
WORK_BRANCH=main
LOCAL_REPO=D:\code\SpecForge
USERLEVEL_DIR=C:\Users\lyq\.config\opencode
USERLEVEL_INSTALL_STATUS=UPGRADED_AND_VERIFIED_AFTER_FFC35F52_119_FILES
SPECFORGE_VERSION=6.0.0-dev
BUN_VERSION=1.3.14
OPENCODE_VERSION=1.18.16
DELIVERY_FORMAT=ONE_COMPLETE_ZIP_PLUS_ONE_COPY_PASTE_CMD
POWERSHELL_ALLOWED=NO
VALIDATOR_CONTRACT=GOV-STAGE-VALIDATOR-001
CANONICAL_LOCAL_DELIVERY_VALIDATOR_KERNEL=scripts/validation-contract-kernel.ts
CANONICAL_LOCAL_DELIVERY_VALIDATOR_TYPECHECK=bun run typecheck:validator-contract
VALIDATION_CONTRACT_FREEZE_REQUIRED=YES
RUNTIME_BLOCKING_ASSERTION_CREATION_ALLOWED=NO
RUNTIME_BLOCKING_ASSERTION_MUTATION_ALLOWED=NO
RUNTIME_COMPILER_OPTION_SYNTHESIS_ALLOWED=NO
WINDOWS_NPM_SHIM_EXECUTION=CMD_CALL_REQUIRED
LOCAL_COMMAND_SHELL=CMD
DOWNLOAD_PACKAGE_DIR=C:\Users\lyq\Downloads\Compressed
DELIVERY_EXTRACT_ROOT=C:\Users\lyq\Downloads\Compressed\specforge
LOCAL_PATH_QUOTING=FULL_DOUBLE_QUOTES_FOR_ALL_PATHS_WITH_SPACES_OR_NON_ASCII
DAEMON_STATUS=RUNNING_AFTER_FFC35F52_DEPLOYMENT_AND_FRESH04_WI0002_RECOVERY
DAEMON_ACTION_REQUIRED=NONE
DAEMON_PID=INSUFFICIENT_EVIDENCE_CURRENT_NOT_REQUIRED
DAEMON_PORT=INSUFFICIENT_EVIDENCE_CURRENT_NOT_REQUIRED
DAEMON_HEALTH_STATUS=PASS_AFTER_FFC35F52_DEPLOYMENT_DURING_WI0002_RECOVERY_CHAIN
OPENCODE_STATUS=FRESH04_WI0002_CLOSED_AFTER_ERR622_REAL_PROJECT_VALIDATION
OPENCODE_ACTION_REQUIRED=NEXT_PHASE11_WI0001_REVERIFICATION_AFTER_ERR622_STATE_SYNC
OPENCODE_SESSION_MODE=CONTINUE_FRESH04_CURRENT_SESSION_FOR_WI0001_REVERIFICATION_AFTER_STATE_SYNC
WORKBUDDY_STATUS=NOT_APPLICABLE
WORKBUDDY_SESSION_MODE=NOT_APPLICABLE
OPERATION_BOUNDARY=EXACT_2_DYNAMIC_STATUS_FILES_NO_AUTHORITY_NO_PRODUCT_CODE_NO_FRESH04_ACCESS_NO_SELF_LIFECYCLE
FORBIDDEN_ACTIONS=SPECFORGE_SELF_DEVELOPMENT_WORK_ITEM,WORKFLOW,CANDIDATE,GATE,USER_DECISION,MERGE_RUNNER,CODE_PERMISSION,CLOSE,FRESH04_USER_DECISION,FRESH04_ATOMIC_SPEC_MERGE,FRESH04_CODE_PERMISSION,FRESH04_IMPLEMENTATION,FRESH04_CLOSE,AUTOMATIC_DAEMON_LIFECYCLE,AUTOMATED_COMMIT_PUSH
NEXT_STAGE=SFV400_ERR629_ATOMIC_SPEC_MERGE_AUDIT_PROVENANCE_VALIDATION
NEXT_LEGAL_ACTION=APPLY_ERR629_EXACT_8_FIX_AND_RUN_TARGETED_TYPESCRIPT_BUILD_SCOPE_VALIDATION
STOP_CONDITION=ERR622_REAL_PROJECT_VALIDATED_STATUS_SYNC_READY_FOR_COMMIT_PUSH
PERMANENT_INSUFFICIENT_EVIDENCE=ERR558_RUNTIME_ACCEPTANCE_PENDING_NOT_REACHED
```
<!-- SPECFORGE_CURRENT_EXECUTION_STATE:END -->
KNOWN_NONBLOCKING_OUT_OF_SCOPE=ERR-628_PREEXISTING_PATH_RESOLVER_TRAILING_SPACE_DOTDOT_PROPERTY_DEFECT

ERR629_ROOT_CAUSE=MERGE_RUNNER_WRITES_SPEC_MANIFEST_AS_FORMAL_BOOKKEEPING_BUT_CHANGED_FILES_AUDIT_HAS_NO_HASH_CURRENT_ATOMIC_MERGE_PRODUCER_PROVENANCE
ERR629_PRODUCER=packages/daemon-core/src/tools/lib/merge-runner-v11.ts::executeMerge
ERR629_CONSUMER=packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts
ERR629_CANONICAL_EVIDENCE=.specforge/runtime/atomic_spec_merge_controlled_writes.json
ERR629_LEGACY_COMPATIBILITY=SPEC_MANIFEST_ONLY_STRICT_RECONSTRUCTION
ERR629_ALLOWED_SCOPE=EXACT_8_FILES
ERR630_STATUS=CLOSED_BY_V400_REGENERATED_PACKAGE_AFTER_CLOSED_ZIP_HANDLE
FRESH04_WI0001_STATE=implementation_ready
FRESH04_WI0001_UNIQUE_BLOCKER=spec_write_by_non_merge_runner:.specforge/project/spec_manifest.json(actor:agent)
FRESH04_ACTION=FROZEN_UNTIL_ERR629_PRODUCT_FIX_DEPLOYED
ERR631_STATUS=CLOSED_BY_V401_LEDGER_EOF_FINALIZATION

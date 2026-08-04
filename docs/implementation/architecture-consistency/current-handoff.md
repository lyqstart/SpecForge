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

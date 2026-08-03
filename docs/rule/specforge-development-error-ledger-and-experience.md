# SpecForge 开发错误台账、正确做法与工程经验总则

> **文件状态**：`ACTIVE / MANDATORY_PRE_READ`
>
> **适用范围**：所有 SpecForge 产品开发活动，包括代码、测试、文档、配置、批处理、CMD、PowerShell、Python 辅助程序、补丁包、压缩包、安装器、验证命令、Git 操作、用户级安装和真实项目验证。
>
> **规则性质**：`PRODUCT_DEVELOPMENT`。本文件不要求业务项目直接读取；它约束开发和验证 SpecForge 产品的人与 Agent。
>
> **建立日期**：2026-08-02
>
> **台账原则**：只追加，不抹除。后来发现记录不完整时新增纠正项，不改写历史使错误“看起来没有发生”。

---

## 0. 修改前强制阅读门禁

本文件建立后的任何修改，必须先完整阅读 **第三部分“工程经验总则”** 和 **第四部分“修改前强制检查”**。

适用动作包括但不限于：

```text
修改 TypeScript / JavaScript / Python 等代码
修改 Markdown / JSON / 配置 / 测试
生成或修改 CMD / BAT / PowerShell / Python 辅助程序
生成补丁、替换包、压缩包、安装包
给用户提供任何可能改变文件或环境的命令
运行安装、升级、验证、构建、Git 暂存、提交或推送
启动真实项目验证阶段
```

开始动作前必须记录：

```text
EXPERIENCE_FILE_READ=YES
EXPERIENCE_FILE=docs/rule/specforge-development-error-ledger-and-experience.md
APPLICABLE_EXPERIENCE_RULES=EXP-...（至少一项）
REPEATED_ERROR_CHECK=PASS
BASELINE_EVIDENCE=当前 HEAD、分支、工作区、权威文件
```

如果文件不存在、无法读取、内容冲突或无法判断适用经验：

```text
必须停止修改
不得凭记忆继续
不得生成“先试试看”的脚本或命令
```

本文件首次创建属于 `BOOTSTRAP_EXCEPTION`；从本文件落库后不再允许豁免。

---

# 第一部分：错误记录

## 1. 记录范围与分类

错误分类统一使用：

```text
DESIGN_ERROR          设计范围或架构判断错误
PRODUCT_DEFECT        SpecForge 产品实现缺陷
SCRIPT_DEFECT         辅助脚本、批处理、补丁或命令自身缺陷
ENVIRONMENT_ERROR     对操作系统、Shell、运行时或安装布局判断错误
VALIDATION_DEFECT     验证顺序、测试选择、断言或归因错误
PROCESS_VIOLATION     违反已确认的开发边界或交付规则
EVIDENCE_DEFECT       证据收集、解析或事实表述错误
HISTORICAL_DEBT       发现的既有失败或历史治理债务
```

每个错误必须回答：发生了什么、为什么发生、影响是什么、怎样防止整类问题重复。

## 2. 已确认错误台账

### ERR-001：曾把独立 Project Governance 层作为目标方向

- **分类**：`DESIGN_ERROR`
- **现象**：曾考虑新增独立 `governance.md`、治理变化字段和 Governance Gate。
- **根因**：从概念完整性出发增加层次，没有先检查 Architecture 是否已经能承载项目级结构与系统级约束。
- **影响**：增加权威源、Gate 和状态复杂度，违反“越简单越稳定”。
- **正确结论**：取消独立 Governance 层；Project Architecture 统一承担项目级结构、公共基础设施、模块边界、依赖与系统约束。
- **类防护**：`EXP-001`、`EXP-017`、`EXP-019`。

### ERR-002：曾把“SpecForge 用 SpecForge 开发自己”作为推进方式

- **分类**：`DESIGN_ERROR / PROCESS_VIOLATION`
- **现象**：早期方案曾包含 SpecForge 自迁移、自治理或以自身 Project Spec 驱动自身开发。
- **根因**：混淆“产品提供的治理能力”和“产品自身当前开发方式”。
- **影响**：形成递归依赖，产品缺陷可能阻断修复产品缺陷本身。
- **正确结论**：SpecForge 始终由外部工具和普通软件工程流程直接开发；业务项目才使用 SpecForge 治理。
- **类防护**：`EXP-001`、`EXP-016`。

### ERR-003：改造范围曾不必要地扩展到 Requirement

- **分类**：`DESIGN_ERROR`
- **现象**：架构一致性改造一度把 Requirement 作为核心扩展对象。
- **根因**：没有先固定本轮目标链路和完成边界。
- **影响**：扩大修改面、测试面和治理复杂度，掩盖 Architecture→Design→Contract→Code 的核心问题。
- **正确结论**：本轮保留现有 Requirement 能力，不做无明确缺口的扩展。
- **类防护**：`EXP-004`、`EXP-019`。

### ERR-004：不同时间的权威文件、提交和上传副本曾被混用

- **分类**：`EVIDENCE_DEFECT / PROCESS_VIOLATION`
- **现象**：旧提示词、旧 ZIP、旧 SHA、本地文件和远程 main 可能同时出现；部分步骤默认旧 SHA 仍是当前基线。
- **根因**：没有把“当前基线”作为每轮工作的第一项证据。
- **影响**：可能基于过期代码设计补丁或错误判断差异。
- **正确结论**：每轮先固定仓库、分支、HEAD、工作区和权威文件所在提交；不同来源不得混用。
- **类防护**：`EXP-001`、`EXP-007`。

### ERR-005：用户级路径权威判断错误，遗留路径持续写入

- **分类**：`PRODUCT_DEFECT / ENVIRONMENT_ERROR`
- **现象**：`C:\Users\luo\.specforge` 被创建和持续写入；还出现 `sf-user\runtime\.specforge\runtime\...` 的错误嵌套路径。
- **根因**：路径权威散落、旧默认仍存在、路径拼接边界未统一。
- **影响**：运行时状态分裂、握手与 daemon 路径不一致、清理和升级风险增加。
- **正确结论**：用户级 runtime 权威路径为 `<OpenCode config>\sf-user\...`；禁止用户主目录 `.specforge` 写入。
- **类防护**：`EXP-002`、`EXP-005`、`EXP-017`。

### ERR-006：daemon 与 OpenCode 生命周期边界曾被自动化思路侵入

- **分类**：`PROCESS_VIOLATION`
- **现象**：曾设计或接近设计自动启动、停止、重启 daemon/OpenCode 的步骤。
- **根因**：为了流程自动化忽略用户明确要求的人工控制边界。
- **影响**：可能改变现场运行状态、破坏当前会话或制造难以归因的环境变化。
- **正确结论**：任何 daemon/OpenCode 生命周期操作必须先明确告知，由用户手工执行。
- **类防护**：`EXP-018`。

### ERR-007：多轮补丁基于猜测结构和脆弱锚点

- **分类**：`SCRIPT_DEFECT`
- **现象**：Stage2、多轮 merge-runner 补丁出现锚点找不到、Final-File 多版替换、正则继续扩大等问题。
- **根因**：没有先冻结真实源码内容、目标函数、唯一锚点和调用链。
- **影响**：重复失败、浪费用户操作、可能误改复杂函数。
- **正确结论**：复杂修改优先完整文件替换；补丁前必须读取精确源码并验证锚点唯一；找不到即停止。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-019`。

### ERR-008：文本包含断言曾被当成主要验收

- **分类**：`VALIDATION_DEFECT`
- **现象**：补丁文本测试通过，但 TypeScript 语法、类型或 workspace build 后续失败。
- **根因**：把“字符串存在”错误等同于“代码可编译、可运行”。
- **影响**：产生假通过。
- **正确结论**：文本检查只作辅助；必须按类型检查、目标测试、构建、安装一致性和真实验证完成验收。
- **类防护**：`EXP-011`。

### ERR-009：辅助脚本曾在仓库内创建备份或临时文件

- **分类**：`SCRIPT_DEFECT`
- **现象**：`.hotfix-backups/`、临时报告、日志或错误文件污染 Git working tree。
- **根因**：脚本没有把自身副作用纳入设计。
- **影响**：脚本自己制造 dirty tree，又用 clean check 阻断后续。
- **正确结论**：备份、日志、临时目录全部放在仓库外；运行前后比较 Git 状态。
- **类防护**：`EXP-006`、`EXP-013`。

### ERR-010：脚本只设计成功路径，失败恢复与重复运行不足

- **分类**：`SCRIPT_DEFECT`
- **现象**：失败后可能残留半补丁、分支、测试、报告、日志或临时目录；下一版脚本又假设全新环境。
- **根因**：缺少失败原子性、回滚、幂等和现场恢复设计。
- **影响**：下一轮无法区分旧残留与新问题。
- **正确结论**：每个写操作必须有前置状态、备份、失败回滚、重复执行和状态不变量。
- **类防护**：`EXP-006`、`EXP-013`。

### ERR-011：在交互式 CMD 中错误使用批处理变量语法 `%%i`

- **分类**：`ENVIRONMENT_ERROR / SCRIPT_DEFECT`
- **现象**：粘贴到交互式 CMD 的 `for %%i`、`%%H` 没有按预期展开，反馈出现字面量变量。
- **根因**：混淆 `.cmd/.bat` 文件语法与交互式 CMD 语法。
- **影响**：命令结果失真，用户重复操作。
- **正确结论**：交互式 CMD 用 `%i`；批处理文件内才用 `%%i`。复杂循环不再直接粘贴到 CMD。
- **类防护**：`EXP-002`、`EXP-012`。

### ERR-012：把多行 Python 和三引号嵌入交互式 CMD

- **分类**：`SCRIPT_DEFECT`
- **现象**：出现 `unterminated triple-quoted string`，后续 Python 行被 CMD 当命令执行；其中一行意外调用 `opencode` 并显示帮助。
- **根因**：多层 Shell、Python、引号和换行转义未经实际环境验证。
- **影响**：审计未执行，并存在误触命令风险。
- **正确结论**：复杂逻辑必须交付独立文件；交互式命令只负责调用，不承载多行程序。
- **类防护**：`EXP-002`、`EXP-012`。

### ERR-013：CMD 哈希与变量读取命令多次写错

- **分类**：`SCRIPT_DEFECT`
- **现象**：文件大小、SHA256 变量未赋值，输出 `%FILE_SIZE%`、`%%H` 等字面量。
- **根因**：没有在同版本 Windows CMD 中验证命令；继续沿用错误变量模型。
- **影响**：无法完成本应简单的文件校验。
- **正确结论**：优先直接输出 `certutil` 结果；必须解析时使用独立已验证脚本，不在交互命令中构造复杂变量链。
- **类防护**：`EXP-012`、`EXP-019`。

### ERR-014：首版批处理审计脚本调用后无任何输出

- **分类**：`SCRIPT_DEFECT / VALIDATION_DEFECT`
- **现象**：文件完整、SHA 正确，但 `call` 后直接返回且没有反馈区块。
- **根因**：批处理控制流没有在与用户相同的调用方式下完成端到端验证。
- **影响**：用户无法判断执行状态。
- **正确结论**：脚本自身必须作为产品测试；至少验证正常、前置失败、内部失败、反馈区块和 exit code。
- **类防护**：`EXP-007`、`EXP-012`。

### ERR-015：Windows 默认 GBK 解码 UTF-8 子进程输出

- **分类**：`ENVIRONMENT_ERROR / SCRIPT_DEFECT`
- **现象**：`'gbk' codec can't decode byte...`，导致 installer verify 未完成。
- **根因**：Python `text=True` 隐式使用系统编码，没有把工具输出编码当成接口契约。
- **影响**：正确工具被审计程序提前中断。
- **正确结论**：捕获 bytes，按 UTF-8-SIG、UTF-8、GB18030 顺序解码，最后才 replacement fallback。
- **类防护**：`EXP-002`。

### ERR-016：用户级 Agent/Skill 安装布局先验假设错误

- **分类**：`EVIDENCE_DEFECT`
- **现象**：最初假设 Agent/Skill 在 `.config\opencode\sf-user`，报告 0/9；实际位置在 `.config\opencode` 根目录。
- **根因**：没有先读取 installer、manifest 和真实目录。
- **影响**：误判未安装。
- **正确结论**：布局必须由安装器、manifest 和实际文件共同确定，不能根据路径命名推断。
- **类防护**：`EXP-001`、`EXP-007`。

### ERR-017：把 installer `verify=PASS` 误称为“与当前源码矛盾”

- **分类**：`EVIDENCE_DEFECT`
- **现象**：已安装 9 个文件匹配旧 Manifest 但不匹配当前源码；最初把 verify PASS 解释成安装器缺陷。
- **根因**：没有先核实 verify 的业务语义是“安装完整性”，而不是“安装新鲜度”。
- **影响**：错误归因产品缺陷。
- **正确结论**：区分完整性、版本新鲜度和源码一致性；upgrade 与 verify 是不同检查。
- **类防护**：`EXP-001`、`EXP-008`、`EXP-016`。

### ERR-018：Git stderr 警告被合并进 stdout 并当成文件名

- **分类**：`SCRIPT_DEFECT`
- **现象**：`LF will be replaced by CRLF` 被解析成 modified 文件列表，导出脚本在打包前中止。
- **根因**：统一重定向 stdout/stderr 后又按结构化 stdout 解析。
- **影响**：两次没有生成用户期待的 ZIP。
- **正确结论**：结构化命令必须分离 stdout/stderr；警告单独记录，不参与数据解析。
- **类防护**：`EXP-002`、`EXP-007`。

### ERR-019：把上一轮状态快照写成下一轮必须满足的不变量

- **分类**：`SCRIPT_DEFECT / EVIDENCE_DEFECT`
- **现象**：导出 V2 强制要求仍有 4 个 modified 文件；现场已恢复为 0 个，脚本再次在打包前失败。
- **根因**：把观察到的瞬时状态固化为业务不变量。
- **影响**：脚本不能适应合法状态变化。
- **正确结论**：只固定真正不可变的基线（HEAD、允许范围、权威版本）；其余动态读取并分类。
- **类防护**：`EXP-003`、`EXP-013`。

### ERR-020：前置审计把合法的旧项目结构误判为缺失

- **分类**：`EVIDENCE_DEFECT`
- **现象**：因没有 `module_registry.json` 和 registry 中的 `code_paths`，初步认为模块代码归属缺失；实际 code_paths 已在各模块 design/trace 文档中声明。
- **根因**：读取器只覆盖一种结构，没有先识别项目版本和兼容表示。
- **影响**：产生不必要阻塞。
- **正确结论**：解析旧项目时必须枚举权威兼容来源，再判断缺失。
- **类防护**：`EXP-001`、`EXP-007`、`EXP-016`。

### ERR-021：把 WI-0001 描述为“closed”而不是实际 `superseded`

- **分类**：`EVIDENCE_DEFECT`
- **现象**：提示词概括为两个历史关闭项，正式状态显示 WI-0001 为 superseded、WI-0002 为 closed。
- **根因**：用“非活动历史项”口语概括替代权威状态值。
- **影响**：状态语义不精确。
- **正确结论**：业务结论可写“历史非活动”，但必须同时保留真实枚举状态。
- **类防护**：`EXP-001`。

### ERR-022：`candidate_manifest.base_spec_version` 写死 `PSV-0001`

- **分类**：`PRODUCT_DEFECT`
- **现象**：PSV-0002 的 WorkDesk 创建 WI-0003 后，候选 Manifest 基线仍是 PSV-0001。
- **根因**：生命周期初始化器使用隐藏默认值，没有绑定权威 `spec_manifest.json`。
- **影响**：审批和 Merge 绑定错误基线，可能诱导人工修改治理文件。
- **正确结论**：创建任何 WI 文件前读取并校验权威版本，显式传递；不可用时 fail closed 且不留下部分目录。
- **类防护**：`EXP-005`、`EXP-006`、`EXP-017`。

### ERR-023：修改函数签名后遗漏第二条生产调用入口

- **分类**：`PRODUCT_DEFECT / VALIDATION_DEFECT`
- **现象**：`initializeClosureFiles` 从 3 参数改为 4 参数，但 `sf-v11-work-item-create.ts` 仍传 3 个参数，TypeScript 报 TS2554。
- **根因**：修改前没有建立完整定义—调用者—消费者闭包；补丁只覆盖首个发现路径。
- **影响**：构建失败，另一条正式创建入口仍无法绑定 PSV。
- **正确结论**：任何签名、Schema、Contract 变化必须先列出全部调用点和生产入口，再修改并编译。
- **类防护**：`EXP-004`、`EXP-011`。

### ERR-024：Python 直接启动 `bun` / `bunx`，忽略 npm `.cmd` 包装器

- **分类**：`ENVIRONMENT_ERROR / SCRIPT_DEFECT`
- **现象**：`[WinError 2] 系统找不到指定的文件`，测试未运行。
- **根因**：按 Unix 可执行文件模型调用 Windows npm shim。
- **影响**：把环境调用错误延迟到用户现场。
- **正确结论**：Windows 先 `where`/`shutil.which` 解析 `.cmd`，通过 `cmd.exe /d /s /c` 调用。
- **类防护**：`EXP-002`、`EXP-007`。

### ERR-025：验证顺序不合理，先混跑历史失败测试再归因

- **分类**：`VALIDATION_DEFECT`
- **现象**：4 个历史测试文件一起运行得到 13 个失败，之后才做原 HEAD A/B。
- **根因**：没有先运行专用回归、类型检查和构建，也没有先建立历史失败基线。
- **影响**：一度无法判断补丁是否引入回归。
- **正确结论**：专用测试→类型检查→构建→A/B→相关回归→全量测试。
- **类防护**：`EXP-009`、`EXP-010`、`EXP-011`、`EXP-016`。

### ERR-026：Bun 测试选择命令连续构造错误

- **分类**：`SCRIPT_DEFECT / VALIDATION_DEFECT`
- **现象**：测试文件路径未以 `./` 明确限定导致仓库级扫描；参数顺序错误；正则经过 CMD 转义后成为无效表达式 `\"binds\`。
- **根因**：命令经过 Python→CMD→Bun 多层解释，未在同构环境验证最终 argv；为了过滤新增测试引入过度复杂度。
- **影响**：运行无关测试或在测试开始前失败。
- **正确结论**：新增回归测试放入独立文件，直接 `bun test ./exact-file.test.ts`；避免名称过滤和多层正则。
- **类防护**：`EXP-002`、`EXP-010`、`EXP-012`。

### ERR-027：新增 PSV 测试放入已有历史失败的测试文件

- **分类**：`VALIDATION_DEFECT`
- **现象**：为了验证两个新增用例，被迫依赖 `--test-name-pattern`，继而触发范围和转义问题。
- **根因**：没有把新缺陷回归做成独立、可单独执行的测试单元。
- **影响**：验证与历史债务耦合。
- **正确结论**：新缺陷必须有独立回归文件；旧测试同步只做兼容更新，不承担唯一证明责任。
- **类防护**：`EXP-010`、`EXP-016`。

### ERR-028：多次把仅做语法检查的脚本直接交给用户现场运行

- **分类**：`PROCESS_VIOLATION / VALIDATION_DEFECT`
- **现象**：脚本通过 Python 编译和 SHA 校验，但未在 Windows CMD、npm shim、Git 警告、Bun 参数等同构环境完成行为验证。
- **根因**：把“脚本可解析”误当成“脚本可在目标环境运行”。
- **影响**：用户承担本应在交付前消除的试错。
- **正确结论**：交付前必须做环境等价模拟；无法模拟的部分明确标记并先用最小只读探针取证。
- **类防护**：`EXP-002`、`EXP-007`、`EXP-012`。

### ERR-029：前置条件过严导致本应生成的证据包被多次取消

- **分类**：`SCRIPT_DEFECT`
- **现象**：导出工具在非危险差异上直接中止并删除输出；用户连续看不到 ZIP。
- **根因**：没有区分“必须阻断的安全条件”和“应记录的环境差异”。
- **影响**：正常证据采集被不必要阻断。
- **正确结论**：只对 HEAD 错误、范围外写入、staged 变化等危险条件 hard stop；合法状态差异应动态记录。
- **类防护**：`EXP-003`、`EXP-006`、`EXP-013`。

### ERR-030：没有统一错误台账，导致同类错误以不同形式重复

- **分类**：`PROCESS_VIOLATION`
- **现象**：虽然已有批处理专项复盘，但 CMD、Python、Git 解析、测试选择、调用链和证据归因没有统一前置经验入口。
- **根因**：经验按事件分散，未建立修改前强制读取门禁。
- **影响**：遇到一个问题修一个问题，规则没有提升到类。
- **正确结论**：建立本文件作为统一经验入口；每个错误必须归入类规则并更新门禁。
- **类防护**：`EXP-015`、`EXP-020`。

### ERR-031：早期命令反馈要求用户粘贴过多日志

- **分类**：`PROCESS_VIOLATION`
- **现象**：用户需要从长输出中筛选关键信息。
- **根因**：命令只考虑执行，没有设计人机反馈协议。
- **影响**：反馈噪声大，容易遗漏真正失败点。
- **正确结论**：每个 CMD 末尾输出独立最小 `FEEDBACK TO CHATGPT` 区块；完整日志只在失败时保存路径。
- **类防护**：`EXP-012`。

### ERR-032：曾要求用户通过 Python/脚本在本地修改仓库文件

- **分类**：`PROCESS_VIOLATION`
- **现象**：多轮修复通过 apply Python 脚本修改源码，偏离已确认的“ChatGPT 生成完整替换文件，用户只覆盖”规则。
- **根因**：为了做精确前置校验和回滚，选择了对用户更复杂的应用方式，却没有重新评估已冻结交付边界。
- **影响**：增加用户操作复杂度和脚本失败面。
- **正确结论**：默认交付完整文件 ZIP；只有完整替换无法安全实现且用户明确同意时，才使用受控应用程序，并记录例外原因。
- **类防护**：`EXP-012`、`EXP-014`、`EXP-018`。

### ERR-033：Git 换行/索引瞬时状态被误判为真实文件漂移

- **分类**：`EVIDENCE_DEFECT`
- **现象**：阶段 1 报告 4 个 modified 文件；随后字节与 HEAD 4/4 相同且正式 diff 为空。
- **根因**：只读取一次 status/warning，没有用字节、diff 和再次刷新交叉验证。
- **影响**：错误地把瞬时假脏状态列为治理风险。
- **正确结论**：dirty 结论至少由 porcelain status、diff name、字节/哈希和重读后状态交叉确认。
- **类防护**：`EXP-003`、`EXP-007`。

### ERR-034：Trace 解析曾把说明文字中的关键词当成正式关系

- **分类**：`EVIDENCE_DEFECT`
- **现象**：包含 `constrained_by` 的生成说明和 Root Sync Note 被计入关系行。
- **根因**：使用关键词搜索代替正式表结构和 ID/关系 Schema 解析。
- **影响**：误报 Trace 已存在关系。
- **正确结论**：正式关系解析必须验证受控区段、列结构、关系类型、源 ID 和目标 Contract ID。
- **类防护**：`EXP-007`、`EXP-017`。

### ERR-035：`/compact` 不生成 checkpoint 的中间错误曾被当成“后来通过即可”

- **分类**：`HISTORICAL_DEBT / PROCESS_VIOLATION`
- **现象**：运行时验证中 `/compact` 完成但没有 checkpoint；早期处理倾向重复尝试而非立即形成治理缺陷。
- **根因**：把最终流程能继续与中间不变量是否满足混为一谈。
- **影响**：真实恢复/压缩能力缺口可能被掩盖。
- **正确结论**：任何中间错误即使后续成功，也必须记录、定位根因并补回归测试。
- **类防护**：`EXP-015`、`EXP-016`。

### ERR-036：Bun 运行环境在测试中被错误假定

- **分类**：`ENVIRONMENT_ERROR / HISTORICAL_DEBT`
- **现象**：测试出现 `ReferenceError: Bun is not defined` 和 `spawn bun ENOENT`。
- **根因**：测试运行器、进程 PATH、Bun 全局对象和 npm shim 的环境契约未显式建模。
- **影响**：daemon runtime installation/lifecycle 测试不能稳定跨环境运行。
- **正确结论**：运行时能力探测、可执行路径解析和测试环境注入必须显式化。
- **类防护**：`EXP-002`、`EXP-016`。

### ERR-037：Stage2 多版补丁重复失败但方法模型变化不足

- **分类**：`PROCESS_VIOLATION / SCRIPT_DEFECT`
- **现象**：v1～v7 多轮锚点、合并、尾随空格错误；版本号增加但错误机制未根本改变。
- **根因**：失败后继续修补同一技术路线，没有先重新分类和更换交付模型。
- **影响**：重复消耗用户时间。
- **正确结论**：同类失败一次后必须重建失败模型；两次后强制停止同路线，改用完整文件或精确证据包。
- **类防护**：`EXP-008`、`EXP-019`。

### ERR-038：文件下载与 SHA 验证命令本身多次失败

- **分类**：`SCRIPT_DEFECT`
- **现象**：文件实际完整，但验证命令因变量语法失败，反而增加不确定性。
- **根因**：把校验流程设计得比被校验对象更复杂。
- **影响**：用户重复下载、重复核验。
- **正确结论**：校验链必须最小化；文件存在、size、`certutil -hashfile` 原样输出即可，避免二次解析。
- **类防护**：`EXP-012`。


### ERR-039：经验门禁解析器只读取标题仍报告通过

- **日期与阶段**：2026-08-02，13 个历史失败取证阶段。
- **分类**：`EVIDENCE_DEFECT / SCRIPT_DEFECT / PROCESS_VIOLATION`
- **现场表现**：取证反馈同时出现 `EXPERIENCE_SECTIONS_FOUND=YES`、`APPLICABLE_EXPERIENCE_RULES=NONE_FOUND` 和 `REPEATED_ERROR_CHECK=PASS`。实际导出的第三、四部分各自只包含一级标题，没有包含任何 `EXP-*` 规则或检查项。
- **已执行与未执行**：证据包成功导出；经验规则没有被脚本实质读取；仓库未变化。
- **根因**：Markdown 分段器遇到任意下一级标题就结束当前一级章节，没有按标题层级寻找下一个同级章节；门禁又只验证“找到标题”，未验证章节正文和至少一条适用规则。
- **影响**：经验门禁可能假通过，后续修改看似遵守流程，实际上没有读取任何经验。
- **正确做法**：章节解析必须按标题层级截取；门禁必须同时验证正文非空、包含 `EXP-*`、适用规则至少一项。`NONE_FOUND` 与 `PASS` 不得同时出现。
- **新增防护**：增加经验文件结构回归测试；新增 `EXP-021`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-007`、`EXP-015`、`EXP-020`、`EXP-021`。

### ERR-040：治理能力升级后历史测试夹具未同步权威契约

- **日期与阶段**：2026-08-02，原 HEAD 13 个既有失败归因阶段。
- **分类**：`HISTORICAL_DEBT / VALIDATION_DEFECT`
- **现场表现**：4 个历史测试文件共有 13 个失败，归并为 5 类：
  1. 仍使用展示名 `Merge Runner`，而权威 Actor Role 已是 `merge_runner`；
  2. 断言旧 Write Guard 文案；
  3. 把 `fs.access()` 成功返回值固定断言为 `undefined`，与 Bun 当前返回 `null` 耦合；
  4. 仍按旧 Code Permission 输入和未展开输出断言；
  5. 完整生命周期夹具缺少声明式 Project Spec target、Close Gate 可解析的权威 tasks/trace、changed-files audit、Semantic Closure 及其 provenance；
  6. 第一轮夹具对齐遗漏了 `v11-e2e-test.test.ts` 中对 `updateWorkItemStatus(wiDir, 'closed')` 的直接调用，仍绕过唯一状态权威；
  7. 第二轮对齐后，`v11-section21-acceptance.test.ts` 的统一 `buildCompleteWI()` 夹具仍未通过真实 Gate Runner 生成 `gates/formal_version_gate.json`，导致 requirement/design/code-only 三条正向路径统一报 `close_formal_version_gate: status=missing`；
  8. 补上 Formal Version Gate 后，统一夹具仍用旧式自由文本 `verification_report.md`、不完整 Evidence 条目和不可解析的 changed-files audit，导致真实 `verification_gate` 失败，继而使 `formal_verification_gate` 与 `formal_hard_gate_verification_gate_json` 阻断全部正向路径。
- **已执行与未执行**：同一环境 A/B 已证明原 13 个失败在原 HEAD 和 PSV 补丁中完全一致；经验门禁、状态权威诊断、PSV 测试、`sf-state-transition`、`v11-e2e` 和 `v11-runtime-integration` 已通过；Section 21 的剩余失败已收敛为统一夹具未满足 Verification Governance Contract；生产 Verification/Formal Version Gate 未放宽。
- **根因**：生产 Contract、Actor Role、权限模型和 Close Gate 逐步收紧，但历史测试复制了字符串、消息、旧 API shape 和旧闭环文件布局，没有复用权威常量和标准夹具。
- **影响**：全量回归长期红灯，真实新回归被历史噪声淹没，开发者容易错误归因或绕过失败。
- **正确做法**：测试使用权威常量和结构化结果；存在性检查只断言“不抛错”；权限测试验证规范化语义；生命周期夹具由统一的 close-ready 构造器使用生产 `renderVerificationReport()`、完整 Evidence Manifest、可解析 changed-files audit，并通过真实 Gate Runner 生成 verification/formal-version 等权威报告，禁止手工伪造 Gate 通过文件。
- **新增防护**：同步历史测试文件；统一 close-ready 构造器使用正式 Verification Report Contract、完整 Evidence 对账和 changed-files audit，并运行 `verification_gate → formal_version_gate`；经验门禁固定检查 ERR-040 已登记 `close_formal_version_gate`、`verification_report_contract_valid` 和 `formal_hard_gate_verification_gate_json`；保留 `EXP-022`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-010`、`EXP-016`、`EXP-022`。

### ERR-041：补丁包与配套应用脚本来自不同冻结时点

- **日期与阶段**：2026-08-02，历史测试夹具修复包最终交付阶段。
- **分类**：`SCRIPT_DEFECT / PROCESS_VIOLATION / EVIDENCE_DEFECT`
- **现场表现**：补丁 ZIP 在最终调整后重新生成，但配套应用脚本仍保存前一版 ZIP 内文件哈希。两个文件各自可解析，却不属于同一个发布快照；若直接交付，应用脚本会在写入前因哈希不一致而失败。
- **已执行与未执行**：错误在交付给用户前通过最终哈希复核发现；用户仓库未变化；旧应用脚本未执行。
- **根因**：补丁 ZIP、应用脚本和哈希清单被当作三个独立文件顺序生成，没有“先冻结主产物，再由最终字节派生所有伴生产物”的原子发布流程；最后一次修改后只更新了部分产物。
- **影响**：造成重复下载和重复执行；削弱交付可信度。若校验较弱，还可能使脚本应用与其设计版本不一致的文件。
- **正确做法**：先冻结所有替换文件并生成最终 ZIP；再从 ZIP 的实际字节生成内部文件哈希、应用脚本常量和发布 Manifest；最后把 ZIP、脚本、Manifest 作为一个发布单元交叉校验。任一文件变化都必须整体重建，不允许局部续改。
- **新增防护**：增加发布单元冻结清单；应用脚本校验 ZIP 总哈希、文件集合和每个内部文件哈希；新增 `EXP-023` 及修改前检查项。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-013`、`EXP-015`、`EXP-023`。

### ERR-042：迁移脚本把目标状态要求错误地作为源状态前置条件

- **日期与阶段**：2026-08-02，历史测试夹具对齐补丁应用前检查阶段。
- **分类**：`SCRIPT_DEFECT / MIGRATION_CONTRACT_DEFECT / PROCESS_VIOLATION`
- **现场表现**：应用脚本在写入前读取当前旧经验文件，却要求其中已经存在只有新版本才会加入的 `APPLICABLE_EXPERIENCE_RULES` 字段，因此在零写入状态下报 `EXPERIENCE_GATE_APPLICABLE_RULES_CHECK_MISSING`。
- **已执行与未执行**：失败发生在补丁 ZIP 校验和任何文件写入之前；仓库保持原 13 文件状态；未创建备份、未应用文件、未回滚。
- **根因**：迁移脚本没有区分源状态契约与目标状态契约。把“应用后应成立”的目标结构要求错误地放进“应用前必须成立”的前置校验，形成永远无法从合法旧状态迁移到新状态的自相矛盾门禁。
- **影响**：合法旧版本无法升级；重复消耗用户操作；即使补丁内容正确，也会被错误前置条件阻断。
- **正确做法**：迁移脚本必须显式定义 `SOURCE_CONTRACT` 与 `TARGET_CONTRACT`。应用前只验证源版本真实具备的结构、哈希和最低语义；应用后再验证目标版本新增字段、数量和语义。任何只属于目标状态的条件不得出现在源状态前置检查中。
- **新增防护**：应用程序分离 `read_source_experience_gate` 与 `read_target_experience_gate`；分别用旧经验文件和新经验文件做内部自测；新增 `EXP-024` 和修改前检查项。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-007`、`EXP-014`、`EXP-015`、`EXP-022`、`EXP-024`。

### ERR-043：验证器把非权威反馈字段的字面值当成文档必备契约

- **日期与阶段**：2026-08-02，历史测试夹具对齐验证前置门禁阶段。
- **分类**：`VALIDATION_DEFECT / SCRIPT_DEFECT / CONTRACT_OVERFIT`
- **现场表现**：经验文件第三、四部分内容完整，包含 42 条错误、24 条经验和 38 项检查，但验证程序仍因第四部分没有出现字面量 `REPEATED_ERROR_CHECK=PASS` 而停止。该字段是运行反馈格式，不是经验文档已定义的必备正文。
- **已执行与未执行**：失败发生在任何测试运行之前；仓库仍为预定 14 文件范围；未修改文件、未安装、未提交、未操作 daemon/OpenCode。
- **根因**：验证器没有先确认某个字符串是否属于权威文档契约，就把运行时反馈字段、实现名称或示例文字硬编码为必备标记。它校验的是偶然字面，不是“已执行重复错误检查并完成归类”的真实语义。
- **影响**：合法目标状态被误判为失败；产生重复操作；新增门禁本身变成阻断正确流程的噪声。
- **正确做法**：先从权威文档提取结构、数量和明确规范条款；验证语义不变量，例如章节实质内容、规则 ID、检查项含义和逻辑一致性。只有当精确文本本身就是正式接口、标识符或规范条款时，才能做字面断言。运行反馈字段不得反向成为文档正文的隐式契约。
- **新增防护**：新增“重复错误检查已完成归类”的正式检查项；经验门禁测试验证 `ERR-043`、`EXP-025` 和该检查项；后续验证程序不再要求文档包含运行反馈字面量。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-007`、`EXP-008`、`EXP-015`、`EXP-021`、`EXP-025`。

### ERR-044：生产错误信息和注释仍描述已废止的双状态权威路径

- **日期与阶段**：2026-08-02，`v11-e2e` 剩余关闭路径失败归因阶段。
- **分类**：`PRODUCTION_DIAGNOSTIC_DEFECT / CONTRACT_DRIFT / DOCUMENTATION_DEFECT`
- **现场表现**：`updateWorkItemStatus('closed')` 正确阻止了文件系统绕过，但异常信息和源码注释仍宣称关键状态必须经过 `WorkflowEngine.transitionFull() + StateManager.transition()`。当前权威架构已明确 `StateManager/events.jsonl` 是唯一状态源，`sf_state_transition` 只调用 `StateManager.transition()`，并禁止 `workflowEngine.transitionFull()` 造成双状态写入。
- **已执行与未执行**：错误由真实测试失败中的异常文本暴露；关闭绕过确实被阻断；错误信息本身会误导测试和维护人员；仓库尚未提交、安装或运行 daemon/OpenCode。
- **根因**：状态权威从双写模型收敛到单一 `StateManager` 后，只更新了执行实现和部分测试，没有把生产错误信息、注释和示例纳入 Contract 消费者闭包。
- **影响**：维护人员会按错误提示重新引入已废止调用；测试可能复制错误架构；故障排查结论与真实执行路径相反。
- **正确做法**：生产异常信息、注释、帮助文本和示例都属于架构 Contract 消费者。权威路径变化时必须与生产入口、调用者和测试一起检索；诊断信息应明确指向 `sf_state_transition → StateManager.transition()`，不得保留已废止双写路径。
- **新增防护**：修正 `work-item-lifecycle-v11.ts` 的注释和异常文本；新增独立行为测试，验证关键状态拒绝信息包含 `sf_state_transition` 和 `StateManager.transition()`，且不包含 `WorkflowEngine.transitionFull()`；新增 `EXP-026` 和修改前检查项。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-022`、`EXP-026`。


### ERR-045：新测试夹具把兼容读取路径当作正式 Candidate 写入路径

- **日期与阶段**：2026-08-03，本地与远程差异审计、Section 21 最终验证前。
- **分类**：`VALIDATION_DEFECT / CONTRACT_DRIFT / COMPATIBILITY_PATH_MISUSE`
- **现场表现**：`v11-section21-acceptance.test.ts` 的统一夹具注释声称写入“authoritative Candidate tasks and trace artifacts”，但实际把新 `trace_delta.md` 写入 Work Item 根目录。目录权威明确该根级路径只用于 legacy 兼容读取，新写入必须使用 `candidates/trace_delta.md`。同时 `candidate_manifest.json` 未登记该 Trace Candidate，导致测试可以借助兼容读取回退绕开 Candidate Manifest 对账。
- **已执行与未执行**：问题在运行最终验证前通过本地/远程逐文件审计发现；尚未运行本轮测试、构建、安装、daemon/OpenCode、提交或推送。
- **根因**：为了让下游 Gate 读取到 Trace，夹具直接使用了兼容路径，没有沿“目录权威 → Candidate Manifest → Merge → Gate”的正式链路闭环；注释与实际写入路径也未对账。
- **影响**：测试即使通过，也不能证明新 WI 使用正式 Candidate Trace 链路；兼容读取机制可能掩盖 Candidate Manifest 漏项，形成假通过。
- **正确做法**：新夹具和新生产写入只能使用目录权威定义的 Candidate 路径；任何待合并 Trace 必须同时登记到 `candidate_manifest.json`，并由真实 Merge/Gate 消费。兼容路径只允许用于显式的旧项目只读兼容测试。
- **新增防护**：修正 Section 21 统一夹具；增加经验门禁断言，验证 `ERR-045`、`EXP-027` 和“兼容读取路径不得用于新写入”检查项。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-022`、`EXP-027`。

---

### ERR-046：外层一键 CMD 在启动包内脚本前失败但没有反馈

- **日期与阶段**：2026-08-03，Section 21 修正包首次执行阶段。
- **分类**：`SCRIPT_DEFECT / EVIDENCE_DEFECT / PROCESS_VIOLATION`
- **现场表现**：用户执行下载包对应的一键 CMD 后立即返回命令提示符，没有生成证据 ZIP，也没有任何 `FEEDBACK TO CHATGPT`。
- **已执行与未执行**：无法由原命令确认 ZIP 是否找到、是否解压、是否定位到 `RUN.cmd`；包内应用、测试、构建、安装、daemon、OpenCode、提交和推送均无完成证据。
- **仓库/环境是否变化**：现有证据不能证明仓库发生变化；按 fail closed 处理，不继续实施。
- **根因**：标准反馈只设计在包内 `RUN.cmd` 和 Python 程序中，包外的“检查下载文件→解压→定位入口”链路没有阶段输出和失败分支。任何一步在 `RUN.cmd` 启动前失败，用户只能看到静默返回。
- **影响**：无法区分下载文件名变化、解压失败、入口路径错误或解释器启动失败；用户重复执行仍不能提供可归因证据。
- **正确做法**：外层 CMD 也必须是可观察的启动协议。至少输出包检查、解压和进入 `RUN.cmd` 三个阶段；下载文件不存在或解压失败时直接输出完整最小反馈。包内 `RUN.cmd` 第一行输出启动标记，并在解释器入口失败时输出退出码。
- **新增防护**：补充 `EXP-028`；修改命令交付检查；顶层 `RUN.cmd` 增加启动标记；交付命令对 ZIP 不存在和解压失败分别输出标准反馈。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-002`、`EXP-007`、`EXP-008`、`EXP-012`、`EXP-015`、`EXP-021`、`EXP-023`、`EXP-028`。


### ERR-047：统一测试夹具把审批前与合并后阶段折叠到同一个构造步骤

- **日期与阶段**：2026-08-03，Section 21 Canonical Trace 修正后的首次完整验证。
- **分类**：`VALIDATION_DEFECT / LIFECYCLE_ORDER_DEFECT / CONTRACT_DRIFT`
- **现场表现**：`buildCompleteWI()` 先生成 Candidate Gate Summary 并记录 User Decision，随后又在真实 Merge 之前运行 `verification_gate → formal_version_gate`。`runRequiredGates()` 会重写 `gate_summary.md`，因此 Merge 校验发现 `user_decision.gate_summary_hash` 与当前摘要不一致并正确阻断。
- **已执行与未执行**：前 7 个测试文件通过；Section 21 中 requirement_change_path 的真实 Merge 失败；TypeScript、构建、diff check 和最终范围审计未继续；仓库保持预期 15 文件范围，未安装、未提交、未操作 daemon/OpenCode。
- **根因**：历史夹具把“构造 close-ready 文件”和“执行真实生命周期”混成一个 helper，没有保持 `Candidate Gate → User Decision → Merge → Verification/Formal Version → Close` 的阶段边界。为了提前准备 Close 证据，把本应合并后的 Gate 放到了 Merge 前。
- **影响**：合法审批被夹具自己失效；测试不能证明真实生命周期；若按测试错误顺序修改生产校验，会削弱 Merge 对审批对象不可变性的保护。
- **正确做法**：审批摘要生成后，在 Merge 完成前不得运行会重写该摘要的后置 Gate。需要真实 Merge 的场景必须延迟 Verification/Formal Version，先由 Merge 校验审批哈希，再运行合并后 Gate。测试 helper 必须显式表达阶段，不得用“complete”名称掩盖时序差异。
- **新增防护**：Section 21 helper 增加 `deferPostMergeGates`；requirement_change_path 在真实 Merge 后运行 Verification/Formal Version；经验门禁增加生命周期顺序检查；新增 `EXP-029`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-011`、`EXP-015`、`EXP-016`、`EXP-022`、`EXP-029`。

### ERR-048：测试直接调用底层 runGate 绕过正式 Gate 编排与治理叠加

- **日期与阶段**：2026-08-03，Section 21 code_only_fast_path Close 失败归因阶段。
- **分类**：`VALIDATION_DEFECT / ORCHESTRATION_BYPASS / CONTRACT_DRIFT`
- **现场表现**：code_only_fast_path 夹具直接调用 `runGate('close_gate')`。该底层函数只执行基础 Close 检查，不经过 `runRequiredGates()` 的治理叠加，因此没有应用快速路径对 Trace Candidate 不适用项的正式过滤，Close 被错误判定为失败。
- **已执行与未执行**：基础 Close 返回 failed；同一文件其他 35 项通过；未继续类型检查、构建和提交。
- **根因**：测试把底层可复用 Gate primitive 当成产品正式执行入口，没有核对生产 Tool 使用的是 `runRequiredGates()`，也没有验证编排层承担的报告落盘、Gate Summary 和 workflow-specific overlay。
- **影响**：测试结果与真实产品入口不一致；可能诱导修改基础 Close Contract 来迎合快速路径，从而影响其他 Workflow。
- **正确做法**：凡依赖 Gate 编排、治理叠加、报告落盘或 workflow-specific 规则的场景，测试必须通过 `runRequiredGates()` 或正式 handler 执行。底层 `runGate()` 只用于明确验证基础 Gate primitive 的单元测试。
- **新增防护**：Section 21 的 Close 场景统一通过 Gate Chain 执行；静态验证禁止该文件直接调用 `runGate('close_gate')`；与 ERR-047 共用 `EXP-029`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-011`、`EXP-015`、`EXP-016`、`EXP-022`、`EXP-029`。

### ERR-049：Close Gate 检查项升级后快速路径豁免消费者仍使用旧 check_id

- **日期与阶段**：2026-08-03，Section 21 生命周期顺序与 Gate Chain 修复后的第二次完整验证。
- **分类**：`PRODUCT_DEFECT / ORCHESTRATION_CONTRACT_DRIFT / CONSUMER_CLOSURE_DEFECT`
- **现场表现**：Section 21 使用正式 `runRequiredGates(['close_gate'])` 后，`code_only_fast_path` 仍被 `Authoritative trace_delta artifact is present` 阻断。基础 Close Gate 已把 Trace 权威检查升级为 `close_artifact_trace_delta_authoritative`，但 Gate Chain 的快速路径过滤仍只排除旧的 `close_file_trace_delta_md` 和 `close_trace_delta_valid`。
- **已执行与未执行**：Section 21 共 37 项，36 通过、1 失败；失败发生在快速路径 Close。TypeScript、构建、diff check 和最终范围审计未继续；仓库保持预期 15 文件范围，未安装、未提交、未操作 daemon/OpenCode。
- **根因**：Close Gate 是检查项生产者，Gate Chain 是按 `check_id` 实施工作流豁免的消费者。生产者重构检查结构时没有沿结构化接口消费图同步过滤器，旧 ID 仍存在于消费者中但已不能覆盖当前检查。
- **影响**：不修改 Project Spec 的合法快速路径无法 Close；问题位于真实产品编排层，不是测试夹具。若删除基础 Close 的 Trace 权威检查，会错误削弱所有规格变更 Workflow。
- **正确做法**：保留基础 Close Gate 的严格检查，只在正式 Gate Chain 中对 `code_only_fast_path` 排除全部 Trace Delta 专属检查；把过滤语义提取为单一函数，并同时用独立单元测试和 Section 21 行为测试证明“只豁免 Trace，不豁免 tasks、verification、evidence、permission 和 audit”。
- **新增防护**：修改 `gate-chain.ts` 的快速路径过滤；新增 `code-only-close-gate-overlay.test.ts`；经验门禁增加结构化 check ID 消费闭包检查；新增 `EXP-030`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-010`、`EXP-015`、`EXP-017`、`EXP-022`、`EXP-030`。

### ERR-050：快速路径规则修复落在可绕过的 Gate Chain，正式 Close Handler 未消费

- **日期与阶段**：2026-08-03，V4 快速路径 Close 修复后的完整验证。
- **分类**：`PRODUCT_DEFECT / ARCHITECTURE_RESPONSIBILITY_DEFECT / CONSUMER_CLOSURE_DEFECT`
- **现场表现**：V4 已在 `gate-chain.ts` 中过滤 `code_only_fast_path` 的 Trace Delta 检查，独立过滤单元测试通过，但 Section 21 仍在 Close 阶段失败。进一步取证确认：`sf_v11_gate_run` 会携带 `workflowPath` 进入 Gate Chain；正式 `sf_v11_close_gate` 却直接调用 `runCloseGate({ workItemId, workItemDir, projectRoot })`，不会经过 Gate Chain，也不会传入 `workflowPath`。
- **已执行与未执行**：V4 前 8 个测试文件通过；Section 21 为 36 通过、1 失败；TypeScript、构建、diff check 和最终范围审计未继续。仓库保持预期 17 文件范围，未安装、未提交、未操作 daemon/OpenCode。
- **根因**：修改前只检查了一个编排入口，没有列出全部生产入口和共同责任层。业务规则被放在可选的上层 Gate Chain，而不是所有入口共同调用、且已经读取权威 `work_item.json` 的 `close-gate.ts`。V4 单元测试只验证过滤函数，未证明正式 Close Handler 消费该规则。
- **影响**：正式 `sf_close_gate` 与 Gate Chain 对同一 Workflow 形成两套行为；快速路径仍不能通过真实关闭入口；继续在 Gate Chain 增加过滤会扩大第二规则源。
- **正确做法**：由 `close-gate.ts` 从权威 `work_item.json` 读取 Workflow，统一决定 tasks 与 Trace Delta 的适用性。`code_only_fast_path` 必须保留 tasks、verification、evidence、permission、audit 和 semantic closure，仅不要求 Trace Delta。Gate Chain 不再复制或过滤 Close Gate 的 Workflow 规则。
- **新增防护**：在 Close Gate 增加单一适用性函数；独立测试同时验证快速路径、规格变更路径和无代码路径；Section 21 行为回归证明正式链路；经验门禁增加责任层检查；新增 `EXP-031`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-010`、`EXP-015`、`EXP-017`、`EXP-022`、`EXP-030`、`EXP-031`。


### ERR-051：最终验证证据包未包含完整变更内容，无法完成提交前架构与契约审计

- **日期与阶段**：2026-08-03，V5 全部自动化验证通过后的提交前最终对账。
- **分类**：`EVIDENCE_DEFECT / VALIDATION_DEFECT / PROCESS_VIOLATION`
- **现场表现**：V5 证据包包含执行摘要、测试日志、`git status` 和 `git diff --stat`，但没有完整 tracked diff，也没有 6 个 untracked 文件的正文、基线对应关系和统一 SHA256 清单。路径数量为 18、测试与构建通过，只能证明执行范围和工程结果，不能证明每个待提交字节符合架构、契约和修改范围。
- **已执行与未执行**：9 个目标测试、TypeScript、daemon-core build、全仓 deterministic build、`git diff --check` 和 18 文件路径审计已通过；install、daemon、OpenCode、commit、push 均未执行。最终架构对账、契约对账和提交授权未完成。
- **根因**：验证器把“命令执行证据”和“可复核变更证据”混为一体，只保存摘要与日志，没有把全部变更文件字节、tracked 基线字节、untracked 正文和完整 diff 作为最终证据合同。
- **影响**：无法在仓库外重建并审查完整待提交变更；未跟踪文件可能在未被内容审计的情况下进入提交；即使测试通过，也不能满足 `GOV-POST-001` 和 `GOV-EVID-001` 的提交前证据边界。
- **正确做法**：最终证据包必须同时包含全部变化路径的当前文件字节、tracked 文件的 HEAD 基线字节或 blob/hash、untracked 文件全文、完整统一 diff、逐文件 SHA256/size/status 清单、Git 状态、测试/类型/构建日志和未执行动作。任一项缺失时必须在 commit 前 fail closed。
- **新增防护**：增加完整变更证据收集器；经验门禁验证该要求；证据包能够在仓库外逐文件复核并重建差异；新增 `EXP-032`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-004`、`EXP-007`、`EXP-015`、`EXP-020`、`EXP-023`、`EXP-032`。

### ERR-052：工程验证通过后当前状态文档仍保留验证前或互相冲突的阶段描述

- **日期与阶段**：2026-08-03，V6 完整变更证据审计后的提交前文档对账。
- **分类**：`DOCUMENTATION_DEFECT / EVIDENCE_DEFECT / PROCESS_VIOLATION`
- **现场表现**：9 个目标测试、TypeScript、两级构建、`git diff --check` 和 18 文件完整证据审计均已通过，但 `P0-project-spec-version-binding-defect.md` 仍标记为“待仓库验证”；`current-handoff.md` 同时保留“仓库内验证和提交尚未完成”与“实现、验证、提交和远程同步已完成”的互斥描述，并把已独立批准修改的 `gate-chain.ts` 继续列为当前绝对禁止范围。
- **已执行与未执行**：仓库工程验证和完整变更审计已完成；install、daemon、OpenCode、commit、push 仍未执行；文档同步前不得提交。
- **根因**：最终验证流程只把测试、构建和文件字节纳入证据合同，没有把“当前状态、已完成、未完成、下一步和冻结范围”视为必须消费最终证据的治理投影。
- **影响**：新会话可能按旧阶段重复工作或跳过未完成步骤；同一文件中的互斥状态会破坏基线和范围判断；提交后的实现事实与交接、缺陷状态分裂。
- **正确做法**：最终提交前必须以同一份验证证据逐项对账所有当前状态文档，明确区分仓库验证、提交、安装和真实项目重验四个阶段；历史冻结范围必须标注所属缺陷，不能被解释为阻断后续独立缺陷修复。
- **新增防护**：同步 PSV 缺陷状态和当前交接；经验门禁验证最终状态文档对账要求；新增 `EXP-033`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-003`、`EXP-007`、`EXP-015`、`EXP-016`、`EXP-020`、`EXP-032`、`EXP-033`。



### ERR-053：状态迁移脚本在识别源状态前先执行目标状态语义门禁

- **日期与阶段**：2026-08-03，V7 最终状态文档对账包应用前检查。
- **分类**：`SCRIPT_DEFECT / MIGRATION_CONTRACT_DEFECT / VALIDATION_DEFECT`
- **现场表现**：仓库仍处于合法 V6 源状态，四个目标文件均未写入；V7 的 `apply.py` 却在判断 `SOURCE_CONTRACT` 或 `TARGET_CONTRACT` 之前，先要求源文档包含目标状态才会新增的状态值、测试数量和待提交清单，因此报 `REQUIRED_MARKER_MISSING`。
- **已执行与未执行**：失败发生在任何仓库写入、备份、测试、类型检查和构建之前；`PATCH_FILES_APPLIED=0/4`；install、daemon、OpenCode、commit、push 均未执行。
- **根因**：虽然脚本已经定义源哈希与目标哈希，但语义门禁仍只有一套 `required_markers`，并在状态分类之前执行。结构上存在 SOURCE/TARGET，执行顺序仍把目标语义反向施加给源状态，重复了 `ERR-042 / ERR-043` 的错误机制。
- **影响**：合法源版本无法迁移；正确的目标补丁被错误前置条件阻断；脚本表面符合双契约要求，实际仍不具备可达的迁移路径。
- **正确做法**：必须先以源/目标文件哈希识别当前状态；SOURCE 状态只执行 `source_required_markers`，TARGET 状态只执行 `target_required_markers`。目标标记只能在写入完成后或确认已经处于目标状态后检查。状态未知时 fail closed。
- **新增防护**：V8 将状态分类置于语义门禁之前；Manifest 分离源标记与目标标记；内部自检分别用 V6 源文件和 V8 目标文件验证；新增 `EXP-034`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-007`、`EXP-015`、`EXP-021`、`EXP-024`、`EXP-025`、`EXP-034`。



### ERR-054：状态对账包成功后交接文件仍把本包已完成动作列为下一步

- **日期与阶段**：2026-08-03，V8 最终状态对账和完整验证成功后的提交前审计。
- **分类**：`DOCUMENTATION_DEFECT / PROCESS_VIOLATION / TARGET_STATE_MODEL_DEFECT`
- **现场表现**：V8 已成功完成状态文档写入、9 个目标测试、TypeScript、两级构建、`git diff --check` 和 18 文件完整证据审计，但 `current-handoff.md` 仍把“完成当前状态文档同步并复跑同一验证集”列为当前下一步。
- **已执行与未执行**：V8 仓库验证已经全部通过；commit、push、install、daemon、OpenCode 和 WorkDesk 重验未执行。
- **根因**：补丁目标文件描述的是“运行 V8 之前的待执行状态”，而不是“V8 成功结束后的目标状态”。验证器只检查目标标记存在，没有检查成功后下一步是否仍重复本轮动作。
- **影响**：新会话会重复已经完成的状态同步和验证；当前交接与同一份成功证据相差一个阶段；提交前状态无法作为可靠治理投影。
- **正确做法**：状态对账包的目标文档必须直接描述成功结束后的目标状态。脚本失败时回滚目标文件；脚本成功时，交接的下一步必须从尚未执行的动作开始。
- **新增防护**：交接文件改为从“用户暂存、提交并推送”开始；经验门禁测试同时断言成功目标中不存在本轮已完成动作；新增 `EXP-035`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-003`、`EXP-007`、`EXP-015`、`EXP-033`、`EXP-035`。

### ERR-055：经验前置门禁只同步到交接和用户级模板，遗漏仓库根 AGENTS 入口

- **日期与阶段**：2026-08-03，V8 完整变更消费者对账。
- **分类**：`CONSUMER_CLOSURE_DEFECT / DOCUMENTATION_DEFECT / PROCESS_VIOLATION`
- **现场表现**：经验文件、`current-handoff.md` 和 `setup/userlevel-opencode/AGENTS.md` 已声明修改前经验门禁，但仓库根 `AGENTS.md` 仍没有经验文件路径、`EXPERIENCE_FILE_READ`、适用规则和重复错误检查要求。
- **已执行与未执行**：经验门禁测试只覆盖经验文件、交接文件和部分标记，没有读取仓库根 `AGENTS.md`；仓库根入口尚未修改。
- **根因**：新规则同步时没有列出所有实际入口消费者，把用户级安装模板误当成仓库自身直接开发入口的完整替代。
- **影响**：只读取仓库根规则的直接开发工具可能不知道经验前置门禁；“强制预读”在不同入口形成不同执行结果。
- **正确做法**：产品开发强制规则必须同步到仓库根 `AGENTS.md`、当前交接、经验权威文件和需要该规则的用户级模板；自动测试必须覆盖所有入口。
- **新增防护**：根 `AGENTS.md` 增加经验前置门禁；经验门禁测试读取根入口和用户级模板并验证相同核心字段；新增 `EXP-036`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-020`、`EXP-036`。


### ERR-056：包含“待提交”状态的当前文档在提交成功后没有执行提交后对账

- **日期与阶段**：2026-08-03，`95befe8` 提交和远程同步完成后的证据审计。
- **分类**：`DOCUMENTATION_DEFECT / PROCESS_DESIGN_DEFECT / POST_COMMIT_RECONCILIATION_DEFECT`
- **现场表现**：提交和推送已经成功，本地与远程均为 `95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`、工作区干净；但该提交中的 `current-handoff.md` 和 `P0-project-spec-version-binding-defect.md` 仍写着“当前本地未提交”“待提交并推送”和“remains uncommitted”。
- **已执行与未执行**：19 文件实现、106 项测试、TypeScript、两级构建、提交和推送均已完成；用户级安装、daemon、OpenCode 和 WorkDesk 重验尚未执行。
- **根因**：状态文档包含只有提交成功后才能确定的 commit SHA、远程同步和 clean worktree 事实，却试图在同一个实现提交中一次性收口；发布流程缺少提交成功后的窄范围状态对账步骤。
- **影响**：远程 `main` 自身记录与真实 Git 状态相差一个阶段；新会话可能重复提交动作，或错误判断产品尚未进入安装前置阶段。
- **正确做法**：凡状态文档需要记录实现 commit SHA、推送结果或提交后工作区状态，必须采用两阶段闭环：先提交已验证实现，再根据提交证据执行窄范围状态对账并形成后续提交。状态对账文件只能记录被对账的实现提交，不得试图写入包含自身内容的“当前提交 SHA”；当前远程 HEAD 必须在新会话中实时读取。提交后对账必须只描述尚未执行的安装和真实项目复测。
- **新增防护**：同步 PSV 实施文件和当前交接；经验门禁测试验证远程基线、提交 SHA、已完成提交动作和下一阶段安装前置事项，并禁止保留“用户暂存、提交并推送当前 19 文件变更”等过期描述；新增 `EXP-037`。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-003`、`EXP-007`、`EXP-015`、`EXP-033`、`EXP-035`、`EXP-037`。


### ERR-057：进程存活检查命令执行失败仍被解释为 daemon 未运行

- **日期与阶段**：2026-08-03，V13 用户级升级证据复核。
- **分类**：`SCRIPT_DEFECT / EVIDENCE_DEFECT / ENVIRONMENT_ERROR`
- **现场表现**：升级脚本通过 `cmd.exe` 执行 `tasklist /FI "PID eq 33268" /FO CSV /NH` 时返回“无效参数/选项”，但进程检查函数仍把命令失败解释为 `daemon_running=false`，最终反馈将该结果作为升级前置证据。
- **已执行与未执行**：用户已按要求手工停止 daemon 和 OpenCode；升级、119 文件一致性校验和 Manifest 完整性校验均成功。完整 `tasklist /FO CSV /NH` 快照中未出现握手文件记录的 PID，因此现有独立证据支持当时未发现该进程；但失败的 PID 过滤命令本身不能作为“未运行”的证明。
- **根因**：布尔判断只检查输出是否包含 PID，没有先要求进程查询命令成功；同时把含嵌套引号的 Windows 命令经 `cmd.exe /c` 再解释，未验证最终参数。
- **影响**：如果真实 daemon 仍在运行，失败的查询可能被错误降级为“未运行”，使升级或清理操作越过用户手工生命周期边界。
- **正确做法**：进程不存在结论必须来自成功且可解析的完整进程快照。Windows 上优先直接执行 `tasklist.exe /FO CSV /NH`，按 CSV 解析一次快照，再用握手 PID和明确进程名交叉核对；命令失败、CSV 不可解析、PID 不明确时必须 `INSUFFICIENT_EVIDENCE` 并 fail closed。
- **新增防护**：新增 `EXP-038`；后续脚本禁止把非零退出码解释为进程不存在；WorkDesk 前置审计使用单次完整进程快照，同时输出匹配 PID、进程名和解析状态。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-002`、`EXP-007`、`EXP-015`、`EXP-018`、`EXP-038`。


### ERR-058：Git porcelain 输出被整体裁剪后首个文件路径丢失首字符

- **日期与阶段**：2026-08-04，V14 应用后范围审计。
- **分类**：`SCRIPT_DEFECT / EVIDENCE_DEFECT / PROCESS_VIOLATION`
- **现场表现**：V14 已写入4个目标文件后，范围检查把首个路径 `docs/implementation/architecture-consistency/P0-project-spec-version-binding-defect.md` 解析成 `ocs/implementation/architecture-consistency/P0-project-spec-version-binding-defect.md`，因此报 `POST_APPLY_SCOPE` 失败。
- **已执行与未执行**：4个目标文件曾进入写入阶段；异常处理包含4文件恢复逻辑，但 V14 没有输出回滚后哈希和 Git 状态验证，所以当前本地实际状态在下一轮检查前为 `INSUFFICIENT_EVIDENCE`。测试、类型检查、构建和 WorkDesk 审计均未执行。
- **根因**：通用 `git_text()` 对完整 `git status --porcelain=v1` 输出调用 `.strip()`。首行合法状态为 ` M <path>`，整体裁剪删除了最前面的状态空格；后续固定使用 `line[3:]` 取路径时又删除了路径首字符。展示层的空白规范化错误地作用于机器结构化协议。
- **影响**：合法范围会被误报；更严重时也可能把真实范围外文件变形成另一个路径，破坏修改范围审计的可信度。
- **正确做法**：机器读取 Git 状态必须使用 `git status --porcelain=v1 -z -uall`，直接解析原始 bytes 和 NUL 分隔记录；不得对完整输出做 `.strip()`、行尾归一化或展示层清理。解析器必须验证两字节状态、分隔空格、路径非空，并对 rename/copy 等额外记录显式处理或 fail closed。
- **新增防护**：新增 `EXP-039`；V15 在任何仓库写入前运行真实临时 Git 仓库回归，证明首行 ` M docs/...`、未跟踪文件和含空格路径均能完整解析；应用程序先识别精确 SOURCE、V14_TARGET 或 V15_TARGET 状态，混合状态停止。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-002`、`EXP-007`、`EXP-013`、`EXP-015`、`EXP-021`、`EXP-039`。


### ERR-059：历史观测日志命中被误判为 Work Item 的正式外部引用

- **日期与阶段**：2026-08-04，V15 WorkDesk WI-0003 清理前置审计。
- **分类**：`EVIDENCE_DEFECT / VALIDATION_DEFECT / PROCESS_VIOLATION`
- **现场表现**：审计脚本在 `.specforge/**` 中搜索字面量 `WI-0003`，得到109个命中文件，并统一归类为“外部引用”，从而阻断清理。完整证据显示：8个是 WI-0003 自身文件，2个是 Runtime 状态文件，99个是 observability 索引、调用记录和按哈希保存的历史 payload；Project Spec、Module Design、Contract、Trace、其他 Work Item 和业务代码中的正式引用为0。
- **已执行与未执行**：V15 只读审计成功；未修改 WorkDesk，未清理 WI-0003，未启动 daemon/OpenCode。用户级安装保持119/119一致。
- **根因**：把文本命中等同于正式依赖，没有先按文件角色、权威级别和生命周期语义分类。历史日志承担审计证据职责，但不是可驱动当前治理状态的活跃引用。
- **影响**：合法恢复被大量日志噪声阻断；反方向也可能因忽略真正权威文件角色而误删正式状态或消费者关系。
- **正确做法**：引用审计必须至少区分：WI 自身产物、Runtime 权威状态、不可变历史日志、Project/Module 正式规格、其他 WI 活跃引用和普通业务文件。只有 Project/Module 正式规格、其他活跃 WI、Runtime 活跃状态或明确的业务消费者引用能够阻断清理；observability 和 payload 必须保留，但其存在本身不构成活跃依赖。
- **新增防护**：新增 `EXP-040`；V16 输出逐类计数、正式阻断引用清单和历史证据清单，并单独审计 Runtime 当前状态与 WI 编号分配来源。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-001`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-021`、`EXP-040`。


### ERR-060：把内容中性的 Git `M` 状态当成必须通过 index 刷新清除的业务变更

- **日期与阶段**：2026-08-04，V17 WorkDesk 恢复准备。
- **分类**：`SCRIPT_DEFECT / EVIDENCE_DEFECT / PROCESS_VIOLATION`
- **现场表现**：4个 WorkDesk 跟踪文件在 `git status --porcelain` 中显示 ` M`。V17 已证明它们的 HEAD 与工作区内容一致、普通 `git diff --binary` 为空，但仍执行 `git add --refresh` 并要求 `M` 必须消失。命令返回0后状态未消失，脚本因此在 `WORKDESK_INDEX_REFRESH` 失败。
- **已执行与未执行**：SpecForge 4文件补丁、经验门禁测试、TypeScript检查、daemon-core构建、全仓构建、`git diff --check` 和 installer verify 均通过；未提交、未推送。WorkDesk index refresh 没有暂存文件，也没有改变项目文件；daemon/OpenCode 保持停止。
- **根因**：脚本把 porcelain 的 stat/index 状态与 Git 正式内容差异混为一体，并错误假设 `git add --refresh` 返回0就必须清除显示状态。Windows 文件时间、大小缓存、换行过滤或 index stat 元数据可以让 porcelain 显示 `M`，但不代表规范化 blob 或业务内容发生变化。
- **影响**：为了追求表面 clean 状态而修改 index，会越过“WorkDesk 不写入”的批准边界；也会让真实恢复被无业务影响的状态显示阻断。
- **正确做法**：对每个预期的 stat-only 路径同时验证：未暂存、`git diff --quiet -- <path>` 返回0、`git hash-object --path=<path> <path>` 等于 `git rev-parse HEAD:<path>`。全部成立时标记 `STAT_ONLY_CONTENT_NEUTRAL`，保留原 porcelain 状态并继续；任何一项不成立都必须 fail closed。禁止仅为让 `git status` 变干净而刷新 index、重写文件或改变换行。
- **新增防护**：新增 `EXP-041`；V18 不调用 `git add --refresh` 或 `git update-index`，仅以 Git规范化 blob和空 diff双重证明内容中性，并把4个状态与8个 WI 文件分别报告。
- **状态**：`FIXED_PENDING_VALIDATION`。
- **类防护**：`EXP-007`、`EXP-013`、`EXP-015`、`EXP-017`、`EXP-018`、`EXP-039`、`EXP-041`。


### ERR-061：运行边界前置条件在写入之后检查

- **日期与阶段**：2026-08-04，V19 第一次执行。
- **分类**：`SCRIPT_DEFECT / PROCESS_VIOLATION / SCOPE_GOVERNANCE_DEFECT`
- **现场表现**：V19 先把5个治理文件写入工作区，随后才检查 daemon/OpenCode，最终因进程仍在运行而失败。反馈同时出现 `PATCH_ACTION=APPLIED` 和 `FAILED_STAGE=PROCESS_BOUNDARY`。
- **已执行与未执行**：5个目标文件已写入；测试、构建、WorkDesk审计、提交和推送均未执行；WorkDesk未写入。
- **根因**：不可变前置条件和可变写入阶段顺序颠倒。进程边界、远程基线、分支、HEAD、暂存区和允许源状态本应在第一次仓库写入前全部验证。
- **影响**：失败运行会留下部分已应用状态，破坏“前置条件失败即零写入”的治理承诺，并增加后续恢复和证据解释成本。
- **正确做法**：所有不可变前置条件必须先完成并形成证据，再允许第一次写入。前置条件失败时必须报告 `PREWRITE_MUTATION=NONE`。写入之后只能执行后置验证，不能再把本应前置的条件作为首次检查。
- **新增防护**：V20 在调用应用逻辑前先验证 daemon/OpenCode、远程HEAD、本地分支/HEAD、暂存区和精确源状态；应用逻辑内部再次验证基线，形成双重防护。
- **状态**：`CLOSED_V22_VALIDATED`。
- **类防护**：`EXP-002`、`EXP-007`、`EXP-015`、`EXP-020`、`EXP-042`。


### ERR-062：精确目标状态在干净工作区要求之后识别，导致失败运行不可重入

- **日期与阶段**：2026-08-04，V19 第二次执行。
- **分类**：`SCRIPT_DEFECT / RECOVERY_DEFECT / EVIDENCE_DEFECT`
- **现场表现**：第一次运行已经精确写入5个V19目标文件。用户停止 daemon/OpenCode 后重跑，脚本在比较文件哈希前先要求工作区完全干净，因此把自身精确目标状态拒绝为 `SOURCE_WORKTREE`。
- **已执行与未执行**：第二次运行零写入；远程、本地和验证流程均未继续。
- **根因**：脚本只定义了“干净源状态”，没有把“精确已应用目标状态”建模为合法可恢复状态；状态分类顺序又晚于通用 clean 检查。
- **影响**：任何写入后中断都无法安全续跑，只能依赖人工判断或重新打包，违反确定性和失败关闭要求。
- **正确做法**：在写入前基于分支、HEAD、暂存区、porcelain路径集合和每个批准文件哈希分类精确状态。允许 `CLEAN_SOURCE`、`EXACT_PREVIOUS_TARGET`、`EXACT_CURRENT_TARGET`；混合状态或额外路径一律停止。目标状态允许继续验证，但不得掩盖额外修改。
- **新增防护**：V20 先分类精确 V19/V20 目标状态，再决定应用或直接验证；同一个包可重复运行，任何额外路径、暂存内容或混合哈希均 fail closed。
- **状态**：`CLOSED_V22_VALIDATED`。
- **类防护**：`EXP-007`、`EXP-013`、`EXP-015`、`EXP-021`、`EXP-042`。


### ERR-063：实施状态文档重构后保留了已经失效的固定文本断言

- **日期与阶段**：2026-08-04，V20 经验门禁测试。
- **分类**：`TEST_DEFECT / DOCUMENT_SYNC_DEFECT / REGRESSION_DEFECT`
- **现场表现**：V19 将交接文件的“当前下一项完整工作”整体替换为真实验证后的下一阶段，但经验门禁仍要求旧段落中的固定文本 `保留 WorkDesk文件与index原状`。V20 已正确识别 `EXACT_V19_TARGET`、完成零写入进程前置检查并应用5个目标文件，随后在该过期断言失败。
- **已执行与未执行**：V20 写入5个精确目标文件；经验门禁失败后，TypeScript、构建、WorkDesk只读审计、提交和推送均未执行。daemon/OpenCode已证明停止，WorkDesk未写入。
- **根因**：重构实施状态文档时只更新了主要结论，没有同步审计所有依赖该段落的固定文本断言；测试验证的是历史措辞而不是仍需保留的治理事实。
- **影响**：文档结构合法更新会被无效断言阻断；如果简单删除断言，又可能丢失“不得为获得clean展示修改WorkDesk文件或index”的关键治理事实。
- **正确做法**：文档重构必须建立“事实—文本—测试”对账表。稳定治理事实应在当前状态文档中保留明确表述，测试断言当前事实而不是已被替换的段落位置。删除或迁移文本时必须扫描全部消费者，并对所有 `toContain` / schema / selector / parser 依赖做同步审计。
- **新增防护**：新增 `EXP-043`；V21 在当前交接的V19/V20执行事实中恢复明确的“WorkDesk文件和index保持原状”事实，同时门禁新增ERR-063/EXP-043检查，并在打包阶段静态交叉验证所有文档 `toContain` / `not.toContain` 断言。
- **状态**：`CLOSED_V22_VALIDATED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-013`、`EXP-015`、`EXP-021`、`EXP-043`。


### ERR-064：验证器要求生产者契约中不存在的 `trigger_result.project_spec_version`

- **日期与阶段**：2026-08-04，V21 WorkDesk 只读审计。
- **分类**：`VALIDATION_DEFECT / CONTRACT_CONSUMER_DEFECT / EVIDENCE_DEFECT`
- **现场表现**：经验门禁、TypeScript、daemon-core build、全仓 build、`git diff --check` 和 installer verify 全部通过；WorkDesk 状态范围也通过。随后校验器要求 WI-0004 `trigger_result.json` 包含 `project_spec_version=PSV-0002`，但真实文件只有 `schema_version`、`work_item_id`、`workflow_path`、`classification`、`match_results` 和 `selected_at`，因此在 `WI0004_TRIGGER_SPEC` 失败。
- **已执行与未执行**：V21 3个目标文件已写入，总工作区仍是批准的5文件；WorkDesk未写入；Project/Module/Contract/Trace基线审计尚未执行；提交和推送未执行。
- **根因**：验证器没有从实际生产者和正式文件职责推导断言，而是把 Project Spec Version 在多个产物间重复存在当成当然要求。`initializeClosureFiles` 的真实生产契约明确：`trigger_result.json` 保存路径选择骨架；权威创建基线写入 `candidate_manifest.base_spec_version`。
- **影响**：合法产物被错误拒绝；更严重的是会推动在多个文件中重复存储同一权威字段，制造双写和状态漂移。
- **正确做法**：每个验证断言必须绑定真实生产者、正式 schema 或权威规则。Project Spec Version Binding 的验收对象是 `candidate_manifest.base_spec_version`，并辅以 Project `spec_manifest.json` 和 Runtime 创建成功证据；不得要求 `trigger_result.json` 复制该字段。`trigger_result` 只校验其真实职责字段和类型。
- **新增防护**：新增 `EXP-044`；V22 同时读取本地生产者源码和真实 WI-0004 文件，校验 trigger skeleton 与 candidate baseline 的职责分离，并在打包阶段禁止校验脚本再次出现 `trigger.get("project_spec_version")`。
- **状态**：`CLOSED_V22_VALIDATED`。
- **类防护**：`EXP-001`、`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-021`、`EXP-044`。


### ERR-065：最终验证成功后当前交接仍停留在“待验证”状态

- **日期与阶段**：2026-08-04，V22证据审计与提交前对账。
- **分类**：`DOCUMENT_SYNC_DEFECT / DELIVERY_DEFECT / EVIDENCE_DEFECT`
- **现场表现**：V22 已完成经验门禁、TypeScript、两级构建、`git diff --check`、installer verify、WorkDesk状态和Project基线审计，最终结果为 `SUCCESS`；但包内 `current-handoff.md` 仍写“V22从精确V21目标状态继续”，没有记录V22成功结果。
- **已执行与未执行**：V22目标5文件处于未提交工作区；提交和推送尚未执行；WorkDesk未写入。
- **根因**：状态文档在验证执行前生成，验证器只校验预生成文本，没有在成功证据产生后执行“证据→当前状态→下一阶段”最终对账。
- **影响**：直接提交会把过期状态写入主分支，使交接文件与真实证据冲突，并可能让下一会话重复已经完成的验证。
- **正确做法**：最终验证成功后必须先审计证据包，再生成提交前状态对账；对账必须记录成功结果、真实修改范围、剩余证据不足和下一阶段。完成对账后复跑同一验证集，才能提交。
- **新增防护**：新增 `EXP-045`；V23 把V22成功证据写入当前交接，更新ERR-061至ERR-064状态，复跑全部验证后才暂存、提交和推送。
- **状态**：`FIXED_BY_V23_PENDING_EXECUTION`。
- **类防护**：`EXP-033`、`EXP-037`、`EXP-045`。


### ERR-066：源码审计把注释中的 `Bun.file` 文本误判为可执行持久化调用

- **日期与阶段**：2026-08-04，V24 WorkDesk Contract Consumer源码取证。
- **分类**：`SCRIPT_DEFECT / STATIC_ANALYSIS_DEFECT / EVIDENCE_DEFECT`
- **现场表现**：V24摘要报告 `DIRECT_PERSISTENCE_OUTSIDE_STORAGE=1`，路径为 `src/cli/main.ts`，命中内容为 `Bun.file`。
- **已执行与未执行**：两个仓库均未写入；WorkDesk porcelain调查前后字节等价；daemon/OpenCode停止；仅生成仓库外证据包。
- **根因**：辅助脚本直接对原始文本执行正则，没有先区分注释、字符串和可执行语法。命中来自注释 `no direct fs / Bun.file calls`，不是调用表达式。
- **影响**：会把正确遵守 `PERSISTENCE_VIA_REPOSITORY` 的CLI误判为架构违规，进而错误扩大WI范围或修改合法代码。
- **正确做法**：源码依赖和API调用证据必须使用AST或至少使用注释感知的词法扫描；注释命中只能作为文本证据，不得作为可执行调用证据。结论必须分别报告 `executable_usage` 与 `comment_or_text_usage`。
- **新增防护**：新增 `EXP-046`；V25使用注释感知扫描重新验证 `node:fs`/`fs` import、`require(...)` 和 `Bun.file(...)`，并要求非STORAGE可执行持久化调用为0。
- **状态**：`FIXED_PENDING_V25_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-044`、`EXP-046`。


# 第二部分：正确做法

## 3. 基线与权威

开始任何工作前固定：

```text
仓库与 remote
分支与 HEAD
工作区 staged / unstaged / untracked
唯一权威设计文件
活动实施文件
用户级安装版本（如相关）
真实项目基线（如相关）
```

来源不一致时先停下，不能边修改边决定用哪个版本。

## 4. 修改范围与闭包

任何修改先画闭包：

```text
权威定义
→ 生产者
→ 所有调用者
→ 所有消费者
→ Schema / Contract / Trace
→ 测试夹具
→ 安装和部署副本
→ 真实项目验证
```

签名、Schema、状态、路径、Contract 或权威字段变化时，必须全仓检索并记录调用点数量。

## 5. 文件交付

默认方式：

```text
ChatGPT 基于精确源文件生成完整替换文件
→ 自行检查编码、路径、内容和 diff
→ 打包保持仓库相对路径的 ZIP
→ 用户只解压覆盖完整文件
```

不得要求用户手工编辑、sed 替换、粘贴局部代码或运行复杂修改脚本。

## 6. Windows 命令和脚本

- 交互式 CMD 与批处理文件语法必须区分。
- 复杂逻辑交付独立文件，CMD 只负责调用。
- npm shim 使用明确 `.cmd` 路径并由 `cmd.exe` 调用。
- 捕获子进程 bytes，自行解码。
- stdout 是结构化数据时必须与 stderr 分离。
- 不在多层 Shell 中传复杂正则、JSON、多行代码或三引号程序。

## 7. Git 证据

对 working tree 的判断至少包含：

```text
git status --porcelain=v1 -uall
git diff --name-only
git diff --cached --name-only
git ls-files --others --exclude-standard
必要时文件字节/哈希与 HEAD 比较
```

换行警告不得参与文件列表解析。

## 8. 补丁和脚本设计

脚本必须：

```text
先检查真实输入
只阻断危险条件
备份在仓库外
修改前后范围一致性检查
失败回滚
可重复运行
标准反馈
不自动 commit / push
```

找不到预期结构时停止，不扩大正则继续猜。

## 9. 测试设计

新缺陷必须有独立回归测试文件。验证顺序：

```text
1. 新缺陷独立测试
2. TypeScript no-emit
3. 目标 package build
4. git diff --check
5. 补丁范围检查
6. 原 HEAD / 补丁 A/B（出现既有失败时）
7. 相关回归
8. 全量 deterministic build / 全量测试
9. 用户级安装一致性
10. 真实项目重验
```

测试命令必须使用明确 `./exact/path.test.ts`，不要依赖名称过滤证明核心缺陷。

## 10. 失败处理

每次失败先分类：

```text
产品缺陷
脚本缺陷
环境缺陷
验证缺陷
证据缺陷
历史债务
```

在分类完成前，不生成下一版补丁。失败输出必须说明：

```text
执行到哪一步
哪些步骤没有执行
仓库是否变化
是否需要回滚
下一步取证是什么
```

## 11. 权威字段

状态、版本、路径、Contract、Trace 等权威字段：

- 不得隐藏默认；
- 必须从唯一权威源读取；
- 必须显式传递；
- 权威不可用时在任何写入前 fail closed；
- 不允许靠后续手工修文件恢复。

## 12. 真实项目验证

自动化测试不能替代 WorkDesk 等真实项目验证。真实验证必须覆盖：

```text
正式 WI 创建
候选和 Project Spec 版本绑定
Contract 提升
Trace 消费关系
Impact Scope
Code Permission
实际代码消费者核对
Merge / Verification / Close
失败和破坏性阻断
```

发现产品治理缺陷时暂停业务 WI，先修产品并回归，再重建受污染的真实验证产物。


## 12A. 经验门禁实现

经验门禁必须验证实质内容，而不是只验证标题存在：

```text
按 Markdown 标题层级截取完整章节
第三部分必须包含至少一个 EXP-* 规则
第四部分必须包含实际检查项
APPLICABLE_EXPERIENCE_RULES 至少一项
NONE_FOUND 必须 fail closed
```

## 12B. 历史测试夹具同步

治理能力升级时，测试夹具必须沿同一 Contract 闭包同步：

```text
Actor Role 使用权威常量
错误断言使用稳定错误码或结构化字段
文件存在性只验证访问不抛错
Code Permission 断言规范化后的路径与 operation 语义
Close-ready WI 必须包含 Candidate-first 的 tasks、可解析的权威 trace、changed_files_audit、
Semantic Closure、provenance、有效 User Decision 和声明式 Project Spec targets
```


## 12C. 多产物发布单元冻结

补丁 ZIP、应用脚本、哈希清单、安装说明等相互依赖的文件必须作为一个发布单元处理：

```text
完成全部内容修改
→ 冻结主文件字节
→ 生成最终 ZIP
→ 从最终 ZIP 计算总哈希和内部文件哈希
→ 由这些最终哈希生成应用脚本
→ 最后生成发布 Manifest
→ 重新打开三个产物交叉校验
→ 一次性交付同一发布单元
```

禁止在生成应用脚本后继续修改 ZIP，或只更新其中一个伴生产物。任一字节变化都必须废弃旧发布单元并整体重建。


## 12D. 迁移脚本的源状态与目标状态契约

任何升级、迁移、补丁应用程序都必须把校验拆成两套：

```text
SOURCE_CONTRACT
  只描述当前旧版本真实应具备的文件、哈希、结构和最低语义
  只用于应用前 fail closed

TARGET_CONTRACT
  描述应用完成后新增或强化的文件、字段、数量和语义
  只用于应用后验收
```

禁止把目标状态中的新字段、新规则或新文件作为源状态前置条件。发布前必须分别使用一个合法旧状态样本和一个目标状态样本验证两套契约。


## 12E. 语义门禁与字面门禁的边界

门禁设计前必须先判断被校验内容属于哪一类：

```text
正式接口、ID、Schema 字段、命令参数、规范固定条款
  → 可以做精确字面校验

说明文字、反馈字段、示例、展示名、等价表述
  → 必须校验结构和语义，不得把某个偶然字符串写成隐式契约
```

验证器不得因为文档缺少一个从未被权威规则要求的运行反馈字面量而失败。任何新字面断言都必须能够指向明确的权威条款。


## 12F. 生产诊断文本的 Contract 消费者闭包

生产错误信息、注释、帮助文本、CLI 提示和示例会直接指导后续开发，因此必须纳入架构变更闭包：

```text
权威状态或调用路径变化
→ 检索生产实现
→ 检索异常信息与注释
→ 检索帮助文本和示例
→ 检索测试夹具
→ 用行为回归证明诊断内容与真实路径一致
```

不得出现“执行代码采用新权威、错误提示仍要求旧权威”的分裂状态。只有正式接口名和权威标识符适合精确断言，其余说明文字应验证核心语义。


## 12G. 兼容读取路径与新写入边界

目录布局中标记为 legacy、compatibility 或 read-only 的路径，只能用于读取旧项目或专门的兼容性测试：

```text
新生产写入
新测试夹具写入
Candidate 生成
正式 Merge 输入
  → 必须使用当前目录权威定义的正式路径

兼容路径
  → 只读
  → 不得用于绕过 Candidate Manifest、Gate、Merge 或 Trace 对账
```

测试注释、实际写入路径、Manifest 条目和 Gate 读取结果必须一致。发现新夹具写入兼容路径时必须按测试 Contract 漂移处理，不得以“Gate 能读到”为通过依据。


## 12H. 包外启动链也必须可观察

单一压缩包规则不仅约束包内脚本，也约束用户从下载文件进入包内入口的最短链路：

```text
检查下载 ZIP
→ 解压
→ 定位并调用 RUN.cmd
→ 包内应用和验证
```

前三步必须分别具有明确阶段输出。ZIP 不存在、解压失败或入口不存在时，必须在包内程序尚未启动的情况下直接输出最小 `FEEDBACK TO CHATGPT`；不得静默返回。顶层 `RUN.cmd` 必须在执行解释器前输出启动标记。

---

# 第三部分：工程经验总则

> 本部分是每次修改前必须阅读的核心。每条规则解决一类问题，不针对单一报错打补丁。

## EXP-001：先固定权威，再做判断

任何结论都必须绑定到明确版本和权威源。文件名相同、路径相似、以前正确，都不能替代当前 HEAD 的证据。

## EXP-002：环境边界就是正式接口

Windows/CMD、编码、PATH、npm shim、Git stdout/stderr、Bun 参数都属于系统接口，不是“运行细节”。跨越边界前必须明确输入、输出、编码、转义和调用方式。

## EXP-003：状态快照不是不变量

一次 `git status`、一个 modified 数量或某个目录存在，只是观察。脚本只能固化业务不变量，不能把瞬时状态写死成下一轮前置条件。

## EXP-004：修改必须形成闭包，不是只改发现点

任何定义变化都要沿调用图和消费图闭环。修改函数签名、Schema、路径、状态、Contract 时，必须覆盖全部生产入口、调用者、测试、部署副本和真实消费者。

## EXP-005：权威数据不得有隐式默认

Project Spec Version、状态、路径和 Contract ID 等权威值不能用“通常是 PSV-0001”之类默认。默认会把缺失证据伪装成合法数据。

## EXP-006：危险动作必须在写入前失败

缺少权威、范围不合法、基线不一致时，必须在创建目录、写文件、推进状态之前停止。失败后不应留下部分产物。

## EXP-007：证据工具本身也必须被验证

审计脚本、导出脚本和解析器不是中立的。它们可能误解编码、警告、旧格式或关键词。重要结论必须用第二种独立证据交叉验证。

## EXP-008：先分类失败，再选择动作

没有分类就继续写下一版脚本，会把产品问题、环境问题和脚本问题混在一起。分类是修复动作的前置条件。

## EXP-009：归因必须做 A/B

补丁环境出现失败时，不能凭“以前应该通过”判断回归。必须在同一环境、同一命令、同一测试集上比较原 HEAD 与补丁。

## EXP-010：核心回归必须独立可执行

新缺陷的证明不能依赖含历史失败的大文件、名称过滤或仓库级扫描。一个缺陷至少有一个明确测试文件，可用一条简单命令单独运行。

## EXP-011：验证按风险从近到远分层

先验证最接近修改的语法、类型和独立回归，再扩大到包、工作区、安装和真实项目。任何一层失败都先停止归因，不能跳层。

## EXP-012：把用户操作复杂度当作缺陷指标

需要用户粘贴长程序、多层引号、复杂循环、筛选日志或重复下载，说明交付设计有问题。人机接口应最小、明确、可复制。

## EXP-013：脚本默认环境会变化，必须动态、幂等、可恢复

脚本不应要求现场永远保持上一轮快照；它应读取当前状态，只阻断危险变化，并保证失败可恢复、重复运行安全。

## EXP-014：优先完整文件替换，降低文本变换风险

复杂源码和文档优先完整文件。正则只允许用于边界唯一、次数可验证、替换后立即编译的小修改。

## EXP-015：一个错误必须产生一个类防护

修复错误不算完成。还必须：记录根因、归入经验规则、增加自动检查或回归测试、更新本文件。否则只是等待同类错误换个形式再次出现。

## EXP-016：区分新回归、既有失败和测试夹具问题

历史测试失败不能被忽略，也不能自动归给当前补丁。必须分别记录：补丁新增失败、原 HEAD 既有失败、环境失败和夹具过期。

## EXP-017：唯一真相源，其他都是投影

权威状态、版本、Trace 消费关系、安装 Manifest 等只能有一个正式源。其他列表、缓存和 Module Trace 必须是可重建投影，不能各自维护事实。

## EXP-018：用户边界高于自动化便利

用户明确要求 daemon/OpenCode 手工操作、不推送、不动服务器、不删除目录时，任何自动化便利都不能越过该边界。

## EXP-019：同一路线重复失败时必须改变问题模型

同类方案失败一次先复盘；失败两次后禁止仅改版本号继续。必须改为真实源码取证、完整文件替换、独立测试或更小的验证面。

## EXP-020：经验必须成为前置门禁，不是事后总结

经验只有在下一次修改前被强制读取和引用才有价值。每次任务必须声明适用规则；完成后如有新错误，必须先更新本文件再继续下一轮。


## EXP-021：门禁必须证明“读到了内容”，不能只证明“找到了标题”

任何前置门禁都必须校验实质内容、最小数量和逻辑一致性。章节存在但正文为空、适用规则为零、失败字段与 PASS 同时出现，都必须 fail closed。结构化反馈自身也要满足不变量。

## EXP-022：测试夹具是 Contract 消费者，必须随权威模型同步

测试不能复制展示名、错误文案、旧 API shape 或旧文件布局作为第二权威。Actor、Schema、权限展开、治理路径和闭环产物应来自权威常量、公共 helper 或标准 fixture builder；权威模型变化时，夹具属于必须同步的消费者。

下游 Gate 的正向夹具必须先通过全部上游真实 Contract。Formal Version 或 Close 场景不得只补最终 Gate 文件；统一 fixture builder 必须使用生产 renderer、完整 Evidence、可解析 audit，并真实运行 `verification_gate → formal_version_gate`，禁止用自由文本或伪造报告绕过上游契约。


## EXP-023：相互依赖的交付产物必须原子冻结

补丁、应用脚本、验证脚本、Manifest、校验值和说明不是独立文件，而是同一发布单元。伴生产物只能由最终主产物字节派生；任何成员变化都必须使整个发布单元失效并重新生成、重新交叉验证，禁止局部更新。

面向用户交付时，同一轮必须封装为一个可下载的完整压缩包。应用和验证可以分步执行，但不得拆成多次下载；包内必须同时包含 `patch/`、所需脚本、Manifest 和说明。


## EXP-024：迁移必须区分源状态契约与目标状态契约

迁移前置检查只能要求旧版本本来就应具备的条件；新增字段、新规则和新文件只能作为迁移后的目标验收条件。所有迁移工具必须分别定义并验证源状态契约和目标状态契约，禁止用未来状态要求阻断合法旧状态。


## EXP-025：门禁校验权威语义，不校验偶然字面

验证条件必须来源于明确权威契约。精确字符串只适用于正式 ID、Schema、命令接口或固定规范条款；反馈字段、示例、展示文字和等价表述必须按结构与语义校验。任何无法指出权威出处的字面断言都属于过拟合门禁。


## EXP-026：诊断文本和注释也是架构 Contract 消费者

生产异常、注释、帮助文本和示例会驱动维护决策，不能被视为无害文字。架构权威、调用路径或状态模型变化时，必须把这些表面与代码、测试一起纳入消费者检索和回归；任何仍描述已废止路径的诊断都属于生产缺陷。


## EXP-027：兼容读取路径不能成为新写入捷径

兼容读取是为了识别旧项目事实，不是新实现和新测试夹具的低成本写入入口。新产物必须写入当前目录权威路径，并进入对应 Manifest、Gate、Merge 和验证闭环；使用兼容路径让测试通过属于治理绕过。


## EXP-028：交付入口必须从第一步就可观察

用户执行的一键 CMD 是发布单元的一部分，不是包外临时说明。下载文件检查、解压、入口定位和包内程序启动都必须有阶段证据；任何一步失败都必须输出标准失败区块。只有包内脚本有反馈而包外启动链静默，仍属于不可验证交付。


## EXP-029：测试必须遵守真实阶段顺序并使用正式编排入口

测试夹具不能为了“一次构造完成”而折叠 Candidate、审批、Merge、Verification 和 Close 的时序。任何绑定摘要或哈希的审批，必须先被下游动作消费，再运行会改变摘要的后置阶段。依赖治理叠加、报告落盘、Gate Summary 或 workflow-specific 规则的测试必须使用正式 handler 或 `runRequiredGates()`；底层 primitive 只能用于明确的单元测试，不得替代产品入口。

## EXP-030：结构化检查标识是生产者—消费者契约

Gate `check_id`、错误码、Schema 字段和状态枚举不是内部文字，而是过滤、聚合、豁免、报告和测试共同消费的正式接口。生产者新增、删除或重命名结构化标识时，必须全仓检索并同步全部消费者；保留旧 ID 的过滤器即使代码可编译，也会造成治理语义失效。工作流豁免应集中在单一语义函数，并由独立单元测试与正式入口行为测试共同覆盖。

## EXP-031：业务规则必须落在全部生产入口共同消费的责任层

修改 Workflow、Gate、权限、状态或契约行为前，必须列出直接 Handler、编排入口、底层 primitive 和所有绕行调用。若某个上层编排可以被正式入口绕过，业务不变量必须下沉到所有入口共同调用的权威责任层，并从唯一事实源读取；上层只能编排，不能复制第二套规则。回归必须同时证明规则所属层的独立语义和至少一条正式行为链路。


## EXP-032：最终证据必须使完整变更集可重建、可审查

测试通过、构建通过、路径数量和 diff stat 只能证明执行结果，不能替代变更内容审计。提交前证据必须包含全部变化文件的当前字节、tracked 基线字节或 blob/hash、untracked 文件正文、完整 diff 和逐文件 SHA256 清单，使审查者无需访问原工作区也能重建并核对整个变更集。缺少任一部分时必须 fail closed，不得提交或宣布完成。

## EXP-033：当前状态文档必须与最终证据在同一阶段收口

交接、活动实施状态、缺陷状态、已完成、未完成、下一步和冻结范围都是工程事实的治理投影。提交前必须从同一份最终验证证据逐项更新，不得同时保留“待验证”和“验证已完成”等互斥描述。仓库验证、提交、安装、真实项目重验必须使用不同状态明确表达；历史范围只能约束其所属缺陷，不能被误写为阻断后续独立缺陷的永久边界。



## EXP-034：先识别迁移状态，再执行状态专属门禁

SOURCE/TARGET 双契约不仅要分别列出，还必须决定执行顺序。迁移工具必须先用不可歧义的版本、哈希或结构证据识别当前状态，再运行该状态专属的语义检查。SOURCE 标记只约束应用前，TARGET 标记只约束应用后或幂等重跑；任何在状态分类前执行的目标语义门禁都会重新制造不可达迁移。



## EXP-035：状态对账目标必须描述成功后的下一阶段

状态同步包不能把“本包正在执行的动作”继续写成成功后的下一步。目标文件必须描述包成功结束后的状态和真正尚未执行的动作；验证失败时回滚，验证成功时下一步不得重复本轮动作。测试必须同时验证目标标记存在和已完成动作不存在。

## EXP-036：强制治理规则必须覆盖全部实际入口消费者

经验门禁、开发边界和其他强制规则建立后，必须列出仓库根 `AGENTS.md`、当前交接、用户级模板及其他实际入口。每个入口必须表达相同核心不变量，并由自动测试共同覆盖；只更新其中一个投影不能形成消费者闭环。



## EXP-037：提交依赖状态必须通过提交后对账闭环

实际实现 commit SHA、远程推送结果和提交后 clean worktree 只能在实现提交成功后成为事实。包含这些字段的实施状态和当前交接不得试图在实现提交中一次性最终化。标准流程必须是：验证实现 → 提交并推送 → 读取提交证据 → 窄范围同步状态文档 → 再提交状态对账。状态对账提交不得在自身内容中保存“当前提交 SHA”，否则会形成不可满足的自引用；应记录被对账的实现提交，并要求新会话实时读取远程 HEAD。远程当前版本不得长期保留“未提交”“待推送”或把已经完成的提交动作继续列为下一步。



## EXP-038：进程不存在结论必须建立在成功且可解析的进程快照上

daemon、OpenCode 和其他受控进程的“未运行”不是默认值。检查程序必须先证明查询命令成功、输出结构可解析，再用完整进程快照中的 PID 和进程名进行匹配。任何非零退出码、空输出、字段数量异常、编码失败或握手 PID 无法解释的情况都必须标记 `INSUFFICIENT_EVIDENCE` 并 fail closed；不得把查询失败、过滤语法错误或解析异常转换成布尔值 `false`。



## EXP-039：机器结构化输出必须先解析，不能先做展示层空白规范化

Git porcelain、JSONL、CSV、NUL 分隔记录和其他机器协议中的前导空格、分隔符与空记录可能属于正式结构。读取程序必须保留原始 bytes，按协议边界解析后再规范化单个字段；禁止对整段机器输出先执行 `.strip()`、`.splitlines()` 后裁剪或合并 stdout/stderr。解析器必须对首条、末条、含空格路径、空输出和异常记录建立回归测试，无法解析时 fail closed。



## EXP-040：引用审计必须区分活跃权威依赖与不可变历史证据

字符串出现不等于正式引用。清理、迁移或重建治理对象前，必须按文件角色分类：对象自身产物、Runtime 权威状态、Project/Module 正式规格、其他活跃 Work Item、业务消费者、observability 索引和历史 payload。历史日志必须保存，但不得仅因保留了对象 ID 就阻断清理；Runtime 当前状态和其他权威消费者必须单独 fail closed。审计结论必须同时报告“正式阻断引用”和“历史证据引用”，禁止用一个未分类总数代替治理判断。



## EXP-041：Git 工作区状态必须区分正式内容差异与 stat/index 元数据差异

`git status` 是范围发现入口，但单独的 porcelain `M` 不能证明业务内容变化。对疑似内容中性的跟踪文件，必须以 Git规范化 blob 哈希、未暂存状态和 `git diff --quiet` 共同判定；全部一致时明确报告 `STAT_ONLY_CONTENT_NEUTRAL`，不得为了获得 clean 展示而修改 index、重写文件或改变换行。只有正式内容差异才能进入修改范围和消费者影响分析。



## EXP-042：可恢复脚本必须先验证零写入前置条件，再识别精确源/目标状态

修改脚本必须把执行分成三个不可混淆的阶段：第一阶段在零写入条件下验证进程边界、远程基线、分支、HEAD、暂存区和允许状态；第二阶段按完整路径集合与文件哈希识别 `CLEAN_SOURCE`、`EXACT_PREVIOUS_TARGET`、`EXACT_CURRENT_TARGET`，混合状态失败关闭；第三阶段才允许写入和后置验证。脚本必须支持从精确已应用目标状态继续验证，同一包重复执行不得依赖工作区必须干净。任何前置失败必须证明未发生写入。



## EXP-043：实施文档重构必须同步全部固定文本消费者

实施状态、交接和专题文档重构时，必须把稳定治理事实与段落布局分开管理。移动、替换或删除段落前，必须搜索经验门禁、结构测试、脚本选择器、解析器和报告模板中的全部文本消费者；稳定事实应在新结构中保留明确表述，测试应断言当前事实而不是历史段落位置。交付前必须静态交叉检查所有文档 `toContain`、`not.toContain` 和等值断言，任何缺失或冲突均失败关闭。



## EXP-044：验证断言必须绑定真实生产者契约和文件职责

验证器不得凭字段名称相似、历史样例或跨文件重复推断必填字段。每条断言必须能够指向真实生产者、正式 schema、类型定义或权威规则，并明确该文件承担的职责。一个权威事实应由其正式产物验证，其他文件没有契约要求时不得强制复制。无法找到生产者或 schema 依据时必须标记 `INSUFFICIENT_EVIDENCE`，不能通过增加双写字段让测试通过。



## EXP-045：成功证据产生后必须执行提交前最终状态对账

验证包中的状态文档如果在运行前生成，只能描述预期，不能自动代表运行结果。最终验证成功后必须先审计证据包，再把成功结果、实际范围、未完成事项和下一阶段写回当前状态文档；随后复跑同一测试和构建集。只有“证据、状态文档、测试、Git范围”四者一致时才允许提交。不得提交仍写“待验证”“待继续”或与成功证据冲突的当前交接。



## EXP-046：源码调用证据必须区分可执行语法、注释和普通文本

架构边界审计不得直接把原始源码正则命中解释为调用关系。优先使用语言AST；无法使用AST时，至少使用能识别行注释、块注释、字符串和模板文本的词法扫描。报告必须分开列出可执行调用、import/require依赖、注释命中和普通字符串命中。只有可执行语法或正式import/require才能进入生产者—消费者和架构违规判断。


---

# 第四部分：修改前强制检查

## 13. 通用检查清单

```text
□ 已完整阅读第三部分
□ 已记录 EXPERIENCE_FILE_READ=YES
□ 已记录 APPLICABLE_EXPERIENCE_RULES=EXP-...（至少一项）
□ 已列出至少一项适用 EXP 规则；NONE_FOUND 时已 fail closed
□ 已执行重复错误检查；当前问题已归入已有类别或新增 ERR/EXP
□ 已确认读取到第三、四部分正文，而不是只有标题
□ 已固定 HEAD、分支、工作区和权威文件
□ 已区分产品、脚本、环境、验证、证据和历史债务
□ 已画出定义—调用者—消费者—测试—安装—真实验证闭包
□ 已确认用户操作边界
□ 已选择最简单的交付和验证方式
□ 命令已按实际 Windows/CMD/Bun 环境验证
□ daemon/OpenCode 进程检查命令已成功并可解析；命令失败、输出异常或 PID 无法判定时已 fail closed，未解释为“未运行”
□ Git porcelain 等机器结构化输出使用原始 bytes 和协议分隔符解析，未对完整输出先执行 `.strip()` 或展示层空白规范化；首条、末条和含空格路径回归已通过
□ 引用审计已区分活跃权威依赖、对象自身产物、Runtime 当前状态和不可变历史日志；未用未分类文本命中总数直接阻断或允许清理
□ Git porcelain `M` 已通过规范化 blob、未暂存状态和空 diff 区分正式内容差异与 stat/index 元数据差异；未为获得 clean 展示而修改 index 或重写文件
□ 修改脚本已在首次写入前验证进程、远程、本地基线、暂存区和精确源/目标状态；精确目标可重入，混合状态失败关闭，前置失败保持零写入
□ 实施文档重构已同步经验门禁、结构测试、脚本选择器和报告模板中的全部固定文本消费者；稳定治理事实在新结构中仍有明确表述，并完成 `toContain` / `not.toContain` 静态交叉检查
□ 每条验证断言已绑定真实生产者、正式 schema、类型定义或权威规则；未要求非权威文件复制其他产物的字段，无法确认职责时已标记 `INSUFFICIENT_EVIDENCE`
□ 最终成功证据已与当前状态文档、经验记录、测试断言和Git范围完成提交前对账；当前交接不再保留与成功证据冲突的“待验证”状态
□ 源码调用和依赖审计已区分可执行语法、正式import/require、注释和普通文本；未把注释中的API名称当成生产调用关系
□ 脚本 stdout/stderr、编码和失败恢复已设计
□ 新回归测试可独立运行
□ 已准备 A/B 归因方案
□ 所有写操作能在写入前 fail closed
□ 不会在仓库内制造临时文件
□ 失败后不会自动提交、推送或清理证据
□ 多产物交付已先冻结主文件，再由最终字节生成 ZIP、应用脚本和 Manifest
□ 迁移脚本已分离 SOURCE_CONTRACT 与 TARGET_CONTRACT，未用目标状态要求阻断旧状态
□ 迁移/升级工具已先识别 SOURCE/TARGET 状态，再执行对应状态的语义门禁；未在状态分类前运行目标标记检查
□ 生产错误信息、注释、帮助文本和示例已与当前唯一权威路径一致，不含已废止调用链
□ 新生产写入和新测试夹具未使用 legacy/compatibility 只读路径，Candidate 产物已进入 Manifest 与 Gate 闭环
□ 包外 CMD 已覆盖下载文件检查、解压、入口定位和启动标记，RUN.cmd 启动前失败也会输出标准反馈
□ Gate check_id、错误码、Schema 字段和状态枚举变更已同步全部过滤、聚合、豁免、报告和测试消费者
□ 业务规则已落在全部生产入口共同调用的责任层，未只修改可被正式 Handler 绕过的编排层
□ 最终证据包已包含全部变化文件正文、tracked 基线字节或哈希、untracked 正文、完整 diff 和逐文件 SHA256 清单，可在仓库外重建并审查变更
□ 最终状态文档已根据同一份验证证据对账基线、已完成、未完成、下一步和冻结范围，不含互斥阶段描述
□ 状态对账目标描述成功结束后的下一阶段，成功目标中不再把本轮已完成动作列为下一步
□ 提交依赖状态已在实现提交和推送成功后执行二次对账；状态文件记录被对账的实现提交且不自引用状态对账提交 SHA，当前远程 HEAD 不再保留“未提交”“待推送”等已过期描述
□ 强制经验门禁已同步仓库根 AGENTS.md、current-handoff.md、经验文件和用户级 AGENTS 模板，并由测试覆盖全部入口
```

任一项不能勾选，不得开始修改。

## 14. 命令交付检查

```text
□ 交互 CMD 未使用批处理 %% 变量
□ 没有多行 Python/JSON/正则嵌入 CMD
□ npm 工具解析到明确 .cmd
□ 输出编码按 bytes 处理
□ stdout/stderr 分离
□ 末尾有最小 FEEDBACK TO CHATGPT
□ 用户不需要从长日志中筛选
□ 下载 ZIP 不存在、解压失败或 RUN.cmd 未启动时也会输出最小 FEEDBACK TO CHATGPT
□ 测试夹具按 Candidate Gate → User Decision → Merge → Verification/Formal Version → Close 的真实时序组织
□ 提交前证据同时保存完整 tracked diff、全部 untracked 文件正文和可复核的逐文件哈希清单
□ 依赖 workflow-specific 治理叠加的 Gate 测试通过正式 handler 或 runRequiredGates 执行，未直接调用底层 runGate 绕过编排
```

## 15. 代码修改检查

```text
□ 全部调用点已列出并计数
□ 全部生产入口已覆盖
□ 权威字段无隐式默认
□ 写入前前置条件已验证
□ 新测试为独立文件
□ typecheck 在回归测试后立即执行
□ build、diff check、范围审计已安排
```

## 16. 文档修改检查

```text
□ 文档权威级别明确
□ 没有建立第二权威源
□ 当前状态、提交和下一步与事实一致
□ 新规则已同步入口文件
□ 旧规则文件已标记支持关系或废止关系
```

---

# 第五部分：错误台账维护规则

## 17. 新错误必须怎样记录

发生任何新错误后，在继续下一版修改前追加：

```text
错误 ID
日期与阶段
分类
现场表现
已执行与未执行步骤
仓库/环境是否变化
根因
影响
正确做法
对应 EXP 类规则
新增的自动防护或回归测试
状态：OPEN / FIXED_PENDING_VALIDATION / CLOSED
```

## 18. 关闭条件

错误不能因为“后来命令成功”而关闭。至少满足：

```text
根因已证明
修复已实现
专用回归已通过
相关调用链已验证
没有范围外变化
经验规则已更新
真实环境重验（适用时）
```

## 19. 与旧复盘文件的关系

以下文件保留为历史专项证据：

```text
docs/rule/specforge_script_failure_review_and_batch_rules.md
```

本文件是统一强制入口。旧文件与本文件冲突时，以本文件为准；旧文件中的具体案例可作为补充，但不能替代修改前阅读本文件第三、四部分。

## 20. 当前未闭环事项

截至建立本文件时：

```text
P0-PSV-BINDING-001 修复处于 9 文件补丁、待完成正确的独立回归验证
原 HEAD 在 4 个历史测试文件中存在 13 个既有失败，已通过 A/B 证明不是 PSV 补丁新增，但必须另立根因闭环
WorkDesk WI-0003 的错误 PSV-0001 骨架需在产品修复、安装升级后受控清理并重建
P0 Contract Consumer Trace 的 WorkDesk 真实验证尚未完成
```

这些事项不得因建立本经验文件而被视为完成。

## 21. 2026-08-02 状态更新

```text
P0-PSV-BINDING-001：4/4 独立回归通过；typecheck、daemon-core build、diff check 通过。
原 HEAD 13 个失败：已证明为历史测试夹具漂移，按 ERR-040 修复并待全量验证。
经验门禁假通过：按 ERR-039 修复，增加经验文件结构回归测试。
发布单元版本漂移：按 ERR-041 修复，最终 ZIP、应用脚本和 Manifest 由同一冻结字节生成。
迁移前置条件混用目标状态：按 ERR-042 修复，源状态与目标状态契约已分离。
门禁过拟合非权威字面：按 ERR-043 修复，验证改为权威语义不变量。
生产诊断仍描述已废止双状态路径：按 ERR-044 修复，诊断文本纳入架构消费者闭包。
新 Section 21 夹具误用兼容 Trace 路径：按 ERR-045 修复，Trace 改回正式 Candidate 路径并进入 Manifest/Merge 闭环。
外层一键 CMD 静默失败：按 ERR-046 修复，包外启动链增加阶段输出和标准失败反馈。
Section 21 夹具阶段折叠导致审批哈希失效：按 ERR-047 修复，Verification/Formal Version 延迟到真实 Merge 之后。
Section 21 Close 绕过 Gate Chain：按 ERR-048 修复，Close 场景统一通过正式 Gate 编排入口执行。
快速路径 Close 豁免仍使用旧 check_id：按 ERR-049 修复，Gate Chain 同步当前 Trace 权威检查并增加独立回归。
V4 修复位于可绕过的 Gate Chain：按 ERR-050 纠正，Close Gate 成为 Workflow 适用性唯一责任层，Gate Chain 移除重复过滤。
V5 最终证据缺少完整变更内容：按 ERR-051 修复，最终证据包新增全部文件字节、基线、完整 diff 和 SHA256 清单。
V6 状态文档仍停留在验证前阶段：按 ERR-052 修复，PSV 缺陷状态和当前交接统一对账最终证据。
V7 在状态分类前检查目标标记：按 ERR-053 修复，源/目标语义门禁改为状态识别后的专属检查。
V8 成功后交接仍重复本轮动作：按 ERR-054 修复，目标交接直接进入提交和推送阶段。
仓库根 AGENTS 遗漏经验门禁：按 ERR-055 修复，强制入口消费者和测试闭环扩展到根 AGENTS。
提交后状态文档仍保留待提交描述：按 ERR-056 修复，`95befe8` 提交证据通过窄范围状态对账同步到 PSV 实施文件和当前交接。
V13 进程过滤命令失败仍报告 daemon 未运行：按 ERR-057 修复，后续进程边界使用成功且可解析的完整进程快照并在异常时 fail closed。
V14 Git porcelain 首行被整体裁剪导致路径丢失首字符：按 ERR-058 修复，机器状态改用原始 bytes、NUL 分隔和真实临时仓库回归。
V15 将109个 WI-0003 字面命中统一当成外部引用：按 ERR-059 修复，引用审计分离正式活跃依赖与不可变历史证据。
V17 把内容中性的 WorkDesk porcelain `M` 当成必须清除的业务变更：按 ERR-060 修复，使用 Git规范化 blob和空 diff证明内容中性，不修改 index。
WorkDesk WI-0003：用户级安装已升级并通过 119/119 一致性校验；等待受控审计、证据保存和重建。
```

## 22. 2026-08-04 真实环境关闭更新

```text
P0-PSV-BINDING-001：CLOSED。WI-0003通过正式状态机转为superseded；WI-0004由分配器自动创建，candidate_manifest.base_spec_version=PSV-0002，entries=[]，Runtime=created。
ERR-057：CLOSED。后续V15/V16/V18进程快照均成功、可解析并正确证明daemon/OpenCode边界。
ERR-058：CLOSED。NUL分隔porcelain解析器真实临时仓库回归和后续多轮实际范围检查通过。
ERR-059：CLOSED。WI-0003引用被正确分类为自身8、Runtime2、历史观测99、正式阻断0，并据此完成合法恢复。
ERR-060：CLOSED。V18使用Git规范化blob、未暂存和空diff证明4个porcelain M为STAT_ONLY_CONTENT_NEUTRAL，全程未修改WorkDesk文件或index。
GOV-DEFECT-CONTRACT-CONSUMER-001：仍为IN_PROGRESS。Work Item创建链已真实运行，但完整Contract Consumer场景尚未端到端验证。
ERR-061 / ERR-062：CLOSED。V22证明零写入进程前置检查、精确目标状态续跑和混合状态失败关闭有效。
ERR-063：CLOSED。V22经验门禁通过，固定文本消费者与当前交接完成同步。
ERR-064：CLOSED。V22按真实生产者契约验证trigger_result skeleton，并以candidate_manifest.base_spec_version作为Project Spec Version权威产物。
ERR-065：V22证据审计发现，V23执行提交前最终状态对账。
ERR-066：V24源码审计误把CLI注释中的Bun.file当成直接持久化调用；V25使用注释感知扫描修复并冻结WI-0004场景。
```


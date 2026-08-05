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


### ERR-067：混合 Candidate 生产者使 Runtime-owned `candidate_manifest` 只保留首个显式条目

- **日期与阶段**：2026-08-04，WI-0004 Contract Consumer Phase 1真实 Candidate Gate。
- **分类**：`RUNTIME_DEFECT / MANIFEST_OWNERSHIP_DEFECT / MERGE_SCOPE_DEFECT`
- **现场表现**：`sf_contract_register` 正确登记 `extension_registry` 后，`sf-design` 和 `sf-task-planner` 又通过受控 Tool 生成 Architecture、Module Design、Module Contract 和 Trace Delta Candidate；但 `candidate_manifest.entries` 最终仍只有1项。第二次 Gate 因 Module Contract Candidate 未进入 Prospective Spec，把 `WorkItemStatus` 同时识别为正式 DOMAIN Module Contract 和候选 Project Contract。
- **已执行与未执行**：WI-0004 最终停在 `gates_failed`；未执行 User Decision、Merge、Code Permission、业务代码修改、Verification 或 Close；WorkDesk正式Project文件未修改。
- **根因**：`inferManifestEntries()` 在检测到一组合法显式条目后立即返回，适合 Gate/Approval/Merge消费冻结Manifest，却不适合 Candidate生产阶段的多Tool增量写入。Runtime 在 `candidate_preparing → candidate_prepared` 没有执行一次Classification驱动的完整Manifest物化。
- **影响**：合法受控Candidate无法进入Prospective Spec和Merge范围；Contract唯一真相源、Spec一致性和Trace Gate产生连锁误判。要求Agent手工补Manifest会违反Runtime所有权并制造第二写入者。
- **正确做法**：Candidate生产者只负责规范Candidate文件。Runtime在 `candidate_preparing → candidate_prepared` 状态边界读取正式Classification，合并已有合法显式条目与实际需要的规范Candidate，检测candidate/target冲突、缺项和重复目标，原子写入完整Manifest；Gate及后续阶段只消费该冻结Manifest。
- **新增防护**：新增 Runtime Manifest materialization、状态边界回归、混合生产者回归、冲突与缺项回归；恢复WI-0004时验证Manifest精确包含5项。
- **状态**：`CLOSED_V28_AUTOMATED_AND_WORKDESK_MANIFEST_RETEST`。V28隔离验证、V29真实应用、V30提交推送、V33安装以及WI-0004真实恢复均证明Runtime自动物化5项Manifest并排除2项历史Candidate。
- **类防护**：`EXP-007`、`EXP-011`、`EXP-015`、`EXP-021`、`EXP-047`。


### ERR-068：`architecture_change` full Candidate Gate无条件要求未发生变化的 Requirement Candidate

- **日期与阶段**：2026-08-04，WI-0004两次Candidate Gate。
- **分类**：`GATE_DEFECT / CLASSIFICATION_CONSUMER_DEFECT / SCOPE_EXPANSION_DEFECT`
- **现场表现**：WI-0004正式Classification中 `requirement_changed=false`、`acceptance_criteria_changed=false`、`business_rule_changed=false`，但第一次Gate仍要求Requirement Candidate并执行Requirements Gate。一次修复被迫生成CORE Requirement Candidate；第二次Gate又据此扩大Design要求。
- **已执行与未执行**：补充的CORE Requirement和Project Data Model Candidate只存在于失败轮次WI证据；未进入正式Project Spec；未Merge。
- **根因**：`required_files_gate` 和 `workflow_specific_gate` 仅根据 `candidate_phase=full` 套用固定模板，没有消费 `trigger_result.classification`。Workflow阶段被错误等同于本次实际变更范围。
- **影响**：合法任务被迫制造无变化Candidate；专业Agent和Gate扩大Module/Design范围，增加HardStop与伪变更风险，违反范围冻结。
- **正确做法**：Required Candidate与专业Gate必须由正式Classification决定。Requirement相关字段任一为true才要求Requirement Candidate和Requirements Gate；`design_changed`、`architecture_changed`、`data_model_changed`、`module_contract_changed`分别控制对应Candidate。Classification不可用时保持历史严格配置并失败关闭。
- **新增防护**：新增Classification-driven Candidate Gate纯函数和回归，覆盖Requirement不变、Requirement变化、task_change及Classification缺失回退。
- **状态**：`CLOSED_V28_AUTOMATED_AND_WORKDESK_CLASSIFICATION_RETEST`。WI-0004真实Gate只要求Classification对应的5项Candidate，Requirement和Data Model历史Candidate未进入Manifest。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-021`、`EXP-048`。


### ERR-069：场景文档和提示词使用状态机中不存在的 `gates_passed`

- **日期与阶段**：2026-08-04，WI-0004 Phase 1场景冻结与OpenCode执行。
- **分类**：`DOCUMENT_CONTRACT_DEFECT / STATE_CONSUMER_DEFECT`
- **现场表现**：V25活动实施文件、current-handoff、经验门禁断言和OpenCode提示词把Candidate Gate通过终点写为 `gates_passed`；实际v1.1状态机从 `gates_running` 通过后进入 `approval_required`。OpenCode在运行时自行识别并采用正式状态。
- **已执行与未执行**：错误文字未产生非法状态写入；Runtime拒绝未知状态的既有保护未被绕过。
- **根因**：场景设计没有从 `WI_STATUSES`、状态迁移表和architecture_change Skill核对状态消费者，使用了描述性名称代替正式枚举。
- **影响**：可能使Agent尝试非法迁移、错误判断停止点或提前进入审批；文档、提示词和测试形成互相强化的错误契约。
- **正确做法**：所有提示词、Skill、Agent、文档和测试只能引用正式状态枚举和迁移表；Candidate Gate通过终点统一为 `approval_required`。
- **新增防护**：替换全部V25新增的 `gates_passed`，经验门禁检查正式停止状态，Agent/Skill契约测试覆盖architecture_change阶段表。
- **状态**：`FIXED_AUTOMATED_VALIDATED_REAL_SUCCESS_PATH_PENDING_ERR-075`。正式状态名和失败回收已验证；真实Gate通过进入approval_required仍被ERR-075阻断。
- **类防护**：`EXP-030`、`EXP-043`、`EXP-049`。


### ERR-070：专业设计Agent在受控Candidate写入阶段调用 `sf_safe_bash`

- **日期与阶段**：2026-08-04，WI-0004第一次Gate后的正式修复。
- **分类**：`AGENT_CONTRACT_DEFECT / TOOL_BOUNDARY_DEFECT / AVOIDABLE_HARDSTOP`
- **现场表现**：`sf-design` 使用 `sf_safe_bash` 尝试写 `.specforge/work-items/**`，Write Guard正确生成HardStop。该HardStop随后阻断合法 `sf_artifact_write`，由Orchestrator按 `operator_error` 放弃原动作、解析恢复并重新调度受控Tool。
- **已执行与未执行**：禁止写入被拦截；没有越权文件落盘；HardStop及resolution证据完整保留；后续受控Candidate写入成功。
- **根因**：通用Agent规则虽禁止Shell旁路治理，但 `sf-design` 和architecture_change Skill没有把 `sf_safe_bash`、只读调查工具、Candidate写入Tool和Runtime Manifest所有权写成精确可测试契约。
- **影响**：产生可避免HardStop、打断合法受控写入、增加恢复复杂度；若边界弱化可能演变为治理产物旁路写入。
- **正确做法**：专业Agent只使用Read/Glob/Grep等只读能力调查，只通过其拥有的受控Tool写Candidate；不得使用 `sf_safe_bash`、Shell、Node、Python或PowerShell写治理产物。受控Tool不足时停止并报告产品缺口。
- **新增防护**：补强 `sf-design` 和architecture_change Skill，新增Agent/Skill文本契约回归；Runtime Write Guard和HardStop行为保持不变。
- **状态**：`CLOSED_V28_AUTOMATED_AND_WORKDESK_TOOL_BOUNDARY_RETEST`。真实重试中sf-design只调用sf_artifact_write，未使用sf_safe_bash或Shell写治理文件。
- **类防护**：`EXP-004`、`EXP-015`、`EXP-036`、`EXP-044`、`EXP-050`。


### ERR-071：把已恢复HardStop的活动锁文件当作永久历史证据

- **日期与阶段**：2026-08-04，V26零写入前置审计。
- **分类**：`SCRIPT_DEFECT / EVIDENCE_LIFECYCLE_DEFECT / SCOPE_COUPLING_DEFECT`
- **现场表现**：V26在任何补丁写入前以 `missing hard_stop.json` 失败，`PATCH_FILES_APPLIED=0/13`。同一WI已存在 `hard_stop_resolution.jsonl`，其中保存了完整 `original_hard_stop`、恢复分类、恢复位置和安全替代Tool。
- **已执行与未执行**：SpecForge本地与远程均保持 `d6dc931072aca519354fb4bc0857a64aacc58961`，工作区干净；未应用补丁、未测试、未构建、未提交、未安装、未推送；WorkDesk未写入。
- **根因**：脚本没有区分“当前活动锁”和“已完成恢复的历史证据”。`sf_hard_stop_resolve` 把原始记录追加到 `hard_stop_resolution.jsonl` 后删除活动 `hard_stop.json`，因此恢复后缺少活动文件是正常生命周期结果。脚本还把WorkDesk场景证据完整性错误耦合成SpecForge独立源码修复的硬前置。
- **影响**：正确恢复后的现场被误判为证据缺失，导致与该活动锁无关的产品修复无法进入隔离验证；重复要求活动文件会诱导伪造或保留过期锁。
- **正确做法**：历史恢复证据以 `hard_stop_resolution.jsonl` 为稳定来源，并校验其中 `original_hard_stop`、`resolution_type`、`safe_alternative_tool` 和 `authoritative_state_at_resolution`。`hard_stop.json` 只表示当前活动锁，存在时单独报告，不要求恢复后保留。WorkDesk证据不足只记录 `INSUFFICIENT_EVIDENCE`，不得阻断与其无关的SpecForge隔离源码验证；远程、本地、进程、工作区和补丁源哈希仍必须在写入前严格通过。
- **新增防护**：新增 `EXP-051`；V27脚本包含无活动锁但有resolution log的生命周期自测，并把WorkDesk审计改为只读、非阻断证据；所有源码补丁只写入隔离副本。
- **状态**：`CLOSED_V28_V29_VALIDATED`。后续隔离验证和真实应用均未再要求已恢复的活动HardStop文件。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-011`、`EXP-015`、`EXP-021`、`EXP-042`、`EXP-051`。


### ERR-072：在内部依赖声明生成前执行daemon-core TypeScript检查，并遗漏可选工作流路径类型

- **日期与阶段**：2026-08-04，V27隔离工程验证。
- **分类**：`VALIDATION_ORDER_DEFECT / TYPESCRIPT_CONTRACT_DEFECT / ERROR_CLASSIFICATION_DEFECT`
- **现场表现**：V27定向测试73/73通过，但随后TypeScript阶段同时报告6项内部workspace包声明不可解析，以及 `gate-runner-v11.ts` 两处 `string | undefined` 不能赋给 `string`。验证器把环境准备错误和补丁真实类型错误合并为一个失败摘要。
- **已执行与未执行**：13个目标文件只应用在隔离副本；真实SpecForge、WorkDesk、真实用户级安装均未写入；未提交、未推送；daemon/OpenCode未启动。daemon-core build、全仓build、installer隔离验证尚未执行。
- **根因**：第一，daemon-core依赖的workspace包以各自 `dist/*.d.ts` 作为类型入口，V27在生成这些声明前直接运行daemon-core noEmit。第二，正式 `GateContext.workflowPath` 是可选字段，V27新增的Classification辅助函数错误收窄为必填 `string`，定向运行测试未覆盖编译期契约。
- **影响**：验证报告无法区分环境准备缺口与产品代码缺陷；真实类型错误会阻断daemon-core和全仓构建；缺省工作流路径若被强制断言为存在，可能在非完整调用上下文中产生静默放宽。
- **正确做法**：隔离验证先按正式workspace构建顺序生成daemon-core全部内部依赖声明，再运行定向测试，随后立即执行daemon-core TypeScript noEmit。辅助函数必须接受正式可选类型；工作流路径缺失时采用历史严格profile失败关闭。环境错误和代码错误必须分项报告。
- **新增防护**：V28新增workspace依赖预构建阶段、缺省workflowPath失败关闭回归、TypeScript检查和两级构建；验证摘要单独记录dependency preparation与typecheck结果。
- **状态**：`CLOSED_V28_VALIDATED`。V28完成依赖准备、74项定向测试、TypeScript、daemon-core build、全仓build、git diff check和隔离installer verify。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-011`、`EXP-015`、`EXP-021`、`EXP-052`。


### ERR-073：V31由Python直接启动Windows npm Bun包装器导致安装器未启动

- **日期与阶段**：2026-08-04，V31真实用户级升级前置。
- **分类**：`SCRIPT_DEFECT / WINDOWS_PROCESS_BOUNDARY_DEFECT / REPEATED_ERROR_ERR-024`
- **现场表现**：远程、本地、权威文件、进程边界均通过，随后Python以 `bun scripts/sf-installer.ts ...` 直接创建进程，Windows返回 `[WinError 2] 系统找不到指定的文件`；安装器未启动。
- **已执行与未执行**：未执行upgrade、verify、安装目录写入、WorkDesk写入、daemon/OpenCode启动、提交或推送。
- **根因**：重复违反ERR-024和EXP-002。Windows npm命令是包装器，不是Python可直接执行的稳定Win32程序；验证脚本没有先解析实际 `.cmd`/`.exe` 边界。
- **影响**：合法安装流程在入口前失败，并让用户重复下载和执行。
- **正确做法**：先通过 `where.exe` 和已知用户路径解析Windows可执行入口；`.cmd/.bat` 必须经 `COMSPEC` 调用；启动前记录最终路径、后缀和调用方式。
- **新增防护**：V32加入Bun路径解析和调用模式证据；V33进一步增加Windows后缀白名单并完成真实升级验证。
- **状态**：`CLOSED_V33_REAL_UPGRADE_VALIDATED`。
- **类防护**：`EXP-002`、`EXP-012`、`EXP-015`、`EXP-019`。


### ERR-074：V32把无扩展名POSIX Bun shim误当成Win32可执行文件

- **日期与阶段**：2026-08-04，V32真实用户级升级前置。
- **分类**：`SCRIPT_DEFECT / EXECUTABLE_CLASSIFICATION_DEFECT / WINDOWS_SHIM_DEFECT`
- **现场表现**：解析器选择 `C:\Users\luo\AppData\Roaming\npm\bun`，标记为 `DIRECT_EXECUTABLE`，Windows返回 `[WinError 193] %1 不是有效的 Win32 应用程序`；实际同目录存在 `bun.cmd`。
- **已执行与未执行**：安装器仍未启动；SpecForge、WorkDesk、用户级安装目录、daemon/OpenCode均未改变。
- **根因**：解析器仅判断“文件存在”，没有按Windows可执行后缀分类；`where bun`返回的无扩展名POSIX shim被错误排在 `bun.cmd` 前。
- **影响**：同类环境会稳定选择错误入口，重复ERR-024的环境边界问题。
- **正确做法**：Windows只接受 `.exe/.com/.cmd/.bat`；明确拒绝无扩展名shim；`.cmd/.bat`必须经 `cmd.exe`。不能把PATH首个文本文件解释为可执行程序。
- **新增防护**：V33只查询和接受Windows后缀，记录accepted/rejected候选；真实选择 `bun.cmd`、通过COMSPEC执行，Bun 1.3.11、upgrade、119/119 verify和源码部署一致性全部成功。
- **状态**：`CLOSED_V33_REAL_UPGRADE_VALIDATED`。
- **类防护**：`EXP-002`、`EXP-012`、`EXP-015`、`EXP-016`、`EXP-019`。


### ERR-075：Design Gate要求模块Design承载系统治理，但Write Guard禁止该模块投影使用system_governance

- **日期与阶段**：2026-08-04，WI-0004 V33安装后真实Candidate Gate恢复验证。
- **分类**：`GATE_DEFECT / GOVERNANCE_RESPONSIBILITY_DEFECT / PRODUCER_CONSUMER_CONTRACT_CONTRADICTION`
- **现场表现**：Runtime已正确物化5项Manifest并按Classification运行Gate；Design Gate仅扫描 `kind=design`，要求至少一个Design Candidate声明 `analysis_scope: system_governance`。sf-design按要求通过 `sf_artifact_write` 修复DOMAIN模块Design时，Write Guard以 `DESIGN_SCOPE_CONTRACT_MISMATCH` 拒绝，因为显式非默认模块投影只允许 `solution_design`。同一冻结Manifest中的Project Architecture Candidate已经合法声明 `system_governance`，但Design Gate没有消费它。
- **已执行与未执行**：WI-0004从 `gates_failed` 转到 `candidate_preparing` 后停止；Candidate未修改；Gate未重跑；无User Decision、Merge、Code Permission、业务代码、Git index或HardStop动作。
- **根因**：生产者责任和消费者责任没有闭合。Write Guard正确把系统级治理分析留在项目级整体设计，把模块投影限制为模块内部solution design；Design Gate却把“系统治理载体”错误收窄为模块Design Candidate，并忽略冻结Manifest中的Project Architecture Candidate。
- **影响**：合法生产者无法生成Gate要求的产物，形成不可满足契约；若放宽Write Guard，会迫使模块Design复制项目级治理事实，破坏Project Architecture与Module Design边界。
- **正确做法**：不修改Write Guard。Design Gate在系统治理必需时，必须从Runtime冻结Manifest读取Project Architecture Candidate，并按七章节和capability_verdict验证其 `system_governance`；模块Design继续按 `solution_design` 验证。Manifest外历史Architecture文件不得计入，非法路径或缺失文件必须失败关闭。允许默认模块Design按既有契约承载system_governance的兼容能力继续保留。
- **新增防护**：新增冻结Manifest Architecture载体正向回归、Manifest外历史文件排除、畸形Architecture失败关闭、Gate—Write Guard责任契约静态回归；V34只在隔离副本验证。
- **状态**：`FIX_IMPLEMENTED_PENDING_V35_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-021`、`EXP-047`、`EXP-053`。



### ERR-076：V34声明a0333ba基线却使用提交前旧临时树生成Source Contract

- **日期与阶段**：2026-08-04，V34 Design Governance Carrier隔离验证前置。
- **分类**：`SCRIPT_DEFECT / STALE_BASELINE_DEFECT / SOURCE_CONTRACT_MISMATCH / EVIDENCE_DEFECT`
- **现场表现**：V34声明 `baseline_head=a0333ba56854b26780960823b25db2faf67f080f`，但对P0实施文件要求旧哈希 `6bf1688c...`；本地实际哈希为已由V29/V30正式应用和提交的 `094a08e4...`。脚本在 `SOURCE_HASH` 阶段失败。
- **已执行与未执行**：Bundle完整性和进程边界通过；未创建隔离补丁状态，未修改真实SpecForge、WorkDesk、用户级安装或WI-0004，未提交、推送或启动daemon/OpenCode。
- **根因**：生成器复用了未绑定提交的 `/tmp/specforge-current` 旧树，并只把Manifest中的 `baseline_head` 改为新提交，没有从声明HEAD的精确字节重新生成全部Source Contract，也没有在发布ZIP前把每个源文件哈希与V30提交证据交叉验证。
- **影响**：正确的本地仓库被误判为基线漂移，用户重复下载和执行；如果脚本放宽哈希检查，则可能把基于旧文件生成的完整替换文件覆盖到新提交，丢失已经验证的治理记录。
- **正确做法**：每个包的Source Contract必须直接来自声明HEAD的精确文件字节；已有提交范围可使用已验证目标文件和提交证据重建，但必须逐文件校验。临时树只有在记录来源commit且所有源哈希与声明HEAD一致时才可复用。任一文件无法证明时标记 `INSUFFICIENT_EVIDENCE`，不得交付。
- **新增防护**：V35从 `a0333ba...` 精确基线重建8文件，保留V29/V30已提交内容，通过Manifest同时固定 `baseline_head`、全部Source SHA256和Target SHA256；经验门禁新增Source Contract—HEAD绑定断言。
- **状态**：`FIX_IMPLEMENTED_PENDING_V35_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-021`、`EXP-032`、`EXP-054`。



### ERR-077：V35新增测试把不受当前运行器支持的非对称匹配器嵌入数组深比较

- **日期与阶段**：2026-08-04，V35 Design Governance Carrier定向测试。
- **分类**：`TEST_DEFECT / ASSERTION_COMPATIBILITY_DEFECT / FALSE_NEGATIVE`
- **现场表现**：Architecture载体实现已返回唯一正确绝对路径，但测试使用 `toEqual([expect.stringContaining(...)])`；Bun 1.3.11把数组内非对称匹配器按普通值比较，正向场景失败。
- **已执行与未执行**：失败仅发生在隔离副本；真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。
- **根因**：测试没有按实际Bun/Vitest兼容行为验证断言组合，只验证了TypeScript语法。
- **影响**：正确产品行为被误报为失败，掩盖同轮其他真实回归。
- **正确做法**：先断言数组长度，再对规范化后的实际字符串执行 `toContain`；关键断言组合必须在实际Bun版本运行。
- **新增防护**：V36把路径断言改为显式字符串规范化，并在同一正向测试中验证Architecture和Module Design两条路径。
- **状态**：`FIX_IMPLEMENTED_PENDING_V36_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-055`。


### ERR-078：Classification驱动Gate忽略Candidate Phase，Design阶段提前要求Requirement

- **日期与阶段**：2026-08-04，V35现有Design-First真实Gate回归。
- **分类**：`GATE_DEFECT / PHASE_SCOPE_DEFECT / CLASSIFICATION_INTERSECTION_DEFECT`
- **现场表现**：`candidate_phase=design`、`design_changed=true`、`acceptance_criteria_changed=true` 时，`requiredCandidateKindsForGate` 和 `workflowSpecificGateStages` 同时要求Requirement Candidate与Requirements Gate，导致只应验证Design的阶段失败。
- **已执行与未执行**：该失败存在于 `main@a0333ba...` 基线逻辑；V35未修改Gate Runner，真实仓库和WorkDesk未写入。
- **根因**：ERR-068修复把Classification作为范围边界后，只对Task/Trace使用Phase裁剪，却没有对Requirement和Design专业阶段取交集。Classification被错误解释为“当前阶段立即执行全部未来产物”。
- **影响**：Design-First流程在Design阶段被迫提前生成Requirement，破坏专业Agent顺序；合法流程无法进入 `approval_required`。WI-0004使用full阶段，不改变其5项冻结范围。
- **正确做法**：Candidate Phase决定当前时间边界，Classification决定语义范围。Design阶段只要求Design；Requirements阶段要求已存在Design并执行Requirements Gate；Tasks/full阶段再对全部适用专业产物和Gate对账。Classification缺失继续采用历史严格profile。
- **新增防护**：V36修正两个Gate辅助函数，新增design/requirements/full三阶段独立回归，并复跑真实 `sf_gate_run` Design-First集成测试。
- **状态**：`FIX_IMPLEMENTED_PENDING_V36_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-021`、`EXP-048`、`EXP-056`。


### ERR-079：回归测试把文件末尾换行计算为额外逻辑行并形成基线假失败

- **日期与阶段**：2026-08-04，V35扩展回归测试集。
- **分类**：`TEST_FIXTURE_DEFECT / BASELINE_ATTRIBUTION_DEFECT / TEXT_NORMALIZATION_DEFECT`
- **现场表现**：`sf-orchestrator.md` 基线为319个实际文本行并带标准末尾换行，测试使用 `contract.split('\n').length < 320` 得到320并失败；V35没有修改该文件。
- **已执行与未执行**：失败只在隔离测试；没有产品或业务写入。
- **根因**：测试把分隔符后的空尾项当成逻辑行，同时验证器未在应用补丁前运行最小A/B基线控制，导致基线债务与补丁回归混在同一摘要。
- **影响**：无关历史测试阻断当前产品修复，并降低失败归因可信度。
- **正确做法**：文本行数按 `trimEnd()` 后的逻辑行计算；隔离补丁验证必须先运行受影响测试的基线控制，记录已存在失败，再要求补丁态全部通过。
- **新增防护**：V36修正行数断言；验证器在应用补丁前运行Design-First和Orchestrator两项基线控制，必须精确观察到ERR-078/ERR-079，再应用补丁并要求全部通过。
- **状态**：`FIX_IMPLEMENTED_PENDING_V36_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-011`、`EXP-015`、`EXP-057`。

### ERR-080：经验门禁仍断言上一轮临时状态，与同一经验台账的当前状态块冲突

- **日期与阶段**：2026-08-04，V36隔离定向测试。
- **分类**：`TEST_CONTRACT_DEFECT / STATE_ASSERTION_STALENESS / FALSE_NEGATIVE`
- **现场表现**：V36补丁态129项测试通过，唯一失败的经验门禁仍要求 `ERR-075=FIX_IMPLEMENTED_PENDING_V35_ISOLATED_VALIDATION` 和 `ERR-076=FIX_IMPLEMENTED_PENDING_V35_ISOLATED_VALIDATION`；同一经验文件的正式当前状态已经是 `ERR-075=BLOCKED_BY_ERR-088_ERR-089_PENDING_V47_ISOLATED_VALIDATION`、`ERR-076=CLOSED_V35_SOURCE_CONTRACT_VALIDATED`。
- **已执行与未执行**：失败仅发生于Git HEAD导出的隔离副本；真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改，daemon/OpenCode保持停止。
- **根因**：更新ERR条目和当前状态块时，没有同步审计经验门禁中对状态值的固定文本消费者；测试同时保留了上一轮临时状态，形成台账生产者与测试消费者自相矛盾。
- **影响**：V36产品实现、阶段—分类回归和其余129项测试均通过，但完整验证被一个过期状态断言阻断。
- **正确做法**：ERR状态改变时，必须把条目正文、当前状态块、current-handoff、活动实施文件和全部固定文本测试作为一个原子状态闭包更新；测试应断言同一轮最终状态，不得保留上一轮 `PENDING_Vxx`。
- **新增防护**：V37同步ERR-075—ERR-080最终状态，并由经验门禁精确断言当前状态块；验证器继续执行未打补丁A/B基线控制和完整130项定向测试。
- **状态**：`FIX_IMPLEMENTED_PENDING_V37_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-032`、`EXP-058`。


### ERR-081：生成状态文档时保留额外EOF空行，导致git diff --check阻断完整验证

- **日期与阶段**：2026-08-04，V37隔离验证。
- **分类**：`DELIVERY_FORMAT_DEFECT / EOF_WHITESPACE / VALIDATION_BLOCKER`
- **现场表现**：V37完成A/B基线控制、130项定向测试、TypeScript、daemon-core构建和全仓构建后，`git diff --check` 报告 `P0-contract-consumer-closure.md` 与 `current-handoff.md` 各新增一个文件末尾空白行。
- **已执行与未执行**：失败仅发生于Git HEAD导出的隔离副本；真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改，daemon/OpenCode保持停止。
- **根因**：文档追加逻辑使用 `rstrip() + block + "\n"`，而追加块本身已经包含结尾换行，最终形成两个LF；包内生成阶段没有对目标文本文件执行“恰好一个结尾换行”的字节级检查。
- **影响**：产品代码和130项定向测试均通过，但必需的 `git diff --check` 失败，因此不能进入真实应用或完成边界。
- **正确做法**：所有生成或重写的文本文件在封包前统一执行 `rstrip("\r\n") + "\n"`；补丁应用后、测试前和最终封包前均检查目标文本文件以且仅以一个换行结束。
- **新增防护**：V38在包生成器和隔离验证器中增加精确EOF检查；经验门禁固定断言ERR-081和EXP-059。
- **状态**：`FIX_IMPLEMENTED_PENDING_V38_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-032`、`EXP-059`。


### ERR-082：首个证据收集批处理使用错误换行和复杂CMD组合语法，脚本未进入有效执行

- **日期与阶段**：2026-08-04，V27输入证据收集。
- **分类**：`DELIVERY_SCRIPT_DEFECT / WINDOWS_CMD_PARSE / PREEXEC_FAILURE`
- **现场表现**：用户执行证据收集包后出现 `'nsions' 不是内部或外部命令` 和 `此时不应有 ||`，脚本没有完成证据收集。
- **根因**：批处理没有按真实Windows `cmd.exe` 解析契约验证；换行、编码和复杂 `||` 组合不适配目标环境。
- **影响**：用户无法生成V27输入证据，真实仓库和WorkDesk未变化。
- **正确做法**：CMD/BAT必须使用目标环境可识别编码、CRLF换行和简单顺序语句；封包前通过真实 `cmd.exe` 做无副作用语法烟雾测试。
- **新增防护**：`EXP-061`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-061`。

### ERR-083：多轮压缩包交付链接缺失或被其他标记污染，用户无法下载已生成文件

- **日期与阶段**：2026-08-04，V28、V31、V33、V36等压缩包交付。
- **分类**：`ARTIFACT_HANDOFF_DEFECT / DOWNLOAD_LINK / USER_BLOCKER`
- **现场表现**：文件已生成，但回复中的下载链接缺失、格式损坏或与引用标记混排，用户反馈“没有压缩包”或“无法下载压缩包”。
- **根因**：交付前没有对最终用户可见链接做独立检查。
- **影响**：正确产物无法交付，用户被迫重复请求下载；仓库未变化。
- **正确做法**：每轮只提供一个经存在性和SHA256验证的文件；链接必须是独立、完整、无嵌套的 `sandbox:/mnt/data/<exact-name>.zip`。
- **新增防护**：`EXP-062`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-062`。

### ERR-084：V37包生成器使用脆弱的整段文本锚点，两次因锚点不存在而中断

- **日期与阶段**：2026-08-04，V37包生成。
- **分类**：`PATCH_GENERATOR_DEFECT / BRITTLE_TEXT_ANCHOR / PREPACKAGE_FAILURE`
- **现场表现**：生成器先后报 `Could not locate V36 patch-scope anchor` 和 `V36 feedback anchor not found`。
- **根因**：直接依赖大段精确字符串，没有先读取实际源文本和验证锚点数量。
- **影响**：同一版本生成过程重复失败；真实仓库和WorkDesk未变化。
- **正确做法**：优先按标题、JSON结构或AST修改；文本锚点必须先验证匹配数恰好为1，并在临时副本完成修改和静态检查。
- **新增防护**：`EXP-063`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-063`。

### ERR-085：修改前门禁只要求读取已有经验，没有强制先补录上一轮和历史遗漏失败

- **日期与阶段**：2026-08-04，V38成功后的过程治理复核。
- **分类**：`PROCESS_GOVERNANCE_DEFECT / FAILURE_BACKFILL_GAP / REPEAT_RISK`
- **现场表现**：台账要求修改前读取经验，但ERR-082—ERR-084长期未登记，后续版本仍继续生成和验证。
- **根因**：门禁没有先要求失败盘点和 `UNRECORDED_FAILURES=0`。
- **影响**：重复错误检查可能在不完整台账上假通过。
- **正确做法**：每轮先盘点和补录全部失败，再重读更新后的经验台账；未补录时必须Fail Closed。
- **新增防护**：`EXP-060`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-060`。

### ERR-086：V39生成器假定其他工具的临时解压目录存在，跨运行环境后立即失败

- **日期与阶段**：2026-08-04，V39第一次生成。
- **分类**：`PATCH_GENERATOR_DEFECT / CROSS_TOOL_TEMP_PATH_ASSUMPTION / PREPACKAGE_FAILURE`
- **现场表现**：生成器复制不存在的已解压目录，触发 `FileNotFoundError`。
- **根因**：依赖另一个工具会话的临时目录，没有从当前环境已确认存在的V38 ZIP自举。
- **影响**：V39未生成，真实仓库和WorkDesk未变化。
- **正确做法**：生成器必须验证固定输入文件，并由本轮自行解压或创建目录。
- **新增防护**：`EXP-064`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-064`。

### ERR-087：V39生成器按记忆使用不存在的经验检查表固定句，结构定位前置失败

- **日期与阶段**：2026-08-04，V39第二次生成。
- **分类**：`PATCH_GENERATOR_DEFECT / STALE_ANCHOR_ASSUMPTION / PREPACKAGE_FAILURE`
- **现场表现**：生成器查找 `□ 已执行重复错误检查，确认未重复`，但V38真实文本为 `□ 已执行重复错误检查；当前问题已归入已有类别或新增 ERR/EXP`，因此锚点数量为0。
- **根因**：修改前没有先读取目标段落，仍按记忆构造锚点。
- **影响**：V39未生成，真实仓库和WorkDesk未变化。
- **正确做法**：修改脚本必须先读取当前目标结构，按标题或已验证的实际行定位；禁止根据记忆写锚点。
- **新增防护**：`EXP-065`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V39_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-065`。

### ERR-088：共享章节匹配器只支持直接括号后缀，真实Project Architecture标题被误判为缺失

- **日期与阶段**：2026-08-04，V43用户级升级后的WorkDesk WI-0004真实Gate重验。
- **分类**：`GATE_PARSER_DEFECT / REAL_ARTIFACT_TITLE / FALSE_NEGATIVE`
- **现场表现**：Runtime正确物化5项Candidate Manifest，9个Gate通过；`workflow_specific_gate`读取了Project Architecture Candidate，但把标题 `## 5. Solution Strategy — 架构决策（逐字继承现有设计事实）` 判定为缺少 `Solution Strategy`，继而报告没有合规的Project Architecture Candidate。
- **一级证据**：WI-0004 `architecture.candidate.md`、`workflow_specific_gate.json`、Gate Summary和OpenCode完整运行日志。
- **根因**：`buildTolerantHeaderRegex` 只允许规范章节名后直接跟全角/半角括号；真实标题使用破折号引入说明。V42正向测试只覆盖无后缀标准标题，没有使用真实项目标题。
- **影响**：ERR-078已在真实项目闭合；ERR-075的Architecture载体识别已进入正确消费者路径，但因标题解析假阴性仍无法进入 `approval_required`。
- **正确做法**：规范章节名必须位于标题开头；仅允许直接括号或由 `-`、`–`、`—`、`:`、`：` 引入的同一行说明后缀；继续拒绝嵌入式标题和无受控分隔符的任意后缀。
- **新增防护**：使用真实WorkDesk标题更新Architecture Carrier测试，并新增共享Matcher正向/反向回归。
- **状态**：`FIX_IMPLEMENTED_PENDING_V45_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-032`、`EXP-066`、`EXP-067`。

### ERR-089：V44标题后缀正则使用跨行空白，把下一行首条证据误吞为标题说明

- **日期与阶段**：2026-08-04，V44隔离定向测试。
- **分类**：`GATE_PARSER_REGRESSION / MULTILINE_WHITESPACE / BODY_TRUNCATION`
- **现场表现**：真实Architecture标题、Architecture Carrier及Design Governance测试通过，但3个Investigation Gate测试失败。合法计划和结论被判定失败；仅含Agent转述的负向夹具没有产生预期提示。
- **一级证据**：V44 `targeted-tests.log` 中3个 `investigation-artifact-gates.test.ts` 失败和c01d098基线源码。
- **根因**：V44在分隔符前使用 `\s*`。JavaScript中的 `\s` 包含CR/LF；在multiline模式下，`## 原始证据来源\n- EV-1...` 的换行和首个 `-` 被匹配成标题后缀，导致首条证据从章节正文中消失。同样机制影响候选假设、事实证据和Agent转述。
- **影响**：共享Matcher的Requirements和Design消费者出现正文截断回归；不能应用V44。
- **正确做法**：标题语法只能使用水平空白 `[ \t]`；hash间距、编号间距、后缀分隔符和结尾空白都不得使用可跨行的 `\s`。必须增加“标题下一行以 `-` 开头”的反向回归。
- **新增防护**：V45先证明c01d098上的Investigation回归基线通过，再应用单行Matcher并运行共享函数、Requirements、Design和Architecture Carrier测试。
- **状态**：`FIX_IMPLEMENTED_PENDING_V45_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-010`、`EXP-015`、`EXP-067`。

### ERR-090：V44两个固定文本测试未与最终状态生产者原子同步

- **日期与阶段**：2026-08-04，V44隔离定向测试。
- **分类**：`TEST_CONTRACT_DEFECT / FIXED_TEXT_CONSUMER / FALSE_NEGATIVE`
- **现场表现**：经验门禁仍断言ERR-075/ERR-078的V42待重验状态；新增ERR-088测试断言自然语言 `Candidate内容未修改`，而交接文件正式字段为 `CANDIDATE_CONTENT_CHANGED=NO`。两项测试失败。
- **一级证据**：V44 `targeted-tests.log` 中 `specforge-development-experience-gate.test.ts` 和 `specforge-development-err088.test.ts` 的实际Expected/Received。
- **根因**：V44更新经验台账和交接状态时没有同步既有固定文本消费者；新增测试又把人工概括当成正式生产者文本，没有先读取目标文件的精确字段。
- **影响**：正确文档状态被测试误判，完整验证被阻断。
- **正确做法**：状态生产者、既有经验门禁、新增专项测试和交接字段必须在同一目标字节集中同步；断言正式状态枚举和正式字段，不断言未写入文档的自然语言概括。
- **新增防护**：V45更新既有经验门禁的ERR-075/078状态，专项测试改为断言 `CANDIDATE_CONTENT_CHANGED=NO`，并固定ERR-088—090与EXP-066—068。
- **状态**：`FIX_IMPLEMENTED_PENDING_V45_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`。

### ERR-091：固定文本测试把字面量反斜杠t解释为真实制表符，正确文档被误判

- **日期与阶段**：2026-08-04，V45隔离定向测试。
- **分类**：`TEST_LITERAL_DEFECT / ESCAPE_SEMANTICS / FALSE_NEGATIVE`
- **现场表现**：V45的真实Architecture标题、共享Matcher、Investigation、Design Governance、经验门禁等143项测试通过；唯一失败是ERR-088专项测试断言P0文档包含 `标题内部空白全部使用[ \t]`。
- **一级证据**：V45 `targeted-tests.log` 显示测试源第54行使用普通TypeScript字符串；Expected运行时包含真实制表符，而P0文档正确保存字面量反斜杠加`t`。
- **根因**：测试把文档中的代码/正则字面量写进普通字符串，`\t`被JavaScript解释为制表符；没有使用 `String.raw` 或双重转义表达字面量。
- **影响**：产品Matcher和全部产品回归已经通过，但完整验证被一个测试字面量假失败阻断。
- **正确做法**：测试文档中的正则、路径、转义序列和代码字面量时，必须显式区分运行时字符与源文本；优先使用 `String.raw`，并增加正向字符码或精确字符串检查。
- **新增防护**：V46把该断言改为 `String.raw`，经验门禁固定ERR-091/EXP-069，并验证P0目标文件确实包含字面量反斜杠加`t`。
- **状态**：`FIX_IMPLEMENTED_PENDING_V46_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-069`。

### ERR-092：Bun测试环境中的String.raw把中文模板内容暴露为Unicode转义字面量

- **日期与阶段**：2026-08-04，V46隔离定向测试。
- **分类**：`TEST_LITERAL_DEFECT / TAGGED_TEMPLATE_TRANSFORM / FALSE_NEGATIVE`
- **现场表现**：V46仍为143项通过、1项失败。失败日志中的Expected不是中文正文，而是字面量 `\u6807\u9898...`；同时Expected中的 `\t` 已正确保持为反斜杠加`t`。
- **一级证据**：V46 `targeted-tests.log` 明确显示 `Expected to contain: "\\u6807\\u9898..."`，失败位置为 `specforge-development-err088.test.ts:59:16`；Received中的P0正文包含正确中文和字面量 `\t`。
- **根因**：在Bun 1.3.11测试转换/执行链中，非ASCII tagged template进入 `String.raw` 后暴露为Unicode转义源文本；`String.raw` 虽解决了 `\t` 控制字符问题，却把中文正文变成 `\uXXXX` 字面量。
- **影响**：V45/V46产品Matcher、真实Architecture标题、Investigation、Design Governance及143项其他测试均已通过；完整验证被一个测试表示方式假失败阻断。
- **正确做法**：匹配“中文正文 + 字面量反斜杠序列”时，使用普通字符串保存中文，并对反斜杠做双重转义，例如 `'标题内部空白全部使用[ \\t]'` 的测试源码必须包含两个反斜杠字符；不得使用未经目标运行时验证的非ASCII `String.raw` tagged template。
- **新增防护**：V47改为普通中文字符串加双反斜杠，增加测试源字节、运行时期望值和P0目标字节三方静态检查；产品文件保持V46字节不变。
- **状态**：`FIX_IMPLEMENTED_PENDING_V47_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-069`、`EXP-070`。

### ERR-093：正式Gate重验提示要求文件哈希，主编排代理在只读受限状态调用sf_safe_bash触发可避免HardStop

- **日期与阶段**：2026-08-04，V51用户级升级后的WorkDesk WI-0004正式Gate重验。
- **分类**：`VALIDATION_INSTRUCTION_DEFECT / TOOL_BOUNDARY_DEFECT / AVOIDABLE_HARDSTOP`
- **现场表现**：WI-0004初始状态为 `gates_failed`。主编排代理为满足“记录5个Candidate哈希”的验证提示，先后尝试通过 `sf_safe_bash` 调用 `certutil -hashfile` 和PowerShell `Get-FileHash`。Runtime以 `SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN` 生成 `HS-1785858808264`，随后又因活动HardStop拒绝第二次 `sf_safe_bash`。Orchestrator按 `operator_error` 放弃原动作、使用Read内容快照替代并恢复流程。
- **一级证据**：用户上传的OpenCode完整运行过程、WorkDesk `hard_stop_resolution.jsonl`、Gate Summary和 `workflow_specific_gate.json`。
- **已执行与未执行**：Shell命令均被拦截，没有Candidate或业务代码被Shell修改；HardStop正式解除；Gate只运行一次并10/10通过，最终进入 `approval_required`。
- **根因**：验证提示把“必须记录SHA256”写成无工具前提的绝对要求；`sf-orchestrator` 虽有bash权限拒绝和HardStop恢复契约，但没有明确规定在read/debug-only现场禁止通过 `sf_safe_bash` 执行只读哈希，也没有定义哈希Tool不可用时的等效证据策略。
- **影响**：产生可避免HardStop并向Work Item追加恢复记录；若无限重试会扩大操作噪声和治理状态写入，掩盖真正Gate验证。
- **正确做法**：受限状态只使用Read/Glob/Grep或正式只读Tool；没有获批哈希Tool时使用完整内容快照、路径、大小和只读元数据，明确报告 `HASH_EVIDENCE_UNAVAILABLE` 或等效内容对比，不触发Shell。
- **新增防护**：补强 `sf-orchestrator` 只读证据工具边界；`v11-agent-skill-contract-alignment.test.ts` 固定禁止certutil/Get-FileHash通过 `sf_safe_bash`；V52隔离验证。
- **状态**：`FIX_IMPLEMENTED_PENDING_V52_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-036`、`EXP-044`、`EXP-050`、`EXP-071`。

### ERR-094：远程源码调查首选git clone因执行环境DNS失败，必须切换官方直链并保留取证来源

- **日期与阶段**：2026-08-04，V52修改前远程源码调查。
- **分类**：`INVESTIGATION_TOOL_FAILURE / NETWORK_ENVIRONMENT / SOURCE_RETRIEVAL_FALLBACK`
- **现场表现**：内部只读命令 `git clone --depth 1 --branch main https://github.com/lyqstart/SpecForge.git` 失败，错误为 `Could not resolve host: github.com`。
- **一级证据**：工具原始错误、GitHub commit页面、同一commit固定的raw文件直链和下载结果。
- **根因**：容器命令执行环境当时无法解析GitHub域名；不是SpecForge仓库、代码或用户网络事实。
- **影响**：不能使用本地clone完成调查；若把该失败误判为仓库不可访问，会形成错误的 `INSUFFICIENT_EVIDENCE`。
- **正确做法**：固定远程commit SHA后，使用官方GitHub commit页面和该commit的raw文件直链取得源码；记录每个文件的来源与SHA256。只有所有官方读取入口均失败时才标记证据不足。
- **新增防护**：V52包保存远程取证失败与官方直链回退记录；新增 `EXP-072` 和经验门禁固定文本。
- **状态**：`CLOSED_V52_OFFICIAL_SOURCE_FALLBACK`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-060`、`EXP-064`、`EXP-072`。

### ERR-095：V52验证器把HardStop语义事实绑定到一手日志中不存在的人工合成字段

- **日期与阶段**：2026-08-05，V52隔离验证启动前的一手OpenCode证据检查。
- **分类**：`EVIDENCE_CONSUMER_DEFECT / SYNTHETIC_FIELD_COUPLING / FALSE_NEGATIVE`
- **现场表现**：V52在任何源码写入、隔离副本创建或测试运行前停止，`FAILED_STAGE=OPENCODE_EVIDENCE`，唯一缺失项为 `HARD_STOP_ID=HS-1785858808264`。
- **一级证据**：V52失败证据包、V52内置OpenCode完整日志和用户原始运行记录。日志实际包含：
  - `发现真实 HardStop：HS-1785858808264`
  - `hard_stop_id=HS-1785858808264`
  - `ACTIVE_HARD_STOP=NONE（本轮触发 HS-1785858808264...）`
  - `HARD_STOP_STATUS=RESOLVED（HS-1785858808264...）`
- **根因**：验证器把“HardStop ID等于HS-1785858808264”这一语义事实，错误实现为必须出现人工汇总格式 `HARD_STOP_ID=...`。该字段仅存在于V52设计文档，不是OpenCode原始输出契约。
- **影响**：完整一手证据被错误拒绝，V52没有进入真正的隔离验证；真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。
- **正确做法**：证据消费者必须验证事实组合，而不是要求来源生成不存在的统一字段。HardStop证据至少同时证明ID、拦截原因、正式解除类型、原动作放弃、未重试和最终状态。
- **新增防护**：V53验证器对OpenCode原始日志执行语义分组匹配；先验证V52失败证据确实只有该固定格式缺陷，再执行V52原定完整隔离验证。
- **状态**：`FIX_IMPLEMENTED_PENDING_V53_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-073`。

### ERR-096：旧HardStop测试仍把work_item.status当作必填字段，与当前元数据契约冲突

- **日期与阶段**：2026-08-05，V53隔离验证的远程基线控制。
- **分类**：`BASELINE_TEST_DRIFT / CONTRACT_CONSUMER_DEFECT / FALSE_FAILURE`
- **现场表现**：V53已通过V52失败对账、V51部署证据、OpenCode语义证据和WorkDesk只读证据，随后在未应用V53七文件补丁前运行基线测试。`v11-hard-stop-artifact-closure.test.ts` 精确失败2项：
  - 缺失字段测试仍要求错误列表包含 `status`
  - 合法样例仍写入 `status: created` 并期待通过
- **一级证据**：V53 `baseline-control.log`、远程 `artifact-schema-validation.ts` 和远程旧测试文件。
- **当前生产者契约**：`validateWorkItemJson` 只要求 `work_item_id` 与 `schema_version`；任何 `status` 字段均返回 `WORK_ITEM_STATUS_FORBIDDEN`，权威状态属于StateManager/events.jsonl。
- **根因**：实现已迁移到“work_item.json仅元数据、状态由StateManager持有”，旧v1.1回归测试没有同步；测试辅助fixture也残留 `status`。
- **影响**：完整基线被错误判红，V53未应用隔离补丁；若直接删除该测试会掩盖正式元数据契约。
- **正确做法**：修正测试而非放宽实现：
  - 缺失字段只要求 `schema_version`
  - 明确增加 `status` 必须被拒绝
  - 合法样例仅包含 `schema_version + work_item_id`
  - 辅助fixture移除 `status`
- **新增防护**：V54先在0796240基线上证明该文件精确失败2项，再应用精确8文件并要求同一测试文件全绿。
- **状态**：`FIX_IMPLEMENTED_PENDING_V54_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-074`。

### ERR-097：V54基线验证器写死无关通过数量49，正确的精确失败集合被再次误判

- **日期与阶段**：2026-08-05，V54隔离验证的ERR-096基线重现。
- **分类**：`VALIDATION_DEFECT / BRITTLE_COUNT_ASSERTION / FALSE_NEGATIVE`
- **现场表现**：V54运行未修改的 `v11-hard-stop-artifact-closure.test.ts`，进程退出码为1，且精确出现ERR-096的两个目标失败；日志实际汇总为 `52 pass / 2 fail / Ran 54 tests`。验证器同时硬编码要求 `49 pass`，因此以 `missing=["49 pass"]` 停止。
- **一级证据**：V54 `baseline-known-err096.log` 与V54 `summary.json`。
- **根因**：验证器需要确认的是“失败集合精确等于ERR-096两项”，却额外猜测并固定了与结论无关的通过数量；该数字没有从日志或固定源码自动推导。
- **影响**：正确重现的历史基线失败再次被拒绝；V54仍未应用8文件补丁，真实SpecForge、WorkDesk、WI-0004和用户级安装均未修改。
- **正确做法**：
  - 提取日志中的全部 `(fail)` 测试名
  - 要求集合精确等于两个目标失败
  - 解析 `pass`、`fail`、`Ran total tests`
  - 只校验 `fail=2` 且 `total=pass+fail`
  - 不硬编码与缺陷判定无关的pass数量
- **新增防护**：V55按失败集合和计数关系验真；先验证V54仅因 `49 pass` 假断言失败，再执行V54原定完整隔离验证。
- **状态**：`FIX_IMPLEMENTED_PENDING_V55_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-073`、`EXP-074`、`EXP-075`。

### ERR-098：V55封包静态审计全文件禁止49 pass，误伤必须保留的V54失败对账证据

- **日期与阶段**：2026-08-05，V55压缩包生成前静态审计。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / ASSERTION_SCOPE_DEFECT / SELF_CAUGHT`
- **现场表现**：V55文件修改已生成，但静态断言 `'"49 pass"' not in run.py` 失败，因此压缩包未生成。`49 pass` 已从ERR-096基线识别算法中删除，但仍必须出现在 `verify_v54_failure` 中，用于确认V54正是因该错误断言失败。
- **一级证据**：封包Python断言失败位置、V55 `run.py` 的V54失败对账函数和ERR-096基线解析函数。
- **根因**：静态审计检查了整个验证器文件，没有限定到被修复的 `BASELINE_KNOWN_ERR096` 解析代码块；混淆了“禁止继续使用错误规则”和“禁止记录历史错误字符串”。
- **影响**：没有向用户交付不完整包，也没有执行任何真实仓库或WorkDesk动作；但封包流程自身失败一次。
- **正确做法**：
  - 历史失败对账必须保留原始错误字符串
  - 防重复审计只检查当前执行算法所在代码块
  - 同时确认V54失败对账仍要求 `missing=["49 pass"]`
  - 确认新算法不把49作为pass数量契约
- **新增防护**：V55静态审计分别检查 `verify_v54_failure` 和 `BASELINE_KNOWN_ERR096` 两个作用域；包生成前再次执行真实V54日志解析演练。
- **状态**：`CLOSED_V55_PACKAGE_PREFLIGHT_CORRECTED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-073`、`EXP-075`、`EXP-076`。

### ERR-099：V55成功摘要仍使用V52旧常量，报告7文件和ERR-093/094但实际证据为8文件和ERR-093—098

- **日期与阶段**：2026-08-05，V55隔离验证完成后的证据复核。
- **分类**：`RESULT_REPORTING_DEFECT / STALE_CONSTANT / EVIDENCE_CONTRACT_MISMATCH`
- **现场表现**：V55全部测试、TypeScript、两级构建、`git diff --check`、隔离installer verify和WorkDesk审计通过；`target-hashes.json`、Git patch和Manifest均为精确8文件。但 `summary.json` 仍报告：
  - `ISOLATED_PATCH_ACTION=APPLIED_EXACT_7_FILES`
  - `FINAL_SCOPE=PASS_EXACT_7_FILES`
  - `BACKFILLED_ERROR_IDS=ERR-093,ERR-094`
- **一级证据**：V55 `summary.json`、`target-hashes.json`、`specforge-v55.patch`、Manifest和targeted-tests日志。
- **根因**：验证器的成功摘要沿用V52时期的手工常量；后续范围扩大和错误补录只更新了Manifest及补丁文件，没有让结果摘要从Manifest动态派生。
- **影响**：产品和测试验证实际成功，但证据包自相矛盾，不能作为真实应用依据；若继续会破坏修改范围审计和失败对账。
- **正确做法**：
  - `BACKFILLED_ERROR_IDS` 从Manifest的 `prior_failure_reconciliation` 读取
  - 文件数量从 `len(CHANGED_PATHS)` 派生
  - `isolated_patch_action` 和 `final_scope` 使用同一派生数量
  - 成功前比较summary预期、Manifest、target-hashes和Git diff文件集合
- **新增防护**：V56先对账V55“实际8文件成功、摘要旧常量”的精确矛盾；修正输出后重新执行完整隔离验证。
- **状态**：`FIX_IMPLEMENTED_PENDING_V56_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-075`、`EXP-077`。

### ERR-100：V56证据对账函数使用re.findall但验证器没有模块级导入re

- **日期与阶段**：2026-08-05，V56隔离验证的V55证据对账。
- **分类**：`VALIDATOR_DEPENDENCY_DEFECT / MISSING_MODULE_IMPORT / PREVALIDATION_FAILURE`
- **现场表现**：V56在 `verify_v55_evidence_mismatch` 中执行 `re.findall` 时抛出 `NameError: name 're' is not defined`。失败阶段为 `UNEXPECTED`。
- **一级证据**：V56 `summary.json` 与 `commands.log` 原始Traceback，定位到 `run.py` 的 `diff_paths = set(re.findall(...))`。
- **执行边界**：失败发生在V55证据对账期间，尚未读取或写入真实SpecForge源码，未创建隔离副本，未运行测试，未修改WorkDesk、WI-0004、用户级安装、Git index、提交或推送。
- **根因**：V55已知失败解析代码块内部曾局部执行 `import re`，但该导入只在 `main` 的局部作用域中有效；模块级 `verify_v55_evidence_mismatch` 无法访问。封包静态检查只执行 `compile()`，能验证语法但不能发现运行时名称解析缺失。
- **影响**：V56无法进入完整隔离验证；ERR-099修复方案尚未取得运行证据。
- **正确做法**：
  - 所有模块级函数使用的标准库必须模块级导入
  - 封包前不能只做 `compile()`
  - 必须实际加载最终验证器并调用关键纯证据对账函数
  - 依赖检查必须使用最终Manifest和真实历史证据包
- **新增防护**：V57增加模块级 `import re`；封包时通过 `importlib` 加载最终 `run.py`，替换证据路径并实际调用V55/V56对账函数。
- **状态**：`FIX_IMPLEMENTED_PENDING_V57_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-073`、`EXP-077`、`EXP-078`。

### ERR-101：V57成功摘要的适用经验规则仍使用旧硬编码，遗漏EXP-077与EXP-078

- **日期与阶段**：2026-08-05，V57隔离验证完成后的证据复核。
- **分类**：`RESULT_REPORTING_DEFECT / PARTIAL_MANIFEST_DERIVATION / EVIDENCE_CONTRACT_MISMATCH`
- **现场表现**：V57精确8文件隔离验证全部通过，摘要中的文件数量和错误ID已经从Manifest派生，但 `APPLICABLE_EXPERIENCE_RULES` 仍只到 `EXP-076`。V57包内Manifest正式值包含 `EXP-077,EXP-078`。
- **一级证据**：V57 `summary.json`、V57包内 `manifest.json`、`target-hashes.json`、`specforge-v57.patch` 和全部验证日志。
- **已确认成功事实**：
  - 目标哈希与Git patch均为精确8文件
  - 定向测试86/86通过
  - TypeScript、daemon-core构建、全仓构建通过
  - `git diff --check`通过
  - 隔离installer verify为119文件
  - WorkDesk保持不变
- **根因**：ERR-099只修正了文件范围和错误ID派生，未把 `prior_failure_reconciliation` 的其余字段统一改为Manifest单一事实源；`applicable_experience_rules` 仍是手工字符串。
- **影响**：V57产品和测试验证实际成功，但摘要与Manifest仍不完全一致，不能直接作为真实应用证据。
- **正确做法**：摘要中的以下字段全部从 `MANIFEST["prior_failure_reconciliation"]` 派生：
  - status
  - backfilled_error_ids
  - unrecorded_failures
  - experience_file_read
  - applicable_experience_rules
  - repeated_error_check
- **新增防护**：V58先证明V57仅存在该字段遗漏，再重新执行完整隔离验证；封包预检实际调用V57证据对账函数，并断言摘要生成代码不存在经验规则硬编码。
- **状态**：`FIX_IMPLEMENTED_PENDING_V58_ISOLATED_VALIDATION`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-077`、`EXP-078`、`EXP-079`。

### ERR-102：V59最终ZIP包含运行时生成的pyc，包内文件与Manifest大小及SHA256不一致

- **日期与阶段**：2026-08-05，V59成功证据上传后的独立封包完整性审计。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / TRANSIENT_CACHE_ARTIFACT / MANIFEST_INTEGRITY_MISMATCH`
- **现场表现**：V59交付ZIP整体SHA256与交付值一致，产品补丁8文件、V59证据摘要、目标哈希和测试日志均一致；但ZIP中的 `scripts/__pycache__/run.cpython-313.pyc` 实际大小为54627字节、SHA256为 `68c7911c08f4f4dbd92df6149669563cf17be29e3dae6ee24376f299af8a1252`，Manifest记录为50729字节、SHA256为 `e784ce002bc7bf7cf9ab2eece3ef286866e1dfa3eedb39b8ec0992fb5a7a1449`。
- **一级证据**：V59输入包中央目录、V59 `manifest.json`、独立逐文件SHA256审计结果；V59证据包SHA256为 `c690707c1b98a3cdb29b401af433fdd52c182f6245f3806a0647bc56b3963995`。
- **根因**：封包过程把Python运行时缓存纳入交付；Manifest生成后再次加载最终脚本，Python重写pyc，随后ZIP打包没有重新按最终ZIP条目核对Manifest。
- **影响**：V59产品补丁和隔离验证事实仍成立，但V59交付包不能满足自身完整性契约，不能直接进入真实应用。
- **正确做法**：
  - 交付包禁止包含 `__pycache__`、`.pyc`、临时日志和其他运行时可变缓存
  - 最终脚本使用禁止写字节码的导入方式做预检
  - ZIP生成后重新打开最终ZIP，逐项比较Manifest记录的路径、大小和SHA256
  - 最终ZIP条目集合必须等于Manifest声明集合加Manifest自身
  - 只有最终ZIP审计通过后才能向用户提供下载
- **新增防护**：V60封包器排除全部Python缓存，增加最终ZIP重开审计、正反例纯函数测试和Manifest集合校验。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-032`、`EXP-062`、`EXP-064`、`EXP-077`、`EXP-078`、`EXP-080`。

### ERR-103：V60已知失败集合解析未剥离Bun耗时后缀，正确ERR-096基线再次被误判

- **日期与阶段**：2026-08-05，V60隔离副本的ERR-096基线控制。
- **分类**：`VALIDATOR_DEFECT / VOLATILE_OUTPUT_SUFFIX / FAILURE_SET_FALSE_NEGATIVE`。
- **现场表现**：V60真实日志仍是批准的两个ERR-096失败，统计为 `52 pass / 2 fail / 54 total`；其中 `accepts valid work_item.json` 行尾附带运行时耗时 `[16.00ms]`，另一失败没有耗时后缀。验证器直接截取 `(fail)` 后全部原始文本，导致语义相同的失败名称与稳定批准集合不相等。
- **一级证据**：`SpecForge-v60-execution-evidence-20260805-014043.zip`，SHA256为 `8fc353fdd8e9b0c3e8a05345a744d0750927103750b9908f735be80e4c9d7a7a`；其中 `summary.json`、`logs/isolated-baseline-err096.log` 和V60 `run.py`。
- **执行边界**：失败发生在隔离补丁应用前；真实SpecForge、用户级安装、Git index、提交、推送和WorkDesk均未修改。
- **根因**：验证器把Bun输出中的非语义运行时装饰当作测试身份的一部分；批准失败集合虽然稳定，但解析生产者没有先标准化ANSI控制符和行尾耗时。
- **影响**：ERR-096产品与测试漂移结论没有变化，V59/V60精确8文件方案没有出现新的产品缺陷；V60被正确阻断在真实应用前。
- **正确做法**：
  - 测试身份只取 `(fail)` 后的语义名称
  - 删除ANSI控制符和行尾 `[数字+时间单位]` 装饰
  - 批准失败集合由Manifest单一事实源提供
  - 精确比较语义失败集合，并校验 `fail_count == len(expected)` 与 `total == pass + fail`
  - 解析函数与命令执行分离，使用真实历史日志和合成变体做正反例调用
- **新增防护**：V61增加纯函数 `parse_bun_test_result` 和 `validate_known_failure_result`；封包前实际读取V60原始失败日志，并覆盖有耗时、无耗时、不同耗时单位、错误失败名称和错误统计五类用例。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-068`、`EXP-073`、`EXP-075`、`EXP-078`、`EXP-081`。

### ERR-104：V61远程HEAD预检因Windows Git schannel TLS握手失败而停止

- **日期与阶段**：2026-08-05，V61真实执行的远程基线预检。
- **分类**：`ENVIRONMENT_FAILURE / GIT_SCHANNEL_TLS_HANDSHAKE / REMOTE_READ_UNAVAILABLE`。
- **现场表现**：本地分支为 `main`、HEAD为 `07962406e8ddae9daaf456a4cb185dfe0a340cf3`、工作树干净、remote `yc` URL正确；执行 `git ls-remote yc refs/heads/main` 时返回 `schannel: failed to receive handshake, SSL/TLS connection failed`。
- **一级证据**：`SpecForge-v61-execution-evidence-20260805-015310.zip`，SHA256为 `cf656404060fbe9a02e1d6e7b03345e375dcc55d4a9ff007543b4b67fc0e6bc4`；其中 `summary.json` 和 `commands.log`。
- **执行边界**：失败发生在远程HEAD读取阶段；精确8文件未写入，用户级安装、Git index、提交、推送和WorkDesk均未修改。
- **根因**：验证器只有Windows Git默认schannel一个远程读取入口；瞬时TLS握手失败被正确识别为环境故障，但没有按既有远程源码回退经验使用官方GitHub API的独立TLS实现。
- **影响**：远程 `main`、权威文件和8文件产品方案没有出现新缺陷；V61按Fail Closed停止。
- **正确做法**：
  - 保留默认 `git ls-remote` 的原始失败证据
  - 使用Git for Windows的OpenSSL后端作为第二入口
  - 仍失败时通过Python标准库访问官方GitHub Ref API并严格解析 `refs/heads/main` 的40位SHA
  - 任一入口返回的SHA必须与Manifest基线精确一致，错误SHA必须阻断
  - 推送使用显式 `--force-with-lease=refs/heads/main:<baseline>` 防止远程并发变化
  - 推送返回异常时重新读取远程；远程已等于本次commit才能判定成功
- **新增防护**：V62把远程HEAD解析和证据选择拆为纯函数；封包前覆盖Git成功、Git失败/API成功、错误ref、错误SHA和全部入口失败，并嵌入V61原始失败证据。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-060`、`EXP-072`、`EXP-073`、`EXP-078`、`EXP-082`。

### ERR-105：V62封包前py_compile再次生成__pycache__并被Manifest预检阻断

- **日期与阶段**：2026-08-05，V62最终Manifest生成前。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / PYTHON_BYTECODE_RECREATED / REPEATED_ERR_102_CLASS`。
- **现场表现**：V62最终脚本完成语法编译后产生 `scripts/__pycache__/run.cpython-313.pyc`，大小62906字节、SHA256为 `be4129f197bcf6b15133cfba097afc83eab53658f88e8abea2b2e16541e5068f`；Manifest生成器扫描到禁止条目后立即停止，V62 ZIP未生成。
- **一级证据**：V62封包目录字节审计、Manifest生成器退出信息 `forbidden cache scripts/__pycache__/run.cpython-313.pyc`。
- **执行边界**：仅发生在封包临时目录；真实SpecForge、WorkDesk、用户级安装、提交和推送均未执行。
- **根因**：虽然EXP-080已要求禁止字节码，但语法检查命令仍使用会写入pyc的默认 `python -m py_compile`，清缓存只发生在检查之前，没有在每个Python执行步骤之后再次扫描。
- **影响**：V62远程回退设计和精确8文件产品范围未被否定，但V62不得交付。
- **正确做法**：
  - 禁止使用会主动写缓存的 `python -m py_compile`；语法检查使用内存中的 `compile(source, filename, "exec")`
  - 每个compile/import/self-test步骤后立即递归扫描 `__pycache__` 和 `*.pyc`
  - 最终Manifest生成前清理并扫描一次
  - ZIP生成后重开并再次证明禁止条目为零
  - 发现缓存时不得静默删除后继续，必须记录失败并生成下一版本
- **新增防护**：V63增加字节码零产生预检脚本，实际执行compile、import和纯函数测试后逐阶段扫描；最终Manifest和ZIP重开审计重复验证。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-060`、`EXP-078`、`EXP-080`、`EXP-083`。

### ERR-106：V63用户级验证器把Manifest的files对象误判为列表，成功升级被报告为files=None

- **日期与阶段**：2026-08-05，V63真实提交推送后的 `USERLEVEL_VERIFY`。
- **分类**：`VALIDATOR_DEFECT / MANIFEST_SCHEMA_SHAPE_MISMATCH / OBJECT_LIST_CONFUSION`。
- **现场表现**：V63已将精确8文件提交为 `688cf64c6e190a707f9f0e7306db5cf474f0ae35` 并推送到远程 `main`；随后 `bun scripts/sf-installer.ts upgrade --force` 和正式 `bun scripts/sf-installer.ts verify` 均退出0，正式校验明确通过119个文件。包内验证器读取正确的 `%USERPROFILE%\.config\opencode\specforge-manifest.json`，但要求 `files` 必须是列表；真实Manifest的 `files` 是以相对路径为键的对象，因此生成 `files=None` 假失败。
- **一级证据**：`SpecForge-v63-execution-evidence-20260805-090719.zip`，SHA256为 `a21ba55d2540b53cd62cd8b29d1306256987091db3deaf31bab559eddb98c9ca`；其中 `summary.json`、`commands.log`、`remote-after-push.json`、V63 `run.py` 和真实隔离安装生成的 `specforge-manifest.json`。
- **已执行事实**：真实仓库已应用精确8文件；提交和推送成功；远程HEAD为 `688cf64c6e190a707f9f0e7306db5cf474f0ae35`；用户级升级命令和正式119文件校验均成功；WorkDesk、WI-0004、User Decision、Merge、Code Permission、daemon和OpenCode动作均未执行。
- **根因**：验证器没有从安装器生产者Schema和真实Manifest确定集合形状，而是凭字段名把 `files` 假定为列表。正式Manifest契约是 `files: Record<relativePath, entry>`，不是数组。
- **影响**：SpecForge产品修改、提交、推送和用户级部署事实有效，但V63成功摘要未形成，状态消费者仍停在执行前描述。
- **正确做法**：
  - 用户级文件完整性读取 `%USERPROFILE%\.config\opencode\specforge-manifest.json`
  - `files` 必须是对象且精确119项，`managed_agents` 必须是数组且精确9项
  - 每个 `files` 值必须包含合法 `sha256`、`size` 和 `type`
  - 对Manifest记录的每个文件重新计算大小和SHA256
  - 封包前用V63真实Manifest做正例，并用 `files` 列表、空对象、错误数量和错误Agent集合做反例
- **新增防护**：V64把Manifest Schema解析和文件完整性检查拆为纯函数；封包前实际加载V63真实Manifest执行正反例，并在任何仓库修改前重新运行正式installer verify和119/9逐文件审计。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-044`、`EXP-058`、`EXP-068`、`EXP-073`、`EXP-078`、`EXP-084`。

### ERR-107：V63升级成功后未立即记录动作状态，失败摘要误报REAL_INSTALL_ACTION=NOT_PERFORMED

- **日期与阶段**：2026-08-05，V63 `USERLEVEL_VERIFY` 失败摘要生成阶段。
- **分类**：`EVIDENCE_REPORTING_DEFECT / ACTION_STATUS_UPDATED_TOO_LATE / EXECUTION_FACT_LOST`。
- **现场表现**：`commands.log` 证明用户级 `upgrade --force` 与正式 `verify` 已成功执行，但V63只在后续自定义Manifest校验全部通过后才设置 `real_install_action=UPGRADED_USERLEVEL_119_OF_119`。ERR-106先发生后，摘要保留初始化值 `NOT_PERFORMED`，与真实执行事实冲突。
- **一级证据**：同一V63证据包中的 `commands.log`、`summary.json` 和V63 `run.py`；脚本中动作状态赋值位于升级、正式verify和自定义校验之后。
- **根因**：有副作用动作的执行状态与后续证据验证状态被绑定到同一个迟延赋值点，导致后续验证失败覆盖已经成立的动作事实。
- **影响**：没有产生第二次安装或产品损坏，但执行摘要不可信，无法直接作为部署生命周期状态来源。
- **正确做法**：
  - 每个有副作用命令退出0后立即固化对应动作状态
  - 动作事实与后续验证事实使用不同字段
  - 后续验证失败只能改变验证状态，不得把已执行动作回写为未执行
  - 摘要必须由不可变动作事件和验证结果分别派生
- **新增防护**：V64从V63命令日志独立解析升级、正式verify、提交和推送事实；V64自身不重复升级，明确报告 `V64_REAL_INSTALL_ACTION=NOT_PERFORMED` 与 `V63_USERLEVEL_UPGRADE=CONFIRMED_SUCCESS`，并用“动作成功、后续校验失败”反例测试状态生成。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-045`、`EXP-058`、`EXP-073`、`EXP-077`、`EXP-078`、`EXP-085`。

### ERR-108：V64子任务关闭状态被无作用域地写成当前任务关闭，并把P0未完成状态错误投影为可进入下一阶段

- **日期与阶段**：2026-08-05，V64证据审计后的下一阶段影响分析。
- **分类**：`EVIDENCE_REPORTING_DEFECT / LIFECYCLE_SCOPE_AMBIGUITY / P0_P1_BOUNDARY_CONFLICT`。
- **现场表现**：`current-handoff.md` 第十三节明确要求P0达到 `COMPLETED` 后才能进入P1；`P0-contract-consumer-closure.md` 顶部和关闭条件仍明确为 `IN_PROGRESS`，并保留Code Permission、实际代码消费者、破坏性变更、Promotion、Merge、Verification和Close的证据不足项。但V64尾部使用无父阶段作用域的 `CURRENT_TASK_STATUS=CLOSED` 和 `NEXT_ACTION=START_NEXT_AUTHORITY_PHASE_ONLY_AFTER_NEW_IMPACT_ANALYSIS`，可能被下游解释为P0已完成并可启动P1。
- **一级证据**：远程 `main@8aed1e0329cddd823e5c643ed16df99549d4d94e` 的 `current-handoff.md`、`P0-contract-consumer-closure.md`；V64执行证据中的 `WORKDESK_WI0004_STATE=approval_required`、`WI0004_ACTION=NOT_PERFORMED`、`USER_DECISION_ACTION=NOT_PERFORMED`、`MERGE_ACTION=NOT_PERFORMED`、`CODE_PERMISSION_ACTION=NOT_PERFORMED`。
- **根因**：状态投影没有区分“V64证据消费子任务”与“P0 Contract Consumer父阶段”；成功摘要直接生成下一动作，没有先校验父阶段关闭条件和剩余 `INSUFFICIENT_EVIDENCE`。
- **影响**：未修改产品代码、WorkDesk、Gate或Runtime，但错误的下一动作可能导致P1提前开始，违反当前实施顺序和修改范围治理。
- **正确做法**：
  - 子任务状态必须带明确作用域，例如 `V64_TASK_STATUS`
  - 父阶段状态必须独立记录，例如 `P0_OVERALL_STATUS`
  - 下一动作必须由父阶段关闭条件派生，不能只由最近一次包执行成功派生
  - 父阶段存在证据不足时，后续阶段固定为 `NOT_STARTED`
  - 当前用户边界阻断父阶段后续动作时，明确记录需要先解决边界，不得隐式越过
- **新增防护**：V65新增独立状态回归，固定验证P0仍为 `IN_PROGRESS`、V64子任务为 `CLOSED`、P1为 `NOT_STARTED`，并禁止无作用域的 `CURRENT_TASK_STATUS=CLOSED` 和提前进入下一阶段的旧下一动作。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-033`、`EXP-035`、`EXP-045`、`EXP-058`、`EXP-060`、`EXP-068`、`EXP-077`、`EXP-079`、`EXP-086`。


### ERR-109：V65修改状态生产者后遗漏两个既有固定文本消费者，正确状态被旧CURRENT_TASK_STATUS断言阻断

- **日期与阶段**：2026-08-05，V65隔离定向测试阶段。
- **分类**：`TEST_DRIFT / STALE_FIXED_TEXT_CONSUMER / IMPACT_SCOPE_OMISSION`。
- **现场表现**：V65新增的 `specforge-p0-phase-boundary.test.ts` 已通过，证明P0父阶段保持 `IN_PROGRESS`、V64子任务为 `CLOSED`、P1为 `NOT_STARTED`。但 `specforge-development-experience-gate.test.ts` 和 `specforge-development-err088.test.ts` 仍要求 `current-handoff.md` 包含已经由ERR-108废止的 `CURRENT_TASK_STATUS=CLOSED`，导致隔离定向测试4项通过、2项失败。
- **一级证据**：`SpecForge-v65-execution-evidence-20260805-101157.zip` 的 `logs/isolated-targeted-tests.log`、`summary.json`、`baseline-state-control.json` 和 `target-state-control.json`。证据同时证明真实SpecForge、WorkDesk、用户级安装、提交和推送均未执行。
- **根因**：V65影响分析识别了状态生产者和新增回归，但冻结范围前没有检索所有读取 `CURRENT_TASK_STATUS=CLOSED` 的既有固定文本消费者；新测试与旧测试形成互斥契约。
- **影响**：未产生真实仓库或业务项目变更，但V65无法进入真实应用。若仅删除失败断言而不建立完整消费者集合，会继续留下状态治理盲区。
- **正确做法**：
  - 状态生产者字段变更前，必须检索仓库内全部固定文本、Schema、解析器和文档消费者
  - 新旧消费者必须在同一修改范围原子同步
  - 基线控制必须用真实失败日志比较精确失败集合，不固定无关pass数量
  - 目标测试必须同时证明新作用域状态存在、旧无作用域状态不存在
  - 新增回归不能替代既有消费者对账
- **新增防护**：V67把两个实际失败的既有测试加入范围；封包验证器用V65真实日志执行正向、无耗时后缀、错误失败名、错误计数和错误退出码反例；隔离阶段直接在8aed基线上应用全部六文件完成闭包，不再修改工作树复现历史失败。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-017`、`EXP-033`、`EXP-035`、`EXP-045`、`EXP-058`、`EXP-060`、`EXP-068`、`EXP-073`、`EXP-074`、`EXP-077`、`EXP-079`、`EXP-086`、`EXP-087`。


### ERR-110：V66历史失败复现错误复用V66当前目标补丁，V65旧测试被目标修复提前消除

- **日期与阶段**：2026-08-05，V66隔离历史失败控制阶段。
- **分类**：`VALIDATOR_DEFECT / HISTORICAL_REPRODUCER_SOURCE_CONFUSION / SIDE_EFFECT_CONTROL_DEFECT`。
- **现场表现**：V66已用V65真实日志正确解析精确两个失败和 `4 pass / 2 fail / 6 total`，但随后有副作用复现返回 `6 pass / 0 fail`，验证器以 `V65_FAILURE_PARSER=expected nonzero return code` 停止。
- **一级证据**：`SpecForge-v66-execution-evidence-20260805-102914.zip` 的 `summary.json`、`commands.log`、`logs/isolated-v65-test-drift.log`；V66包中 `apply_v65_reproducer()`、`run_v65_drift_control()` 和当前 `patch/` 文件。
- **根因**：历史复现函数从当前包 `patch/` 目录复制4个文件；这些文件已经包含V66目标修复，不是V65冻结目标。历史证据源与当前目标补丁共用同一目录，并通过有副作用执行函数重复制造已经存在的一手失败。
- **影响**：V66在真实仓库写入、安装、提交、推送和WorkDesk动作前失败关闭，没有产生产品或业务项目变更。
- **正确做法**：
  - 已有真实历史日志时只调用纯解析函数，不再修改工作树复现同一失败
  - 历史失败证据与当前目标补丁必须是不同事实源
  - 必须重建历史状态时，独立保存历史源/目标文件和哈希，不得读取当前 `patch/`
  - 纯解析验证完成后，当前目标只在当前基线上应用一次
  - 正反例必须覆盖错误退出码、错误失败集合、错误数量和错误动作状态
- **新增防护**：V67删除V65有副作用复现函数；封包前实际加载最终脚本，用V65真实失败日志和V66真实失败证据调用全部新增纯解析函数，并检查脚本中不存在历史复现入口。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-045`、`EXP-058`、`EXP-073`、`EXP-074`、`EXP-077`、`EXP-078`、`EXP-079`、`EXP-087`、`EXP-088`。


### ERR-111：V67草稿状态文档再次产生额外EOF空白行，被git diff --check阻断

- **日期与阶段**：2026-08-05，V67封包前8aed静态Git对账。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / EOF_WHITESPACE / REPEATED_ERR081_CLASS`。
- **现场表现**：`git diff --check` 报告 `current-handoff.md` 和 `P0-contract-consumer-closure.md` 各有 `new blank line at EOF`。
- **一级证据**：V67封包前临时8aed仓库的 `git diff --check` 原始输出；两个目标文件的字节结尾。
- **根因**：追加章节后使用了带前后换行的文本拼接，没有在目标哈希计算前执行EXP-059规定的单LF规范化。
- **影响**：V67尚未生成最终ZIP，真实SpecForge、WorkDesk、安装、提交和推送均未执行。
- **正确做法**：所有生成文本在计算目标哈希和Manifest前统一执行 `content.rstrip("\r\n") + "\n"`，并验证 `endswith(b"\n")` 且不以 `b"\n\n"` 结束。
- **新增防护**：V67封包预检对全部patch文本执行单LF检查，并在8aed临时Git仓库再次执行 `git diff --check`。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-059`、`EXP-080`。

### ERR-112：V67隔离证据使用普通git diff，遗漏8aed中不存在的新增测试文件

- **日期与阶段**：2026-08-05，V67封包前Manifest、Git diff和实际文件集合对账。
- **分类**：`EVIDENCE_REPORTING_DEFECT / UNTRACKED_DIFF_OMISSION / MANIFEST_DIFF_SET_MISMATCH`。
- **现场表现**：Manifest和实际修改集合为6文件，但普通 `git diff --name-only` 只报告5文件；遗漏 `source_contract=ABSENT` 的新增 `specforge-p0-phase-boundary.test.ts`。
- **一级证据**：8aed临时Git仓库的 `git status --short`、`git diff --name-only` 和Manifest.changed_paths集合。
- **根因**：普通Git diff只包含tracked改动；验证器在生成二进制patch前没有把Manifest精确路径暂存，因此untracked新增文件无法进入证据patch。
- **影响**：不会改变产品字节，但若未阻断，证据包中的Git patch将少一个实际修改文件，违反Manifest单一事实源和完整范围证据合同。
- **正确做法**：
  - 隔离验证完成后只暂存Manifest.changed_paths
  - cached diff路径集合必须精确等于Manifest.changed_paths
  - 使用 `git diff --cached --binary` 捕获包含新增文件的完整patch
  - 暂存仅发生在可删除的隔离仓库，不提前改变真实仓库index
- **新增防护**：V67增加隔离cached diff集合门禁；封包静态预检以8aed真实基线验证6文件集合和完整binary patch。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-077`、`EXP-080`、`EXP-089`。


### ERR-113：V68独立项目种子CLI入口判断假定process.argv[1]必然存在，纯模块导入在封包前失败

- **日期与阶段**：2026-08-05，V68独立业务项目种子封包前功能预检。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / SEED_ENTRYPOINT_IMPORT_ASSUMPTION / MODULE_SIDE_EFFECT_BOUNDARY`。
- **现场表现**：使用Node以纯ES Module方式导入 `src/cli/main.js` 并调用导出的 `runCli()` 时，`process.argv[1]` 为 `undefined`；模块顶层直接执行 `pathToFileURL(process.argv[1])`，抛出 `ERR_INVALID_ARG_TYPE`。V68尚未生成最终ZIP，真实SpecForge、WorkDesk、用户级安装和独立验证项目均未修改。
- **一级证据**：V68封包前Node功能预检的原始异常；种子 `src/cli/main.js` 顶层入口判断；修复后的纯导入正向回归。
- **根因**：命令行直接运行场景被错误当成模块加载的唯一场景，入口判断没有先验证 `process.argv[1]` 是否为字符串，导致可复用模块在导入阶段产生副作用失败。
- **影响**：若未在封包前阻断，Bun测试导入CLI模块或后续Contract消费者测试可能因运行器参数形状差异失败，形成与P0治理无关的业务种子噪声。
- **正确做法**：
  - CLI模块必须先导出纯业务入口，再以可选的命令行路径判断是否直接执行
  - 只有 `process.argv[1]` 为非空字符串时才能调用 `pathToFileURL`
  - 封包前必须同时验证直接运行和纯模块导入
  - 种子功能预检失败必须在交付前修复，不能交给用户环境发现
- **新增防护**：V68把入口判断改为可空检查；封包前使用不提供脚本参数的纯ES Module导入调用 `runCli()`，同时执行直接CLI、业务函数正反例和最终种子哈希对账。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-023`、`EXP-058`、`EXP-078`、`EXP-090`。


### ERR-114：V68新增ERR-113测试断言错误引用另一测试块局部变量，语法转译通过但语义作用域无效

- **日期与阶段**：2026-08-05，V68精确6文件封包前测试消费者静态审计。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / TEST_SCOPE_REFERENCE_ERROR / TRANSPILE_ONLY_FALSE_CONFIDENCE`。
- **现场表现**：`specforge-development-experience-gate.test.ts` 在“完整下载包”测试块新增 `expect(experience)`，但 `experience` 只在前一个测试块中声明。`transpileModule()`只做语法转译而未报告未定义标识符；人工作用域对账发现完整TypeScript检查会产生语义错误。
- **一级证据**：V68目标测试文件的局部变量声明范围；TypeScript语法转译结果；修复后当前测试块独立读取经验文件并通过语义未定义标识符检查。
- **根因**：封包预检把无类型语义的转译成功误当成完整TypeScript检查，并在复制断言时没有同时复制该断言依赖的局部生产者。
- **影响**：若未阻断，V68会在用户环境的TypeScript或定向测试阶段失败；真实SpecForge、WorkDesk、用户级安装和独立验证项目仍未改变。
- **正确做法**：
  - 新增测试断言时必须列出它依赖的局部变量和文件读取生产者
  - 语法转译不能替代作用域、名称解析和完整TypeScript检查
  - 封包前至少对新增标识符执行语义未定义引用检查
  - 依赖局部变量的断言必须与变量声明处于同一测试作用域
- **新增防护**：V68在目标测试块内独立读取经验台账；封包前使用TypeScript Program语义诊断检查新增测试不存在未定义 `experience`，用户执行时仍运行正式TypeScript、定向测试和完整构建。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-022`、`EXP-058`、`EXP-078`、`EXP-091`。


### ERR-115：使用CMD的type管道把UTF-8中文提示词写入clip，OpenCode粘贴结果乱码

- **日期与阶段**：2026-08-05，V68独立P0验证项目准备完成后、WI-0001尚未执行前。
- **分类**：`PACKAGE_PREFLIGHT_DEFECT / WINDOWS_TEXT_TRANSPORT / REPEATED_USER_VISIBLE_ENCODING_FAILURE`。
- **现场表现**：`prompts/WI-0001.txt` 文件内容和UTF-8字节正确；用户执行 `type "prompts\WI-0001.txt" | clip` 后，在OpenCode粘贴得到乱码。daemon已由用户手工启动，但WI-0001提示词尚未成功提交，Work Item流程未开始。
- **一级证据**：V68生成的UTF-8提示词文件；用户实际CMD命令；OpenCode粘贴乱码反馈；远程经验台账和current-handoff中不存在 `clip`、`CF_UNICODETEXT` 或对应往返测试。
- **根因**：把“源文件是UTF-8”错误等同于“CMD管道和Windows剪贴板会保持Unicode”。`type | clip` 没有建立显式UTF-8解码、UTF-16/Unicode剪贴板格式写入和写后回读契约；现有ERR-015只覆盖Python子进程输出解码，不能保护剪贴板传输层。
- **旧防护为何失效**：既有命令烟雾测试只验证CMD可执行和退出码，没有使用真实中文内容跨越“UTF-8文件→命令入口→Windows剪贴板→消费者粘贴”完成逐字符往返；`current-handoff.md`也只记录阶段边界，没有机器执行能力。
- **影响**：用户无法可靠把治理提示词提交给OpenCode；继续操作可能把损坏文本当成真实需求输入，污染后续Work Item证据。
- **正确做法**：
  - 禁止用 `type <UTF-8文件> | clip`、仅切换代码页或PowerShell兜底复制非ASCII提示词
  - 读取源文件原始字节并严格按 `utf-8-sig` 解码
  - 通过Win32 `CF_UNICODETEXT` 写入剪贴板
  - 写入后重新读取剪贴板并与原文本逐字符比较
  - 控制台状态只输出ASCII，避免把显示编码误当成剪贴板内容证据
  - 用户执行前必须用真实中文提示词完成Windows往返验证
- **新增防护**：新增 `scripts/windows/copy-utf8-to-clipboard.py` 和同名CMD入口；经验门禁测试禁止该入口包含 `type|clip`、`chcp` 或PowerShell，并验证UTF-8解码、`CF_UNICODETEXT`、Set/GetClipboardData和精确回读断言。V69执行器在任何真实仓库写入前使用真实WI-0001提示词完成Windows剪贴板往返。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-022`、`EXP-028`、`EXP-045`、`EXP-058`、`EXP-078`、`EXP-092`。



### ERR-116：V69把含嵌套双引号的call命令作为cmd.exe /c参数，脚本路径变成字面量反斜杠引号

- **日期与阶段**：2026-08-05，V69隔离剪贴板真实往返。
- **分类**：`VALIDATOR_DEFECT / WINDOWS_CMD_ARGUMENT_SERIALIZATION / SCRIPT_NOT_STARTED`。
- **现场表现**：隔离测试、TypeScript、构建和范围检查通过；随后CMD报告 `'\"D:\\...\\copy-utf8-to-clipboard.cmd\"' 不是内部或外部命令`，退出1。真实仓库、WorkDesk、用户级安装、WI-0001、提交和推送均未执行。
- **一级证据**：`SpecForge-v69-execution-evidence-20260805-132145.zip` 中summary、commands.log与 `logs/isolated_clipboard_roundtrip.log`。
- **根因**：验证器使用参数列表启动 `cmd.exe /d /s /c`，同时把含嵌套双引号的完整 `call` 命令放入单个参数。Python为Windows CreateProcess序列化时使用反斜杠保护双引号，但CMD不采用该转义规则，最终把反斜杠作为普通字符传给 `call`。
- **影响**：批准的Unicode工具根本没有启动，V69产生验证器假失败；ERR-115仍未取得Windows真实往返证据。
- **正确做法**：
  - 复杂CMD调用写入独立临时 `.cmd` 文件，不通过 `/c` 单参数承载嵌套引号
  - 包装文件内部使用CMD原生 `call "..." "..."`
  - `cmd.exe /c`只接收包装文件basename，并从包装文件目录启动
  - 用含空格路径做包装文本正例，字面量 `\"` 做反例
  - 读取真实历史失败日志验证分类，不重建有副作用历史现场
- **新增防护**：V70新增纯函数 `build_clipboard_wrapper`、含空格路径正例、非法引号反例、V69不可变日志解析和实际Windows包装执行；只有真实WI-0001往返通过后才应用8文件。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-007`、`EXP-015`、`EXP-058`、`EXP-073`、`EXP-078`、`EXP-092`、`EXP-093`。



### ERR-117：V70目标状态生产者已切换但两个固定文本测试仍要求V69状态字面值

- **日期与阶段**：2026-08-05，V70精确8文件隔离定向测试。
- **分类**：`TEST_DRIFT / VERSION_BOUND_LIFECYCLE_STATUS / INCOMPLETE_CONSUMER_INVENTORY`。
- **现场表现**：V70目标交接和经验状态已经使用V70闭包字面值，但两个测试仍分别要求 `ERR-115=CLOSED`、`NEXT_ACTION=...V69...` 和 `ERR115_STATUS=CLOSED_AFTER_V69_WINDOWS_ROUNDTRIP`；Bun结果为5 pass、2 fail、7 total。真实仓库、WorkDesk、用户级安装、WI-0001、提交和推送均未执行。
- **一级证据**：`SpecForge-v70-execution-evidence-20260805-133631.zip` 中summary与 `logs/isolated-targeted-tests.log`。
- **根因**：生命周期状态和下一动作错误绑定交付尝试版本；修改生产者时只更新部分测试消费者，封包预检没有实际解释全部固定文本断言。
- **影响**：V70在真实Unicode往返前停止，用户再次承担本可在封包前发现的测试漂移。
- **正确做法**：
  - 当前状态只使用稳定生命周期值，不把V号写入状态枚举
  - V号、commit、证据包和时间戳只写证据字段
  - 修改状态生产者前枚举全部固定文本消费者
  - 封包前解析目标测试中的字符串断言并与目标文档实际执行对账
  - 历史失败只用不可变日志纯解析，不通过当前目标文件伪复现
- **新增防护**：V71新增V70失败集合纯解析、全部8文件版本绑定状态扫描、3个测试消费者稳定下一动作检查，以及封包期TypeScript AST字符串断言对账。
- **状态**：`CLOSED`。
- **类防护**：`EXP-004`、`EXP-015`、`EXP-033`、`EXP-035`、`EXP-036`、`EXP-058`、`EXP-073`、`EXP-078`、`EXP-086`、`EXP-094`。

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



## EXP-047：多Tool Candidate生产必须在Runtime状态边界收口为完整冻结Manifest

Candidate文件可以由Contract Tool、专业Agent和Task Planner分阶段生成，但 `candidate_manifest.json` 只能有一个权威写入者。Runtime必须在 `candidate_preparing → candidate_prepared` 前，根据正式Classification和规范Candidate路径完成完整物化、冲突检查和缺项检查；状态推进成功后，Gate、Approval和Merge只消费冻结显式Manifest，不再重新猜测文件系统。专业Agent不得手工补Manifest。


## EXP-048：Candidate和Gate要求必须由正式Classification决定

Workflow路径和candidate phase描述流程阶段，不等同于本次真实变化范围。Requirement、Architecture、Data Model、Module Design、Module Contract及其专业Gate必须消费 `trigger_result.classification`：对应变化为true才要求对应Candidate或Gate。Classification缺失、无法解析或相互矛盾时保持严格回退并失败关闭，不能静默放宽，也不能为满足模板制造无变化产物。


## EXP-049：状态名是生产者—消费者契约，文档和提示词不得发明描述性状态

Runtime状态枚举、迁移表、Tool输入、Skill阶段表、Agent提示词、测试和实施文档必须使用同一组正式状态。描述性阶段名称不能替代状态值。任何状态新增、删除或重命名都必须同步全部消费者；交付前必须全仓检索未知状态。Candidate Gate通过后的正式状态以状态机为准，本版本为 `approval_required`。


## EXP-050：专业Agent的治理产物写入必须走精确受控Tool边界

专业Agent必须把只读调查与治理写入分开：Read/Glob/Grep用于读取，`sf_artifact_write`、Contract Tool等受控Tool用于其拥有的Candidate。不得使用 `sf_safe_bash`、Shell、PowerShell、Node或Python写 `.specforge/work-items/**`、`candidates/**` 或正式治理文件。受控Tool无法表达需求时必须停止并报告产品能力缺口，不能用Shell补洞。


## EXP-051：活动锁、恢复历史和独立修复前置条件必须分层

活动 `hard_stop.json` 只证明当前仍被阻断，不能作为恢复历史的永久文件；恢复后的稳定证据是追加式 `hard_stop_resolution.jsonl`，其中必须保存原始HardStop和恢复决定。脚本必须按证据生命周期读取正确来源。业务项目现场证据与SpecForge产品源码修复没有因果依赖时，现场缺项只能记录 `INSUFFICIENT_EVIDENCE`，不能阻断隔离源码验证；但远程HEAD、本地HEAD、工作区、暂存区、进程边界和补丁源哈希仍是首次写入前的硬门禁。


## EXP-052：Monorepo TypeScript验证必须先准备内部声明，并分离环境错误与代码错误

当包的 `types` 入口指向workspace构建产物时，单包noEmit不是零准备检查。验证器必须先按仓库正式拓扑生成被测包全部内部依赖声明，再执行定向测试和被测包TypeScript检查；随后仍要执行相关包构建和必要的全仓确定性构建。缺失声明、工具链不可用和源码类型错误必须分别记录，不能合并成同一种产品缺陷。任何新增辅助函数都必须保持调用上下文的正式可选性；关键上下文缺失时失败关闭，并增加编译和运行双重回归。


## EXP-053：Gate必须按正式治理对象职责消费冻结Manifest，不能要求下层产物复制上层责任

Project Architecture负责系统整体结构、模块边界、跨模块依赖和所有模块共同遵守的系统级约束；Module Design只描述模块在上层约束下如何完成自身职责。Gate验证系统治理分析时，必须从Runtime冻结的Candidate Manifest中读取承担该职责的Project Architecture Candidate，并验证其正式内容契约；不得只因Gate实现位于Design Gate中，就要求非默认模块Design复制 `system_governance`。同时不得扫描Manifest外历史文件或放宽Write Guard。任何生产者允许范围与消费者必需条件必须存在至少一个合法交集，并由正向、缺失、畸形和历史排除回归证明。


---


## EXP-054：补丁Source Contract必须由声明HEAD的精确字节生成并逐文件交叉验证

补丁包、隔离验证包和真实应用包中的 `baseline_head` 不是说明文字，而是全部源文件前置条件的
唯一版本合同。每个已有目标文件的Source SHA256必须来自该HEAD的精确字节，并在交付前与
当前远程/本地HEAD或已验证提交证据逐文件交叉验证；新增文件必须证明在该HEAD不存在。
不得复用来源提交不明的临时树，也不得只更新Manifest中的HEAD而保留旧Source哈希。无法取得
精确字节时必须标记 `INSUFFICIENT_EVIDENCE`，不得生成或交付可能覆盖新提交内容的完整文件包。



## EXP-055：关键测试断言必须以实际运行器支持的组合表达

测试语义不能只在TypeScript层面成立。数组、对象、非对称匹配器、路径分隔符和错误对象等组合断言，必须在项目实际Bun/Vitest版本运行；跨平台路径应先规范化，再分别断言集合规模和字符串语义。新增测试自身失败时先判断断言表达是否受支持，不能立即归因产品实现。


## EXP-056：Candidate Phase与Classification必须取交集，不能互相替代

Classification回答“本WI哪些语义发生变化”，Candidate Phase回答“当前时点哪些专业产物到期”。Gate和必需文件必须同时满足二者：design阶段不得提前要求Requirement；requirements阶段保留上阶段Design并只执行Requirements专业Gate；tasks/full阶段才汇总全部适用专业产物和Gate。缺少Classification时保持历史严格profile失败关闭，不能用Phase掩盖未知范围。


## EXP-057：补丁验证必须先做最小A/B基线归因，文本度量必须排除格式尾项

扩展回归集发现失败时，验证器必须在应用补丁前对相关测试做最小基线控制，区分既有失败、补丁新增失败和测试自身缺陷。文件行数、列表项和分隔文本等度量必须先定义逻辑单位；标准末尾换行产生的空尾项不能计为额外内容。基线控制结果应进入证据包，不能只在最终失败后人工推断。

## EXP-058：状态型固定文本消费者必须与最终状态块原子同步

错误状态、阶段状态和交付状态一旦变化，条目正文、正式当前状态块、交接文件、活动实施文件和测试中的固定文本断言必须在同一目标字节集中同步。测试不得继续断言上一轮 `PENDING_Vxx` 临时状态；验证前必须静态对账“生产者当前值”和全部消费者期望值，并在实际Bun测试中再次证明。状态消费者不同步属于验证契约缺陷，不能把正确产品实现误判为失败。


## EXP-059：生成文本文件必须以字节级单一EOF换行契约收口

补丁包、状态文档和生成脚本不得依赖编辑器或字符串拼接自然形成正确文件结尾。每个生成文本文件必须在封包前规范化为 `content.rstrip("\r\n") + "\n"`，并验证文件以一个且仅一个LF结束：`endswith(b"\n")` 为真、`endswith(b"\n\n")` 为假。该检查必须早于完整测试和 `git diff --check`，避免在长验证链末端才发现纯格式阻断。


## EXP-060：每轮修改必须先补录全部既往失败，再重读最新版经验并执行重复错误检查

每一轮调查、设计、修改、脚本生成、打包、安装或验证开始前，必须先盘点上一轮及历史尚未登记的全部失败。固定顺序：

```text
失败盘点
→ 每个失败补录ERR、根因、影响、正确做法、EXP类防护和状态
→ UNRECORDED_FAILURES=0
→ 重新读取补录后的最新版经验台账
→ 映射APPLICABLE_EXPERIENCE_RULES
→ REPEATED_ERROR_CHECK=PASS
→ 固定基线和范围
→ 才允许首次修改
```

开始修改前必须记录：

```text
PRIOR_FAILURE_RECONCILIATION=PASS
BACKFILLED_ERROR_IDS=ERR-...或NONE
UNRECORDED_FAILURES=0
EXPERIENCE_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-...
REPEATED_ERROR_CHECK=PASS
BASELINE_EVIDENCE=...
```

任何字段缺失、存在未补录失败或失败没有类防护时必须Fail Closed。失败后不得直接重试。

## EXP-061：Windows CMD/BAT交付必须通过真实解析器、编码和换行契约验证

CMD/BAT交付必须使用目标环境可识别编码和CRLF，避免未经验证的复杂 `||` 组合，并通过真实 `cmd.exe` 无副作用烟雾测试。

## EXP-062：文件生成成功不等于交付成功，下载链接必须独立验证

交付前必须验证文件存在、文件名和SHA256一致；链接必须独立、完整、无嵌套，不得与Web引用混排。

## EXP-063：补丁生成器必须使用结构化边界或受控锚点，禁止盲目整段替换

优先按标题、JSON结构或AST修改。文本锚点必须先验证匹配数恰好为1，并在临时副本完成修改和检查。

## EXP-064：生成器必须从当前环境已验证输入自举，禁止依赖跨工具临时目录

每轮必须验证固定输入文件存在并自行解压或创建目录，不得依赖其他工具或会话的临时路径。

## EXP-065：修改脚本必须先读取当前目标结构，禁止根据记忆构造锚点

任何修改脚本在定义锚点前必须读取当前文件和目标段落。锚点必须来自实际内容或结构标题，并验证数量；不能使用上一轮记忆中的句子。

## EXP-066：解析器回归必须使用真实项目原始格式，并同时验证正向兼容与反向拒绝

解析器、Schema、路径和Gate修复不能只使用人为简化的理想夹具。真实项目已经出现的原始标题、字段、路径或Manifest必须进入回归测试。标题容错扩展必须成对证明真实合法格式、原有合法格式、嵌入式非法格式和无受控分隔符非法格式。

## EXP-067：Markdown标题匹配必须是物理单行语法，标题空白不得使用可跨行的 `\s`

JavaScript正则中的 `\s` 包含空格、制表符、CR和LF。凡用于标题内部的hash间距、编号间距、后缀间距、分隔符间距和结尾空白，都必须使用水平空白 `[ \t]`。共享Matcher必须固定回归：标题下一行以 `-`、`:` 或括号开始时，匹配结果仍只能是标题行，不能吞掉正文。

## EXP-068：固定文本测试必须断言正式生产者字段，不得断言未写入文档的概括

状态型文档修改时，必须同步全部既有和新增固定文本消费者。测试应断言正式状态枚举、字段名和精确值，例如 `CANDIDATE_CONTENT_CHANGED=NO`；不得把解释性自然语言当成隐式文档契约。封包前必须搜索旧状态残留，并对生产者值与所有消费者期望值做原子对账。

## EXP-069：固定文本测试必须明确区分源文本转义与运行时字符

当测试对象包含 `\t`、`\n`、`\r`、正则、Windows路径或其他反斜杠序列时，普通JavaScript/TypeScript字符串会先解释转义。测试必须根据正式生产者字节选择：

```text
匹配字面量反斜杠序列
→ 优先使用普通字符串中的双重转义
→ String.raw仅在目标运行时验证非ASCII实际值后使用

匹配真实控制字符
→ 显式写入控制字符并验证字符码
```

不得仅凭源代码视觉相同判断字符串等价。固定文本消费者封包前必须同时检查测试源文本、运行时期望值和目标文件真实字节。

## EXP-070：非ASCII固定文本不得默认使用String.raw，必须按目标运行时验证实际值

`String.raw` 是tagged template，不只是普通字符串转义工具。构建器或测试运行时可能先把非ASCII模板内容转换为 `\uXXXX`，随后 `String.raw` 会把这些转义作为字面量返回。

匹配“中文正文 + 字面量反斜杠序列”时，固定做法是：

```text
中文正文
→ 普通字符串直接保存

字面量反斜杠
→ 在普通字符串源码中双重转义

封包前
→ 验证测试源字节
→ 验证运行时期望字符码
→ 验证目标文件真实字节
```

只有在目标Bun/Node/测试转换链中验证实际返回值后，才能使用非ASCII `String.raw`。不得根据ECMAScript直觉替代目标工具链证据。

## EXP-071：受限状态的只读证据不能通过sf_safe_bash补哈希

权威状态或活动HardStop限制为read/debug-only时，`sf_safe_bash` 不是只读证据工具。即使子命令是 `certutil -hashfile`、`Get-FileHash`、Node或Python哈希，也不得调用。

固定处理顺序：

```text
批准的Read/Glob/Grep或正式只读Tool
→ 完整内容快照、路径、大小、mtime等可取得元数据
→ 精确哈希Tool不可用时报告HASH_EVIDENCE_UNAVAILABLE或声明等效内容对比
→ 不得为满足提示词中的哈希格式制造新的HardStop
```

误触发后按 `operator_error + abandon + safe_alternative_tool` 恢复，并把该失败记录到经验台账；不能因后续成功而忽略。

## EXP-072：远程源码调查必须支持固定commit的官方直链回退

远程调查优先读取当前分支和固定commit。`git clone`、容器DNS或单一下载渠道失败时，不得直接判断仓库不可访问。只要GitHub官方commit页面或同一commit的raw文件入口可用，就应：

```text
固定远程HEAD和文件commit
→ 通过官方入口读取目标文件
→ 保存URL、文件SHA256和读取结果
→ 区分调查环境故障与仓库事实
```

只有官方入口均不可用且无法取得必需源码字节时，才标记 `INSUFFICIENT_EVIDENCE`。

## EXP-073：一手运行日志按语义事实组合验真，不得依赖后加汇总字段

一手日志、Tool调用和Runtime输出可能用自然语言、参数字段、最终报告字段或JSON记录表达同一事实。验证器不得要求来源包含为了说明方便后加的人工汇总字段。

HardStop运行证据的最低语义组合：

```text
同一HardStop ID
+ 拦截原因
+ 正式resolution_type
+ blocked_action_disposition=abandon
+ retry_original_action=false
+ 最终HardStop已解除
```

实现要求：

```text
每项事实允许多个正式表达
→ 每组至少命中一个
→ 所有事实组必须同时满足
→ 不能只因出现一个ID就判定通过
→ 不能因缺少人工合成字段就判定失败
```

修改证据消费者前必须先列出来源中真实存在的表达，并用原始日志字节做正向测试。

## EXP-074：基线测试失败必须区分产品回归与测试消费者漂移

修改前基线测试失败时，不得删除测试、缩小测试集或直接把失败归因于本轮补丁。必须对账：

```text
测试期望
↔ 当前生产者实现
↔ 当前正式契约
```

若实现与正式契约一致而测试仍断言旧行为，应记录为测试消费者漂移，并固定执行：

```text
未修改基线重现精确失败
→ 保存失败测试名和实际错误
→ 修正测试消费者，不放宽正确实现
→ 增加新契约的正向和反向断言
→ 补丁后重新运行同一测试文件
```

测试辅助fixture也属于消费者，必须同步移除已禁止字段，不能只改两个可见断言。

## EXP-075：已知失败验证必须比较失败集合，不得猜测无关pass数量

当基线中存在已确认的历史失败时，验证器的目标是证明“失败仅限于批准集合”，不是证明一个人工猜测的通过数量。

固定实现：

```text
解析全部(fail)测试名
→ 与批准失败集合做精确相等比较
→ 解析pass/fail/total
→ 校验fail数量与集合大小一致
→ 校验total = pass + fail
→ 保存完整原始日志
```

只有当pass数量本身是正式契约时才允许固定；普通测试文件新增合法用例会改变pass数量，不应导致已知失败识别失效。

不得使用：

```text
日志必须包含“49 pass”
日志必须包含某个凭经验估计的通过总数
```

验证脚本封包前必须用真实失败日志执行一次解析单元检查。

## EXP-076：静态审计必须限定语义作用域，不能禁止历史证据中的同名字符串

验证器常同时包含：

```text
历史失败对账
当前执行算法
```

同一字符串在历史对账中必须保留，在当前算法中必须消除。静态审计必须分别截取函数或代码块后检查，不能对整个文件做全局禁止。

固定做法：

```text
提取历史对账函数
→ 确认原始错误证据仍存在

提取当前算法函数或代码块
→ 确认错误规则已消失
→ 确认新结构化规则存在

最后用真实日志演练新算法
```

封包静态审计失败也属于实际失败；即使尚未交付给用户，也必须补录后再生成压缩包。

## EXP-077：验证结果摘要必须由Manifest和实际集合派生，禁止重复维护范围常量

验证包中以下信息属于同一个证据契约：

```text
Manifest.changed_paths
target-hashes.json键集合
git diff文件集合
summary中的patch scope
summary中的final scope
prior failure reconciliation中的错误ID
```

不得在多个位置手工维护相同数字或ID列表。固定实现：

```text
changed_paths = Manifest.changed_paths
file_count = len(changed_paths)
backfilled_ids = Manifest.prior_failure_reconciliation.backfilled_error_ids

summary.patch_scope = APPLIED_EXACT_{file_count}_FILES
summary.final_scope = PASS_EXACT_{file_count}_FILES
summary.backfilled_error_ids = backfilled_ids
```

成功前必须验证：

```text
set(target_hashes) == set(changed_paths)
set(diff_paths) == set(changed_paths)
summary_count == len(changed_paths)
summary_error_ids == Manifest.error_ids
```

测试和构建通过但摘要与证据集合不一致时，结果仍必须判为失败，不能进入真实应用。

## EXP-078：验证器封包前必须执行关键函数，compile不能证明运行时依赖完整

Python `compile()` 只能证明语法可解析，不能证明：

```text
模块级名称已导入
条件分支中的依赖可见
历史证据包字段可被真实解析
关键函数不会在首次调用时NameError
```

验证器封包的固定预检：

```text
compile最终run.py
→ importlib加载最终run.py
→ 使用最终manifest
→ 把证据路径替换为当前可读的真实证据包
→ 实际调用新增或修改的纯证据对账函数
→ 验证返回成功
→ 再生成zip
```

局部 `import` 不能替代模块级函数依赖。模块级函数使用的标准库名称必须在模块顶层显式导入。

若函数涉及真实仓库写入，不在封包预检中执行；应拆分出无副作用的解析/对账函数进行实际调用。

## EXP-079：prior_failure_reconciliation必须整体从Manifest派生，不能只修正部分字段

经验治理结果是一个原子契约：

```text
status
backfilled_error_ids
unrecorded_failures
experience_file_read
applicable_experience_rules
repeated_error_check
```

不得只把错误ID改为动态派生，而继续手工维护经验规则列表。固定实现：

```python
prior = MANIFEST["prior_failure_reconciliation"]

summary["prior_failure_reconciliation"] = prior["status"]
summary["backfilled_error_ids"] = prior["backfilled_error_ids"]
summary["unrecorded_failures"] = prior["unrecorded_failures"]
summary["experience_file_read"] = prior["experience_file_read"]
summary["applicable_experience_rules"] = prior["applicable_experience_rules"]
summary["repeated_error_check"] = prior["repeated_error_check"]
```

封包前必须比较最终脚本的摘要字段来源，并实际用历史证据调用新增对账函数。只要摘要和Manifest任一经验字段不一致，即使测试全部通过，也不得进入真实应用。

## EXP-080：最终交付ZIP必须排除运行时缓存并在成包后重开核验

交付包内容必须是稳定、可重复计算的文件集合：

```text
禁止条目：
__pycache__/
*.pyc
临时执行日志
运行时生成缓存
```

固定封包顺序：

```text
清理运行时缓存
→ compile最终脚本
→ PYTHONDONTWRITEBYTECODE=1方式importlib加载
→ 实际调用全部新增或修改纯函数
→ 生成Manifest
→ 生成ZIP
→ 重新打开最终ZIP
→ 比较ZIP条目集合、大小和SHA256
→ 审计通过后计算并发布ZIP SHA256
```

Manifest不得记录会在后续预检中被改写的文件。成包后的ZIP重开审计是最终完整性证据，不能用封包前目录审计替代。

## EXP-081：测试失败身份必须剥离非语义运行时装饰后再做精确集合比较

测试框架输出中的耗时和ANSI样式不是测试身份。已知失败控制固定采用：

```text
原始输出
→ 去除ANSI控制符
→ 提取每条(fail)后的名称
→ 仅删除行尾[数字+ns/us/µs/ms/s]耗时
→ 形成语义失败集合
→ 与Manifest批准集合精确比较
```

同时必须满足：

```text
return_code != 0
actual_failed_tests == approved_failed_tests
fail_count == len(approved_failed_tests)
total_count == pass_count + fail_count
```

批准失败集合必须位于Manifest，不得在执行函数中另写一份。解析函数必须无副作用，封包前使用真实历史日志实际调用，并至少覆盖：

```text
真实日志带耗时后缀=PASS
同一日志无耗时后缀=PASS
同一日志更换合法耗时单位=PASS
替换为未批准失败名称=FAIL
修改fail或total统计=FAIL
```

禁止通过宽泛删除自然语言、模糊子串或忽略失败名称来追求通过；只能剥离明确的非语义运行时装饰。

## EXP-082：远程Git TLS环境失败必须保留证据并使用官方独立入口回退

远程基线读取不能只依赖Windows Git默认schannel。固定顺序：

```text
git ls-remote默认后端
→ Git OpenSSL后端
→ Python标准库访问官方GitHub Ref API
→ 严格解析refs/heads/<branch>与40位SHA
→ 与Manifest基线精确比较
```

所有失败入口必须保留退出码和错误文本；官方API回退只解决环境可用性，不能放宽远程HEAD一致性。错误ref、非40位SHA、多个冲突结果或全部入口不可用时必须Fail Closed。

推送必须使用显式lease绑定执行前远程HEAD。推送命令异常时不得直接重试并宣告成功，必须读取远程事实：远程已等于本次commit才可视为幂等成功；远程仍等于基线时才允许切换TLS后端重试；远程为其他SHA时立即阻断。

## EXP-083：封包期Python检查必须以零字节码产生为执行合同

禁止Python缓存不能只依靠最终打包器过滤。所有语法检查、importlib加载、纯函数自测和Manifest生成必须使用：

```text
语法检查=compile(source, filename, "exec")
进程环境=PYTHONDONTWRITEBYTECODE=1或python -B
禁止=python -m py_compile
```

每个Python执行步骤后必须立即扫描整个交付目录：

```text
__pycache__目录数量=0
*.pyc文件数量=0
```

发现缓存时该版本封包失败，必须保留路径、大小和SHA256证据；不得静默删除并继续使用同一版本号。最终ZIP重开后仍需重复该检查。

## EXP-084：Manifest集合形状必须由生产者Schema和真实产物确定

验证器不得根据字段名称、旧样例或其他系统惯例猜测集合是数组还是对象。用户级正式Manifest的当前契约是：

```text
<OpenCode配置根>/specforge-manifest.json
files=以相对路径为键的对象
managed_agents=Agent名称数组
```

固定验证顺序：

```text
读取生产者实现或正式Schema
→ 读取真实历史Manifest
→ 校验根对象
→ 校验files对象精确数量
→ 校验managed_agents数组精确数量
→ 校验每个entry的sha256、size、type
→ 逐项复算实际文件
```

封包前必须实际调用纯解析函数：真实Manifest正例通过；`files`改成列表、空对象、错误数量、非法entry或错误Agent集合必须失败。禁止通过 `len()` 前的类型错误把真实对象报告成 `None`，也禁止把“字段存在”误当成“Schema正确”。

## EXP-085：有副作用动作成功后必须立即固化动作事实

安装、提交、推送、写入等动作一旦真实命令退出0，动作事实必须立即记录，且后续检查不能回写为未执行。固定模型：

```text
动作命令退出0
→ action_status=PERFORMED（立即、不可变）
→ 独立执行post_action_verification
→ verification_status=PASS或FAIL
```

结果摘要必须同时报告动作事实和验证事实。后续验证失败时，可以把整体结果标记为失败，但不得把已经发生的安装、提交或推送重新描述为 `NOT_PERFORMED`。封包前必须覆盖“动作成功且后续验证失败”的反例。

## EXP-086：子任务关闭不能覆盖父阶段生命周期

状态必须具有明确作用域。一次补丁、验证包或证据消费任务成功，只能关闭该子任务；父阶段是否完成必须由父阶段自己的关闭条件、真实环境证据和 `INSUFFICIENT_EVIDENCE` 集合决定。固定模型：

```text
SUBTASK_STATUS=CLOSED
+ PARENT_COMPLETION_CONDITIONS全部满足
+ PARENT_INSUFFICIENT_EVIDENCE为空
→ PARENT_STATUS=COMPLETED
→ 才允许派生NEXT_PHASE_ACTION
```

只要父阶段仍为 `IN_PROGRESS`，后续阶段必须明确记录为 `NOT_STARTED`。`CURRENT_TASK_STATUS` 等无作用域字段不得同时承担子任务和父阶段状态；下一动作不能只由最近一次执行成功派生，必须先校验父阶段生命周期。


## EXP-087：状态生产者变更必须先完成全消费者清单再冻结范围

生命周期状态、下一动作或证据字段发生变更时，新增一个回归测试不能证明消费者已经闭环。修改前必须从旧字段和值反向检索全部消费者：

```text
生产者字段
→ 固定文本测试
→ Schema/解析器
→ 状态汇总
→ 交接与实施文档
→ 安装或运行时消费者
```

冻结范围必须覆盖全部实际消费者；任何旧消费者与新正式状态互斥时，分类为 `TEST_DRIFT` 或实际消费者缺陷，并重新执行影响分析。验证顺序固定为：

```text
真实历史失败集合精确重现
→ 原子同步全部消费者
→ 新状态正向断言
→ 旧状态负向断言
→ 完整定向与回归测试
```

不得只增加新测试后把旧测试失败解释为无关历史债务，也不得为通过测试重新恢复已经废止的无作用域状态。


## EXP-088：历史失败验证必须消费不可变历史证据，不能复用当前目标补丁

已有一手失败日志和摘要时，历史控制固定为纯证据解析：

```text
不可变历史日志/摘要
→ 纯函数解析
→ 精确失败集合、退出码、数量和动作事实
→ 正向与失败反例
```

不得通过修改当前隔离工作树再次制造同一历史失败。当前包的 `patch/` 目录只代表当前目标，不能同时充当历史目标。确需重建历史状态时，必须单独保存：

```text
historical_source_contract
historical_target_hashes
historical_changed_paths
historical_expected_result
```

历史重建函数与当前目标应用函数必须分离，且封包前分别使用真实证据实际调用。任何历史复现读取当前目标文件，均按验证器缺陷失败关闭。


## EXP-089：包含新增文件的Git证据必须从Manifest精确暂存集合生成

当 `source_contract` 中存在 `ABSENT` 路径时，普通 `git diff` 不能作为完整修改集合证据。隔离证据固定流程：

```text
apply target files
→ verify actual status paths == Manifest.changed_paths
→ git add -- Manifest.changed_paths
→ verify cached diff paths == Manifest.changed_paths
→ git diff --cached --binary
```

禁止通过 `git add -A` 扩大暂存范围；禁止把不含untracked文件的普通diff报告为完整patch。真实仓库只能在全部验证通过后执行同一精确路径暂存，隔离证据暂存不构成真实提交动作。


## EXP-090：CLI可执行入口必须允许模块被无副作用导入

CLI文件同时承担可执行入口和可复用模块时，顶层直接运行判断必须把运行器参数视为可选输入。固定模型：

```text
导出纯业务函数
→ 检查process.argv[1]是否为非空字符串
→ 才执行pathToFileURL与direct-run比较
→ 纯模块导入不得触发CLI输出或参数异常
```

封包前必须同时执行：直接CLI运行、测试运行器导入、无脚本参数的纯ES Module导入和导出函数调用。任何入口判断依赖特定运行器必然提供参数，均按封包预检缺陷失败关闭。


## EXP-091：测试断言必须与其局部证据生产者处于同一语义作用域

复制或新增测试断言时，必须同时核对断言读取的变量、fixture、文件内容和helper是否在当前测试作用域可见。固定检查：

```text
新增断言引用集合
→ 当前函数/测试块局部声明
→ 模块级导入与常量
→ 未定义引用集合必须为空
```

`transpileModule()`、Babel转译或字符串检查只能证明语法可生成，不能证明名称解析和作用域正确。封包前必须补充TypeScript Program语义诊断或等价的完整类型检查；用户环境仍必须执行项目正式TypeScript和定向测试。


## EXP-092：跨编码边界必须显式解码、使用Unicode协议并完成真实往返

文件编码正确只证明静态字节，不证明命令管道、剪贴板、终端或下游消费者仍得到相同文本。非ASCII文本跨越边界时固定执行：

```text
读取原始字节
→ 按声明编码严格解码
→ 使用目标平台的明确Unicode协议传输
→ 从目标消费者入口回读
→ 与源文本逐字符比较
```

Windows剪贴板固定使用 `CF_UNICODETEXT`。禁止把 `type <UTF-8文件> | clip`、`chcp 65001`、终端肉眼显示正常或命令退出0当成Unicode正确证据；禁止为了CMD入口改用PowerShell兜底。用户可见中文、路径、提示词和证据文本必须在交付前使用真实内容完成往返。交接文档只能记录边界，不能替代可执行工具和机器回归。



## EXP-093：cmd.exe /c不得通过跨运行时参数序列化承载含嵌套引号的完整命令

Python、Node等运行时把参数列表转换为Windows命令行时使用的引号规则，不等于CMD命令语言的引号规则。需要调用带空格路径的批处理文件时固定执行：

```text
生成独立CMD包装文件
→ 在文件内部按CMD语法写call和双引号
→ cmd.exe /d /c只接收包装文件basename
→ cwd固定为包装文件目录
→ 校验包装文本不存在字面量反斜杠引号
→ 使用真实Windows执行验证
```

禁止把 `call "路径" "参数"` 作为含嵌套引号的单个 `/c` 参数交给非CMD运行时序列化。封包前必须用含空格合成路径验证包装文本，并用真实历史失败日志证明错误分类；不得用当前目标文件重建历史失败。



## EXP-094：生命周期状态必须稳定，尝试版本只属于证据

错误、任务和阶段的当前状态固定使用稳定生命周期：

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

V编号、commit SHA、证据包路径和时间戳只记录在哪次执行取得证据，不得进入状态枚举或下一动作契约。任何状态生产者变更必须先枚举全部固定文本、Schema、解析器和测试消费者；封包前必须实际解释目标测试中的字符串断言并与目标文档对账。发现 `CLOSED_AFTER_V*`、`NEXT_ACTION=...V*...` 等版本绑定状态时必须失败关闭。

# 第四部分：修改前强制检查

## 13. 通用检查清单

```text
□ 已盘点上一轮和历史遗漏失败，所有失败均已先补录ERR、根因、EXP类防护和状态
□ PRIOR_FAILURE_RECONCILIATION=PASS
□ BACKFILLED_ERROR_IDS已明确记录为ERR列表或NONE
□ UNRECORDED_FAILURES=0
□ 已在补录完成后重新读取最新版经验文件
□ 失败后未直接重试，已先记录、学习并增加防复发措施

□ 已完整阅读第三部分
□ 已记录 EXPERIENCE_FILE_READ=YES
□ 已记录 APPLICABLE_EXPERIENCE_RULES=EXP-...（至少一项）
□ 已列出至少一项适用 EXP 规则；NONE_FOUND 时已 fail closed
□ 已执行重复错误检查；当前问题已归入已有类别或新增 ERR/EXP
□ 已确认读取到第三、四部分正文，而不是只有标题
□ 已固定 HEAD、分支、工作区和权威文件
□ 远程Git TLS失败时已保留原始证据，并只使用官方独立入口回退；远程SHA仍与Manifest精确比较
□ 封包期所有Python执行均禁用字节码，并在每个步骤后证明__pycache__和*.pyc为零
□ Manifest集合形状已由生产者Schema和真实产物确认；files对象、managed_agents数组及entry结构均用正反例执行验证
□ 有副作用动作退出0后已立即固化动作事实；后续验证失败未把已执行动作误报为NOT_PERFORMED
□ 子任务、父阶段和下一阶段状态已分层；父阶段未满足关闭条件或仍有INSUFFICIENT_EVIDENCE时，后续阶段保持NOT_STARTED
□ 已区分产品、脚本、环境、验证、证据和历史债务
□ 已画出定义—调用者—消费者—测试—安装—真实验证闭包
□ 已确认用户操作边界
□ 已选择最简单的交付和验证方式
□ 命令已按实际 Windows/CMD/Bun 环境验证
□ UTF-8中文文件进入Windows剪贴板时已显式UTF-8解码、以CF_UNICODETEXT写入并逐字符回读；未使用type|clip、chcp或PowerShell兜底
□ cmd.exe /c未接收含嵌套引号的跨运行时完整命令字符串；复杂调用已使用独立CMD包装文件和真实Windows执行验证
□ 生命周期状态和下一动作未绑定V版本；全部固定文本消费者已由目标断言解释器对账
□ daemon/OpenCode 进程检查命令已成功并可解析；命令失败、输出异常或 PID 无法判定时已 fail closed，未解释为“未运行”
□ Git porcelain 等机器结构化输出使用原始 bytes 和协议分隔符解析，未对完整输出先执行 `.strip()` 或展示层空白规范化；首条、末条和含空格路径回归已通过
□ 引用审计已区分活跃权威依赖、对象自身产物、Runtime 当前状态和不可变历史日志；未用未分类文本命中总数直接阻断或允许清理
□ Git porcelain `M` 已通过规范化 blob、未暂存状态和空 diff 区分正式内容差异与 stat/index 元数据差异；未为获得 clean 展示而修改 index 或重写文件
□ 修改脚本已在首次写入前验证进程、远程、本地基线、暂存区和精确源/目标状态；精确目标可重入，混合状态失败关闭，前置失败保持零写入
□ 实施文档重构已同步经验门禁、结构测试、脚本选择器和报告模板中的全部固定文本消费者；稳定治理事实在新结构中仍有明确表述，并完成 `toContain` / `not.toContain` 静态交叉检查
□ 每条验证断言已绑定真实生产者、正式 schema、类型定义或权威规则；未要求非权威文件复制其他产物的字段，无法确认职责时已标记 `INSUFFICIENT_EVIDENCE`
□ 最终成功证据已与当前状态文档、经验记录、测试断言和Git范围完成提交前对账；当前交接不再保留与成功证据冲突的“待验证”状态
□ 源码调用和依赖审计已区分可执行语法、正式import/require、注释和普通文本；未把注释中的API名称当成生产调用关系
□ 多Tool生成Candidate时，Runtime已在candidate_preparing→candidate_prepared边界按Classification物化完整Manifest；Agent未手工写Manifest，Gate/Approval/Merge只消费冻结Manifest
□ Candidate文件和专业Gate要求已逐项绑定正式Classification；未因workflow full模板制造Requirement、Data Model或其他无变化Candidate
□ 文档、提示词、Skill、Agent和测试中的状态名均来自正式状态枚举与迁移表，不含描述性自创状态
□ 专业Agent只通过受控Tool写治理Candidate，未使用sf_safe_bash、Shell、PowerShell、Node或Python写治理产物
□ HardStop活动锁与resolution历史已分层取证；恢复后未要求hard_stop.json继续存在，非因果相关的业务现场证据不足未阻断隔离源码验证
□ Monorepo单包TypeScript检查前已按正式拓扑生成内部依赖声明；环境准备错误与源码类型错误已分项报告
□ Gate验证的治理职责已绑定正式治理对象和冻结Manifest；生产者允许范围与消费者必需条件存在合法交集，未要求Module Design复制Project Architecture责任
□ 补丁包Source Contract已由声明HEAD的精确字节生成并逐文件交叉验证；未复用来源提交不明的临时树
□ Candidate Phase与Classification已取交集；当前阶段未提前要求后续专业Candidate或Gate
□ 补丁验证已先运行最小A/B基线控制；文本行数等度量已排除标准末尾换行产生的空尾项
□ ERR/EXP状态变化已同步条目正文、当前状态块、交接文件、活动实施文件和全部固定文本测试；不存在上一轮PENDING状态残留
□ 所有生成文本文件以一个且仅一个LF结束；封包前和补丁应用后已完成字节级EOF检查
□ Markdown标题正则只使用水平空白；已验证不会跨行吞掉首条正文
□ 固定文本测试只断言正式生产者状态和字段；不存在旧状态或未写入概括
□ 含反斜杠序列的固定文本测试已区分源文本字面量与运行时控制字符；非ASCII文本优先使用普通字符串双重转义
□ 非ASCII tagged template已在目标Bun/Node转换链验证运行时实际值；未经验证不得使用String.raw
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
□ CMD/BAT已使用目标环境可识别编码和CRLF换行
□ CMD/BAT已通过真实cmd.exe无副作用语法烟雾测试
□ 下载文件存在、文件名、SHA256和sandbox链接已核对
□ 用户可见下载链接独立完整，不含Web引用或嵌套Markdown
□ 补丁生成器已按结构边界修改；文本锚点匹配数量恰好为1
□ 生成器输入文件已在当前运行环境验证存在，未依赖其他工具临时目录
□ 修改脚本已先读取当前目标结构，未根据记忆构造锚点

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
□ 内部依赖声明已在回归测试前准备完成，typecheck 在回归测试后立即执行
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
ERR-066：CLOSED。V25注释感知扫描证明非STORAGE可执行持久化调用为0，并提交场景冻结证据。
ERR-067：V27保留Runtime Classification驱动Manifest物化实现；待隔离测试、TypeScript和构建验证。
ERR-068：V27保留Classification驱动Candidate/Gate要求实现；待隔离测试、TypeScript和构建验证。
ERR-069：V27统一正式状态approval_required；待隔离Agent/Skill/文档回归验证。
ERR-070：V27补强sf-design和architecture_change Skill受控工具边界；待隔离回归验证。
ERR-071：V26因错误要求已恢复的hard_stop.json而在零写入阶段失败；V27改读hard_stop_resolution.jsonl，并把WorkDesk现场证据改为非阻断只读审计。
ERR-072：V27定向测试73/73通过后，TypeScript阶段暴露workspace声明未准备和两处可选workflowPath类型错误；V28分离依赖准备并修复失败关闭类型契约。
```

## 23. 2026-08-04 V28—V33与WI-0004真实复测更新

```text
V28隔离验证：SUCCESS，74项定向测试、TypeScript、daemon-core build、全仓build、git diff check、installer隔离verify全部通过。
V29真实仓库应用：SUCCESS，精确13文件，WorkDesk未改变。
V30提交推送：SUCCESS，main=d6dc931072aca519354fb4bc0857a64aacc58961 → a0333ba56854b26780960823b25db2faf67f080f。
V33用户级升级：SUCCESS，Bun 1.3.11，installer verify=119/119，源码与部署=119/119，WorkDesk和legacy目录未改变。
WI-0004第一次恢复：Manifest自动物化5项，历史Requirement/Data Model 2项排除，Classification驱动Gate正确；因旧DOMAIN Design标签问题回到gates_failed。
WI-0004有边界修复尝试：sf-design只使用sf_artifact_write，无sf_safe_bash；Write Guard拒绝模块Design声明system_governance，Candidate未写入，状态停在candidate_preparing。
V34隔离验证：在SOURCE_HASH前置失败；实际a0333ba文件哈希094a08e4...正确，包内旧基线哈希6bf1688c...错误；全部真实写入均未执行。
```

当前错误状态：

```text
ERR-067=CLOSED_V28_AUTOMATED_AND_WORKDESK_MANIFEST_RETEST
ERR-068=CLOSED_V28_AUTOMATED_AND_WORKDESK_CLASSIFICATION_RETEST
ERR-069=FIXED_AUTOMATED_VALIDATED_REAL_SUCCESS_PATH_PENDING_ERR-075
ERR-070=CLOSED_V28_AUTOMATED_AND_WORKDESK_TOOL_BOUNDARY_RETEST
ERR-071=CLOSED_V28_V29_VALIDATED
ERR-072=CLOSED_V28_VALIDATED
ERR-073=CLOSED_V33_REAL_UPGRADE_VALIDATED
ERR-074=CLOSED_V33_REAL_UPGRADE_VALIDATED
ERR-075=CLOSED_V51_WORKDESK_REAL_RETEST
ERR-076=CLOSED_V35_SOURCE_CONTRACT_VALIDATED
```

V35隔离验证在定向测试阶段停止：124通过、3失败；真实仓库和WorkDesk未写入。
当前新增状态：

```text
ERR-077=CLOSED_V38_ISOLATED_VALIDATED
ERR-078=CLOSED_WORKDESK_REAL_RETEST
ERR-079=CLOSED_V38_ISOLATED_VALIDATED
ERR-080=CLOSED_V38_ISOLATED_VALIDATED
ERR-081=CLOSED_V38_ISOLATED_VALIDATED
ERR-082=CLOSED_V42_COMMITTED_PUSHED
ERR-083=CLOSED_V42_COMMITTED_PUSHED
ERR-084=CLOSED_V42_COMMITTED_PUSHED
ERR-085=CLOSED_V42_COMMITTED_PUSHED
ERR-086=CLOSED_V42_COMMITTED_PUSHED
ERR-087=CLOSED_V42_COMMITTED_PUSHED
ERR-088=CLOSED_V51_WORKDESK_REAL_RETEST
ERR-089=CLOSED_V50_COMMITTED_PUSHED
ERR-090=CLOSED_V50_COMMITTED_PUSHED
ERR-091=CLOSED_V50_COMMITTED_PUSHED
ERR-092=CLOSED_V50_COMMITTED_PUSHED
ERR-093=CLOSED
ERR-094=CLOSED_V52_OFFICIAL_SOURCE_FALLBACK
ERR-095=CLOSED
ERR-096=CLOSED
ERR-097=CLOSED
ERR-098=CLOSED_V55_PACKAGE_PREFLIGHT_CORRECTED
ERR-099=CLOSED
ERR-100=CLOSED
ERR-101=CLOSED
ERR-102=CLOSED
ERR-103=CLOSED
ERR-104=CLOSED
ERR-105=CLOSED
ERR-106=CLOSED
ERR-107=CLOSED
ERR-108=CLOSED
ERR-109=CLOSED
ERR-110=CLOSED
ERR-111=CLOSED
ERR-112=CLOSED
ERR-113=CLOSED
ERR-114=CLOSED
ERR-115=CLOSED
ERR-116=CLOSED
ERR-117=CLOSED
```

V36隔离验证完成A/B基线控制并应用精确11文件补丁：129项通过、1项失败；唯一失败是ERR-080经验门禁状态断言过期。产品实现、真实SpecForge、WorkDesk、用户级安装和WI-0004均未改变。

V37隔离验证完成A/B基线控制、130项定向测试、TypeScript、daemon-core构建和全仓构建；唯一失败为ERR-081：两个状态文档各多一个EOF空白行，`git diff --check` 阻断。真实SpecForge、WorkDesk、用户级安装和WI-0004均未改变。

V38隔离验证成功：A/B基线控制、130项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和精确11文件范围全部通过。真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

过程复核补录ERR-082—ERR-087。V39只补齐过程治理和固定文本消费者，不改变V38产品代码。

V39隔离验证成功：过程门禁、130项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和精确11文件范围全部通过。

V40真实仓库应用成功：精确11文件已写入真实SpecForge；同一完整验证链再次通过；WorkDesk未改变；未安装、未提交、未推送；daemon/OpenCode保持停止。

V41只更新4个状态消费者，使ERR状态、current-handoff、活动实施文件和经验门禁与V39/V40实际证据一致；产品代码和11文件总范围不变。

V41提交前状态闭包已经成功：4个状态消费者、130项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和精确11文件范围全部通过。

本变更集由V42完成一次提交并推送到远程 `main`。提交内容不在自身文件中写入自引用SHA；实际 `COMMIT_SHA`、`REMOTE_HEAD_AFTER_PUSH` 和提交文件清单以V42证据包为准。

下一阶段是用户级安装升级和WorkDesk WI-0004真实重验。安装完成前不得启动daemon/OpenCode；重验只恢复当前 `candidate_preparing` 现场，不得修改Candidate内容、执行User Decision、Merge、Code Permission或业务代码。

V43用户级升级成功：119/119部署文件、9/9 Agent、installer verify、旧目录不变、错误嵌套runtime缺失、SpecForge和WorkDesk审计均通过。

WI-0004真实重验确认ERR-078已闭合：Manifest精确5项、历史2项排除、Requirement Candidate未被错误要求。ERR-075被ERR-088阻断，WorkDesk停在 `gates_failed`，Candidate内容未修改，Gate未重复运行。

V44隔离验证确认真实Architecture标题与Carrier正向路径通过，但新增ERR-089导致3个Investigation回归，ERR-090导致2个固定文本测试失败。真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

V45隔离验证完成c01d098基线控制并应用精确8文件：143项测试通过，唯一失败为ERR-091固定文本转义假阴性。真实Architecture标题、共享Matcher、Investigation、Design Governance、经验门禁和ERR-088—090第一组治理断言均已通过。真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

V46隔离验证继续保持精确8文件和c01d098基线控制：143项测试通过，唯一失败为ERR-092。日志证明ERR-091的字面量反斜杠问题已消除，但Bun 1.3.11把非ASCII `String.raw` 模板内容暴露为 `\uXXXX` 字面量。产品Matcher、真实Architecture标题、Investigation、Design Governance和其他治理测试均通过；真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

V47隔离验证成功：c01d098基线控制、144项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和精确8文件范围全部通过。真实Architecture标题、共享Matcher、Investigation和Design Governance消费者全部闭合。真实SpecForge、WorkDesk、用户级安装和WI-0004均未修改。

V48只把V47验证通过的精确8文件应用到真实SpecForge并重复完整验证。产品文件保持V47目标字节；状态消费者对账为V47隔离成功、V48待真实应用。V48不提交、不推送、不安装真实用户级组件，不修改WorkDesk或WI-0004。

V48真实仓库应用成功：精确8文件已写入真实SpecForge；144项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和WorkDesk不变审计全部通过。未提交、未推送、未安装真实用户级组件，WI-0004保持 `gates_failed`。

V49只更新5个状态消费者，使经验台账、交接文件、实施状态和固定文本测试与V48真实应用证据一致。共享Matcher、Architecture Carrier真实标题测试和Matcher专项回归3个产品文件保持V48字节不变。V49成功后下一步才是提交推送。

V49提交前状态闭包成功：5个状态消费者、3个产品文件哈希、144项定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和精确8文件范围全部通过。

本变更集由V50完成一次提交并推送到远程 `main`。提交文件不写入自引用SHA；实际 `COMMIT_SHA`、远程HEAD和精确8文件清单以 `SpecForge-v50-commit-evidence-*.zip` 为正式执行证据。

V50不执行真实用户级安装，不修改WorkDesk或WI-0004。下一阶段先完成用户级升级和119/119一致性验证，再由用户手工启动daemon/OpenCode，在当前 `gates_failed` 现场按受控恢复路径重新运行一次正式Gate。

V51用户级升级成功：真实用户级Manifest 119项、部署文件119/119、Agent 9/9、installer verify、旧目录不变、错误嵌套runtime缺失、SpecForge和WorkDesk审计均通过。

随后WI-0004从 `gates_failed` 按Runtime允许链恢复为 `candidate_preparing → candidate_prepared → gates_running`，正式Gate只运行一次并10/10通过，最终进入 `approval_required`。5个冻结Candidate内容未变化。ERR-075和ERR-088完成真实项目闭环。

同一轮出现ERR-093：为计算Candidate SHA256错误调用 `sf_safe_bash`，触发并正确解除可避免HardStop。V52只补强主编排代理工具边界、过程经验和状态消费者；不修改Gate、Runtime、状态机、WorkDesk或Candidate。

V52未进入隔离修改或测试阶段。其验证器在读取OpenCode一手日志时，错误要求人工合成字段 `HARD_STOP_ID=HS-1785858808264`；真实日志已通过自然语言、Tool参数和最终状态三种形式完整记录同一HardStop。V52证据显示真实仓库、WorkDesk、用户级安装、WI-0004、提交和推送均未执行。

V53保持V52精确7文件产品范围，仅修正包内证据消费者并补录ERR-095/EXP-073。OpenCode证据改为按ID、原因、resolution、abandon、retry=false和最终解除六项事实组合验真。

V53已证明V52的固定格式假阴性得到修复：OpenCode一手日志语义事实组检查通过，V51部署证据与WorkDesk真实证据均通过。V53随后在任何补丁应用前，由0796240基线中的旧 `work_item.json` 测试精确失败2项而停止。

V54将范围从7文件重新冻结为8文件，新增修正 `v11-hard-stop-artifact-closure.test.ts`。生产者 `artifact-schema-validation.ts` 不修改，继续禁止 `work_item.status`。

V54已正确重现ERR-096：旧测试文件只有两项失败，分别是“缺失字段仍要求status”和“含status样例仍期待合法”；实际汇总为52项通过、2项失败、共54项。V54验证器因无关的硬编码 `49 pass` 再次产生假阴性，未应用任何补丁。

V55保持精确8文件范围和V54测试修复内容不变，只修正包内已知失败验证算法并补录ERR-097/EXP-075。

V55首次封包前静态审计因作用域过宽而自我阻断：历史V54失败对账必须保留 `49 pass`，而新ERR-096识别算法中已删除该硬编码。未生成压缩包，未向用户交付，未执行真实动作。修正后的封包审计分别检查两个函数作用域并使用V54真实日志演练。

V55实际完成精确8文件隔离验证：目标哈希8项、Git patch 8文件、全部定向测试与普通软件工程验证通过，WorkDesk保持不变。唯一未闭合项是成功摘要仍沿用旧7文件和旧错误ID常量。

V56不新增产品范围，保持同一8文件。验证器的范围、错误ID和最终状态全部从Manifest与实际文件集合派生，并增加summary/Manifest/target-hashes/Git diff四方一致性证据。

V56在最早的V55证据对账函数中因模块级 `re` 缺失而停止。V56证据包仅包含summary和commands.log，证明没有执行真实仓库、WorkDesk、WI-0004、安装、测试、提交或推送动作。

V57保持V56精确8文件产品范围。除补录ERR-100/EXP-078外，产品方案不变。验证器增加模块级依赖，并在封包阶段实际执行V55证据矛盾对账和V56失败对账。

V57已完成精确8文件的真实隔离验证，所有产品、测试、构建、安装和WorkDesk审计均通过。唯一未闭合项是成功摘要中的适用经验规则仍为旧手工字符串，遗漏Manifest中已存在的EXP-077与EXP-078。

V58保持同一8文件范围，只补录ERR-101/EXP-079并把完整prior_failure_reconciliation结果改为Manifest原子派生。

V59隔离验证成功：精确8文件、定向测试、TypeScript、daemon-core构建、全仓构建、`git diff --check`、隔离installer verify和WorkDesk不变审计全部通过。

独立封包审计随后发现ERR-102：V59最终ZIP内pyc与Manifest不一致。该失败不改变8文件产品补丁结论，但阻断真实应用。V60保持精确8文件范围，删除所有运行时缓存条目，增加最终ZIP成包后重开核验。

V60在隔离ERR-096基线控制中被ERR-103阻断：批准失败集合和52/2/54统计均正确，但首条失败名称附带Bun耗时后缀，原始文本比较产生假阴性。真实SpecForge、用户级安装、WorkDesk、提交和推送均未改变。

V61保持精确8文件产品范围并完成ERR-103解析器封包预检，但在任何真实写入前因Windows Git schannel TLS握手失败停止。该失败登记为ERR-104；真实SpecForge、用户级安装、WorkDesk、提交和推送均未改变。

V62继续保持精确8文件产品范围并实现远程HEAD三层入口，但封包前语法检查重新生成Python字节码，Manifest预检按ERR-105停止；V62 ZIP未生成，所有真实动作未执行。

V63继承V62远程回退和安全推送设计，完成隔离验证、精确8文件真实应用、提交 `688cf64c6e190a707f9f0e7306db5cf474f0ae35`、远程推送和用户级升级；正式installer verify通过119个文件。随后ERR-106因验证器把真实Manifest的files对象误判为列表而产生假失败，ERR-107使失败摘要把已成功执行的升级误报为未执行。V64不重复升级，只重新验证正式Manifest、逐项复核119文件和9个Agent，并提交5个治理状态消费者完成闭包。

### ERR-118：新模块完整候选被 Runtime 自己排除后又被 Gate 强制要求

```text
分类=PRODUCT_DEFECT
事实=WI-0001 Gate Run #7为9/10通过；四个新模块均只缺requirements.md和trace.md清单条目；八个Candidate文件实际存在
根因=Manifest物化只在Requirement业务字段变化时包含requirements，并对module_trace固定返回false；candidate_manifest_gate却对每个新模块固定要求五件套
影响=合法architecture_change永远无法到达approval_required，正确Candidate被迫反复重写
修复=module_boundary_changed=true时同时要求module_definition、requirements、design、module_contract、module_trace
防护=Runtime物化单元测试+sf_state_transition真实状态边界测试+既有candidate_manifest_gate完整性检查
状态=FIX_IMPLEMENTED
```

### ERR-119：project_contract_changed没有进入Project Contract Candidate物化条件

```text
分类=PRODUCT_DEFECT
事实=WI-0001明确project_contract_changed=true且extension_registry Candidate存在，但Runtime将其列入ignored_candidate_paths
根因=Project Contract物化条件只读取api_contract_changed和contract_registry_only，遗漏正式分类字段project_contract_changed
影响=Project Contract生产者与分类消费者断链，Project Contract Candidate可能未进入冻结Manifest和原子Merge
修复=project_contract_changed、api_contract_changed、contract_registry_only任一为true都必须要求extension_registry Candidate
防护=正向物化回归+缺失Candidate失败关闭回归
状态=FIX_IMPLEMENTED
```

### ERR-120：专业Agent在Candidate修订后使用sf_safe_bash验证治理目录并触发HardStop

```text
分类=PRODUCT_DEFECT
事实=HS-1785915221772由子Agent验证动作触发；Write Guard正确阻断；实际Candidate写入此前已由sf_artifact_write完成；原动作abandon且retry_original_action=false
根因=专业Agent自身规则虽已禁止shell治理目录，但Orchestrator委派任务没有强制逐次重申“只读验证也不得使用sf_safe_bash”
影响=正确Candidate修订后产生可避免HardStop，增加恢复风险和证据噪声
修复=Orchestrator所有Candidate子任务必须显式携带无shell验证边界；Write Guard继续作为最终机器阻断
防护=Agent/Skill契约固定文本回归+HardStop原始证据保留
状态=FIX_IMPLEMENTED
```

## EXP-095：新模块Candidate完整性必须由同一个Runtime规则生产并由Gate消费

`module_boundary_changed=true` 不等于业务Requirement变化，但新模块正式落地必须原子包含 `module.json`、`requirements.md`、`design.md`、`contracts.json`、`trace.md`。Runtime不得排除Gate必需对象；Gate也不得要求Runtime永远不会生产的对象。

## EXP-096：每个正式Classification字段必须完成生产者—全部消费者清单

新增或使用 `project_contract_changed` 等正式字段时，必须对账 Classification Schema、Manifest物化、Required Candidate、Gate、Merge、测试和真实项目。只在Agent输出中出现字段不构成产品支持。

## EXP-097：专业Agent的受控工具边界必须进入每次委派任务

静态Agent说明不是唯一防线。Orchestrator调度治理Candidate任务时必须重申：治理目录不得使用shell读取、检查或验证；只读目的也不例外。Runtime Write Guard继续失败关闭，任何触发均必须登记而不能被后续恢复覆盖。

```text
ERR-118=FIX_IMPLEMENTED
ERR-119=FIX_IMPLEMENTED
ERR-120=FIX_IMPLEMENTED
P0_OVERALL_STATUS=IN_PROGRESS
WI0001_STATE=gates_failed
NEXT_ACTION=VALIDATE_COMMIT_DEPLOY_THEN_RESUME_WI0001_ONCE
```

### ERR-121：V72治理文档结尾多出空白行被git diff --check阻断

```text
分类=PACKAGE_PREFLIGHT_DEFECT
事实=V72最终静态仓库对账时，3个治理文档报告new blank line at EOF
根因=追加章节时同时保留旧尾换行并再次写入双换行，未在目标字节冻结前执行单换行检查
影响=不影响产品逻辑；若未阻断会导致用户侧git diff --check失败
修复=所有目标文本统一规范为单个LF结尾，并在Manifest冻结前检查
防护=包内逐文件单LF检查+临时Git仓库git diff --check
状态=CLOSED_PREFLIGHT
```

## EXP-098：文档追加后必须在目标字节冻结前规范单个LF结尾

文档内容正确不代表Git补丁合格。每次追加Markdown后必须先执行单LF、无行尾空格和 `git diff --check`，通过后才能生成目标哈希、Manifest和ZIP。

```text
ERR-121=CLOSED_PREFLIGHT
```

### ERR-122：固定文本测试把第二个期望值误作toContain提示参数

```text
分类=PACKAGE_PREFLIGHT_DEFECT
事实=最终消费者审计发现toContain(actualNeedle, secondValue)中的secondValue只是失败提示，不会验证第二个业务事实
根因=把两个独立状态事实写进同一次断言调用，未执行断言API语义检查
影响=新下一动作即使缺失，测试仍可能通过，形成治理状态假阳性
修复=拆成两个独立toContain断言，并由经验门禁检查ERR-122与EXP-099
防护=新增断言调用语义预检，禁止用matcher可选message参数承载业务事实
状态=CLOSED_PREFLIGHT
```

## EXP-099：断言API的可选参数不得承载第二个业务事实

每个业务事实必须对应一个独立可执行断言。`toContain(expected, message)`、`toBe(expected, message)`等可选参数只能作为诊断文本，不得放置第二个期望值。封包前必须解析新增断言调用并确认每个状态事实都有独立matcher调用。

```text
ERR-122=CLOSED_PREFLIGHT
```

### ERR-123：V72使用Python shell=False直接启动Bun shim，隔离依赖阶段发生FileNotFoundError

```text
分类=VALIDATOR_DEFECT
事实=V72已创建隔离worktree；首条bun install --frozen-lockfile在CreateProcess阶段失败；产品补丁、提交、推送、安装和WI-0001均未执行
根因=验证器假定bun是可直接启动的原生EXE，没有识别Windows环境通过CMD解析bun.exe或bun.cmd shim的执行边界
影响=正确产品补丁无法进入隔离验证，且失败被错误报告为UNHANDLED
修复=全部Bun命令统一经静态ASCII CMD包装文件和%COMSPEC% /d /c启动；创建隔离修改前先执行bun --version真实预检；FileNotFoundError映射到当前阶段
防护=V72真实summary/commands纯解析+禁止直接subprocess启动bun+CMD包装参数正反例+用户Windows真实Bun入口预检
状态=FIX_IMPLEMENTED
```

## EXP-100：Windows命令shim必须通过其所属命令解释器启动并先做真实入口预检

Python `shell=False` 只适合直接可执行文件，不能假定CMD shim、BAT或CMD入口可由CreateProcess按命令名解析。Windows交付验证器调用Bun等shim时必须：

```text
静态ASCII包装CMD
→ %COMSPEC% /d /c
→ 真实--version预检
→ 再进入隔离依赖、测试、构建和安装
```

禁止直接使用 `subprocess.run(["bun", ...], shell=False)`。任何进程入口缺失必须归入具体阶段并保留命令证据，不得落入 `UNHANDLED`。有副作用动作成功后仍须立即记录动作事实。

```text
ERR-123=FIX_IMPLEMENTED
```

### ERR-124：V73在workspace类型声明生成前运行daemon-core TypeScript检查

```text
分类=VALIDATOR_DEFECT
事实=bun install成功安装1059项；52项定向测试全部通过；随后daemon-core no-emit报告permission-engine、workflow-runtime、service-management、observability无法解析
根因=workspace内部包的类型入口指向dist声明；验证器在确定性workspace build生成这些声明之前运行类型消费者
影响=正确产品补丁被错误阻断；真实仓库、提交、推送、安装、WorkDesk和WI-0001均未改变
修复=验证顺序调整为定向测试→确定性workspace build→daemon-core no-emit→daemon-core相关构建→diff检查
防护=V73真实summary/commands/targeted/typecheck日志纯解析+四个缺失workspace包精确集合+命令顺序检查+V74脚本顺序静态断言
状态=FIX_IMPLEMENTED
```

## EXP-101：workspace类型消费者必须在声明生产者构建后验证

Monorepo中`bun install`或其他workspace安装只证明依赖链接建立，不证明各包`types`入口对应的`dist/*.d.ts`已经存在。对依赖workspace声明的包执行独立TypeScript检查前，必须先完成仓库规定的确定性依赖构建顺序。

固定顺序：

```text
依赖安装
→ 定向测试
→ 确定性workspace build
→ 目标包TypeScript no-emit
→ 目标包相关构建复核
```

不得通过删除TypeScript检查、添加临时paths映射或把缺失内部声明误报为产品源码错误来绕过。验证器必须保留原始命令顺序证据，并用真实失败日志验证声明生产者集合。

```text
ERR-124=FIX_IMPLEMENTED
```

### ERR-125：V74全仓构建生成范围外Skill，但验证器在提交前未执行完整修改集合审计

- **分类**：`VALIDATOR_DEFECT`
- **现场**：V74的定向测试、workspace build、TypeScript、daemon-core build和 `git diff --check` 均通过，随后提交并推送精确11文件；最终状态发现 `setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md` 仍为修改状态。
- **根因**：验证器把 `git diff --check` 当作范围审计。该命令只检查空白错误，不证明实际修改路径等于批准集合。workspace build运行 `render-workflow-docs.ts` 后，验证器没有立即重新读取完整 `git status` 集合。
- **影响**：V74产品修复和用户级升级成功，但真实仓库在提交后不干净，`REAL_VALIDATION=PASS` 的证据语义不完整。
- **修复**：任何可能生成文件的测试、构建、格式化、代码生成或安装动作后，立即重新读取完整状态并与Manifest集合精确比较；比较通过前不得声明验证通过、提交或推送。
- **回归**：V75在workspace build后、提交前和提交后分别执行完整路径集合审计，并对范围外生成文件设置失败反例。

```text
ERR-125=CLOSED
```

## EXP-102：每个有文件副作用的验证动作后必须立即重算精确修改集合

`git diff --check`、退出码为0和测试通过都不能证明修改范围正确。以下动作完成后必须立即重新计算完整 tracked/untracked 路径集合：

```text
build
code generation
format
installer
test with snapshots
documentation renderer
```

固定顺序：

```text
执行动作
→ 读取git status --porcelain=v1 -z -uall
→ set(actual_paths) == set(Manifest.changed_paths或预期空集)
→ git diff --check
→ 才能记录该阶段PASS
```

如果动作发生在提交后，预期集合必须为空。范围对账必须发生在动作之后，不能使用动作之前的快照代替。

### ERR-126：architecture-change自动生成阶段矩阵与workflow JSON不同步

- **分类**：`TEST_DRIFT`
- **现场**：`bun run build` 调用 `scripts/render-workflow-docs.ts` 后，仅 `setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md` 发生修改。
- **根因**：该Skill的自动生成区段保留了人工扩展的 `candidate_preparing` 矩阵行，而生成器以 `configs/workflows/builtin/architecture_change.json` 为唯一输入，确定性输出不同文本。仓库缺少提交前 `render-workflow-docs.ts --check` 硬门禁。
- **影响**：远程提交中的生成文件不是源定义的确定性投影；每次全仓构建都会重新产生同一差异。
- **修复**：提交生成器的确定性输出，不改变非自动生成正文；增加renderer `--check`回归；生成区段禁止人工维护第二事实源。
- **回归**：V75测试要求renderer check退出码为0，并验证生成后的仓库不产生额外路径。

```text
ERR-126=CLOSED
```

## EXP-103：自动生成区段只能由正式源定义生成，提交前必须执行只读一致性检查

带有以下标记的内容属于生成物：

```text
AUTO-GENERATED:START
AUTO-GENERATED:END
```

生成区段的唯一事实源是对应配置与生成器。不得在生成区段内维护无法由源定义重现的人工文本。每次修改工作流定义、Skill、Agent或构建链时，必须在提交前执行：

```text
bun scripts/render-workflow-docs.ts --check
```

检查失败时必须先判断：

```text
源定义错误 → 修改源定义和必要消费者
生成物漂移 → 提交确定性生成结果
生成器错误 → 修生成器及正反例
```

不得通过忽略生成文件、恢复生成结果或只检查 `git diff --check` 宣布完成。

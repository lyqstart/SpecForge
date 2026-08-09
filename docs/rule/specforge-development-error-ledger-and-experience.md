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
□ 启用Git Governance时已区分closed与repository_delivery_complete；未在Post-Merge Verify前报告完整完成
□ Close后新增治理证据已在原WI分支按精确路径提交，工作树干净后才运行Merge Plan
□ Candidate批准未被当作默认主线Git Merge确认；Merge Plan通过后已单独取得用户明确确认
□ Post-Merge Verify已实际验证默认分支、fan-in merge commit、WI分支祖先、实现提交祖先和Formal Version实现指纹
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
### ERR-127：WI-0001治理关闭后未执行正式Git Merge

- **分类**：`PRODUCT_DEFECT`
- **现场**：独立项目WI-0001已通过Candidate Gate、User Decision、Spec Merge、Code Permission、Implementation、Verification、Formal Version和Close Gate，权威状态为`closed`；实现提交`69d5fd64`和治理证据提交`10fd4ff7`只存在于`feature/architecture-change-project-contract-wi-0001`，未进入`main`。
- **根因**：architecture-change Skill和Orchestrator的正常主链停在`sf_close_gate`，只提醒“Git merge前提交证据”，没有把`sf_git_merge_plan → 独立用户确认 → sf_git_merge_run → sf_git_post_merge_verify`定义为必须完成的仓库交付阶段。
- **影响**：治理生命周期关闭，但正式代码和治理规格没有进入默认主线；P0场景中的正式Git交付证据缺失。
- **修复**：新增Stage 8正式Git Merge协议；Close后精确提交治理证据，Merge Plan通过后单独取得用户确认，使用正式Tool合并并执行真实Post-Merge Verify。
- **回归**：真实临时Git仓库覆盖closed、干净工作树、无远程、`--no-ff` merge、分支祖先关系和实现指纹。

```text
ERR-127=FIX_IMPLEMENTED
```

## EXP-104：Close后产生的治理证据必须在原WI分支精确提交

`sf_close_gate`可以在状态进入`closed`后生成或更新Close证据。启用Git Governance时，Close成功后必须立即读取完整工作树状态，并且只允许当前WI目录中的Formal/Close治理证据进入最后一次checkpoint commit。

```text
sf_git_preflight
→ actual_status_paths全部位于.specforge/work-items/<WI>/**
→ 精确files调用sf_git_checkpoint_commit
→ 工作树重新验证为clean
```

存在业务文件、其他WI文件、未分类文件或实现文件变化时必须停止，不得切换主线、手工提交、隐藏文件或直接合并。Close Gate通过不能替代该提交证据。


### ERR-128：仍在WI分支且Close产物未提交时错误报告工作项完成

- **分类**：`EVIDENCE_REPORTING_DEFECT`
- **现场**：OpenCode最终报告称“WI-0001完成”，但当前分支仍是WI feature分支，默认`main`仍停在种子提交，且`work_item.json`、`close_gate.md`、`filesystem_diff_evidence.json`、`gates/close_gate.json`仍未提交。
- **根因**：最终摘要把`authoritative_state=closed`错误等同于“仓库交付完成”，没有核对当前分支、主线祖先关系、工作树和Post-Merge Verify。
- **影响**：用户被告知完成，但主线没有包含实现和最终治理证据。
- **修复**：报告模型分离`governance_closed_pending_git_merge`、`git_merged_pending_post_merge_verify`和`closed_and_git_merged`；只有Post-Merge Verify返回`repository_delivery_complete=true`才允许报告完整完成。
- **回归**：Agent/Skill、工具返回和状态文档固定消费者同时检查三态边界。

```text
ERR-128=FIX_IMPLEMENTED
```

## EXP-105：Candidate批准不能替代默认主线Git Merge确认

用户批准Candidate Package只授权规格候选进入正式Project Spec和后续实现，不自动授权把Git分支写入默认主线。正式Git Merge是独立的不可逆仓库动作，必须在Merge Plan列出目标分支、实际Diff和全部阻塞项后，取得当前用户明确确认。

固定流程：

```text
sf_git_merge_plan.can_merge=true
→ 向用户展示目标分支与变更边界
→ 用户明确确认合并到默认主线
→ sf_git_merge_run(confirmed=true)
```

历史批准、Close成功、`can_merge=true`或Agent推断均不能替代确认。没有确认时必须停止，不能用普通Git命令绕过Tool。


### ERR-129：Git Merge工具没有形成closed到主线交付的完整硬门禁

- **分类**：`PRODUCT_DEFECT`
- **现场**：原`gitMergePlan`只检查工作树和非空Diff；原`gitPostMergeVerify`仅返回`plan_only`，没有实际验证；Merge Handler没有从StateManager读取权威状态；无远程项目会默认尝试`origin`。
- **根因**：Git Governance只覆盖“执行一个merge命令”，没有把权威closed状态、Formal Version不变性、原WI分支、用户确认、主线merge commit、分支祖先关系和实现指纹组成一个生产者—消费者闭环。
- **影响**：非closed WI、错误分支、未提交Close证据、实现漂移或未实际合并的场景可能被错误允许或错误报告成功。
- **修复**：Merge Plan/Run/Post-Merge Verify均读取StateManager权威状态；Run在WI分支验证Formal Version后合并；无已配置远程时明确跳过pull；Post-Merge Verify真实检查默认分支、clean、fan-in merge commit、WI分支祖先、实现提交祖先和实现树指纹。
- **回归**：正向真实Git闭环，以及非closed、脏工作树、未确认、实现树被后续改写的失败反例。

```text
ERR-129=FIX_IMPLEMENTED
```

## EXP-106：治理关闭与仓库交付完成必须使用不同状态

工作流权威状态`closed`只证明治理生命周期已封口。启用Git Governance的项目还必须完成仓库交付状态机：

```text
governance_closed_pending_git_merge
→ git_merged_pending_post_merge_verify
→ closed_and_git_merged
```

只有最后状态同时具备以下证据时，才可设置`repository_delivery_complete=true`：

```text
StateManager权威状态=closed
Close Gate=passed
Formal Version Gate=passed
当前分支=默认主线
工作树=clean
WI分支是主线HEAD祖先
HEAD是--no-ff merge commit
Formal Version实现提交是HEAD祖先
实现文件指纹与快照一致
```

任何摘要、交接文件或Agent最终报告不得用“closed”“Close Gate通过”或“提交存在”代替正式主线交付完成。

### ERR-130：V76文档追加后再次产生EOF空白行

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V76全部TypeScript目标语法转译通过，但首次`git diff --check`精确报告经验台账、current-handoff和P0实施文件各有一个`new blank line at EOF`。
- **根因**：文档追加函数在已规范化正文后同时拼接了段落前导换行和最终换行，没有执行最终字节单LF归一化；属于ERR-121同类重复错误。
- **影响**：产品代码未执行、真实仓库未修改、ZIP未生成；封包被正确阻断。
- **修复**：全部文本目标在Manifest冻结前执行`rstrip()+"\\n"`，并再次运行`git diff --check`和逐文件单LF检查。
- **防护**：V76最终脚本对全部目标文本检查恰好一个LF结尾且禁止双LF EOF；重复错误检查标记`PASS_REPEATED_ERR121_GUARD_APPLIED`。

```text
ERR-130=CLOSED_PREFLIGHT
```

### ERR-131：V76用绝对行数阈值限制Orchestrator，远程基线已超过阈值

- **分类**：`TEST_DRIFT`
- **现场**：V76隔离定向测试只有 `Orchestrator governance execution closure > uses one Chinese governance chain to cover all five Orchestrator responsibilities` 失败；断言要求 `sf-orchestrator.md` 逻辑行数 `<320`，V76目标为349行。
- **基线控制**：远程 `e84ab54f4d76cb5b6dde6c80f3cc99e22f4329f3` 的未修改 Orchestrator 已有335行，同一旧断言在产品补丁应用前即失败。
- **根因**：测试把“只有一条中文治理主链”的语义要求错误实现为绝对文件行数；该阈值没有权威规则、预算所有者或生成器契约，且未随既有治理职责增长同步。
- **影响**：V76在隔离测试阶段正确停止；真实仓库、用户级安装、提交、推送、WorkDesk和WI-0001均未修改。
- **修复**：删除绝对行数断言，改为精确验证四个治理主链顶层章节按固定顺序各出现一次，并继续验证全部关键职责文本和禁止项。
- **回归**：V77先在未应用补丁的远程基线精确复现唯一批准失败，再应用16文件目标并要求全部定向测试通过。

```text
ERR-131=FIX_IMPLEMENTED
```

## EXP-107：演进型治理文档回归必须验证语义结构，不得用无权威来源的绝对行数代替

Agent、Skill和治理说明会随着正式职责增加而演进。除非唯一权威文件明确给出尺寸预算、预算责任人和超限处置方式，否则测试不得用固定行数、字符数或字节数代表“单一主链”“不重复”或“可维护”。

正确验证对象是：

```text
必需章节按固定顺序存在
+ 每个主章节恰好出现一次
+ 禁止的旧章节或重复链不存在
+ 关键责任、继续条件和失败关闭文本完整
+ 自动生成区段与源定义一致
```

需要控制重复时，应检查章节唯一性、规则ID重复、同义主链重复和生成区段漂移。不得为了通过行数阈值删除正式治理规则，也不得在基线本身已经超限时把新增正确规则误判为产品回归。

### ERR-132：独立P0验证项目目录消失且首次全盘搜索未找到原Git仓库

- **分类**：`ENVIRONMENT_FAILURE`
- **现场**：`D:\code\temp\SpecForge-P0-Validation` 不存在；按目录名和提交 `10fd4ff7c6640877794a89ed73cc50533d330a42` 扫描 `D:\code` 未找到仓库。WI-0001治理状态已经 `closed`，但正式Git Merge尚未执行。
- **根因**：目录为何进入回收站缺少一手证据，固定标记 `INSUFFICIENT_EVIDENCE`，不得猜测为用户删除、脚本删除或产品自动清理。
- **影响**：如果按种子文件重建，会丢失原 `.git` 对象、分支、三个提交、正式治理产物和4个未提交Close证据，无法满足Formal Version与Git Merge指纹门禁。
- **正确处理**：停止重建；运行只读全盘、回收站和Git对象扫描；只接受包含目标提交且分支、HEAD、main和工作树集合全部匹配的唯一仓库。
- **恢复证据**：只读扫描在回收站找到唯一精确仓库；V2恢复包使用临时目录复制、完整Git事实复核和原子改名恢复到原路径，回收站源保持不变。
- **当前状态**：`CLOSED_RECOVERED_EXACT_GIT_REPOSITORY`。

```text
ERR-132=CLOSED_RECOVERED_EXACT_GIT_REPOSITORY
```

## EXP-108：业务治理仓库丢失时必须先恢复原Git对象，禁止根据种子或日志猜测重建

恢复条件必须同时满足：

```text
目标提交对象存在
+ 当前分支精确匹配
+ HEAD精确匹配
+ 默认分支精确匹配
+ git status porcelain集合精确匹配
+ git fsck无对象错误
+ 唯一候选仓库
```

只有满足全部条件才允许复制恢复。恢复必须先复制到临时目录并再次复核，再原子改名到目标路径；不得删除回收站原件，不得运行WI、提交、合并、daemon或OpenCode。任何事实不一致都必须 `INSUFFICIENT_EVIDENCE`。

### ERR-133：恢复校验器对git status --porcelain执行strip导致状态列失真

- **分类**：`VALIDATOR_DEFECT`
- **现场**：期望首行为 ` M .specforge/work-items/WI-0001/work_item.json`，校验器实际解析为 `M .specforge/...`，错误报告仓库事实不一致。
- **根因**：对完整命令输出调用 `.strip()`，删除了 porcelain 第一列用于表示暂存区状态的前导空格。
- **影响**：精确仓库被错误阻断；未复制、未修改项目、未执行WI或Git动作。
- **修复**：使用 `splitlines()` 保留每行固定列；只移除输出末尾空行，不得对单行执行左右空白归一化。
- **回归**：V2包用真实四行porcelain状态执行源、临时副本和目标目录三次精确集合比较。

```text
ERR-133=CLOSED
```

## EXP-109：Git porcelain是固定列协议，解析器不得删除前导状态列

`git status --porcelain` 的前两列分别表示暂存区和工作树状态。验证器必须按原始字节或保留前导空格的行解析；禁止使用 `strip()`、`lstrip()`、默认分词或任何会改变前两列的规范化。测试必须至少覆盖 ` M`、`M `、`??` 三类状态。

### ERR-134：恢复证据ZIP在写入摘要后重建，摘要哈希指向旧字节

- **分类**：`EVIDENCE_REPORTING_DEFECT`
- **现场**：首版恢复包把ZIP SHA256写入内部摘要后再次重建ZIP，导致摘要中的哈希不可能代表最终交付字节。
- **根因**：把最终容器哈希作为容器内部内容，形成自引用；同时哈希计算发生在最终封包之前。
- **影响**：即使恢复逻辑正确，证据摘要仍无法证明用户下载文件的最终字节。
- **修复**：包内Manifest只记录成员文件哈希；最终ZIP只构建一次，关闭文件句柄后在包外计算SHA256并由执行反馈报告。
- **回归**：V2包完成重开成员哈希审计后再计算并输出最终ZIP SHA256，内部文件不保存ZIP自身哈希。

```text
ERR-134=CLOSED
```

## EXP-110：交付容器哈希只能在最终字节冻结后计算，禁止容器内部自引用

固定顺序：

```text
生成全部成员
→ 冻结Manifest成员哈希
→ 构建ZIP一次
→ 关闭ZIP
→ 重开验证成员与Manifest
→ 计算最终ZIP SHA256
→ 在外部反馈中报告
```

任何后续重建都会使此前ZIP哈希失效。包内不得声明自身最终SHA256。

### ERR-135：importlib封包自检未先注册模块导致dataclass加载失败

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：恢复V2封包前使用 `module_from_spec()` + `exec_module()` 加载最终脚本，脚本中的 `@dataclass` 因模块未进入 `sys.modules` 而失败。
- **根因**：动态加载器没有模拟Python正常导入协议；只创建模块对象，没有在执行前以 `spec.name` 注册。
- **影响**：问题在ZIP交付前被阻断；用户未执行错误包，业务项目和SpecForge仓库均未修改。
- **修复**：执行模块前设置 `sys.modules[spec.name] = module`，失败后清理；随后实际调用全部新增纯函数正反例。
- **回归**：V2封包预检使用最终脚本、真实恢复证据和错误porcelain反例完成动态加载与函数调用。

```text
ERR-135=CLOSED_PREFLIGHT
```

## EXP-111：动态加载自检必须遵守正常import协议并实际调用变更函数

使用 `importlib.util.module_from_spec()` 时，执行前必须把模块注册到 `sys.modules`。封包自检不能只做 `compile()`；必须：

```text
创建spec
→ 创建module
→ 注册sys.modules[spec.name]
→ exec_module
→ 调用新增或修改的纯函数
→ 正向与失败证据均执行
→ 清理临时注册与缓存
```

这类自检必须在最终ZIP生成前完成。

### ERR-136：Formal Version文件集合漏记实际业务代码但Git Merge仍被放行

- **分类**：`PRODUCT_DEFECT`
- **现场**：WI-0001分支相对 `main` 存在4个业务代码文件，但正式版本快照登记0个实现文件；Merge Plan仍返回可合并。
- **根因**：只校验已登记文件指纹，没有把登记集合与完整非 `.specforge/**` Git Diff对账。
- **修复**：Formal Version生产、Merge Plan、Merge Run和Post-Merge Verify均执行精确文件集合对账。
- **状态**：`CLOSED_REAL_WI_RECHECK_PASS`

## EXP-112：Formal Version文件集合必须与真实非治理Git Diff精确一致

```text
recorded implementation_files
=
git diff --name-only base_commit...source_head
- .specforge/**
```

缺失和多余路径都必须阻断；空集合只有在真实非治理Diff也为空时合法。

### ERR-137：把缓存网页证据误报为当前远程main状态

- **分类**：`EVIDENCE_REPORTING_DEFECT`
- **根因**：把缓存网页视图当作实时Git引用。
- **修复**：远程HEAD和恢复判断只接受实时Git协议证据。
- **状态**：`CLOSED_EVIDENCE_CORRECTED_NO_REMOTE_WRITE`

## EXP-113：远程分支HEAD必须由实时Git协议确认

```text
git ls-remote <remote> refs/heads/<branch>
或
git fetch <remote> <branch>
+ git rev-parse refs/remotes/<remote>/<branch>
```

网页资料不能替代实时远程引用证据。

### ERR-138：V79补丁锚点未对当前远程源码完成真实预演

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V79因一个长段字面锚点0次命中停止。
- **影响**：没有修改、提交、推送或WI操作。
- **修复**：全部目标文件先在内存转换和校验，全部成功后才写入。
- **状态**：`CLOSED_BY_TRANSACTIONAL_PREWRITE_VALIDATION`

## EXP-114：交付补丁必须事务化写入

```text
读取全部批准文件
→ 全部转换仅在内存执行
→ 校验全部锚点和最终标记
→ 全部成功后一次写入
```

禁止边匹配边写入。

### ERR-139：V80使用非唯一函数结束标记导致完整转换失败

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V80用通用 `\n}` 识别Post-Merge函数结束位置，在源码中命中81次。
- **影响**：事务化预检阻止了任何文件写入，但用户执行仍失败。
- **根因**：开始标记唯一，结束标记不唯一；封包逻辑把文件级通用符号误作函数级边界。
- **修复**：V81取消该函数区段截取，改为替换经过精确核对的唯一语义代码块。
- **状态**：`FIX_INCLUDED_IN_V81_PENDING_REAL_EXECUTION`

## EXP-115：补丁定位必须使用唯一语义代码块

补丁定位必须满足：

```text
开始和结束边界均唯一
或
直接替换完整且唯一的语义代码块
```

禁止把通用大括号、空行、缩进或行号单独用作结构边界。锚点命中次数不是1时必须在写入前停止。

### ERR-140：V81再次删除git status porcelain首行语义前导空格

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **重复错误**：`ERR-133`
- **现场**：V81已写入精确6个批准文件，但范围审计把 `docs/implementation/...` 解析为 `ocs/implementation/...`，随后失败关闭。
- **根因**：封包脚本的通用Git输出函数对完整输出调用 `strip()`，删除第一行 `git status --short` 的状态前导空格；路径解析仍按三列格式截取。
- **影响**：6个批准文件处于未暂存修改状态；没有提交、推送、安装或WI操作；测试尚未运行。
- **修复**：V82不再从Porcelain状态列提取文件路径，分别使用 `git diff --name-only`、`git diff --cached --name-only` 和 `git ls-files --others --exclude-standard` 审计三类文件。
- **状态**：`FIX_INCLUDED_IN_V82_PENDING_REAL_EXECUTION`

## EXP-116：Porcelain状态列不得经过strip

`git status --short` 和 `git status --porcelain` 的前导空格是状态协议的一部分，禁止对完整输出执行：

```text
strip()
lstrip()
trim()
```

文件范围审计优先使用不依赖状态列宽度的命令：

```text
未暂存文件 → git diff --name-only
已暂存文件 → git diff --cached --name-only
未跟踪文件 → git ls-files --others --exclude-standard
```

必须增加机器预检，证明首个状态为“仅工作树修改”的文件仍保留完整首字符。

### ERR-141：V82从仓库根目录调用错误的Vitest配置

- **分类**：`TEST_DRIFT`
- **现场**：V82使用 `bunx vitest run packages/daemon-core/tests/unit/...`；Vitest读取根目录配置，只包含根目录 `tests/**`，报告 `No test files found`。根目录没有直接声明Vitest，`bunx`临时使用4.1.5。
- **根因**：验证脚本没有遵守daemon-core包级测试入口和包级Vitest配置。
- **影响**：产品补丁和范围审计已完成，但测试未实际执行；没有提交、推送、安装或WI操作。
- **修复**：进入 `packages/daemon-core` 后通过包自身的 `bun run test -- <包内相对测试路径>` 执行定向测试；全量测试继续使用同一包级入口。
- **状态**：`FIX_INCLUDED_IN_V83_PENDING_REAL_EXECUTION`

## EXP-117：包内测试必须从包级入口运行

Monorepo中的测试必须先确认：

```text
测试文件所属package
package.json中的test脚本
该package的Vitest配置
测试路径相对于哪个工作目录
```

daemon-core测试固定使用：

```text
cd packages/daemon-core
bun run test -- tests/unit/<file>.test.ts
```

禁止从仓库根目录使用 `bunx vitest` 猜测配置或临时解析测试框架版本。定向测试输出必须证明实际发现并执行目标文件。

### ERR-142：未建立同提交全量A/B基线就尝试归因补丁回归

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V83定向测试、TypeScript和构建通过，但daemon-core全量运行有165个失败；执行前没有先运行精确 `92792ec...` 干净基线。
- **根因**：把“运行全量测试”和“证明补丁新增失败”混为一件事。
- **修复**：最终交付在相同Bun、固定seed、隔离HOME/TEMP和相同参数下运行干净基线与补丁版本，按规范化测试全名比较失败集合。
- **状态**：`CLOSED_BY_FINAL_EXACT_HEAD_AB_GATE`

## EXP-118：全量回归失败必须先做同提交A/B归因

```text
clean exact HEAD + same environment + same command
versus
patched exact HEAD + same environment + same command
```

只有 `patched_failures - baseline_failures = ∅` 才能证明补丁没有新增全量回归。历史失败数量、不同环境日志或只运行补丁版本都不能替代A/B。

### ERR-143：Windows Python直接执行bun.cmd导致WinError 2

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V84已经创建临时worktree，随后Python直接CreateProcess `bun.cmd` 失败。
- **根因**：Windows `.cmd/.bat` 是命令解释器脚本，不是可直接CreateProcess的PE可执行文件。
- **修复**：解析Bun真实路径；`.exe`直接执行，`.cmd/.bat`通过 `%COMSPEC% /d /s /c call` 执行，并在创建临时工作树前运行 `bun --version` 自检。
- **状态**：`CLOSED_BY_COMSPEC_CALL_WRAPPER`

## EXP-119：Windows命令包装器必须通过COMSPEC执行

跨平台封包器调用外部工具时必须按扩展名分流：

```text
.exe → direct CreateProcess
.cmd/.bat → %COMSPEC% /d /s /c call
```

禁止仅用 `shutil.which()` 成功作为“可执行”证据；必须实际运行版本自检。

### ERR-144：Git Bundle生成前未创建证据目录

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V86执行 `git bundle create .../evidence/SpecForge.bundle --all` 时，父目录不存在，Git无法创建Bundle锁文件。
- **根因**：产物目录创建顺序错误，封包前模拟验证未覆盖真实目录层级。
- **修复**：先创建全部输出目录，再生成Bundle，立即执行 `git bundle verify`，最后校验ZIP成员和SHA256。
- **状态**：`CLOSED_BY_DIRECTORY_AND_BUNDLE_VERIFY_PREFLIGHT`

## EXP-120：证据产物必须先建目录再生成并立即自检

所有证据封包固定执行：

```text
mkdir parents
→ generate artifact
→ artifact-native verify
→ manifest hash
→ final archive
→ archive verify
```

仅检查脚本语法或最终ZIP存在，不足以证明内部证据可用。

## EXP-121：用户环境不是补丁开发调试环境

产品修改必须先在精确仓库副本完成：

```text
权威文件读取
→ 精确HEAD重建
→ 修改范围冻结
→ 完整文件修改
→ 定向测试
→ 同提交A/B回归
→ TypeScript与构建
→ 范围和Diff审计
→ 最终完整文件封包
```

用户侧只接收一个完成验证的完整ZIP和一条失败关闭命令。禁止把字符串锚点调试、测试入口试错、环境探测或封包脚本开发转移到用户仓库。

### ERR-145：V88未对称构建A/B工作树并混用Suite级与用例级失败

- **分类**：`VALIDATOR_DEFECT`
- **现场**：V88定向测试20/20通过；全量A/B报告baseline失败121项、patched失败154项，并误报42项补丁新增失败。
- **一手证据**：V88两侧收集层级不一致共8个测试文件。42项错误“新增失败”全部来自其中6个文件；另外 `tests/unit/daemon.test.ts` 与 `tests/unit/governance-closure-core.test.ts` 在patched侧已收集且没有对应新增失败。baseline侧8个文件都没有收集到任何用例，而是在加载阶段因workspace包 `dist` 入口不存在而记录为 `SUITE_LEVEL_FAILURE`；patched侧使用此前已构建的真实仓库，能够收集用例。
- **根因**：baseline临时工作树只执行 `bun install`，没有先执行workspace build；patched侧直接使用真实仓库已有构建产物，A/B前置条件不对称。比较器又把baseline的Suite级加载失败与patched的用例级失败放入同一字符串集合，导致同一文件的失败被错误计算为“旧Suite失败已解决 + 42个新用例失败”。
- **影响**：V88正确阻止提交、推送、安装和WI-0001 Git Merge；真实仓库仍只有精确6个未暂存批准文件。42项不能作为ERR-136产品回归证据。
- **修复**：V89在两个独立detached临时工作树中重建同一 `92792ec...`；只向patched临时工作树应用最终6文件；两侧使用同一Bun、安装命令、workspace build、测试命令和彼此隔离的HOME/TEMP。比较器分别处理Suite加载失败与已收集用例失败；任一文件两侧收集层级不同即标记A/B不可比较并失败关闭。全部验证通过前不修改真实仓库。
- **状态**：`CLOSED_BY_V89_SYMMETRIC_AB_VALIDATION`

## EXP-122：A/B验证必须在对称构建的临时工作树中按同粒度结果比较

A/B回归固定满足：

```text
baseline = detached exact HEAD + install + workspace build
patched  = detached exact HEAD + exact payload + install + workspace build
```

两侧必须使用：

```text
同一Bun路径和版本
同一锁文件和安装参数
同一构建命令
同一测试入口和参数
不同且完全隔离的HOME/TEMP/APPDATA/OPENCODE_CONFIG_DIR
```

比较规则：

1. Suite加载失败与具体用例失败分开建模；
2. 同一测试文件一侧未收集用例、另一侧已收集用例时，结果为 `AB_INCOMPARABLE`，不得计算新增失败；
3. 只有两侧均完成同层级收集后，才能比较规范化失败用例集合；
4. baseline和patched均不得直接使用真实开发工作树；
5. 定向测试、全量A/B、TypeScript、构建、Installer和Diff审计全部通过后，才允许把已验证的完整文件写入真实仓库；
6. A/B验证脚本必须用历史错误证据执行纯函数回归，至少覆盖“Suite级失败对用例级失败不得比较”。

### ERR-146：机器读取Git路径列表时把stderr警告混入stdout

- **分类**：`PACKAGE_PREFLIGHT_DEFECT`
- **现场**：V89封包前在隔离Git Bundle克隆仓库执行完整文件替换演练时，`git diff --name-only` 的stdout包含批准文件路径，stderr同时输出CRLF转换警告。通用命令包装器把stderr合并到stdout，范围审计将警告文本误当成额外文件路径并失败关闭。
- **根因**：同一个命令执行函数同时服务“人类日志”和“机器协议”，统一使用 `stderr=STDOUT`；调用方无法区分Git路径协议与诊断信息。
- **影响**：问题在最终ZIP生成前的隔离演练被阻断；用户仓库、远程仓库、安装和WI均未操作。
- **修复**：所有用于分支名、HEAD、远程引用、路径集合和状态判断的Git调用分别捕获stdout与stderr；成功时只解析stdout，失败时同时报告stdout和stderr。人类可读日志命令仍可合并输出。
- **状态**：`CLOSED_PREFLIGHT_BEFORE_V89_DELIVERY`

## EXP-123：机器协议stdout与诊断stderr必须分离

以下命令输出属于机器协议：

```text
git diff --name-only
git diff --cached --name-only
git ls-files
git rev-parse
git branch --show-current
git ls-remote
```

固定要求：

1. stdout和stderr分别捕获；
2. 返回码为0时只解析stdout；
3. stderr警告必须保存为诊断证据，但不得进入路径、SHA、分支或状态集合；
4. 返回码非0时同时报告stdout和stderr；
5. 封包前必须用会产生CRLF warning的Git仓库执行范围审计回归。

### ERR-147：Merge Plan识别无效Formal Version，但无效关闭恢复入口无法消费同一证据

- **分类**：`PRODUCT_DEFECT`
- **现场**：V89部署后，独立项目WI-0001真实 `sf_git_merge_plan` 正确返回 `can_merge=false`，并报告4个业务文件缺失于 `formal_version_snapshot.implementation_files`。旧Formal Version Gate仍为passed。
- **根因**：`recover_invalid_closure` 只消费Formal Gate状态和以当前实际范围重新计算的Git绑定，没有调用正式Git Merge使用的Formal Version快照验证器。当前Git绑定合法时，`invalidity_reasons`为空，恢复入口返回 `INVALID_CLOSURE_RECOVERY_NOT_PROVEN`。
- **影响**：已关闭WI进入死锁：正式Git Merge必须阻断，但既有补偿恢复也无法证明关闭无效，无法复用原WI回到 `implementation_ready`。手工修改状态、修改快照或创建替代WI均违反既有治理规则。
- **修复**：无效关闭恢复复用 `assertFormalVersionSnapshotForGitMerge`；只将快照缺失、实现提交失效、base缺失、文件集合不一致、实现指纹变化和base diff变化识别为持久化关闭无效证据。工作树不干净和当前分支错误仍作为环境阻断。恢复记录新增快照SHA256和原始验证错误。
- **回归**：新增“Formal Gate passed、快照遗漏已提交业务文件”真实Git夹具，必须生成 `closure_recovery.json` 并执行 `closed → implementation_ready`；保留显式确认和原关闭证据哈希检查。
- **状态**：`CLOSED_REAL_WI_RECOVERY_PASS`

## EXP-124：终态失败关闭Guard与补偿恢复必须消费同一份持久化证据

当一个Guard在终态之后阻断后续交付时，受控补偿恢复不能使用较弱或不同的判断口径。

固定要求：

```text
Formal Version / Git Merge Guard使用的持久化不变量
=
recover_invalid_closure用于证明旧关闭无效的不变量
```

必须保证：

1. Merge Plan、Merge Run与无效关闭恢复复用同一个Formal Version快照验证器；
2. 文件集合、实现指纹、实现提交和base diff不一致均可形成恢复证据；
3. 当前工作树不干净、当前分支错误等运行环境问题不能被误写成“旧关闭无效”；
4. 恢复记录必须保存被判无效证据的哈希和原始机器错误；
5. 恢复只允许 `closed → implementation_ready`，继续保持代码权限撤销；
6. 必须使用原WI，不得手工改状态、改Formal快照或创建替代WI绕过。

### ERR-148：产品修复已部署但运行中daemon未切换到新实现

- **分类**：`ENVIRONMENT_FAILURE`
- **现场**：V90提交、推送、用户级upgrade和verify均通过后，WI-0001首次 `recover_invalid_closure` 仍返回旧错误 `INVALID_CLOSURE_RECOVERY_NOT_PROVEN`。
- **一手证据**：V91使用真实WI快照直接调用当前源码和当前dist验证器，两者都返回4文件 `FORMAL_VERSION_IMPLEMENTATION_FILE_SET_MISMATCH`；运行中的daemon仍表现为旧处理器。用户随后确认上一轮没有按要求启动当前源码daemon。
- **根因**：用户级OpenCode共享文件升级不等于替换正在运行的daemon进程；未完成进程重启和运行来源确认就执行真实WI验证。
- **修复**：手工停止旧daemon，从精确SpecForge仓库提交启动新daemon，再启动OpenCode。重新读取时，持久化证据显示恢复已成功执行：`closed → implementation_ready`、`closure_recovery.status=applied`、代码权限保持撤销。
- **状态**：`CLOSED_BY_EXPLICIT_DAEMON_RESTART_AND_REAL_WI_RECOVERY`

## EXP-125：运行时产品修复必须证明进程来源而不能只证明磁盘文件已升级

涉及daemon行为的产品修复固定要求：

```text
source/dist hash正确
AND daemon旧进程已停止
AND 新进程从目标仓库/提交启动
AND 真实Tool行为符合新实现
```

用户级installer upgrade/verify只能证明安装载荷一致，不能证明已经运行的daemon加载了新代码。真实WI复检前必须完成手工生命周期切换；不得把旧进程行为误判为新提交产品回归。

### ERR-149：恢复后的 Formal Version Gate 只消费瞬时观测，未消费已通过的 Changed Files Audit

- **分类**：`PRODUCT_DEFECT`
- **现场**：WI-0001 从无效关闭恢复到 `implementation_ready` 后，重新完成 Executor、Changed Files Audit、Verifier 和 Semantic Closure；`sf_gate_run(gate_type=verification)` 中 Verification Gate 通过，但 Formal Version Gate 报告4个已提交业务文件全部 `unrecorded`，旧快照未被替换。
- **一手证据**：新的 `changed_files_audit.md` 明确记录4个 `in_scope` 条目；当前Git `base...HEAD` 同样包含这4个非治理文件；但 `auditActualGovernanceScope` 在新的daemon进程中优先依赖已经不存在的瞬时Write Guard观测，且 `work_item.actual_changed_files` 没有持久化，最终得到空文件集合。
- **根因**：Formal Version生产者没有把已通过的 `changed_files_audit.md` 作为持久化文件集合契约。恢复或重启后，瞬时观测丢失，Gate无法重建快照。
- **修复**：只在 Changed Files Audit verdict为PASS时，解析其 `## Entries` 中显式 `→ in_scope` 路径作为持久化事实；用该集合执行模块范围检查和与 `base...HEAD` 非治理Git Diff的精确对账。FAIL报告、治理路径和非in_scope条目不得进入集合。
- **状态**：`FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY`

## EXP-126：Formal Version文件集合必须来自可跨进程恢复的持久化审计证据

Formal Version不能只依赖当前daemon进程中的Write Guard观测。固定事实优先级必须包含：

```text
当前WI事实日志
→ 已通过的changed_files_audit.md显式Entries
→ work_item.actual_changed_files兼容字段
→ filesystem baseline
```

其中Changed Files Audit只有同时满足以下条件才能作为正式文件集合生产者：

1. verdict为PASS；
2. 路径位于 `## Entries`；
3. 条目显式标记 `in_scope`；
4. 排除 `.specforge/**`；
5. 最终仍必须与 `git diff --name-only base...HEAD` 的非治理路径精确相等。

### ERR-150：Formal Version Gate失败后Gate Runner仍推进到verification_done

- **分类**：`PRODUCT_DEFECT`
- **现场**：同一次 `sf_gate_run` 返回 Verification Gate passed、Formal Version Gate failed、summary failed，但状态自动执行 `verification_running → verification_done`。
- **根因**：`autoAdvanceVerificationState` 只查找并判断 `verification_gate`，忽略同一Verification阶段拥有的 `formal_version_gate` 和整体 `summaryStatus`。
- **影响**：权威状态宣称验证完成，但正式版本资格仍失败，形成状态与Gate事实矛盾；Close虽然仍应阻断，但后续编排会收到错误状态信号。
- **修复**：Verification阶段状态推进必须同时要求 Verification Gate、Formal Version Gate和Gate Summary全部通过；任一Gate缺失或失败时返回明确原因，不执行状态转换。
- **状态**：`FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY`

## EXP-127：复合Gate阶段的状态推进必须绑定全部Owned Gate和Summary

当一个阶段由多个Gate组成时，状态机不能以其中一个报告代替阶段结论：

```text
verification_gate=passed
AND formal_version_gate=passed
AND summary_status=passed
→ verification_done
```

固定要求：

1. Owned Gate缺失时不推进；
2. 任一Owned Gate失败时不推进；
3. Summary失败时不推进；
4. 返回缺失Gate、失败Gate和summary状态供机器诊断；
5. 回归必须覆盖“Verification通过但Formal Version失败”真实组合。

### ERR-151：非空治理类Write Guard日志遮蔽已通过的Changed Files Audit，Formal Version仍无法重建

- **分类**：`PRODUCT_DEFECT`
- **触发事实**：V92部署后，真实WI-0001再次运行Verification Gate；ERR-150修复已生效，Formal Version失败时状态保持`verification_running`，但`formal_version_snapshot.json`仍未重建。
- **根因**：`deriveActualChangedFiles`仍优先消费`write_guard_log.jsonl`。恢复、权限、Semantic Closure和HardStop处理会生成非空的治理类或阻断类日志；该来源一旦非空就阻止读取已经PASS的`changed_files_audit.md`。后续过滤`.specforge/**`后得到空实现集合，Formal Version继续失败。
- **影响**：持久化审计生产者存在且正确，但被较低生命周期、非阶段完成态的瞬时日志遮蔽；WI无法生成正确Formal Version快照。
- **修复**：Formal Version实际文件集合先消费PASS的`changed_files_audit.md`；仅当不存在可用PASS审计时才消费成功Write Guard业务文件；治理类日志在来源判定前剔除，不能阻断后续回退。
- **状态**：`FIX_IMPLEMENTED_PENDING_VALIDATION_DEPLOY_AND_REAL_WI_RETRY`

## EXP-128：阶段完成态持久化证据必须优先于后续瞬时运行日志

当下游在恢复或跨进程阶段重建事实时，已经通过的阶段完成态产物是该阶段的正式生产者合同。后续运行日志可能包含权限元数据、治理产物或被阻断尝试，不能因为“非空”就遮蔽正式产物。证据选择必须先按生命周期和语义作用域排序，再按是否非空选择；治理路径必须在决定来源可用性之前被剔除。

### ERR-152：V93交付脚本把5文件范围报告为6文件

- **分类**：`EVIDENCE_REPORTING_DEFECT`
- **现场**：V93实际`TARGET_FILE_COUNT=5`，Git提交和`ACTUAL_MODIFIED_FILES`也只有5个文件，但脚本仍输出`TEMP_PATCH_ACTION=APPLIED_EXACT_6_FILES_TO_PATCHED_WORKTREE`和`PATCH_ACTION=APPLIED_COMPLETE_FINAL_6_FILES`。
- **根因**：交付脚本沿用V92的硬编码文件数量文本，没有从Manifest的`changed_files`动态生成。
- **影响**：Git实际修改范围、提交、推送和安装均未扩大，但机器反馈内部自相矛盾，不能作为精确范围证据。
- **修复**：全部范围进度、最终结果和回滚文本从Manifest动态计算文件数量和版本名；封包前验证输出数量等于Manifest数量。
- **状态**：`FIX_INCLUDED_IN_V95_DELIVERY_SCRIPT`

## EXP-129：交付报告中的范围数量必须从同一Manifest动态生成

以下字段不得硬编码或从旧版本复制：

```text
TARGET_FILE_COUNT
TEMP_PATCH_ACTION文件数
PATCH_ACTION文件数
ACTUAL_MODIFIED_FILE_COUNT
回滚文件数
```

固定要求：

1. 唯一来源是最终Manifest的`changed_files`；
2. 补丁工作树、真实仓库和最终Git Diff必须分别对账该集合；
3. 输出文本中的文件数必须由`len(changed_files)`动态生成；
4. Manifest、实际Git Diff和反馈字段任一不一致时失败关闭；
5. 报告错误即使不影响代码，也必须登记并修复，不能以“实际提交正确”代替证据闭环。

### ERR-153：兼容模式治理范围提前返回空文件集合，Formal Version丢失持久化实现证据

- **分类**：`PRODUCT_DEFECT`
- **现场**：V93部署并重启目标daemon后，真实WI-0001的PASS Changed Files Audit、源码解析器和真实Git Diff都包含同样4个业务文件，但Formal Version Gate仍收到空实现集合并失败。
- **V94一手证据**：
  - `extractPassedChangedFilesAuditEntries`返回4个文件；
  - `deriveActualChangedFiles`返回4个文件，来源为`changed_files_audit.md`；
  - `git diff base...HEAD`返回相同4个文件；
  - `governance_scope.json.active=false`；
  - 源码Formal Version探针仍报告4个文件全部`unrecorded`，旧快照保持`implementation_files=[]`。
- **根因**：`auditActualGovernanceScope`在读取实际文件前判断`governance_scope.active`。当其为false时直接返回`actual_files=[]`，因此正确的持久化审计证据从未传给`inspectFormalGitBinding`。
- **架构错误**：把“Project Architecture/Data/Module范围治理是否激活”错误等同于“是否存在实际实现文件”。兼容模式只应跳过模块所有权与范围强制，不能清空Changed Files Audit和Git闭环需要的事实。
- **修复**：始终先取得并规范化实际文件；`active=false`时返回`passed=true`、`active=false`和真实`actual_files`，只跳过模块所有权与影响范围校验。Formal Version继续用该集合与`base...HEAD`非治理Git Diff精确对账。
- **回归**：新增真实Git夹具，覆盖`governance_scope.active=false + PASS audit + committed implementation`，要求Actual Scope返回文件、Formal Git Binding集合一致且无缺失。
- **状态**：`FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_RETRY`

## EXP-130：治理能力未激活不能抹除实现事实

必须区分两个维度：

```text
governance_scope.active
= 是否执行Module所有权、Architecture/Data/Contract范围强制

actual_files
= Changed Files Audit、Write Guard、Work Item或Filesystem Baseline证明的实际实现文件
```

固定规则：

1. 实际文件取证必须先于`active`分支；
2. `active=false`只允许跳过模块所有权和范围约束校验；
3. `active=false`不得返回伪造的空`actual_files`；
4. Formal Version、Git Binding和Merge Guard必须继续消费真实文件集合；
5. 兼容模式、恢复模式、跨进程重建和Project Spec未完全激活场景都必须覆盖回归；
6. 下游需要“是否适用治理强制”时读取`active`，需要“发生了哪些实现变化”时读取`actual_files`，不得混用。


### ERR-154：显式代码权限撤销沿用历史撤销时间，当前撤权事件缺少准确审计时间

- **分类**：`PRODUCT_DEFECT`
- **现场**：WI-0001在Verification Gate与Formal Version Gate全部通过后执行`sf_code_permission(action=revoke)`；权限事实正确变为`code_change_allowed=false`、`code_permission_revoked=true`、`allowed_write_files=[]`，但`code_permission_revoked_at`仍为前一次撤权时间，而`work_item.updated_at`已经刷新到当前操作时间。
- **一手证据**：当前撤权后`updated_at=2026-08-06T01:50:12.895Z`，`code_permission_revoked_at=2026-08-05T10:32:26.209Z`。源码`revokeCodePermission`和Close兼容同步均使用`code_permission_revoked_at ?? new Date().toISOString()`。
- **根因**：字段生产者把“字段已存在”错误等同于“当前撤权事件已记录”。经历释放、恢复和再次撤权后，历史时间不会被新的显式撤权覆盖；Close Gate又复制同一写入语义，形成两个可能漂移的生产者。
- **影响**：权限功能边界正确，但审计证据不能证明当前撤权事件发生时间；Close和后续Git交付无法把撤权事实与本轮验证收口准确关联。
- **修复**：建立统一`applyRevokedPermissionFacts`助手。显式撤权以`recordRevocationEvent=true`强制写入同一个`now`到`code_permission_revoked_at`和`updated_at`；Close兼容同步以`recordRevocationEvent=false`保留已有当前事件时间，仅在缺失时补齐。统一保留或回填`allowed_write_files_snapshot`。
- **回归**：覆盖“已有历史撤权时间→再次显式撤权必须刷新并等于updated_at”，以及“Close同步不得覆盖已经记录的当前撤权事件，同时必须保留冻结权限快照”。
- **状态**：`FIX_IMPLEMENTED_PENDING_SYMMETRIC_VALIDATION_DEPLOY_AND_REAL_WI_REVOKE_RECHECK`

## EXP-131：事件时间字段必须标识当前事件，状态同步不得冒充新事件

对带`*_at`的治理审计字段，必须区分：

```text
显式状态变更事件
→ 总是记录本次事件时间

兼容同步或事实对账
→ 保留已有事件时间
→ 仅在字段缺失时补齐
```

固定要求：

1. `sf_code_permission(action=revoke)`每次成功都必须刷新`code_permission_revoked_at`；
2. 同一次显式撤权的`code_permission_revoked_at`必须与`updated_at`使用同一个`now`；
3. 重新释放后再次撤权不得沿用前一轮时间；
4. Close Gate同步权限事实时不得伪造一次新的显式撤权事件；
5. 权限服务与Close不得各自复制字段写入规则，必须复用同一助手；
6. `allowed_write_files_snapshot`必须保留非空历史快照，不能因撤权清空；
7. 回归必须同时覆盖事件刷新、同步保留、缺失补齐和快照保留。

<!-- ERR155_ERR166_V8:START -->
## ERR-155—ERR-166：P0 独立真实项目验证产品修复与 V1—V7 封包失败

### ERR-155 — PRODUCT_DEFECT

- **事实**：`sf_contract_register` 只有 `add/reset`，无法受控更新正式 Registry 中既有 Project Contract。
- **根因**：产品只实现新增与重建 Candidate，没有“同 kind、同 ID、仅写 WI Candidate”的 update 契约。
- **修复**：增加 `update`；不存在、kind 不一致、namespace_type 更新均失败；保留其他 Contract；不直接写正式 Registry。

### ERR-156 — PRODUCT_DEFECT

- **事实**：Tasks Gate 无条件读取 Requirements Candidate。
- **根因**：Gate 未消费 `requirement_changed`、`acceptance_criteria_changed`、`business_rule_changed` 分类。
- **修复**：任一为 true 时读取 Candidate；三项均 false 时读取正式 Module Requirements；分类不完整时 Fail Closed 到 Candidate。

### ERR-157 — PRODUCT_DEFECT

- **事实**：Task Planner 可生成 `MODIFY/GAP` 等非法 Governance Relation Delta Operation。
- **根因**：Planner 输出契约未把操作集合收敛为 `ADD/REMOVE`，成功前也没有自检。
- **修复**：只允许 `ADD/REMOVE`；修改拆成 REMOVE+ADD；禁止占位操作；Gate 保持严格。

### ERR-158 — PRODUCT_DEFECT

- **事实**：Orchestrator 越过用户明确指定的单轮停止边界。
- **根因**：运行指令中缺少不可由摘要、Skill 或后续流程扩张的机器可检查授权边界。
- **修复**：增加 `OPERATION_BOUNDARY` 静态契约，达到停止点后必须等待新用户消息。

### ERR-159 — PRODUCT_DEFECT

- **事实**：声明 Project Contract 变化时，只有 metadata 变化的 extension_registry Candidate 未 Fail Closed。
- **根因**：Contract Integrity 没有把分类声明与 `namespaces/contracts` 的真实语义差异绑定。
- **修复**：仅比较 `namespaces/contracts`，忽略 `updated_at/updated_by_work_item` 等 metadata；语义相同则失败。

### ERR-160 — PACKAGE_PREFLIGHT_DEFECT

- **原始失败**：`ERROR=tasks gate details: expected two requirements_source insertions`。
- **根因**：V1 执行器把代码显示结构中的固定出现次数当成产品语义，使用脆弱文本计数断言。
- **处置**：改为命名语义锚点、完整内存预演、精确文件集合校验、对称 A/B 验证和原子落盘。

### EXP-132 — 封包执行器必须以语义和事务为边界

1. 不得用某段文本“应出现 N 次”代表业务语义；固定数量只有在权威 Schema 明确规定基数时才可使用。
2. 写入真实仓库前，必须完成全部内存转换、精确范围校验、关键不变量和变异样例检查。
3. 真实落盘必须原子替换；失败时恢复全部原始字节。

### ERR-161 — PACKAGE_PREFLIGHT_DEFECT

- **原始现场**：V2 正式 CMD 无任何执行器字段输出。
- **根因**：ZIP 包含同名顶层目录，正式命令再次解压到同名目录，形成双层路径。
- **修复**：ZIP 根目录平铺，并从最终 ZIP 演练真实解压和脚本入口。

### EXP-133 — 交付包必须验证用户实际执行入口

1. ZIP 成员路径、解压目标和调用路径必须构成同一个可执行契约。
2. 封包前必须从最终 ZIP 开始演练正式入口。
3. 入口演练必须验证返回码和规定输出字段。

### ERR-162 — PACKAGE_PREFLIGHT_DEFECT

- **原始现场**：V3 正式 CMD 无输出；诊断命令仅输出 `STEP=ZIP_CHECK`。
- **根因**：Windows CMD 同一逻辑行中的 `IF` 与命令链导致后续主流程被条件作用域吞并。
- **修复**：ZIP 内置逐行 `run.cmd`，正式一键命令不承载复杂条件控制流。

### EXP-134 — Windows CMD 交付入口必须避免内联条件链

1. 不得把 `IF` 与后续主流程拼接在同一逻辑行。
2. 条件逻辑放入可审计的多行批处理文件。
3. 批处理必须输出入口阶段和执行器退出码。

### ERR-163 — PACKAGE_PREFLIGHT_DEFECT

- **原始现场**：V4 已进入执行器，在 A/B 基线依赖安装前抛出 `[WinError 2] 系统找不到指定的文件`。
- **根因**：V4 未解析 Windows 实际 `bun.cmd` 入口，直接把无扩展名 `bun` 传给 `subprocess.run(..., shell=False)`。
- **修复**：V5 使用 `shutil.which` 解析 Bun 绝对入口；`.cmd/.bat` 通过受控 `COMSPEC` 包装执行；全部 Bun 调用复用同一入口。

### EXP-135 — 外部工具必须解析真实入口并在昂贵操作前验证

1. Windows 上不得假设无扩展名命令可由 `subprocess.run(..., shell=False)`直接解析。
2. 使用 `shutil.which`、`PATHEXT` 和绝对路径固定入口。
3. `.cmd/.bat` 经受控 `COMSPEC` 调用，原生可执行文件直接调用。
4. 创建临时工作树或写入真实文件前执行版本预检。

### ERR-164 — PACKAGE_PREFLIGHT_DEFECT

- **原始现场**：V5 的 Bun 解析、两个干净临时工作树、依赖安装和全仓构建均成功；随后基线测试通过 `bun x vitest` 启动临时下载的 Vitest，报 `Cannot find module 'vitest/config'`，没有生成可比较 JSON，`FAILED_STAGE=TEMP_WORKTREE_AB_VALIDATION`。
- **一手证据**：日志显示命令进入 `%TEMP%unx-...-vitest@latest`，而工作树已经通过 `bun install --frozen-lockfile` 安装本地 Vitest；临时下载环境无法从工作树配置文件解析 `vitest/config`。
- **根因**：执行器错误地把“运行已安装的仓库工具”实现为 `bun x`，引入了独立临时依赖环境，破坏了 A/B 的相同依赖和相同解析器契约。
- **影响**：失败发生在真实产品仓库原子写入前；V5 报告本地工作树在执行前为干净状态，产品修复未落盘。临时工作树删除命令曾返回失败，V5 未输出删除后的残留核验结果，因此残留状态为 `INSUFFICIENT_EVIDENCE`。
- **修复**：V6 使用 `bun run vitest` 和 `bun run tsc` 调用每个临时工作树本地安装的二进制；禁止测试和类型检查阶段使用 `bun x`；清理后显式验证临时路径和 Git worktree 注册均不存在。

### EXP-136 — A/B 验证必须固定工作树本地工具并验证临时资源清理

1. A/B 两侧必须先使用相同锁文件安装依赖，再通过工作区正式脚本或等价本地入口运行测试和类型检查。
2. 不得使用会下载独立临时包的 `bun x`、`npx` 或“latest”解析代替仓库本地工具。
3. A/B 报告必须确认测试配置、测试运行器和依赖解析均来自各自工作树。
4. 临时工作树清理必须检查 Git 注册和文件系统路径；不得只调用删除命令后假定成功。
5. 控制台只输出结构化反馈区；完整命令、stdout、stderr 写入单独详细日志。

### ERR-165 — PACKAGE_PREFLIGHT_DEFECT

- **原始现场**：V6 在两个临时工作树完成冻结依赖安装前置后，报 `worktree local toolchain missing after frozen install: ['node_modules\vitest\package.json']`，`PRODUCT_REPOSITORY_WRITE_STATUS=NOT_STARTED`，随后 `TEMP_WORKTREE_CLEANUP=PASS`。
- **一手证据**：远程根 `package.json` 未声明 `vitest`；`packages/daemon-core/package.json` 的 `devDependencies` 声明 `vitest`，并提供 `test: vitest run`；该工作区还具有自己的 `vitest.config.ts`。
- **根因**：V6 把“工作区已安装且可通过正式脚本解析”错误等同于“根目录必须存在固定物理路径 `node_modules/vitest/package.json`”，并从仓库根调用本地工具。该断言不符合 Bun workspace 的依赖归属。
- **影响**：失败发生在真实仓库原子写入前；本地基线工作树为干净状态；临时工作树 Git 注册和文件系统残留检查通过。
- **修复**：V7 从 `packages/daemon-core` 工作区执行 `bun run test`、`bun run tsc` 和 `bun run build`；验证 package script、依赖声明和工作区配置，不再要求根目录固定 `node_modules` 布局；A/B 测试标识按相对测试文件与测试全名组合比较。

### EXP-137 — Workspace 工具必须按所属包的正式脚本解析

1. Monorepo 工具可用性的证据是所属 workspace 的依赖声明、正式 script、配置文件和实际执行结果，不是根目录固定 `node_modules` 路径。
2. 测试、类型检查和构建必须从工具所属 workspace 执行，禁止把 workspace 依赖假设为根依赖。
3. 不得依赖 hoist、软链接或包管理器内部目录布局作为跨环境契约。
4. A/B 测试标识必须包含归一化的相对测试文件路径和测试全名，避免绝对临时路径或同名测试碰撞。

### ERR-166 — TEST_DRIFT

- **原始现场**：V7 的 A/B 对比完成，基线与补丁侧均为 36 项、加载失败 0、不可比 0、新增失败 0；随后目标回归命令从 `packages/daemon-core` 工作区运行并返回退出码 1，真实产品仓库仍处于 `PRODUCT_REPOSITORY_WRITE_STATUS=NOT_STARTED`。
- **一手证据**：V7 目标测试使用 `path.resolve(process.cwd(), 'setup/...')` 和 `path.resolve(process.cwd(), 'packages/...')` 读取仓库级安装源；执行器明确以 `packages/daemon-core` 作为命令工作目录，因此这些路径被错误解析到 `packages/daemon-core/setup/...` 和 `packages/daemon-core/packages/...`。
- **根因**：新增目标测试把测试运行工作区误当成仓库根目录，测试夹具路径与正式 workspace 执行入口漂移；V7 包内预检只检查了测试文本标识，没有检查路径解析契约。
- **影响**：属于测试覆盖实现错误，不证明 ERR-155—ERR-159 产品实现失败；但目标回归未通过，因此必须 Fail Closed，不能写入真实仓库。
- **修复**：V8 在测试中显式解析仓库根目录；所有仓库级 Agent、Tool 和 handler 路径均基于该根目录；目标回归使用 JSON 报告输出测试总数、加载失败和失败测试标识。

### EXP-138 — Workspace 测试必须区分命令工作目录与仓库根目录

1. 从 package workspace 运行测试时，`process.cwd()` 只代表命令工作目录，不得当然视为 monorepo 根目录。
2. 读取仓库级文件必须使用显式仓库根解析器，并同时覆盖“从根目录运行”和“从所属 workspace 运行”两种入口。
3. 新增目标回归必须在交付前检查路径解析契约；仅检查测试文件包含某些字符串不足以证明测试可执行。
4. 失败反馈必须输出稳定的测试标识和最小失败计数，完整 stdout/stderr 继续保存在详细日志。

<!-- ERR155_ERR166_V8:END -->

<!-- ERR167_DAEMON_STARTUP_README_CONTRACT:START -->
### ERR-167 — PRODUCT_DEFECT

- **现场**：根 `README.md` 指示用户执行 `specforge daemon start` 和 `specforge daemon status`；`packages/daemon-core/README.md` 又宣称支持 `--detach`。用户按 README 询问启动方式后发现说明不正确。
- **一手证据**：daemon 的真实进程入口位于 `packages/daemon-core/src/index.ts`，直接构造 `Daemon` 并调用 `Daemon.start()`；CLI 的 `daemon start/status/stop` 只向现有 daemon 请求 `/api/daemon/start`、`/api/daemon/health`、`/api/daemon/stop`，而当前 HTTPServer 未注册这些路由，只注册 `/health`、`/api/v1/healthz` 和 `/api/v1/admin/stop`；`DaemonConfig` 明确把后台模式标记为 future support。
- **根因**：README 把旧 CLI 客户端占位命令当成进程生命周期入口，且未与 daemon-core 真实入口、HTTP 路由和后台运行能力对账。
- **影响**：用户无法按公开文档启动 daemon；错误状态命令也不能证明运行来源。真实 WI 复检可能继续连接旧进程或根本没有 daemon。
- **修复**：三个 README 统一为从仓库运行 `bun run packages/daemon-core/src/index.ts`；说明前台窗口必须保持运行，长期运行由外部服务管理器托管；状态检查读取 canonical handshake 并请求 `/api/v1/healthz`；明确禁止使用当前 CLI 生命周期占位命令和未实现的 detach 模式。
- **回归**：新增静态契约测试，对账三个 README、daemon 入口、CLI 请求路由、HTTPServer 实际路由和 DaemonConfig 后台支持状态。
- **状态**：`FIX_IMPLEMENTED_PENDING_LOCAL_VALIDATION_COMMIT_PUSH`

### EXP-139 — 运行命令文档必须与进程入口、服务路由和部署载荷同时对账

1. “启动命令”必须能够创建目标进程，不能只是向已经运行的服务发送请求。
2. README 宣称的状态、停止和健康检查端点必须存在于当前服务路由表。
3. 文档不得宣称 `detach`、background 或 service 能力，除非程序真实实现并有回归测试。
4. 安装器没有部署或链接的 CLI，不能作为默认安装后入口。
5. daemon 行为修复后的真实验证必须记录启动仓库和目标 commit，不能只证明用户级文件已升级。
6. README、模块 README、CLI README 和源码发生冲突时必须作为产品缺陷登记，并增加静态契约测试防止再次漂移。
<!-- ERR167_DAEMON_STARTUP_README_CONTRACT:END -->

<!-- ERR168_V12:START -->
## ERR-168 — VALIDATOR_DEFECT：README 修复相关回归缺少对称基线与稳定失败标识

- **原始现场**：V11 的直接 README 契约测试 3/3 通过；随后把 `daemon.test.ts`、`config.test.ts`、`http.test.ts`、`handshake-ownership.test.ts` 合并成一次 patched-only 调用，命令退出 1，但反馈只保留命令失败和 Vite CJS 警告，没有基线结果和失败测试标识。
- **事实根因**：V11 验证器没有用相同命令、相同环境对称执行基线与补丁；多个运行时测试文件被合并执行；非零退出时没有优先解析 Vitest JSON 测试标识。
- **修复**：V12 在两个独立干净工作树中安装同一冻结依赖，四个相关测试逐文件执行，按“相对文件路径 + 完整测试名”比较基线与补丁；存在基线失败、加载失败、不可比测试或补丁新增失败时均停止且不写真实仓库。

### EXP-140 — 相关回归必须可归因、可比较

1. 文档或静态契约修改选择运行时相关回归时，必须先证明该测试集合的基线状态。
2. 不得把多个具有进程、环境变量、临时目录或全局处理器生命周期的测试文件机械合并成一次调用。
3. A/B 必须逐测试标识比较，不得按数组位置或单个进程退出码判断补丁影响。
4. 非零退出时必须优先解析结构化报告；控制台反馈失败测试标识，完整 stdout/stderr 写入证据日志。
5. 只有基线和补丁均无必需失败、无加载失败、无不可比结果时，才允许进入真实仓库写入。
<!-- ERR168_V12:END -->

<!-- ERR169_ERR171_V14:START -->
## ERR-169 — EVIDENCE_REPORTING_DEFECT：加载失败缺少结构化根因

- **原始现场**：V12 只输出 `RELATED_*_LOAD_FAILURE_FILES=tests/unit/daemon.test.ts`，没有输出 Vitest suite message、failureMessages 和最小根因。
- **根因**：验证器把“报告文件存在但测试数为 0”归类为加载失败后立即停止，没有把结构化 suite 错误带入反馈区。
- **修复**：V13 同时采集 JSON 与 verbose 结果，输出 suite 状态、结构化错误、标准化失败签名和最小详细摘要。

### EXP-141 — 测试收集失败必须输出结构化根因

1. 测试总数为 0 且 suite failed 时，必须读取 suite `message`、`failureMessages` 和进程退出码。
2. 控制台必须给出最小根因；完整 stdout/stderr 进入详细日志。
3. 只报告失败文件名不足以支持分类，不得据此扩大产品修改范围。

## ERR-170 — VALIDATOR_DEFECT：运行时测试前缺少确定性工作区构建

- **原始现场**：V13 在 baseline 与 patched 工作树中，`daemon.test.ts` 均在收集阶段失败：`Failed to resolve entry for package "@specforge/permission-engine"`。
- **一手证据**：`@specforge/permission-engine/package.json` 的 `main` 指向 `dist/src/index.js`；`bun install --frozen-lockfile` 不生成 `dist`；`scripts/build-workspace.ts` 明确先构建 `permission-engine`，再构建 `daemon-core`。
- **根因**：V12/V13 在依赖安装后直接运行 daemon 运行时测试，遗漏了该仓库测试所依赖的确定性工作区构建前置条件。
- **分类**：验证器缺陷，不是 README 补丁引入的产品失败。
- **修复**：V14 在 baseline 与 patched 两个独立工作树中先执行相同冻结依赖安装和相同全仓确定性构建，验证 workspace runtime entry 存在且构建未产生意外源码漂移，再逐文件运行相关测试。

### EXP-142 — 依赖已安装不等于工作区包可运行

1. package 入口指向 `dist` 时，运行依赖该包的测试前必须完成仓库规定的构建顺序。
2. A/B 两侧必须使用相同锁文件、相同构建命令和相同测试入口。
3. 构建完成后必须验证关键 package entry 实际存在。
4. 构建产生批准范围外的 Git 变更时必须失败关闭。

## ERR-171 — EVIDENCE_REPORTING_DEFECT：失败签名混入动态报告路径

- **原始现场**：V13 baseline 与 patched 的核心结构化错误完全相同，但 `FAILURE_SIGNATURE_MATCH=NO`。
- **根因**：签名输入混入了命令行中的 `baseline.json` / `patched.json` 动态报告文件名及运行输出，而不是只基于结构化根因。
- **影响**：补丁差异被错误标记为 `UNDETERMINED`，但不影响本次通过结构化错误识别 ERR-170。
- **修复**：V14 的测试标识和失败判断只使用规范化相对测试路径、完整测试名、suite 结构化错误和状态；命令行、报告输出路径、时间戳与临时目录不进入语义签名。

### EXP-143 — 失败签名必须只包含稳定语义

1. 失败签名不得包含临时目录、报告文件名、时间戳、PID、端口或命令回显。
2. 测试 A/B 主键必须是相对测试文件路径与完整测试名。
3. 加载失败签名只基于规范化 suite 根因和错误类型。
4. 原始日志必须保留，但不得作为语义等价比较的直接输入。
<!-- ERR169_ERR171_V14:END -->

<!-- ERR172_V15:START -->
## ERR-172 — PACKAGE_PREFLIGHT_DEFECT：治理文档包尾多写空白行，昂贵验证完成后才被 Git 拒绝

- **原始现场**：V14 的依赖安装、baseline/patched 全仓构建、运行入口检查、目标测试、72/72 相关回归 A/B、TypeScript 和 installer verify 全部通过；随后 `git diff --check` 失败。
- **精确证据**：
  - `docs/implementation/architecture-consistency/P0-contract-consumer-closure.md:3694: new blank line at EOF`
  - `docs/implementation/architecture-consistency/current-handoff.md:3683: new blank line at EOF`
  - `docs/rule/specforge-development-error-ledger-and-experience.md:4404: new blank line at EOF`
- **根因**：封包生成使用“原文去尾 + 以换行开头和结尾的追加块 + 再追加换行”，导致三个治理文档以两个 LF 结束；包内预检只检查逐文件 SHA256，没有检查文本卫生，也没有在依赖安装和构建前执行真实 Git diff 预检。
- **影响**：真实产品仓库尚未写入；README 产品修复和测试结果未被否定，但不能绕过 Git 质量门。
- **修复**：V15 将全部目标文本规范化为无行尾空白且仅一个 EOF 换行；包内静态预检验证文本卫生；临时工作树应用 payload 后，先执行 `git diff --check` 和精确 7 文件范围审计，再开始依赖安装、构建与测试。

### EXP-144 — 文本卫生和 Git diff 必须位于昂贵验证之前

1. 所有新增或替换文本文件必须无行尾空格、无 EOF 空白行，并且只保留一个最终换行。
2. ZIP 自检必须检查每个目标文本的行尾和 EOF 规范，不得只校验哈希。
3. 临时工作树应用 payload 后，必须在安装依赖、构建和测试之前执行 `git diff --check`。
4. 早期 Git diff 预检必须同时核对实际文件集合精确等于冻结范围。
5. 任何文本卫生或范围失败必须立即停止，真实仓库保持未写入。
<!-- ERR172_V15:END -->

<!-- ERR173_ERR174_GATE_ATTEMPT:START -->
### ERR-173：V17 Windows 剪贴板脚本未声明 64 位 Win32 句柄签名

- 分类：`PACKAGE_PREFLIGHT_DEFECT`。
- 现场：`GlobalLock failed: 6`。
- 根因：`ctypes` 默认把未声明返回类型的 `GlobalAlloc/GlobalLock` 当作 32 位整数，64 位 `HGLOBAL` 被截断。
- 修复：V18 显式声明 `HGLOBAL/LPVOID/HANDLE` 参数与返回类型，并执行 `CF_UNICODETEXT` 回读对账。

## EXP-145：Windows FFI 必须显式声明位宽

所有 Win32 FFI 调用必须声明 `argtypes/restype`；句柄、指针和 `size_t` 不得依赖 `ctypes` 默认整数类型。封包静态预检必须检查关键签名，Windows 现场必须执行写入后回读。

### ERR-174：重复 Gate 运行覆盖第一次失败证据

- 分类：`PRODUCT_DEFECT`。
- 现场：WI-0002 第二次授权 Gate 运行把第一次的 `gates/*.json` 与 `gate_summary.md` 直接覆盖；第一次机器报告无法原样读取。
- 一手根因：`gate-chain.ts` 的 `writeGateReport` 和 `writeGateSummary` 每次写入固定 latest 路径，没有 Attempt 身份和追加式历史目录。
- 影响：真实失败证据、修正前后差异和 Gate attempt 审计链被破坏；`events.jsonl` 只能证明状态转换，不能替代完整 Gate Report。
- 修复：每次运行创建 `gate_attempts/attempt-NNNN`，独占写入 start、reports、summary、result；固定 latest 路径仅保留兼容视图；升级时先快照既有 latest。

## EXP-146：可重跑 Gate 必须同时具备 latest 视图和不可变 Attempt

1. 任何可重跑 Gate 都不能把固定 latest 文件当作唯一证据。
2. 历史 Attempt 必须追加式、单调编号、完成后不可覆盖。
3. Runtime 必须向调用者返回 Attempt ID 和路径。
4. 升级迁移只能快照当前可证明的 latest；已经丢失的更早历史必须标记 `INSUFFICIENT_EVIDENCE`。
5. 回归测试必须证明第二次、第三次运行后第一次 Attempt 字节哈希不变。

### ERR-175：V19 权威文件插入使用脆弱复合文本锚点

- 分类：`PACKAGE_PREFLIGHT_DEFECT`。
- 现场：V19 在 `ANCHOR_PREFLIGHT` 阶段失败：`authority insertion anchor not found`；真实仓库未写入。
- 根因：补丁把章节分隔线和中文标题拼成一个完整字符串锚点，没有先独立证明稳定章节标题唯一存在，也没有用远程权威文件原字节执行封包前转换预演。
- 修复：V20 唯一定位 `# 二十六、Fast Path 的正确含义`，再向前寻找最近章节分隔线；封包前对远程 `main@a09f06f...` 权威文件原字节执行转换、规则 ID、章节顺序和单次插入检查。

## EXP-147：文档结构修改必须使用稳定语义锚点和真实基线预演

1. 不得把空行、分隔线、标题和邻接文本拼成一个脆弱锚点。
2. 必须先断言稳定标题或规则 ID 在目标基线中唯一存在。
3. 插入位置应由稳定对象和相对结构推导，例如“目标章节前最近的章节分隔线”。
4. 封包前必须用远程目标 commit 的实际文件字节执行转换预演。
5. 预演必须验证新规则 ID 唯一、原目标章节仍唯一、章节顺序正确、`git diff --check` 预期通过。
<!-- ERR173_ERR174_GATE_ATTEMPT:END -->

<!-- ERR176_ERR177_TRACE_DELTA_CANONICAL:START -->
### ERR-176：Trace Delta 非法 Relation 被误报为“Invalid Trace Delta operation”

- 分类：`PRODUCT_DEFECT / DIAGNOSTIC_MESSAGE_DEFECT`。
- 现场：WI-0002 在 V23 已把 Governance Relation Delta 的单元格内部 `|` 改为逗号、Operation 保持 4 REMOVE + 4 ADD，但 `contract_integrity_gate` 仍报告同样的 `Invalid Trace Delta operation at line 90-97`。
- 一手根因：`parseGovernanceTraceDelta()` 先解析 `relation = normalizeRelation(cells[2])`，合法 Relation 只有 `constrained_by/enforces`；当前 Candidate 实际使用 `owned_by`、`consumed_by-static`、`consumed_by-runtime`、`consumed_by-indirect`。当 Relation 非法时，代码却统一输出 `TRACE_DELTA_ROW_INVALID / Invalid Trace Delta operation`，把 Relation 错误误写成 Operation 错误。
- 影响：第一次修复只处理了 Markdown `|`，没有处理真正非法的 Relation，浪费了一次 Gate Attempt 并造成“可能是 cache/parser defect”的错误诊断。
- 修复：保留现有 Fail Closed 错误码兼容性，但把列数、Relation、From/To 的错误消息精确区分，并在消息中输出实际非法 Relation。

## EXP-148：Gate 诊断必须指向真正失败字段

1. 一个校验分支同时验证多个字段时，不得用“operation invalid”等错误描述覆盖 Relation、endpoint 或列结构错误。
2. 错误信息必须包含失败字段、合法值范围、行号以及安全的实际值。
3. 诊断增强不得放宽 Gate；合法性模型保持不变。
4. 修复前必须对照解析源码确认“哪一个字段返回 falsy”，不得仅根据自然语言错误消息猜根因。

### ERR-177：Task Planner 只强制自检 Operation，未强制自检 Relation / 正式对象 ID / 是否真的需要 Relation Delta

- 分类：`PRODUCT_DEFECT / AGENT_PREFLIGHT_DEFECT`。
- 现场：`sf-task-planner` 的 Governance Delta 模板已经写明 `From/To=正式对象 ID`、`Relation=constrained_by/enforces`，但 ERR-157 强制自检只要求逐条检查 Operation 为 ADD/REMOVE。
- 根因：Agent 完成边界缺少三项强制检查：
  1. Relation 是否属于 `constrained_by/enforces`；
  2. From/To 是否为正式 ID；
  3. Contract 内容变化但 Trace 边不变时是否错误制造了 Relation Delta。
- 真实结果：WI-0002 生成了 `WorkItemStatus (values: ...) owned_by/consumed_by-* ...`，这些不是正式 Trace 模型。
- 修复：权威规则新增 `CON-CONS-DELTA-CANON-001`；Task Planner 增加 `TRACE_DELTA_CANONICAL_ROW_SELF_CHECK`，并明确 Contract 值/schema/枚举变化但边集合不变时不生成 Governance Relation Delta。

## EXP-149：Planner 必须验证完整 Governance Delta 行语义

1. Operation 只能 ADD/REMOVE。
2. Relation 只能 constrained_by/enforces。
3. From/To 必须是正式对象 ID，禁止描述性文本和值快照。
4. Contract consumer 使用 `DD-* constrained_by ContractID`；owner 元数据不能转成 Trace Relation。
5. 没有正式边拓扑变化时不得生成 Relation Delta。
6. Agent 无法从正式 Trace 证明 delta 时必须 blocked；不能“为了表现 Contract 有变化”人工制造边。
<!-- ERR176_ERR177_TRACE_DELTA_CANONICAL:END -->

<!-- ERR178_ERR181_GATE_RETRY_STATE:START -->
### ERR-178：Candidate Gate 在 gates_failed 重跑通过后权威状态仍为 gates_failed

- 分类：`PRODUCT_DEFECT / RUNTIME_STATE_RECOVERY_DEFECT`。
- 现场：WI-0002 `attempt-0003` Candidate Gate 10/10 passed；latest view 对应 attempt-0003，但 `state_auto_advance.attempted=false`、reason=`current_state_is_not_candidate_gate_recoverable`。
- 根因：`defaultGateAliasForState(gates_failed)` 允许 Candidate Gate；`autoAdvanceCandidateState()` 的 `recoverableGateStates` 却排除 `gates_failed`；v1.1 状态机正确只允许 `gates_failed→candidate_preparing`。
- 修复：新增 `GATE-RETRY-STATE-001`；将 gates_failed 纳入 recoverable states，并给 `candidateGateRecoverySequence()` 增加 `gates_failed→candidate_preparing→candidate_prepared→gates_running`，最终仍由原有 `gates_running→approval_required/gates_failed` 判定收口。

## EXP-150：Gate 重跑必须同时闭合 Attempt 与权威状态

1. Tool 允许从失败态重跑，就必须支持失败态的合法状态恢复。
2. 不得只生成 passed Attempt 而让状态保持旧失败值。
3. 恢复必须走现有合法状态边，禁止新增失败态到成功态直连边。
4. Attempt 历史和状态事件必须同时保留。

### ERR-179：V24 后续提示词遗漏 Candidate Gate 重试状态前置契约

- 分类：`PACKAGE_ORCHESTRATION_DEFECT`。
- 现场：V24 提示词允许从 gates_failed 修正 Candidate 后运行 Gate，但没有先对账 Gate Runner 对该起始状态的恢复能力。
- 影响：触发 ERR-178；随后 OpenCode 直接尝试 `gates_failed→approval_required`，被正确状态机拒绝。
- 修复：后续提示词必须明确 STATE_BEFORE、Tool 接受状态、已有有效 Attempt 和合法恢复路径；已有有效 passed Attempt 时不再重跑 Gate。

## EXP-151：Workflow 提示词必须把起始状态当作 Tool 前置契约

1. 推进 Workflow 的 Tool 调用必须明确 STATE_BEFORE、Tool 接受状态和期望 STATE_AFTER。
2. 状态机要求中间状态时不得省略恢复路径。
3. 已有有效 passed Attempt 时优先恢复状态，不重复 Gate 修复状态展示。
4. Prompt 预检必须同时对账状态、Attempt、Candidate 是否变化。

### ERR-180：V25 使用整段 Handler 文本替换导致临时预检失败

- 分类：`PACKAGE_PREFLIGHT_DEFECT`。
- 现场：`handler recovery block mismatch: 0`；真实仓库未写入、未提交、未推送。
- 根因：把大型函数局部块作为整段逐字锚点。
- 修复方向：改用最小语义边界。

## EXP-152：源码补丁禁止依赖大型函数整段逐字相等

1. 大型函数不得使用整段文本作为唯一锚点。
2. 必须限制到唯一局部语义结构。
3. 写入前必须在固定 remote HEAD 的实际结构上预演。
4. 失败发生在预演阶段时真实仓库保持未写入。

### ERR-181：V26 仍把局部边界组合成脆弱字符串标记

- 分类：`PACKAGE_PREFLIGHT_DEFECT`。
- 现场：V26 在 `SEMANTIC_PATCH_PREVIEW` 失败：`recoverableGateStates semantic boundary not found`；真实仓库未写入。
- 远程源码事实：`autoAdvanceCandidateState` 中 recoverableGateStates 实际位于 lines 414-423，sequence 位于 lines 438-456，消费点位于 line 457；语义事实本身与调查一致。
- 根因：虽然 V26 缩小了范围，仍用多行字符串/结束标记组合定位数组边界，没有直接按函数范围和逐行结构解析。
- 修复：V27 先定位 `autoAdvanceCandidateState` 与下一个函数形成闭区间，再逐行唯一匹配 `const recoverableGateStates = [`、该数组的 `];`、`const sequence =`、`let index = sequence.indexOf(currentState);`，完全取消多行边界字符串。

## EXP-153：源码结构补丁必须按“函数区间 + 单行语义节点”定位

1. 先唯一定位目标函数起止范围。
2. 在函数内部按单行语义节点寻找数组、赋值和消费点。
3. 不把“数组结束 + 下一行 if”等相邻格式拼成边界。
4. 结构节点数量不唯一即 Fail Closed。
5. 修改后必须再次检查关键节点和行为 token 均存在。
<!-- ERR178_ERR181_GATE_RETRY_STATE:END -->

<!-- ERR182_ERR184_HISTORICAL_SEAL_RECONCILE:START -->
### ERR-182：已有 passed Gate Attempt 时缺少 gate_runner 历史 seal reconciliation 能力

- 分类：`PRODUCT_DEFECT / RUNTIME_RECOVERY_CAPABILITY_GAP`。
- 现场：WI-0002 attempt-0003 已 10/10 passed；状态经合法非 seal 转换恢复到 `gates_running` 后，`gates_running→approval_required` 被 seal actor 约束阻断，因为 `sf_state_transition` 的 actor 是 `sf-orchestrator`。
- 一手架构事实：`state-coordinator-v11` 对 seal transition 强制 `actorRole === authorizedSubject`；Candidate Gate seal 的 authorizedSubject 是 `gate_runner`；`sf_v11_gate_run.transitionGateState()` 本来就使用 `actorRole='gate_runner'`。
- 缺口：现有 `sf_v11_gate_run` 只有“执行 Gate 后自动收口”，没有“消费既有 immutable passed Attempt、不重跑 Gate 而收口”的入口。
- 修复：新增 `GATE-ATTEMPT-RECONCILE-001` 和 `reconcile_attempt_id` 模式；验证 latest Attempt、required Gate 全 pass、latest view 字节一致和 Gate 输入未变化后，由 gate_runner 使用既有自动状态恢复逻辑完成 seal，不调用 `runRequiredGates`、不创建新 Attempt。

## EXP-154：seal 恢复必须由拥有 seal 的 actor 消费既有权威证据

1. seal transition 不能由 orchestrator、人工状态工具或其他 actor 代签。
2. 已有完整 immutable passed Attempt 时，不应为了取得正确 actor 而重复执行 Gate。
3. 正确做法是给 seal owner 提供“消费历史权威证据”的专用 reconciliation 模式。
4. reconciliation 必须证明 Attempt 最新、完整、passed、latest view 一致且输入未漂移。
5. reconciliation 返回必须明确未执行 Gate、未创建 Attempt。

### ERR-183：V27 后续提示词让 sf-orchestrator 直接执行 gate_runner seal

- 分类：`PACKAGE_ORCHESTRATION_DEFECT`。
- 现场：V27 后续提示词要求用 `sf_state_transition` 执行四步状态恢复；前三步成功，第四步 `gates_running→approval_required` 失败：`SEAL_TRANSITION_ACTOR_FORBIDDEN`，required_actor=`gate_runner`，actual actor=`sf-orchestrator`。
- 根因：提示词只检查了 state_machine 合法边，没有同时读取 seal-transitions/actor-role 约束。
- 修复：任何包含 seal 边的恢复提示词必须同时检查“边是否合法 + 谁拥有该 seal”；seal owner 不可用普通 state transition 代替。

## EXP-155：Workflow 恢复方案必须同时对账状态边与 seal actor

1. `isValidTransition=true` 只证明状态边存在，不代表任意 Tool/actor 都能执行。
2. 任何 seal 边必须读取 authorizedSubject 和 evidenceRequired。
3. Prompt 在规划状态恢复路径时必须逐边标注 actor。
4. 如果最终边属于 gate_runner，应调用 gate_runner 的受控恢复能力，而不是 sf_state_transition。

### ERR-184：V28 封包生成器两次因嵌套三引号产生 Python SyntaxError

- 分类：`PACKAGE_GENERATION_DEFECT`。
- 现场：两次都在 ZIP 创建前由 Python parser 停止；没有生成可交付 V28 ZIP，没有触碰用户仓库。
- 根因：生成脚本把外层 Python 三引号和内部 TypeScript/Markdown 三引号混在同一个嵌套层级。
- 修复：把 Handler、Wrapper、Authority、Ledger、Handoff、P0 的大段模板全部外置为独立 payload snippet；执行器只读取 snippet，不再嵌套多语言三引号。

## EXP-156：多语言补丁包的大段模板必须外置，禁止深层三引号嵌套

1. 大段 TypeScript/Markdown 模板使用独立 payload 文件。
2. Python 执行器只读取 payload，不在自身源码里嵌套大段多语言模板。
3. 封包前必须 `compile()` 执行器并校验 ZIP 文件集合与 SHA256。
4. 生成失败不留下半成品 ZIP。
<!-- ERR182_ERR184_HISTORICAL_SEAL_RECONCILE:END -->

<!-- ERR185_ERR186_GATE_INPUT_SNAPSHOT:START -->
### ERR-185：V28 把 GateReport.input_files 误当成“当时实际存在的文件快照”

- 分类：`PRODUCT_DEFECT / EVIDENCE_SEMANTICS_DEFECT`。
- 现场：WI-0002 `attempt-0003` reconciliation 在 `.specforge/project/modules/CORE/contracts.json` 处返回 `RECONCILE_GATE_INPUT_MISSING`。
- 一手源码事实：
  1. `GateReportV11.input_files` 只有 `string[]`，没有 `exists/hash` 历史状态；
  2. `loadProjectModel()` 会为每个 Module 计算默认 `contracts.json`，并把该路径无条件加入 `inputFiles`；
  3. 对缺失 `contracts.json`，读取逻辑允许返回空/兼容状态，因此该路径可以出现在 passed Gate Report 的 `input_files` 中而文件本身并不存在。
- 根因：V28 reconciliation 将“曾探测的路径”错误解释成“Attempt 完成时必然存在的文件”，然后对所有路径执行当前 `stat()`。
- 修复：新增 `GATE-ATTEMPT-INPUT-SNAPSHOT-001`；`input_files` 保持路径审计语义，真实历史状态改由 `input-snapshot.json` 冻结。

## EXP-157：路径审计列表与内容快照必须分离

1. `input_files` 可以记录存在性探测目标，不代表路径必然存在。
2. 历史 freshness 不能从路径列表反推存在状态。
3. 需要历史对账时必须在 Attempt 当时冻结 `exists/kind/hash`。
4. 缺失本身也是一种需要冻结的输入状态。

### ERR-186：V28 在没有 Attempt 输入快照的情况下设计了历史 freshness reconciliation

- 分类：`PRODUCT_DEFECT / EVIDENCE_MODEL_GAP`。
- 现场：attempt-0003 早于 input snapshot 能力，其 Gate Report 只能证明 Gate 当时 passed，不能证明每个 `input_files` 路径当时的存在/内容状态。
- 根因：V28 先增加 historical reconciliation，再用当前 mtime/stat 代替缺失的历史证据模型。
- 修复：
  1. 新 Attempt 完成时生成不可变 `input-snapshot.json`；
  2. reconciliation 必须逐项比较 snapshot；
  3. 没有 snapshot 的 legacy Attempt 明确返回 `RECONCILE_INPUT_SNAPSHOT_REQUIRED`；
  4. legacy Attempt 不修改、不覆盖；Workflow 如需继续，只运行一次新的正式 Gate Attempt。

## EXP-158：恢复能力不能先于它所需要的证据模型

1. 设计 reconciliation 前先定义“历史事实如何冻结”。
2. 没有历史 snapshot 时不得用当前文件系统状态补造历史事实。
3. 对旧数据的兼容策略可以是 Fail Closed + 新 Attempt，不能是假定。
4. 新 Attempt 是新的事实记录，不会破坏旧 Attempt 的不可变性。
<!-- ERR185_ERR186_GATE_INPUT_SNAPSHOT:END -->

<!-- ERR187_ERR188_GATE_PROJECT_ROOT_PREFLIGHT:START -->
### ERR-187：V29 后续提示词把 sf_git_preflight.worktree_clean=false 错当成 Candidate Gate 硬阻断

- 分类：`PACKAGE_ORCHESTRATION_DEFECT`。
- 现场：WI-0002 当前 Git HEAD、branch、state、attempt-0003 和 Candidate 证据全部符合预期，但 `.specforge/knowledge/graph.json` 为 modified、`.specforge/work-items/WI-0002/**` 为未跟踪治理工件，导致 `worktree_clean=false`；OpenCode 按 V29 提示词停止，没有运行 Gate。
- 一手源码事实：
  1. `sf_git_preflight` 在 status entries 非空时只追加 `WORKTREE_NOT_CLEAN` warning；
  2. `preflight.success` 仍由 `errors.length === 0` 决定；
  3. `.specforge/project/**` 和 `.specforge/work-items/**` 在 Git governance 分类中明确属于 `track / SpecForge committed governance artifact`。
- 根因：V29 Prompt 把“Git 工作区完全空”误写成业务项目现有 WI 继续 Gate 的必要条件，没有区分治理现场与生产代码漂移。
- 修复：后续 Candidate Gate 预检要求 `sf_git_preflight.success=true`、固定 project/branch/HEAD，并逐项检查 dirty paths；只允许已知 WI-0002 治理现场，任何非治理代码/配置漂移或 staged 漂移继续 Fail Closed。

## EXP-159：业务 WI 继续执行时必须审计 dirty path 语义，不能机械要求整个 worktree clean

1. `worktree_clean=false` 是事实信号，不自动等价于 Gate 禁止。
2. 已存在 WI 的 `.specforge/work-items/<WI>/**` 正是 Workflow 持久化治理现场。
3. 必须区分治理现场、生产代码漂移、无关文件和 staged 修改。
4. Prompt 只能对真正影响本轮证据边界的 dirty path Fail Closed。
5. 分支创建、正式版本、Git Merge 等明确要求 clean 的边界继续遵守各自产品规则，不得泛化。

### ERR-188：V29 Gate Attempt input snapshot 的相对路径错误依赖 daemon process.cwd()

- 分类：`PRODUCT_DEFECT / EVIDENCE_PATH_RESOLUTION_DEFECT`。
- 一手源码事实：
  1. `buildGateAttemptInputSnapshot()` 对 Gate Report 的相对 `input_files` 直接执行 `fs.stat(inputPath)` / `fs.readFile(inputPath)`；
  2. Gate Context 已有 `projectRoot`，但 snapshot producer 未使用；
  3. V29 reconciliation snapshot consumer 同样直接对 snapshot `path` 执行 `fs.access/stat/readFile`；
  4. 同一 Handler 中已有 `resolveGateInputPath(projectRoot, inputFile)`，证明正确基准应为业务项目根目录。
- 影响：daemon 从 SpecForge 产品仓库启动时，Validation 项目的相对 Gate input 可能在错误目录被判断为 missing，形成错误且不可变的 `input-snapshot.json`。
- 修复：
  1. snapshot producer 接收 `projectRoot`；
  2. relative input 在读取时统一 `path.resolve(projectRoot, inputPath)`；
  3. snapshot 中继续保存 Gate Report 原始规范路径；
  4. reconciliation consumer 对相对 snapshot path 使用同一 `resolveGateInputPath(projectRoot, path)`；
  5. 新回归测试必须从与 projectRoot 不同的 cwd 验证相对路径仍正确命中业务项目文件。

## EXP-160：所有持久化证据路径必须显式绑定业务 projectRoot

1. daemon 的 `process.cwd()` 不是业务项目路径权威。
2. Gate Report、Attempt snapshot、reconciliation 对同一相对路径必须共享一个 projectRoot 解析函数/规则。
3. 持久化路径值与运行时 resolved path 必须区分：前者用于审计，后者用于文件访问。
4. 回归测试必须覆盖 daemon cwd 与业务 projectRoot 不同的真实部署形态。
<!-- ERR187_ERR188_GATE_PROJECT_ROOT_PREFLIGHT:END -->

<!-- ERR189_ERR191_COMPACTION_BOUNDARY:START -->
### ERR-189：Compaction 后 Orchestrator 越过最新用户 stop boundary

- 分类：`PRODUCT_DEFECT / ORCHESTRATION_AUTHORIZATION_DRIFT`。
- 真实 P0 现场：WI-0002 的 V34 当前用户边界明确要求“到 implementation_done 撤销 Code Permission 后停止”，并明确禁止 Verification、Formal Version、Close、Git checkpoint/merge/push。
- 实际：V34 的合法步骤已完成并正确停到 `implementation_done`；随后 OpenCode Compaction 后重新读取旧 `prompts/WI-0002.txt` 和完整 workflow skill，自行继续执行 checkpoint commit、Verification、Semantic Closure 修复、Verification Gate、Close、第二个 checkpoint commit 和 Git Merge Plan。
- 已产生但尚未 Git Merge 的实际证据：
  - implementation checkpoint commit `85c5f5dd`；
  - governance checkpoint commit `dc413fff`；
  - WI-0002 已被推进到 `closed`；
  - Git Merge Plan 已生成，但 `sf_git_merge_run` 未执行。
- 根因：现有 Orchestrator 只泛化要求“恢复时看用户当前意图”，没有规定最新用户操作边界对旧 Prompt/完整 Workflow 的强制优先级，也没有规定 Compaction 后副作用动作前的 fail-closed revalidation。
- 修复：新增 `GOV-CONT-001`，在 Orchestrator 明确“最新用户边界 > 状态/Skill > 旧 Prompt > inferred pending”，达到 stop condition 后不得自动继续。

## EXP-161：Compaction/Resume 不能重新解释用户授权
1. 完整 Workflow 是长期合法路径，不等于当前轮用户授权。
2. “继续 WI”与“本轮允许继续到哪里”是两个不同边界；后者必须优先。
3. 用户说“到 X 停止”后，任何自动压缩、summary、旧 Prompt、Skill 都不能把 X 后的动作重新变成已授权。
4. 恢复上下文不足时应只读停住，不应读取更旧、更宽的任务描述来补授权。
5. 后续已经执行成功不能抹掉越界事实；必须保留、记录、修产品并补回归测试。

### ERR-190：Continuity Snapshot 不保存最新用户操作边界

- 分类：`PRODUCT_DEFECT / CONTINUITY_CONTRACT_GAP`。
- 源码事实：V34 时 `ContextSnapshot` 没有最新用户指令或授权边界；Continuation Prompt 把 Original Task 放在前面，并要求根据 pending work 继续。
- 修复：
  1. `ContextSnapshot.operation_boundary` 保存最新真实 user message 原文；
  2. continuation prompt 在 Original Task 前输出 Authorization Boundary；
  3. boundary 缺失时明确禁止副作用续接；
  4. continuation instruction 明确不能扩大当前用户授权。

## EXP-162：连续性快照首先保存授权，再保存进度
1. “做到了哪里”不能回答“现在还允许做什么”。
2. Continuity Snapshot 必须把最新真实用户指令作为独立原始证据，不得只把它压缩成 key decision/pending work。
3. Continuation Prompt 必须优先恢复授权边界，再恢复 Original Task 和 Pending Work。
4. 无授权边界证据时，副作用续接必须 Fail Closed。

### ERR-191：architecture_change 被遗漏在 Continuity CODE_WORKFLOWS

- 分类：`PRODUCT_DEFECT / WORKFLOW_CONTINUITY_CLASSIFICATION_GAP`。
- 源码事实：`CODE_WORKFLOWS` 包含 feature/bugfix/quick_change/change_request/refactor/ops_task，但遗漏 `architecture_change`。
- 影响：architecture_change 在 Continuity Snapshot 中不会生成 `files_state` / `verification_results`。
- 修复：把 `architecture_change` 纳入 `CODE_WORKFLOWS` 并补回归测试。

## EXP-163：Workflow 的连续性分类必须与真实生命周期一致
凡 Workflow 允许进入 Code Permission → Production Code → Verification，就必须被 Continuity 视为代码型 Workflow；新增/变更 Workflow 时必须测试其 snapshot 文件状态和验证证据是否保留。
<!-- ERR189_ERR191_COMPACTION_BOUNDARY:END -->

<!-- ERR192_POST_MERGE_TEST_ORCHESTRATION:START -->
### ERR-192：V37 错把 Git Merge 后再次运行 `bun test` 作为 repository delivery 的必需步骤

- 分类：`PACKAGE_ORCHESTRATION_DEFECT`，不是 SpecForge 产品缺陷。
- 真实现场：
  1. WI-0002 已完成 Verification、Formal Version Gate、Close；
  2. `sf_git_merge_run` 成功生成 main merge commit `793f3b1814f17e75f6e6356ab8213197c41c6fad`；
  3. V37 Prompt 又要求 closed WI 在 Git Merge 后通过 `sf_safe_bash` 执行 `bun test`；
  4. WriteGuard 正常阻断该命令，因为 closed WI 不再具有活动 Code Permission；
  5. `sf_git_post_merge_verify` 随后成功，Formal Version 的 implementation tree / base diff / file set 均匹配，repository delivery state=`closed_and_git_merged`。
- 权威规则事实：
  - 业务正确性由 Close 前 Verification 负责；
  - Formal Version Gate 证明已验证实现具备进入默认主分支资格；
  - Git Merge / post-merge verify 负责证明合并后的主线仍对应同一正式版本，不重新承担业务 Verification。
- 当前源码事实：
  - `sf_git_post_merge_verify.commands` 仅作为返回证据字段保存；
  - `gitPostMergeVerify()` 不执行这些 command；
  - post-merge verify 校验 target branch、clean worktree、WI branch ancestor、fan-in merge commit、Formal Version after merge。
- 正确处理：
  - 不放宽 closed-WI WriteGuard；
  - 不重新开启 Code Permission；
  - 不修改 Git/Post-Merge Runtime；
  - 后续 Prompt 不再把 post-merge 业务测试作为 repository delivery 必需步骤；
  - 若未来确实需要部署后 smoke test，应作为独立、明确设计的验证边界另行治理，不能借 closed WI 的 Code Permission 执行。

## EXP-164：Git Merge 后不要重复业务 Verification

1. `Verification → Formal Version → Close → Git Merge` 的职责边界必须保持单向。
2. Close 前测试证明业务正确；Formal Version 固定已验证实现；post-merge verify 证明 Git 交付没有改变该实现。
3. Formal Version 的 tree/diff match 不能替代本来就缺失的 Close 前测试；但当 Close 前 Verification 已完整通过时，也不应在 closed WI 后再次要求同一业务测试。
4. `sf_git_post_merge_verify.commands` 是证据/说明字段，不代表 Tool 会执行命令。
5. closed WI 的 WriteGuard 阻断代码/测试类 shell 命令是预期保护，不得为了 Prompt 多余步骤而放宽。
<!-- ERR192_POST_MERGE_TEST_ORCHESTRATION:END -->

<!-- SPECFORGE_EXP165_EXP180_PROMOTION_DELIVERY:START -->
## 2026-08-07 — Promotion Producer / Manifest / Trace 与交付测量经验

### 错误记录
- **ERR-193**：Promotion Gate 无同构受控 Producer。修复：扩展现有 `sf_contract_register`，新增 `action=promote`，不新增 Tool。
- **ERR-194**：Manifest Schema 未覆盖 Gate 控制字段 `contract_promotions`。
- **ERR-195**：Promotion Gate 对不存在的旧 source edge 产生 phantom REMOVE 要求。
- **ERR-196**：V41/V42 fragile full-text promotion-manifest anchor 连续失败。
- **ERR-197**：V43 handler full-text anchor 继续失败。
- **ERR-198**：V44 integrity full-text anchor 再次失败，确认必须停止逐 anchor 调试。
- **ERR-199**：把可访问祖先 commit 误判为 remote branch HEAD。
- **ERR-200**：V49 Windows Bun shim 入口解析错误。
- **ERR-201**：V50 Windows junction quoting 错误。
- **ERR-202**：V51 evidence parser 错误耦合不同 artifact 的字段。
- **ERR-203**：V52 未验证 baseline 执行有效性就比较失败集合。
- **ERR-204**：V52 临时 workspace + junction 改变模块解析，baseline 非等价。
- **ERR-205**：V54 测试 identity 未 trim，产生假差异。
- **ERR-206**：13-package 既有全仓债务无因果扩大 Promotion 窄补丁范围。
- **ERR-207**：V57 交付前 runner 生成器发生嵌套三引号 SyntaxError；包未生成、未交付、未写用户仓库。修复为 payload 分离，并强制 runner compile + ZIP reopen。
- **ERR-208**：V57 scope audit 对 `git status --porcelain` 整体执行 `.strip()`，破坏第一条记录的结构性前导空格，再固定切片导致路径首字符丢失；隔离验证被假范围差异阻断，真实仓库未写入。修复为 Git 直接文件集合命令，不解析 porcelain 展示列。
- **ERR-209**：V58 在有历史验证债务的 main 上只执行 post-patch TypeScript noEmit，并把 `exit=2` 直接归因于补丁；缺少 clean-head A/B。修复：V59 同一 detached worktree 先 baseline，再应用补丁，比较规范化新增错误集合。
- **ERR-210**：V59 workspace build baseline/post 都成功，却继续比较普通 stdout 尾部，把 `Bundled ... in 474ms` 的非确定耗时当作新增错误。修复：exit-code-first A/B；双成功不比较普通日志。

### 经验规则
- **EXP-165 — Gate/Producer 同构**：任何 Gate 支持的结构化治理动作，都必须存在同构、受控、可审计 Producer。
- **EXP-166 — Schema 覆盖 Gate 控制面**：Gate 消费的 Manifest 控制字段必须先被 Schema 完整校验。
- **EXP-167 — REMOVE 仅删除真实边**：Trace Delta 的 REMOVE 只能针对当前正式 Trace 中真实存在的边；禁止 phantom REMOVE。
- **EXP-168 — 用户机器不是补丁调试器**：交付 ZIP 前必须基于固定 remote HEAD 形成完整修改与验证方案。
- **EXP-169 — 按文件尺度选择修改方法**：小型 Handler/Tool 优先完整最终文件；大型源码使用结构化语义定位修改；重复 anchor 失败后必须换方法。
- **EXP-170 — 包验证覆盖真实执行链**：compile/ZIP integrity 只证明包装；产品交付前还必须实际应用、scope audit、定向测试、TypeScript、build、`git diff --check`。
- **EXP-171 — branch HEAD 以 branch ref 为准**：优先 `git ls-remote`；commit 可访问不等于当前 branch HEAD。
- **EXP-172 — Windows shim 必须解析真实入口**：Python/Node 启动 Bun/npm 类工具时解析 `.cmd/.exe`，批处理通过 CMD 入口执行。
- **EXP-173 — 证据字段遵守 provenance**：失败名称、计数、摘要可来自不同可信 artifact，不得为解析方便虚构单一来源。
- **EXP-174 — baseline 必须语义等价**：复制源码、junction、symlink、缓存重定向只要改变模块解析/cwd/路径语义，就不能作为 A/B baseline。
- **EXP-175 — 比较键规范化非语义差异**：集合比较前 trim、normalize slash、去展示前缀；稳定 key、数量、原因分层比较。
- **EXP-176 — 历史全仓债务与窄补丁分离**：先专用回归、类型检查、相关 build、同环境增量验证；原 HEAD 既有且无因果的失败独立治理。
- **EXP-177 — runner 本身必须先可执行**：生成执行器时 payload 与 runner 分离，交付前必须编译/解析 runner、重开 ZIP 并校验文件清单，避免把字符串生成器语法错误转嫁给用户。
- **EXP-178 — 结构化 Git 输出禁止先做全局 trim 再定长切片**：范围审计优先用 `git diff --name-only HEAD` 与 `git ls-files --others --exclude-standard` 形成集合；若必须解析 porcelain，应使用 `-z`/NUL 记录并保留状态列原始字节，不得让人类文本清洗破坏机器协议。
- **EXP-179 — 有历史债务时静态检查必须 A/B 归因**：clean-head 与 post-patch 必须使用同一 worktree、同一 frozen dependencies、同一命令；错误集合使用相对路径+TS code+消息等稳定键比较，忽略非语义行列漂移。post 只有新增错误才归因本轮，baseline 既有失败必须显式保留。
- **EXP-180 — 成功日志不是错误集合**：A/B build/static-check 先以 exit code 建立语义。双成功直接 PASS；成功→失败直接回归；失败→成功直接改善；仅双失败才比较稳定错误键。禁止比较耗时、bundle 数量、缓存文本等成功输出。
<!-- SPECFORGE_EXP165_EXP180_PROMOTION_DELIVERY:END -->

<!-- SPECFORGE_ERR211_ERR214_EXP181_EXP182_CONTRACT_REPAIR:START -->
## ERR-211 / ERR-212 / ERR-213 / ERR-214 / EXP-181 / EXP-182
- **ERR-211**：只确认 `spec_migration` Workflow 语义正确，却未逐一确认 Candidate Producer 能生成 extension_registry / module contracts 等全部 canonical artifacts，导致错误判断“产品无需修改”。现有 prepare_repair 与 Contract Tool 组合无法完成 Project→Module Contract 归位。
- **EXP-181 — Workflow 语义正确不等于 Producer 能力完整**：宣布恢复/迁移路线可执行前，必须列出全部目标 canonical artifacts，并证明受控 Producer 能生成每一个 artifact、Runtime 会 materialize、Gate 会消费；缺少任一 Producer 必须登记产品缺口，禁止 Agent 手写 Candidate/manifest 或运行已知无效 Gate 绕过。
- **ERR-212**：V63 包生成阶段再次触发 ERR-207 同类嵌套三引号 SyntaxError。`REPEATED_ERROR_CLASS=ERR-207`，`APPLICABLE_EXPERIENCE=EXP-177`。处理：V64 强制 runner 与所有长 payload 分离，并在交付前执行 runner `py_compile` 与 ZIP reopen integrity。
<!-- SPECFORGE_ERR211_ERR212_EXP181_CONTRACT_REPAIR:END -->

- **ERR-213**：V64 的 post-patch 内容审计要求一个自身 payload 没有写入的机器字面量，导致补丁已形成但尚未进入测试即被假失败阻断。根因是交付器的“期望内容”和“实际生成内容”由两个独立位置维护，缺少交付前一致性自检。
- **EXP-182 — 内容审计必须与产物契约同源并在交付前自检**：执行器只能审计补丁明确承诺并实际生成的稳定语义标记；新增审计 needle 时，必须在 ZIP 生成前证明对应 payload/patch 会生成该 needle。禁止执行器凭空要求未生成字段。治理结论若需要机器字段，应由治理 payload 明确写出，再由审计器验证。

- **ERR-214**：V65 重复 ERR-209 类验证错误：在已有历史 TypeScript/build 债务且 EXP-179 已明确要求 clean-head/post-patch A/B 的情况下，仍仅看 post-patch `tsc` 非零退出码。`REPEATED_ERROR_CLASS=ERR-209`，不新增经验规则，直接复用 **EXP-179**；同时继续应用 EXP-180，双成功 build 不比较非确定成功日志。

<!-- SPECFORGE_ERR215_ERR217_EXP183_RUNTIME_SCAFFOLD:START -->
## ERR-215 / ERR-216 / ERR-217 / EXP-183
- **ERR-215**：Runtime 合法预建空 Candidate scaffold，而专用 Candidate Producer 仅按“路径存在”判断覆盖风险，造成 Producer 永远无法在正常 WI 上启动。Validation 中任何手工删除 scaffold 的尝试都必须被 Write Guard 阻断，不能作为产品恢复方案。
- **EXP-183 — Producer 覆盖保护必须区分 Runtime-owned 空 scaffold 与 authored Candidate state**：当 Runtime 按稳定契约预建空壳时，后续受控 Producer只能接管“严格可证明为 canonical 空 scaffold”的状态；判断必须覆盖目录内容、manifest 精确字段集合、WI/workflow/base version、entries 为空以及下游 plan 不存在。任何未知字段、真实 Candidate、非空 entries、版本/身份不一致或已有正式 producer 产物都必须 Fail Closed。接管必须在 staging 完成后发生，并具备失败恢复，禁止通过 shell/Agent 手删 Runtime artifact。
<!-- SPECFORGE_ERR215_EXP183_RUNTIME_SCAFFOLD:END -->

- **ERR-216**：V69 大型源码 full-text anchor=0；重复 ERR-196/197/198，复用 EXP-169。
- **ERR-217**：V70 虽改为语义行定位，却继续对语义标记之间的物理相邻行号做严格断言，导致合法文本布局差异再次形成假失败。继续复用 **EXP-169**：结构化定位只依赖稳定语义边界，不得把空行、注释、缩进或相邻行号提升为源码契约。重复失败后应整函数/完整最终文件交付，并用 fixed HEAD + tests 验证，而不是继续在用户机器调锚点。

<!-- SPECFORGE_ERR218_ERR219_EXP184_DOMAIN_EVIDENCE:START -->
## ERR-218 / ERR-219 / EXP-184
- **ERR-218**：领域操作 `repair_relocate_to_module` 需要证明的是目标 Contract 当前 formal Trace consumer 是否完整、是否跨 Module，但实现使用更宽泛的 Project Governance `active` 作为前置条件，导致兼容模式中的 spec_migration 循环依赖。
- **EXP-184 — 领域操作必须直接证明领域证据，不得用更宽泛 readiness 标志替代**：Contract consumer 判断必须直接枚举目标 Contract 的 formal Trace consumer edges，逐边证明 DD→Module owner 可解析，再检查跨 Module；无法解析的正式边必须 Fail Closed。全局 Architecture/Data readiness 只约束真正需要该全局模型的检查。
- **ERR-219**：V73 交付前内容审计要求自身 payload 未稳定承诺的英文 needle，重复 ERR-213 类假失败。`REPEATED_ERROR_CLASS=ERR-213`，继续复用 **EXP-182**：内容审计只能检查 payload 实际生成并明确承诺的稳定标记。
<!-- SPECFORGE_ERR218_ERR219_EXP184_DOMAIN_EVIDENCE:END -->
<!-- SPECFORGE_ERR220_EXP185_TRACE_PHASE_INFERENCE:START -->
## ERR-220 / EXP-185 — Candidate Gate fallback 必须消费冻结 Trace Candidate 责任
- **ERR-220**：`sf-v11-gate-run.ts` 的 Candidate phase fallback 只检查 tasks / requirements / design，没有检查 Runtime 已冻结 `candidate_manifest` 中的 `trace_delta`。因此 `spec_migration_path` 的 `design + trace_delta` Candidate 会被默认推断为 `design`，而 design profile 不包含 `trace_gate`；真实 Trace Delta 存在时可能绕过 Trace Gate。
- 架构事实：Runtime 在 `candidate_preparing -> candidate_prepared` 时把 `candidates/trace_delta.md` 物化为 manifest `type=trace_delta`；Gate 判断当前正式治理责任时已有 `resolveFrozenManifestArtifacts()`，该接口明确禁止重新扫描 Manifest 外历史文件。
- 修复：Candidate Gate fallback 继续保持 tasks→full、requirements→requirements、design→design、unknown→full 的原语义；新增“冻结 manifest 存在 `trace_delta` → 至少 full”。Trace 判断只使用 `resolveFrozenManifestArtifacts({ artifactTypes: ['trace_delta'] })`，不扩展 `WorkItemSpecArtifactKind`，不修改 Runtime、Workflow、required-gates 或 trace_gate。
- **V76 实现失误归类**：V76 曾把不存在的 `kind: 'trace'` 传给 `resolveWorkItemSpecArtifacts()`，被 TypeScript `TS2322` 拦截。该失误重复 **ERR-072** 的“定向测试通过但未遵守正式 TypeScript 契约”错误类，复用 **EXP-052**；不新增独立产品错误号。
- **EXP-185 — Gate fallback 的治理责任必须来自冻结 Manifest，并单调提升严格度**：当 Runtime 已冻结的 Candidate Manifest 表明某项治理责任存在时，fallback 只能保持或提升所需 Gate profile，不能因为较低层 artifact 同时存在而降低严格度；Manifest 外历史 Candidate 不得参与该判断。正式 artifact kind 必须先从既有类型/Runtime producer 取证，禁止凭语义名称发明新 kind。
- V77 交付器采用成功才保留补丁的事务式应用：定向回归、Candidate retry、Classification-driven Gate、Gate attempt history、TypeScript、daemon-core build、workspace build、`git diff --check` 和精确范围审计任一失败即恢复到原 HEAD 工作区内容。
- **V77 交付命令重复错误记录**：用户首次执行 V77 CMD 后立即返回且无任何输出。复核确认 Python 入口只要被执行就会立即打印 `BUNDLE_INTEGRITY`；实际启动命令把 `if exist ... rmdir ...` 放在 `&&` 连锁中，首次目录不存在时后续 `mkdir -> tar -> python` 被控制流跳过。归入既有 **ERR-014**，复用 **EXP-007 / EXP-012**，不新增错误号。V78 改为 ZIP 自带顶层目录，交互式 CMD 仅执行 `tar -xf -> python`，不再使用条件删除/创建链。
- **V79 提交器重复错误记录**：V79 对 `git status --porcelain=v1 -z` 的完整输出复用了会执行 `.strip()` 的通用读取函数，删除首条记录有语义的状态前导空格，随后按固定列截取路径时把 `docs/...` 错读为 `ocs/...`。该错误与 **ERR-133 / ERR-140** 完全同型，复用 **EXP-109 / EXP-116**，不新增错误号。V80 取消 porcelain 路径解析，范围审计分别使用 `git diff --name-only`、`git diff --cached --name-only`、`git ls-files --others --exclude-standard`。
<!-- SPECFORGE_ERR220_EXP185_TRACE_PHASE_INFERENCE:END -->

<!-- SPECFORGE_ERR221_EXP186_REPAIR_FREEZE_BINDING:START -->
## ERR-221 / EXP-186 — Project Spec repair plan 必须绑定最终冻结 Candidate Manifest
- **ERR-221**：P0 Validation WI-0004 首次正式 Candidate Gate 已生成 immutable `attempt-0002`；10 个 required Gates 中 9 个通过，`trace_gate=passed`，仅 `workflow_specific_gate=failed`。唯一 blocking issue 为 `project_spec_repair_plan candidate manifest hash is stale`。
- 一手现场：repair plan 的 `candidate_manifest_sha256=sha256:1ba8b34c...`，最终冻结 Candidate Manifest 实际为 `sha256:e4f716bc...`；但 `manifest_sha256_before`、Candidate `project_spec_precondition_sha256`、当前 Project `spec_manifest.json` 三者均为 `sha256:44ff476f...`，3 条 architecture evidence path 全部存在。因此失败仅是 Candidate Manifest binding stale，不是 Project Spec 漂移、证据缺失或 Trace 缺陷。
- Producer/Consumer 根因：`prepareProjectSpecRepairCandidates()` 在 repair 建立阶段把 plan 绑定到当时 Candidate Manifest；随后 Runtime 在 `candidate_preparing -> candidate_prepared` 权威边界合法重写并冻结最终 Candidate Manifest，却没有同步 repair plan。`workflow_specific_gate` 后续正确地要求 plan 哈希等于当前冻结 Manifest，因此正常生命周期会制造必然过期的 binding。
- 修复：不放宽 Gate。Candidate freeze 后若存在 `project_spec_repair_plan.json`，Runtime 必须先证明 plan 的 `candidate_manifest_sha256` 仍精确等于 freeze 前 Manifest 哈希、action/work_item 身份合法，再仅把该字段更新为 freeze 后 Manifest 哈希。若 freeze 前 binding 已 stale 必须 Fail Closed，禁止自动洗白未知/人工漂移。
- 事务边界：repair plan binding 与 Candidate Manifest 属于同一次 freeze transaction。StateManager transition 失败时二者必须一起恢复到 freeze 前字节；任何回滚失败必须 hard stop。
- **EXP-186 — 派生绑定必须在权威冻结边界重绑，并与主体同事务回滚**：
  1. 较早 Producer 对可继续演化 artifact 生成的 hash binding 不能被当作最终冻结 binding。
  2. 当 Runtime 是最终 frozen artifact 的权威 Producer 时，依赖该最终字节的派生 binding 必须在同一 freeze 边界更新。
  3. 更新前必须证明旧 binding 精确对应 freeze 前主体，禁止把任意 stale plan 自动刷新成“合法”。
  4. 主体与 binding 的提交/回滚必须视作一个事务；Gate 继续严格消费最终 binding，不通过放宽消费者掩盖 Producer 缺口。
- 本轮验证器失败补录：
  - V81：自写 Trace 文本前缀统计绕过正式 `parseGovernanceTraceDelta()`，违反 EXP-148 的“先对照正式 parser 再诊断”；未修改产品/WI。
  - V82：把 latest 兼容视图 `gate_summary.md` 的存在误当 immutable Gate Attempt 身份，违反 EXP-146 / EXP-151；未运行 Gate。
  - V83：Python 直接启动 `bun` 再现 ERR-024，复用 EXP-002 / EXP-007；V84 固定 Windows shim 执行层。
  - V86：正式 Gate 只执行一次且响应已收到；post-audit 错把总 Attempt 数断言为1，忽略首次运行会先把旧 latest 快照成 `attempt-0001 legacy_latest_snapshot`，实际 `attempt-0002` 才是本次 `gate_run`。复用 EXP-146 / EXP-151；禁止因审计器失败重跑 Gate。
  - V89 第一次封包生成：外层 Python 与内层多行 payload 再次触发 ERR-207 同类嵌套三引号语法失败；ZIP 未生成、真实仓库未触达。复用 EXP-177，改为 runner + 独立 `patch_contract.json` payload。
- `UNRECORDED_FAILURES=0`（截至 ERR-221 V89 修改前置对账）。
<!-- SPECFORGE_ERR221_EXP186_REPAIR_FREEZE_BINDING:END -->

<!-- SPECFORGE_ERR222_EXP187_CONTROLLED_REPAIR_BINDING_RECOVERY:START -->
## ERR-222 / EXP-187 — 历史 repair binding 缺陷必须由 immutable failed Attempt 受控恢复
- **ERR-222**：ERR-221 修复只保证后续 `candidate_preparing -> candidate_prepared` freeze 会同步 repair plan；已经在旧实现下进入 `gates_failed` 的 WI-0004 仍保留历史 stale `project_spec_repair_plan.candidate_manifest_sha256`。现有 `prepare_repair` 只允许 `candidate_preparing` 且拒绝覆盖现有 real Candidate/plan；Candidate Gate retry 只做状态恢复，不调用 repair producer，因此历史 WI 没有合法恢复入口。
- **现场证据**：WI-0004 immutable `attempt-0002 source=gate_run summary=failed` 覆盖 10 个 required Candidate Gates，9 个 passed，`trace_gate=passed`，仅 `workflow_specific_gate=failed`，唯一 blocking issue 为 `project_spec_repair_plan candidate manifest hash is stale`；Attempt `input-snapshot.json` 已冻结 Candidate Manifest SHA。
- **恢复原则**：不手改 WI、不放宽 Gate、不重建 Candidate、不修改 Project Spec、不新增状态边。扩展既有 `sf_v11_spec_migration`，新增 `action=recover_repair_binding`，且只允许 authoritative `gates_failed`。
- **恢复授权证据必须全部满足**：
  1. Work Item / Candidate / repair plan 均属于同一 `spec_migration_path` WI；
  2. repair plan 当前确实 stale，且其 Project Spec precondition/version/evidence/modules 与当前冻结 Candidate 可相互推导一致；
  3. 当前 Project Spec manifest 仍等于 repair plan / Candidate 的 precondition；
  4. 最新 immutable Attempt 必须是 `gate_run + failed`，requested/current/summary Gate 集合精确等于当前 full spec_migration Candidate required Gates；
  5. 除 `workflow_specific_gate` 外全部 required Gate 必须 passed；
  6. `workflow_specific_gate` 必须且只能因精确字符串 `project_spec_repair_plan candidate manifest hash is stale` 失败；
  7. Attempt `input-snapshot.json` 中 Candidate Manifest SHA 必须等于当前 Candidate bytes，证明 Candidate 自失败 Attempt 后未变化；
  8. 写入前再次检查 repair plan / Candidate / Project Spec 三方 freshness，任一变化 Fail Closed。
- **写入范围**：成功恢复只原子修改 `project_spec_repair_plan.candidate_manifest_sha256`，其余 plan 字段、Candidate、Project Spec、权威状态、Gate Attempt 均不修改。动作返回 failed Attempt ID、旧/新 binding 和 `state_advanced=false`；不会自动重跑 Gate。
- **EXP-187 — 历史生命周期缺陷的补偿动作必须由 immutable execution evidence + 当前 freshness 双重授权**：不能因为“现在看起来能修”就刷新派生证据。必须证明失败执行当时的唯一原因、主体 artifact 未变化、当前上游真相仍满足原 precondition，并在真正写入前再次检查 freshness；补偿动作只修缺陷制造的最小派生字段，不推进 Workflow。
- **V91 审计器纠正**：
  - V91 自己猜 `events.jsonl` 字段得到 `WI0004_STATE=UNKNOWN`，而正式 `StateManager/readAuthoritativeState` 已证明状态为 `gates_failed`；复用 EXP-151，状态事实必须来自正式 authority reader。
  - V91 通过仓库关键词 `reprepare` 在无关 `contract-authoring.ts` 产生“存在 repair refresh action”的假阳性；Producer 能力必须以目标 Tool action/schema/handler 调用链为证据，不能靠泛关键词，复用 EXP-181。
- `UNRECORDED_FAILURES=0`（截至 ERR-222 V92 修改前置对账）。
<!-- SPECFORGE_ERR222_EXP187_CONTROLLED_REPAIR_BINDING_RECOVERY:END -->

<!-- SPECFORGE_ERR223_ERR225_STAGE_EXECUTION_CONTRACT:START -->
## ERR-223 / EXP-188 — 完整阶段必须有显式副作用契约和可定位 Checkpoint
- **ERR-223**：V95 在正式 Candidate Gate retry 已发出、已收到响应并生成 immutable `attempt-0003/**` 后，外围审计仍要求 Validation Git untracked 集合前后完全相等，正常 Gate 证据被误判为 scope drift。
- **EXP-188**：用户交互按完整阶段批处理，诊断证据按子步骤细分；动作前声明 Expected/Forbidden Side Effects；正式动作开始后先查持久化证据，禁止因外围 runner 失败直接重试。

## ERR-224 / EXP-189 — 生成结构与结构审计必须使用同一规范表达
- **ERR-224**：V96 生成的规则标题为 `**GOV-STAGE-001：完整阶段……**`，而审计器按现有权威规范检查 `**GOV-STAGE-001：**`，导致规则计数为 0。V96 已 `ROLLBACK_TO_HEAD=PASS`，未留下仓库改动。
- **EXP-189**：生成结构、runtime audit、回归测试必须共享同一 canonical marker；ZIP 生成前必须先对 payload 本身运行同一份结构契约检查。

## ERR-225 / EXP-190 — 打包前自检本身不得包含与目标契约矛盾的断言
- **ERR-225**：第一次 V97 打包尝试在 ChatGPT 本地生成阶段加入了错误 sanity assertion：一边要求测试代码必须包含 canonical marker 模板，一边又断言该模板字符串不得出现，导致打包前自检自身失败；未生成可交付 ZIP，未触碰用户仓库。
- **EXP-190**：打包前自检只允许验证真实交付不变量；同一 invariant 的正向/反向断言必须先做逻辑一致性检查。生成失败必须记录，但不得把未生成包当成用户侧失败。
- `UNRECORDED_FAILURES=0`（截至 V98 框架固化前置对账）。
<!-- SPECFORGE_ERR223_ERR225_STAGE_EXECUTION_CONTRACT:END -->

<!-- SPECFORGE_ERR226_EXP191_STRUCTURAL_PATCH_ANCHOR:START -->
## ERR-226 / EXP-191 — 权威文件修改必须使用稳定结构边界，禁止自然语言整段锚点
- **ERR-226**：V101 在 `PATCH_PREFLIGHT` 失败，`authority rule count=0`。远程权威文件实际在 `GOV-STAGE-HANDOFF-001` 尾部与 `### 0.10 新会话固定提示词` 之间包含空行；V101 把自然语言句子、换行数量和章节标题组合成一个全文字符串锚点，因此即使语义与目标位置完全正确，也因空白格式差异无法匹配。
- **分类**：`VALIDATION_HARNESS_DEFECT`。V101 在任何仓库写入前失败，`REQUEST_STARTED=NO`；Validation/WI-0004、Gate、User Decision、Merge 均未触碰。
- **EXP-191**：
  1. 权威文件 patch 必须优先使用稳定规则 ID、唯一章节标题、显式 START/END marker 或 parser 结构边界；
  2. 禁止使用“自然语言全文 + 精确空白/换行”作为关键 patch 锚点；
  3. 章节内内容修改必须先限定唯一章节范围，再在该范围内定位 code fence、规则 ID 或 marker；
  4. 动态 handoff 只允许通过唯一 START/END marker 替换；
  5. patch preflight 必须证明结构边界唯一，再允许写入。
- **防复发**：V102 的 authority 使用唯一 `### 0.10 新会话固定提示词` 作为插入边界；提示词修改限定在 0.10 章节第一个 `text` code fence；handoff 只替换唯一 CURRENT EXECUTION STATE marker 区间。
- `UNRECORDED_FAILURES=0`（截至 V102 前置对账）。
<!-- SPECFORGE_ERR226_EXP191_STRUCTURAL_PATCH_ANCHOR:END -->

<!-- SPECFORGE_ERR227_EXP192_SCOPED_TEST_PATCH:START -->
## ERR-227 / EXP-192 — 测试补丁必须先限定测试块作用域，禁止全文件字段唯一性假设
- **ERR-227**：V104 在 `PATCH_PREFLIGHT` 失败，错误为 `authority field anchor not unique`。真实 `stage-execution-authority-contract.test.ts` 中 `'NEXT_LEGAL_ACTION='` 分别存在于 authority 字段测试和 handoff 字段测试两个独立 `it(...)` 块，因此全文件计数为 2；V104 错误要求该字段在整个测试文件中唯一。
- **附带发现**：V104 的原型失败输出把 `FAILURE_CLASS / ERROR_CODE / ERROR` 打印在 `===== END FEEDBACK TO CHATGPT =====` 之后。若用户只复制标准回执区块，新会话会丢失关键失败诊断，因此统一回执必须要求所有关键诊断字段位于 BEGIN/END 内部。
- **分类**：`VALIDATION_HARNESS_DEFECT`。V104 在任何仓库写入前 Fail Closed；用户反馈证明 `WORKTREE_AFTER=CLEAN`、`FILES_CHANGED=NONE_AFTER_ROLLBACK`、`REQUEST_STARTED=NO`、`RESPONSE_RECEIVED=NO`、WI-0004 保持 `approval_required`。
- **EXP-192**：
  1. 修改测试文件时必须先定位具体 `describe` / `it` 结构块，再在块内定位字段数组或断言；
  2. 同名字面量在不同测试块重复是合法结构，不得把“全文件唯一”当成语义约束；
  3. runner 的 patch preflight 必须验证“结构块唯一 + 块内锚点唯一”，而不是“任意字面量全文件唯一”；
  4. 标准执行回执的关键诊断字段必须全部在 BEGIN/END 内，确保新会话只复制一段就能解释 SUCCESS 或 FAILED；
  5. 对历史验证器错误的修复不得触碰真实 WI 生命周期状态。
- **防复发**：V105 对结构测试分别限定 authority `it(...)` 与 handoff `it(...)` 块后再修改各自字段数组，并把失败诊断统一放入标准反馈边界。
- `UNRECORDED_FAILURES=0`（截至 V105 前置对账）。
<!-- SPECFORGE_ERR227_EXP192_SCOPED_TEST_PATCH:END -->

<!-- SPECFORGE_ERR228_EXP193_ARTIFACT_ACCEPTANCE:START -->
## ERR-228 / EXP-193 — 交付基线与所有生成成果必须经过独立后验验收

- **ERR-228**：V107 在用户机器 `BASELINE` Fail Closed。V107 错误期待 `main=b78766e9c7c17ba51231f292431a73874b500c62`；用户实际执行时结构化 Git 证据明确为：
  - local `main=6552c0648317d57195a75aa2b3ce3819962355a4`
  - remote `main=6552c0648317d57195a75aa2b3ce3819962355a4`
  - authority commit=`6552c0648317d57195a75aa2b3ce3819962355a4`
  - worktree=`CLEAN`
  - `REQUEST_STARTED=NO`
  - `FILES_CHANGED=NONE_AFTER_ROLLBACK`
- **分类**：`VALIDATION_HARNESS_DEFECT / BASELINE_EVIDENCE_PRIORITY_DEFECT`。
- **根因**：交付器生成前虽然读取了外部远程页面，但没有把“交付基线本身”作为成果做后验验收，并错误地让缓存/历史远程视图覆盖了上一轮最新、精确、结构化 `git ls-remote` 执行回执；违反既有 `EXP-171 — branch HEAD 以 branch ref 为准` 的证据优先级。
- **影响**：V107 未写任何仓库文件、未修改 WI-0004、未执行任何生命周期动作；失败仅造成一次无效交付。

### EXP-193 — 所有成果统一执行 Generate → Verify → Accept → Consume
1. 包基线、Stage Input、ZIP、CMD、回执、handoff、代码/文档补丁、测试证据、commit/push 结果都属于 artifact。
2. 生成 artifact 后必须依据其正式 contract 独立验证结构、完整性、语义、引用、范围、可执行性和消费者可用性。
3. `ARTIFACT_ACCEPTED != YES` 时不得交付、执行、提交、推送或进入下一阶段。
4. remote branch HEAD 的验收优先使用最新结构化 branch-ref 证据；缓存网页、历史 commit 页面和“commit 可访问”不能覆盖更新的 `git ls-remote` 事实。
5. 新会话生成 `GOVERNANCE PRECONCLUSION + STAGE INPUT` 后必须逐字段验收，不能因为前文出现过同名事实就省略 Stage Input 必填字段。
6. 关键成果的 validator 应尽量独立于 generator；生成器自己的字符串检查只能作为补充证据。
<!-- SPECFORGE_ERR228_EXP193_ARTIFACT_ACCEPTANCE:END -->

<!-- SPECFORGE_ERR229_EXP194_STRUCTURAL_ARTIFACT_VALIDATION:START -->
## ERR-229 / EXP-194 — Artifact Acceptance 不得依赖自然语言原句匹配

- **ERR-229**：V109 在 `CONTENT_PREFLIGHT` 失败，错误为 `authority marker missing=Stage Input 本身都是成果`。V108 已通过本地完整验证，实际权威规则存在 `GOV-STAGE-ARTIFACT-VERIFY-001`，并以带 Markdown 代码格式的 `Stage Input` 表述同一要求；V109 却把去掉格式标记后的自然语言片段当成必须逐字匹配的契约，因此错误阻断 commit/push。
- **现场证据**：
  - `RESULT=FAILED`
  - `FIRST_FAILED_STEP=CONTENT_PREFLIGHT`
  - `REQUEST_STARTED=NO`
  - `COMMIT_SHA=NONE`
  - `PUSH_SUCCEEDED=NO`
  - `WORK_HEAD_BEFORE/AFTER=6552c0648317d57195a75aa2b3ce3819962355a4`
  - `REMOTE_WORK_HEAD_BEFORE/AFTER=6552c0648317d57195a75aa2b3ce3819962355a4`
  - `STATE_BEFORE/AFTER=approval_required`
- **分类**：`VALIDATION_HARNESS_DEFECT`。
- **根因**：Artifact Acceptance verifier 自身仍使用自然语言句子作为契约锚点，没有复用稳定 Rule ID、结构字段和回归测试；与 `GOV-STAGE-ARTIFACT-VERIFY-001` 的设计目标相违背。
- **EXP-194**：
  1. 验收权威规则是否存在时，优先检查稳定 Rule ID 唯一性；
  2. 验收结构时检查固定字段、schema、parser 或结构回归测试；
  3. 自然语言正文只可作为补充证据，不得作为 commit/push、Gate 或其他有副作用动作的唯一前置条件；
  4. Markdown 引号、反引号、空白和等价措辞变化不得造成假失败；
  5. 验收器本身也是 artifact，其 contract 必须接受独立结构检查；
  6. 失败前若仓库已经存在上一阶段合法未提交成果，rollback 必须恢复到“本轮开始时的工作树”，不得误删上一阶段成果。
- **防复发**：V110 对 `GOV-STAGE-ARTIFACT-VERIFY-001` 使用 Rule ID + 固定 Artifact Acceptance 字段 + handoff contract pointer + 回归测试四路结构证据，不再匹配自然语言原句；失败回滚使用本轮开始时的文件字节快照。
<!-- SPECFORGE_ERR229_EXP194_STRUCTURAL_ARTIFACT_VALIDATION:END -->

<!-- SPECFORGE_EXP195_VALIDATOR_CONTRACT_HARDENING:START -->
## EXP-195 — 验证器设计契约：验证正式语义，不验证作者当时写出的字符串

- **来源问题族**：ERR-226、ERR-227、ERR-228、ERR-229 均属于验证器/交付器把临时字符串、全文件唯一性假设、错误基线或自然语言原句当成正式契约而造成的假失败。
- **统一结论**：验证器自身也是 artifact；必须先有 Validator Contract，再用正式 truth source 验收验证器，最后才允许该验证器阻断发布、执行、commit/push 或下一 Stage。
- **稳定规则**：
  1. 阻断断言必须结构化声明 `ASSERTION_ID / ASSERTION_TYPE / TRUTH_SOURCE / CONTRACT_SOURCE / BLOCKING`；
  2. `NATURAL_LANGUAGE_AUX` 永远不能作为唯一阻断条件；
  3. authority 用 Rule ID/section/schema，产品状态用 StateManager/immutable evidence/formal parser，Git 用结构化 refs/diff protocol；
  4. 网页缓存、raw branch 缓存、历史 commit 页面和 commit 可访问性只能辅助，不得覆盖更新的结构化 branch-ref 证据；
  5. 测试/文档修改先限定稳定结构作用域，再检查作用域内唯一性；
  6. validator self-check 必须检查自己的阻断断言类型、truth source、contract source、baseline freshness 和 rollback 行为；
  7. generator 与 validator 至少在一条关键证据链上独立，禁止同一份 expected string 自证；
  8. 验证器失败先分类，不能直接覆盖正式产品成功证据或自动重试有副作用动作。
- **防复发目标**：以后不再为“多一个反引号、换一句等价文案、字段合法重复、网页缓存滞后”等非语义变化制造假失败。
<!-- SPECFORGE_EXP195_VALIDATOR_CONTRACT_HARDENING:END -->

<!-- SPECFORGE_ERR230_EXP196_RECOVERY_ACCEPTANCE:START -->
## ERR-230 / EXP-196 — 新会话恢复成果必须机器验收，Stage Input 必须统一到当前分支模型

- **ERR-230 现场**：在 `GOV-STAGE-ARTIFACT-VERIFY-001` 与 `GOV-STAGE-VALIDATOR-001` 已提交后，一次真实新会话能够正确读取远程 authority、识别网页证据仅为辅助、识别 WI-0004 当前 handoff 停在 User Decision 前，并选择只读取证；但仍出现：
  1. 生成 `GOVERNANCE PRECONCLUSION + Stage Input` 后没有输出 Artifact/Recovery Acceptance 就直接生成 ZIP+CMD；
  2. Stage Input 漏掉 `AUTHORITY_PATH/AUTHORITY_COMMIT/WORKTREE_STATUS` 及 `LOCAL_COMMAND_SHELL/DOWNLOAD_PACKAGE_DIR/LOCAL_PATH_QUOTING`；
  3. `GOV-STAGE-INPUT-001` 仍列旧 `TARGET_BRANCH/REMOTE_HEAD`，与 `GOV-STAGE-BRANCH-001` 的新分支模型存在契约不一致；
  4. PRECONCLUSION 把 handoff 中的 `approval_required/attempt-0003` 写入 CURRENT_FACTS，而 Stage Input 又正确标记为 pending persisted-state confirmation，事实状态表达前后不统一。
- **影响**：该新会话尚未得到用户执行其只读取证包，因此没有 SpecForge / Validation 仓库副作用；问题属于治理执行框架缺口。
- **分类**：`GOVERNANCE_FAILURE / VALIDATION_HARNESS_GAP`。
- **根因**：
  1. 通用 Artifact Acceptance 已规定 PRECONCLUSION/Stage Input 是成果，但新会话启动协议没有规定固定 Recovery Acceptance 输出结构，AI 仍可“读懂规则但跳过验收步骤”；
  2. Stage Input 规范与后来引入的 authority/work branch 分离模型没有完成契约归一；
  3. 对 handoff claim、receipt claim、web auxiliary、structured truth 缺少新会话专用的事实状态模型。
- **EXP-196**：
  1. 新会话固定三段式启动：`GOVERNANCE PRECONCLUSION → Stage Input → Recovery Acceptance`；
  2. `RECOVERY_ACCEPTED != YES` 不得生成下一执行 ZIP+CMD、不得写仓库、不得执行生命周期动作；
  3. 只读取证可以在真实事实尚缺失时被接受，但必须显式列出 evidence gaps，且 accepted 的对象是“只读取证计划”，不是待确认事实本身；
  4. 新 Stage Input 统一使用 `AUTHORITY_BRANCH/AUTHORITY_HEAD` 与 `WORK_BRANCH/WORK_HEAD/REMOTE_WORK_HEAD/WORKTREE_STATUS`，旧 `TARGET_BRANCH/REMOTE_HEAD` 只保留历史兼容；
  5. 本地 CMD 环境是 Stage Input 固定字段，不允许仅因为最终 CMD 恰好写对路径就视为恢复完成；
  6. handoff / old receipt 是 claim，StateManager / immutable evidence / structured Git 才能把相应事实提升为 confirmed；
  7. Recovery validator 自身继续执行 `GOV-STAGE-VALIDATOR-001`，不能回退到自然语言字符串检查。
<!-- SPECFORGE_ERR230_EXP196_RECOVERY_ACCEPTANCE:END -->

<!-- SPECFORGE_ERR231_EXP197_AUTHORITY_BOOTSTRAP_ROOT_OF_TRUST:START -->
## ERR-231 / EXP-197 — 新会话必须先固定 live branch ref，再读取 exact-commit authority

- **ERR-231 现场**：V112 已成功提交 `GOV-STAGE-RECOVERY-ACCEPT-001`，结构化执行回执证明 `main=de501390c4d2752570d34022557ea9ac83d32617`、authority commit 同为该 SHA、push 成功、worktree clean。随后一次真实新会话却把缓存/历史网页结果 `b78766e...` 当作 `AUTHORITY_HEAD`，把 `56d20c...` 当作 authority file commit，并因此没有看到 V112 已存在的 Recovery Acceptance 规则；回复直接从 PRECONCLUSION / Stage Input 跳到“等待 User Decision 授权”。
- **附加事实**：该新会话还声明“本轮没有上一轮标准 CMD 回执”，而上一阶段实际存在 V112 ZIP+CMD 完整执行回执。框架没有把“应有回执缺失”作为 bootstrap blocker。
- **影响**：用户没有执行新的生命周期动作，WI-0004 未变化；问题属于新会话 authority root-of-trust 和 evidence continuity 缺口。
- **分类**：`GOVERNANCE_FAILURE / EVIDENCE_DEFECT / VALIDATION_HARNESS_GAP`。
- **根因**：
  1. 旧启动协议要求“从 GitHub 当前远程分支读取 authority 并固定 HEAD”，但没有规定必须先独立取得 live branch ref；
  2. authority 自己承载“不要相信 raw/main”的规则，形成循环依赖：若 raw/main 已缓存旧版本，新会话看不到禁止缓存的最新规则；
  3. last receipt 的 last-confirmed 证据、live branch-ref 证据与 web auxiliary 没有在 Authority Bootstrap 层单独建模；
  4. 缺失应有上一轮 receipt 时没有 fail closed。
- **EXP-197**：
  1. 新会话第一真相不是 raw branch 内容，而是 live branch ref；
  2. 固定 `AUTHORITY_HEAD` 后必须读取 exact-commit authority，避免 branch raw/HTML 缓存；
  3. `AUTHORITY_HEAD` 与 authority file last-modifying commit 分开证明；
  4. last receipt 只能证明 last-confirmed，不等于 current live remote；
  5. 无 live ref 证据时只能请求只读 `git ls-remote`，不得用网页结果降级继续；
  6. Bootstrap Root-of-Trust 的最小规则必须直接写入固定新会话提示词，避免依赖尚未可靠读取的 authority；
  7. 上一轮有 ZIP+CMD 却缺少 receipt 时必须标记 `MISSING_LAST_EXECUTION_RECEIPT`；
  8. Authority Bootstrap 通过后才进入 PRECONCLUSION / Stage Input / Recovery Acceptance。
<!-- SPECFORGE_ERR231_EXP197_AUTHORITY_BOOTSTRAP_ROOT_OF_TRUST:END -->

<!-- SPECFORGE_ERR232_EXP198_PACKAGE_GENERATOR_SYNTAX_GUARD:START -->
## ERR-232 / EXP-198 — 包生成器自身必须先通过语法验收，失败产物不得视为已生成

- **ERR-232 现场**：首次构建 V113 时，包生成器在 Python 解析阶段因嵌套三引号导致 `IndentationError`，工具明确返回“代码未成功执行，不得假设任何文件或副作用已产生”。
- **影响**：失败发生在交付前；没有可交付 ZIP、没有用户执行、没有仓库修改。
- **分类**：`VALIDATION_HARNESS_DEFECT / SCRIPT_DEFECT`。
- **根因**：生成器源码同时承载 runner 字符串和 runner 内测试字符串，使用相同三引号边界导致外层字符串被提前终止。
- **EXP-198**：
  1. 生成器、runner、verifier 三层源码都必须在 ZIP 构建前完成语法解析/compile；
  2. 复杂嵌套源码模板必须使用不同字符串定界方式或结构化拼装，禁止依赖肉眼判断三引号边界；
  3. 工具执行失败时不得沿用预期文件名、SHA 或“已生成”结论；
  4. 只有 ZIP reopen、manifest/hash、runner/verifier compile 全部通过后才允许发布。
<!-- SPECFORGE_ERR232_EXP198_PACKAGE_GENERATOR_SYNTAX_GUARD:END -->

<!-- SPECFORGE_ERR233_EXP199_BOOTSTRAP_FAILURE_PATH:START -->
## ERR-233 / EXP-199 — Bootstrap Fail Closed 已生效，但失败路径输出、阶段边界和取证包验收仍未闭环

- **ERR-233 现场**：V113 已提交并推送 `GOV-STAGE-AUTHORITY-BOOTSTRAP-001`。随后真实新会话在其执行环境 `git ls-remote` DNS 失败时，正确拒绝把网页辅助值 `b78766e...` 当作 live `AUTHORITY_HEAD`，输出 `AUTHORITY_HEAD=INSUFFICIENT_EVIDENCE`、`AUTHORITY_BOOTSTRAP_ACCEPTED=NO` 并停止 WI 生命周期动作；但仍存在三项缺口：
  1. Bootstrap 失败输出省略 `AUTHORITY_HEAD_SOURCE / AUTHORITY_EXACT_CONTENT_REF / AUTHORITY_UNIQUE_MARKER_AUDIT / AUTHORITY_BOOTSTRAP_EVIDENCE / FRESHNESS / VALIDATOR_ID / VALIDATOR_ACCEPTED` 等强制字段；
  2. Bootstrap 尚未接受时仍读取了远程 `current-handoff.md`，并列出 WI-0004 / attempt-0003 / operation boundary 等 pending claim；
  3. 随后交付只读取证 ZIP 只报告 `POST_BUILD_VERIFY=PASS`、`NO_PYC_CACHE=PASS`，没有完整 `GOV-STAGE-ARTIFACT-VERIFY-001` / `GOV-STAGE-VALIDATOR-001` Artifact Acceptance。
- **影响**：用户尚未执行该新会话生成的 Bootstrap 取证包；没有 SpecForge / Validation 仓库副作用，没有 WI-0004 生命周期动作。
- **分类**：`GOVERNANCE_FAILURE / VALIDATION_HARNESS_GAP`。
- **根因**：
  1. V113 规定 Bootstrap 失败只能取得 live branch-ref evidence，但没有给失败路径独立的完整字段/验收契约；
  2. “不得进入 Recovery”没有被细化为“不得读取 handoff/Work Item/immutable evidence”；
  3. Bootstrap evidence ZIP 作为特殊只读例外，没有在启动提示词内再次明确它仍受完整 Artifact Acceptance 约束。
- **EXP-199**：
  1. Bootstrap PASS 与 FAIL 都必须输出完整结构；失败不能用一句 `AUTHORITY_BOOTSTRAP_ACCEPTED=NO` 代替；
  2. Fail Closed 期间必须执行 `AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=PASS_NO_HANDOFF_OR_RECOVERY_READ`；
  3. Bootstrap 失败时唯一下一动作固定为 `ACQUIRE_LIVE_BRANCH_REF_ONLY`；
  4. 只读取证包只能执行 `git ls-remote`，不得读取任何项目仓库；
  5. 只读取证包仍必须完整执行 Artifact Acceptance + Validator Self Check，局部 build/zip 检查不能替代；
  6. 失败路径自身先 `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES`，取证包再 `ARTIFACT_ACCEPTED=YES`，之后才允许发布 ZIP+CMD；
  7. 用户返回 live ref 后重新 Bootstrap，禁止复用失败回合提前读取的 handoff/Recovery 内容。
<!-- SPECFORGE_ERR233_EXP199_BOOTSTRAP_FAILURE_PATH:END -->

<!-- SPECFORGE_ERR234_EXP200_ASSISTANT_LIVE_REF_ENVIRONMENT:START -->
## ERR-234 / EXP-200 — 助手侧 live Git DNS 不可用时只能使用 last-confirmed exact authority 设计，并把 live preflight 下沉到用户 runner

- **ERR-234 现场**：准备本轮修复时，助手执行环境调用 `git ls-remote https://github.com/lyqstart/SpecForge.git refs/heads/main` 返回 `Could not resolve host: github.com`。随后使用上一轮 V113 结构化回执中的 `main=426bdc5396f75cc6c93c8fd4074cfa85691212f5` 作为 `LAST_CONFIRMED`，并从 GitHub exact commit URL 读取该 SHA 对应的唯一权威文件；未把网页 branch/raw 辅助结果声称为 live branch ref。
- **影响**：助手侧没有仓库写入；本轮交付 runner 必须在任何写操作前重新执行 live `git ls-remote`，若 remote main 不等于 last-confirmed baseline 则零写入 Fail Closed。
- **分类**：`ENVIRONMENT_FAILURE`。
- **根因**：当前助手容器 DNS 无法解析 GitHub；不是 SpecForge 产品缺陷。
- **EXP-200**：
  1. 助手环境无法取得 live ref 时，必须明确区分 `LAST_CONFIRMED_REMOTE_HEAD` 与 `LIVE_REMOTE_HEAD=INSUFFICIENT_EVIDENCE`；
  2. 可以使用 last-confirmed exact commit authority 进行无副作用设计/打包，但不能宣称 live remote 已重新确认；
  3. 任何用户侧实际修改 runner 必须把 `git ls-remote` 放在首次写入之前，并在 remote drift 或网络失败时零写入退出；
  4. exact-commit GitHub 内容可以证明“该 commit 的规则内容”，不能证明“该 commit 仍是当前 branch head”。
<!-- SPECFORGE_ERR234_EXP200_ASSISTANT_LIVE_REF_ENVIRONMENT:END -->

<!-- SPECFORGE_ERR235_EXP201_BOOTSTRAP_FAILURE_RAW_CMD:START -->
## ERR-235 / EXP-201 — Bootstrap 失败路径仍被缩写，并直接发布裸 git ls-remote CMD

- **现场**：V114 后真实新会话正确 Fail Closed 且未读取 handoff/WI，但仍省略完整失败字段并直接给出裸 `git ls-remote` CMD。
- **影响**：用户未执行裸 CMD；没有仓库副作用，没有 WI-0004 生命周期动作。
- **分类**：`GOVERNANCE_FAILURE / VALIDATION_HARNESS_GAP`。
- **EXP-201**：固定失败模板；`RAW_CMD_ALLOWED=NO`；本地取证只能 `ONE_ACCEPTED_ZIP_PLUS_ONE_CMD`；ZIP 完整 Artifact Acceptance 必须先于 CMD。
<!-- SPECFORGE_ERR235_EXP201_BOOTSTRAP_FAILURE_RAW_CMD:END -->

<!-- SPECFORGE_ERR236_EXP202_ABBREVIATED_PROMPT_REGRESSION:START -->
## ERR-236 / EXP-202 — V115 把固定模板再次缩写，被已有回归测试正确阻断

- **现场**：V115 在 `STRUCTURAL_REGRESSION_TEST` 失败，`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **根因**：V115 prompt 没有实际包含 V114 消费者测试要求的 `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED`、`AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED`、`ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP` 等字段。
- **分类**：`VALIDATION_HARNESS_DEFECT`。
- **结论**：这是有效回归拦截，不是假失败；应修 prompt 生产者，不能删消费者断言。
- **EXP-202**：固定模板必须逐字段真实存在；Authority rule 与 new-session prompt 按同一结构字段集合对账；定向测试必须在 commit 前阻断不完整 prompt。
<!-- SPECFORGE_ERR236_EXP202_ABBREVIATED_PROMPT_REGRESSION:END -->

<!-- SPECFORGE_ERR237_EXP203_NEGATIVE_NATURAL_LANGUAGE_SELF_CHECK:START -->
## ERR-237 / EXP-203 — V116 首次生成自检用自然语言禁词造成假失败

- **现场**：V116 首次生成在交付前自检阶段因 `assert "全部规定字段" not in new_prompt` 失败。prompt 中该词只用于说明“不得用该类缩写替代字段”，而必需结构字段实际上已经完整存在。
- **影响**：生成工具执行失败发生在正式打包发布前；没有可交付 V116、没有用户执行、没有仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT`。
- **根因**：验证器再次使用自然语言词面负向搜索作为阻断条件，违反 `GOV-STAGE-VALIDATOR-001`。
- **EXP-203**：
  1. 模板完整性只验证正式结构字段集合和顺序/section，不验证自然语言禁词；
  2. “禁止某种写法”的说明文字可以合法包含被禁止术语，不能因此判失败；
  3. 不再使用全局 `not contains` 自然语言词面作为 blocking assertion；
  4. 此类自检失败必须在发布前终止并记录，不能假设包已生成。
<!-- SPECFORGE_ERR237_EXP203_NEGATIVE_NATURAL_LANGUAGE_SELF_CHECK:END -->

<!-- SPECFORGE_ERR238_EXP204_DELIVERY_IDENTITY_BINDING:START -->
## ERR-238 / EXP-204 — V116 成功回执沿用 V115 Validator ID，交付身份未绑定

- **现场**：用户执行 `SpecForge_Bootstrap_Failure_Template_No_Raw_CMD_V116.zip` 成功，commit/push、定向测试、TypeScript、daemon-core build、workspace build、`git diff --check` 和最终 worktree 均通过；但标准回执输出 `PACKAGE_NAME=...V116.zip` 与 `VALIDATOR_ID=V115_BOOTSTRAP_FAILURE_TEMPLATE_VALIDATOR`。
- **副作用事实**：V116 已真实提交并推送 `c23b7c27fad68de09c493dbc3f057cd59b6dad67`；WI-0004 状态仍为 `approval_required`，未执行任何生命周期动作。
- **分类**：`VALIDATION_HARNESS_DEFECT / EVIDENCE_IDENTITY_DEFECT`。
- **根因**：receipt 中 `VALIDATOR_ID` 是从上一版 runner 遗留的独立硬编码常量；现有 Validator Contract 没有绑定 package / runner / validator / receipt emitter 的共同 delivery identity。
- **EXP-204**：每个交付建立唯一 `DELIVERY_ID`；所有身份统一写入 `manifest.json`；runner receipt 从 manifest 读取；verifier 独立检查实际 ZIP/bundle/files/namespace；`RESULT=SUCCESS` 必须 `IDENTITY_BINDING_AUDIT=PASS`。
<!-- SPECFORGE_ERR238_EXP204_DELIVERY_IDENTITY_BINDING:END -->

<!-- SPECFORGE_ERR239_EXP205_GENERATOR_PARSE_PRECHECK:START -->
## ERR-239 / EXP-205 — V117 首次构造器再次因嵌套三引号在生成前解析失败

- **现场**：V117 首次交付构造代码在 Python 解析阶段因外层 runner 模板与内层测试模板使用冲突的三引号，触发 `IndentationError`；工具明确返回代码未成功执行。
- **影响**：没有可交付 ZIP、没有用户执行、没有 SpecForge 仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / SCRIPT_DEFECT`；重复错误类为 ERR-232 / EXP-198。
- **旧防护为何不足**：EXP-198 要求 runner/verifier 生成后 compile，但本次错误发生在生成器源代码本身被 Python 解析之前，原防护点晚于失败点。
- **EXP-205**：
  1. 嵌套源码模板必须使用不同字符串定界层级；
  2. runner 与其内嵌测试模板不得使用同一种三引号边界；
  3. 只有构造器成功执行、runner/verifier compile、ZIP reopen、manifest/hash 全部通过后才允许发布；
  4. 生成器解析失败时保持同一未发布 Delivery ID，不把失败产物当成已经生成的版本。
<!-- SPECFORGE_ERR239_EXP205_GENERATOR_PARSE_PRECHECK:END -->

<!-- SPECFORGE_ERR240_EXP206_PREAUTHORITY_ENVELOPE_GAP:START -->
## ERR-240 / EXP-206 — V117 Delivery Identity 已落库，但未进入 pre-authority 固定启动契约

- **现场**：V117 成功提交 `GOV-STAGE-DELIVERY-IDENTITY-001` 后进行真实新会话验证。新会话正确执行完整 Bootstrap Failure Acceptance、禁止裸 CMD、未读取 handoff，并在 Artifact Acceptance 后生成 Bootstrap live-ref evidence ZIP；但该 evidence ZIP 的 Acceptance 没有 `DELIVERY_ID / RUNNER_ID / RECEIPT_EMITTER_ID / IDENTITY_MANIFEST / IDENTITY_BINDING_AUDIT`。
- **已确认根因**：`GOV-STAGE-DELIVERY-IDENTITY-001` 位于 exact-commit authority 中，而 `### 0.10 新会话固定提示词` 仍只携带 V116 的 Failure / Artifact 最小模板。Bootstrap 失败时尚不能读取 exact authority，因此新会话无法在 pre-authority 阶段获知 V117 新增身份契约。
- **附带证据**：新会话还输出 `MISSING_LAST_EXECUTION_RECEIPT`，但固定启动协议没有独立 `LAST_EXECUTION_RECEIPT_STATUS / CONSUMPTION_AUDIT`，无法机器区分“确实缺失、存在但无效、明确 NONE、已完整消费”。
- **分类**：`GOVERNANCE_FAILURE / PREAUTHORITY_CONTRACT_GAP`。
- **影响**：用户未执行该 Bootstrap evidence ZIP；没有仓库副作用，没有 WI-0004 生命周期动作。
- **EXP-206**：
  1. 建立单一 `GOV-STAGE-BOOTSTRAP-ENVELOPE-001`，集中承载所有 pre-authority 行为；
  2. Delivery Identity、Artifact Acceptance、Validator、receipt presence/consumption、failure、success transition 必须全部进入固定 prompt；
  3. 新增任何 pre-authority 规则时必须原子更新 authority inventory、fixed prompt、consumer test；
  4. Bootstrap evidence ZIP 的 Artifact Contract 必须显式包含 `GOV-STAGE-DELIVERY-IDENTITY-001`；
  5. Receipt 使用四态 `PRESENT_VALID / PRESENT_INVALID / NONE_ALLOWED / MISSING_REQUIRED`，禁止仅凭自然语言推断；
  6. consumer test 必须检查 prompt section 内真实字段，不能因为字段在 authority 其他章节存在就放行。
<!-- SPECFORGE_ERR240_EXP206_PREAUTHORITY_ENVELOPE_GAP:END -->

<!-- SPECFORGE_ERR241_EXP207_PROMPT_ANCHOR_SCOPE_COLLISION:START -->
## ERR-241 / EXP-207 — V118 全局 prompt 标题锚点误命中 Envelope 正文并删除 Recovery Rule

- **现场**：V118 在 `STRUCTURAL_REGRESSION_TEST` 失败，`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **复现根因**：V118 先插入 Bootstrap Envelope；Envelope 正文自身包含 `### 0.10 新会话固定提示词`。随后 runner 用全文件 `indexOf(SESSION_HEADING)` 定位旧 prompt，命中新插入正文，并从该位置替换到 protocol END，导致真正 `GOV-STAGE-RECOVERY-ACCEPT-001` 被删除。
- **附带缺陷**：旧回归仍含“固定下一个 Rule=Recovery”和自然语言原句的阻断断言。
- **影响**：commit/push 前 Fail Closed；远程仍为 `df7cd285fa233426560b1202e2c9eb432ea80dab`。
- **分类**：`VALIDATION_HARNESS_DEFECT / STRUCTURAL_PATCH_SCOPE_DEFECT`。
- **EXP-207**：首次 marker 迁移先替换旧 prompt 再插新规则；prompt 永久使用 START/END marker；Rule section 使用 Rule ID parser；自然语言原句不作 blocker；交付前对 exact authority 快照模拟 patch 并验证 Recovery Rule 保留。
<!-- SPECFORGE_ERR241_EXP207_PROMPT_ANCHOR_SCOPE_COLLISION:END -->

<!-- SPECFORGE_ERR242_EXP208_NESTED_SOURCE_DELIMITER_REPEAT:START -->
## ERR-242 / EXP-208 — V119 第一次预交付生成再次发生嵌套源码字符串定界冲突

- **现场**：V119 第一次生成代码在 Python 解析阶段报 `SyntaxError: invalid character '：'`；外层 runner source 已被内层三引号提前终止。
- **影响**：工具明确表示代码未成功执行；没有 V119 可交付 ZIP，没有用户执行，没有仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / SCRIPT_DEFECT`，属于 ERR-232 / ERR-239 同类重复错误。
- **EXP-208**：生成 runner 时不再把内嵌 TypeScript source 直接嵌套在 runner Python source；所有测试替换片段移入结构化 `payload.json`。
<!-- SPECFORGE_ERR242_EXP208_NESTED_SOURCE_DELIMITER_REPEAT:END -->

<!-- SPECFORGE_ERR243_EXP209_NESTED_SOURCE_DELIMITER_SECOND_RETRY:START -->
## ERR-243 / EXP-209 — V119 第二次预交付生成仍存在另一组三引号冲突

- **现场**：第二次生成改了外层字符串定界，但 runner 内部用于 test replacement 的三引号仍与外层 source 冲突，Python 再次在生成前报 `SyntaxError`。
- **影响**：同样没有可交付 ZIP、用户执行或仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / SCRIPT_DEFECT`。
- **旧防护失效原因**：只调整外层 delimiter，没有消除 runner 中“源码包含源码”的设计。
- **EXP-209**：V119 改为数据驱动 patch：全部 TypeScript helper / replacement / extra test 存入 `payload.json`，runner 只执行结构化替换；runner source 内不再存在嵌套多行源码字符串。
<!-- SPECFORGE_ERR243_EXP209_NESTED_SOURCE_DELIMITER_SECOND_RETRY:END -->

<!-- SPECFORGE_ERR244_EXP210_UNIQUE_MARKER_SELF_DUPLICATION:START -->
## ERR-244 / EXP-210 — V119 pre-delivery 模拟发现 prompt marker 契约自我复制

- **现场**：exact `df7cd285...` authority 模拟 patch 后，完整 prompt START/END comment marker 计数大于 1。
- **根因**：Envelope 规则正文原样复制了完整 marker，同时契约又要求完整 marker 在 authority 中唯一。
- **影响**：失败发生在 ZIP 构建前 snapshot simulation；没有交付包、用户执行或仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / CONTRACT_SELF_REFERENCE_DEFECT`。
- **EXP-210**：完整唯一 marker 字面值只允许出现在真实结构边界；规则正文只引用 marker 逻辑 ID；交付前验证最终 authority exact marker count。
<!-- SPECFORGE_ERR244_EXP210_UNIQUE_MARKER_SELF_DUPLICATION:END -->

<!-- SPECFORGE_ERR245_EXP211_PAYLOAD_PATCH_PRECONDITION_MISMATCH:START -->
## ERR-245 / EXP-211 — V119 payload 修正脚本对旧文本形态做了错误前提假设

- **现场**：用于修正 Envelope marker 文本的预处理脚本因 `assert old in payload` 失败退出。
- **根因**：脚本使用了与实际 V118 payload 不完全一致的自然语言旧片段作为阻断锚点。
- **影响**：没有生成新 artifact、没有仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / PATCH_PRECONDITION_DEFECT`。
- **EXP-211**：修改生成 payload 前先读取实际当前内容；结构 patch 使用稳定 section/marker 范围，不凭记忆构造旧自然语言全文。
<!-- SPECFORGE_ERR245_EXP211_PAYLOAD_PATCH_PRECONDITION_MISMATCH:END -->

<!-- SPECFORGE_ERR246_EXP212_ASSISTANT_SPREADSHEET_WARMUP_STDERR:START -->
## ERR-246 / EXP-212 — 助手侧 Python 启动附带 spreadsheet runtime warmup stderr

- **现场**：V119 package verifier 本体返回 `returncode=0` 且完整输出 `VALIDATOR_ACCEPTED=YES / ARTIFACT_ACCEPTED=YES`；同一次 Python 进程启动 stderr 额外出现 `Spreadsheet runtime warmup failed during python startup`，底层错误为 `hydrateCrdtFromProto requires an empty collaborative document`。
- **影响**：该错误来自助手执行环境的通用 artifact/spreadsheet warmup，不属于 SpecForge runner/verifier 逻辑；V119 verifier 主流程没有失败，ZIP/hash/compile 验收结果不受影响。
- **分类**：`ENVIRONMENT_FAILURE / NON_BLOCKING_TOOL_WARMUP`。
- **EXP-212**：助手侧工具运行时附加 warmup stderr 必须与目标 verifier 的 exit code、stdout contract 和 artifact evidence 分离判断；只记录为环境异常，不伪装成 SpecForge 产品缺陷；若目标进程 exit code 非零或验证字段不完整，则仍按正式失败处理。
<!-- SPECFORGE_ERR246_EXP212_ASSISTANT_SPREADSHEET_WARMUP_STDERR:END -->

<!-- SPECFORGE_ERR247_EXP213_BOOTSTRAP_EXECUTION_ORDER_GAP:START -->
## ERR-247 / EXP-213 — V119 规则完整，但真实新会话仍先读 handoff、后补 Bootstrap Fail Closed

- **现场**：V119 成功后进行真实全新会话启动验证。新会话最终正确识别 `git ls-remote` DNS 失败、拒绝 branch HTML/raw-main 作为 live HEAD、承认自己在 Bootstrap 接受前已经读取 `current-handoff`，并正确输出 `AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=FAIL`、`AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=NO`、没有发布 evidence ZIP。
- **缺陷**：该回复没有先输出 `LAST_EXECUTION_RECEIPT_*` 审计字段，也没有输出完整 Bootstrap Envelope Self Check；更关键的是，它在识别新约束之前已经读取 handoff。
- **Receipt 事实边界**：回复声称用户未携带上一轮完整 receipt；当前对话未包含用户实际粘贴到新会话的完整启动 prompt，因此该声称本身不作为本 ERR 的根因证据。
- **分类**：`GOVERNANCE_FAILURE / PREAUTHORITY_EXECUTION_ORDER_GAP`。
- **根因**：V119 固定 prompt 已列出 Receipt Audit、live-ref、Failure/Success 和 Envelope Self Check，但没有把“Receipt Audit 必须成为任何工具调用前的第一状态”和“允许工具类别随阶段切换”定义为结构化状态机；模型仍可以先读取，再在后面补做失败判断。
- **EXP-213**：
  1. Bootstrap 增加 `RECEIPT_AUDIT → PRETOOL_GUARD → LIVE_REF_ONLY → EXACT_AUTHORITY_ONLY → FAILURE/SUCCESS → SELF_CHECK → RECOVERY` 固定状态机；
  2. `MISSING_REQUIRED/PRESENT_INVALID` 在工具调用前直接停止，不执行 live ref；
  3. 每个阶段输出 `BOOTSTRAP_ALLOWED_TOOL_CLASS`；
  4. 任一越权读取永久使本回合 `BOOTSTRAP_EXECUTION_ORDER_AUDIT=FAIL`，禁止用后补字段恢复；
  5. 每个 Bootstrap 回合结束必须输出完整 Envelope Self Check；
  6. consumer test 同时验证字段存在与文本顺序：Receipt/Pre-tool Guard 必须位于 live-ref 和 Recovery 之前。
<!-- SPECFORGE_ERR247_EXP213_BOOTSTRAP_EXECUTION_ORDER_GAP:END -->

<!-- SPECFORGE_ERR248_EXP214_STALE_BOOTSTRAP_PROMPT_WORDING_ASSERTION:START -->
## ERR-248 / EXP-214 — V120 新顺序状态机通过，但旧 prompt 自然语言断言阻断发布

- **现场**：V120 在 commit/push 前执行 `stage-execution-authority-contract.test.ts`，9 个测试中 8 个通过，仅 `enforces live-ref-first authority bootstrap before new-session recovery` 失败；`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **一手证据**：旧测试仍要求固定 prompt 字面 `AUTHORITY_BOOTSTRAP_ACCEPTED!=YES`；V120 prompt 已改为结构状态 `AUTHORITY_BOOTSTRAP_ACCEPTED=YES|NO`，并以 `BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ` → `BOOTSTRAP_EXECUTION_PHASE=RECOVERY` 表达同一且更严格的约束。
- **分类**：`VALIDATION_HARNESS_DEFECT / STALE_NATURAL_LANGUAGE_ASSERTION`。
- **权威冲突**：`GOV-STAGE-VALIDATOR-001` 禁止自然语言原句、格式细节作为 blocking truth；`GOV-STAGE-BOOTSTRAP-ENVELOPE-001` 要求使用 Rule ID、schema 字段、parser 或结构 marker。
- **EXP-214**：删除固定措辞 blocking assertion；改验 `AUTHORITY_BOOTSTRAP_ACCEPTED=YES|NO`、`AUTHORITY_EXACT_READ`、`RECOVERY` 结构状态及顺序；保持 V120 已通过的 ordered execution 回归不变。
<!-- SPECFORGE_ERR248_EXP214_STALE_BOOTSTRAP_PROMPT_WORDING_ASSERTION:END -->

<!-- SPECFORGE_ERR249_EXP215_V121_BUILDER_PARSE_FAILURE:START -->
## ERR-249 / EXP-215 — V121 首次交付构造器语法失败，未形成可交付产物

- **现场**：第一次生成 V121 时，交付构造 Python 在解析阶段报 `SyntaxError: '(' was never closed`。
- **影响**：工具明确返回代码未成功执行；没有 V121 ZIP、没有用户执行、没有 SpecForge 仓库副作用。
- **分类**：`VALIDATION_HARNESS_DEFECT / SCRIPT_DEFECT`。
- **EXP-215**：复杂 runner 改写不再直接嵌套于可见执行块；先生成独立 builder 文件并执行 `py_compile`，再构建 ZIP；只有 builder、runner、validator 均解析通过和 ZIP reopen/hash 通过后才发布。
<!-- SPECFORGE_ERR249_EXP215_V121_BUILDER_PARSE_FAILURE:END -->

<!-- SPECFORGE_ERR250_EXP216_RECEIPT_INTERNAL_DELIVERY_REFERENCE_DRIFT:START -->
## ERR-250 / EXP-216 — V121 顶层 Delivery Identity 正确，但 NEXT_LEGAL_ACTION 残留 V120

- **现场**：V121 标准成功回执中 `PACKAGE_NAME / DELIVERY_ID / RUNNER_ID / VALIDATOR_ID / RECEIPT_EMITTER_ID / IDENTITY_BINDING_AUDIT` 均为 V121 且 PASS，但 `NEXT_LEGAL_ACTION=RUN_FRESH_SESSION_WITH_COMPLETE_V120_RECEIPT_BEFORE_WI0004_USER_DECISION`。
- **提交事实**：V121 代码、结构回归、TypeScript、daemon-core build、workspace build、`git diff --check`、commit/push 与 authority sync 均成功；远程最后确认提交为 `6d8fa7dfd2da3c6c1a23702b26c0f85c65710832`；WI-0004 仍为 `approval_required`，未执行生命周期动作。
- **分类**：`VALIDATION_HARNESS_DEFECT / EVIDENCE_IDENTITY_DEFECT / RECEIPT_INTERNAL_REFERENCE_DRIFT`。
- **根因**：`GOV-STAGE-DELIVERY-IDENTITY-001` 只绑定了 package、runner、validator、receipt emitter 的顶层身份；V121 runner 的 `NEXT_LEGAL_ACTION` 仍是从上一版本复制的独立硬编码字符串，现有 verifier 未扫描标准回执内部当前交付控制字段。
- **EXP-216**：
  1. manifest 增加 `receipt_current_delivery_reference_fields`；
  2. SUCCESS receipt 输出前扫描这些字段中的 `V[0-9]+` token，必须全部等于当前 `DELIVERY_ID`；
  3. 输出 `DELIVERY_INTERNAL_REFERENCE_AUDIT` 与 mismatch 明细；
  4. `NEXT_LEGAL_ACTION` 等当前控制字段中的版本号必须从 `identity.delivery_id` 派生；
  5. package verifier 独立验证 runner 构造来源并拒绝旧版本硬编码；
  6. 由于 Delivery Identity 属于 pre-authority contract inventory，本次同步更新 Bootstrap Envelope、固定新会话 prompt 和 consumer regression。
<!-- SPECFORGE_ERR250_EXP216_RECEIPT_INTERNAL_DELIVERY_REFERENCE_DRIFT:END -->

<!-- SPECFORGE_ERR251_EXP217_COMPOSITE_MULTILINE_ANCHOR_MISMATCH:START -->
## ERR-251 / EXP-217 — V122 在 Envelope Artifact 子段使用复合多行锚点，实际作用域匹配数为 0

- **现场**：V122 在 `BASELINE` 后执行 `PATCH_ENVELOPE_ARTIFACT` 失败，标准回执为 `ERROR=scoped anchor count=0`；`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **一手代码事实**：V122 patcher 在 `GOV-STAGE-BOOTSTRAP-ENVELOPE-001` 到 `GOV-STAGE-RECOVERY-ACCEPT-001` 的大作用域中，以 `IDENTITY_BINDING_AUDIT=PASS|FAIL` 与后续 `STRUCTURE_VALIDATION=PASS|FAIL` 的复合连续多行文本作为唯一阻断锚点。
- **分类**：`VALIDATION_HARNESS_DEFECT / STRUCTURAL_PATCH_ANCHOR_DEFECT`。
- **根因**：patcher 虽限定了大 Rule 作用域，但仍把多个独立 schema 字段的排版连续性当作隐式契约；实际 authority 没有满足该 byte-contiguous 假设，因此结构合法但 patcher 误判。
- **EXP-217**：
  1. Bootstrap Envelope 修改必须继续缩小到 `### C / D / E` 等稳定子段；
  2. Artifact / receipt 字段按单独 schema 行插入，不再使用跨字段复合多行 literal；
  3. Prompt 修改使用 prompt START/END marker，再缩小到 Artifact Acceptance 或 evidence runner receipt 子段；
  4. 每个子段先验证目标字段行唯一，再执行插入；
  5. 验收必须检查 authority、prompt、handoff、consumer test 四个消费者全部出现新字段；
  6. commit 前运行完整 `stage-execution-authority-contract.test.ts`，任一失败继续 Fail Closed。
<!-- SPECFORGE_ERR251_EXP217_COMPOSITE_MULTILINE_ANCHOR_MISMATCH:END -->

<!-- SPECFORGE_ERR252_EXP218_AUTHORITY_DOCUMENT_STRUCTURE_AMBIGUITY:START -->
## ERR-252 / EXP-218 — 权威方案章节编号混乱、治理域混排与重复定义

- **用户现场**：唯一权威文件同时使用 `〇 / 0.x / 一～四十二 / Phase 1～12 / A～R` 多套编号；同一层级同时存在 `#`、`##`、`###`，无法稳定判断章节边界。
- **一手证据**：产品架构、SpecForge 自身开发协议、跨会话 Stage/Bootstrap 协议、产品实施路线和验收场景混排在一个平面目录；Contract、首次 WI、Trace、Gate、实现到发布流程、最终原则和 Bootstrap/Receipt 模板存在重复或重叠。
- **用户授权**：2026-08-08 明确批准删除/合并 D1-D8 重复副本。
- **分类**：`GOVERNANCE_FAILURE / AUTHORITY_INFORMATION_ARCHITECTURE_DEFECT`。
- **EXP-218**：
  1. 权威文件固定为 `1-12` 正文章节 + `附录 A/B`；
  2. 章节按业务流程组织，不按历史补丁产生顺序组织；
  3. 稳定 Rule ID 是机器契约，章节号只用于阅读导航；
  4. 同一规则只保留一个 canonical 定义位置；只有 pre-authority 固定 prompt 允许必要镜像；
  5. Contract、Trace、Gate、Implementation→Release 必须按连续业务链编排；
  6. 所有旧一级章节必须有迁移映射或用户批准删除依据；
  7. 重构前后稳定 Rule ID 定义集合必须完全一致；
  8. 测试消费者必须依赖 Rule ID / marker / schema，不得依赖旧章节号；
  9. 后续新增章节必须进入现有 1-12 信息架构，禁止恢复中文大写序号、0.x 平行体系或未编号 Phase/A-R 一级结构。
<!-- SPECFORGE_ERR252_EXP218_AUTHORITY_DOCUMENT_STRUCTURE_AMBIGUITY:END -->

<!-- SPECFORGE_ERR253_EXP219_RULE_REFERENCE_MISCLASSIFIED_AS_DEFINITION:START -->
## ERR-253 / EXP-219 — V124 把 Rule ID 检查清单引用误判成第二个正式定义

- **现场**：V124 用户执行在 `RULE_ID_BASELINE` Fail Closed，`ERROR=duplicate rule definitions before restructure=['CON-PROM-001']`；`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **一手事实**：`CON-PROM-001` 的正式定义是行首 `**CON-PROM-001：** Module Contract ...`；后续 `5. **CON-PROM-001：** 必须检查 ...` 是治理检查清单中的规则引用，不是第二个定义。
- **分类**：`VALIDATION_HARNESS_DEFECT / RULE_ROLE_CLASSIFICATION_DEFECT`。
- **EXP-219**：
  1. Rule Definition 只认行首 canonical 声明 `^**RULE-ID：**`；
  2. 编号列表、正文、代码块和索引中的 Rule ID 只能视为 Reference；
  3. Rule Definition 集合审计与附录 Rule ID 索引必须共用同一语法分类；
  4. 重构前后比较 canonical Definition 集合，不比较所有文本引用次数。
<!-- SPECFORGE_ERR253_EXP219_RULE_REFERENCE_MISCLASSIFIED_AS_DEFINITION:END -->

<!-- SPECFORGE_ERR254_EXP220_PROMPT_MARKER_SPLIT_BOUNDARY_DEFECT:START -->
## ERR-254 / EXP-220 — 旧 0.10 标题拆分把 Prompt START/END marker 分到两个相邻片段

- **发现方式**：V124 失败后对 exact `87458a35...` authority 进行无副作用离线完整重构模拟。
- **事实**：`SPECFORGE_NEW_SESSION_PROMPT:START` 位于旧 `### 0.10` 标题之前，`END` 位于其正文之后；按 0.x 标题切分会把 START 留在 0.9 片段、END 留在 0.10 片段。若直接重建附录 A 并再加 marker，会产生重复 marker。
- **分类**：`VALIDATION_HARNESS_DEFECT / STRUCTURAL_BOUNDARY_DEFECT`。
- **EXP-220**：首次迁移时先从相邻切片中剥离旧 START/END，再用一个 canonical 附录 A 重建唯一 marker pair；验收必须 `START=1 && END=1`。
<!-- SPECFORGE_ERR254_EXP220_PROMPT_MARKER_SPLIT_BOUNDARY_DEFECT:END -->

<!-- SPECFORGE_ERR255_EXP221_MARKER_REFERENCE_MISCLASSIFIED_AS_CANONICAL_MARKER:START -->
## ERR-255 / EXP-221 — 唯一权威 marker 的文本引用被误计为 canonical marker

- **发现方式**：V124 失败后 exact authority 离线模拟。
- **事实**：唯一权威句在旧文件中存在状态栏副本、canonical blockquote 和 Bootstrap 规则中的反引号引用；全文裸字符串计数不能区分 canonical marker 与说明性引用。
- **分类**：`VALIDATION_HARNESS_DEFECT / MARKER_ROLE_CLASSIFICATION_DEFECT`。
- **EXP-221**：唯一权威 marker 验收只认正式 canonical marker 行；状态栏重复副本按已批准去重合并，规则中的引用保留为 Reference，不进入 canonical marker 计数。
<!-- SPECFORGE_ERR255_EXP221_MARKER_REFERENCE_MISCLASSIFIED_AS_CANONICAL_MARKER:END -->

<!-- SPECFORGE_ERR256_EXP222_D7_CANONICAL_SCHEMA_TEST_CONSUMER_DRIFT:START -->
## ERR-256 / EXP-222 — D7 已把 Bootstrap Failure schema 收敛到 FAIL-TEMPLATE，但旧测试仍绑定 FAIL-001

- **现场**：V125 用户实际执行在 `STRUCTURAL_REGRESSION_TEST` Fail Closed；11 个测试中 10 个通过，仅 `enforces complete fail-closed bootstrap output and accepted live-ref evidence artifact` 失败；`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **一手证据**：D7 重构后 `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001` 明确只保留失败语义、访问边界和接受条件，并引用 `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001` 作为唯一 canonical schema；旧测试仍要求 `AUTHORITY_BOOTSTRAP_FAILURE_REASON=`、Artifact schema 等字段直接存在于 `FAIL-001`。
- **分类**：`VALIDATION_HARNESS_DEFECT / CANONICAL_SOURCE_CONSUMER_DRIFT`。
- **根因**：D7 authority producer 已完成 canonical source 合并，但测试 consumer 没有同步从旧重复副本迁移到 canonical template。
- **EXP-222**：
  1. `FAIL-001` 只验证失败语义、访问边界、Fail Closed 与对 canonical template 的引用；
  2. 失败机器字段、Artifact Acceptance 字段统一从 `FAIL-TEMPLATE-001` 验证；
  3. 附录 A 继续验证 pre-authority 必需镜像；
  4. 禁止为通过旧测试重新复制已经批准删除的 schema；
  5. producer 去重时必须同步审计所有 consumer 的 canonical source 指向。
<!-- SPECFORGE_ERR256_EXP222_D7_CANONICAL_SCHEMA_TEST_CONSUMER_DRIFT:END -->

<!-- SPECFORGE_ERR257_EXP223_EXACT_TEST_BODY_PATCH_ANCHOR_DEFECT:START -->
## ERR-257 / EXP-223 — V126 用完整测试体 literal 作为 patch anchor，真实源码匹配数为 0

- **现场**：V126 用户执行在 `PATCH_TEST` Fail Closed，标准回执为 `ERROR=D7 fail-closed consumer count=0`；`COMMIT_SHA=NONE`、`PUSH_SUCCEEDED=NO`。
- **一手证据**：当前测试消费者由命名测试 `enforces complete fail-closed bootstrap output and accepted live-ref evidence artifact` 承载；V126 patcher 仍要求其内部一整段多行 TypeScript 与生成器内 literal 完全一致。
- **分类**：`VALIDATION_HARNESS_DEFECT / EXACT_TEST_BODY_PATCH_ANCHOR_DEFECT`。
- **EXP-223**：
  1. 测试迁移以稳定测试名称作为作用域边界，不以完整测试体 literal 作为 patch anchor；
  2. 在命名测试作用域内整体替换 consumer contract，避免空行、缩进、字段排序造成假失败；
  3. D7 的 `FAIL-001 / FAIL-TEMPLATE / Appendix A` 三方职责继续保持，不回退去重；
  4. 同步把 Delivery Internal Reference consumer 改为命名测试作用域替换，避免下一处相同缺陷；
  5. patch 后必须结构检查目标测试名各恰好一个，并运行完整 authority regression。
<!-- SPECFORGE_ERR257_EXP223_EXACT_TEST_BODY_PATCH_ANCHOR_DEFECT:END -->

<!-- SPECFORGE_ERR258_EXP224_FINAL_RENDERED_RECEIPT_REFERENCE_FALSE_PASS:START -->
## ERR-258 / EXP-224 — V127 SUCCESS 回执内部版本审计报告 PASS，但最终 NEXT_STAGE 仍引用 V124

- **现场**：V127 已成功提交并推送 authority 结构重构到 `2b82912925c62049ed8f968946fc284b94adfcd4`，测试、TypeScript、daemon-core build、workspace build、`git diff --check` 全部通过；但标准 SUCCESS 回执同时输出：
  - `DELIVERY_ID=V127`
  - `DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS`
  - `DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE`
  - `NEXT_STAGE=NEW_SESSION_V124_AUTHORITY_STRUCTURE_AND_BOOTSTRAP_E2E_VALIDATION`
- **权威冲突**：`GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE` 已明确要求 `CURRENT_STAGE`、`ACTION_NAME`、`NEXT_STAGE`、`NEXT_LEGAL_ACTION` 中任何 `V[0-9]+` token 必须等于当前 `DELIVERY_ID`；SUCCESS 前必须检查最终用户可见回执值。
- **分类**：`VALIDATION_HARNESS_DEFECT / EVIDENCE_IDENTITY_DEFECT / FINAL_RENDERED_RECEIPT_AUDIT_FALSE_PASS`。
- **影响**：
  1. V127 的仓库提交和结构重构事实有效；
  2. V127 的 SUCCESS receipt 不能作为完整 Delivery Internal Reference Acceptance 证据；
  3. WI-0004 状态未变化，仍停在 `approval_required`，不得因此进入 User Decision。
- **根因**：V127 runner 的 `NEXT_STAGE` 仍从旧 runner 复制静态 `V124` 文本；同时 receipt emitter 直接打印预设的 `DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS`，没有在最终回执字典生成后对用户可见 current-delivery 控制字段重新扫描。
- **EXP-224**：
  1. receipt emitter 必须先构造最终回执键值，再执行内部引用审计，最后才允许打印 `RESULT=SUCCESS`；
  2. `receipt_current_delivery_reference_fields` 至少覆盖 `CURRENT_STAGE`、`ACTION_NAME`、`NEXT_STAGE`、`NEXT_LEGAL_ACTION`；
  3. 对上述字段扫描 `VERSION_TOKEN_PATTERN=V[0-9]+`，出现任何不等于当前 `DELIVERY_ID` 的 token 必须 Fail Closed；
  4. `NEXT_STAGE`、`NEXT_LEGAL_ACTION` 中当前交付版本必须从 `identity.delivery_id` 动态派生，禁止复制旧 runner 常量；
  5. package validator 必须用正例和旧版本负例直接执行同一个 internal-reference audit 函数，证明审计器能拒绝 stale token；
  6. authority consumer regression 必须覆盖四个 current-delivery 字段，而不是只检查 `NEXT_LEGAL_ACTION`。
<!-- SPECFORGE_ERR258_EXP224_FINAL_RENDERED_RECEIPT_REFERENCE_FALSE_PASS:END -->

<!-- SPECFORGE_ERR259_EXP225_HISTORICAL_DELIVERY_TOKEN_IN_CURRENT_CONTROL_FIELD:START -->
## ERR-259 / EXP-225 — 只读对账回执把历史 Delivery ID 写入当前控制字段

- **现场**：V129 只读 Git 对账成功确认 `REMOTE_MAIN_HEAD=LOCAL_HEAD=42b5c748f2be2bbff140edfcc3fa164c2c64ba96`、父提交为 `2b82912925c62049ed8f968946fc284b94adfcd4`、HEAD 正好修改 3 个 V128 治理文件、worktree clean、authority 最后修改 commit 仍为 `2b829129...`；但 V129 回执自身 `DELIVERY_INTERNAL_REFERENCE_AUDIT=FAIL`。
- **失败字段**：
  - `ACTION_NAME=RECONCILE_V128_POST_PUSH_STATE_V129`
  - `NEXT_LEGAL_ACTION=DESIGN_V129_EVIDENCE_REPAIR_AFTER_CONFIRMED_V128_COMMIT`
- **权威冲突**：`GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE` 明确规定：历史版本引用必须放 provenance/evidence 字段；`CURRENT_* / ACTION_* / NEXT_*` 等当前控制字段只允许当前 Delivery ID。
- **分类**：`VALIDATION_HARNESS_DEFECT / CURRENT_CONTROL_FIELD_PROVENANCE_LEAK`。
- **事实对账**：
  1. V128 仓库 side effect 已由 V129 只读结构化 Git 证据确认成功；
  2. V128 commit=`42b5c748f2be2bbff140edfcc3fa164c2c64ba96`；
  3. V128 authority 未修改，authority last-modifying commit=`2b82912925c62049ed8f968946fc284b94adfcd4`；
  4. V129 没有仓库写操作；
  5. V129 receipt 不能作为 Delivery Internal Reference Acceptance 成功证据。
- **EXP-225**：
  1. `CURRENT_STAGE / ACTION_NAME / NEXT_STAGE / NEXT_LEGAL_ACTION` 只描述当前交付控制流；需要版本时只能使用当前 `DELIVERY_ID`；
  2. 历史 Delivery ID 必须放 `*_EVIDENCE / *_PROVENANCE / PRIOR_* / RECONCILED_*` 等非 current-control 字段；
  3. receipt validator 正例必须证明当前控制字段只含当前 Delivery ID；
  4. receipt validator 负例必须证明历史 token 即使语义上用于“描述被对账对象”也会被拒绝；
  5. current-handoff 必须分别记录 current remote HEAD、authority file last-modifying commit 和历史 delivery evidence，禁止把三者混成一个 baseline。
<!-- SPECFORGE_ERR259_EXP225_HISTORICAL_DELIVERY_TOKEN_IN_CURRENT_CONTROL_FIELD:END -->

<!-- SPECFORGE_ERR260_EXP226_AUTHORITY_HEAD_COMMIT_CONFLATION:START -->
## ERR-260 / EXP-226 — V130 SUCCESS receipt 把 AUTHORITY_HEAD 与 AUTHORITY_COMMIT 混写

- **现场**：V130 成功提交并推送到 `f1de17be55cc96358df9f9ac8c193bb657ba16dc`，worktree clean，目标测试、TypeScript、daemon-core build、workspace build、`git diff --check` 全部通过；但其标准回执同时输出：
  - `REMOTE_WORK_HEAD_AFTER=f1de17be55cc96358df9f9ac8c193bb657ba16dc`
  - `AUTHORITY_HEAD=2b82912925c62049ed8f968946fc284b94adfcd4`
  - `AUTHORITY_SYNC_CHECK=PASS_AUTHORITY_UNCHANGED_LAST_MODIFYING_COMMIT_2b829129...`
- **权威冲突**：`GOV-STAGE-AUTHORITY-BOOTSTRAP-001` 明确规定：
  - `AUTHORITY_HEAD` = authority branch 当前 ref；
  - `AUTHORITY_COMMIT` = authority 文件最近一次变更 commit；
  - 二者只有在结构化 Git / commit-path 证据证明相同时才允许相等。
- **分类**：`VALIDATION_HARNESS_DEFECT / RECEIPT_SEMANTIC_IDENTITY_DEFECT / AUTHORITY_HEAD_COMMIT_CONFLATION`。
- **影响**：
  1. V130 仓库提交和 3 文件治理修复事实有效；
  2. V130 receipt 的 `AUTHORITY_HEAD` 字段语义错误，不能作为完整 Stage/Receipt Acceptance 证据；
  3. authority 文件本身未在 V130 修改，最近修改 commit 仍为 `2b829129...`；
  4. WI-0004 状态未变化，仍为 `approval_required`。
- **EXP-226**：
  1. SUCCESS receipt 必须同时输出 `AUTHORITY_HEAD` 与 `AUTHORITY_COMMIT`；
  2. `AUTHORITY_HEAD` 必须来自 push 后重新读取的 live authority branch ref；
  3. `AUTHORITY_COMMIT` 必须来自 `git log -1 --format=%H -- <AUTHORITY_PATH>`；
  4. 当本轮不修改 authority 文件时，允许 `AUTHORITY_HEAD != AUTHORITY_COMMIT`，且必须把这种差异视为正常、可解释事实；
  5. receipt verifier 必须使用正例验证“HEAD 新于 authority file commit”可以 PASS，并用负例拒绝把 authority file commit 填入 `AUTHORITY_HEAD`；
  6. `AUTHORITY_SYNC_CHECK` 必须明确分别说明 branch HEAD 与 authority last-modifying commit，不得用一个 `AUTHORITY_HEAD` 字段承载两个语义。
<!-- SPECFORGE_ERR260_EXP226_AUTHORITY_HEAD_COMMIT_CONFLATION:END -->

<!-- SPECFORGE_ERR261_EXP227_AUTHORITY_CONTENT_INFORMATION_ARCHITECTURE_OVERLAP:START -->
## ERR-261 / EXP-227 — 一级编号统一后，权威正文仍存在协议域混排、生命周期多副本、动态历史与正式规范混写

- **现场**：V127 已把 authority 统一为 12 个正式章节 + 附录 A/B，但第二轮内容审计确认：
  1. 第 2 章的 Stage / Truth / Artifact / Validator / Delivery / Receipt / Bootstrap / Recovery 仍压在同一大节中，Rule ID 归属不清；
  2. 模式 B、3.1、9.2、Phase 11、最终完成标准存在多套不完整生命周期表达；
  3. 首页固化 2026-08-01 审计日期、旧测试数量和动态“尚未完成”状态；
  4. 第 3—9 章混入“当前代码/当前 Classification/当前 Fast Path/当前 Gate”等历史实现 baseline；
  5. 第 10 章重复定义第 3—9 章正式规则；
  6. 第 12 章用散落 PASS/BLOCK 文案重复正式规则，缺少 Rule / Evidence / Gate / State 对账。
- **用户批准**：2026-08-08 明确批准 D9-D14 删除/合并范围。
- **分类**：`GOVERNANCE_FAILURE / AUTHORITY_INFORMATION_ARCHITECTURE_QUALITY_DEFECT`。
- **D9-D14 处理**：
  - D9：动态日期、测试计数、HEAD、实施进度只进入 handoff / receipt / Git / immutable evidence；
  - D10：第 3.1 成为唯一 `Canonical Product Lifecycle`，其他章节只允许引用或描述局部阶段；
  - D11：删除未定义 `governance active=true`，以 Atomic Spec Merge + required Gate 成功作为正式 Spec 生效条件；
  - D12：第 3—9 章删除历史“当前实现缺什么”叙述，只保留最终规范；历史原因进入本 ledger；
  - D13：Phase 1—12 统一为 `Goal / Canonical References / Required Outputs / Exit Criteria / Required Tests`；
  - D14：第 12 章统一为 Acceptance Matrix，不再重新定义正式规则。
- **EXP-227**：
  1. authority 只保存稳定规范，不保存会随开发推进变化的运行事实；
  2. 一个完整产品生命周期只能有一个 canonical source；
  3. 协议域必须按 Authority / Fail Closed / Continuity / Stage / Truth+Artifact+Validator / Delivery / Bootstrap / Recovery 分开；
  4. Phase 只引用正式规则，不建立规则副本；
  5. Acceptance 只实例化正式规则，不建立第二套 PASS/BLOCK 语义；
  6. Implementation Mapping 不是 write scope；
  7. 重构前后 canonical Rule Definition 集合必须完全一致；
  8. 固定新会话 Prompt 若 pre-authority 契约未变化必须字节保持不变；
  9. 正文（排除代码块和固定 Prompt 镜像）不得出现完全重复的长段落；
  10. 删除/合并必须能追溯到用户批准范围。
<!-- SPECFORGE_ERR261_EXP227_AUTHORITY_CONTENT_INFORMATION_ARCHITECTURE_OVERLAP:END -->

<!-- SPECFORGE_ERR262_EXP228_DATA_MODEL_NOT_APPLICABLE_UNDEFINED:START -->
## ERR-262 / EXP-228 — Project Data Model 的“不适用”没有正式表示方式

- **现场**：旧 authority 一方面规定 `.specforge/project/data_model.md` 是唯一正式 Project Data Model，另一方面首次项目流程允许“Data Model 或有事实依据的不适用声明”，但没有定义该声明存放位置、结构、证据或状态转换。
- **分类**：`GOVERNANCE_FAILURE / PROJECT_DATA_MODEL_CONTRACT_AMBIGUITY`。
- **修订**：新项目始终存在 `data_model.md`；有数据模型时 `STATUS=ACTIVE`，确实不适用时 `STATUS=NOT_APPLICABLE + REASON + EVIDENCE`。不得用文件缺失表达不适用；后续出现项目级数据语义时必须在同一正式 WI 中转为 `ACTIVE` 并产生正式 Candidate。
- **EXP-228**：治理对象“不适用”必须有机器可读状态和证据，不能依赖文件缺失或自然语言旁注；NOT_APPLICABLE 不能绕过 Impact / Gate。
<!-- SPECFORGE_ERR262_EXP228_DATA_MODEL_NOT_APPLICABLE_UNDEFINED:END -->

<!-- SPECFORGE_ERR263_EXP229_MERGE_TERM_AMBIGUITY:START -->
## ERR-263 / EXP-229 — `Merge / 原子 Merge / Spec Merge / Git Merge` 混用导致生命周期语义歧义

- **现场**：旧 authority 在不同章节使用 `Merge`、`原子 Merge`、`Spec Merge`、`Git Merge`，其中前几种实际表示 Candidate/Prospective Spec 生效，最后一种表示 Git 分支合并。
- **分类**：`GOVERNANCE_FAILURE / LIFECYCLE_TERMINOLOGY_AMBIGUITY`。
- **修订**：
  - `Atomic Spec Merge` = Candidate / Prospective Spec 原子生效为正式 Project Spec；
  - `Git Merge` = 已通过 Close Gate 的工作分支合入目标 Git 分支。
- **EXP-229**：正式生命周期禁止用裸 `Merge` 同时承载 Spec 生效和 Git 合并两种语义；规范、Phase 和 Acceptance 必须使用明确术语。
<!-- SPECFORGE_ERR263_EXP229_MERGE_TERM_AMBIGUITY:END -->

<!-- SPECFORGE_ERR264_EXP230_MULTI_CONSUMER_COUNT_ASSUMPTION:START -->
## ERR-264 / EXP-230 — 验证器把多个合法消费者误当成“必须全文件唯一”
- **日期与阶段**：2026-08-08，V133 authority final content closure。
- **分类**：`VALIDATION_DEFECT / SCRIPT_DEFECT / STRUCTURAL_SCOPE_COUNT_ASSUMPTION`。
- **现场表现**：V133 在 `PATCH_TEST` 报 `chapter11 heading consumer count=2`；同一旧标题和 D1-D14 scope 在测试文件中各有两个合法消费者。
- **已执行与未执行**：补丁准备已完成；产品 commit/push 未执行。
- **仓库变化**：失败关闭；后续只读取证证明无残留。
- **根因**：验证器未先限定到稳定结构作用域，就用全文件 `count == 1` 作为阻断条件。
- **影响**：合法的生产者—消费者闭包被误报为失败，导致重复生成修复包。
- **正确做法**：先按 Rule ID / section / test block 枚举消费者；对允许多消费者的字段验证“批准消费者集合完整”，不得用全文件唯一计数替代结构闭包。
- **新增类防护 / EXP-230**：任何“唯一性”断言必须先声明唯一性的结构作用域；同一正式字段可被多个合法消费者引用时，验证器必须验证消费者集合而不是字面出现次数。
- **自动防护**：至少包含两个合法消费者的正例、缺失消费者反例和范围外消费者反例。
- **状态**：`CLOSED`；后续 V138+ 已不再因该计数失败。
<!-- SPECFORGE_ERR264_EXP230_MULTI_CONSUMER_COUNT_ASSUMPTION:END -->

<!-- SPECFORGE_ERR265_EXP231_OUTER_CMD_CONDITIONAL_CHAIN:START -->
## ERR-265 / EXP-231 — 外层 CMD 把目录存在条件与后续启动链错误绑定
- **日期与阶段**：2026-08-08，V134-V136 / V136 首次启动链。
- **分类**：`SCRIPT_DEFECT / PROCESS_VIOLATION / CMD_CONTROL_FLOW_DEFECT`。
- **现场表现**：使用 `if exist <dir> rmdir ... && mkdir ... && tar ... && call ...`；当目录不存在时，后续创建、解压和调用被整体跳过，出现无输出或未启动。
- **已执行与未执行**：外层入口未稳定进入包内 runner；仓库写入未发生。
- **仓库变化**：无。
- **根因**：把“可选清理”写成后续必需启动链的条件分支。
- **影响**：用户无法判断包是否真正执行，并重复运行。
- **正确做法**：可选清理使用独立命令并吞掉“目录不存在”错误；`mkdir → extract → call` 必须无条件串联，入口每一步都有可观察输出。
- **新增类防护 / EXP-231**：外层 CMD 的可选清理不得控制后续必需步骤；启动链必须对“目录存在/不存在”两个初始状态做真实解析器回归。
- **自动防护**：覆盖目录不存在、目录已存在、ZIP缺失、入口缺失四种路径。
- **状态**：`CLOSED`；后续 V137-V145 使用无条件清理/创建/解压链并可观察运行。
<!-- SPECFORGE_ERR265_EXP231_OUTER_CMD_CONDITIONAL_CHAIN:END -->

<!-- SPECFORGE_ERR266_EXP232_REQUIRED_RUNNER_ARGUMENT_OMITTED:START -->
## ERR-266 / EXP-232 — 外层包装器调用内层 runner 时遗漏必需参数
- **日期与阶段**：2026-08-08，V138。
- **分类**：`SCRIPT_DEFECT / VALIDATION_DEFECT / RUNNER_ARGUMENT_CONTRACT_DEFECT`。
- **现场表现**：V138 调用 V133 runner 只传 `<SpecForgeRepo>`，漏传 `<PackageSha256>`；内层 runner 输出 Usage 并以 rc=2 退出。
- **已执行与未执行**：内层 runner 在参数校验阶段退出；产品写入、commit、push 均未执行。
- **仓库变化**：无。
- **根因**：包装器没有把被调用 runner 的 argv 契约作为正式接口做静态和行为验证。
- **影响**：包装器自身失败被误归入后续产品修复链。
- **正确做法**：从被调用入口的真实 Usage / parser 读取参数契约；封包前对最终 subprocess argv 做 AST 审计和行为模拟。
- **新增类防护 / EXP-232**：嵌套 runner 的参数数量、顺序、身份哈希必须作为接口契约；任何包装层都必须对最终 argv 做机器审计。
- **自动防护**：缺参、错序、错误 SHA、正确参数四个用例。
- **状态**：`CLOSED`；V139+ 已按 `<SpecForgeRepo> <PackageSha256>` 调用。
<!-- SPECFORGE_ERR266_EXP232_REQUIRED_RUNNER_ARGUMENT_OMITTED:END -->

<!-- SPECFORGE_ERR267_EXP233_RULE_MARKER_EXACT_LINE_PARSER:START -->
## ERR-267 / EXP-233 — Rule Section 解析器要求 Rule ID marker 独占整行
- **日期与阶段**：2026-08-08，V139。
- **分类**：`VALIDATION_DEFECT / STRUCTURAL_PARSER_DEFECT`。
- **现场表现**：新增 `ruleSection()` 使用 `line === marker`；真实 authority 的 canonical Rule ID 与正文位于同一行，导致 9 个“Rule ID 不存在”测试失败。
- **已执行与未执行**：候选内容临时写入后目标测试失败；内层 runner 回滚；commit/push 未执行。
- **仓库变化**：失败后回滚。
- **根因**：解析器根据理想化格式实现，没有用真实 authority 行结构做正例。
- **影响**：合法 Rule ID 被解析为缺失。
- **正确做法**：Rule 起点按非 fenced 行 `startsWith(canonical marker)` 识别，并使用真实 authority 样本做回归。
- **新增类防护 / EXP-233**：结构解析器必须消费真实源格式；禁止把“marker 单独一行”这类展示习惯升级为隐式 schema。
- **自动防护**：marker+正文同行、fenced fake marker、缺失 marker。
- **状态**：`CLOSED`；后续执行已不再出现 exact-line 起点失败。
<!-- SPECFORGE_ERR267_EXP233_RULE_MARKER_EXACT_LINE_PARSER:END -->

<!-- SPECFORGE_ERR268_EXP234_PROMPT_BEFORE_AFTER_EQUALITY_GUARD:START -->
## ERR-268 / EXP-234 — V133 验证器把合法固定 Prompt 原子更新误判为禁止变化
- **日期与阶段**：2026-08-08，V141。
- **分类**：`VALIDATION_DEFECT / SOURCE_TARGET_CONTRACT_CONFLATION`。
- **现场表现**：`authority_audit` 先要求 `prompt_block(before) == prompt_block(after)`，随后又校验新的 `fixed_prompt_sha256`；任何合法 Prompt 更新都会先被旧相等断言阻断。
- **已执行与未执行**：V141 在 `AUTHORITY_AUDIT` 失败；回滚确认；commit/push 未执行。
- **仓库变化**：失败后回滚。
- **根因**：把旧版本字节不变条件和目标版本正式哈希同时作为阻断真相。
- **影响**：authority 允许的 `START/END` scope 原子同步不可达。
- **正确做法**：保留目标 authority hash、目标 Prompt hash、Prompt marker 唯一性和消费者测试；删除“before 必须等于 after”的旧状态断言。
- **新增类防护 / EXP-234**：当正式契约允许受控变更时，验证器必须用目标 schema/hash 验证结果，不得同时要求源字节保持不变。
- **自动防护**：合法 Prompt 变更正例、未同步 hash 反例、marker 重复反例。
- **状态**：`CLOSED`；V143 已越过该 Authority Audit。
<!-- SPECFORGE_ERR268_EXP234_PROMPT_BEFORE_AFTER_EQUALITY_GUARD:END -->

<!-- SPECFORGE_ERR269_EXP235_PREDELIVERY_BUILDER_FAILURE_CHAIN:START -->
## ERR-269 / EXP-235 — 预交付生成器连续出现导入、语法和旧锚点失配
- **日期与阶段**：2026-08-08 至 2026-08-09，V137/V141/V142/V143/V144/V146 封包期。
- **分类**：`SCRIPT_DEFECT / VALIDATION_DEFECT / PREDELIVERY_BUILD_DEFECT`。
- **现场表现**：已确认的预交付失败包括：V137 漏导入 `sys`；V141 旧文本锚点不存在；V142 生成代码字符串语法错误；V143 版本化 control anchor 替换顺序错误；V144 payload audit 锚点与最终源文本不一致；V146 首次构建把含 Windows 反斜杠路径的新 handoff 文本直接作为 `re.sub` replacement，触发 `bad escape`。
- **已执行与未执行**：这些失败发生在最终 ZIP 接受前；对应失败构建未交付用户执行。
- **仓库变化**：无。
- **根因**：生成器继续对派生 runner / 文本做脆弱字符串变换，没有在每轮先解析最终源结构并验证 replacement 语义。
- **影响**：增加无效封包轮次，并证明“compile/静态替换成功”不足以证明交付可运行。
- **正确做法**：先读取当前最终源；优先 AST / 函数级结构修改；正则替换含任意用户文本时使用 callable replacement；最终 run.py 必须 importlib 加载并实际执行新增纯函数。
- **新增类防护 / EXP-235**：派生交付版本不得通过“复制上一版 + 多层字符串 replace”持续演化；连续失败后必须重建生成模型，并用最终源 AST/结构边界生成；`re.sub` 的动态 replacement 默认使用 callable。
- **自动防护**：最终源 AST、importlib、关键纯函数、manifest/ZIP reopen、零 pycache 全部通过后才允许发布。
- **状态**：`CLOSED`；V150 从当前 remote source facts 重新构建，不复用 V133/V14x 派生 runner 链；最终 Python AST/import、纯函数模拟、TypeScript 行为运行、manifest/hash、ZIP reopen 与零 pycache 均作为发布前硬验收。
<!-- SPECFORGE_ERR269_EXP235_PREDELIVERY_BUILDER_FAILURE_CHAIN:END -->

<!-- SPECFORGE_ERR270_EXP236_INTERNAL_SUBHEADING_FALSE_BOUNDARY:START -->
## ERR-270 / EXP-236 — Rule Section 解析器把父 Rule 内部子标题误当成结束边界
- **日期与阶段**：2026-08-08，V143。
- **分类**：`VALIDATION_DEFECT / STRUCTURAL_PARSER_BOUNDARY_DEFECT`。
- **现场表现**：目标测试 10 pass / 3 fail；Bootstrap Envelope 在内部 `2.11.x` 前被截断，Delivery Identity 在 `2.10.1` 前被截断。
- **已执行与未执行**：候选写入、目标测试执行；失败后回滚；commit/push 未执行。
- **仓库变化**：失败后回滚。
- **根因**：解析器把任意内部 Markdown 子标题当作父 Rule 边界，没有按 authority 的 Rule Section 结构定义结束条件。
- **影响**：父 Rule 的正式子契约被错误排除。
- **正确做法**：内部 `####` 标题必须保留在父 Rule；边界只由正式下一 Rule ID、正式编号结构边界或 Prompt START 等 canonical boundary 决定。
- **新增类防护 / EXP-236**：Rule parser 必须区分“父 Rule 内部导航标题”和“父 Rule 结束边界”，并使用真实 2.10/2.11 结构做正向回归。
- **自动防护**：2.10.1、2.11.1-2.11.7 均必须仍属于父 Rule。
- **状态**：`CLOSED`；V144 已使相关 3 个失败全部通过。
<!-- SPECFORGE_ERR270_EXP236_INTERNAL_SUBHEADING_FALSE_BOUNDARY:END -->

<!-- SPECFORGE_ERR271_EXP237_NUMBERED_HEADING_BOUNDARY_MISSING:START -->
## ERR-271 / EXP-237 — Rule Section 解析器遗漏真实编号章节标题边界
- **日期与阶段**：2026-08-08，V144。
- **分类**：`VALIDATION_DEFECT / STRUCTURAL_PARSER_BOUNDARY_DEFECT`。
- **现场表现**：目标测试 12 pass / 1 fail；synthetic Rule 在 fenced fake heading 后遇到真实 `### 3.1 real boundary` 时仍继续包含该标题及后文。
- **已执行与未执行**：目标测试执行；失败后 `rollback_confirmed=YES`；commit/push 未执行。
- **仓库变化**：失败后回滚，远程仍为 `main@faffc64ec2810167c0a9b1025edf2c602de811ac`。
- **根因**：V144 全量 parser 只识别“下一个 Rule ID / `### 0.x` / Prompt START”，没有从正式 authority 信息架构抽象“任意非 fenced `### <number>.<number>` 章节标题都是 Rule section 边界”。
- **影响**：Rule Section 可能跨入后续章节，导致消费者读取超出正式 Rule 作用域。
- **正确做法**：从 authority 的正式编号标题语法定义边界：非 fenced、物理单行 `### [0-9]+(\.[0-9]+)+`；内部 `####` 子标题仍保留；fenced fake heading / fake Rule ID 必须忽略。
- **新增类防护 / EXP-237**：结构 parser 的边界集合必须从正式文档语法一次性枚举，并建立正反例矩阵；禁止通过连续新增一个 if 条件追着失败修。
- **自动防护**：至少覆盖 next Rule ID、`### 0.9`、`### 3.1`、内部 `#### 2.11.7`、fenced fake heading、Prompt START。
- **状态**：`CLOSED`；V150 先把一般编号 `##` / `###` 与既有 `## 附录` 边界写入唯一权威 `RULE_SECTION_BOUNDARY_CONTRACT=V2`，再同步 consumer parser 与边界矩阵回归；内部 `####` 和 fenced fake heading 保持非边界。
<!-- SPECFORGE_ERR271_EXP237_NUMBERED_HEADING_BOUNDARY_MISSING:END -->

<!-- SPECFORGE_ERR272_EXP238_WEB_AUXILIARY_PROMOTED_TO_LIVE_HEAD:START -->
## ERR-272 / EXP-238 — GitHub 网页辅助信息曾被错误表述为当前 live main
- **日期与阶段**：2026-08-08，V144 后基线复核。
- **分类**：`EVIDENCE_DEFECT / PROCESS_VIOLATION / REMOTE_REF_TRUTH_SOURCE_DEFECT`。
- **现场表现**：GitHub 网页一度显示 `f400cda...`，被表述为“当前 main 已变化”；随后 V145 结构化 `git ls-remote` 明确证明 `refs/heads/main=faffc64ec2810167c0a9b1025edf2c602de811ac`。
- **已执行与未执行**：发现冲突后停止产品修改并执行只读 live-ref 取证；仓库写入未发生。
- **仓库变化**：无。
- **根因**：把 `WEB_AUXILIARY / commit page` 临时提升为 live branch-ref 真相，违反 Authority Bootstrap truth-source 优先级。
- **影响**：错误制造“远程谱系切换”判断并中断正常修复。
- **正确做法**：当前 branch HEAD 只能由允许的 structured live-ref source 决定；网页只作辅助，永远不能覆盖更新的 `git ls-remote`。
- **新增类防护 / EXP-238**：任何包含“当前 remote HEAD / main 已变化”的结论必须携带结构化 live-ref 证据；网页 commit/branch 页面只能标记 `WEB_AUXILIARY`。
- **自动防护**：结构化 ref 与网页冲突时必须以结构化 ref 为准并记录冲突。
- **状态**：`CLOSED`；V145 已取得单一合法 live ref。
<!-- SPECFORGE_ERR272_EXP238_WEB_AUXILIARY_PROMOTED_TO_LIVE_HEAD:END -->

<!-- SPECFORGE_ERR273_EXP239_MARKER_LITERAL_COUNT_VS_MARKDOWN_STRUCTURE:START -->
## ERR-273 / EXP-239 — Authority marker 审计曾把内联代码引用计为第二个真实 marker
- **日期与阶段**：2026-08-09，V145 后 Authority Bootstrap。
- **分类**：`VALIDATION_DEFECT / EVIDENCE_DEFECT / MARKDOWN_STRUCTURE_DEFECT`。
- **现场表现**：exact authority 中第 1.1 节存在一个 canonical blockquote marker；Bootstrap 规则正文还以内联代码引用同一字面量。曾按原始 substring count=2 误判“authority 自身违反唯一 marker”。
- **已执行与未执行**：误判后未读取 WI/immutable evidence、未修改仓库；随后按结构化 Markdown 作用域复核。
- **仓库变化**：无。
- **根因**：把“字面量出现次数”当成“结构 marker 数量”，没有区分 blockquote 正式 marker 与 inline-code 规则说明。
- **影响**：险些形成错误 Bootstrap Fail Closed 和无意义的重复 live-ref 取证。
- **正确做法**：marker validator 必须按 Markdown token / canonical section 作用域识别正式 marker；规则说明、代码示例、inline code 引用不是 marker 实例。
- **新增类防护 / EXP-239**：文档中的正式 marker、Rule ID、Schema 字段必须按结构 token 分类；原始 substring count 只能作辅助，不能单独阻断。
- **自动防护**：一个 canonical marker + 任意 inline-code 引用仍 PASS；两个 canonical marker 才 FAIL。
- **状态**：`CLOSED`；本轮 Bootstrap 已按结构作用域通过。
<!-- SPECFORGE_ERR273_EXP239_MARKER_LITERAL_COUNT_VS_MARKDOWN_STRUCTURE:END -->

<!-- SPECFORGE_ERR274_EXP240_HANDOFF_CONTRACT_FIELD_OMISSION:START -->
## ERR-274 / EXP-240 — Handoff CURRENT EXECUTION STATE 重写遗漏既有强制字段
- **日期与阶段**：2026-08-09，V146 failure-ledger backfill。
- **分类**：`CONTRACT_CONSUMER_DEFECT / DOCUMENT_REWRITE_DEFECT / REGRESSION_FAILURE`。
- **现场表现**：V146 只修改错误台账和 `current-handoff.md`，但目标测试 `keeps exactly one current execution state block in handoff` 失败；新状态块遗漏 `BOOTSTRAP_EXECUTION_ORDER_CONTRACT=`、`AUTHORITY_BOOTSTRAP_FAILURE_CONTRACT=`、`AUTHORITY_BOOTSTRAP_FAILURE_TEMPLATE_CONTRACT=`。
- **已执行与未执行**：两个文档临时写入后运行目标测试；测试失败；runner 完整回滚；commit/push 未执行。
- **仓库变化**：`ROLLBACK_CONFIRMED=YES`，本地/远程 HEAD 仍为 `faffc64ec2810167c0a9b1025edf2c602de811ac`，工作区恢复干净。
- **根因**：重写动态 handoff 状态块时使用“新最小字段集合”替换旧状态块，没有先从既有消费者测试提取完整必需字段集合，也没有做“旧字段不丢失”差分审计。
- **影响**：纯文档回填任务违反现有 handoff consumer contract，阻止错误台账闭包。
- **正确做法**：动态状态块更新必须从当前远程基线块做字段级变更；未明确废止的既有契约字段全部保留；新增字段只能追加或更新，不得通过整体最小模板覆盖。
- **新增类防护 / EXP-240**：任何 handoff/state machine block 重写前，必须建立 `BASELINE_REQUIRED_FIELDS` 与 `TARGET_REQUIRED_FIELDS`，并证明 `BASELINE_REQUIRED_FIELDS - TARGET_FIELDS = ∅`；消费者测试列出的字段集合是最低保留集合。
- **自动防护**：至少验证 CURRENT EXECUTION STATE 唯一 START/END、既有必需字段全保留、动态字段更新正确、无重复 key、EOF newline 和 `git diff --check`。
- **状态**：`CLOSED`；V147 已证明 handoff 基线必需字段全部保留，目标测试、TypeScript、daemon-core build、workspace build 和 `git diff --check` 全部通过。
<!-- SPECFORGE_ERR274_EXP240_HANDOFF_CONTRACT_FIELD_OMISSION:END -->

<!-- SPECFORGE_ERR275_EXP241_NONAUTH_REMEDIATION_CONFLICTS_AUTHORITY:START -->
## ERR-275 / EXP-241 — 非权威错误台账中的修复建议与唯一权威 Rule Section 契约冲突
- **日期与阶段**：2026-08-09，V148 后 ERR-271 重启前治理对账。
- **分类**：`CONTRACT_CONFLICT / AUTHORITY_PRECEDENCE_DEFECT / PREIMPLEMENTATION_GOVERNANCE_DEFECT`。
- **现场表现**：最新错误台账 ERR-271 / EXP-237 建议把任意非 fenced 编号 `### [0-9]+(\.[0-9]+)+` 标题作为 Rule Section 边界；但当前唯一权威 `GOV-STAGE-BOOTSTRAP-ENVELOPE-001` 的 2.11.6 明确规定边界为“下一个 Rule ID / 下一个 `### 0.*` 结构标题 / prompt START marker”。
- **已执行与未执行**：发现冲突后停止原计划的 parser/test 修改；未修改 authority、test、runtime；未执行 WI-0004 生命周期动作。
- **仓库变化**：本缺陷发现于 V148 已成功提交推送后的重新读取阶段；发现时工作区干净。
- **根因**：ERR-271 的修复建议根据 V144 synthetic test 结果形成，但形成时没有先把建议语义与唯一权威 Rule Section 正式契约逐项对账，导致非权威台账出现了比 authority 更宽的行为定义。
- **影响**：若直接按 ERR-271 修改测试解析器，会形成“测试定义新规则、authority 仍定义旧规则”的反向治理，违反 `GOV-AUTH-001`、`GOV-SCOPE-001` 和 `GOV-STAGE-VALIDATOR-001`。
- **正确做法**：Fail Closed；先登记本冲突并恢复 `UNRECORDED_FAILURES=0`，重新读取最新经验；随后单独执行 Authority + consumer 影响分析。若正式决定把边界扩展为一般编号 `###` 结构标题，必须先修订唯一权威，再原子同步 consumer test；若不修 authority，则必须撤回 ERR-271 的扩展建议。
- **新增类防护 / EXP-241**：任何错误台账、handoff、失败诊断中的“正确做法”在进入实现前，都必须与当前唯一权威 Rule ID 做 CONTRACT_RECONCILIATION；非权威材料不能直接成为新行为契约。发现冲突必须先重新前置分析，禁止以“修测试”为由跳过 authority 修订。
- **自动防护**：产品修改前输出 `AUTHORITY_RULE_TEXT / PROPOSED_REMEDIATION / CONTRACT_RECONCILIATION=PASS|CONFLICT`；CONFLICT 时允许范围只能是缺陷登记与后续重新前置分析，不允许直接修改 consumer。
- **正式决策**：采用 Authority-first 修订；唯一权威把 Rule Section 边界统一为“下一非 fenced Rule ID / 下一非 fenced 正式编号 `##` 或 `###` 标题 / 下一非 fenced `## 附录` 标题 / Prompt START”，consumer test 同提交同步；固定 prompt 与 inventory 因 pre-authority 行为字段未变化而保持字节不变。
- **状态**：`CLOSED`；V150 仅在 Authority + consumer contract 对账、边界矩阵、目标回归、TypeScript、daemon-core build、workspace build、范围审计和远程同步全部通过时才允许提交。
<!-- SPECFORGE_ERR275_EXP241_NONAUTH_REMEDIATION_CONFLICTS_AUTHORITY:END -->

<!-- SPECFORGE_ERR276_EXP242_REGEX_ESCAPE_REPRESENTATION_MISMATCH:START -->
## ERR-276 / EXP-242 — 预交付 validator 的 regex 转义表示与目标文件真实字节不一致
- **日期与阶段**：2026-08-09，V150 第一次预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / SCRIPT_DEFECT / REPRESENTATION_ESCAPE_MISMATCH`。
- **现场表现**：authority target 正确写入单反斜杠 regex schema；validator 却按双反斜杠字面匹配，产生 `authority V2 token missing` 假失败。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户发布，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：生成目标与 validator 对同一 regex schema 使用了不同宿主语言转义层。
- **正确做法**：canonical schema 使用 raw literal或解析后的语义值比较，禁止额外叠加宿主语言转义。
- **新增类防护 / EXP-242**：生成器与 validator 必须共用 canonical schema，最终 target 必须做真实文件 round-trip。
- **状态**：`CLOSED`；V150 最终构建使用 raw canonical token，并通过 target-content simulation。
<!-- SPECFORGE_ERR276_EXP242_REGEX_ESCAPE_REPRESENTATION_MISMATCH:END -->

<!-- SPECFORGE_ERR277_EXP243_NATURAL_LANGUAGE_ALIAS_ASSERTION:START -->
## ERR-277 / EXP-243 — 预交付 validator 使用改写后的自然语言别名作为 blocking assertion
- **日期与阶段**：2026-08-09，V150 第二次预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / NATURAL_LANGUAGE_ASSERTION_DEFECT / REPEATED_CLASS_EXP235`。
- **现场表现**：台账实际标题使用中文“预交付 validator…”，validator 却查找自行改写的英文别名，导致合法 ERR-276 记录被误判缺失。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户发布，未修改用户仓库。
- **仓库变化**：无。
- **根因**：validator 没有消费稳定 ERR/EXP ID 或结构 marker，而是消费了自己改写的自然语言。
- **正确做法**：台账验证只使用 ERR/EXP ID、结构 marker、机器字段和状态；自然语言只作为说明。
- **新增类防护 / EXP-243**：错误台账 consumer 必须按结构 ID 解析，禁止翻译、摘要或同义改写成为阻断条件。
- **状态**：`CLOSED`；V150 最终 validator 只检查 ERR/EXP 结构 ID 与状态。
<!-- SPECFORGE_ERR277_EXP243_NATURAL_LANGUAGE_ALIAS_ASSERTION:END -->

<!-- SPECFORGE_ERR278_EXP244_LOCAL_VARIABLE_NAME_ASSERTION:START -->
## ERR-278 / EXP-244 — 预交付 validator 把局部变量名当成正式 parser 契约
- **日期与阶段**：2026-08-09，V150 第三次预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / IMPLEMENTATION_DETAIL_ASSERTION_DEFECT / REPEATED_CLASS_EXP235`。
- **现场表现**：目标 helper 为 CRLF 兼容使用 `logicalLine.startsWith(marker)`；validator 却硬编码要求 `line.startsWith(marker)`，产生假失败。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户发布，未修改用户仓库。
- **仓库变化**：无。
- **根因**：validator 验证局部变量命名而不是正式 V2 schema 与行为结果。
- **正确做法**：validator 只验证正式 schema、边界 regex、矩阵用例和真实运行结果；局部变量名、重构细节不得成为 blocking assertion。
- **新增类防护 / EXP-244**：consumer validator 必须区分 contract token 与 implementation detail；行为等价重构不得因变量名变化失败。
- **状态**：`CLOSED`；V150 最终 validator 不检查 helper 局部变量名。
<!-- SPECFORGE_ERR278_EXP244_LOCAL_VARIABLE_NAME_ASSERTION:END -->

<!-- SPECFORGE_ERR279_EXP245_TRAILING_DOT_NUMBERED_HEADING_GAP:START -->
## ERR-279 / EXP-245 — V2 编号标题 regex 首版遗漏章号末尾句点
- **日期与阶段**：2026-08-09，V150 最终重建前结构审计。
- **分类**：`DESIGN_DEFECT / STRUCTURAL_GRAMMAR_DEFECT`。
- **现场表现**：首版候选 regex 可识别 `### 3.1`，但不能识别现有文档常见的 `## 4.`；而边界矩阵已包含 `## 4. real numbered chapter boundary`。
- **已执行与未执行**：在最终 ZIP 接受前发现；未运行用户仓库。
- **仓库变化**：无。
- **根因**：只建模点分子章节，没有建模章号后的可选终止句点。
- **正确做法**：正式编号标题 regex 使用 `^#{2,3}\s+[0-9]+(?:\.[0-9]+)*(?:\.)?\s+`，同时覆盖 `3.1` 与 `4.`。
- **新增类防护 / EXP-245**：结构 grammar 必须覆盖 authority 中真实 heading 样本，而不是只覆盖 synthetic 子章节。
- **状态**：`CLOSED`；V150 V2 schema 和矩阵包含 `## 4.` 正例。
<!-- SPECFORGE_ERR279_EXP245_TRAILING_DOT_NUMBERED_HEADING_GAP:END -->

<!-- SPECFORGE_ERR280_EXP246_APPENDIX_BOUNDARY_REGRESSION:START -->
## ERR-280 / EXP-246 — V2 首版候选边界集合遗漏既有 Appendix heading 行为
- **日期与阶段**：2026-08-09，V150 最终重建前 producer-consumer 对账。
- **分类**：`CONTRACT_REGRESSION_DEFECT / STRUCTURAL_BOUNDARY_OMISSION`。
- **现场表现**：现有 consumer helper 已把 `## 附录 ...` 作为 Rule Section 边界；V2 首版只保留 Rule ID、编号 `##/###` 与 Prompt START，会无意丢失既有 Appendix boundary。
- **已执行与未执行**：在最终 ZIP 接受前发现；未运行用户仓库。
- **仓库变化**：无。
- **根因**：新契约只围绕 ERR-271 的编号标题问题建模，没有先做旧 consumer 全行为集合的保留审计。
- **正确做法**：V2 显式加入 `NEXT_NON_FENCED_APPENDIX_HEADING_L2` 和 `RULE_SECTION_APPENDIX_HEADING_PATTERN=^##\s+附录(?:\s+|$)`。
- **新增类防护 / EXP-246**：契约升级必须验证“新增能力 + 既有能力保留”两类矩阵；修复不得静默缩小旧 consumer 已支持的合法结构边界。
- **状态**：`CLOSED`；V150 authority、helper 和矩阵均显式覆盖 Appendix boundary。
<!-- SPECFORGE_ERR280_EXP246_APPENDIX_BOUNDARY_REGRESSION:END -->

<!-- SPECFORGE_ERR281_EXP247_GENERATOR_FSTRING_BRACE_DEFECT:START -->
## ERR-281 / EXP-247 — V151 预交付生成器把 TypeScript 花括号直接嵌入 Python f-string
- **日期与阶段**：2026-08-09，V151 第一次预交付 Artifact Acceptance。
- **分类**：`SCRIPT_DEFECT / PREDELIVERY_BUILD_DEFECT / HOST_LANGUAGE_TEMPLATE_ESCAPE_DEFECT`。
- **现场表现**：生成 `patch_test.py` 时，TypeScript 片段中的 `}` 被 Python f-string 当成格式语法，构建阶段直接报 `SyntaxError: f-string: single '}' is not allowed`。
- **已执行与未执行**：错误发生在最终 ZIP 生成之前；失败构建未交付用户执行，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：跨语言代码生成把目标语言源码直接放入宿主语言 f-string，没有建立语言边界和转义策略。
- **影响**：V151 第一次构建无法形成可验收 Artifact。
- **正确做法**：跨语言模板使用独立 canonical 常量并通过 `repr`/JSON 序列化或文件模板注入；禁止把包含 `{}` 的目标语言源码直接嵌入宿主 f-string。
- **新增类防护 / EXP-247**：跨语言生成器必须对最终 Python AST、生成函数实际执行、目标 TypeScript 片段编译和 ZIP reopen 分别验收；宿主模板不得隐式解释目标语言语法。
- **自动防护**：包含 TypeScript object/block 花括号的完整回归、Python AST parse、patch function execution、TypeScript fixture compile。
- **状态**：`CLOSED`；V151 最终构建改为 canonical 常量 + `repr` 注入，并通过完整预交付验收。
<!-- SPECFORGE_ERR281_EXP247_GENERATOR_FSTRING_BRACE_DEFECT:END -->

<!-- SPECFORGE_ERR282_EXP248_PREFIX_SUBSTRING_ASSERTION_DEFECT:START -->
## ERR-282 / EXP-248 — V151 预交付 validator 把新值包含旧值前缀误判为旧值残留
- **日期与阶段**：2026-08-09，V151 第二次预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / STRUCTURAL_ASSERTION_DEFECT / PREFIX_SUBSTRING_FALSE_POSITIVE`。
- **现场表现**：D1–D19 新字段值天然以完整 D1–D14 字符串为前缀；patch validator 在正确替换后仍执行 `OLD_SCOPE in out`，因此把合法 D1–D19 误判为 D1–D14 仍残留。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户发布该构建，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：验证器把“旧完整字段值仍存在”错误实现成“旧字符片段是否为任意新值子串”，没有按字段边界验证。
- **影响**：正确的 D1–D19 consumer 更新被假失败阻断。
- **正确做法**：验证完整机器字段值或带引号/行边界的 canonical token；当新值合法扩展旧值时禁止使用裸 substring negative assertion。
- **新增类防护 / EXP-248**：凡 schema/value 存在前缀扩展关系，validator 必须使用结构边界、解析值或 exact token；不得以 `old in new` 作为残留判断。
- **自动防护**：D1–D14 → D1–D19 前缀扩展正例、旧完整字段值独立残留反例、consumer count 回归。
- **状态**：`CLOSED`；V151 最终 patch validator 改为带引号的完整 consumer token 验证，并通过 patch function 实际执行。
<!-- SPECFORGE_ERR282_EXP248_PREFIX_SUBSTRING_ASSERTION_DEFECT:END -->

<!-- SPECFORGE_ERR283_EXP249_FIX_SCRIPT_QUOTING_DEFECT:START -->
## ERR-283 / EXP-249 — V151 预交付修复脚本自身的 Python 引号转义再次失败
- **日期与阶段**：2026-08-09，V151 第三次预交付 Artifact Acceptance。
- **分类**：`SCRIPT_DEFECT / PREDELIVERY_BUILD_DEFECT / HOST_LANGUAGE_QUOTING_DEFECT`。
- **现场表现**：为修复 ERR-282 构造 Python replacement 字符串时再次叠加反斜杠和单双引号，导致修复脚本本身报 `SyntaxError: unexpected character after line continuation character`。
- **已执行与未执行**：失败发生在任何目标文件修改和最终 ZIP 生成之前；未向用户发布，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：在交互生成器中继续用嵌套转义字符串修补跨语言模板，重复触发 EXP-247 同类风险。
- **影响**：再次增加无效预交付轮次。
- **正确做法**：停止叠加转义；使用独立脚本文件和 triple-quoted exact block 修改，先 `ast.parse` 再执行；最终仍需 patch function 行为模拟和 TypeScript fixture compile。
- **新增类防护 / EXP-249**：对修复生成器本身也执行“源文件落盘 → AST parse → 执行”顺序；不得在尚未 parse 的交互表达式中构造复杂跨语言 quoting。
- **自动防护**：最终 `patch_test.py` AST、实际 patch function、最终 TS fixture、manifest/ZIP reopen 全部通过。
- **状态**：`CLOSED`；V151 最终构建改用独立 Python 文件进行结构化修改，并通过全部预交付验收。
<!-- SPECFORGE_ERR283_EXP249_FIX_SCRIPT_QUOTING_DEFECT:END -->

<!-- SPECFORGE_ERR284_EXP250_POST_INSERTION_CONSUMER_COUNT_DEFECT:START -->
## ERR-284 / EXP-250 — V151 验证器在新增回归消费者后仍使用修改前消费者数量
- **日期与阶段**：2026-08-09，V151 第三轮预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / CONSUMER_COUNT_PHASE_DEFECT / STRUCTURAL_ASSERTION_DEFECT`。
- **现场表现**：两个旧 D1-D14 consumer 正确替换为 D1-D19 后，V151 又新增一个 D15-D19 source-bound 回归测试；该测试本身也是新的合法 consumer。验证器却在插入新测试后仍要求全文件 `NEW_SCOPE` 恰好出现 2 次，因此把第 3 个合法 consumer 误判为失败；Chapter 11 新标题和 Post-Spec-Merge 新术语存在同类风险。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户交付，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：验证器把“旧消费者替换完成”的阶段性计数与“最终文件全部消费者”的计数混为一体，没有区分 replacement validation 与 new regression consumer insertion。
- **影响**：正确的 producer/consumer 增量被全文件固定计数假失败阻断。
- **正确做法**：先在插入新回归测试之前验证既有消费者的替换数量和旧 token 清除；随后插入新回归测试，只验证该测试结构 marker 唯一，不再用修改前计数限制最终消费者总数。
- **新增类防护 / EXP-250**：consumer-count validator 必须声明计数所处阶段和结构作用域；新增合法 consumer 后不得继续沿用变更前的全文件 cardinality。
- **自动防护**：两个旧 consumer → 两个新 consumer的 replacement 阶段 PASS；再新增一个回归 consumer 后最终总数可为 3 且仍 PASS；旧 consumer 独立残留必须 FAIL。
- **状态**：`CLOSED`；V151 最终 validator 改为“先替换验收、后插入测试”，并通过 patch function 实际执行。
<!-- SPECFORGE_ERR284_EXP250_POST_INSERTION_CONSUMER_COUNT_DEFECT:END -->


<!-- SPECFORGE_ERR285_EXP251_NEGATIVE_ASSERTION_TOKEN_FALSE_POSITIVE:START -->
## ERR-285 / EXP-251 — V151 后验验收把回归测试中的旧 token 负向断言误判为旧消费者残留
- **日期与阶段**：2026-08-09，V151 第四轮预交付 Artifact Acceptance。
- **分类**：`VALIDATION_DEFECT / NEGATIVE_ASSERTION_CLASSIFICATION_DEFECT / STRUCTURAL_CONSUMER_SCOPE_DEFECT`。
- **现场表现**：新增 D15-D19 回归测试必须显式写出 `expect(authority).not.toContain('## 11. 实施影响范围')` 和 `expect(authority).not.toContain('Post-Merge Gate')`；独立验收与 packaged validator 却用“最终测试文件不得出现旧 token”判断，因而把合法负向断言误判为旧 consumer 残留。
- **已执行与未执行**：失败发生在最终 ZIP 接受前；未向用户交付，未读取或修改用户 SpecForge 仓库。
- **仓库变化**：无。
- **根因**：validator 只按 token 字面存在性分类 consumer，没有区分“生产/正向消费旧语义”和“回归测试明确拒绝旧语义”的负向 assertion。
- **影响**：用于防止旧语义回归的正确测试反而被验收器阻断。
- **正确做法**：旧 consumer 残留必须按已知结构位置或 AST/语义模式识别；`not.toContain(oldToken)` 属于允许的负向回归 consumer，不能计为正式旧语义残留。
- **新增类防护 / EXP-251**：consumer audit 必须区分 positive consumer、negative regression assertion 和文档说明引用；只有正式 producer/positive consumer 残留才阻断。
- **自动防护**：旧 expectedChapters/旧 lifecycle 正向 consumer 必须消失；final regression test 中旧 token 的 `not.toContain` 必须允许且保持。
- **状态**：`CLOSED`；V151 最终 validator 改为检查已知旧正向 consumer 结构，不再全文件禁止旧 token 字面出现。
<!-- SPECFORGE_ERR285_EXP251_NEGATIVE_ASSERTION_TOKEN_FALSE_POSITIVE:END -->

<!-- SPECFORGE_ERR286_EXP252_HANDOFF_STALE_FINAL_CLOSURE_FACTS:START -->
## ERR-286 / EXP-252 — V151 handoff 保留了与最终 Authority 闭包冲突的旧当前事实
- **日期与阶段**：2026-08-09，V151 成功回执后的提交前对账。
- **分类**：`HANDOFF_CONSISTENCY_DEFECT / CONTRACT_CONSUMER_DEFECT / STALE_CURRENT_FACT`。
- **现场表现**：V151 已把 authority 的去重范围闭合为 D1-D19、ERR-271 已关闭，但 V151 handoff 机器字段仍写 `AUTHORITY_APPROVED_DEDUP_SCOPE=D1_D14`，说明段仍写“ERR-271 是当前唯一 blocker”。
- **已执行与未执行**：V151 仅完成本地验证，尚未 commit/push；发现后停止直接提交。
- **仓库变化**：用户本地仍只有 V151 冻结 4 文件的已验证脏状态；远程仍为 `b24e959bb34dc868c84cbd777767670b09fa45d4`。
- **根因**：V151 只更新了 handoff 的 Stage 动态字段，没有把本次 authority 正式变更对应的 current-fact consumer 一并纳入一致性检查。
- **影响**：若直接提交，handoff 会在同一 commit 中与唯一权威产生 D1-D14/D1-D19 和 ERR-271 状态冲突。
- **正确做法**：提交前执行 Authority→handoff current-fact 对账；所有直接镜像 authority 当前语义的 handoff 字段必须与目标 authority 一致，历史说明不得继续描述已关闭 blocker 为当前事实。
- **新增类防护 / EXP-252**：Authority 内容变更若存在 handoff current-fact consumer，必须把该 consumer 纳入原子修改/回归矩阵；不能只验证 handoff 必需字段“存在”。
- **自动防护**：验证 `AUTHORITY_APPROVED_DEDUP_SCOPE=D1_D19`，并拒绝 handoff current block/说明段继续宣称 ERR-271 为当前 blocker。
- **状态**：`CLOSED`；V152 更新机器字段和说明段，并新增 authority-handoff 对账回归。
<!-- SPECFORGE_ERR286_EXP252_HANDOFF_STALE_FINAL_CLOSURE_FACTS:END -->

<!-- SPECFORGE_ERR287_EXP253_LEDGER_LITERAL_ESCAPED_NEWLINE_STRUCTURE:START -->
## ERR-287 / EXP-253 — V151 错误台账 ERR-284 段落被写成字面量 `\n` 而非 Markdown 换行
- **日期与阶段**：2026-08-09，V151 成功回执后的提交前结构审计。
- **分类**：`ARTIFACT_STRUCTURE_DEFECT / LEDGER_SERIALIZATION_DEFECT / VALIDATOR_COVERAGE_GAP`。
- **现场表现**：ERR-284 / EXP-250 的 START、标题、正文和 END 之间含字面量 `\n` 转义序列，整个段落没有形成正常 Markdown 物理行；V151 validator 只按 ERR ID 子串存在性判断，未识别结构损坏。
- **已执行与未执行**：缺陷在 commit/push 前发现；未把损坏台账写入远程。
- **仓库变化**：远程无变化；本地仍处于 V151 冻结范围。
- **根因**：预交付生成器把已转义文本再次当普通文本写入，validator 没有验证 ledger section 的 START/heading/END 物理行结构。
- **影响**：错误台账虽然能被字符串搜索命中，但不再是可靠、可解析的结构化 Markdown 证据。
- **正确做法**：错误台账 section 必须验证真实换行和结构边界；禁止以 ID 子串存在替代 section parser 验证。
- **新增类防护 / EXP-253**：每个新增/修改 ERR section 至少验证 START marker、下一物理行标题、END marker 和 section 内不得出现用于编码结构的字面量 `\n`。
- **自动防护**：ERR-284 section 必须以真实物理行存在；escaped-newline 版本必须 FAIL。
- **状态**：`CLOSED`；V152 将 ERR-284 还原为正常 Markdown 行结构，并新增 ledger section 结构回归。
<!-- SPECFORGE_ERR287_EXP253_LEDGER_LITERAL_ESCAPED_NEWLINE_STRUCTURE:END -->

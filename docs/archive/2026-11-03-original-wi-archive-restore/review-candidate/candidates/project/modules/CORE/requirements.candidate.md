---
requirements_format: ears
work_item_id: WI-0001
module_id: CORE
workflow_type: feature_spec
workflow_path: requirement_change_path
candidate_type: candidate_requirements
base_spec_version: PSV-0001
implementation_baseline_id: sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722
---

# Requirements Candidate — WI-0001 / CORE（Greeting Library 首个功能）

## 候选绑定与 Basis 来源

- Work Item: WI-0001（feature_spec / requirement_change_path）
- 模块归属: CORE（spec_manifest.json PSV-0001 中唯一已声明模块，default_module=CORE）
- implementation_baseline_id: `sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722`（Runtime 基线 `.specforge/work-items/WI-0001/implementation_baseline.json`，captured_at: 2026-10-25T05:23:36.211Z；README.md 既有 123 bytes、sha256:757ee94ea46933c3dd7092c04d15a32546a3f54e609b9c6e66351eeafe8fdf40 → 追加式修改；package.json/src/greet.ts/tests/greet.test.ts/tsconfig.json 基线 matched_files 为空 → 新建）
- Basis 来源文件：
  1. `.specforge/work-items/WI-0001/intake.md`
  2. `.specforge/work-items/WI-0001/trigger_result.json`
  3. `.specforge/work-items/WI-0001/change_classification.md`
  4. `.specforge/work-items/WI-0001/impact_analysis.md`

### Basis 引用键定义

| 引用键 | 内容 | 来源 |
| --- | --- | --- |
| UQ-1 | 用户原话："新增 src/greet.ts，导出 greet(name: string): string" | intake.md 明确事实 1 |
| UQ-2 | 用户原话："非空名称返回 Hello, <name>!" | intake.md 明确事实 1 |
| UQ-3 | 用户原话："空名称返回 Hello, world!" | intake.md 明确事实 1 |
| UQ-4 | 用户原话："补充可验证这两个行为的测试和使用说明" | intake.md 明确事实 1 |
| FACT-1 | greenfield：项目无 package.json、src/、tests/、tsconfig.json；根目录仅 .git/、.specforge/、README.md（既有 123 bytes，sha256:757ee94ea46933c3dd7092c04d15a32546a3f54e609b9c6e66351eeafe8fdf40） | intake.md 明确事实 3 |
| FACT-2 | spec_manifest.json PSV-0001：唯一已声明模块 CORE（active，default_module=CORE，尚无 code_paths） | intake.md 明确事实 3 |
| FACT-3 | README.md 明示项目为 TypeScript 库、隔离验收运行、无生产数据（"No production data"） | intake.md 明确事实 3 |
| FACT-4 | 项目 architecture.md、数据模型、模块契约均为占位/缺失，首份正式产物由本 WI 创建 | intake.md 明确事实 3；impact_analysis §4 |
| CONSTRAINT-1 | 禁止假设：不得扩展额外输入分支（null/undefined/纯空白的额外行为）；不得假设测试已运行或通过；本 WI 停在 approval_required | intake.md 禁止假设 |
| CONSTRAINT-2 | 禁止假设：不得假设任何包管理器依赖、构建脚本、CI、npm registry、网络或外部执行器可用 | intake.md 禁止假设 |
| IMPACT-1 | planned_code_paths：src/greet.ts、tests/greet.test.ts、README.md、package.json、tsconfig.json（全部归属 CORE） | trigger_result.json；impact_analysis §3 |
| UNKNOWN-1 | 测试运行器与最小工程配置选型待设计阶段以零依赖方案优先决策并取证 | intake.md 未知项 1 |
| UNKNOWN-2 | Node.js/TypeScript 具体可用版本未取证，由实现/验证阶段以真实运行证据确认 | intake.md 未知项 2 |
| CLS-1 | 11 项事实分类：requirement/acceptance_criteria/business_rule/user_visible_behavior/api_contract/design/architecture/data_model/module_contract 均为 true；data_semantics/module_boundary/contract_registry_only 为 false | change_classification.md |

## 简介

本候选是 WI-0001 在 requirement_change_path 上生成的 CORE 模块首份正式需求候选，描述 Greeting Library 首个功能的行为契约与交付物需求：`src/greet.ts` 导出 `greet(name: string): string`，两条问候行为规则（非空名称、空名称默认问候），以及可验证该两行为的自动化测试与使用说明。本文档只回答"要什么"与"什么才算完成"；技术实现决策（测试运行器、工程配置、编译路径）由设计阶段承接（见"待决项"）。全部验收标准采用 EARS 句式并具有全局唯一三位编号（AC-CORE-001～AC-CORE-018）；每条 Must 需求声明 Required Evidence 与 not_done_when，作为后续设计、任务与验证阶段的追溯起点。

## 术语表

| 术语 | 定义 |
| --- | --- |
| Greeting Library | 问候库：本项目的 TypeScript 业务库形态（README 标题 "Greeting Library"，FACT-3） |
| greet | 本库唯一公共导出函数，签名 `greet(name: string): string`（REQ-CORE-001） |
| 非空名称 | 长度 ≥ 1 的 string 输入；包含由空白字符构成的字符串（按 REQ-CORE-002 规则直接处理，见"定义域边界"） |
| 空名称 | 长度为 0 的 string 输入 `""` |
| 默认问候 | 空名称时的回退返回值 `Hello, world!`（REQ-CORE-003） |
| 导出契约 | `src/greet.ts` 对外暴露的公共 API 形态：导出名 `greet` 与其 TypeScript 签名 |
| 自动化测试 | 可在确定命令下重复执行、输出通过/失败结果的程序化断言集合 |
| 使用说明 | 面向库调用方、说明 greet 调用方式与两种返回行为的文档 |
| 零运行时依赖 | 库运行路径不引用任何第三方包、网络资源或外部服务（REQ-CORE-006） |
| greenfield | 项目无既有正式功能代码与规格条目的初始状态（FACT-1、FACT-4） |
| EARS | Easy Approach to Requirements Syntax；本候选验收标准采用的句式规范 |
| Required Evidence | 证明某条验收标准被满足所必需的证据；本候选只声明证据预期，不声称证据已取得 |
| approval_required | SpecForge 治理流程中的用户审批边界状态；本 WI 在此停止等待批准 |

## 需求

优先级结论：REQ-CORE-001～REQ-CORE-005 为 **Must**（直接源自用户原话的交付物与行为契约），REQ-CORE-006 为 **Should**（源自 intake 决策边界的零依赖优先基线，允许设计阶段举证后固化）。

### REQ-CORE-001 greet 导出契约

优先级: Must

用户故事: 作为 Greeting Library 的调用方，我希望从 `src/greet.ts` 导入名为 `greet` 的函数并依赖其确定的 TypeScript 签名，以便以静态可检查的方式调用问候能力。

验收标准:
- AC-CORE-001 [Ubiquitous] THE 项目 SHALL 在 `src/greet.ts` 中提供名为 `greet` 的导出函数.
- AC-CORE-002 [Ubiquitous] THE greet SHALL 具备签名 `greet(name: string): string`，即恰好一个名为 name 的 string 类型入参、一个 string 类型返回值.
- AC-CORE-003 [Unwanted-behavior] IF `src/greet.ts` 不存在、greet 未被导出、或签名与 `greet(name: string): string` 不一致, THEN 本需求验收 SHALL 判定为未满足.

basis_refs: [UQ-1, FACT-1, FACT-2, IMPACT-1]

required_evidence:
  - EVREQ-1A: 实现完成后，`src/greet.ts` 存在于 CORE 模块 code_paths 且源码存在名为 greet 的导出（源码/模块清单证据）.
  - EVREQ-1B: 自动化测试以 import/require 方式成功引用 greet 并完成调用（与 REQ-CORE-004 测试证据同源）.

not_done_when:
  - 只创建了 `src/greet.ts` 文件但没有任何具名导出 greet.
  - 只有类型声明而无函数实现（无行为路径）.
  - 导出签名与 `(name: string) => string` 不符（多参、可选参或返回类型不是 string）.

### REQ-CORE-002 非空名称问候行为

优先级: Must

用户故事: 作为调用方，当我传入一个非空名称时，我希望得到精确的个性化问候字符串，以便在下游展示中直接使用返回值。

验收标准:
- AC-CORE-004 [Event-driven] WHEN 调用方以任意非空字符串 name 调用 `greet(name)`, THE greet SHALL 返回精确字符串 `Hello, <name>!`（即 "Hello, " + name + "!"，name 原样保留、不做增删改写）.
- AC-CORE-005 [Ubiquitous] THE 非空名称返回值 SHALL 为 string 类型，且由固定模板 "Hello, "、name、"!" 三段依序拼接，模板字符（逗号、一个空格、结尾感叹号）不得增删或改写.
- AC-CORE-006 [Unwanted-behavior] IF greet 对任一非空字符串输入返回了不符合 `Hello, <name>!` 模板的值、改写了 name、或抛出异常, THEN 本需求验收 SHALL 判定为未满足.

basis_refs: [UQ-1, UQ-2, CONSTRAINT-1]

required_evidence:
  - EVREQ-2A: 自动化测试包含至少 2 个互不相同的非空名称输入断言（示例形态：`greet("Ada")` 严格等于 `"Hello, Ada!"`），并在批准后验证阶段取得全部通过的真实运行证据.

not_done_when:
  - 只定义函数而无任何非空输入行为验证路径.
  - 返回模板与 `Hello, <name>!` 不符（缺少逗号/空格/感叹号、大小写错误）.
  - 对 name 做了 trim、大小写变换或其他任何改写.
  - 测试断言存在但从未在合法执行边界内运行（无真实运行证据）.

### REQ-CORE-003 空名称默认问候行为

优先级: Must

用户故事: 作为调用方，当我传入空字符串时，我希望得到固定的默认问候，以便在未提供名称的场景下仍获得一致的输出。

验收标准:
- AC-CORE-007 [Event-driven] WHEN 调用方以空字符串 `""` 调用 `greet("")`, THE greet SHALL 返回精确字符串 `Hello, world!`.
- AC-CORE-008 [Ubiquitous] THE 空名称默认问候 SHALL 精确等于 `Hello, world!`（大写 H 开头、逗号后一个空格、小写 world、结尾感叹号，共 13 个字符）.
- AC-CORE-009 [Unwanted-behavior] IF 空字符串调用返回其他任何值、抛出异常、或行为不确定, THEN 本需求验收 SHALL 判定为未满足.

basis_refs: [UQ-1, UQ-3, CONSTRAINT-1, CLS-1]

required_evidence:
  - EVREQ-3A: 自动化测试包含断言 `greet("")` 严格等于 `"Hello, world!"`，并在批准后验证阶段取得通过的真实运行证据.

not_done_when:
  - 空字符串输入导致异常、undefined 或非 `Hello, world!` 字符串.
  - 默认问候字面量拼写错误（大小写、标点、空格不符）.
  - 该分支仅有实现而无可复核的自动化断言证据.

### REQ-CORE-004 两条行为规则的自动化测试交付物

优先级: Must

用户故事: 作为库的维护者与验收方，我希望拥有一组覆盖两条行为规则的自动化测试，以便在后续任何变更后都能以机器可复核的方式确认行为未被破坏。

验收标准:
- AC-CORE-010 [Ubiquitous] THE 项目 SHALL 交付自动化测试（计划路径 `tests/greet.test.ts`，最终位置与形态由设计阶段固化），其中针对 REQ-CORE-002 的断言不少于 1 条、针对 REQ-CORE-003 的断言不少于 1 条.
- AC-CORE-011 [Event-driven] WHEN 该测试套件在设计阶段固化的测试运行器（UNKNOWN-1，零依赖方案优先）上、于批准后阶段的合法执行边界内运行, THEN 上述全部断言 SHALL 通过.
- AC-CORE-012 [Unwanted-behavior] IF 测试在本候选所处阶段被表述为"已运行/已通过"、断言未覆盖两条行为之一、或运行证据缺失, THEN 本需求验收 SHALL 判定为未满足.

basis_refs: [UQ-4, CONSTRAINT-1, CONSTRAINT-2, IMPACT-1, UNKNOWN-1]

required_evidence:
  - EVREQ-4A: 测试文件存在于受控代码路径且其断言可映射到 REQ-CORE-002/REQ-CORE-003（源码证据）.
  - EVREQ-4B: 批准后验证阶段产出的测试套件真实运行输出证据（全部断言通过，含运行方式与结果记录）.

not_done_when:
  - 只有测试文件名或测试骨架而无可执行断言.
  - 断言只覆盖两条行为之一.
  - 在缺乏真实运行证据时声称"测试通过"（违反 CONSTRAINT-1 禁止假设）.

### REQ-CORE-005 使用说明交付物

优先级: Must

用户故事: 作为库的潜在使用者，我希望在项目文档中读到 greet 的调用方式与两种返回行为，以便不阅读源码即可正确使用该库。

验收标准:
- AC-CORE-013 [Ubiquitous] THE 项目 SHALL 提供使用说明（基线位置为 README.md 既有内容之后的追加章节，保留现有标题与项目性质描述），说明 greet 的导入与调用方式.
- AC-CORE-014 [Event-driven] WHEN 读者查阅使用说明, THEN SHALL 能在其中同时找到非空名称返回 `Hello, <name>!` 与空名称返回 `Hello, world!` 两种行为的说明或示例.
- AC-CORE-015 [Unwanted-behavior] IF 使用说明缺失调用方式、缺失任一行为描述、或描述与实现行为不一致, THEN 本需求验收 SHALL 判定为未满足.

basis_refs: [UQ-4, FACT-1, FACT-3, IMPACT-1]

required_evidence:
  - EVREQ-5A: README.md（或设计阶段确认的等效位置）包含调用方式与两种返回行为的文档内容（文档内容证据）.

not_done_when:
  - 使用说明未说明如何导入或调用 greet.
  - 只描述了两种行为之一.
  - 示例与 REQ-CORE-002/REQ-CORE-003 定义的行为不一致.

### REQ-CORE-006 零运行时第三方依赖约束

优先级: Should

用户故事: 作为库的调用方与维护者，我希望库的运行路径不依赖任何第三方包、网络资源或外部服务，以便在无网络、无包管理器缓存的环境中也能安装、审查与使用该库。

验收标准:
- AC-CORE-016 [Ubiquitous] THE 库 SHALL 不声明任何运行时第三方依赖（运行时 dependencies 为空集）.
- AC-CORE-017 [Unwanted-behavior] IF 库的运行时行为依赖任何第三方包、网络资源或外部服务, THEN 本需求验收 SHALL 判定为未满足.
- AC-CORE-018 [Optional-feature] WHERE 工具链组件（TypeScript 编译、测试运行器）确需开发期依赖, THE 选型 SHALL 由设计阶段在零依赖优先原则下决策并取证，且该类开发期依赖不计入运行时依赖；本条不预设任何具体工具链结论.

basis_refs: [FACT-1, FACT-3, CONSTRAINT-2, UNKNOWN-1]

required_evidence:
  - EVREQ-6A: 工程配置（计划路径 package.json，最终形态由设计阶段固化）中运行时 dependencies 为空（或经设计决策证明等价于零运行时依赖）的配置证据.

not_done_when:
  - 运行路径 import/require 了任何第三方包.
  - 仅以"应该没有依赖"表述而未提供可检查的配置证据.
  - 未经取证即假设包管理器或网络可用（违反 CONSTRAINT-2）.

### 需求依赖关系

- REQ-CORE-002、REQ-CORE-003 依赖 REQ-CORE-001（导出契约是行为验证的载体）.
- REQ-CORE-004 依赖 REQ-CORE-002、REQ-CORE-003（断言对象为两条行为规则）.
- REQ-CORE-005 依赖 REQ-CORE-001、REQ-CORE-002、REQ-CORE-003（说明内容须与契约和行为一致）.
- REQ-CORE-006 为独立约束，约束 REQ-CORE-001～REQ-CORE-005 的交付形态.

## 范围外（Out-of-Scope）

以下维度在多维度头脑风暴（业务需求、技术约束、用户体验、安全合规、运维部署、成本预算、扩展性、EARS 覆盖）中已逐一考虑，经依据判断排除在本 WI 需求之外；未经用户新的批准不得实现：

| # | 排除项 | 理由（依据） |
| --- | --- | --- |
| 1 | 额外输入分支（null、undefined、纯空白字符串的特殊处理、trim 归一化、超长输入截断、非 string 类型输入的校验或抛错） | CONSTRAINT-1：用户仅定义"空与非空"两条规则，额外分支行为未定义、未经批准不得实现；纯空白字符串按非空规则直接应用，不做归一化 |
| 2 | 国际化与多语言问候（如 "Hola"、"Bonjour"、locale 参数） | UQ-2/UQ-3 明确固定英文模板；用户未提出多语言诉求 |
| 3 | 可配置问候语模板（自定义前缀、后缀或分隔符） | 用户未要求配置能力；首版公共 API 契约固定为 `greet(name: string): string`（UQ-1） |
| 4 | 性能指标（吞吐、并发用户数、P95 延迟等 SLA 数值） | 纯本地纯函数、无并发业务场景与量级输入事实，设定数值指标缺乏可举证基线（头脑风暴维度结论：无业务量级依据，宁缺毋伪造） |
| 5 | 持久化与存储 | FACT-3：README 明示 "No production data"；data_semantics_changed=false（CLS-1），纯函数无状态 |
| 6 | 安全加固（输入消毒、注入防护、权限控制、审计日志） | 无网络、无存储、无敏感信息（FACT-3）；输出仅为字面量模板拼接，无既有威胁面；额外输入处理已被第 1 项排除 |
| 7 | 运维部署、监控、日志与故障恢复 | 库形态交付而非运行服务；隔离验收运行环境（FACT-3），无部署目标与监控诉求 |
| 8 | npm 包发布、版本发布流、CI/CD 流水线 | 用户未要求；CONSTRAINT-2：不得假设 npm registry、网络或 CI 可用 |
| 9 | CLI 入口或交互式调用界面 | 用户目标为库导出函数（UQ-1），未要求 CLI 形态 |
| 10 | 成本预算权衡分析 | 无外部 API、无云资源、无存储成本项；成本维度经头脑风暴确认不适用 |

## 约束与待决项

### 定义域边界（Must，承接 CONSTRAINT-1）

- greet 的输入定义域为 string 类型，且仅"空字符串"与"非空字符串"两种情形具有定义行为：
  - 空名称：长度为 0 的字符串 `""`（→ REQ-CORE-003）.
  - 非空名称：长度 ≥ 1 的任意字符串，包括由空白字符构成的字符串（其按 REQ-CORE-002 规则直接处理，不做 trim 或其他归一化）.
- null、undefined、非 string 类型输入的行为在本 WI 中未定义：实现不得为其编写分支，验收不为其设定预期.

### 待决项（由后续阶段承接，本候选不伪造结论）

| 待决项 | 内容 | 承接阶段 | 依据 |
| --- | --- | --- | --- |
| D-1 | 测试运行器与最小工程配置（package.json/tsconfig 形态），零依赖方案优先 | sf-design（固化为 DD 决策并取证） | UNKNOWN-1 |
| D-2 | Node.js/TypeScript 具体可用版本 | 批准后实现/验证阶段以真实运行证据确认 | UNKNOWN-2 |

### 流程约束（Must，承接 CONSTRAINT-1）

- 本 WI 推进至 approval_required 为止：本候选仅定义可验证 AC 与证据预期；测试的编写属于批准后实现任务，测试的运行与证据取得属于批准后验证阶段.
- 在取得合法运行证据之前，任何交付物不得含有"测试已运行/已通过"的表述.

## Requirements Delta 说明（requirement_change_path 承接）

1. 变更原因：greenfield 项目实现首个正式功能（FACT-1、FACT-4），项目此前无任何正式需求条目.
2. 变更内容：全量新增 REQ-CORE-001～REQ-CORE-006（含 AC-CORE-001～AC-CORE-018），无修改条目、无删除条目.
3. 影响正式规格（预期经用户批准并合并后更新，本阶段不直接写入）：
   - `.specforge/project/modules/CORE/requirements.md`（占位 → 首份正式模块需求）
   - `.specforge/project/requirements_index.md`（新增 CORE 需求索引条目）
4. 旧内容处理：无既有正式需求内容，无替换或废弃对象；占位内容由合并流程处置.
5. User Decision：需要——本候选属于 approval_required 审批边界的待批准内容.

## 配置点清单

本候选无 `<configurable>` 配置点：所有行为模板（`Hello, <name>!`、`Hello, world!`）均为用户原话固定的确定值，当前无任何需求级可配置项.
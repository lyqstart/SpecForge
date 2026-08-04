# SpecForge P0：Contract 消费者闭环根因分析与完整实现设计

> **状态**：IN_PROGRESS
> **文件性质**：非权威实施文件
> **目标仓库路径**：`docs/implementation/architecture-consistency/P0-contract-consumer-closure.md`
> **唯一产品设计依据**：`docs/design/SpecForge架构一致性治理最终实施方案.md`
> **缺陷编号**：`GOV-DEFECT-CONTRACT-CONSUMER-001`
> **设计基线**：`main@e242768`（P0 精确源码取证与实施范围已在该提交冻结；本轮实现包尚未写入用户仓库）
> **当前执行边界**：本文件用于开发 SpecForge 产品；业务项目不直接读取本文件。标记为 `PROJECT_GOVERNANCE` 或 `BOTH` 的规则，必须最终落实到 SpecForge 的程序、Tool、Skill、Agent、Workflow、Gate、Runtime、项目模板和回归测试中。

## 0. 文档权威边界

本文件回答：

```text
当前 P0 缺陷为什么存在
本次怎样修改 SpecForge
允许修改哪些范围
需要验证哪些场景
怎样证明实现完成
```

本文件不建立第二个架构权威源。发生冲突时：

```text
《SpecForge架构一致性治理最终实施方案.md》
优先于
本实施文件
```

实施过程中如果发现权威规则本身需要变化，必须：

```text
先修订唯一权威文件
→ 再更新本实施文件
→ 再修改代码
```

不得让实现细节反向、隐式改变产品架构。

本文件从设计到关闭始终维护同一份，不再为同一 P0 问题创建独立的“实施报告”“交接文件”或“最终修正版”。

## 1. 规则适用范围

以后所有 SpecForge 架构治理规则、缺陷和实施决定都必须标记以下适用范围之一。

### `PRODUCT_DEVELOPMENT`

只约束当前如何开发、修改和验证 SpecForge 产品本身，例如：

```text
读取远程唯一权威文件并固定 commit SHA
修改前形成治理前置结论
冻结允许修改范围
执行单元测试、类型检查和构建
维护本实施文件的状态与证据
不使用 SpecForge 自治理 SpecForge
```

### `PROJECT_GOVERNANCE`

描述 SpecForge 完成后治理业务项目时必须自动执行的产品行为，例如：

```text
Trace 作为 Contract 消费关系唯一真相源
DD constrained_by Contract
Trace Delta 使用 ADD / REMOVE
跨 Module 消费 Internal Contract 必须阻断
Impact Scope 自动展开全部消费者
Code Permission 覆盖全部消费 Module
Verification 对账正式 Trace 与实际代码依赖
```

业务项目不直接读取本实施文件；以上规则必须由 SpecForge 产品能力执行。

### `BOTH`

既约束当前开发 SpecForge，也必须成为以后业务项目治理的不变式，例如：

```text
唯一真相源
Fail Closed
证据不足不得猜测
影响范围必须完整
生产者和消费者必须完整
正式关系必须原子变更
实际修改不得越过批准范围
不能以警告冒充已机器强制
```

当前开发 SpecForge 时，由人工治理和普通软件工程验证执行；产品完成后，由 SpecForge 的程序、Gate 和 Runtime 自动执行。

### 本 P0 设计的适用范围矩阵

| 设计内容 | 适用范围 | 当前开发阶段怎样落实 | 最终业务项目中怎样执行 |
|---|---|---|---|
| 根因取证、允许修改范围、测试命令、实施记录 | `PRODUCT_DEVELOPMENT` | 开发者按本文件修改并验证仓库 | 业务项目不可见 |
| Trace 唯一消费者真相源 | `BOTH` | 当前实现不得再创建第二消费者来源 | SpecForge Gate 只认正式 Trace |
| `DD constrained_by Contract` | `PROJECT_GOVERNANCE` | 修改解析、Gate、Agent/Skill 和测试 | 每个 WI 由 Trace Gate 强制 |
| ADD、REMOVE、Prospective Trace | `BOTH` | 当前代码和测试必须按同一语义实现 | 每个业务 WI 原子变更正式关系 |
| Internal Contract 跨 Module 阻断 | `PROJECT_GOVERNANCE` | 完善现有 Contract Integrity Gate | 业务 Candidate 合并前自动阻断 |
| Impact Scope 反向展开消费者 | `PROJECT_GOVERNANCE` | 完善现有 Runtime 推导 | 每个涉及 Contract 的 WI 自动补全范围 |
| Code Permission 覆盖消费者 | `PROJECT_GOVERNANCE` | 完善现有权限冻结逻辑 | Executor 只能修改批准的消费者范围 |
| 实际代码依赖对账 | `BOTH` | 使用现有 verifier、审计和证据机制实现 | Verification、Close 阶段失败关闭 |
| 不新增平行消费者 Registry / 新 Gate / 新 Trace 系统 | `BOTH` | 本次实现不得扩大架构 | 后续产品演进也不得绕过唯一机制 |

---

## 2. 当前基线与结论

本步只完成分析和设计，不修改代码，不启动 daemon，不启动 OpenCode。

基线：

- 仓库：`https://github.com/lyqstart/SpecForge`
- 分支：`main`
- Commit：`57c5eb5`
- 唯一产品设计依据：`docs/design/SpecForge架构一致性治理最终实施方案.md`
- `57c5eb5` 只在 `08629b5` 基础上新增实施文档和交接文件，因此程序代码事实仍与 `08629b5` 一致。

最终定性：

> 当前 P0 不是“Contract 文件格式不完整”，而是“Contract 的正式消费者、实际代码消费者和变更后的未来状态没有形成同一个可验证闭环”。

权威方案已经明确目标；当前程序尚未完整落实。该问题属于实际代码治理缺陷。

---

## 3. 业务目标

> **适用范围**：`BOTH`。当前用于指导产品实现；最终成为业务项目治理的不变式。

Contract 是多个设计或代码共同遵守的稳定规则，例如：

- 状态枚举；
- 错误码；
- 数据结构；
- 公共接口；
- 模块内部不变量。

治理必须回答四个问题：

1. 谁定义这条 Contract；
2. 哪些设计规则消费它；
3. 哪些生产代码实际依赖它；
4. Contract 修改、删除或从 Module Contract 升级为 Project Contract 时，是否处理了全部消费者。

最终必须保证：

```text
正式 Trace 声明的消费者
=
本次影响分析纳入的消费者
=
批准修改范围覆盖的消费者
=
生产代码中的实际消费者
=
验证阶段确认的消费者
```

任何一边不一致都必须阻断。

---

## 4. 名词说明

> **适用范围**：`BOTH`。开发和运行使用同一语义，执行主体不同。

### Contract

需要被机器检查的稳定设计规则。

### Module Contract

只允许同一个 Module 内部消费的 Contract，存放在：

```text
.specforge/project/modules/<MODULE>/contracts.json
```

### Project Contract

允许跨 Module 或全项目共同消费的 Contract，存放在：

```text
.specforge/project/extension_registry.json
```

### Trace

正式设计对象之间关系的唯一事实记录。

Contract 消费关系固定表达为：

```text
DD-* constrained_by Contract-ID
```

其中 `DD-*` 是 Module Design 中的正式设计规则。

### Trace Delta

当前 WI 对正式 Trace 提出的变更：

```text
ADD
REMOVE
```

关系变化使用：

```text
REMOVE 旧关系
+
ADD 新关系
```

### Prospective Trace

本次 Candidate 如果批准并合并后将形成的 Trace：

```text
当前正式 Trace
+ ADD
- REMOVE
= Prospective Trace
```

三个核心 Gate 必须检查 Prospective Trace，而不是只检查当前旧状态。

### Gate

流程中的程序化检查关卡。Hard Gate 失败后必须阻断审批、合并或后续执行。

---

## 5. 当前实际代码已经具备的基础

> **适用范围**：`PRODUCT_DEVELOPMENT`。这是当前仓库实现事实，不是业务项目规则。

当前程序并非从零开始，已经具备：

1. Project Contract 与 Module Contract 两级存储；
2. Contract `owner_module` 检查；
3. Contract `source_refs` 检查；
4. Contract `enforcement` 声明检查；
5. Module `code_paths`，可把生产代码文件映射到 Module；
6. Impact Scope 中已有：
   - `affected_modules`
   - `design_refs`
   - `project_contract_refs`
   - `module_contract_refs`
   - `planned_code_paths`
7. Trace 已有：
   - `constrained_by`
   - `enforces`
8. Trace Delta 解析基础已经支持：
   - `ADD`
   - `REMOVE`
9. Candidate 投影基础已经能够计算本次修改后的正式对象；
10. Code Permission、Changed Files Audit、Verification 已经存在；
11. TS/JS shared enum 的部分实际代码检查已经存在。

这些能力应当连接起来，不另建平行的 Contract 消费者系统。

---

## 6. 当前根因

> **适用范围**：`PRODUCT_DEVELOPMENT`。用于定位当前 SpecForge 产品缺陷。

### 根因一：正式消费者真相源使用错误

当前 `contract_integrity_gate` 主要检查“明确标记的 Project Spec 消费者”，例如设计文档中的 `[contract:...]` 标记。

这存在三个问题：

1. 标记不是当前权威规则规定的正式 Trace；
2. 没有标记的真实消费者会被漏掉；
3. 标记与 Trace 可能形成两套不同事实。

正确方向：

```text
删除“文档标记是消费者真相源”的地位
→ Trace 成为唯一正式消费者真相源
```

文本标记可以保留为显示或兼容信息，但不能决定 Gate 是否通过。

---

### 根因二：现有 Trace 语义不能完整表达 Contract 消费

现有关系合法性主要支持：

```text
DATA constrained_by ARCH
DD constrained_by ARCH / DATA
Contract enforces ARCH / DATA / DD
```

但新权威规则要求：

```text
DD constrained_by Contract
```

如果这一关系未进入合法关系模型，即使 `trace_delta.md` 写入消费者关系，Trace Gate 也无法把它作为合法正式关系处理。

因此必须扩展现有 Trace 语义，而不是新增关系类型。

---

### 根因三：跨 Module Internal Contract 检查仍依赖文本搜索

当前 Module Contract 的跨模块检查，会在其他 Module 的设计文本中搜索 Contract ID。

这种方式不能证明消费者完整：

- 可能误匹配普通文字；
- 可能因别名、表格格式或间接引用而漏检；
- 无法表达关系取消；
- 无法可靠支持 Contract Promotion；
- 无法反向查询一个 Contract 的全部正式消费者。

正确方式：

```text
从 Prospective Trace 反向查询 Contract 的所有 DD 消费者
→ 根据 DD 所属 Module 推导消费者 Module
→ 判断是否跨 Module
```

---

### 根因四：ADD / REMOVE 已能解析，但没有严格验证操作本身

现有基础逻辑倾向于：

- REMOVE 找不到关系时静默忽略；
- ADD 已存在时静默忽略。

这不满足正式治理要求。

因为：

- REMOVE 不存在关系通常代表基线错误、旧 ID 写错或关系已经漂移；
- 重复 ADD 可能代表 Candidate 生成错误或重复维护；
- 静默忽略会让用户以为变更已经执行。

正确规则：

```text
REMOVE 的关系在 Current Trace 中不存在
→ BLOCK

ADD 的关系在 Current Trace 中已经存在
→ BLOCK

同一个 Delta 中互相冲突或重复
→ BLOCK
```

关系变化必须明确用一条有效 REMOVE 和一条有效 ADD 表达。

---

### 根因五：Impact Scope 没有以 Contract 消费者反向展开

当前影响范围能够保存 Contract 引用和 Module，但没有充分证据证明它会执行：

```text
变化的 Contract
→ 反向查询全部消费 DD
→ 推导全部消费 Module
→ 自动补全 affected_modules、design_refs 和 planned_code_paths
```

如果没有反向展开，会出现：

```text
Project Contract 被修改
→ 只批准了 Contract owner Module
→ 其他消费 Module 没进入影响范围
→ Code Permission 不允许修改它们
→ 或消费者根本没被处理
```

---

### 根因六：Code Permission 的 Contract 范围主要从来源推导，不是从消费者推导

当前代码权限冻结已包含 Project/Module Contract refs，但主要围绕：

- Contract owner；
- Contract source_refs；
- 已声明 affected_modules。

完整闭环还必须纳入：

```text
Contract 的全部消费 DD
→ 全部消费 Module
→ 对应 code_paths
```

否则“设计已经知道消费者”与“实际允许修改哪些代码”会断开。

---

### 根因七：生产代码实际消费者检查只有部分能力

现有代码检查能确定一部分 TS/JS shared enum 的显式类型绑定，例如：

- 有类型标注的变量；
- 参数或属性；
- `as` / `satisfies`；
- 已知类型变量的赋值；
- 可解析的 JSDoc 类型。

当前不能可靠证明：

- 未显式绑定的普通字符串；
- 自由文本 public interface；
- 自由文本 invariant；
- 未支持语言的代码。

正确处理不是假装全部检查完成，也不是建立第三套消费者清单，而是：

```text
能够机器证明
→ 由现有代码 Contract Verifier 检查

暂时不能机器证明
→ 必须有明确人工审查 Contract 和验证证据

没有机器证据，也没有人工审查证据
→ Fail Closed
```

---

### 根因八：职责分散，没有统一的 Prospective Contract Consumer 结果

当前相关判断分布在：

- Contract Integrity；
- Project Governance；
- Trace Gate；
- Gate Runner；
- Code Contract Verifier；
- Changed Files Audit；
- Verification。

各部分使用的消费者依据不完全一致。

需要在现有 Trace 核心中形成一个统一结果：

```text
Prospective Contract Consumer Graph
```

它不是新治理系统，只是对现有 Project Spec、Contract 和 Trace 的统一解析结果。

所有 Gate 和后续阶段读取同一个结果，不再各自搜索和猜测。

---

## 7. 目标架构

> **适用范围**：`PROJECT_GOVERNANCE`，并由当前产品开发负责实现。

完整闭环如下：

```text
用户需求
↓
Impact Analysis 识别发生变化的 Contract
↓
Runtime 从当前正式 Trace 反向查询全部消费者
↓
自动补全受影响 DD、Module 和代码路径
↓
sf-design 产生 Contract Candidate、Module Design Candidate 和 Trace Delta
↓
Current Trace + ADD - REMOVE
形成 Prospective Trace
↓
Trace Gate 检查关系语义与闭包
↓
Contract Integrity Gate 检查消费者、跨 Module 边界、Promotion 和兼容处理
↓
Spec Consistency Gate 检查 Impact Scope 与 Candidate 是否完整
↓
用户一次审批
↓
Contract、Design 和 Trace 原子 Merge
↓
Code Permission 按批准后的消费者范围冻结代码修改权限
↓
生产代码实现
↓
Changed Files Audit 确认实际文件所属 Module
↓
Code Contract Verifier / 人工审查证据检查实际依赖
↓
Verification 对账正式 Trace 与实际代码消费者
↓
不一致则 BLOCK，闭合后才允许 Close
```

---

## 8. 唯一数据来源

> **适用范围**：`BOTH`。

### 8.1 当前正式关系

唯一权威：

```text
.specforge/project/trace_matrix.md
```

### 8.2 Module Trace

```text
.specforge/project/modules/<MODULE>/trace.md
```

只能是项目级 Trace 的受控 Module 视图，不能独立写出另一套关系事实。

### 8.3 本次变更输入

```text
.specforge/work-items/<WI>/trace_delta.md
```

只记录本次 ADD / REMOVE。

### 8.4 Contract 文件

Contract 文件只保存 Contract 自身定义：

```text
id
owner_module
source_refs
enforcement
Contract 类型所需字段
```

不再维护独立消费者数组。

---

## 9. Trace 语义

> **适用范围**：`PROJECT_GOVERNANCE`。

只保留现有两个 Relation：

```text
constrained_by
enforces
```

合法关系固定为：

### 上层设计约束下层设计

```text
DATA constrained_by ARCH
DD constrained_by ARCH
DD constrained_by DATA
```

### Contract 消费关系

```text
DD constrained_by Project Contract
DD constrained_by 本 Module 的 Module Contract
```

### Contract 来源与机器执行关系

```text
Project Contract enforces ARCH / DATA
Module Contract enforces DD
```

非法关系示例：

```text
其他 Module 的 DD constrained_by Module Contract
→ BLOCK

Contract constrained_by DD
→ BLOCK

DD enforces Contract
→ BLOCK
```

---

## 10. 消费者反向查询

> **适用范围**：`PROJECT_GOVERNANCE`。

现有 Trace 核心增加统一查询能力：

```text
getContractConsumers(contractId)
```

输出至少包含：

```text
contract_id
consumer_design_ids
consumer_modules
consumer_edges
source_trace_files
```

Module 归属通过正式 DD 归属推导，不接受人工填写一个容易漂移的 Module 名称。

如果 DD 无法唯一归属 Module：

```text
BLOCK
```

---

## 11. Trace Delta 的硬规则

> **适用范围**：`BOTH`。

每条操作必须精确验证。

### ADD

必须满足：

1. From ID 存在；
2. To ID 存在；
3. 关系类型合法；
4. 关系方向合法；
5. Current Trace 中不存在同一关系；
6. 同一个 Delta 中没有重复；
7. 加入后不造成 Module Contract 跨模块消费；
8. 加入后 Prospective Trace 保持闭合。

### REMOVE

必须满足：

1. Current Trace 中存在完全相同关系；
2. 同一个 Delta 中没有重复 REMOVE；
3. 删除后没有留下缺失的必需来源或消费者关系；
4. 删除后 Prospective Trace 保持闭合。

### 变更

必须是：

```text
REMOVE 旧关系
+
ADD 新关系
```

两个操作必须在同一个 WI、同一次审批和同一次原子 Merge 中完成。

---

## 12. Module Contract 边界

> **适用范围**：`PROJECT_GOVERNANCE`。

对每个 Module Contract：

```text
owner_module = M
```

Contract Integrity Gate 从 Prospective Trace 查询全部消费者。

### 合法

```text
全部消费 DD 都属于 M
→ PASS
```

### 非法

```text
任意消费 DD 属于其他 Module
→ BLOCK
```

不能通过“删除文本中的 Contract ID”规避；以正式 Trace 和实际代码依赖为准。

---

## 13. Module Contract 升级为 Project Contract

> **适用范围**：`PROJECT_GOVERNANCE`。

Promotion 是 Contract 治理级别发生变化，不是简单移动文件。

完整 Promotion 在同一个 WI 中必须包含：

1. 新的 Project Contract；
2. 原 Module Contract 删除、废弃或明确替代；
3. 所有旧消费者关系 REMOVE；
4. 所有消费者到新 Project Contract 的关系 ADD；
5. 受影响 Module Design 同步修改；
6. 原 `MCON enforces DD` 来源关系处理；
7. 新 `PCON enforces ARCH / DATA` 来源关系建立；
8. Impact Scope 覆盖全部消费 Module；
9. 兼容性或迁移结论；
10. 回归测试；
11. 所有内容原子 Merge。

设计决定：

> Promotion 使用新的 Project Contract ID，并明确替代原 Module Contract ID。

理由：

- Contract 治理级别变化可以在 Trace 中被看见；
- 所有消费者必须显式迁移；
- 不会把“同 ID 但语义和可见范围已变化”隐藏成普通修改；
- 能可靠检查 REMOVE / ADD 是否完整。

禁止：

```text
原 Module Contract 与新 Project Contract 同时长期有效
```

除非明确进入受控迁移期，并有唯一替代关系和截止条件；普通 Promotion 不允许双重真相源。

---

## 14. 三个 Gate 的职责边界

> **适用范围**：`PROJECT_GOVERNANCE`。

### 14.1 Trace Gate

负责关系本身：

- ADD / REMOVE 格式与操作合法；
- From / To ID 存在；
- Relation 类型与方向合法；
- DD Module 归属唯一；
- Prospective Trace 闭合；
- 删除后没有悬空关系；
- Module Trace 视图与项目权威矩阵一致。

### 14.2 Contract Integrity Gate

负责 Contract 业务语义：

- owner、source_refs、enforcement；
- 正式消费者完整；
- Module Contract 不被其他 Module 消费；
- Contract 删除时全部消费者已经解除或迁移；
- Promotion 是否完整；
- 破坏性变化是否处理全部消费者；
- Trace 声明消费者与实际代码依赖证据是否一致；
- 无法机器证明时，人工审查证据是否存在。

### 14.3 Spec Consistency Gate

负责本次治理范围和 Candidate：

- Contract 变化是否纳入 Impact Scope；
- 全部消费 DD 和 Module 是否纳入影响范围；
- 必需的 Design、Contract、Trace Candidate 是否齐全；
- Promotion 所需产物是否齐全；
- Fast Path 是否错误声称 Contract/Trace 不变。

三个 Gate 读取同一个 Prospective Project Model，但各自负责不同问题，避免重复实现不同解释。

---

## 15. Impact Scope 自动补全

> **适用范围**：`PROJECT_GOVERNANCE`。

当某个 Contract 被新增、修改、删除或 Promotion 时：

```text
Contract ID
→ 从 Current / Prospective Trace 查询消费者 DD
→ 推导消费者 Module
→ 推导 Module code_paths
```

Runtime 必须自动补全：

```text
design_refs
affected_modules
project_contract_refs / module_contract_refs
planned_code_paths
```

Agent 可以提出初步范围，但不能删掉 Runtime 确定的消费者范围。

关系或归属无法唯一确定：

```text
BLOCK
```

---

## 16. Code Permission

> **适用范围**：`PROJECT_GOVERNANCE`。

Code Permission 必须基于批准后的 Prospective Trace 冻结：

```text
owner Module
+
全部 consumer Modules
+
对应 Design refs
+
Contract refs
+
允许修改的 code_paths
```

不能只根据 Contract owner 或 source_refs 发放权限。

如果 Task 需要修改某个消费者 Module，但该 Module 没有进入批准范围：

```text
不发放 Code Permission
```

---

## 17. 生产代码实际消费者对账

> **适用范围**：`BOTH`。

不新增平行治理机制，完善现有能力。

### 17.1 Changed Files Audit

负责确定：

```text
实际修改文件
→ 唯一所属 Module
```

无归属或多重归属：

```text
BLOCK
```

### 17.2 现有 Code Contract Verifier

继续负责能够确定的代码依赖：

- TS/JS 显式 shared enum 类型绑定；
- 后续可在已有 verifier 中扩展其他结构化 Contract。

### 17.3 暂时不能机器确定的情况

例如：

- 未支持语言；
- 自由文本 public interface；
- 自由文本 invariant；
- 无法可靠证明的间接依赖。

必须在现有 Verification / Semantic Closure 证据中提供：

```text
人工审查 Contract ID
审查文件
审查 Module
结论
审查依据
```

如果 Contract 声明需要检查，但既无机器结果也无人工审查证据：

```text
BLOCK
```

不得以 warning 冒充完成。

---

## 18. 合并和关闭边界

> **适用范围**：`PROJECT_GOVERNANCE`。

### 18.1 原子 Merge

以下内容必须同时成功或同时不生效：

```text
Contract Candidate
Module Design Candidate
Trace Delta
Project Trace Matrix
Module Trace 受控视图
相关 Manifest / version 更新
```

不能出现 Contract 已生效、Trace 未生效的中间状态。

### 18.2 Verification

必须对账：

```text
批准的 Prospective Trace 消费者
↔
合并后的正式 Trace 消费者
↔
实际改变的 Module
↔
代码检查或人工审查证据
```

### 18.3 Close

存在以下任一情况不得 Close：

- 悬空 Contract 消费关系；
- 未登记实际消费者；
- 跨 Module 消费 Internal Contract；
- Promotion 未完成；
- Contract 删除但消费者仍存在；
- Code Permission 未覆盖实际消费 Module；
- 实际代码依赖证据不足；
- Trace 正式矩阵与 Module 视图不一致。

---

## 19. 精确源码取证后冻结的实施范围

> **适用范围**：`PRODUCT_DEVELOPMENT`。
>
> **证据包**：`SpecForge-P0-contract-consumer-evidence-57c5eb5.zip`
>
> **取证基线**：`main@57c5eb5`

本节替代实施设计初稿中的预估范围。以下范围已经依据当前真实调用链冻结。

### 19.1 主要实现中心

现有 `sf_trace_matrix_core.ts` 只负责：

```text
Requirement
→ Design
→ Task
```

覆盖检查。它不是 Architecture / Data / Module Design / Contract 语义 Trace 的当前执行中心，因此本 P0 不修改：

```text
packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts
setup/userlevel-opencode/tools/lib/sf_trace_matrix_core.ts
```

Architecture、Data、Module Design、Contract 的 Prospective Trace 当前实际由：

```text
packages/daemon-core/src/tools/lib/project-governance-v2.ts
```

建立模型，并通过：

```text
packages/daemon-core/src/tools/lib/gate-chain.ts
```

叠加到：

```text
spec_consistency_gate
contract_integrity_gate
trace_gate
verification_gate
```

`gate-chain.ts` 当前调用关系已经成立，本 P0 只有在实施时发现其无法承载统一结果时才能进入修改范围；不能为了方便重写 Gate 链。

### 19.2 必须修改的生产实现

```text
packages/daemon-core/src/tools/lib/governance-trace-model.ts                 （新增）
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/src/tools/lib/contract-integrity.ts
packages/daemon-core/src/tools/lib/contracts-registry.ts
packages/daemon-core/src/tools/lib/code-contract-verifier.ts
packages/daemon-core/src/tools/lib/gate-runner-v11.ts
packages/daemon-core/src/tools/lib/merge-runner-v11.ts
packages/daemon-core/src/tools/lib/verification-report-contract.ts
packages/daemon-core/src/tools/lib/verification-governance-contract.ts              （实施中经一手调用链证据确认）
```

#### `governance-trace-model.ts`

这是现有 Trace 真相源的共享纯逻辑，不是新的 Trace 系统。它必须统一提供：

```text
解析当前正式 trace_matrix.md
解析 trace_delta.md 的 ADD / REMOVE
严格验证重复 ADD、重复 REMOVE、删除不存在关系
形成 Current + ADD - REMOVE 的 Prospective Trace
验证关系端点、方向和 Module 归属
反向查询 Contract → DD → Module 消费者
渲染新的项目级正式 Trace Matrix
按 Module 生成受控 Trace 视图
```

禁止在多个 Gate、Merge Runner 和 Agent 中分别实现不同解释。

#### `project-governance-v2.ts`

负责把共享 Trace 模型接入正式项目治理：

```text
DD constrained_by Contract
Module Contract 跨 Module 阻断
Contract 删除后的悬空关系
Promotion 完整性
Impact Scope 消费者反向展开
Code Permission 消费者范围冻结
Verification 中正式消费者与实际消费者对账
```

现有 `loadProjectModel()` 必须停止把 `trace_delta.md` 当作完整 Trace Matrix 先覆盖当前正式矩阵。

#### `contract-integrity.ts`

保留现有 Module Contract Candidate Schema、owner、source_refs 和 enforcement 检查。

删除以下旧真相源地位：

```text
[contract:...] 文档标记
跨 Module 设计文本正则搜索
```

这些内容可以作为显示或兼容信息，但不得决定 Gate 是否通过。

破坏性 Project Contract 变化、删除和 Promotion 必须读取统一 Prospective Contract Consumer Graph。

#### `contracts-registry.ts`

现有读取器只读取 Project Contract。需要在同一 read-side 中提供 Project Contract 与 Module Contract 的统一只读视图，并保留 Contract 的：

```text
治理级别
owner Module
来源文件
Contract kind
```

不得增加消费者数组。

#### `code-contract-verifier.ts`

现有能力只检查变更 TS/JS 文件中的 shared enum 非法值。必须扩展结果，使其能够报告：

```text
实际出现的 Contract ID
实际消费文件
实际消费 Module
机器已检查范围
未支持语言或无法机器判断的范围
```

仍不得猜测未显式绑定的普通字符串。

#### `gate-runner-v11.ts`

Verification Gate 当前把未支持语言只作为 warning。必须改为：

```text
存在需检查的 Contract
+
存在 unsupported_files
+
没有对应的结构化人工审查证据
→ BLOCK
```

同时把代码实际消费者与 Trace 正式消费者对账。

#### `merge-runner-v11.ts`

当前实现逐文件复制，失败时不会恢复已经成功写入的文件；同时 `trace_delta.md` 会被直接复制为正式 `trace_matrix.md`。

必须修改为应用级原子事务：

```text
先完整预检
→ 保存所有目标文件的事务前快照
→ 根据 Current Trace + Delta 生成新的正式 Trace Matrix
→ 生成 Module Trace 受控视图
→ 与其他 Contract / Design Candidate 一起写入
→ 任一写入、校验或 Manifest 更新失败时恢复全部目标
```

正式结果中不得出现：

```text
Contract 已合并但 Trace 未合并
Trace 已合并但 Module 视图未更新
部分 Candidate 已写入但 Merge 返回失败
```

#### `verification-report-contract.ts`

增加结构化人工 Contract 审查记录的格式，使未支持语言或自由文本 Contract 的人工证据可以被机器验证其完整性。

不得用自由文本“已审查”代替结构化证据。

#### `verification-governance-contract.ts`

实施中通过真实调用链确认：结构化人工 Contract 审查虽然由报告 Schema 定义，但其 Evidence ID 还必须进入 Verification 的证据一致性检查，否则报告可以携带审查记录，闭包却无法证明该记录引用了已登记 Evidence。

因此该文件进入最小生产范围，只负责把 `contract_reviews[].evidence` 纳入现有 Evidence 对账，不增加新的验证体系。

### 19.3 当前不需要修改的生产文件

源码证据已经证明以下文件不是本 P0 的主要缺口位置：

```text
packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts
packages/daemon-core/src/tools/lib/impact-analysis.ts
packages/daemon-core/src/tools/lib/gate-chain.ts
packages/daemon-core/src/tools/lib/changed-files-audit.ts
packages/daemon-core/src/tools/lib/code-permission-service-v11.ts
packages/types/src/contract-model.ts
setup/userlevel-opencode/tools/lib/sf_trace_matrix_core.ts
```

原因：

- `impact-analysis.ts` 只生成初始 Trigger Result 和字段归一化，不持有项目正式模型；消费者自动推导应由 Runtime 的项目治理模型完成；
- `gate-chain.ts` 已把四个治理检查接入现有 Gate；
- `changed-files-audit.ts` 已完成文件是否越过允许写入范围的事实审计；
- `code-permission-service-v11.ts` 已调用治理范围冻结函数，消费者范围应在该函数内部正确推导；
- 当前 Contract Schema 已足以表达 owner、source_refs 和 enforcement，P0 不增加消费者字段；
- 旧 Trace Core 不承担 Architecture / Contract 关系语义。

实施中若确有一手证据证明上述文件必须修改，必须先更新本文件并重新确认范围。

### 19.4 必须同步的 Agent 与 Workflow

```text
setup/userlevel-opencode/agents/sf-design.md
setup/userlevel-opencode/agents/sf-task-planner.md
setup/userlevel-opencode/agents/sf-verifier.md
setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-contract-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-spec-migration/SKILL.md                  （实施中经回归证据确认）
```

要求：

- `sf-design` 明确产生 `DD constrained_by Contract` 的正式设计意图；
- `sf-task-planner` 的 `trace_delta.md` 必须区分完整工程追溯表与正式关系 `ADD / REMOVE` 操作；
- `sf-verifier` 必须提交机器检查结果或结构化人工 Contract 审查证据；
- Contract Change 路径发现 Design、代码消费者或 Promotion 影响时必须退出无代码轻量路径；
- Quick Change 发现 Contract 消费或正式关系变化时必须升级，不得以“无影响”声明绕过。

Agent 和 Skill 只负责正确生产和消费治理信息；最终裁决仍由 Runtime 和 Gate 执行。

实施中运行仓库既有 Agent/Skill 最终治理合同回归时，确认 `sf-workflow-architecture-change` 与 `sf-workflow-spec-migration` 的合同区段遗漏了仓库统一要求的 Fast Path、no-merge、Code Permission / Audit 边界词项。该缺口在 `e242768` 基线已经存在，属于 P2 Agent/Skill 合同对齐缺陷，不是 P0 新逻辑造成。为使同一治理合同恢复一致，本轮只补足通用边界，不改变两个 Workflow 的业务行为：Architecture Change 仍需正常 Merge 和代码权限；Spec Migration 仍为纯规格、不得释放代码权限。

### 19.5 明确禁止扩大

本次 P0 不处理：

```text
Requirement 治理扩展
完整 Contract 兼容性五分类（保留为 P1）
所有编程语言的通用 AST / 编译器分析
三个核心 Gate 的最终 Soft → Hard 产品收口
daemon 生命周期
服务器部署
fj1
GOV-DEBT-001 packages/daemon-core/.specforge
```

本次不得：

- 新建第二套消费者 Registry；
- 在 Contract 或 Module 定义中增加消费者数组；
- 新建新的 Contract Gate；
- 新建新的 Trace 文件体系；
- 新建新的 Relation 名称；
- 以文本搜索继续充当正式消费者事实；
- 以 warning 冒充未支持语言已经验证。

---

## 20. 回归测试矩阵

> **适用范围**：`PRODUCT_DEVELOPMENT`；被验证行为属于 `PROJECT_GOVERNANCE`。

必须一次性覆盖以下场景。

### Trace 基础

1. 合法 ADD；
2. 合法 REMOVE；
3. 关系变更 REMOVE + ADD；
4. REMOVE 不存在关系 → BLOCK；
5. 重复 ADD → BLOCK；
6. 重复 REMOVE → BLOCK；
7. From ID 不存在 → BLOCK；
8. To Contract 不存在 → BLOCK；
9. 非法关系方向 → BLOCK；
10. 合并后悬空关系 → BLOCK。

### Module Contract

11. 本 Module DD 消费本 Module Contract → PASS；
12. 其他 Module DD 消费 Module Contract → BLOCK；
13. 文本中出现 Contract ID 但 Trace 未登记，不把文本当正式关系；
14. Trace 登记但 DD Module 不可确定 → BLOCK。

### Project Contract

15. 多 Module 正常消费 Project Contract → PASS；
16. 删除 Project Contract但仍有消费者 → BLOCK；
17. 破坏性修改且所有消费者同步更新 → PASS；
18. 破坏性修改遗漏一个消费者 → BLOCK。

### Promotion

19. 完整 Module → Project Promotion → PASS；
20. 缺少新 Project Contract → BLOCK；
21. 未删除或替代旧 Module Contract → BLOCK；
22. 缺少消费者 REMOVE → BLOCK；
23. 缺少消费者 ADD → BLOCK；
24. 缺少 Design 更新 → BLOCK；
25. 缺少 Contract 来源关系更新 → BLOCK；
26. 缺少兼容或迁移结论 → BLOCK；
27. Contract 与 Trace 不能原子合并 → 整体失败且正式状态不改变。

### Impact Scope / Code Permission

28. Contract 变化自动展开全部 consumer Modules；
29. Impact Scope 人工漏写消费者，Runtime 自动补全；
30. 无法唯一确定消费者 → BLOCK；
31. Code Permission 覆盖全部批准消费者；
32. 未批准消费者 Module 的代码文件不能写入。

### 实际代码对账

33. 支持的 TS/JS 依赖与 Trace 一致 → PASS；
34. 代码实际消费但 Trace 未登记 → BLOCK；
35. Trace 声明消费但 Contract 已删除 → BLOCK；
36. 其他 Module 生产代码直接依赖 Internal Contract → BLOCK；
37. 未支持语言且无人工审查证据 → BLOCK；
38. 未支持语言但有完整人工审查证据 → PASS。

### 流程

39. Fast Path 声称 Contract 不变但实际关系变化 → BLOCK；
40. Candidate Gate、Merge、Verification、Close 全链路闭环；
41. Module Trace 视图与项目权威矩阵不一致 → BLOCK；
42. 安装态 Tool/Agent/Skill 与仓库源码规则一致。

---

## 21. 精确源码证据与正式治理前置结论

> **适用范围**：`PRODUCT_DEVELOPMENT`；目标行为属于 `PROJECT_GOVERNANCE` 和 `BOTH`。
>
> **取证日期**：2026-08-02
>
> **取证基线**：`main@57c5eb5`
>
> **取证方式**：只读 `git archive` 精确源码包；未启动 daemon，未启动 OpenCode，未修改程序代码。

### 21.1 任务目标

在不建立平行治理机制的前提下，实现：

```text
Trace 唯一 Contract 消费者真相源
ADD / REMOVE 严格失败关闭
Prospective Trace
Internal Contract 跨 Module 阻断
Module → Project Contract Promotion 完整性
Impact Scope 与 Code Permission 消费者反向展开
正式 Trace 消费者与生产代码实际 Module 依赖对账
Contract / Design / Trace 应用级原子 Merge
```

### 21.2 适用权威规则

```text
GOV-PRE-001
GOV-CONTRACT-001
GOV-SCOPE-001
GOV-POST-001
GOV-EVID-001
CON-PROJ-001
CON-MOD-001
CON-PROM-001
CON-CONS-SOURCE-001
CON-CONS-DELTA-001
CON-CODE-CONS-001
CON-CONS-001
CON-ENFORCE-001
CON-TEST-001
CON-REVIEW-001
```

本次不需要再次修订唯一权威文件。问题属于权威规则已确定、程序尚未完整落实。

### 21.3 一手源码事实

#### 事实 A：旧 Trace Core 不是 Contract 语义执行中心

`packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts` 的文件说明和主函数只读取：

```text
requirements.md
design.md
tasks.md
```

并检查 Requirement→Design→Task 覆盖。

结论：

```text
不应在本 P0 中把它扩展成第二套 Architecture / Contract Trace 解释器。
```

#### 事实 B：当前语义 Trace 模型位于 `project-governance-v2.ts`

当前文件已经：

- 读取 Project Architecture、Data Model、Module Design、Project/Module Contract；
- 解析 `constrained_by` 和 `enforces`；
- 读取 `trace_delta.md`；
- 把一致性、Contract、Trace 和 Verification 结果接入 Gate。

结论：

```text
P0 必须在这条现有调用链上闭环。
```

#### 事实 C：`DD constrained_by Contract` 当前被判为非法

当前 `relationValid()` 只允许：

```text
DATA constrained_by ARCH
DD constrained_by ARCH / DATA
Contract enforces ARCH / DATA / DD
```

未允许：

```text
DD constrained_by Contract
```

结论：

```text
CON-CONS-SOURCE-001 尚未落实。
```

#### 事实 D：ADD / REMOVE 当前静默忽略错误

当前逻辑：

```text
REMOVE 找不到关系
→ 不报错

ADD 已存在
→ 不报错
```

结论：

```text
CON-CONS-DELTA-001 尚未 Fail Closed。
```

#### 事实 E：`trace_delta.md` 当前可能覆盖并丢失正式 Trace

Candidate Manifest 把：

```text
candidates/trace_delta.md
```

映射到：

```text
.specforge/project/trace_matrix.md
```

Prospective Reader 会先把该 Candidate 当作完整正式文件投影；Merge Runner 也会直接复制它。

因此已有项目只写本次 ADD / REMOVE 时，未在 Delta 中重复出现的现有正式关系可能从新 `trace_matrix.md` 消失。

结论：

```text
这是 P0 实际代码缺陷；
必须改为 Current Trace + Delta → 新正式矩阵，而不是 Delta 覆盖矩阵。
```

#### 事实 F：Internal Contract 跨 Module 检查仍是文本搜索

当前 `checkProjectGovernanceContracts()` 使用正则在其他 Module 的 `design_text` 中搜索 Contract ID。

结论：

```text
正式消费者事实仍未由 Trace 唯一提供。
```

#### 事实 G：Project Contract 破坏性变更仍依赖 `[contract:...]`

当前 `contract-integrity.ts` 扫描 Project Spec Markdown，并以：

```text
[contract:kind:id]
```

标记识别消费者。

结论：

```text
CON-CONS-SOURCE-001 未落实；
标记和 Trace 形成双重消费者事实。
```

#### 事实 H：Impact Scope 和 Code Permission 从来源推导 Contract，不从消费者推导

当前冻结代码权限时：

- 先按允许修改文件推导 Module；
- 再从 DD→ARCH/DATA 和 Contract `source_refs` 推导 Contract refs。

没有执行：

```text
变化 Contract
→ 反向查询全部消费 DD
→ 推导全部消费 Module
```

结论：

```text
CON-CODE-CONS-001 尚未落实。
```

#### 事实 I：实际代码检查只覆盖部分 Project shared enum

当前 `code-contract-verifier.ts`：

- 只读取 `extension_registry.json`；
- 只检查 changed files；
- 只识别 TS/JS 显式类型绑定；
- 只报告非法 enum 值；
- 不报告实际 Contract→文件→Module 消费关系；
- 未支持语言进入 `unsupported_files`。

Verification Gate 当前对 `unsupported_files` 仍然：

```text
passed: true
severity: warning
```

结论：

```text
无法证明依赖完整时仍可能通过；
违反 CON-CODE-CONS-001 和 CON-REVIEW-001。
```

#### 事实 J：Merge Runner 不是应用级原子事务

当前 Merge Runner 逐个复制或删除目标文件；中途失败只把 `result.success` 改为 `false`，不会恢复已经成功写入的目标。

结论：

```text
Contract、Design、Trace 可能形成部分生效状态；
必须加入事务前快照和失败恢复。
```

#### 事实 K：Module Trace 仍可独立成为事实

当前新 Module Candidate 要求独立提供 `trace.md`，Merge Runner 直接复制该文件，没有证明它一定由项目级 Trace Matrix 投影产生。

结论：

```text
项目级 Trace 唯一真相源与 Module 受控视图尚未落实。
```

#### 事实 L：Agent 的 Trace Delta 格式仍以完整工程链为主

当前 `sf-task-planner.md` 要求：

```text
REQ → AC → DD → TASK → FILE → TEST
```

但没有规定正式关系操作表：

```text
ADD / REMOVE | From | Relation | To
```

结论：

```text
即使 Runtime 增加强制，生产者合同也必须同步。
```

### 21.4 受影响治理对象

```text
Architecture：不改变 Architecture 内容模型
Data Model：不改变 Data Model 内容模型
Module Design：增加 DD 消费 Contract 的正式 Trace 关系
Project Contract：允许多 Module 正式消费
Module Contract：只允许 owner Module 消费
Trace：成为唯一消费者关系真相源
Impact Scope：按消费者反向展开
Code Permission：冻结全部正式消费者 Module
Changed Files Audit：继续提供实际文件事实，不改其基本职责
Verification：对账正式消费者、实际消费者和人工审查证据
Close：沿用 Verification / Formal Version 结果，不新增 Gate
```

### 21.5 受影响生产者和消费者

生产者：

```text
sf-design
sf-task-planner
Runtime Candidate / Gate 逻辑
Merge Runner
sf-verifier
```

消费者：

```text
Spec Consistency Gate
Contract Integrity Gate
Trace Gate
Code Permission
Executor 上下文
Changed Files Audit 后置治理检查
Verification Gate
Close Gate
```

### 21.6 正常行为

```text
Contract 变化
→ Runtime 查询 Current Trace 消费者
→ Impact Scope 覆盖全部消费者
→ Design 和 Trace Delta 同 WI 更新
→ 三个 Gate 检查 Prospective Trace
→ User Decision 批准 Delta
→ Merge Runner 事务化生成正式矩阵和 Module 视图
→ Code Permission 覆盖全部消费 Module
→ Verification 对账实际代码依赖
→ 证据闭合后 Close
```

### 21.7 必须阻断的异常行为

```text
重复 ADD
REMOVE 不存在关系
DD 或 Contract ID 不存在
非法关系方向
跨 Module 消费 Internal Contract
删除 Contract 但仍有消费者
Promotion 缺少任一设计或 Trace 迁移动作
Impact Scope 漏掉消费者
Code Permission 漏掉消费者 Module
代码实际消费但 Trace 未登记
未支持语言没有结构化人工审查证据
Delta 被直接覆盖成正式矩阵
Merge 失败后留下部分正式文件
Module Trace 与项目 Trace 不一致
```

### 21.8 实际测试文件范围

新增：

```text
packages/daemon-core/tests/unit/governance-trace-model.test.ts
packages/daemon-core/tests/unit/p0-contract-consumer-merge.test.ts
```

扩展：

```text
packages/daemon-core/src/tools/lib/project-governance-greenfield-code-permission.test.ts
packages/daemon-core/tests/unit/code-contract-verifier.test.ts
packages/daemon-core/tests/unit/contract-integrity.test.ts
packages/daemon-core/tests/unit/contracts-registry.test.ts
packages/daemon-core/tests/unit/verification-governance-contract.test.ts
packages/daemon-core/tests/v11-agent-skill-contract-alignment.test.ts
packages/daemon-core/tests/verification-report-contract-delegation.test.ts
```

实施结果与冻结计划相比有两项路径收敛：

1. Trace 共享模型测试放在统一的 `tests/unit`，避免把新的治理语义测试混入旧 Requirement Trace Core；
2. 原子 Merge 场景放在 `p0-contract-consumer-merge.test.ts`，直接覆盖现有 Merge Runner，而不是建立独立测试子系统。

所有新增测试都执行真实生产函数，不以纯字符串断言代替核心行为；Agent/Skill 合同测试只负责文档运行合同的一致性防退化。

### 21.9 治理前置结论

```text
任务目标：明确
一手证据：充分
权威规则：无需修改
实际代码缺陷：确认
最小实现中心：确认
允许修改范围：冻结
禁止修改范围：冻结
测试范围：冻结
daemon/OpenCode：不需要
服务器/fj1：不涉及
证据不足项：真实 OpenCode + WorkDesk 运行验证尚未执行
```

当前实现已经在隔离工作副本中完成，并保持在第 19 节及本轮一手证据批准的最小扩展范围内。实现包尚未替换进用户仓库，仓库内真实依赖环境的单元测试、TypeScript no-emit、构建和 Git 范围审计仍未执行，因此 P0 状态保持 `IN_PROGRESS`，不得宣布关闭；自动化验证完成后仍需 WorkDesk 真实项目验证。

---

## 22. 实施文件生命周期

> **适用范围**：`PRODUCT_DEVELOPMENT`。

本文件是该 P0 缺陷唯一实施记录，状态只允许：

```text
APPROVED_FOR_IMPLEMENTATION
IN_PROGRESS
COMPLETED
```

### 开始修改代码时

状态改为：

```text
IN_PROGRESS
```

并在本文件追加：

```text
实施开始 commit SHA
实际允许修改文件
与原设计相比的范围变化
新增证据不足项
```

### 实施过程中

发现新的 Module、消费者、Contract、Trace、Gate 或文件影响时：

```text
停止扩大修改
→ 更新本文件的影响范围与测试矩阵
→ 重新完成治理前置结论
→ 再继续
```

不得只在聊天中说明，也不得另建一个临时实施方案取代本文件。

### 实施完成时

状态改为：

```text
COMPLETED
```

并在本文件追加：

```text
完成 commit SHA
实际修改文件
架构一致性结论
Contract 一致性结论
Trace 一致性结论
实际范围审计
测试、类型检查和构建结果
真实项目验证结果
未解决问题
INSUFFICIENT_EVIDENCE
```

只有上述内容闭合后，本缺陷才允许关闭。

## 23. 缺陷记录

> **适用范围**：`PRODUCT_DEVELOPMENT`。

```text
编号：GOV-DEFECT-CONTRACT-CONSUMER-001

名称：
Contract 正式消费者与实际代码消费者未形成 Trace 驱动闭环

分类：
CONTRACT_CONSUMER_TRUTH_SOURCE_MISMATCH
TRACE_SEMANTIC_GAP
CROSS_MODULE_BOUNDARY_ENFORCEMENT_GAP
IMPACT_SCOPE_UNDER_APPROXIMATION
CODE_CONSUMER_EVIDENCE_GAP

优先级：
P0

直接根因：
现有实现沿用“显式文档标记/文本扫描”的旧消费者模型，
未以 Prospective Trace 为唯一正式消费者依据。

修复目标：
Trace 唯一真相源；
ADD/REMOVE 原子变更；
跨 Module Internal Contract 阻断；
Promotion 完整性检查；
Impact Scope 与 Code Permission 反向展开；
正式消费者与实际代码依赖闭环。

关闭条件：
本文件第 20 节的 42 项回归场景全部通过；
相关类型检查、构建和全仓回归通过；
真实业务项目验证 Contract 增加、取消、变更及 Promotion；
没有 INSUFFICIENT_EVIDENCE。
```

本轮同时确认并修复一个既有 P2 对齐缺陷：

```text
编号：GOV-DEFECT-AGENT-SKILL-CONTRACT-ALIGNMENT-001
分类：P2_AGENT_SKILL_CONTRACT_ALIGNMENT_BASELINE_GAP
事实：e242768 基线中的 Architecture Change 和 Spec Migration Skill 合同区段不满足仓库既有统一合同回归。
根因：工作流特定文本省略了统一 Fast Path、no-merge、Code Permission 和 Audit 边界词项。
修复：只补足统一合同边界，不改变两个工作流的既有业务路径。
回归：v11-agent-skill-contract-alignment.test.ts 全部通过。
真实项目验证：随 Phase 11 WorkDesk 验证。
```

---

## 24. 设计批准状态

> **适用范围**：`PRODUCT_DEVELOPMENT`。

```text
根因分析：完成
目标架构：完成
Gate 职责划分：完成
Trace ADD/REMOVE 规则：完成
Module Contract 边界设计：完成
Promotion 设计：完成
Impact Scope / Code Permission 设计：完成
生产代码消费者对账设计：完成
精确源码取证：完成
正式治理前置结论：完成
允许修改范围：已冻结并按一手证据记录最小扩展
回归测试矩阵：已冻结

用户仓库代码实现：完成
用户仓库目标测试：95 通过，0 失败
TypeScript no-emit：通过
daemon-core build：通过
全仓 deterministic build：通过
实施提交：60cbbd3829c67d67f99cf76570b59fb6fa79b35d
本地与远程 main：已同步
工作区：干净
安装压缩包：已清理
WorkDesk 真实创建链验证：已执行，WI-0003正式superseded，WI-0004自动创建并绑定PSV-0002
WorkDesk Contract Consumer完整场景：未执行
daemon/OpenCode：由用户手工启动并完成本轮创建验证
```

本文件当前状态仍为 `IN_PROGRESS`。程序实现、自动化测试、类型检查、构建、提交和远程同步已经完成；WorkDesk 已完成正式 Tool/Runtime 创建链和 Project Spec Version Binding 真实验证，但 Contract Consumer 的 Contract、Trace、Impact Scope、Code Permission、实际代码消费者、Promotion、Merge、Verification 和 Close 场景仍未真实端到端验证，因此不得提前标记 `COMPLETED`，也不得启用最终 Hard Enforcement。

---

## 25. 本轮实施记录

> **适用范围**：`PRODUCT_DEVELOPMENT`；实现的产品行为属于 `PROJECT_GOVERNANCE` 和 `BOTH`。
>
> **实施开始基线**：`main@e242768`
>
> **实施提交**：`60cbbd3829c67d67f99cf76570b59fb6fa79b35d`
>
> **实现位置**：用户仓库 `main`；本地与远程已经同步，工作区干净。

### 25.1 关键实现决定

#### 同一个 Trace 文件承载两类关系，但只保留一个物理真相源

现有 `.specforge/project/trace_matrix.md` 同时承担：

```text
REQ → AC → DD → TASK → FILE → TEST → EVIDENCE 的工程追溯
Architecture / Data / Design / Contract 的治理关系
```

本轮不新建第二个 Trace 文件，而是在同一正式文件中使用受控区段：

```text
<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->
<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->
```

WI 的关系变更只写入：

```text
<!-- SPECFORGE_GOVERNANCE_DELTA_START -->
<!-- SPECFORGE_GOVERNANCE_DELTA_END -->
```

Merge 只替换治理关系区段，保留原有工程追溯内容。旧项目未激活治理关系区段时继续兼容原 Trace Delta 和 Module Trace；一旦激活，Project Trace 成为唯一权威，Module Trace 只能由它生成。

#### 原子 Merge

Merge Runner 在写入前保存全部目标快照；Contract、Design、Project Trace、Module Trace 投影或 Manifest 任一步失败时恢复全部目标，并把返回的版本和 `spec_manifest` 更新状态恢复为事务前事实。

#### 实际代码消费者证据

支持的 TypeScript/JavaScript 显式 Contract 绑定由现有代码验证器机器检查；未支持语言和自由文本依赖必须在 `verification_report` 中提供结构化 `contract_reviews`。机器证据和人工证据都不存在时，Verification Gate 失败关闭。

### 25.2 实际生产修改

新增：

```text
packages/daemon-core/src/tools/lib/governance-trace-model.ts
```

修改：

```text
packages/daemon-core/src/tools/lib/project-governance-v2.ts
packages/daemon-core/src/tools/lib/contract-integrity.ts
packages/daemon-core/src/tools/lib/contracts-registry.ts
packages/daemon-core/src/tools/lib/code-contract-verifier.ts
packages/daemon-core/src/tools/lib/gate-runner-v11.ts
packages/daemon-core/src/tools/lib/merge-runner-v11.ts
packages/daemon-core/src/tools/lib/verification-report-contract.ts
packages/daemon-core/src/tools/lib/verification-governance-contract.ts
```

未修改冻结排除项：

```text
sf_trace_matrix_core.ts
impact-analysis.ts
gate-chain.ts
changed-files-audit.ts
code-permission-service-v11.ts
packages/types/src/contract-model.ts
```

### 25.3 实际 Agent / Skill 修改

```text
setup/userlevel-opencode/agents/sf-design.md
setup/userlevel-opencode/agents/sf-task-planner.md
setup/userlevel-opencode/agents/sf-verifier.md
setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-contract-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-spec-migration/SKILL.md
```

### 25.4 隔离环境与用户仓库真实验证结果

隔离工作副本首先执行了 67 项行为验证和 18 个变更 TypeScript 文件语法诊断，全部通过。

随后在用户仓库 `main@e242768` 的真实依赖环境中完成：

```text
目标测试文件：18
测试场景：95
通过：95
失败：0
expect 调用：1691
```

覆盖：

```text
Trace 工程追溯内容保留与治理区段替换
严格 ADD / REMOVE 与重复、冲突、缺失操作阻断
DD constrained_by Project/Module Contract
Internal Contract 跨 Module 阻断
Contract 删除、破坏性修改与 Promotion
消费者反向展开到 Impact Scope / Code Permission
正式消费者与实际代码消费者对账
未支持语言结构化人工审查
应用级原子 Merge 和失败回滚
Verification Gate 集成
Agent / Skill 最终治理合同一致性
安装态结构一致性
候选合并兼容性
```

仓库真实验证：

```text
bunx tsc --noEmit -p packages/daemon-core/tsconfig.json：通过
packages/daemon-core bun run build：通过
根目录 deterministic workspace build：通过
29 个批准文件范围审计：通过
git diff --check：通过
```

测试过程中曾发现两条 Module Contract Promotion 测试夹具遗漏必填字段 `scope: "module"`。生产代码正确拒绝该无效 Contract。修复方式是整文件替换测试夹具，不放宽生产规则；修复后 95 项测试全部通过。

### 25.5 WorkDesk 真实创建链验证

2026-08-04 使用已安装 SpecForge Tool 和正式 Runtime 状态机完成：

```text
WI-0003：workflow_selected → superseded
历史WI目录、events、observability和payload：全部保留
新建WI：省略work_item_id，自动分配WI-0004
WI-0004 candidate_manifest.base_spec_version：PSV-0002
WI-0004 candidate_manifest.entries：[]
WI-0004 Runtime状态：created
Candidate：未生成
业务代码：未修改
```

该结果关闭独立缺陷 `P0-PSV-BINDING-001`，并证明 WorkDesk 已经能够通过真实
OpenCode + SpecForge Tool 进入新 Work Item 创建链。它不证明 Contract Consumer
主线的 Contract、Trace、Impact Scope、Code Permission、实际代码消费者、
Promotion、Merge、Verification 和 Close 已完成。

### 25.6 当前证据不足

```text
INSUFFICIENT_EVIDENCE：真实业务项目中的 Project Contract 新增和多个DD消费者尚未端到端验证
INSUFFICIENT_EVIDENCE：Impact Scope与Code Permission按正式Trace反向展开尚未真实验证
INSUFFICIENT_EVIDENCE：实际代码消费者与正式Trace对账尚未真实验证
INSUFFICIENT_EVIDENCE：Contract删除、破坏性变更和Module→Project Promotion尚未真实验证
INSUFFICIENT_EVIDENCE：原子Merge、Verification和Close尚未真实验证
```

因此当前不得把 P0 状态改为 `COMPLETED`，也不得启用最终 Hard Enforcement。

### 25.7 下一验证边界

下一步先只读重建 WorkDesk 当前真实项目基线：

```text
读取Project Architecture和Data Model
读取全部Module定义、Module Design和Module Contract
读取Project Contract和正式Trace
读取Module code_paths及现有生产代码
识别一个Contract生产者、多个DD消费者和对应Module
设计WI-0004的最小完整真实场景
```

场景执行顺序必须为：

```text
Project Contract新增
→ 多个DD constrained_by登记
→ Impact Scope和Code Permission反向展开
→ 实际代码消费者与正式Trace对账
→ 破坏性变更阻断
→ Module Contract升级为Project Contract
→ 原子Merge
→ Verification
→ Close
```

涉及 daemon 或 OpenCode 时，必须先明确告知用户，由用户手工启动。不得自动启动、停止或重启 daemon/OpenCode。

### 25.8 V24 WorkDesk源码与Contract基线审计

2026-08-04 在 daemon/OpenCode 均停止的条件下执行只读审计：

```text
SpecForge HEAD：553a6e4bcf414118dc4e038d96d4b1f1f980870f
WorkDesk HEAD：254e24646d10c6f71fc150ac80f689d007392170
WorkDesk tracked文件：48
WorkDesk Runtime/WI快照文件：17
SpecForge相关生产者/消费者文件：138
Project Modules：CORE、CLI、DOMAIN、REPORTING、STORAGE
Project Contract：0
Module contracts.json：5
正式Contract Registry条目：4
legacy internal namespace条目：2
正式Project Trace治理关系：0
```

正式 Contract Registry 能消费的4项 Module Contract 为：

```text
DOMAIN / WorkItemStatus / shared_enum
REPORTING / ReportFormatter / extension_point
STORAGE / WorkItemRepository / public_interface
STORAGE / PERSISTENCE_VIA_REPOSITORY / invariant
```

`CommandName` 与 `TransitionErrorCode` 位于 legacy `internal_contracts`，
不属于当前 `ContractRegistrySchema` 的四类正式 Contract，不能把外部审计统计
`6` 直接解释为六项正式 Contract。

V24 辅助脚本曾报告一处非 STORAGE 持久化调用。复核源码后确认该命中仅来自：

```text
src/cli/main.ts 注释：no direct fs / Bun.file calls
```

去除注释后的可执行源码中，CLI、DOMAIN、REPORTING没有文件系统API调用。
真实 `node:fs` import 和读写调用只存在于 `src/storage/json-file-store.ts`。
该问题属于辅助取证脚本误报，不属于WorkDesk产品缺陷。

### 25.9 WI-0004 第一阶段真实场景冻结

#### 场景目标

```text
把DOMAIN Module Contract中的WorkItemStatus同ID规范化为Project Contract
激活Project Trace正式治理区段
建立四个Module的正式DD消费者
为后续Impact Scope、Code Permission和实际代码对账建立真实基线
```

#### Project Contract定义

```json
{
  "id": "WorkItemStatus",
  "owner_module": "DOMAIN",
  "value_type": "string",
  "values": ["NEW", "IN_PROGRESS", "DONE"],
  "source_refs": ["DATA-WD-003"],
  "enforcement": "TypeScript explicit binding + DOMAIN runtime state-machine validation"
}
```

#### 正式治理关系

```text
ADD WorkItemStatus enforces DATA-WD-003
ADD DD-DOMAIN-003 constrained_by WorkItemStatus
ADD DD-STORAGE-001 constrained_by WorkItemStatus
ADD DD-REPORTING-002 constrained_by WorkItemStatus
ADD DD-CLI-002 constrained_by WorkItemStatus

ADD ReportFormatter enforces DD-REPORTING-001
ADD DD-REPORTING-001 constrained_by ReportFormatter

ADD WorkItemRepository enforces DD-STORAGE-001
ADD DD-STORAGE-001 constrained_by WorkItemRepository

ADD PERSISTENCE_VIA_REPOSITORY enforces DD-STORAGE-001
ADD DD-STORAGE-001 constrained_by PERSISTENCE_VIA_REPOSITORY
```

#### 冻结Impact Scope

```text
affected_modules:
- DOMAIN
- STORAGE
- REPORTING
- CLI

architecture_refs:
- ARCH-WD-003
- ARCH-WD-006

data_model_refs:
- DATA-WD-003

design_refs:
- DD-DOMAIN-003
- DD-STORAGE-001
- DD-REPORTING-001
- DD-REPORTING-002
- DD-CLI-002

project_contract_refs:
- WorkItemStatus

module_contract_refs:
- ReportFormatter
- WorkItemRepository
- PERSISTENCE_VIA_REPOSITORY

planned_code_paths:
- src/domain/transitions.ts
- src/storage/repository.ts
- src/reporting/formatters.ts
- src/cli/main.ts
```

#### Phase 1停止边界

Phase 1 只允许完成 Candidate 和 Gate：

```text
created
→ intake_ready
→ impact_analyzing
→ impact_analyzed
→ workflow_selected
→ candidate_preparing
→ gates_running
→ approval_required
```

到 `approval_required` 必须停止。不得在Phase 1执行：

```text
User Decision
Merge
Code Permission
业务代码修改
Verification
Close
```

任何Gate要求新增未冻结模块、Contract、正式文件或业务代码时，必须停止并重新执行影响分析。

#### 后续Work Item边界

```text
WI-0004：Project Contract新增、多DD消费者、Impact Scope、Code Permission、实际代码对账、原子Merge、Verification、Close
WI-0005：WorkItemStatus删除或删值的破坏性变更阻断
WI-0006：ReportFormatter显式Module→Project Promotion
```

不能把WI-0004的同ID规范化宣称为 `CON-PROM-001` Promotion；显式Promotion必须具有
旧正式关系REMOVE、新正式关系ADD、消费者迁移、兼容性结论和promotion记录。

### 25.10 WI-0004 Phase 1真实运行结果

OpenCode 通过正式 Tool 将 WI-0004 从 `created` 推进到 Candidate Gate，并严格在第二次
Gate失败后停止：

```text
第一次Candidate Gate：5 passed / 5 failed
一次正式修复：补充候选产物并按可恢复HardStop协议恢复
第二次Candidate Gate：6 passed / 4 failed
Runtime最终状态：gates_failed
User Decision：未执行
Merge：未执行
Code Permission：未执行
业务代码修改：未执行
Verification / Close：未执行
```

Candidate内容事实：

```text
Project Contract候选：WorkItemStatus，内容正确
DOMAIN Module Contract候选：已删除WorkItemStatus，内容正确
Governance Relation Delta：11条ADD，0条REMOVE，内容正确
candidate_manifest.entries：仅extension_registry 1项
```

失败链不是WorkDesk业务内容错误，而是SpecForge产品链存在三个阻断缺陷：

```text
1. sf_contract_register写入1条显式Manifest后，inferManifestEntries采用“显式条目完全优先”，
   后续Architecture、Module Design、Module Contract和Trace Delta候选不再进入Manifest。
2. architecture_change full Candidate Gate无条件要求并执行Requirement Candidate/Gate，
   与本WI requirement_changed=false等正式Classification冲突。
3. V25场景文档和提示词使用不存在的gates_passed状态；正式通过状态是approval_required。
```

运行中 `sf-design` 还调用了 `sf_safe_bash` 尝试写治理产物。Write Guard正确产生HardStop，
Orchestrator按 `operator_error` 放弃原动作并改用 `sf_artifact_write` 后安全恢复；说明Runtime
安全边界有效，但Agent/Skill工具约束仍需补强。

### 25.11 修复设计

#### Runtime Candidate Manifest物化

```text
candidate_preparing
→ Runtime读取trigger_result.classification
→ 合并已有显式Manifest条目
→ 发现规范Candidate路径
→ 只加入实际Classification要求的Candidate
→ 检查同一candidate/target冲突
→ 缺少必需Candidate时拒绝推进
→ 写入完整candidate_manifest.entries
→ candidate_prepared
```

Gate、Approval和Merge继续消费已经冻结的显式Manifest，不在后续阶段重新猜测文件系统。
这同时保留既有“显式有效Manifest优先”回归规则，并把路径发现职责放回Runtime边界。

WI-0004恢复时，已有CORE Requirement Candidate和Project Data Model Candidate不属于正式
Classification要求，只保留为失败轮次历史证据，不进入Manifest，也不参与Merge。

#### Classification驱动Candidate Gate

```text
Requirement相关字段为true → Requirement Candidate + Requirements Gate
design_changed=true → Module Design Candidate + Design Gate
architecture_changed=true → Architecture Candidate
data_model_changed=true → Data Model Candidate
module_contract_changed=true → Module Contract Candidate
full实现路径 → tasks.md + trace_delta.md + Tasks Gate
```

Classification缺失时保留原有严格配置并失败关闭，避免旧项目静默降级。

#### Agent / Skill边界

```text
sf-design不得调用sf_safe_bash写治理产物
专业Agent只写自己拥有的Candidate
Runtime在candidate_preparing→candidate_prepared物化Manifest
Candidate Gate通过后的正式状态是approval_required
```

### 25.12 修复后恢复边界

修复、测试、提交、推送和用户级升级完成前，不得继续WI-0004。

升级后由用户手工启动daemon/OpenCode，通过正式Tool执行：

```text
gates_failed → candidate_preparing
→ 不新增、不删除、不手工改写现有Candidate
→ candidate_preparing → candidate_prepared
→ 验证Runtime生成完整Manifest
→ candidate_prepared → gates_running
→ 运行Candidate Gate一次
→ 通过时进入approval_required并立即停止
```

恢复阶段不得记录User Decision、不得Merge、不得释放Code Permission、不得修改业务代码。

### 25.13 V26产品修复与工程验证边界

V26实现范围：

```text
packages/daemon-core/src/tools/lib/governance-invariants-v11.ts
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
packages/daemon-core/src/tools/lib/gate-runner-v11.ts
setup/userlevel-opencode/agents/sf-design.md
setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md
相关Manifest、状态边界、Gate、Agent/Skill和经验回归测试
```

Runtime职责收口：

```text
candidate_preparing → candidate_prepared前读取权威Runtime状态
→ 读取trigger_result.classification
→ 从已有显式条目与规范Candidate文件形成实际所需Manifest
→ 排除Classification未要求的历史Candidate
→ 检查缺项、重复candidate和重复target
→ 原子替换candidate_manifest.json
→ 状态迁移失败时恢复迁移前Manifest
```

Gate职责收口：

```text
Requirement语义未变化 → 不要求Requirement Candidate，不执行Requirements Gate
Requirement语义变化 → 要求Requirement Candidate并执行Requirements Gate
design_changed=true → 要求Design Candidate并执行Design Gate
full实现阶段 → tasks.md、trace_delta.md和Tasks Gate保持必需
Classification缺失 → 保留历史严格profile并失败关闭
```

V26自动化验证不能替代WorkDesk恢复重验。产品修复提交、用户级安装升级和
installer一致性通过后，`ERR-067`、`ERR-068`、`ERR-070`仍保持
`FIXED_PENDING_WORKDESK_RETEST`；只有WI-0004通过正式Tool进入
`approval_required`，且Manifest和Gate证据符合冻结预期，才能关闭。

### 25.14 V26零写入失败与V27隔离验证修正

V26没有进入产品修复或工程验证。实际结果：

```text
RESULT=FAILED
FAILED_STAGE=WORKDESK_WI0004_EVIDENCE
ERROR=missing hard_stop.json
PATCH_FILES_APPLIED=0/13
```

HardStop生命周期一手证据表明：活动 `hard_stop.json` 在恢复完成后由Runtime删除；完整历史记录稳定保存在 `hard_stop_resolution.jsonl` 的 `original_hard_stop` 字段中。V26把活动锁错误当作永久证据，属于ERR-071。

V27保持13文件产品修复范围，不修改权威方案，不修改WorkDesk。V27先从 `main@d6dc931072aca519354fb4bc0857a64aacc58961` 导出隔离副本，只在隔离副本应用补丁并完成：

```text
Candidate Manifest Runtime物化与同步回归
规范Candidate发现、缺项和冲突回归
Classification驱动Candidate与专业Gate回归
正式approval_required状态回归
sf-design禁止sf_safe_bash写治理产物
architecture_change Skill使用sf_artifact_write
TypeScript noEmit
daemon-core build
全仓deterministic build
git diff --check
隔离用户目录installer install + verify
```

WorkDesk只读审计不再作为源码修复的因果前置。缺少活动HardStop时读取resolution日志；其他现场证据不足标记 `INSUFFICIENT_EVIDENCE`，但不得触碰或清理WorkDesk。V27成功前不提交、不安装真实用户级组件、不推送、不恢复WI-0004。

### 25.15 V27类型检查失败与V28验证顺序修正

V27只在隔离副本应用13个文件，真实仓库、WorkDesk、用户级安装、daemon和OpenCode均未改变。实际证据：

```text
V27定向测试73/73通过
TYPECHECK-DAEMON-CORE失败
workspace内部依赖声明缺失：6项
本次gate-runner可选workflowPath类型错误：2项
后续daemon-core build、全仓build、installer隔离验证：未执行
```

内部workspace包的 `types` 入口指向各自构建生成的 `dist` 声明，因此V27直接运行daemon-core noEmit的顺序不成立；同时正式 `GateContext.workflowPath` 为可选字段，本次新增辅助函数错误收窄为必填字符串。

V28继续冻结同一13文件产品范围：先按正式workspace拓扑构建daemon-core的内部依赖声明，再运行定向测试；随后立即运行daemon-core TypeScript noEmit、daemon-core build、全仓deterministic build、`git diff --check` 和隔离installer install/verify。缺少workflowPath时Candidate和专业Gate采用历史严格profile失败关闭，并由运行回归与TypeScript共同覆盖。

V28隔离验证已经成功；真实SpecForge、WorkDesk和真实用户级安装在V28中均未修改。

### 25.16 V28隔离验证成功与V29真实仓库应用边界

V28证据结果：

```text
13个冻结文件：隔离应用成功
依赖声明准备：通过
定向测试：74/74通过
daemon-core TypeScript noEmit：通过
daemon-core build：通过
全仓deterministic build：通过
git diff --check：通过
隔离installer install + verify：119/119通过
最终范围：精确13文件
权威文件：未修改
真实SpecForge、WorkDesk、真实用户级安装：未修改
提交、推送：未执行
daemon、OpenCode：未启动
```

V28证明当前13文件实现和验证顺序能够闭合，但不能替代真实仓库应用，也不能替代WorkDesk恢复重验。

V29允许把同一13文件应用到真实SpecForge仓库并复跑相同验证。V29失败必须回滚到
`main@d6dc931072aca519354fb4bc0857a64aacc58961` 的12个原文件并删除新增测试文件；
V29成功后保持13文件未提交状态，先上传证据复核，不安装真实用户级组件、不推送、不启动
daemon/OpenCode、不恢复WI-0004。

V29成功并完成提交、推送和用户级升级后：

```text
ERR-067、ERR-068、ERR-070：FIXED_PENDING_WORKDESK_RETEST
ERR-069、ERR-071、ERR-072：FIXED_VALIDATED_V28
```

只有WI-0004通过正式Tool重新进入 `approval_required`，且Manifest、Classification Gate和
Agent工具边界符合冻结预期，才能关闭ERR-067、ERR-068和ERR-070。

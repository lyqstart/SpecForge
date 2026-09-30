# 需求文档

## 简介

SpecForge V3.7（Verification Strategy）为规格文档框架引入系统化的验证策略管理能力。

当前系统中，5 种检测方法（unit、property、integration、e2e、regression）已经存在，但它们的使用时机没有被系统化地管理：`tasks.md` 的 `verification_commands` 是平铺的字符串列表，`sf_verification_gate` 只检查测试是否通过而不区分类型，规格文档也没有机制约定"这个需求需要属性测试"或"这个功能需要端到端测试"。

V3.7 在三个层面引入验证策略绑定：

1. **requirements.md 层**：每个需求可声明需求级 `verification_strategy`，指定应使用哪种检测方式验证该需求
2. **design.md 层**：正确性属性（Correctness Properties）直接绑定到对应的测试类型和测试文件
3. **tasks.md 层**：每个 task 的 `verification_commands` 按检测类型分组（unit / property / integration / e2e / regression），并通过 `refs` 字段建立与需求的机器可追溯链路

同时，`sf-task-planner` 在生成 `tasks.md` 时根据需求的 `verification_strategy` 自动选择对应的测试命令类型，`sf_tasks_gate` 交叉验证任务层面的验证类型覆盖了需求层面的声明，`sf-verifier` 执行类型化命令并生成结构化 Verification_Report，`sf_verification_gate` 按检测类型分别检查验证报告。

### 当前系统状态

- 5 种检测方法：unit（单元测试）、property（属性测试/fast-check）、integration（集成测试）、e2e（端到端测试）、regression（回归测试）
- `tasks.md` 的 `verification_commands` 是平铺的字符串列表，无类型区分
- `sf_verification_gate` 只检查测试是否通过，不区分测试类型
- `sf_tasks_gate` 只检查 `verification_commands` 字段是否存在，不检查类型结构
- `sf-task-planner` 生成 `verification_commands` 时不参考需求的验证策略
- 没有机制让规格文档约定"这个需求需要属性测试"

### V3.7 设计原则

1. **向后兼容**：`verification_strategy` 为可选字段，不声明时行为与 V3.6 完全一致；旧格式 `verification_commands` 不改变 pass/fail 语义
2. **声明式绑定**：验证策略在 requirements.md 中以需求级字段声明，沿 requirements → design → tasks 链路传播
3. **类型化命令**：`verification_commands` 从字符串列表升级为按类型分组的结构化对象；非命令文本通过独立的 `manual_verification_checks` 字段表达
4. **Gate 双重保障**：sf_tasks_gate 交叉验证 Planned_Verification_Types 覆盖 Declared_Required_Types；sf_verification_gate 验证 Planned_Verification_Types 均有通过记录
5. **结构化验证报告**：sf-verifier 产出结构化 JSON 报告，sf_verification_gate 优先基于结构化字段判断，不依赖自然语言解析
6. **接口扩展安全**：新增输出字段放置在可选 `details` 下，不破坏现有调用方

## 术语表

- **Verification_Strategy**：验证策略，在 requirements.md 的需求中声明的检测方式列表，指定该需求应使用哪些测试类型来验证。作用域为需求级（整个 REQ），不是单条 AC 级。
- **Verification_Type**：验证类型，5 种检测方法之一：`unit`（单元测试）、`property`（属性测试/fast-check）、`integration`（集成测试）、`e2e`（端到端测试）、`regression`（回归测试）。所有合法值均为小写。
- **Typed_Verification_Commands**：类型化验证命令，`tasks.md` 中按 Verification_Type 分组的 `verification_commands` 结构，替代原有的平铺字符串列表
- **Correctness_Property**：正确性属性，`design.md` 中描述系统应满足的数学/逻辑性质，V3.7 起绑定到具体的 Verification_Type 和测试文件
- **Declared_Required_Types**：声明必需类型，从 requirements.md 中各需求的 `verification_strategy` 字段推导出的 Verification_Type 集合，表示"规格层面声明应该测什么"。design.md 中 Correctness_Property 的 `test_type` 字段不独立贡献 Declared_Required_Types，仅供 sf-task-planner 选择命令分组和测试路径使用。
- **Planned_Verification_Types**：计划验证类型，从 tasks.md 中所有 task 的类型化 `verification_commands` 键推导出的 Verification_Type 集合，表示"任务层面计划测什么"
- **Strategy_Propagation**：策略传播，`verification_strategy` 从 requirements.md 沿 requirements → design → tasks 链路传递的机制
- **Verification_Report**：验证报告，sf-verifier 执行验证后产出的结构化 JSON 文件，包含每条命令的类型、状态、退出码等信息
- **sf_verification_gate**：验证门禁工具，V3.7 起按 Verification_Type 分别检查测试结果
- **sf_tasks_gate**：任务门禁工具，V3.7 起检查 `verification_commands` 的类型化结构，并交叉验证 Planned_Verification_Types 覆盖 Declared_Required_Types
- **sf-task-planner**：任务规划 Agent，V3.7 起根据需求的 `verification_strategy` 自动选择对应的测试命令类型

## 需求

### REQ-1 requirements.md 验证策略声明

**用户故事：** 作为规格文档作者，我希望在 requirements.md 的每个需求中声明适合的验证策略，指定应该用哪种检测方式来验证该需求，使验证意图在文档层面显式化。

#### 验收标准

1. THE requirements.md 格式 SHALL 支持在每个需求的验收标准区块中声明可选的 `verification_strategy` 字段，格式为：
   ```markdown
   **verification_strategy**: [unit, property, integration, e2e, regression]
   ```
2. THE `verification_strategy` 字段 SHALL 接受以下合法值的任意非空子集：`unit`、`property`、`integration`、`e2e`、`regression`
3. THE `verification_strategy` 字段 SHALL 为需求级（REQ 级）字段，作用于整个需求，不是单条验收标准的字段。
4. IF 需求未声明 `verification_strategy`，THEN THE 系统 SHALL 将该需求视为无验证策略约束，`sf_verification_gate` 对该需求不执行类型检查
5. THE `verification_strategy` 字段 SHALL 为可选字段，不声明时不影响现有工作流的任何行为
6. WHEN `verification_strategy` 包含 `property` 时，THE requirements.md 格式 SHALL 支持在对应验收标准条目旁标注属性测试的子类型（如 invariant、round-trip、idempotence、metamorphic），格式为：
   ```markdown
   1. [property:round-trip] WHEN 配置文件被序列化后反序列化，THE Parser SHALL 产生等价的配置对象
   ```
   此 AC 级标注仅用于说明属性测试的具体类型，不参与 Declared_Required_Types 推导（推导仅基于需求级 `verification_strategy`）。
7. THE `sf_requirements_gate` 工具 SHALL 在默认模式下验证 `verification_strategy` 字段的值合法性：若声明了 `verification_strategy`，则其值必须是合法 Verification_Type 的子集；非法值导致 Gate fail

### REQ-2 design.md 正确性属性与测试类型绑定

**用户故事：** 作为规格文档作者，我希望在 design.md 的正确性属性（Correctness Properties）中直接绑定对应的测试类型和测试文件，使设计层面的验证意图与实现层面的测试文件明确关联。

#### 验收标准

1. THE design.md 的 Correctness Properties 章节 SHALL 支持为每个正确性属性声明 `test_type` 和 `test_file` 字段，格式为：
   ```markdown
   #### CP-1 配置解析的往返一致性
   - **test_type**: property
   - **test_file**: tests/property/config_parser.property.test.ts
   - **property**: WHEN 任意合法配置对象被序列化后再解析，THE Parser SHALL 产生等价的配置对象
   ```
2. THE `test_type` 字段 SHALL 接受与 Verification_Type 相同的合法值：`unit`、`property`、`integration`、`e2e`、`regression`
3. THE `test_file` 字段 SHALL 为可选字段；当声明时，其值为相对于项目根目录的测试文件路径
4. THE `sf_design_gate` 工具 SHALL 在默认模式下验证 Correctness Properties 中 `test_type` 字段的值合法性：若声明了 `test_type`，则其值必须是合法 Verification_Type；非法值导致 Gate fail
5. IF design.md 中的 Correctness Properties 声明了 `test_type`，THEN THE `sf-task-planner` SHALL 在生成对应任务的 `verification_commands` 时，将该属性的验证命令归入对应的类型分组
6. THE design.md 的 Correctness Properties 章节 SHALL 支持通过 `requirement_ref` 字段引用 requirements.md 中的需求编号，建立 CP → REQ 的追溯关系：
   ```markdown
   - **requirement_ref**: REQ-1
   ```
7. THE `Correctness_Property.test_type` 字段 SHALL NOT 独立贡献 Declared_Required_Types。`sf_design_gate` 在默认模式下 SHALL 只验证 design.md 本地语法（`test_type` 值合法性），不跨文件读取 requirements.md 进行冲突检查。CP.test_type 与 REQ verification_strategy 的潜在冲突由 sf_tasks_gate 在交叉验证阶段发现。

### REQ-3 tasks.md 类型化验证命令

**用户故事：** 作为规格文档作者，我希望 tasks.md 中每个 task 的 `verification_commands` 按检测类型分组，而不是混在一起的字符串列表，使验证命令的类型意图清晰可读。

#### 验收标准

1. THE tasks.md 的每个 task SHALL 支持使用类型化的 `verification_commands` 结构，格式为：
   ```markdown
   - **verification_commands**:
     - unit: `bun test tests/unit/config_parser.test.ts`
     - property: `bun test tests/property/config_parser.property.test.ts`
     - integration: `bun test tests/integration/config_flow.test.ts`
   ```
2. THE 类型化 `verification_commands` 中的每个类型键 SHALL 是合法的 Verification_Type（`unit`、`property`、`integration`、`e2e`、`regression`）
3. THE 类型化 `verification_commands` 中的每个类型键 SHALL 支持单条命令（字符串）或多条命令（列表），且所有命令 SHALL 为可执行的 shell 命令：
   ```markdown
   - **verification_commands**:
     - unit:
       - `bun test tests/unit/parser.test.ts`
     - e2e: `bun test tests/e2e/full_flow.test.ts`
   ```
4. IF 需要记录人工检查项（非可执行命令），THE task SHALL 使用独立的 `manual_verification_checks` 字段，不得混入 `verification_commands`：
   ```markdown
   - **manual_verification_checks**:
     - `确认 src/parser.ts 文件已创建`
   ```
   THE `manual_verification_checks` 字段 SHALL 为可选的非空字符串列表。`sf_tasks_gate` 和 `sf_doc_lint` SHALL 接受该字段并仅验证其结构（必须是字符串列表）。`manual_verification_checks` SHALL NOT 被 sf-verifier 执行，SHALL NOT 贡献 Planned_Verification_Types。
5. THE tasks.md 的每个使用类型化 `verification_commands` 的 task SHALL 包含 `refs` 字段，且 `refs` 字段 SHALL 包含至少一个 REQ-N 引用；若 task 验证了 Correctness_Property，还应包含对应的 CP-N 编号：
   ```markdown
   - **refs**: [REQ-1, REQ-3, CP-2]
   ```
   旧格式（平铺列表）的 task MAY 省略 `refs` 字段。
6. THE 旧格式（平铺字符串列表）SHALL 继续被 `sf_tasks_gate` 和 `sf_doc_lint` 接受，不产生 error（向后兼容）；但 `sf_tasks_gate` 和 `sf_doc_lint` 在检测到旧格式时 SHALL 产生相同的 non-blocking warning，提示迁移到类型化格式。旧格式不改变 pass/fail 判定结果。
7. THE `sf_tasks_gate` 工具 SHALL 在检查 tasks.md 时，若某个 task 使用了类型化 `verification_commands`，则验证每个类型键的合法性；非法类型键导致 Gate fail
8. THE `sf_doc_lint` 工具 SHALL 在检查 tasks.md 时，对类型化 `verification_commands` 执行相同的合法性验证
9. THE `sf_tasks_gate` 工具 SHALL 交叉验证，规则如下：

   **场景 A：typed task 无 refs**
   IF a task uses typed `verification_commands` but omits `refs`, THEN sf_tasks_gate SHALL fail with blocking_issue：`"Task {task_id} uses typed verification_commands but lacks REQ refs; cannot verify strategy coverage."`

   **场景 B：refs 指向的 REQ 无 verification_strategy**
   IF a referenced REQ-N has no `verification_strategy` declared, THEN that REQ-N SHALL NOT contribute to Declared_Required_Types for this task（忽略，不 fail）。

   **场景 C：refs 指向多个 REQ，部分有 strategy，部分没有**
   sf_tasks_gate SHALL collect `verification_strategy` from all referenced REQ-N that declare it, ignore REQ-N without `verification_strategy`, and use the union as Declared_Required_Types for that task.

   **场景 D：Planned_Verification_Types 未覆盖 Declared_Required_Types**
   IF the task's typed `verification_commands` type keys (Planned_Verification_Types) do not cover all types in Declared_Required_Types, THEN sf_tasks_gate SHALL fail with blocking_issue：`"Task {task_id} missing verification type(s) [{missing_types}] required by refs [{req_refs}]"`

   示例：`"Task TASK-3 missing verification type(s) [property, integration] required by refs [REQ-2, REQ-5]"`

   **场景 E：typed task 包含 property 命令但 refs 中无 CP-N**
   IF a task has `property` in its typed `verification_commands` but `refs` contains no CP-N reference, THEN sf_tasks_gate SHALL fail with blocking_issue：`"Task {task_id} has property verification_commands but no CP-N ref; property test without Correctness_Property traceability is not allowed."`

10. THE `sf_tasks_gate` 交叉验证中，对于 `property` 类型命令的测试文件路径检查：
    - 若 refs 包含 CP-N 且对应 CP 声明了 `test_file`，sf_tasks_gate SHALL 验证 property 命令路径与 `test_file` 一致（warning 级别，不 fail）
    - 若 refs 包含 CP-N 但 CP 未声明 `test_file`，sf_tasks_gate SHALL 接受约定路径 `tests/property/{cp_id}.property.test.ts`（pass）

### REQ-4 sf-task-planner 根据验证策略生成类型化命令

**用户故事：** 作为 SpecForge 用户，我希望 sf-task-planner 在生成 tasks.md 时，能根据需求的 `verification_strategy` 自动选择对应的测试命令类型，而不是生成无类型区分的平铺命令列表。

#### 验收标准

1. WHEN `sf-task-planner` 读取 requirements.md 时，THE sf-task-planner SHALL 提取每个需求的 `verification_strategy` 字段，并将其与对应的设计决策（DD-N）和任务关联
2. WHEN `sf-task-planner` 生成某个 task 的 `verification_commands` 时，THE sf-task-planner SHALL 根据该 task 关联的需求的 `verification_strategy` 决定生成哪些类型分组：
   - 若关联需求声明了 `verification_strategy: [unit, property]`，则生成 `unit:` 和 `property:` 两个类型分组
   - 若关联需求未声明 `verification_strategy`，则生成旧格式（平铺列表）以保持向后兼容
3. WHEN `sf-task-planner` 生成 `property` 类型的验证命令时，THE sf-task-planner SHALL 按以下优先级确定测试文件路径：
   - 优先级 1：若关联 CP 声明了 `test_file` → 使用该路径
   - 优先级 2：若关联 CP 存在但未声明 `test_file` → 使用约定路径 `tests/property/{cp_id}.property.test.ts`
   - 优先级 3：若 task 无关联 CP-N（refs 中无 CP-N）→ sf_tasks_gate 将在交叉验证阶段 fail（见 REQ-3 AC-10）
4. THE `sf-task-planner` 生成的类型化 `verification_commands` SHALL 满足 REQ-3 定义的格式规范
5. WHEN 多个需求关联到同一个 task 且声明了不同的 `verification_strategy` 时，THE sf-task-planner SHALL 取所有关联需求的 `verification_strategy` 的并集作为该 task 的类型分组
6. THE `sf-task-planner` 生成的 typed task SHALL 包含 `refs` 字段，列出关联的 REQ-N 编号；若 task 验证了 Correctness_Property，还应包含对应的 CP-N 编号
7. NOTE：sf-task-planner 是 LLM Agent，其输出不保证完全符合策略。sf_tasks_gate 的交叉验证（REQ-3 AC-9）是最终保障，Agent 可以犯错但 Gate 会拦截。

### REQ-5 sf_verification_gate 按类型分别检查

**用户故事：** 作为 SpecForge 用户，我希望 sf_verification_gate 能按检测类型分别检查测试结果，识别哪些类型的测试是必须通过的，而不是只检查测试是否通过。

#### 验收标准

1. THE `sf_verification_gate` 工具 SHALL 在默认模式下读取 tasks.md，提取所有 task 的类型化 `verification_commands`，推导出本次验证的 Planned_Verification_Types 集合（所有 task 中出现的类型键的并集）
2. WHEN `sf_verification_gate` 检查验证报告时，THE sf_verification_gate SHALL 对 Planned_Verification_Types 中的每种类型分别检查：该类型的测试是否在验证报告中有对应的通过记录
3. IF Planned_Verification_Types 中某种类型的测试在验证报告中没有通过记录，THEN THE sf_verification_gate SHALL 将该类型标记为 missing，并在 blocking_issues 中报告：`"缺少 {type} 类型测试的通过记录"`
4. THE `sf_verification_gate` 的检查结果 SHALL 在 `details.type_results` 字段中包含按类型分组的状态报告（不得作为顶层字段，以保持 GateResult 接口向后兼容）：
   ```json
   {
     "status": "fail",
     "blocking_issues": ["缺少 integration 类型测试的通过记录"],
     "warnings": [],
     "next_action": "revise",
     "details": {
       "type_results": {
         "unit": "passed",
         "property": "passed",
         "integration": "missing",
         "e2e": "passed"
       }
     }
   }
   ```
   `type_results` 中每个类型的合法状态值为：`"passed"`、`"missing"`、`"failed"`、`"skipped"`
5. IF tasks.md 中所有 task 均使用旧格式（平铺列表）的 `verification_commands`，THEN THE sf_verification_gate SHALL 回退到 V3.6 的默认检查行为（向后兼容）
6. IF tasks.md 同时包含旧格式和类型化 `verification_commands`（混合格式），THEN THE sf_verification_gate SHALL 对类型化 task 执行按类型检查，对旧格式 task 执行 V3.6 默认检查，并产生 non-blocking warning 提示存在混合格式
7. THE `sf_verification_gate` 工具 SHALL 支持通过可选参数 `required_types` 显式指定必须通过的类型集合：
   ```json
   { "required_types": ["unit", "property", "e2e"] }
   ```
   IF `required_types` 参数已提供，THEN sf_verification_gate SHALL 使用该参数执行类型检查，无论 tasks.md 格式如何（覆盖从 tasks.md 推导的 Planned_Verification_Types，且不触发旧格式 fallback）。
8. THE `sf_verification_gate` 检查 `property` 类型测试结果时，SHALL 优先基于 Verification_Report 的结构化字段（`commands[].type` 和 `commands[].status`）判断；仅当结构化字段不可用时，MAY 使用 fast-check stdout 文本作为 fallback（识别 `• x passed`、`x tests passed`、`Counterexample` 等模式），且 fallback 路径 SHALL 有 fixture-based 单元测试覆盖。
9. IF `required_types` 参数中包含某种类型，但 Verification_Report 中没有该类型的通过记录，THEN sf_verification_gate SHALL 将该类型标记为 `"missing"`，blocking_issue 为：`"缺少 {type} 类型测试的通过记录；该类型可能未执行、未上报或未通过"`。此行为与该类型是否出现在 tasks.md 无关。

### REQ-6 sf-verifier 执行验证命令并生成 Verification_Report

**用户故事：** 作为 SpecForge 用户，我希望 sf-verifier 能读取 tasks.md 中的类型化验证命令，执行后生成结构化的 Verification_Report，使 sf_verification_gate 能按类型分别检查结果。

#### 验收标准

1. THE sf-verifier SHALL 读取当前 Work Item 的 tasks.md，收集所有 task 的 `verification_commands`
2. FOR 类型化 `verification_commands` 中的每条命令，THE sf-verifier SHALL 执行该命令，并在报告中将 `commands[].type` 设置为该命令所属的 Verification_Type 键
3. FOR 旧格式（平铺列表）`verification_commands` 中的每条命令，THE sf-verifier SHALL 执行该命令，并在报告中省略 `commands[].type` 字段（表示旧格式命令）
4. THE `manual_verification_checks` 字段中的条目 SHALL NOT 被 sf-verifier 执行，SHALL NOT 出现在 Verification_Report 中
5. THE sf-verifier SHALL 将 Verification_Report 写入 `specforge/specs/{workItemId}/verification_report.json`
6. IF tasks.md 同时包含类型化和旧格式命令（混合格式），THE sf-verifier SHALL 分别处理：类型化命令写入带 `type` 字段的记录，旧格式命令写入不带 `type` 字段的记录，两者共存于同一 `commands` 数组
7. THE sf-verifier SHALL 继续生成 V3.6 兼容的 `verification_report.md`（Markdown 格式），与 `verification_report.json` 同时产出，以保持向后兼容
8. THE sf-verifier SHALL 使用 **collect-all** 执行策略：当某条命令执行失败（exit_code != 0）时，SHALL 将该命令记录为 `status="failed"` 并继续执行后续命令，不中断整个验证流程。最终报告 SHALL 包含所有已尝试或已跳过命令的记录。IF 某条命令因前置条件失败、超时或执行器错误而无法启动，THEN sf-verifier SHALL 将该命令记录为 `status="skipped"`，并在 `stderr` 中说明原因。
9. THE sf-verifier SHALL 以原子方式写入 `verification_report.json`：先写入临时文件，完成后重命名为最终文件名。写入完成后，报告的 `status` 字段 SHALL 设置为 `"completed"`。

#### Verification_Report 最小 Schema

sf-verifier 产出的验证报告文件（`verification_report.json`）SHALL 满足以下最小结构：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-001",
  "status": "completed",
  "commands": [
    {
      "type": "property",
      "command": "bun test tests/property/a.property.test.ts",
      "status": "passed",
      "exit_code": 0,
      "stdout": "...",
      "stderr": "..."
    },
    {
      "command": "bun test tests/legacy.test.ts",
      "status": "passed",
      "exit_code": 0
    }
  ]
}
```

顶层字段说明：
- `schema_version`：字符串，必填，当前值为 `"1.0"`
- `work_item_id`：字符串，必填，当前 Work Item 的 ID
- `status`：`"completed"` | `"incomplete"`，必填。sf-verifier 正常完成时写入 `"completed"`；原子写入机制确保调用方只会看到 `"completed"` 或文件不存在两种状态（临时文件不可见）
- `commands`：数组，必填

`commands` 数组元素字段：
- `type`：Verification_Type 合法值之一，**可选**。typed 命令必须填写；旧格式命令省略此字段。
- `command`：执行的命令字符串，必填
- `status`：`"passed"` | `"failed"` | `"skipped"`，必填
- `exit_code`：整数，必填（skipped 时可为 -1）
- `stdout` / `stderr`：字符串，可选

#### sf_verification_gate 对报告完整性的处理

IF `verification_report.json` 不存在、JSON 格式非法、或顶层 `status` 字段不为 `"completed"`，THEN sf_verification_gate SHALL fail with blocking_issue：`"Verification report is missing, malformed, or incomplete."`

sf_verification_gate 的报告查找优先级：
1. 优先读取 `specforge/specs/{workItemId}/verification_report.json`（V3.7 结构化报告）
2. 若不存在，回退到 V3.6 行为（查找 `verification_report.md` 或其他测试输出文件）

#### verification 阶段执行顺序

THE verification workflow SHALL execute sf-verifier before sf_verification_gate for the same Work Item. sf_verification_gate SHALL NOT be invoked until sf-verifier has completed report generation.

### REQ-7 sf_requirements_gate 验证策略合法性检查

**用户故事：** 作为 SpecForge 维护者，我希望 sf_requirements_gate 能验证 requirements.md 中 `verification_strategy` 字段的合法性，防止无效的验证策略声明进入后续流程。

#### 验收标准

1. THE `sf_requirements_gate` 工具 SHALL 在默认模式下扫描 requirements.md 中所有需求的 `verification_strategy` 字段
2. WHEN `sf_requirements_gate` 发现 `verification_strategy` 字段包含非法值时，THE sf_requirements_gate SHALL 将该问题记录为 blocking_issue，导致 Gate fail
3. THE 合法的 `verification_strategy` 值 SHALL 为以下集合的非空子集：`unit`、`property`、`integration`、`e2e`、`regression`
4. WHEN `sf_requirements_gate` 发现 `verification_strategy` 字段为空列表时，THE sf_requirements_gate SHALL 将该问题记录为 blocking_issue（空列表无意义，应省略该字段）
5. IF requirements.md 中没有任何需求声明 `verification_strategy`，THEN THE sf_requirements_gate SHALL 通过检查（不强制要求声明验证策略）
6. THE `sf_requirements_gate` 在检查 `verification_strategy` 时 SHALL 大小写不敏感解析，并将所有合法值规范化为小写 Verification_Type 后再传播（即 `Unit` 被接受并规范化为 `unit`）
7. WHEN requirements.md 不存在或文件读取失败，THEN THE sf_requirements_gate SHALL fail 并在 blocking_issues 中报告明确原因
8. WHEN `verification_strategy` 字段格式不是数组或可解析的逗号分隔列表（如 `verification_strategy: unit property` 无分隔符），THEN THE sf_requirements_gate SHALL fail 并报告格式错误
9. WHEN `verification_strategy` 包含重复的类型值时，THE sf_requirements_gate SHALL 去重并产生 non-blocking warning，不 fail

### REQ-8 向后兼容

**用户故事：** 作为 SpecForge 用户，我希望 V3.7 的所有变更不影响现有规格文档和工作流的行为。

#### 验收标准

1. THE 未声明 `verification_strategy` 的 requirements.md 文件 SHALL 通过 `sf_requirements_gate` 检查，行为与 V3.6 完全一致
2. THE 使用旧格式（平铺字符串列表）`verification_commands` 的 tasks.md 文件 SHALL 通过 `sf_tasks_gate` 检查，pass/fail 判定结果与 V3.6 完全一致（仅新增 non-blocking migration warning，不改变 pass/fail 状态）
3. THE `sf_verification_gate` 在处理旧格式 tasks.md 时 SHALL 回退到 V3.6 的默认检查行为
4. THE 现有 4 种工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change）和 V3.6 新增的 4 种工作流的行为 SHALL 完全不变
5. THE 现有 16 个 Custom Tool 的接口兼容规则如下：
   - 现有必填输入字段 SHALL NOT 被删除或重命名
   - 新增输入字段 SHALL 为可选字段
   - 新增输出数据 SHALL 放置在可选的 `details` 字段下，不得新增顶层必填字段
   - 现有文档（V3.6 格式）的 pass/fail 语义 SHALL 保持不变
   - THE `GateResult` 接口 SHALL 扩展为：
     ```typescript
     interface GateResult {
       status: "pass" | "fail" | "blocked";
       blocking_issues: string[];
       warnings: string[];
       next_action: "continue" | "revise" | "ask_user";
       kg_sync?: SyncSummary | null;
       details?: Record<string, unknown>;  // V3.7 新增，可选
     }
     ```
     现有调用方 SHALL NOT 被要求读取 `details` 字段；V3.7 工具 SHALL NOT 在 `details` 之外新增顶层必填字段。
   - ALL Custom Tools that return GateResult SHALL import or conform to the shared extended GateResult interface. Tools that do not use V3.7 details MAY omit the `details` field in their responses.
6. THE 现有 tasks.md 文件中的 `verification_commands` 字段 SHALL 继续被 `sf_doc_lint` 识别为合法格式，不产生 error

### REQ-9 测试与回归要求

**用户故事：** 作为 SpecForge 维护者，我希望 V3.7 的所有新增功能都有充分的测试覆盖，确保新功能正确且不破坏现有功能。

#### 验收标准

1. THE `verification_strategy` 字段解析 SHALL 有属性测试：
   - [property:round-trip] WHEN 任意合法的 `verification_strategy` 值被序列化后反序列化，THE Parser SHALL 产生等价的值（等价定义：两个值规范化为去重、小写、顺序无关的 Verification_Type 集合后相等）
   - [property:invariant] WHEN `verification_strategy` 包含任意合法类型子集时，THE sf_requirements_gate SHALL 通过检查；包含任意非法值时 SHALL fail
2. THE 类型化 `verification_commands` 解析 SHALL 有属性测试：
   - [property:invariant] WHEN 类型化 `verification_commands` 包含任意合法类型键时，THE sf_tasks_gate SHALL 通过检查；包含非法类型键时 SHALL fail
   - [property:metamorphic] WHEN 类型化 `verification_commands` 中同一 Verification_Type 下的命令顺序改变时，THE sf_tasks_gate 的结构校验结果 SHALL 不变（此属性仅适用于结构合法性检查，不适用于命令执行语义）
3. THE `sf_verification_gate` 的类型分组检查 SHALL 有属性测试：
   - [property:invariant] WHEN Planned_Verification_Types 中所有类型均有通过记录时，THE sf_verification_gate SHALL pass；任意类型缺少通过记录时 SHALL fail
4. THE `sf_requirements_gate` 的 `verification_strategy` 合法性检查 SHALL 有单元测试：
   - 合法值（单个类型、多个类型、所有类型）→ pass
   - 非法值（拼写错误、空列表、未知类型名）→ fail
   - 格式错误（非数组、无分隔符）→ fail
   - 重复值 → pass + warning（去重后继续）
   - 大小写混用（`Unit`、`PROPERTY`）→ pass，规范化为小写
   - 未声明 `verification_strategy` → pass（不强制要求）
5. THE `sf_tasks_gate` 的类型化命令检查 SHALL 有单元测试：
   - 合法类型化格式 → pass
   - 旧格式（平铺列表）→ pass + warning（pass/fail 状态与 V3.6 一致）
   - 非法类型键 → fail
   - 混合格式（部分 typed、部分旧格式）→ 对 typed 部分检查，对旧格式部分 V3.6 行为，整体 + warning
   - refs 指向需求声明了 property，但 typed commands 缺少 property 键 → fail，blocking_issue 包含 task_id
   - typed task 无 REQ-N refs → fail，blocking_issue 包含 task_id
   - typed task 有 property 命令但 refs 中无 CP-N → fail，blocking_issue 包含 task_id
6. THE `sf_verification_gate` 的类型分组检查 SHALL 有单元测试：
   - 所有 Planned_Verification_Types 均通过 → pass
   - 部分 Planned_Verification_Types 缺失 → fail + 具体缺失类型报告（在 details.type_results 中）
   - 旧格式 tasks.md → 回退到 V3.6 行为
   - 混合格式 tasks.md → typed 部分按类型检查，旧格式部分 V3.6 行为，+ non-blocking warning
   - required_types 参数提供时 → 无论 tasks.md 格式，按 required_types 执行类型检查
7. THE 向后兼容性 SHALL 有回归测试：
   - 现有 tasks.md 格式（旧格式）通过 `sf_tasks_gate` 不产生 error，pass/fail 与 V3.6 一致
   - 现有 requirements.md（无 `verification_strategy`）通过 `sf_requirements_gate` 不产生 error
   - 现有 `sf_verification_gate` 行为在旧格式下不变
8. THE `sf_design_gate` 对 Correctness Properties 新字段的检查 SHALL 有单元测试：
   - 合法 `test_type` 值 → pass
   - 非法 `test_type` 值 → fail
   - `test_file` 缺失（可选字段）→ pass
   - `requirement_ref` 引用不存在的 REQ-N → warning（不 fail，因为 gate 不跨文件验证）
9. THE `sf_doc_lint` 对类型化 `verification_commands` 的检查 SHALL 有单元测试：
   - 合法类型化格式 → pass
   - 旧格式 → pass + warning（与 sf_tasks_gate 行为一致）
   - 非法类型键 → fail
   - `manual_verification_checks` 字段存在 → pass（不报错）
10. THE `sf_verification_gate` 的 fast-check stdout fallback 识别 SHALL 有 fixture-based 单元测试，覆盖：
    - fast-check 通过输出（`• x passed`）→ passed
    - fast-check 失败输出（`Counterexample found`）→ failed
    - 普通 bun test 通过输出 → passed（不误判为 fast-check）
    - 格式异常/空输出 → warning，不 fail
11. THE `details.type_results` 字段 SHALL 有单元测试验证其不出现在顶层 GateResult，且现有调用方忽略 `details` 字段时行为不变
12. THE sf-verifier 的 Verification_Report 生成 SHALL 有单元/集成测试：
    - typed task 的命令 → 报告中对应记录有 `type` 字段，值为正确的 Verification_Type
    - 旧格式 task 的命令 → 报告中对应记录无 `type` 字段
    - `manual_verification_checks` 条目 → 不出现在报告中
    - 混合格式 task → typed 命令有 `type`，旧格式命令无 `type`，共存于同一 `commands` 数组
    - 命令执行失败（exit_code != 0）→ 记录 `status="failed"`，继续执行后续命令（collect-all）
    - 命令无法启动 → 记录 `status="skipped"`，stderr 包含原因
    - 正常完成 → 报告顶层 `status="completed"`，`schema_version="1.0"`，`work_item_id` 正确
    - 同时产出 `verification_report.json` 和 `verification_report.md`
    - sf_verification_gate 读取 status != "completed" 的报告 → fail，blocking_issue 包含 "incomplete"

# Requirements Document

## Introduction

本功能将 SpecForge 的 `requirements.md` 文档中的验收标准（Acceptance Criteria）格式从自由文本改为 EARS（Easy Approach to Requirements Syntax）格式。EARS 格式通过结构化关键词（WHERE、WHILE、WHEN、IF、THEN、THE、SHALL）强制需求的可测试性和明确性。

EARS 定义 5 种基础模式和 1 种组合模式：
- **Ubiquitous**：无条件始终成立 — `THE <system> SHALL <response>.`
- **Event-driven**：由事件触发 — `WHEN <trigger>, THE <system> SHALL <response>.`
- **State-driven**：特定状态下持续生效 — `WHILE <state>, THE <system> SHALL <response>.`
- **Optional-feature**：可选/可配置功能 — `WHERE <option>, THE <system> SHALL <response>.`
- **Unwanted-behavior**：异常/错误处理 — `IF <condition>, THEN THE <system> SHALL <response>.`
- **Complex**：组合多个条件子句，子句顺序为 WHERE → WHILE → WHEN/IF → THE → SHALL

变更范围限定在三个组件：
1. **sf-requirements Agent** 的 prompt — 强制使用 EARS 格式编写验收标准
2. **sf_requirements_gate** 的检查逻辑 — 对每条 AC 进行结构化模式验证
3. **superpowers-brainstorming Skill** — 引导需求收集时考虑 EARS 六种模式维度

`design.md` 和 `tasks.md` 保持现有格式不变。

## Glossary

- **EARS**: Easy Approach to Requirements Syntax，一种结构化需求书写方法，使用关键词模式确保需求的可测试性
- **EARS Pattern**: EARS 定义的 5 种基础模式 + 1 种组合模式（Ubiquitous、Event-driven、State-driven、Optional-feature、Unwanted-behavior、Complex）
- **Ubiquitous**: 无条件始终成立的需求，格式为 `THE <system> SHALL <response>.`
- **Event-driven**: 由特定事件触发的需求，格式为 `WHEN <trigger>, THE <system> SHALL <response>.`
- **State-driven**: 在特定状态下持续生效的需求，格式为 `WHILE <state>, THE <system> SHALL <response>.`
- **Optional-feature**: 可选功能的需求，格式为 `WHERE <option>, THE <system> SHALL <response>.`
- **Unwanted-behavior**: 异常/错误处理需求，格式为 `IF <condition>, THEN THE <system> SHALL <response>.`
- **Complex**: 组合多个条件的需求，子句顺序为 WHERE → WHILE → WHEN/IF → THE → SHALL
- **requirements_format**: 文档元数据字段，值为 `ears` 或 `legacy`，用于指示文档的验收标准格式模式
- **strict mode**: 当 `requirements_format: ears` 时启用的验证模式，要求每条 AC 必须匹配有效 EARS 模式
- **legacy mode**: 当文档不包含 `requirements_format` 元数据或值为 `legacy` 时的验证模式，仅发出非阻塞性警告
- **sf-requirements Agent**: SpecForge 系统中负责需求分析和 requirements.md 生成的子 Agent
- **sf_requirements_gate**: SpecForge 的需求质量门禁工具，检查 requirements.md 是否满足最低质量标准
- **superpowers-brainstorming Skill**: superpowers-brainstorming Skill，指导 Agent 从多维度进行需求头脑风暴
- **AC**: Acceptance Criterion，验收标准，requirements.md 中每条编号的需求语句
- **AC 标准输出格式**: `N. [Pattern-label] EARS句式.` — 编号 + 模式标签 + EARS 语句
- **Gate Check**: 阶段门禁检查，验证文档质量是否满足进入下一阶段的标准
- **EARS Keyword**: EARS 格式中的结构化关键词，包括 WHERE、WHILE、WHEN、IF、THEN、THE、SHALL

## Requirements

### Requirement 1: sf-requirements Agent EARS 格式生成

**User Story:** 作为 SpecForge 用户，我希望 sf-requirements Agent 自动使用 EARS 格式编写验收标准，以便生成的需求文档具有一致的结构化格式和可测试性。

#### Acceptance Criteria

1. [Event-driven] WHEN sf-requirements Agent 生成验收标准时, THE sf-requirements Agent SHALL 使用六种 EARS Pattern（Ubiquitous、Event-driven、State-driven、Optional-feature、Unwanted-behavior、Complex）之一来编写每条 AC。
2. [Ubiquitous] THE sf-requirements Agent SHALL 在每条 AC 中包含关键词 SHALL 以表示系统义务。
3. [Event-driven] WHEN AC 描述由事件触发的行为时, THE sf-requirements Agent SHALL 使用 Event-driven 模式，格式为 `WHEN <trigger>, THE <system> SHALL <response>.`。
4. [Event-driven] WHEN AC 描述特定状态下的持续行为时, THE sf-requirements Agent SHALL 使用 State-driven 模式，格式为 `WHILE <state>, THE <system> SHALL <response>.`。
5. [Event-driven] WHEN AC 描述错误处理或异常情况时, THE sf-requirements Agent SHALL 使用 Unwanted-behavior 模式，格式为 `IF <condition>, THEN THE <system> SHALL <response>.`。
6. [Event-driven] WHEN AC 描述可选或可配置功能时, THE sf-requirements Agent SHALL 使用 Optional-feature 模式，格式为 `WHERE <option>, THE <system> SHALL <response>.`。
7. [Event-driven] WHEN AC 无条件适用于所有场景时, THE sf-requirements Agent SHALL 使用 Ubiquitous 模式，格式为 `THE <system> SHALL <response>.`。
8. [Event-driven] WHEN AC 需要组合多个条件子句时, THE sf-requirements Agent SHALL 使用 Complex 模式，保持子句顺序为 WHERE → WHILE → WHEN/IF → THE → SHALL。
9. [Ubiquitous] THE sf-requirements Agent SHALL 在所有 WHEN、WHILE、WHERE、IF 条件子句末尾添加逗号，再接 THE 或 THEN。

### Requirement 2: sf_requirements_gate EARS 逐条结构化验证

**User Story:** 作为 SpecForge 系统维护者，我希望 sf_requirements_gate 对每条 AC 进行结构化模式验证，以便在质量门禁阶段精确检测格式不合规的需求。

#### Acceptance Criteria

1. [Event-driven] WHEN sf_requirements_gate 以 strict mode 检查 requirements.md 时, THE sf_requirements_gate SHALL 逐条验证每个 AC 是否匹配有效的 EARS Pattern（Ubiquitous、Event-driven、State-driven、Optional-feature、Unwanted-behavior、Complex）。
2. [Event-driven] WHEN sf_requirements_gate 以 strict mode 检查 requirements.md 且某条 AC 未匹配任何有效 EARS Pattern 时, THE sf_requirements_gate SHALL 报告一个阻塞性问题，消息中指明该 AC 的编号和不合规原因。
3. [Ubiquitous] THE sf_requirements_gate SHALL 保持向后兼容性，继续检查用户故事、验收标准部分和术语表的存在性。
4. [Event-driven] WHEN sf_requirements_gate 检测到 EARS 格式不合规时, THE sf_requirements_gate SHALL 将 next_action 设置为 "revise" 以触发 sf-requirements Agent 重新生成。
5. [Event-driven] WHEN sf_requirements_gate 以 legacy mode 检查 requirements.md 时, THE sf_requirements_gate SHALL 对不含 EARS Keyword 的 AC 报告非阻塞性警告，建议迁移到 EARS 格式。
6. [Event-driven] WHEN 某条 AC 缺少 `[Pattern-label]` 前缀时, THE sf_requirements_gate SHALL 在 strict mode 下报告一个阻塞性问题，要求补充模式标签。

### Requirement 3: superpowers-brainstorming EARS 维度引导

**User Story:** 作为 sf-requirements Agent，我希望 superpowers-brainstorming Skill 在头脑风暴阶段引导我考虑 EARS 六种模式维度，以便生成的需求能覆盖各种行为类型。

#### Acceptance Criteria

1. [Ubiquitous] THE superpowers-brainstorming Skill SHALL 在其头脑风暴框架中包含一个"EARS 模式覆盖"维度。
2. [Event-driven] WHEN superpowers-brainstorming Skill 引导需求分析时, THE superpowers-brainstorming Skill SHALL 提示考虑每种 EARS Pattern：哪些行为始终生效（Ubiquitous）、哪些由事件触发（Event-driven）、哪些依赖状态（State-driven）、哪些是可选的（Optional-feature）、哪些处理错误（Unwanted-behavior）、哪些需要组合条件（Complex）。
3. [Event-driven] WHEN superpowers-brainstorming Skill 完成全部基础维度分析后, THE superpowers-brainstorming Skill SHALL 在"需求编写"步骤开始之前展示 EARS 模式引导。

### Requirement 4: 向后兼容性与格式元数据

**User Story:** 作为 SpecForge 用户，我希望已有的 requirements.md 文件在新版本中仍能通过 Gate 检查，同时新文档通过元数据声明启用严格验证。

#### Acceptance Criteria

1. [Event-driven] WHEN sf_requirements_gate 检查不包含 `requirements_format` 元数据的 requirements.md 时, THE sf_requirements_gate SHALL 自动使用 legacy mode 进行验证。
2. [Ubiquitous] THE sf_requirements_gate SHALL 在 legacy mode 下将 EARS 格式合规性视为非阻塞性警告，不阻止 Gate 通过。
3. [Event-driven] WHEN sf-requirements Agent 生成新的 requirements.md 时, THE sf-requirements Agent SHALL 始终在文档中包含 `requirements_format: ears` 元数据声明。
4. [Event-driven] WHEN sf_requirements_gate 检查包含 `requirements_format: ears` 元数据的文档时, THE sf_requirements_gate SHALL 自动使用 strict mode 进行逐条 AC 验证。

### Requirement 5: AC 标准输出格式

**User Story:** 作为 SpecForge 用户，我希望 sf-requirements Agent 的输出格式统一且可机器解析，以便我能理解和审查生成的需求。

#### Acceptance Criteria

1. [Ubiquitous] THE sf-requirements Agent SHALL 以编号列表形式输出验收标准，每条 AC 格式为 `N. [Pattern-label] EARS句式.`。
2. [Ubiquitous] THE sf-requirements Agent SHALL 使用以下标准模式标签之一作为 `[Pattern-label]`：Ubiquitous、Event-driven、State-driven、Optional-feature、Unwanted-behavior、Complex。
3. [Ubiquitous] THE sf-requirements Agent SHALL 在 requirements.md 的术语表部分定义 EARS 模式中使用的所有系统名称。
4. [Event-driven] WHEN sf-requirements Agent 输出 AC 时, THE sf-requirements Agent SHALL 确保每条 AC 同时包含编号、模式标签和完整 EARS 语句三个组成部分。

### Requirement 6: EARS 验证模式选择

**User Story:** 作为 SpecForge 系统维护者，我希望 sf_requirements_gate 能根据文档元数据自动选择验证模式，以便新旧文档都能获得适当级别的质量检查。

#### Acceptance Criteria

1. [Event-driven] WHEN requirements.md 包含 YAML front-matter 且其中声明 `requirements_format: ears` 时, THE sf_requirements_gate SHALL 启用 strict mode 验证。
2. [Event-driven] WHEN requirements.md 包含 YAML front-matter 且其中声明 `requirements_format: legacy` 时, THE sf_requirements_gate SHALL 启用 legacy mode 验证。
3. [Event-driven] WHEN requirements.md 不包含 YAML front-matter 或 front-matter 中无 `requirements_format` 字段时, THE sf_requirements_gate SHALL 默认使用 legacy mode 验证。
4. [Unwanted-behavior] IF `requirements_format` 字段值既非 `ears` 也非 `legacy`, THEN THE sf_requirements_gate SHALL 报告一个阻塞性问题，消息指明无效的格式值。

### Requirement 7: EARS 模式分类规则

**User Story:** 作为 SpecForge 系统维护者，我希望 sf_requirements_gate 有明确的模式分类规则，以便准确判断每条 AC 属于哪种 EARS Pattern。

#### Acceptance Criteria

1. [Event-driven] WHEN AC 以 `THE <system> SHALL` 开头且不包含 WHEN、WHILE、WHERE、IF 子句时, THE sf_requirements_gate SHALL 将其分类为 Ubiquitous 模式。
2. [Event-driven] WHEN AC 以 `WHEN <trigger>,` 开头时, THE sf_requirements_gate SHALL 将其分类为 Event-driven 模式。
3. [Event-driven] WHEN AC 以 `WHILE <state>,` 开头时, THE sf_requirements_gate SHALL 将其分类为 State-driven 模式。
4. [Event-driven] WHEN AC 以 `WHERE <option>,` 开头时, THE sf_requirements_gate SHALL 将其分类为 Optional-feature 模式。
5. [Event-driven] WHEN AC 以 `IF <condition>,` 开头且包含 `THEN THE` 时, THE sf_requirements_gate SHALL 将其分类为 Unwanted-behavior 模式。
6. [Event-driven] WHEN AC 包含两个或以上条件子句（WHERE、WHILE、WHEN、IF 的组合）时, THE sf_requirements_gate SHALL 将其分类为 Complex 模式。
7. [Ubiquitous] THE sf_requirements_gate SHALL 在模式分类时忽略 `[Pattern-label]` 前缀，仅对 EARS 语句本体进行模式匹配。
8. [Ubiquitous] THE sf_requirements_gate SHALL 仅在条件子句按 WHERE → WHILE → WHEN 或 IF 顺序排列时接受 Complex 模式为合法。
9. [Unwanted-behavior] IF Complex 模式的 AC 同时包含 WHEN 和 IF 子句, THEN THE sf_requirements_gate SHALL 报告阻塞性问题，消息为"Complex 模式不允许同时使用 WHEN 和 IF"。
10. [Unwanted-behavior] IF Complex 模式的条件子句顺序不符合 WHERE → WHILE → WHEN/IF 规则, THEN THE sf_requirements_gate SHALL 报告阻塞性问题，消息为"条件子句顺序错误"。

### Requirement 8: 格式错误处理

**User Story:** 作为 SpecForge 用户，我希望 sf_requirements_gate 能精确报告 EARS 格式错误的具体原因，以便我能快速修正不合规的 AC。

#### Acceptance Criteria

1. [Unwanted-behavior] IF AC 包含 WHEN/WHILE/WHERE 子句但缺少 THE 关键词, THEN THE sf_requirements_gate SHALL 报告错误，消息为"缺少 THE 关键词"。
2. [Unwanted-behavior] IF AC 包含条件子句但缺少 SHALL 关键词, THEN THE sf_requirements_gate SHALL 报告错误，消息为"缺少 SHALL 关键词"。
3. [Unwanted-behavior] IF AC 以 IF 开头但不包含 THEN 关键词, THEN THE sf_requirements_gate SHALL 报告错误，消息为"IF 模式缺少 THEN"。
4. [Unwanted-behavior] IF AC 的条件子句（WHEN/WHILE/WHERE/IF）与 THE/THEN 之间缺少逗号分隔, THEN THE sf_requirements_gate SHALL 报告错误，消息为"条件子句后缺少逗号"。
5. [Unwanted-behavior] IF AC 的 `[Pattern-label]` 标签与实际 EARS 语句模式不匹配, THEN THE sf_requirements_gate SHALL 在 strict mode 下报告阻塞性问题，在 legacy mode 下报告非阻塞性警告，消息指明标签与实际模式的差异。
6. [Unwanted-behavior] IF AC 为空行或仅包含编号而无实质内容, THEN THE sf_requirements_gate SHALL 报告错误，消息为"AC 内容为空"。

### Requirement 9: 性能要求

**User Story:** 作为 SpecForge 用户，我希望 sf_requirements_gate 的 EARS 验证在大型文档上也能快速完成，以便不阻塞开发工作流。

#### Acceptance Criteria

1. [Event-driven] WHEN sf_requirements_gate 处理不超过 200KB 且不超过 500 条 AC 的 requirements.md 时, THE sf_requirements_gate SHALL 在 1 秒内完成全部 EARS 验证。
2. [Ubiquitous] THE sf_requirements_gate SHALL 以线性时间复杂度（O(n)，n 为 AC 数量）执行 EARS 模式验证。
3. [Ubiquitous] THE sf_requirements_gate SHALL 使用不会产生灾难性回溯（catastrophic backtracking）的正则表达式或解析策略。
4. [Unwanted-behavior] IF 文档超过 200KB 或 AC 数量超过 500 条但不超过 1MB, THEN THE sf_requirements_gate SHALL 在默认超时时间（5 秒）内完成验证并返回验证结果或文件大小限制的阻塞性问题，不得崩溃。

### Requirement 10: 安全要求

**User Story:** 作为 SpecForge 系统维护者，我希望 sf_requirements_gate 的 EARS 验证能安全处理不可信输入，以便恶意或畸形文档不会导致系统异常。

#### Acceptance Criteria

1. [Ubiquitous] THE sf_requirements_gate SHALL 将所有输入的 requirements.md 内容视为不可信数据，不执行其中的任何代码或指令。
2. [Ubiquitous] THE sf_requirements_gate SHALL 将文件访问限制在 Spec_Directory 范围内，不接受绝对路径或路径遍历（如 `../`）。
3. [Unwanted-behavior] IF 错误消息中需要引用文件路径, THEN THE sf_requirements_gate SHALL 仅使用相对于 Spec_Directory 的相对路径，不暴露绝对路径。
4. [Unwanted-behavior] IF 输入文件大小超过 1MB, THEN THE sf_requirements_gate SHALL 拒绝处理并报告阻塞性问题，消息为"文件大小超过限制"。
5. [Ubiquitous] THE sf_requirements_gate SHALL 对 AC 内容中的特殊字符（正则元字符、控制字符）进行安全转义后再执行模式匹配。

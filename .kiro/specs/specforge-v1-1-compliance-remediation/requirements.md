# Requirements Document

## Introduction

SpecForge v1.1 标准合规整改项目旨在将当前的 SpecForge 系统从"Agent 工作流框架"迁移为"不可绕过的规格驱动 Runtime"。根据审计报告，当前系统的关键控制仍然依赖 Agent 提示词，而非程序硬约束。本整改项目将分 5 轮实施，逐步建立项目级规格真相源、事务型工作项、Candidate 合并机制、Write Guard 硬约束和 Extension Registry 子流程，确保系统符合 SpecForge v1.1 + Patch 1 标准。

## Glossary

- **Runtime**: SpecForge 运行时系统，负责执行状态机转换、权限判断、路径策略校验等核心控制逻辑
- **Path_Service**: 路径服务，提供统一的路径生成接口，确保所有路径符合 v1.1 目录结构规范
- **Path_Policy**: 路径策略，定义并校验路径规则，阻止非法路径访问
- **State_Machine**: 状态机，管理工作项的 24 个事务状态及其合法转换
- **Work_Item**: 工作项，v1.1 标准中的变更事务单元，存储于 `.specforge/work-items/<WI-ID>/`
- **Candidate**: 候选变更，Agent 生成的待合并规格内容，存储于工作项的 `candidates/` 目录
- **Candidate_Manifest**: 候选清单文件 `candidate_manifest.json`，描述所有待合并的 Candidate 及其目标路径
- **Gate_Runner**: 门禁运行器，执行 Gate 检查并生成 Gate Report
- **Gate_Summary**: 门禁摘要文件 `gate_summary.md`，汇总所有 Gate 检查结果
- **User_Decision_Recorder**: 用户决策记录器，将用户批准决策写入 `user_decision.json`
- **Merge_Runner**: 合并运行器，按照 Candidate_Manifest 将 Candidate 合并到 `.specforge/project/**`
- **Merge_Report**: 合并报告文件 `merge_report.md`，记录合并操作的详细结果
- **Write_Guard**: 写入守卫，拦截所有写入操作并校验权限
- **Code_Permission_Service**: 代码权限服务，管理 `code_change_allowed` 和 `allowed_write_files`
- **Changed_Files_Audit**: 变更文件审计，对账实际文件变更与预期声明
- **Close_Gate**: 关闭门禁，验证所有必要条件满足后才允许关闭工作项
- **Extension_Registry**: 扩展注册表文件 `extension_registry.json`，项目级正式规格文件，定义所有可用的扩展类型
- **Extension_Subflow**: 扩展子流程，当 Agent 需要使用未注册类型时触发的独立工作流
- **Legacy_Specs**: 遗留规格，指旧版本 `.specforge/specs/**` 目录下的规格文件，只能读取不能写入
- **Project_Spec_Manifest**: 项目规格清单文件 `spec_manifest.json`，位于 `.specforge/project/`，记录所有项目级正式规格文件路径

## Requirements

### Requirement 1: 目录模型迁移与路径治理

**User Story:** 作为 SpecForge Runtime 开发者，我希望系统使用 v1.1 标准的目录结构，以便建立项目级规格真相源和事务型工作项模型。

#### Acceptance Criteria

1. THE Path_Service SHALL 提供所有 `.specforge/project/**` 路径的生成接口
2. THE Path_Service SHALL 提供所有 `.specforge/work-items/<WI-ID>/**` 路径的生成接口
3. THE Path_Service SHALL 提供所有 `.specforge/runtime/**` 路径的生成接口
4. THE Path_Policy SHALL 校验路径使用项目根目录相对路径
5. THE Path_Policy SHALL 校验路径使用 POSIX 风格斜杠
6. THE Path_Policy SHALL 拒绝包含绝对路径的路径
7. THE Path_Policy SHALL 拒绝包含 `..` 的路径
8. THE Path_Policy SHALL 拒绝包含 `~` 的路径
9. THE Path_Policy SHALL 拒绝包含 Windows 反斜杠 `\` 的路径
10. WHEN 引用项目规格文件时，THE Path_Policy SHALL 要求路径带 `.specforge/` 前缀
11. WHEN 尝试写入 `.specforge/specs/**` 路径时，THE Runtime SHALL 阻止写入操作
12. THE Runtime SHALL 允许读取 `.specforge/specs/**` 路径下的 Legacy_Specs
13. WHEN 初始化新项目时，THE Runtime SHALL 创建 `.specforge/project/` 目录
14. WHEN 初始化新项目时，THE Runtime SHALL 创建 `.specforge/work-items/` 目录
15. WHEN 初始化新项目时，THE Runtime SHALL 创建 `.specforge/runtime/` 目录
16. WHEN 初始化新项目时，THE Runtime SHALL 创建空的 Project_Spec_Manifest 文件
17. WHEN 初始化新项目时，THE Runtime SHALL 创建空的 Extension_Registry 文件
18. THE Runtime SHALL 禁止创建 `.specforge/archive/` 目录
19. THE Runtime SHALL 禁止创建 `.specforge/state/` 目录
20. THE Runtime SHALL 禁止创建 `.specforge/gates/` 目录

### Requirement 2: v1.1 事务状态机实现

**User Story:** 作为 SpecForge Runtime 开发者，我希望实现 v1.1 标准的 24 状态事务状态机，以便确保工作项按合法路径推进。

#### Acceptance Criteria

1. THE State_Machine SHALL 支持状态 `created`
2. THE State_Machine SHALL 支持状态 `intake_ready`
3. THE State_Machine SHALL 支持状态 `impact_analyzing`
4. THE State_Machine SHALL 支持状态 `impact_analyzed`
5. THE State_Machine SHALL 支持状态 `workflow_selected`
6. THE State_Machine SHALL 支持状态 `candidate_preparing`
7. THE State_Machine SHALL 支持状态 `candidate_prepared`
8. THE State_Machine SHALL 支持状态 `gates_running`
9. THE State_Machine SHALL 支持状态 `gates_failed`
10. THE State_Machine SHALL 支持状态 `approval_required`
11. THE State_Machine SHALL 支持状态 `approved`
12. THE State_Machine SHALL 支持状态 `merge_ready`
13. THE State_Machine SHALL 支持状态 `merging`
14. THE State_Machine SHALL 支持状态 `merged`
15. THE State_Machine SHALL 支持状态 `post_merge_verified`
16. THE State_Machine SHALL 支持状态 `implementation_ready`
17. THE State_Machine SHALL 支持状态 `implementation_running`
18. THE State_Machine SHALL 支持状态 `implementation_done`
19. THE State_Machine SHALL 支持状态 `verification_running`
20. THE State_Machine SHALL 支持状态 `verification_done`
21. THE State_Machine SHALL 支持状态 `closed`
22. THE State_Machine SHALL 支持状态 `blocked`
23. THE State_Machine SHALL 支持状态 `rejected`
24. THE State_Machine SHALL 支持状态 `superseded`
25. THE State_Machine SHALL 拒绝从 `created` 状态直接转换到 `implementation_running` 状态
26. THE State_Machine SHALL 拒绝从 `intake_ready` 状态直接转换到 `implementation_running` 状态
27. THE State_Machine SHALL 拒绝从 `impact_analyzing` 状态直接转换到 `implementation_running` 状态
28. THE State_Machine SHALL 拒绝从 `impact_analyzed` 状态直接转换到 `implementation_running` 状态
29. THE State_Machine SHALL 拒绝从 `workflow_selected` 状态直接转换到 `implementation_running` 状态
30. THE State_Machine SHALL 拒绝从 `candidate_prepared` 状态直接转换到 `merging` 状态
31. THE State_Machine SHALL 拒绝从 `approval_required` 状态直接转换到 `merging` 状态
32. THE State_Machine SHALL 拒绝从 `approval_required` 状态直接转换到 `closed` 状态
33. THE State_Machine SHALL 拒绝从 `merged` 状态直接转换到 `closed` 状态
34. THE State_Machine SHALL 拒绝从 `closed` 状态转换到任何其他状态
35. THE State_Machine SHALL 拒绝从 `blocked` 状态直接转换到 `closed` 状态
36. THE State_Machine SHALL 拒绝从 `rejected` 状态直接转换到 `closed` 状态
37. WHEN Agent 尝试推进 Work_Item 状态时，THE Runtime SHALL 拒绝该操作
38. THE Runtime SHALL 仅允许 State_Machine 本身推进 Work_Item 状态
39. THE Runtime SHALL 仅允许 Gate_Runner 推进 Work_Item 状态
40. THE Runtime SHALL 仅允许 User_Decision_Recorder 推进 Work_Item 状态
41. THE Runtime SHALL 仅允许 Merge_Runner 推进 Work_Item 状态
42. THE Runtime SHALL 仅允许 Code_Permission_Service 推进 Work_Item 状态
43. THE Runtime SHALL 仅允许 Close_Gate 推进 Work_Item 状态

### Requirement 3: Candidate 合并主链实现

**User Story:** 作为 SpecForge Runtime 开发者，我希望实现 Candidate 合并主链，以便通过程序化审批和合并流程确保规格变更的可控性。

#### Acceptance Criteria

1. WHEN Agent 生成 Candidate 时，THE Runtime SHALL 要求 Candidate 为完整目标文件内容
2. THE Runtime SHALL 禁止 Candidate 使用 patch 或 diff 格式
3. WHEN Agent 生成 Candidate_Manifest 时，THE Runtime SHALL 验证 `candidate_path` 指向当前 Work_Item 的 `candidates/` 目录
4. WHEN Agent 生成 Candidate_Manifest 时，THE Runtime SHALL 验证 `target_path` 指向 `.specforge/project/**` 路径
5. THE Gate_Runner SHALL 读取所有 Gate 定义并执行检查
6. THE Gate_Runner SHALL 为每个 Gate 生成 `gates/<gate_id>.json` 文件
7. THE Gate_Runner SHALL 生成 Gate_Summary 文件
8. WHEN 所有 Gate 通过后，THE Gate_Runner SHALL 推进 Work_Item 状态到 `approval_required`
9. IF 任何 Gate 失败，THEN THE Gate_Runner SHALL 推进 Work_Item 状态到 `gates_failed`
10. WHEN 用户在聊天中表达批准意图时，THE User_Decision_Recorder SHALL 生成 `user_decision.json` 文件
11. THE User_Decision_Recorder SHALL 在 `user_decision.json` 中记录 `base_spec_version`
12. THE User_Decision_Recorder SHALL 在 `user_decision.json` 中记录 Candidate_Manifest 的哈希值
13. THE User_Decision_Recorder SHALL 在 `user_decision.json` 中记录 Gate_Summary 的哈希值
14. THE User_Decision_Recorder SHALL 在 `user_decision.json` 中记录用户决策时间戳
15. WHEN 准备合并时，THE Runtime SHALL 验证 `user_decision.json` 存在
16. WHEN 准备合并时，THE Runtime SHALL 验证 Candidate_Manifest 哈希值与 `user_decision.json` 中记录的哈希值一致
17. WHEN 准备合并时，THE Runtime SHALL 验证 Gate_Summary 哈希值与 `user_decision.json` 中记录的哈希值一致
18. WHEN 准备合并时，THE Runtime SHALL 验证 `base_spec_version` 与当前项目规格版本一致
19. IF 验证失败，THEN THE Runtime SHALL 拒绝合并操作
20. THE Merge_Runner SHALL 仅按照 Candidate_Manifest 中的条目执行合并
21. THE Merge_Runner SHALL 禁止扫描 `candidates/` 目录自行决定合并对象
22. WHEN 合并完成后，THE Merge_Runner SHALL 生成 Merge_Report 文件
23. THE Merge_Runner SHALL 在 Merge_Report 中记录每个合并操作的源路径和目标路径
24. THE Merge_Runner SHALL 在 Merge_Report 中记录合并前后的文件哈希值
25. WHEN 合并完成后，THE Runtime SHALL 执行 `post_merge_gate` 检查
26. THE Runtime SHALL 在 `post_merge_gate` 中验证所有目标文件已正确写入
27. THE Runtime SHALL 在 `post_merge_gate` 中验证项目规格版本已递增
28. WHEN `post_merge_gate` 通过后，THE Runtime SHALL 推进 Work_Item 状态到 `merged`
29. THE Runtime SHALL 禁止 Agent 直接写入 `.specforge/project/**` 路径
30. THE Runtime SHALL 禁止 Agent 直接写入 `user_decision.json` 文件
31. THE Runtime SHALL 禁止 Agent 直接写入 `gates/**` 目录
32. THE Runtime SHALL 禁止 Agent 直接写入 `gate_summary.md` 文件
33. THE Runtime SHALL 禁止 Agent 直接写入 `merge_report.md` 文件
34. THE Runtime SHALL 禁止聊天"同意"直接触发合并操作

### Requirement 4: Write Guard 硬约束实现

**User Story:** 作为 SpecForge Runtime 开发者，我希望实现 Write Guard 硬约束，以便在程序层面阻止所有未授权的文件写入操作。

#### Acceptance Criteria

1. THE Code_Permission_Service SHALL 管理 `code_change_allowed` 标志
2. THE Code_Permission_Service SHALL 管理 `allowed_write_files` 列表
3. WHEN 没有活动 Work_Item 时，THE Write_Guard SHALL 拒绝所有代码文件写入操作
4. WHEN `code_change_allowed` 为 `false` 时，THE Write_Guard SHALL 拒绝所有代码文件写入操作
5. WHEN 写入目标不在 `allowed_write_files` 列表中时，THE Write_Guard SHALL 拒绝该写入操作
6. THE Write_Guard SHALL 拦截 `edit` 工具的写入操作
7. THE Write_Guard SHALL 拦截 SpecForge 自定义写文件工具的写入操作
8. THE Write_Guard SHALL 拦截 `bash` 命令的文件写入操作
9. THE Write_Guard SHALL 拦截代码格式化工具的写入操作
10. THE Write_Guard SHALL 拦截代码生成器的写入操作
11. THE Write_Guard SHALL 拦截包管理器的文件写入操作
12. THE Write_Guard SHALL 拦截快照更新操作的文件写入
13. THE Write_Guard SHALL 拦截 Git 相关的文件写入操作
14. WHEN Agent 执行 `bash` 命令时，THE Runtime SHALL 要求声明 `expected_write_files`
15. WHEN 未声明 `expected_write_files` 时，THE Runtime SHALL 默认该命令为只读操作
16. WHEN 命令执行完成后，THE Changed_Files_Audit SHALL 对账实际文件变更
17. WHEN 实际文件变更超出 `expected_write_files` 声明时，THE Changed_Files_Audit SHALL 记录 `escaped_write_incident`
18. THE Runtime SHALL 在 `write_scope_gate` 中检查是否存在 `escaped_write_incident`
19. IF 存在 `escaped_write_incident`，THEN THE Runtime SHALL 阻止 Work_Item 推进到下一状态
20. THE Write_Guard SHALL 阻止 Agent 写入 `.specforge/project/**` 路径
21. THE Write_Guard SHALL 阻止 Agent 写入 `user_decision.json` 文件
22. THE Write_Guard SHALL 阻止 Agent 写入 `gates/**` 目录
23. THE Write_Guard SHALL 阻止 Agent 写入 `gate_summary.md` 文件
24. THE Write_Guard SHALL 阻止 Agent 写入 `merge_report.md` 文件
25. WHEN Candidate_Manifest 或 Gate_Summary 已冻结时，THE Write_Guard SHALL 阻止对这些文件的修改
26. WHEN Work_Item 状态为 `closed` 时，THE Write_Guard SHALL 阻止所有写入操作
27. THE Runtime SHALL 为 Merge_Runner 授予写入 `.specforge/project/**` 的特殊权限
28. THE Runtime SHALL 为 User_Decision_Recorder 授予写入 `user_decision.json` 的特殊权限
29. THE Runtime SHALL 为 Gate_Runner 授予写入 `gates/**` 和 `gate_summary.md` 的特殊权限

### Requirement 5: Extension Registry 与 Extension Subflow 实现

**User Story:** 作为 SpecForge Runtime 开发者，我希望实现 Extension Registry 正式规格和 Extension Subflow，以便在程序层面管理扩展类型的注册和使用。

#### Acceptance Criteria

1. THE Runtime SHALL 在初始化时创建 `.specforge/project/extension_registry.json` 文件
2. THE Runtime SHALL 在 Project_Spec_Manifest 中登记 Extension_Registry 文件路径
3. WHEN Agent 在生成 Requirements 时使用未知类型，THE Runtime SHALL 检测到类型缺失
4. WHEN Agent 在生成 Design 时使用未知类型，THE Runtime SHALL 检测到类型缺失
5. WHEN Agent 在生成 Tasks 时使用未知类型，THE Runtime SHALL 检测到类型缺失
6. WHEN Agent 在生成 Verification 时使用未知类型，THE Runtime SHALL 检测到类型缺失
7. WHEN Agent 在生成 Gate 定义时使用未知类型，THE Runtime SHALL 检测到类型缺失
8. WHEN 检测到类型缺失时，THE Runtime SHALL 生成 `extension_request.json` 文件
9. THE Runtime SHALL 在 `extension_request.json` 中记录缺失的类型名称
10. THE Runtime SHALL 在 `extension_request.json` 中记录 `blocking_current_flow` 标志
11. WHEN `blocking_current_flow` 为 `true` 时，THE Runtime SHALL 阻断主流程推进
12. WHEN Extension_Subflow 启动时，THE Runtime SHALL 调度 `sf-extension` Agent
13. THE `sf-extension` Agent SHALL 生成 `extension_delta.md` 文件
14. THE `sf-extension` Agent SHALL 生成 Extension_Registry Candidate 文件
15. THE Runtime SHALL 对 Extension_Registry Candidate 执行 `extension_gate` 检查
16. THE `extension_gate` SHALL 验证扩展类型定义的完整性
17. THE `extension_gate` SHALL 验证扩展类型定义不与现有类型冲突
18. THE `extension_gate` SHALL 标记为 `hard_gate`
19. WHEN `extension_gate` 通过后，THE Runtime SHALL 要求用户决策
20. THE User_Decision_Recorder SHALL 为 Extension_Registry 变更生成 `user_decision.json`
21. WHEN 用户批准后，THE Merge_Runner SHALL 合并 Extension_Registry Candidate 到 `.specforge/project/extension_registry.json`
22. WHEN 合并完成后，THE Runtime SHALL 执行 `post_merge_gate` 检查
23. WHEN `post_merge_gate` 通过后，THE Runtime SHALL 恢复主流程
24. THE Runtime SHALL 在恢复主流程时重新读取 Extension_Registry
25. THE Runtime SHALL 在恢复主流程时要求 Agent 重新生成使用新类型的产物
26. THE Close_Gate SHALL 检查是否存在未处理的 `extension_request.json` 文件
27. IF 存在未处理的 Extension Request，THEN THE Close_Gate SHALL 拒绝关闭 Work_Item
28. THE Write_Guard SHALL 阻止 Agent 直接写入 `extension_registry.json` 文件
29. THE Write_Guard SHALL 阻止 Agent 临时创造未注册的扩展类型
30. THE Write_Guard SHALL 阻止 Agent 在未知类型情况下直接写入 Candidate

### Requirement 6: 解析器和序列化器测试要求

**User Story:** 作为 SpecForge 开发者，我希望所有解析器和序列化器都具备往返测试属性，以便确保数据转换的正确性。

#### Acceptance Criteria

1. WHEN 实现 JSON 解析器时，THE Parser SHALL 将有效 JSON 字符串解析为数据对象
2. WHEN 实现 JSON 序列化器时，THE Serializer SHALL 将数据对象格式化为有效 JSON 字符串
3. FOR ALL 有效数据对象，解析序列化后的字符串再序列化 SHALL 产生等价对象（往返属性）
4. WHEN 实现配置文件解析器时，THE Parser SHALL 将有效配置文件解析为配置对象
5. WHEN 实现配置文件序列化器时，THE Serializer SHALL 将配置对象格式化为有效配置文件
6. FOR ALL 有效配置对象，解析序列化后的配置文件再序列化 SHALL 产生等价对象（往返属性）
7. WHEN 实现 Candidate_Manifest 解析器时，THE Parser SHALL 将有效 JSON 解析为 Manifest 对象
8. WHEN 实现 Candidate_Manifest 序列化器时，THE Serializer SHALL 将 Manifest 对象格式化为有效 JSON
9. FOR ALL 有效 Manifest 对象，解析序列化后的 JSON 再序列化 SHALL 产生等价对象（往返属性）
10. WHEN 解析无效输入时，THE Parser SHALL 返回描述性错误信息

### Requirement 7: Close Gate 完整性检查

**User Story:** 作为 SpecForge Runtime 开发者，我希望实现 Close_Gate 完整性检查，以便确保工作项只有在所有必要条件满足后才能关闭。

#### Acceptance Criteria

1. THE Close_Gate SHALL 验证 Work_Item 状态为 `verification_done`
2. THE Close_Gate SHALL 验证所有 Gate 检查已通过
3. THE Close_Gate SHALL 验证 `user_decision.json` 存在且有效
4. THE Close_Gate SHALL 验证 Merge_Report 存在且所有合并操作成功
5. THE Close_Gate SHALL 验证项目规格版本已正确递增
6. THE Close_Gate SHALL 验证 `evidence_manifest.json` 存在且包含所有要求的证据
7. THE Close_Gate SHALL 验证 `verification_report.md` 存在且所有验证通过
8. THE Close_Gate SHALL 验证 `trace_matrix.md` 或 `trace_delta.md` 已更新
9. THE Close_Gate SHALL 验证不存在未处理的 `extension_request.json` 文件
10. THE Close_Gate SHALL 验证不存在未解决的 `escaped_write_incident`
11. IF 任何检查失败，THEN THE Close_Gate SHALL 拒绝关闭操作并返回失败原因
12. WHEN 所有检查通过后，THE Close_Gate SHALL 推进 Work_Item 状态到 `closed`
13. WHEN Work_Item 状态为 `closed` 后，THE Runtime SHALL 阻止所有后续状态变更
14. WHERE Work_Item 标记为 `not_applicable`，THE Close_Gate SHALL 允许跳过相应的检查项

### Requirement 8: Runtime 组件职责定义

**User Story:** 作为 SpecForge 架构师，我希望明确定义 Runtime 各组件的职责边界，以便实现清晰的职责分离和权限控制。

#### Acceptance Criteria

1. THE Runtime SHALL 负责初始化 `.specforge/` 目录结构
2. THE Runtime SHALL 负责加载和验证 Project_Spec_Manifest
3. THE Runtime SHALL 负责加载和验证 Extension_Registry
4. THE Runtime SHALL 负责调度 State_Machine 状态转换
5. THE Runtime SHALL 负责调度 Gate_Runner 执行 Gate 检查
6. THE Runtime SHALL 负责调度 User_Decision_Recorder 记录用户决策
7. THE Runtime SHALL 负责调度 Merge_Runner 执行合并操作
8. THE Runtime SHALL 负责调度 Code_Permission_Service 管理代码权限
9. THE Runtime SHALL 负责调度 Write_Guard 拦截写入操作
10. THE Runtime SHALL 负责调度 Changed_Files_Audit 审计文件变更
11. THE Runtime SHALL 负责调度 Close_Gate 执行关闭检查
12. THE Path_Service SHALL 仅负责生成符合规范的路径字符串
13. THE Path_Policy SHALL 仅负责校验路径字符串的合法性
14. THE State_Machine SHALL 仅负责管理状态转换逻辑
15. THE Gate_Runner SHALL 仅负责执行 Gate 检查并生成报告
16. THE User_Decision_Recorder SHALL 仅负责记录用户批准决策
17. THE Merge_Runner SHALL 仅负责按 Candidate_Manifest 执行文件合并
18. THE Code_Permission_Service SHALL 仅负责管理代码修改权限
19. THE Write_Guard SHALL 仅负责拦截和阻止未授权写入
20. THE Changed_Files_Audit SHALL 仅负责对账实际文件变更
21. THE Close_Gate SHALL 仅负责验证关闭条件
22. THE Agent SHALL 仅负责生成意图性产物（Candidate、Delta、Report、Evidence）
23. THE Agent SHALL 禁止直接执行状态推进操作
24. THE Agent SHALL 禁止直接执行权限管理操作
25. THE Agent SHALL 禁止直接执行合并操作

## Implementation Notes

本需求文档定义的是 SpecForge v1.1 标准合规整改的完整需求。实施时应按照以下优先级分 5 轮进行：

**Round 1**: Requirements 1（目录模型与路径治理）
**Round 2**: Requirements 2（v1.1 状态机）
**Round 3**: Requirements 3（Candidate 合并主链）
**Round 4**: Requirements 4（Write Guard 硬约束）
**Round 5**: Requirements 5（Extension Registry 与 Subflow）

Requirements 6-8 为横切关注点，应在各轮实施中同步完成。

每轮完成后应进行验收测试，确保该轮的所有验收标准通过后再进入下一轮。

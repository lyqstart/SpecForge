# Requirements Document

## Introduction

本功能将 SpecForge 安装器系统从基于手动注册表的架构重新设计为**声明式期望状态 + 自动协调（Reconcile）**架构。当前系统因手动维护注册表、缺乏期望状态感知、脆弱的 Manifest 验证和缺失的孤儿文件清理而反复出现故障。

重新设计的系统将 `.opencode/` 源目录视为唯一真实来源（Single Source of Truth）。安装器不再维护硬编码的 `SHARED_COMPONENT_REGISTRY` 数组，而是在运行时扫描源目录来确定应部署哪些文件。统一的 Reconcile 操作将当前已部署状态与期望状态进行比较，并修复所有差异——创建缺失文件、更新已变更文件、删除孤儿文件。

核心架构变更：
1. **自动发现替代手动注册表** — 安装器扫描 `.opencode/` 动态构建部署清单
2. **统一 Reconcile 替代分离的 install/upgrade 路径** — 单一幂等 Reconcile 函数处理所有场景
3. **SHA-256 哈希比较进行变更检测** — 仅更新内容实际发生变化的文件
4. **孤儿检测与清理** — 目标中存在但源中不再存在的文件被自动删除
5. **用户自定义保护** — 未经明确 --force 标志不覆盖用户修改过的已部署文件
6. **健壮的 Manifest 验证** — 缺少必需字段的 Manifest 触发完整 Reconcile

变更范围：
- `scripts/sf-installer.ts` — CLI 入口（install、upgrade、verify、uninstall 子命令）
- `scripts/lib/registry.ts` — 被自动发现模块替代
- `scripts/lib/reconcile.ts` — 新的统一 Reconcile 引擎
- `scripts/lib/discovery.ts` — 新的源目录扫描器
- `.opencode/tools/lib/sf_specforge_plugin_entry.ts` — Plugin 启动 Reconcile 集成

## Glossary

- **Reconciler**: 核心引擎，比较期望状态与当前状态并生成包含动作（create、update、delete、skip、conflict）的 Reconcile 计划
- **Desired_State**: 应存在于部署目标中的完整文件集合，通过扫描 `.opencode/` 源目录得出
- **Current_State**: 当前实际部署在 User_Level_Directory 中的文件集合，包含其 SHA-256 哈希
- **Source_Directory**: SpecForge 项目根目录中的 `.opencode/` 目录，包含所有待部署的共享组件
- **User_Level_Directory**: `~/.config/opencode/` 目录，共享组件部署到此处供全局使用
- **Reconcile_Plan**: 有序的动作列表（create、update、delete、skip、conflict），将 Current_State 转换为 Desired_State
- **Discovery_Module**: 扫描 Source_Directory 以构建 Desired_State 的组件，无需手动注册表
- **File_Hash**: 从文件内容计算的 SHA-256 摘要，用于变更检测
- **Deployed_Manifest**: User_Level_Directory 中的 `specforge-manifest.json` 文件，记录已部署文件的哈希和元数据
- **Orphan_File**: 属于 Managed_Component_File 但在 Desired_State 中没有对应条目的已部署文件，即源中已不存在的组件文件
- **User_Customization**: 当前哈希与源哈希和 Deployed_Manifest 中记录的上次部署哈希均不同的已部署文件，表明用户已手动修改
- **Conflict**: 文件需要更新但已被用户自定义修改的 Reconcile 情况（需要 --force 解决）
- **Atomic_Write**: 使用临时文件 + rename 模式的写入操作，防止部分文件状态
- **Component_Type**: 基于目录位置对源文件的分类（agent、tool、tool_lib、plugin、skill、config）
- **Scan_Pattern**: 确定 Source_Directory 中哪些文件是可部署组件的 glob 或目录规则
- **Managed_Component_File**: 由安装器管理的组件文件，包括：Desired_State 中发现的文件、Deployed_Manifest 中记录的组件文件条目、以及 managed 组件目录（agents/、tools/、tools/lib/、plugins/、skills/）下具有 sf-/sf_ 前缀的文件。Requirement 14 的决策矩阵仅适用于此类文件
- **Managed_Generated_File**: 由安装器或 Plugin 生成的元数据文件，包括：specforge-manifest.json、upgrade_journal.json、opencode.json 中的 sf-* 条目。这些文件由各自的专用需求管理（R5 管理 Manifest、R11.5 管理 journal、R12 管理 opencode.json），不进入 R14 的通用决策矩阵
- **Downgrade**: 源 shared_version 低于 Deployed_Manifest 中记录的 shared_version 的操作，默认拒绝，需要 --force 标志
- **Full_Reconcile**: 完整的 Reconcile 流程：构建 Desired_State → 构建 Current_State（从文件系统和 Manifest）→ 按 R14 决策矩阵生成 Reconcile_Plan → 执行动作 → 写入新 Manifest

## Requirements

### Requirement 1: 源目录自动发现

**User Story:** 作为 SpecForge 开发者，我希望安装器通过扫描 `.opencode/` 源目录自动发现可部署文件，以便在添加或删除文件时无需手动更新注册表。

#### Acceptance Criteria

1. [Event-driven] WHEN Discovery_Module 扫描 Source_Directory 时, THE Discovery_Module SHALL 枚举以下文件：`agents/` 中的所有 `.md` 文件、`tools/` 顶层的所有 `.ts` 文件、`tools/lib/` 中的所有 `.ts` 文件、`plugins/` 中的所有 `.ts` 文件、以及 `skills/*/SKILL.md`（每个 skill 目录仅部署 SKILL.md）。
2. [Ubiquitous] THE Discovery_Module SHALL 根据目录位置将每个发现的文件分类为 Component_Type：`agents/` 中的文件为 "agent"，`tools/`（顶层）中的文件为 "tool"，`tools/lib/` 中的文件为 "tool_lib"，`plugins/` 中的文件为 "plugin"，`skills/*/SKILL.md` 为 "skill"。
3. [Event-driven] WHEN Discovery_Module 遇到 `.gitkeep` 文件时, THE Discovery_Module SHALL 将其排除在 Desired_State 之外。
4. [Event-driven] WHEN Discovery_Module 遇到 `node_modules/` 目录时, THE Discovery_Module SHALL 将其及所有内容排除在 Desired_State 之外。
5. [Ubiquitous] THE Discovery_Module SHALL 为每个发现的文件计算 SHA-256 File_Hash 并将其包含在 Desired_State 中。
6. [Ubiquitous] THE Discovery_Module SHALL 以 POSIX 格式（正斜杠）表示文件路径，无论宿主操作系统如何。
7. [Unwanted-behavior] IF Source_Directory 不存在或为空（排除 .gitkeep 文件后）, THEN THE Discovery_Module SHALL 报告错误，指明未找到可部署组件。
8. [Event-driven] WHEN Discovery_Module 遇到 Source_Directory 根目录中的 `package.json` 或 `package-lock.json` 时, THE Discovery_Module SHALL 将这些文件排除在 Desired_State 之外。

### Requirement 2: 统一 Reconcile 引擎

**User Story:** 作为 SpecForge 用户，我希望有一个统一的 Reconcile 操作来处理所有部署场景（全新安装、升级、修复），以便系统无论起始条件如何都能收敛到正确状态。

#### Acceptance Criteria

1. [Event-driven] WHEN Reconciler 接收 Desired_State 和 Current_State 时, THE Reconciler SHALL 生成包含每个文件一个动作的 Reconcile_Plan。
2. [Ubiquitous] THE Reconciler SHALL 使用 Requirement 14 定义的决策矩阵作为每个文件动作选择的权威来源。
3. [Ubiquitous] THE Reconciler SHALL 支持以下动作类型：create（创建缺失文件）、update（更新已变更文件）、delete（删除孤儿文件）、skip（跳过无变化文件）、conflict（标记用户自定义冲突）。
4. [Unwanted-behavior] IF R2 的高层描述与 R14 的决策矩阵存在歧义, THEN R14 SHALL 优先。
5. [Ubiquitous] THE Reconciler SHALL 具有幂等性：对相同状态多次执行相同的 Reconcile_Plan，在首次执行后 SHALL 不产生额外变更。
6. [Ubiquitous] THE Reconciler SHALL 在给定相同的 Desired_State 和 Current_State 输入时生成相同的 Reconcile_Plan，无论操作是由 install、upgrade 还是 Plugin 启动触发。

### Requirement 3: 用户自定义保护

**User Story:** 作为自定义了 Agent 提示词的 SpecForge 用户，我希望安装器能检测到我的修改并在升级时不覆盖它们，以便保留我的自定义内容。

#### Acceptance Criteria

1. [Event-driven] WHEN 文件需要更新且 Component_Type 为 agent 或 skill，且已部署文件的当前哈希与源哈希和 Deployed_Manifest 中的上次部署哈希均不同时, THE Reconciler SHALL 按 R14.5 为该文件分配 "conflict" 动作。非可自定义组件（tool、tool_lib、plugin）的行为按 R14.6 处理。
2. [Event-driven] WHEN Reconciler 遇到 "conflict" 动作且未设置 --force 标志时, THE Reconciler SHALL 跳过该文件并发出警告消息，标识该文件并说明其已被用户自定义修改。
3. [Event-driven] WHEN Reconciler 遇到 "conflict" 动作且设置了 --force 标志时, THE Reconciler SHALL 用源版本覆盖该文件并发出通知说明用户自定义已被替换。
4. [Event-driven] WHEN Reconciler 执行 Reconcile_Plan 时, THE Reconciler SHALL 报告摘要，列出每个动作类别的文件数量（已创建、已更新、已删除、已跳过、有冲突）。
5. [Ubiquitous] THE Reconciler SHALL 永远不删除或覆盖非 managed 文件。Managed 文件包括 Managed_Component_File 和 Managed_Generated_File 两类（定义见 Glossary）。

### Requirement 4: 原子文件操作

**User Story:** 作为 SpecForge 用户，我希望所有文件操作都是原子的，以便操作中途失败时不会使我的安装处于损坏的部分状态。

#### Acceptance Criteria

1. [Ubiquitous] THE Reconciler SHALL 对所有 create 和 update 操作使用 Atomic_Write（写入临时文件、验证 SHA-256、rename 到目标）。
2. [Unwanted-behavior] IF Atomic_Write 在写入临时文件后 SHA-256 验证失败, THEN THE Reconciler SHALL 删除临时文件并报告该文件的校验和不匹配错误。
3. [Event-driven] WHEN create、update 或 Manifest/opencode.json 写入操作在 Reconcile_Plan 执行期间失败时, THE Reconciler SHALL 停止执行剩余动作并报告哪些文件已成功处理、哪些失败。Orphan_File delete 失败按 R6.5 作为非致命警告处理，不触发停止。
4. [Ubiquitous] THE Reconciler SHALL 在写入文件前确保目标目录存在，按需递归创建。
5. [Event-driven] WHEN Reconciler 因失败而停止时, THE Reconciler SHALL 保留已成功写入的文件（不回滚单个成功写入）并在 Deployed_Manifest 中记录部分状态。
6. [Ubiquitous] THE Reconciler SHALL 对每次操作使用唯一的临时文件后缀（包含进程 ID 或 UUID）以防止并发进程之间的冲突。

### Requirement 5: 健壮的 Manifest 验证

**User Story:** 作为拥有旧版或损坏 Manifest 的项目的 SpecForge 用户，我希望安装器能检测无效 Manifest 并触发完整 Reconcile，以便我的安装被自动修复。

#### Acceptance Criteria

1. [Event-driven] WHEN Reconciler 读取 Deployed_Manifest 且 JSON 解析成功时, THE Reconciler SHALL 验证以下必需字段存在：`shared_version`（字符串）、`installed_at`（字符串）、`updated_at`（字符串）和 `files`（对象）。
2. [Unwanted-behavior] IF Deployed_Manifest 存在但 JSON 解析失败, THEN THE Reconciler SHALL 忽略 manifestHash 值，扫描文件系统构建 Current_State（currentHash 仍来自实际文件），并以 manifestHash 视为缺失的方式执行 Full_Reconcile。
3. [Unwanted-behavior] IF Deployed_Manifest 存在但缺少必需字段, THEN THE Reconciler SHALL 忽略 manifestHash 值，扫描文件系统构建 Current_State，并以 manifestHash 视为缺失的方式执行 Full_Reconcile，同时发出 Manifest 格式无效的警告。
4. [Event-driven] WHEN Deployed_Manifest 不存在时, THE Reconciler SHALL 将 Current_State 视为空，导致 Desired_State 中所有文件获得 "create" 动作。
5. [Event-driven] WHEN Reconciler 成功完成 Reconcile_Plan 执行时, THE Reconciler SHALL 写入新的 Deployed_Manifest，包含版本、时间戳和所有已部署文件的 SHA-256 哈希。
6. [Ubiquitous] THE Reconciler SHALL 使用与组件文件相同的临时文件 + rename 模式原子写入 Deployed_Manifest。

### Requirement 6: 孤儿检测与清理

**User Story:** 作为从旧版本升级的 SpecForge 用户，我希望从源中移除的文件能自动从我的部署中清理，以便过时文件不会累积或造成冲突。

#### Acceptance Criteria

1. [Event-driven] WHEN Reconciler 构建 Current_State 时, THE Reconciler SHALL 通过以下来源发现已部署的 Managed_Component_File：Deployed_Manifest 中记录的组件文件条目、以及 managed 组件目录（agents/、tools/、tools/lib/、plugins/、skills/）中具有 sf-/sf_ 前缀的文件。
2. [Event-driven] WHEN Managed_Component_File 存在于 Current_State 但在 Desired_State 中没有对应条目时, THE Reconciler SHALL 将其分类为 Orphan_File 并按 R14.7 分配 "delete" 动作。
3. [Event-driven] WHEN Reconciler 对 Orphan_File 执行 "delete" 动作时, THE Reconciler SHALL 从文件系统中删除该文件并发出标识已删除孤儿的消息。
4. [Ubiquitous] THE Reconciler SHALL 不删除非 Managed_Component_File 的文件，即使它们存在于 managed 组件目录中但不具有 sf-/sf_ 前缀且不在 Deployed_Manifest 中。
5. [Unwanted-behavior] IF Orphan_File 无法删除（权限错误或文件锁定）, THEN THE Reconciler SHALL 发出警告并继续处理剩余动作而不停止。

### Requirement 7: Plugin 启动 Reconcile 集成

**User Story:** 作为 SpecForge 用户，我希望 Plugin 在启动时执行轻量级 Reconcile 检查，以便缺失或过时的文件能自动修复而无需手动 CLI 干预。

#### Acceptance Criteria

1. [Event-driven] WHEN Plugin 以 "repair" 模式启动（specforge/ 存在但文件缺失）时, THE Plugin SHALL 调用 Reconciler 将项目级运行时文件与期望状态进行比较并创建任何缺失文件。
2. [Event-driven] WHEN Plugin 以 "initialize" 模式启动（specforge/ 不存在）时, THE Plugin SHALL 创建完整的项目级运行时目录结构和初始文件。
3. [Ubiquitous] THE Plugin SHALL 不执行用户级共享组件的 Reconcile（该职责仍属于 CLI）。
4. [Event-driven] WHEN Plugin 在启动期间检测到无效或缺失的 Runtime_Manifest 时, THE Plugin SHALL 触发完整的项目级 Reconcile 而非进入降级模式。
5. [Unwanted-behavior] IF Plugin 的 Reconcile 操作失败, THEN THE Plugin SHALL 记录错误并以降级模式继续运行（仅 permission guard）而非崩溃。
6. [Event-driven] WHEN 项目运行时文件少于 50 个时, THE Plugin 启动 Reconcile SHALL 在 500ms 内完成。

### Requirement 8: CLI 子命令行为

**User Story:** 作为 SpecForge 用户，我希望 CLI 子命令（install、upgrade、verify、uninstall）内部使用新的 Reconcile 引擎，以便所有操作产生一致且可预测的结果。

#### Acceptance Criteria

1. [Event-driven] WHEN 用户运行 `install` 时, THE Installer SHALL 调用 Discovery_Module 构建 Desired_State，将 Current_State 视为空（全新安装），并执行生成的 Reconcile_Plan。
2. [Event-driven] WHEN 用户运行 `upgrade` 时, THE Installer SHALL 调用 Discovery_Module 构建 Desired_State，从 Deployed_Manifest 和文件系统扫描读取 Current_State，并执行生成的 Reconcile_Plan。
3. [Event-driven] WHEN 用户运行 `upgrade --force` 时, THE Installer SHALL 将所有 "conflict" 动作解析为 "update"（覆盖用户自定义）。
4. [Event-driven] WHEN 用户运行 `verify` 时, THE Installer SHALL 将已部署文件哈希与 Deployed_Manifest 条目进行比较并报告不匹配，不修改任何文件。
5. [Event-driven] WHEN 用户运行 `uninstall` 时, THE Installer SHALL 删除 Deployed_Manifest 中记录的所有文件，从 opencode.json 中移除 sf-* Agent 条目，并删除 Deployed_Manifest 本身。
6. [Ubiquitous] THE Installer SHALL 在执行 install、upgrade 或 uninstall 操作前获取安装锁，并在完成或失败时释放。
7. [Event-driven] WHEN 运行 `install` 且 Deployed_Manifest 已存在时, THE Installer SHALL 将其视为升级操作（读取现有 Current_State）而非盲目覆盖。
8. [Event-driven] WHEN install 或 upgrade 检测到已存在的 Deployed_Manifest 时, THE Installer SHALL 在生成或执行 Reconcile_Plan 之前比较源 shared_version 与 Deployed_Manifest.shared_version，如果检测到降级则按 Requirement 15 处理。

### Requirement 9: opencode.json Agent 注册

**User Story:** 作为 SpecForge 用户，我希望安装器自动将发现的 Agent 注册到 opencode.json 中，以便 OpenCode 无需手动配置即可识别所有 SpecForge Agent。

#### Acceptance Criteria

1. [Ubiquitous] THE Installer SHALL 按照 Requirement 12 的合并策略处理 opencode.json 中的 sf-* Agent 注册。
2. [Event-driven] WHEN Discovery_Module 发现 agents/ 目录中的 Agent 文件时, THE Installer SHALL 为每个 Agent 生成 opencode.json 注册条目，包含 mode、model、prompt 路径和 permission 配置。
3. [Event-driven] WHEN Agent 文件从 Desired_State 中移除时, THE Installer SHALL 从 opencode.json 中移除其对应的 sf-* 条目。
4. [Ubiquitous] THE Installer SHALL 从源仓库的 opencode.json 读取 Agent 的 model 配置作为默认值，允许用户在目标 opencode.json 中覆盖。

### Requirement 10: 跨平台兼容性

**User Story:** 作为 Windows 或 Unix 上的 SpecForge 用户，我希望安装器在两个平台上都能正确工作，以便无论操作系统如何都能使用 SpecForge。

#### Acceptance Criteria

1. [Ubiquitous] THE Installer SHALL 在 Deployed_Manifest 和所有内部路径表示中使用 POSIX 风格路径（正斜杠）。
2. [Event-driven] WHEN 向文件系统写入文件时, THE Installer SHALL 使用适当的路径分隔符将 POSIX 路径转换为原生 OS 路径。
3. [Ubiquitous] THE Installer SHALL 使用 `OPENCODE_CONFIG_DIR` 环境变量（如已设置）解析 User_Level_Directory，回退到 Unix 上的 `~/.config/opencode/` 和 Windows 上的等效路径。
4. [Ubiquitous] THE Installer SHALL 在读取现有文件系统状态时处理正斜杠和反斜杠路径分隔符。
5. [Ubiquitous] THE Installer SHALL 对所有文件系统操作使用 Bun 兼容的 API。

### Requirement 11: 向后兼容性

**User Story:** 作为拥有现有安装的 SpecForge 用户，我希望新的基于 Reconcile 的安装器能无缝处理我当前的部署，无需手动迁移步骤。

#### Acceptance Criteria

1. [Event-driven] WHEN 新 Installer 遇到由旧注册表安装器写入的 Deployed_Manifest 时, THE Installer SHALL 成功读取并使用其文件哈希作为 Current_State。
2. [Event-driven] WHEN 新 Installer 遇到由旧安装器部署但不在新 Desired_State 中的文件时, THE Installer SHALL 将其视为 Orphan_File 并清理。
3. [Ubiquitous] THE Installer SHALL 维持与前一版本相同的 Deployed_Manifest 文件名（`specforge-manifest.json`）和位置（User_Level_Directory 根目录）。
4. [Ubiquitous] THE Installer SHALL 维持相同的 CLI 接口（子命令：install、upgrade、verify、uninstall；标志：--force、--version、--help）。
5. [Event-driven] WHEN 旧安装器的 upgrade_journal.json 存在于 User_Level_Directory（表示之前中断的升级）时, THE Installer SHALL 在成功 Reconcile 完成后删除它。

### Requirement 12: opencode.json 合并策略

**User Story:** 作为 SpecForge 用户，我希望安装器对 opencode.json 采用合并写入策略，以便在管理 sf-* Agent 注册的同时保留我的其他配置。

#### Acceptance Criteria

1. [Event-driven] WHEN Reconciler 完成文件部署后, THE Installer SHALL 读取 User_Level_Directory 的 opencode.json（如存在），合并 sf-* Agent 定义，保留所有非 sf-* 条目不变，然后原子写入。
2. [Event-driven] WHEN opencode.json 不存在时, THE Installer SHALL 创建它，包含 `$schema` 字段和 sf-* Agent 定义。
3. [Unwanted-behavior] IF opencode.json 存在但 JSON 解析失败, THEN THE Installer SHALL 备份损坏文件到 `.backup/` 目录，然后创建新的 opencode.json。
4. [Event-driven] WHEN Agent 文件从 Desired_State 中移除时, THE Installer SHALL 从 opencode.json 中移除其对应的 sf-* 条目。
5. [Ubiquitous] THE Installer SHALL 使用临时文件 + rename 模式原子写入 opencode.json。
6. [Ubiquitous] THE Installer SHALL 将 opencode.json 中的 sf-* 条目视为 Managed_Generated_File，由本需求（R12）专门管理，不进入 R14 的通用决策矩阵。

### Requirement 13: 错误报告与诊断

**User Story:** 作为 SpecForge 用户或开发者，我希望在出错时获得清晰的错误消息和诊断输出，以便快速理解和解决问题。

#### Acceptance Criteria

1. [Event-driven] WHEN Reconciler 在计划执行期间遇到错误时, THE Reconciler SHALL 报告具体的文件路径、尝试的动作和错误原因。
2. [Ubiquitous] THE Installer SHALL 在每次操作后显示摘要，包括：已创建文件数、已更新文件数、已删除文件数、已跳过文件数和有冲突文件数。
3. [Event-driven] WHEN 使用 `--version` 标志运行时, THE Installer SHALL 从 Deployed_Manifest 显示已安装的 SpecForge 版本、安装时间戳、最后更新时间戳和已部署文件数量。
4. [Unwanted-behavior] IF Source_Directory 缺失或不可访问, THEN THE Installer SHALL 报告清晰的错误消息标识预期的源路径并以非零退出码退出。
5. [Unwanted-behavior] IF 安装锁在 30 秒内无法获取, THEN THE Installer SHALL 报告另一个安装操作正在进行并以非零退出码退出。
6. [Event-driven] WHEN `verify` 子命令检测到不匹配时, THE Installer SHALL 报告每个不匹配文件及其预期哈希（来自 Manifest）和实际哈希（来自文件系统）。

### Requirement 14: Reconcile 决策矩阵

**User Story:** 作为 SpecForge 实现者，我需要一个明确的决策表来确定每个文件的 Reconcile 动作，以便消除 source/current/manifest 三方哈希不同步时的歧义。

#### Acceptance Criteria

1. [Ubiquitous] THE Reconciler SHALL 使用以下三个输入决定每个文件的动作：sourceHash（源文件哈希）、currentHash（目标文件系统中的当前哈希）、manifestHash（Deployed_Manifest 中记录的上次部署哈希）。
2. [Event-driven] WHEN sourceHash 存在且 currentHash 不存在时, THE Reconciler SHALL 分配 "create" 动作。
3. [Event-driven] WHEN sourceHash 等于 currentHash 时, THE Reconciler SHALL 分配 "skip" 动作并在需要时刷新 manifestHash。
4. [Event-driven] WHEN sourceHash 不等于 currentHash 且 currentHash 等于 manifestHash 时, THE Reconciler SHALL 分配 "update" 动作（文件未被用户修改，可安全更新）。
5. [Event-driven] WHEN sourceHash 不等于 currentHash 且 currentHash 不等于 manifestHash 且 currentHash 不等于 sourceHash 时, THE Reconciler SHALL 对可自定义组件类型（agent、skill）分配 "conflict" 动作。
6. [Event-driven] WHEN sourceHash 不等于 currentHash 且 currentHash 不等于 manifestHash 且 Component_Type 为 tool、tool_lib 或 plugin 时, THE Reconciler SHALL 分配 "update" 动作并发出 "tamper_or_corruption" 警告（非可自定义组件不保护用户修改）。
7. [Event-driven] WHEN sourceHash 不存在且 currentHash 存在且文件为 Managed_Component_File 时, THE Reconciler SHALL 分配 "delete" 动作。Managed_Generated_File 不适用此规则，由各自专用需求处理。
8. [Event-driven] WHEN sourceHash 不存在且 currentHash 存在且文件不是 managed file 时, THE Reconciler SHALL 忽略该文件。
9. [Event-driven] WHEN manifestHash 不存在（首次安装或 Manifest 损坏后）时, THE Reconciler SHALL 将 currentHash 不等于 sourceHash 的文件视为需要 "update"（不触发 conflict，因为无法判断是否为用户自定义）。此规则优先于 R14.5 和 R14.6（当 manifestHash 缺失时不适用 conflict 判断）。
10. [Event-driven] WHEN sourceHash 不存在且 currentHash 不存在但 manifestHash 存在时, THE Reconciler SHALL 分配 "skip" 动作并在写入新的 Deployed_Manifest 时移除该 stale manifest 条目。
11. [Event-driven] WHEN sourceHash 不存在且 currentHash 不存在且 manifestHash 不存在时, THE Reconciler SHALL 不为该条目生成任何动作。

### Requirement 15: 降级策略

**User Story:** 作为 SpecForge 用户，我希望安装器在检测到降级操作时有明确的行为，以便我不会意外损坏安装。

#### Acceptance Criteria

1. [Event-driven] WHEN Installer 检测到源 shared_version 低于 Deployed_Manifest 中的 shared_version 时, THE Installer SHALL 将该操作视为降级。
2. [Event-driven] WHEN 降级操作未使用 --force 标志时, THE Installer SHALL 在文件变更前停止并报告清晰的错误，说明检测到降级并建议使用 --force。
3. [Event-driven] WHEN 降级操作使用 --force 标志时, THE Installer SHALL 使用低版本的 Desired_State 执行 Reconcile，并删除不在该版本中的 managed orphan 文件。
4. [Event-driven] WHEN 降级影响 opencode.json 时, THE Installer SHALL 在应用降级变更前备份当前 opencode.json 到 `.backup/` 目录。
5. [Ubiquitous] THE Installer SHALL 在降级完成后报告摘要，包括：前一版本、目标版本、已删除文件、已覆盖文件和已跳过冲突。


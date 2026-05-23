# Requirements Document

## Introduction

SpecForge 当前在 user-level manifest、project-level manifest、shared 配置层、CLI 与 plugin 之间散落了至少 7 个版本字段（`shared_version`、`schema_version`、`runtime_schema_version`、`required_shared_version_range`、用户级 `code_version`、项目级 `code_version` 等），相互含义重叠且类型耦合错误。leidian 项目最近因为项目级 manifest 写着 `required_shared_version_range: ">=3.5.0 <6.0.0"`，而用户级 manifest 写着 `shared_version: "6.0.0-dev"`，触发了启动期 range 比对失败，导致整个项目集体降级到 read-only 模式，用户无法继续推进任务。

本特性把版本字段从"开发自由发挥"收敛到一套强制规则下：

- 用户级与项目级 manifest 各自只保留一个语义清晰的版本字段，外加一个"代码声明能读多老的数据"字段
- 启动期兼容性检查不再用 range 表达式，改为基于 `data_schema_version` 与 `min_supported_data_schema` 的单向数值比较
- 跨 schema 升级由 migration 链按需顺序运行，每步幂等且原子
- 字段的修改时机、修改主体、修改方式由 CI 强制执行，违反规则的 PR 自动 reject
- 老格式 manifest 在 3 个 release 周期内被自动 in-place 升级，迁移路径对最终用户透明

预期结果：升级 SpecForge 版本不再产生跨用户/跨项目的版本字段冲突，新人贡献者无法在不写 migration 的情况下改 schema，老项目升级路径可预测、可回放、可测试。

## Glossary

- **SpecForge_System**: SpecForge 整体软件系统，包含 CLI、plugin、用户级与项目级 manifest 管理逻辑。
- **User_Manifest**: 用户级 manifest 文件，路径为 `~/.specforge/manifest.json`，记录已安装的 SpecForge 代码版本与该次安装的元数据。
- **Project_Manifest**: 项目级 manifest 文件，路径为 `<project>/.specforge/manifest.json`，记录该项目数据所遵循的 schema 版本。
- **code_version**: SpecForge 代码本身的发布版本（语义化版本字符串，例如 `6.0.0`），由仓库根 `package.json` 的 `version` 字段唯一定义。
- **data_schema_version**: Project_Manifest 持有的整数版本号，标识该项目的运行时数据结构当前所属的 schema 代次。
- **min_supported_data_schema**: User_Manifest 持有的整数版本号，标识当前已安装的 SpecForge 代码能够直接读取的最老 schema 代次。
- **Migration_Chain**: 由若干个版本间 migration 脚本组成的有序集合，第 N 个脚本负责把 schema 版本 N-1 的项目数据升级到 schema 版本 N。
- **Migration_Script**: Migration_Chain 中的单个脚本，输入是符合某 schema 版本 v(N-1) 的 Project_Manifest 与项目数据，输出是符合 schema 版本 v(N) 的同一组数据。
- **Read_Only_Degraded_Mode**: SpecForge_System 的一种受限运行模式，在该模式下用户可以查看现有项目数据但 SpecForge_System 拒绝任何写操作。
- **Manifest_Migrator**: 负责识别并自动 in-place 升级老格式 manifest 的内部组件。
- **CI_Version_Guard**: 在 CI 流水线中运行的版本字段静态检查器，检测违反字段修改规则的代码改动。
- **Doctor_Command**: `bun scripts/sf-installer.ts doctor` 命令，向用户展示 SpecForge_System 当前安装与运行状态。
- **Migrate_Manifest_Command**: `bun scripts/sf-installer.ts migrate-manifest` 命令，把任意老格式 manifest in-place 升级到当前格式。
- **Release_Cycle**: 一次 SpecForge npm 发布周期，从一个稳定版本号发布到下一个稳定版本号发布之间的全部时间。
- **Deprecation_Period**: 老字段从被标记为 deprecated 到被自动移除的过渡区间，跨度为 3 个连续 Release_Cycle。

## Requirements

### Requirement 1: User Manifest 字段集合

**User Story:** 作为 SpecForge 维护者，我希望用户级 manifest 只保留一组语义清晰的版本字段，这样不同字段之间不会再产生重叠或冲突。

#### Acceptance Criteria

1. THE SpecForge_System SHALL persist exactly five top-level fields in the User_Manifest: `code_version`, `min_supported_data_schema`, `installed_at`, `updated_at`, and `files`.
2. THE SpecForge_System SHALL serialize `code_version` in the User_Manifest as a semantic version string that equals the `version` field of the repository root `package.json` at install time.
3. THE SpecForge_System SHALL serialize `min_supported_data_schema` in the User_Manifest as a non-negative integer.
4. THE SpecForge_System SHALL serialize `installed_at` and `updated_at` in the User_Manifest as ISO 8601 timestamp strings.
5. WHEN the SpecForge_System writes a User_Manifest, THE SpecForge_System SHALL omit any of the following legacy fields: `shared_version`, `required_shared_version_range`, `schema_version`, `runtime_schema_version`.
6. IF a User_Manifest write operation is attempted with any field outside the set defined in criterion 1, THEN THE SpecForge_System SHALL reject the write operation with an error that names the offending field.

### Requirement 2: Project Manifest 字段集合

**User Story:** 作为 SpecForge 维护者，我希望项目级 manifest 只持有项目数据的 schema 版本，这样项目数据的可读性只取决于一个数字。

#### Acceptance Criteria

1. THE SpecForge_System SHALL persist exactly three top-level fields in the Project_Manifest: `data_schema_version`, `initialized_at`, and `updated_at`.
2. THE SpecForge_System SHALL serialize `data_schema_version` in the Project_Manifest as a non-negative integer.
3. THE SpecForge_System SHALL serialize `initialized_at` and `updated_at` in the Project_Manifest as ISO 8601 timestamp strings.
4. WHEN the SpecForge_System writes a Project_Manifest, THE SpecForge_System SHALL omit any of the following legacy fields: `shared_version`, `required_shared_version_range`, `schema_version`, `runtime_schema_version`, `code_version`.
5. IF a Project_Manifest write operation is attempted with any field outside the set defined in criterion 1, THEN THE SpecForge_System SHALL reject the write operation and emit an error that names the offending field, AND WHEN a write operation contains only fields from the set defined in criterion 1, THE SpecForge_System SHALL NOT emit any field-rejection error.

### Requirement 3: 启动期兼容性判断

**User Story:** 作为 SpecForge 用户，我希望启动 SpecForge 时只用一个简单的数值比较来判断兼容性，这样我可以预测在什么条件下需要升级、降级或自动迁移。

#### Acceptance Criteria

1. WHEN the SpecForge_System starts inside a project that has a Project_Manifest, THE SpecForge_System SHALL read `data_schema_version` from the Project_Manifest and `min_supported_data_schema` from the User_Manifest before any project data read.
2. WHEN `data_schema_version` is greater than or equal to `min_supported_data_schema` and less than or equal to the highest schema version known to the running SpecForge_System code, THE SpecForge_System SHALL enter normal read-write mode.
3. WHEN `data_schema_version` is less than `min_supported_data_schema`, THE SpecForge_System SHALL run the Migration_Chain from `data_schema_version` up to the highest schema version known to the running SpecForge_System code before any project data read, AND THE SpecForge_System SHALL re-evaluate the compatibility comparison defined in criterion 2 against the post-migration `data_schema_version` before deciding the operating mode.
4. WHEN `data_schema_version` is strictly greater than the highest schema version known to the running SpecForge_System code, THE SpecForge_System SHALL enter Read_Only_Degraded_Mode and emit an error message that names the observed `data_schema_version`, the highest supported schema version, and the recommended action of upgrading the SpecForge_System code.
5. THE SpecForge_System SHALL NOT evaluate any version range expression during startup compatibility checks.

### Requirement 4: Migration 链机制

**User Story:** 作为 SpecForge 维护者，我希望每次提升 schema 版本都有一个独立、幂等、原子的 migration 脚本，这样老项目可以按需升级而不破坏现有数据。

#### Acceptance Criteria

1. THE SpecForge_System SHALL provide a Migration_Script for every consecutive schema version pair `(N-1, N)` between the lowest schema version still supported by the running code and the highest schema version known to the running code.
2. WHEN the SpecForge_System runs the Migration_Chain from version `A` to version `B` with `A < B`, THE SpecForge_System SHALL invoke each Migration_Script in ascending order of target version.
3. WHEN a Migration_Script completes successfully, THE SpecForge_System SHALL set `data_schema_version` in the Project_Manifest to the target version of that script and write `updated_at` to the current ISO 8601 timestamp before invoking the next Migration_Script.
4. WHERE a Migration_Script is invoked twice on input data already at the target version, THE SpecForge_System SHALL leave the Project_Manifest and project data byte-identical to the state before the second invocation.
5. IF a Migration_Script raises an error during execution, OR IF a Migration_Script fails for any reason including but not limited to timeouts, resource exhaustion, or filesystem errors, THEN THE SpecForge_System SHALL attempt to roll back all file changes performed by that single Migration_Script, abort the remaining Migration_Chain, AND IF the rollback succeeds THE SpecForge_System SHALL leave the Project_Manifest at the version recorded before the failed script ran, AND IF the rollback itself fails THE SpecForge_System SHALL leave `data_schema_version` unchanged from its pre-migration value.
6. THE SpecForge_System SHALL ship an automated test for every Migration_Script that asserts both forward correctness on representative version `N-1` data and idempotence when re-applied to version `N` data.

### Requirement 5: code_version 字段的修改规则

**User Story:** 作为 SpecForge 维护者，我希望 `code_version` 只能在仓库根 `package.json` 一个地方定义，这样发布版本号永远不会出现两份不同步的真值。

#### Acceptance Criteria

1. THE SpecForge_System SHALL derive every runtime read of `code_version` from the `version` field of the repository root `package.json` at build time or install time.
2. IF a pull request adds or modifies a line containing a string literal that matches the regular expression `code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+` in any source file other than the repository root `package.json`, THEN THE CI_Version_Guard SHALL reject the pull request and report the offending file path and line number.
3. WHEN a maintainer prepares a SpecForge release, THE SpecForge_System release process SHALL update `code_version` exclusively by changing the `version` field of the repository root `package.json` and SHALL refuse to publish if any other file has been changed to encode a different version string.

### Requirement 6: min_supported_data_schema 字段的修改规则

**User Story:** 作为 SpecForge 维护者，我希望 `min_supported_data_schema` 只在主动放弃对老 schema 的支持时被提升，这样老用户不会因为不相关的代码改动突然失去兼容性。

#### Acceptance Criteria

1. THE SpecForge_System SHALL declare `min_supported_data_schema` exactly once in source code, in a constant named `MIN_SUPPORTED_DATA_SCHEMA` exported from a single dedicated module.
2. WHEN a pull request changes the value of `MIN_SUPPORTED_DATA_SCHEMA`, THE pull request SHALL include a deprecation notice document under `docs/deprecations/` that names the dropped schema versions and the replacement migration path.
3. IF a pull request changes the value of `MIN_SUPPORTED_DATA_SCHEMA` and does not include a corresponding deprecation notice document, THEN THE CI_Version_Guard SHALL reject the pull request and report the missing document path.
4. THE SpecForge_System SHALL constrain `MIN_SUPPORTED_DATA_SCHEMA` to non-negative integers, SHALL only allow it to change by monotonic increments, and SHALL refuse any pull request that decreases its value regardless of accompanying documentation.

### Requirement 7: data_schema_version 字段的修改规则

**User Story:** 作为 SpecForge 维护者，我希望 `data_schema_version` 只能由 migration 脚本写入，这样项目数据的版本号永远反映该数据真实经历过的迁移。

#### Acceptance Criteria

1. THE SpecForge_System SHALL restrict writes to the `data_schema_version` field of any Project_Manifest to a single dedicated writer module.
2. WHEN the dedicated writer module updates `data_schema_version`, THE SpecForge_System SHALL ensure the call originates from the completion handler of a Migration_Script.
3. WHEN the dedicated writer module updates `data_schema_version`, THE SpecForge_System SHALL ensure the updated value is strictly greater than the previous value persisted in the same Project_Manifest.
4. IF a pull request adds or modifies any assignment to `data_schema_version` in source code outside the dedicated writer module, THEN THE CI_Version_Guard SHALL reject the pull request and report the offending file path and line number.
5. WHEN the dedicated writer module writes `data_schema_version` as part of a Migration_Script completion handler, THE SpecForge_System SHALL also write `updated_at` to the current ISO 8601 timestamp in the same atomic write operation.

### Requirement 8: 新增 schema 版本的流程

**User Story:** 作为 SpecForge 贡献者，我希望新增一个 schema 版本时有清单式的步骤要走，这样不会出现"改了 schema 但没写 migration"的半成品 PR。

#### Acceptance Criteria

1. WHEN a pull request introduces a new schema version `N`, THE pull request SHALL include all of the following artifacts in the same commit set: a Migration_Script for the version pair `(N-1, N)`, the updated read-write code paths for schema version `N`, automated tests covering both schema versions `N-1` and `N`, and an updated decision record under `docs/schema-versions/` describing the change.
2. IF a pull request adds a new schema version `N` and is missing one or more of the artifacts listed in criterion 1, THEN THE CI_Version_Guard SHALL collect every missing artifact across the full pull request, reject the pull request, and emit a single report that names every missing artifact together rather than failing on the first miss.
3. WHEN a pull request adds a new schema version `N`, THE pull request SHALL leave `MIN_SUPPORTED_DATA_SCHEMA` unchanged unless the same pull request also satisfies the deprecation notice requirements of Requirement 6.

### Requirement 9: CI 强制执行版本字段规则

**User Story:** 作为 SpecForge 维护者，我希望违反版本字段规则的 PR 在 CI 阶段就被拦下，这样错误改动不会进入 main 分支。

#### Acceptance Criteria

1. THE SpecForge_System SHALL run CI_Version_Guard on every pull request that modifies any file under the SpecForge repository.
2. WHEN CI_Version_Guard detects a violation of Requirement 5, Requirement 6, Requirement 7, or Requirement 8, THE CI_Version_Guard SHALL exit with a non-zero status code and emit a report listing each detected violation.
3. WHEN CI_Version_Guard fails to complete with exit status code 0 for any reason (including detected violations and infrastructure failures), THE pull request CI status SHALL block merge until CI_Version_Guard completes successfully with exit status code 0, and THE entire CI pipeline result SHALL report as failed regardless of other checks; WHERE CI_Version_Guard completes with exit status code 0 in zero elapsed seconds, THE SpecForge_System SHALL treat the run as successful and SHALL NOT block merge on the basis of the run duration alone.
4. THE SpecForge_System SHALL execute CI_Version_Guard within 30 seconds on a repository containing up to 1000 source files.

### Requirement 10: 用户侧版本号可见性

**User Story:** 作为 SpecForge 用户，我希望日常使用时不感知任何版本号细节，但在需要排错时可以一条命令拿到完整版本信息。

#### Acceptance Criteria

1. WHEN the SpecForge_System runs in normal read-write mode, THE SpecForge_System SHALL NOT print any of `code_version`, `data_schema_version`, or `min_supported_data_schema` to the user-facing console output.
2. WHEN the user invokes the SpecForge_System with the `--version` flag and version retrieval succeeds, THE SpecForge_System SHALL print `code_version` followed by a newline and exit with status code 0; IF version retrieval encounters an internal error, THEN THE SpecForge_System SHALL print a diagnostic error message identifying the failure and SHALL exit with a non-zero status code.
3. WHEN the user invokes the Doctor_Command, THE SpecForge_System SHALL print `code_version`, `min_supported_data_schema`, and `data_schema_version` together with the absolute paths of the User_Manifest and the Project_Manifest.
4. WHEN the SpecForge_System runs the Migration_Chain successfully, THE SpecForge_System SHALL print a single line summarizing the source schema version, the target schema version, and the elapsed wall-clock duration in milliseconds.
5. WHEN the SpecForge_System enters Read_Only_Degraded_Mode, THE SpecForge_System SHALL print an error message that contains the observed `data_schema_version`, the highest schema version supported by the running code, and an actionable suggestion to upgrade the SpecForge_System code.

### Requirement 11: 老格式兼容期与 in-place 升级

**User Story:** 作为升级 SpecForge 的现有用户，我希望老格式的 manifest 在 3 个 release 周期内被自动迁移到新格式，这样我不需要手动改任何文件。

#### Acceptance Criteria

1. WHEN the SpecForge_System starts and reads a User_Manifest or Project_Manifest that contains any legacy field listed in Requirement 1 criterion 5 or Requirement 2 criterion 4, THE Manifest_Migrator SHALL identify the manifest as a legacy manifest.
2. WHILE the running code is published in the first Release_Cycle of the Deprecation_Period, THE Manifest_Migrator SHALL write both the new fields and the legacy fields to every manifest write, and IF the new fields cannot be written successfully, THEN THE Manifest_Migrator SHALL abort the write and roll back the manifest file to its previous state.
3. WHILE the running code is published in the second Release_Cycle of the Deprecation_Period, THE Manifest_Migrator SHALL read legacy fields when present, write new fields on every manifest write, and emit a single deprecation warning per process invocation that names the legacy fields detected.
4. WHILE the running code is published in the third Release_Cycle of the Deprecation_Period, THE Manifest_Migrator SHALL convert any detected legacy manifest to the new format in-place at startup and SHALL stop reading or writing legacy fields after the conversion.
5. WHEN the Manifest_Migrator performs an in-place conversion under criterion 4, THE Manifest_Migrator SHALL preserve the original manifest as a sibling backup file with the suffix `.legacy.bak` before overwriting the active manifest.

### Requirement 12: 一键迁移命令

**User Story:** 作为升级 SpecForge 的现有用户，我希望有一条独立命令可以把任意老 manifest 显式升级到当前格式，这样我可以在 release notes 之外主动驱动迁移。

#### Acceptance Criteria

1. THE SpecForge_System SHALL expose Migrate_Manifest_Command as `bun scripts/sf-installer.ts migrate-manifest`.
2. WHEN the user invokes Migrate_Manifest_Command on a manifest that already conforms to the current format, THE SpecForge_System SHALL leave the manifest file byte-identical and exit with status code 0.
3. WHEN the user invokes Migrate_Manifest_Command on a legacy manifest, THE SpecForge_System SHALL convert the manifest to the current format, set the `format` metadata field of the converted manifest to the constant value `CURRENT`, preserve the original manifest as a sibling backup file with the suffix `.legacy.bak`, and exit with status code 0.
4. IF the conversion performed by Migrate_Manifest_Command raises an error, THEN THE SpecForge_System SHALL leave the active manifest file byte-identical to its state before the command ran, write a diagnostic log entry to `<manifest-dir>/migrate-error.log`, and exit with a non-zero status code.
5. THE SpecForge_System SHALL allow Migrate_Manifest_Command to be invoked any number of times consecutively on the same manifest without producing differences in the active manifest content beyond the first successful conversion.

### Requirement 13: Migration 失败的兜底

**User Story:** 作为 SpecForge 用户，我希望 migration 失败时不丢数据、有清晰错误信息、能继续阅读现有项目，这样故障不会立即阻塞我的工作。

#### Acceptance Criteria

1. IF the Migration_Chain raises an error during startup, THEN THE SpecForge_System SHALL leave the Project_Manifest byte-identical to its state before the chain started.
2. IF the Migration_Chain raises an error during startup, THEN THE SpecForge_System SHALL write a diagnostic log entry to `<project>/.specforge/migration-error.log` containing the schema version pair under migration, the originating error message, and the stack trace.
3. IF the Migration_Chain raises an error during startup, THEN THE SpecForge_System SHALL enter Read_Only_Degraded_Mode and continue serving read requests against the unchanged project data, AND THE SpecForge_System SHALL reject every write attempt against project data or project metadata while in this mode, including attempts to create new projects or modify existing project metadata.
4. WHEN the SpecForge_System enters Read_Only_Degraded_Mode specifically because of a Migration_Chain failure, THE SpecForge_System SHALL attempt to print an error message that names the failed schema version pair, the absolute path of the diagnostic log entry, and the recommended next step of contacting support or rolling back the SpecForge_System code; IF the print attempt itself fails, THEN THE SpecForge_System SHALL remain in Read_Only_Degraded_Mode silently without retrying the message and without surfacing the print failure to the user.
5. WHEN the SpecForge_System enters Read_Only_Degraded_Mode for any reason other than a Migration_Chain failure, THE SpecForge_System SHALL NOT print the migration-specific error message defined in criterion 4.

### Requirement 14: 用户级 manifest 缺失的兜底

**User Story:** 作为新用户，我希望第一次运行 SpecForge 时即使 User_Manifest 不存在也能得到清晰的引导，这样我知道下一步要装什么。

#### Acceptance Criteria

1. WHEN the SpecForge_System starts and the User_Manifest file does not exist on disk, THE SpecForge_System SHALL print an instructional message that names the expected User_Manifest path and the exact installer command to create it.
2. WHEN the SpecForge_System starts and the User_Manifest file does not exist on disk, THE SpecForge_System SHALL exit with status code 0 after printing the instructional message and SHALL NOT modify any project data; THE SpecForge_System MAY read project files in read-only fashion to enrich the instructional message with project context.
3. IF the User_Manifest file exists but cannot be parsed as JSON, THEN THE SpecForge_System SHALL print an error message that names the User_Manifest path and the originating parse error and SHALL exit with a non-zero status code.

### Requirement 15: 项目级 manifest 缺失的兜底

**User Story:** 作为新项目的 owner，我希望在没有 Project_Manifest 的目录运行 SpecForge 时被当作新项目自动 init，这样我不需要先手动跑一条 init 命令。

#### Acceptance Criteria

1. WHEN the SpecForge_System starts in a directory that has no Project_Manifest and the User_Manifest indicates a successful install, THE SpecForge_System SHALL create a new Project_Manifest with `data_schema_version` set to the highest schema version known to the running code.
2. WHEN the SpecForge_System creates a new Project_Manifest under criterion 1, THE SpecForge_System SHALL set `initialized_at` and `updated_at` to the current ISO 8601 timestamp.
3. WHEN the SpecForge_System creates a new Project_Manifest under criterion 1, THE SpecForge_System SHALL emit a single info-level message that names the absolute path of the new Project_Manifest and the chosen `data_schema_version`.
4. IF the directory containing the new Project_Manifest is not writable by the current process, THEN THE SpecForge_System SHALL print an error message that names the directory path and the originating filesystem error and SHALL exit with a non-zero status code.

# Requirements Document

## Introduction

本规范定义 SpecForge V6 的 **Distribution（分发与安装）** 模块。该模块覆盖 V6.0 发版到用户手中的"最后一公里"：将 monorepo 中的核心包打包成可发布的 npm 模块、提供 `specforge` CLI 入口、用 `specforge init` 安装向导引导用户初始化 `~/.specforge/` 目录结构，并保证 Windows / macOS / Linux 三平台的安装与首次启动行为一致。

**Parent Specification**: 本 spec 继承并实现父规范 **[v6-architecture-overview](../v6-architecture-overview/requirements.md)** 中定义的架构约束，对应里程碑 **M7（分发与迁移）** 与路线图 **W4（分发与远程接入）**。

**Scope**: 本 spec 是 **P0**，必须在 V6.0 发版前完成。

## Scope Boundary

本 spec 的边界严格限定在"打包 → 发布 → 安装 → 初始化 → 烟雾验证"这条链路。**不重复**已由其他 spec 承接的能力：

| 能力 | 归属 spec | 说明 |
|---|---|---|
| `schema_version` 单调演进、迁移脚本执行、备份/回滚 | `migration` | 本 spec 只生成空的 `~/.specforge/migrations/` 目录骨架，不实现 `vA-to-vB.ts` 执行器 |
| 远程访问鉴权、API key、IP 白名单、二步确认 | `permission-engine`（已实现 Property 26） | 本 spec 只确保 `specforge init` 不开启远程模式；远程模式开关由 permission-engine 管理 |
| OpenClaw 端到端集成 | `integration-tests`（已实现 Phase 4） | 本 spec 不重测 OpenClaw |
| Daemon 启动行为、Event Bus、HTTP server | `daemon-core` | 本 spec 只在烟雾测试中验证"装完能 `specforge daemon start` 起来" |
| CLI 命令双模式、`--json`、jobId | `cli` | 本 spec 只新增 `specforge init` 一个命令，遵循 cli spec 既有契约 |

## Inherited Architectural Properties

本 spec 继承父规范的下列 Correctness Properties，必须以 PBT 或可静态验证的方式落实：

### Property 14: Schema Version Monotonicity

*For all* 持久化文件 f 与迁移脚本执行结果，迁移执行后写入的 `schema_version` 必定 ≥ 迁移前的 `schema_version`；不存在任何迁移会导致 `schema_version` 下降。

**本 spec 的承接面**：`specforge init` 写入的所有持久化文件（`config/config.yaml`、`logs/.gitkeep` metadata 等）首次创建时 `schema_version` 必须为已发布 CLI 的 `code_schema_version`，且不得低于 npm 包内嵌的 `schema_version` 基线。Property 14 主体由 migration spec 验证；本 spec 只验证"安装后初始 `schema_version` == 包内嵌基线"这一子条件。

**Validates: Requirements 4.5, 6.3**

### Property 15: Scope Boundary Property

*For all* REQ-25 中标记为 P1 / P2 的能力 c，c 不得在 V6.0 发版分支中默认启用（可存在死代码或 feature flag，但默认关闭）。

**本 spec 的承接面**：`specforge init` 生成的默认配置必须使所有 P1 / P2 feature flag 的初始值为 `false`/未启用；安装后首次启动健康检查必须能 enumerate 所有 P1/P2 标志的当前值并断言其为关闭状态。

**Validates: Requirements 4.6, 6.4**

## Requirements

### Requirement 1: npm Package Publishing

**User Story:** As a SpecForge maintainer, I want every V6.0 P0 module in `packages/` to be publishable as a standalone npm module, so that the `@specforge/cli` user-facing package can depend on them through normal npm resolution rather than monorepo-only paths.

#### Acceptance Criteria

1. WHEN the publish workflow runs, THE Distribution_Module SHALL ensure every package under `packages/` that is referenced (directly or transitively) by `@specforge/cli` declares an npm `name` of the form `@specforge/<module>` in its `package.json`.
2. WHEN the publish workflow runs, THE Distribution_Module SHALL ensure every publishable package's `package.json` contains the fields `name`, `version`, `description`, `main`, `types`, `files`, `license`, `repository`, and `schema_version`.
3. WHEN the publish workflow runs, THE Distribution_Module SHALL ensure every publishable package's `package.json` declares `"engines": { "node": ">=20" }` and `"engines": { "bun": ">=1.0" }` to align with REQ-28 AC-3 (Bun 首选、Node.js LTS 次选).
4. THE Distribution_Module SHALL ensure all internal cross-package dependencies use the `workspace:*` protocol during development; AND WHEN the publish workflow runs, THE Distribution_Module SHALL rewrite every `workspace:*` dependency in the published `package.json` to an exact `MAJOR.MINOR.PATCH` version of the depended-on package.
5. WHEN the publish workflow processes a publishable package, THE Distribution_Module SHALL run `bun run build` for that package and verify the `dist/` artifact contains the file referenced by `package.json#main` and `package.json#types`.
6. WHERE a package is internal-only (`private: true` and not depended on by `@specforge/cli`), THE Distribution_Module SHALL skip that package during the publish workflow without failing.
7. IF any publishable package's `package.json` fails any validation defined by AC-1 through AC-4 (naming format mismatch, missing required field, missing or wrong `engines` value, or unrewritten `workspace:*` dependency at publish time), THEN THE Distribution_Module SHALL fail the publish workflow with an error message naming the offending package and the specific validation that failed.
8. IF `bun run build` for a publishable package fails during the publish workflow, THEN THE Distribution_Module SHALL fail the publish workflow with an error message naming the package and the build process exit code.
9. IF the `dist/` artifact for a publishable package does not contain the file referenced by `package.json#main` or `package.json#types` after `bun run build` completes, THEN THE Distribution_Module SHALL fail the publish workflow with an error message naming the package and the missing file path.

### Requirement 2: `@specforge/cli` Entry Package

**User Story:** As an end user, I want a single `npm install -g @specforge/cli` command to provide me the `specforge` executable along with all functionality required to run V6.0, so that I do not need to install or wire up internal `@specforge/*` packages by hand.

#### Acceptance Criteria

1. THE `@specforge/cli` package SHALL declare a `bin` field mapping the executable name `specforge` to a runnable entry script.
2. WHEN `specforge --version` is invoked within 5 seconds of `npm install -g @specforge/cli` completing on a Supported Platform (per REQ-28 AC-1), THE CLI SHALL exit with code 0.
3. THE `@specforge/cli` package SHALL declare runtime dependencies on every `@specforge/<module>` package required for the V6.0 feature set, with each dependency pinned to an exact `MAJOR.MINOR.PATCH` version at publish time; AND THE Distribution_Module SHALL forbid in published `dependencies` of `@specforge/cli` the use of caret (`^`), tilde (`~`), wildcard (`*`, `x`), comparator ranges (`>=`, `<`, `>`, `<=`), distribution tags (such as `latest` or `next`), and git or file specifiers.
4. WHEN the user runs `specforge --version`, THE CLI SHALL write to stdout the `version` field from `@specforge/cli`'s `package.json` followed by a single `\n` newline delimiter followed by the `schema_version` of the embedded data model baseline, with both fields non-empty, AND SHALL exit with code 0 within 2 seconds.
5. WHEN the user runs `specforge --help` immediately after a fresh `npm install -g`, THE CLI SHALL exit with code 0 within 5 seconds, AND stdout SHALL contain the literal subcommand names `init`, `daemon`, `job`, and `webhook`.
6. IF `npm install -g @specforge/cli` is run on a platform outside the Supported Platforms list (per REQ-28 AC-1), THEN THE Distribution_Module SHALL emit a non-fatal warning to stderr during `postinstall` naming the unsupported platform, AND the install process SHALL still exit with code 0.
7. IF a pinned `@specforge/<module>` dependency declared per AC-3 cannot be resolved at runtime (for example because the user's npm registry mirror has not synchronized that exact version), THEN `specforge --help` SHALL print to stderr a single-line remediation message naming the missing package and SHALL exit with code 1.

### Requirement 3: `specforge init` Installation Wizard

**User Story:** As a first-time user, I want a single `specforge init` command to set up everything SpecForge needs in my home directory, so that I can start using SpecForge without manually creating directories or editing config files.

#### Acceptance Criteria

1. THE Installation_Wizard SHALL implement the `specforge init` subcommand inside `@specforge/cli`, accepting only the flags `--force`, `--json`, and `--help`; AND IF `specforge init` is invoked with any flag not in this set, THEN THE Installation_Wizard SHALL exit with code 2 and print a usage message to stderr naming the unknown flag.
2. WHEN the user runs `specforge init` and `~/.specforge/` does not exist, THE Installation_Wizard SHALL create the full directory structure defined in Requirement 4 and write a fresh default `config/config.yaml`.
3. WHEN the user runs `specforge init` and at least one direct child directory of `~/.specforge/` listed in Requirement 4 AC-1 is already present, THE Installation_Wizard SHALL detect the existing installation, print a summary of the current `schema_version` and which direct child subdirectories of `~/.specforge/` are present, AND exit with status code 0; AND THE Installation_Wizard SHALL NOT write any file or directory under `~/.specforge/` during this invocation.
4. THE Installation_Wizard SHALL support a `--force` flag that, when present, overwrites only the files `~/.specforge/config/config.yaml` and `~/.specforge/.installation.json`; AND `--force` SHALL NOT delete or modify any file under `~/.specforge/migrations/` regardless of authorship, AND SHALL NOT delete or modify any file under `~/.specforge/logs/` regardless of when it was written.
5. THE Installation_Wizard SHALL support a `--json` flag that produces on stdout a single JSON object with the fields `installRoot: string`, `schema_version: string`, `createdDirs: string[]`, `existingDirs: string[]`, and `warnings: string[]` where `warnings` contains at most 100 elements and each element is at most 500 characters; AND when `--json` is set, THE Installation_Wizard SHALL emit no ANSI escape sequences on stdout or stderr AND SHALL display no interactive prompts.
6. WHEN running interactively (no `--json`), THE Installation_Wizard SHALL print to stdout one log line per created directory containing the absolute path of that directory, followed by a final summary block containing the named fields `Install Root`, `Schema Version`, `Created Dirs count`, `Existing Dirs count`, and `Warnings count`; AND ANSI escape sequences SHALL be present in this interactive output.
7. IF the running environment is below any threshold defined in REQ-28 AC-4 — fewer than 4 logical CPU cores, OR less than 4 GB total RAM, OR less than 40 GB free disk space on the filesystem hosting `~/.specforge/` — THEN THE Installation_Wizard SHALL append a warning naming the deficient resource to the JSON `warnings` array AND print the same warning to stderr, AND the install SHALL still exit with code 0 (per REQ-28 AC-6).
8. IF `~/.specforge/` cannot be created (for example permission denied), THEN THE Installation_Wizard SHALL roll back any files or directories already created during this `init` invocation before exiting with status code 1 and printing to stderr an error message naming the failing path, the OS error code, and a suggested remedy.
9. IF a second `specforge init` is invoked while a first invocation is still running and has acquired the lock file `~/.specforge/.init.lock`, THEN the second invocation SHALL exit with code 2 and print to stderr a message naming the lock file path.

### Requirement 4: `~/.specforge/` Directory Layout

**User Story:** As a SpecForge subsystem author, I want the on-disk layout under `~/.specforge/` to be a fixed contract created by `specforge init`, so that downstream modules (migration, observability, configuration) can reference these paths without repeating directory-creation logic.

#### Acceptance Criteria

1. THE Installation_Wizard SHALL create the following subdirectories under `~/.specforge/` on first install: `config/`, `migrations/`, `logs/`, `backups/`, `cas/`, and `state/`.
2. THE Installation_Wizard SHALL write a file `~/.specforge/config/config.yaml` containing default values for every configuration key defined in the `configuration` spec, with `schema_version: "1.0"` at the top of the file.
3. THE Installation_Wizard SHALL write a file `~/.specforge/.installation.json` whose JSON object contains: `schema_version` (string), `installedAt` (ISO 8601 in UTC with millisecond precision, e.g., `2026-05-19T12:34:56.789Z`), `cliVersion` (string equal to the `version` field of `@specforge/cli`'s `package.json` for the running build), `platform` (string, exactly one of the closed enum `win32` / `darwin` / `linux`), and `installSource` (string, exactly one of the closed enum `npm-global` / `npm-local` / `dev`).
4. THE Installation_Wizard SHALL create `~/.specforge/migrations/` as an empty directory containing only a `.gitkeep` and a `README.md` describing the `vA-to-vB.ts` script naming convention defined by the migration spec.
5. THE Installation_Wizard SHALL ensure that `~/.specforge/.installation.json` and `~/.specforge/config/config.yaml` both contain `schema_version: "1.0"` on first install, matching the `code_schema_version` baseline embedded in `@specforge/cli`.
6. WHERE the platform is `win32`, THE Installation_Wizard SHALL resolve `~` to `%USERPROFILE%`; WHERE the platform is `darwin` or `linux`, THE Installation_Wizard SHALL resolve `~` to the value of the `HOME` environment variable.
7. IF a directory listed in AC-1 already exists when `specforge init` runs, THEN THE Installation_Wizard SHALL leave that directory and its contents untouched and report it in the `existingDirs` field of the `--json` output.
8. WHEN the file `~/.specforge/.installation.json` or `~/.specforge/config/config.yaml` already exists at the time `specforge init` runs, THE Installation_Wizard SHALL leave that file untouched (unless `--force` is set per Requirement 3 AC-4) and SHALL report the file's path in the `existingDirs` field of the `--json` output (the field's semantics SHALL include both pre-existing directories and pre-existing files).
9. IF the platform is `linux` or `darwin` AND the `HOME` environment variable is unset or its value is the empty string, THEN THE Installation_Wizard SHALL exit with status code 1 and print to stderr an error message naming the missing environment variable.
10. IF directory or file creation fails partway through `specforge init` (for example because of permission denied, disk full, or a read-only filesystem `EROFS` error), THEN THE Installation_Wizard SHALL roll back any files or directories created during this `init` invocation before exiting with a non-zero status code.

### Requirement 5: Cross-Platform Smoke Tests

**User Story:** As a release engineer, I want a smoke-test suite that runs on Windows, macOS, and Linux, so that I have evidence the V6.0 install path actually works on every supported OS before tagging the release.

#### Acceptance Criteria

1. THE Distribution_Module SHALL provide a smoke-test script that performs the following sequence end-to-end and records pass/fail per step, with each individual step subject to a 120-second timeout: `npm install -g @specforge/cli` (using a locally packed tarball in CI), `specforge --version`, `specforge init` (run against an empty temporary HOME directory), `specforge --help`, and a non-destructive `specforge daemon status` call.
2. THE Distribution_Module SHALL ensure the smoke-test script is runnable in GitHub Actions on `windows-latest`, `macos-latest`, and `ubuntu-latest` matrix jobs, with each matrix job subject to a 15-minute wall-clock timeout.
3. WHEN the smoke-test script runs on a Supported Platform, THE smoke-test SHALL exit with status 0 if and only if every step in AC-1 succeeded with its declared success exit code; otherwise THE smoke-test SHALL exit with a non-zero status code.
4. THE Distribution_Module SHALL ensure that the smoke-test script makes no outbound network requests other than reading from the local filesystem during execution, so the suite remains hermetic and reproducible.
5. WHEN the smoke-test script completes — whether on success, failure, or timeout — THE smoke-test SHALL emit to the path provided by the `--report-path` CLI argument or the `SMOKE_REPORT_PATH` environment variable a structured JSON report containing: a start timestamp (ISO 8601 in UTC), and per step the step name, duration in milliseconds, exit code, and stdout/stderr digests bounded to at most 4096 characters per stream.
6. IF any step fails on any of the three Supported Platforms, THEN THE Distribution_Module SHALL fail the W4 Checkpoint and prevent merge to the V6.0 release branch.
7. WHEN the smoke-test script terminates for any reason (success, step failure, or timeout), THE smoke-test SHALL clean up its installation artifacts by uninstalling the global `@specforge/cli` package and removing the temporary HOME directory used during the run; AND cleanup SHALL touch only files within the temporary HOME directory and the global npm install location for `@specforge/cli`.
8. IF the cleanup step required by AC-7 itself fails (for example because of a file lock preventing removal), THEN THE smoke-test SHALL exit with status code 3 (distinct from the step-failure exit code 1) and emit cleanup error details into the structured JSON report described in AC-5.

### Requirement 6: Version & Schema Metadata

**User Story:** As a support engineer debugging a user's environment, I want every install to expose a single source of truth for "what version is this and what schema does it speak", so that I can match user reports against released artifacts deterministically.

#### Acceptance Criteria

1. WHEN the publish workflow runs, THE Distribution_Module SHALL ensure the `version` field in `@specforge/cli`'s `package.json` follows SemVer 2.0.0 in the exact format `MAJOR.MINOR.PATCH[-prerelease][+build]` and matches the git tag at publish time.
2. WHEN the publish workflow runs, THE Distribution_Module SHALL embed a constant `SCHEMA_VERSION_BASELINE` in the `@specforge/cli` build output whose value equals the `schema_version` field of `~/.specforge/.installation.json` written on a fresh install.
3. WHEN `specforge init` writes `~/.specforge/.installation.json`, THE Installation_Wizard SHALL set `schema_version` to `SCHEMA_VERSION_BASELINE` (the value embedded in the running CLI build), AND SHALL NOT use any value read from disk; AND IF the write to `~/.specforge/.installation.json` fails (for example because of an OS-level I/O error), THEN THE Installation_Wizard SHALL exit with a non-zero status code AND SHALL leave no partial `~/.specforge/.installation.json` file on disk.
4. WHEN the user runs `specforge --version --json`, THE CLI SHALL write to stdout a JSON object with the fields `cliVersion: string`, `schemaVersionBaseline: string`, `installRoot: string`, `installRootSchemaVersion: string | null`, AND `platform: string` formatted as `<os>-<arch>` (for example `win32-x64`, `darwin-arm64`, or `linux-x64`); AND THE CLI SHALL exit with code 0 within 2 seconds.
5. WHEN `specforge daemon start` runs immediately after `specforge init` on a fresh install AND `~/.specforge/.installation.json` is present, parseable, and contains a `schema_version` field, THE Health_Check SHALL perform a byte-for-byte string comparison between `~/.specforge/.installation.json#schema_version` and `SCHEMA_VERSION_BASELINE`; AND IF `~/.specforge/.installation.json` is missing OR contains unparseable JSON OR is missing the `schema_version` field OR the comparison detects a mismatch, THEN THE Health_Check SHALL exit with status code 1 and print a message containing both the observed `schema_version` value (or a marker indicating it was missing/unparseable) and the expected `SCHEMA_VERSION_BASELINE` value, instructing the user to run the migration subsystem (delegating actual migration to the migration spec).
6. WHEN the publish workflow attempts to publish a `@specforge/cli` version, THE Distribution_Module SHALL compare the new build's `SCHEMA_VERSION_BASELINE` to the highest previously published baseline using tuple comparison of `(MAJOR, MINOR)` parsed from `MAJOR.MINOR` notation; AND IF the new build's `(MAJOR, MINOR)` is lower than the highest previously published baseline's `(MAJOR, MINOR)`, THEN THE Distribution_Module SHALL reject the publish with a non-zero exit code and a message naming both the offending new baseline and the highest previously published baseline (Property 14 monotonicity at the package level).

### Requirement 7: Uninstall and Upgrade Path

**User Story:** As an existing user, I want uninstalling or upgrading SpecForge to leave my project specs and configuration intact, so that I never lose my work to a version transition.

#### Acceptance Criteria

1. WHEN the user runs `npm uninstall -g @specforge/cli`, THE Distribution_Module SHALL remove the `specforge` executable and the npm-managed package files only, exit with code 0 on success, AND SHALL NOT create, rename, change permissions of, or change the content of any file or directory anywhere within the `~/.specforge/` tree.
2. WHEN the user runs `npm install -g @specforge/cli@<newer-version>` over an existing install, THE Distribution_Module SHALL replace the executable atomically — the previous `specforge` executable SHALL remain invokable until the new one is fully written and verified — AND SHALL NOT create, rename, change permissions of, or change the content of any file or directory anywhere within the `~/.specforge/` tree.
3. WHEN the user runs `specforge init` after upgrading to a newer `@specforge/cli` whose `SCHEMA_VERSION_BASELINE` is higher than `~/.specforge/.installation.json#schema_version`, THE Installation_Wizard SHALL print a notice naming the installed CLI version, its `SCHEMA_VERSION_BASELINE`, the on-disk `schema_version` value, and the exact migration command the user should run; AND THE Installation_Wizard SHALL exit with status code 0 AND SHALL NOT create, rename, change permissions of, or change the content of any file or directory anywhere within the `~/.specforge/` tree (the actual schema migration is performed by the migration spec).
4. THE Distribution_Module SHALL document, in `@specforge/cli`'s README, a section titled exactly "Complete Removal Including User Data" containing an ordered numbered list of shell commands with one command per line, so that users who genuinely want to wipe `~/.specforge/` have a single reference.
5. IF a user attempts to install a `@specforge/cli` version whose `SCHEMA_VERSION_BASELINE` is strictly lower than `~/.specforge/.installation.json#schema_version`, THEN THE Daemon (on next `specforge daemon start`) SHALL refuse to start with a message containing the literal text "downgrade not supported", the currently installed `~/.specforge/.installation.json#schema_version`, and the attempted CLI build's `SCHEMA_VERSION_BASELINE`; AND THE Daemon SHALL exit with status code 4 (delegating the actual refusal logic to the rules already defined in REQ-18.4 of the parent spec).
6. IF on `specforge daemon start` the file `~/.specforge/.installation.json` is missing OR its content is unreadable due to insufficient permissions OR its content cannot be parsed as JSON, THEN THE Daemon SHALL print to stderr the single-line remedy `Run 'specforge init' to repair your installation` AND exit with status code 5 (a value distinct from the downgrade-rejection code 4 used in AC-5, so test cases can distinguish the two failure modes).

## Glossary

- **Distribution_Module**: 本 spec 所定义的分发与安装子系统的逻辑边界，物理上由 `@specforge/cli` 的 `init` 子命令、CI 中的发布与烟雾测试脚本、以及 `~/.specforge/` 目录约定共同构成。
- **Installation_Wizard**: `specforge init` 命令的实现，是 Distribution_Module 与终端用户之间的唯一交互入口。
- **`@specforge/cli`**: 用户主入口的 npm 包名，对应 monorepo 中的 `packages/cli/`。
- **`@specforge/<module>`**: SpecForge 内部 npm 包族（如 `@specforge/daemon-core`、`@specforge/configuration` 等），由 `@specforge/cli` 作为 dependency 引入。
- **Install Root**: 用户主目录下的 `~/.specforge/` 路径，所有用户级持久化数据的根目录。
- **`~/.specforge/.installation.json`**: 标记一次安装的元数据文件，记录 `schema_version`、`installedAt`、`cliVersion`、`platform`、`installSource`。
- **SCHEMA_VERSION_BASELINE**: 一个 `@specforge/cli` 构建产物中嵌入的常量字符串，等于该 CLI 版本"出厂时"认定的初始 `schema_version`，是 `~/.specforge/.installation.json#schema_version` 的真值来源。
- **Health_Check**: `specforge daemon start` 启动早期执行的版本与 schema 一致性检查，失败时把决策权交给 migration 子系统。
- **Smoke Test**: 在 Windows / macOS / Linux 三平台 GitHub Actions 矩阵上运行的"装得上、起得来、能 init"端到端验证脚本，是 W4 Checkpoint 的硬性退出条件。
- **`workspace:*` Protocol**: bun / npm 支持的 monorepo 内依赖协议，本 spec 要求开发期使用、发布期改写为精确版本号。
- **Supported Platforms**: 由父规范 REQ-28 AC-1 定义的 V6.0 受支持操作系统集合 = { Windows 10+, macOS 12+, 主流 Linux 发行版 }。

## Testing Strategy

### Property-Based Tests

本 spec 必须实现以下 PBT，文件路径放在 `packages/cli/tests/property/`（因为 `specforge init` 由 `@specforge/cli` 实现，分发逻辑物理上落在 cli 包内）：

1. **Property 14 子条件 PBT**：`distribution-property-14-baseline-equality.property.test.ts`，对随机生成的 `SCHEMA_VERSION_BASELINE` 和初始 `~/.specforge/.installation.json` 内容，验证 `installation.json#schema_version === SCHEMA_VERSION_BASELINE`。`Derived-From: v6-architecture-overview Property 14`，迭代 ≥ 100。
2. **Property 15 PBT**：`distribution-property-15-scope-default-off.property.test.ts`，对随机生成的 P1/P2 feature flag 名称集合，验证 `specforge init` 写入的默认 `config.yaml` 中所有 P1/P2 标志均为 `false` 或未列出。`Derived-From: v6-architecture-overview Property 15`，迭代 ≥ 100。
3. **Init 幂等性 PBT**：`distribution-init-idempotent.property.test.ts`，对随机的预存在 `~/.specforge/` 状态（部分子目录已存在 / `.installation.json` 已存在 / 用户已写入自定义文件），验证 `specforge init` 不修改任何用户文件、`existingDirs` 字段准确反映现状。这是 R3 AC-3、AC-4 与 R7 AC-2 的合成属性。

### Unit Tests

1. `package.json` 字段完整性校验（R1 AC-2、AC-3、AC-6）
2. `workspace:*` → 精确版本改写逻辑（R1 AC-4）
3. `specforge init` 命令各 flag 行为（R3 全部 AC）
4. `~/.specforge/` 目录创建与平台路径解析（R4 AC-6）
5. `specforge --version --json` 输出 schema 校验（R6 AC-4）
6. Health_Check 在 baseline mismatch / installation.json 缺失下的退出码（R6 AC-5、R7 AC-6）

### Integration Tests

1. **Pack-and-install 端到端**：`bun run build` → `npm pack` → 在临时目录 `npm install -g <tarball>` → 验证 `specforge` 命令可用（覆盖 R2 AC-2、R5 AC-1）
2. **三平台烟雾测试**（GitHub Actions matrix `[windows-latest, macos-latest, ubuntu-latest]`）：执行完整烟雾序列并产出结构化 JSON 报告（R5 全部 AC）
3. **Upgrade-in-place**：先装 vN，再装 vN+1，验证 `~/.specforge/` 完整保留（R7 AC-2、AC-3）
4. **Downgrade refusal**：装 vN+1 后回装 vN，验证 `specforge daemon start` 拒绝启动（R7 AC-5）
5. **Uninstall preserves user data**：`npm uninstall -g @specforge/cli` 后断言 `~/.specforge/` 内容未变（R7 AC-1）

## Notes

- 本 spec 实现 **distribution** 模块；spec 文档放 `.kiro/specs/distribution/`，源代码与测试落地在已有的 `packages/cli/`（init 命令）和 `scripts/`（发布与烟雾测试脚本）下，遵循 project-structure.md 规则 1 与规则 2。
- 包管理器统一使用 bun（开发、构建、测试、`bun pack`、`bun publish`），但发布目标仍是 npm registry，用户安装命令是 `npm install -g @specforge/cli`，与 project-structure.md 规则 5 一致。
- 远程访问能力（API key、IP 白名单、二步确认）已由 permission-engine 在 W4 前完成（Property 26 PBT 已通过 23/23），本 spec 不重复实现，仅要求 `specforge init` 默认不开启远程模式。
- OpenClaw 端到端集成已由 `integration-tests` Phase 4 验证，本 spec 的烟雾测试不重复 OpenClaw 链路。
- 实际的 `vA-to-vB.ts` 迁移脚本执行、备份、回滚由 `migration` spec 拥有，本 spec 仅创建 `~/.specforge/migrations/` 空目录骨架并写入 README 说明命名约定。
- W4 Checkpoint 中"全平台安装向导烟雾测试通过"的判定由 Requirement 5 的 GitHub Actions 矩阵作业产出的 JSON 报告作为权威证据。

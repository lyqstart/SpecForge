# Implementation Plan: version-unification

## Overview

把 SpecForge 中 7 个散落版本字段收敛到 `packages/version-unification/` 单一模块下，按 design.md 的模块拓扑落地。实施语言为 **TypeScript**（design 中已用 TS 接口签名 + `vitest.config.ts`，不需要二次确认）。运行时 / 包管理 / 测试一律用 **Bun**，符合 `project-structure.md` 规则 5。

实现遵循以下骨架顺序：常量与类型 → 原子写原语 → manifest writer/reader → 启动决策（纯函数）→ migration 链 → legacy migrator → degraded mode → bootstrap → CLI 子命令 → CI guard → 集成 / 性能。每个组件单独成任务，property test 紧贴它所验证的实现，便于错误早暴露。

所有持久化文件（`host-profile.json` 之外的本特性产物：user manifest / project manifest / migration-error.log / migrate-error.log）写入时**必须**遵守项目结构规则 5 —— `package.json` 包级元数据要含 `schema_version`，运行时持久化文件按 design 的字段集合不再额外塞 `schema_version`（manifest 自身的"版本"语义由 `code_version` / `data_schema_version` 表达，避免再叠一层）；migration / migrate error log 文件首行 JSON 含 `schema_version: "1.0"`。

## Tasks

- [ ] 1. 搭建 `packages/version-unification/` 包骨架
  - [x] 1.1 创建包目录、`package.json`、`tsconfig.json`、`vitest.config.ts`
    - 在仓库根 `package.json` 的 `workspaces` 下注册 `packages/version-unification`
    - 创建 `packages/version-unification/package.json`（含 `schema_version: "1.0"`、`type: "module"`、`workspace:*` 协议依赖 `fast-check`、`vitest`）
    - 创建 `tsconfig.json`、`vitest.config.ts`（含 `testTimeout: 10_000`、`pool: 'forks'`）
    - 创建空目录骨架：`src/{manifest,compat,migration/scripts,legacy,bootstrap,degraded-mode}`、`tests/{unit,property,integration}`
    - _Requirements: 全部需求的承载位置；遵守 project-structure 规则 1–6_

- [ ] 2. 定义核心常量与数据契约
  - [x] 2.1 实现 `src/constants.ts`
    - 导出 `MIN_SUPPORTED_DATA_SCHEMA: number`（初值 `0`）、`HIGHEST_KNOWN_SCHEMA: number`（初值 `0`）
    - 该文件是 **R6.1 规定的唯一声明位置**，文件顶部加 JSDoc 警告"任何其他文件不得 `MIN_SUPPORTED_DATA_SCHEMA = N` 形式赋值"
    - _Requirements: 6.1, 6.4_

  - [x] 2.2 实现 `src/manifest/types.ts`
    - 定义 `UserManifest` / `ProjectManifest` / `ManifestFileEntry` 接口（design §Components.types.ts）
    - 导出 `USER_MANIFEST_FIELDS` / `PROJECT_MANIFEST_FIELDS` / `LEGACY_FIELDS_USER` / `LEGACY_FIELDS_PROJECT` 常量数组
    - 定义 `InvalidManifestFieldError` / `InvalidJsonInManifestError` / `DataSchemaMonotonicError` / `IllegalWriterCallSiteError` 错误类
    - _Requirements: 1.1, 1.5, 2.1, 2.4, 14.3_

  - [x] 2.3 实现 `src/code-version.ts`
    - 由构建期注入 `CODE_VERSION` 常量（从仓库根 `package.json` `version` 字段）
    - 提供 `getCodeVersion(): string` 唯一运行时入口
    - _Requirements: 5.1_


- [ ] 3. 原子写原语与 schema 校验
  - [x] 3.1 实现 `src/manifest/atomic-write.ts`
    - 提供 `atomicWrite(path: string, content: string): Promise<void>`，使用 `tmp + copyFile + unlink` 模式（参考 `scripts/sync-task-status.ts`，绕开 Windows EPERM:rename）
    - 失败时清理 tmp 文件
    - _Requirements: 设计决策 D5；服务于 R4.5 / R12.4 / R13.1 的"失败回到 pre-state"基础_

  - [x] 3.2 实现 `src/manifest/schema-validator.ts`
    - 提供 `validateUserManifest(input: unknown)` / `validateProjectManifest(input: unknown)`
    - 字段集严格相等（多一个或少一个 → 抛 `InvalidManifestFieldError`，错误消息含 offending field 名）
    - `code_version` 匹配 `^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$`；整数字段 `Number.isInteger(v) ∧ v ≥ 0`；ISO 8601 时间戳 round-trip 校验
    - `files[*].sha256` 匹配 `^[0-9a-f]{64}$`、`size ≥ 0`
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.2, 2.3, 2.5_

  - [x] 3.3 Property test for schema validator
    - **Property 1: Manifest writer field-set integrity**
    - **Validates: Requirements 1.1, 1.5, 1.6, 2.1, 2.4, 2.5**
    - 文件：`tests/property/version-unification-property-1.property.test.ts`，`numRuns: 200`

  - [x] 3.4 Property test for non-negative-integer schema fields
    - **Property 3: Integer schema fields reject non-non-negative-integer values**
    - **Validates: Requirements 1.3, 2.2**
    - 文件：`tests/property/version-unification-property-3.property.test.ts`，`numRuns: 200`

- [ ] 4. Manifest writer / reader 实现
  - [x] 4.1 实现 `src/manifest/user-manifest-writer.ts`
    - 提供 `UserManifestWriter.write(path, manifest)`，先调 `validateUserManifest`，再 `atomicWrite`
    - 提供 `writeDualWrite(path, manifest, legacy)`（cycle 1 用，R11.2）
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.2_

  - [x] 4.2 实现 `src/manifest/project-manifest-writer.ts`
    - 提供 `writeFresh(path, dsv)`：用于 R15 初始化场景，绝不修改已有 manifest 的 dsv
    - 提供 `writeAfterMigration(path, prev, target, callerToken)`：断言 `target > prev`（违反 → `DataSchemaMonotonicError`），断言 callerToken 来自 MigrationContext（违反 → `IllegalWriterCallSiteError`）；同一原子写中更新 `data_schema_version` + `updated_at`
    - 提供 `writeDualWrite(path, manifest, legacy)`（cycle 1 用）
    - _Requirements: 2.1, 2.4, 7.1, 7.2, 7.3, 7.5, 11.2, 15.1, 15.2_

  - [x] 4.3 实现 `src/manifest/manifest-reader.ts`
    - 提供 `readUser(path)` / `readProject(path)`：读取 + JSON.parse；解析失败抛 `InvalidJsonInManifestError`（含 path + parseError）
    - 文件不存在抛 `ManifestNotFoundError` 由 bootstrap 层处理
    - _Requirements: 14.3_

  - [x] 4.4 Property test for `writeAfterMigration` contract
    - **Property 10: ProjectManifestWriter.writeAfterMigration contract**
    - **Validates: Requirements 7.3, 7.5**
    - 文件：`tests/property/version-unification-property-10.property.test.ts`，`numRuns: 200`


  - [x] 4.5 Property test for `writeAfterMigration` call-source contract
    - **Property 11: data_schema_version writer call-source contract**
    - **Validates: Requirements 7.2**
    - 文件：`tests/property/version-unification-property-11.property.test.ts`，`numRuns: 200`

  - [x] 4.6 Property test for timestamp round-trip
    - **Property 2: Timestamp round-trip**
    - **Validates: Requirements 1.4, 2.3**
    - 文件：`tests/property/version-unification-property-2.property.test.ts`，`numRuns: 200`

- [ ] 5. 启动期兼容性决策（纯函数）
  - [x] 5.1 实现 `src/compat/schema-compare.ts`
    - 提供 `compare({dsv, min, highest}): 'NORMAL'|'MIGRATE'|'HIGHER_THAN_KNOWN'` 纯函数
    - 不引入任何 semver 库（R3.5）
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 5.2 实现 `src/compat/startup-checker.ts`
    - 实现 `StartupCompatibilityChecker.check({dataSchemaVersion, minSupportedDataSchema, highestKnownSchema}): StartupMode`
    - 引用错误判别 union `{kind:'NORMAL_RW'} | {kind:'MIGRATE',...} | {kind:'DEGRADED_HIGHER_THAN_KNOWN',...} | {kind:'DEGRADED_MIGRATION_FAILED',...}`
    - 纯函数，幂等，无 I/O
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.3 Property test for startup compatibility decision table
    - **Property 4: Startup compatibility checker decision table**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
    - 文件：`tests/property/version-unification-property-4.property.test.ts`，`numRuns: 500`

  - [x] 5.4 Unit test for startup read order
    - 用 `fs.readFile` spy 断言：先读 Project_Manifest 的 `data_schema_version` 和 User_Manifest 的 `min_supported_data_schema`，再做任何 project data 读
    - **Validates: Requirements 3.1**
    - 文件：`tests/unit/startup-checker-read-order.test.ts`

- [x] 6. 检查点 1
  - 跑 `bun test packages/version-unification/tests` 确认前 5 节稳定
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Migration 链：注册表与单步契约
  - [x] 7.1 实现 `src/migration/registry.ts`
    - 定义 `Migration` 接口（`targetVersion`、`forward(ctx)`、`isIdempotentAtTarget(ctx)`）
    - 实现 `MigrationRegistry`：扫描 `src/migration/scripts/*.ts`，按 `targetVersion` 升序，重号或缺号 → 抛 `MalformedRegistryError`（构造时即抛，不留隐患）
    - 提供 `scriptsBetween(from, to): readonly Migration[]`
    - _Requirements: 4.1, 4.2_

  - [x] 7.2 实现 `src/migration/error-logger.ts`
    - 提供 `MigrationErrorLogger.append({pair, err, stack, rollback})`：JSONL 格式，首次写时 schema_version=1.0 头部记录在文件名约定中
    - 写入 `<project>/.specforge/migration-error.log`
    - _Requirements: 13.2_


  - [x] 7.3 实现 `src/migration/runner.ts`
    - `MigrationRunner.run({projectDir, from, to})` 顺序执行 `scriptsBetween(from, to)`
    - 单步原子（design D6）：备份 manifest + 受影响数据文件 → forward → 成功后 `writeAfterMigration` 推进 dsv → 删 .pre-migration-N.bak；forward 失败 → 用备份回滚 → append migration-error.log → 中止链
    - 回滚失败 → 保留备份不动 manifest，append 含 rollback 失败的 log，抛 `MigrationFailedNoRollback`
    - 返回 `MigrationRunResult` discriminated union（`OK` / `FAILED_ROLLED_BACK` / `FAILED_NO_ROLLBACK`）
    - 每步成功后顺手把 `updated_at` 写到当前 ISO 8601
    - _Requirements: 4.2, 4.3, 4.5, 13.1, 13.2_

  - [x] 7.4 实现 `MigrationContext` helper（`src/migration/context.ts`）
    - 提供 `readJson` / `writeJson`（内部走 atomicWrite）/ `listDataFiles` / `checkAtTarget`
    - 暴露 callerToken（`Symbol`）传给 writer 用于校验调用来源（R7.2）
    - _Requirements: 4.4, 7.2_

  - [x] 7.5 Property test for chain ordering
    - **Property 7: Migration chain ordering**
    - **Validates: Requirements 4.2**
    - 文件：`tests/property/version-unification-property-7.property.test.ts`，`numRuns: 200`

  - [x] 7.6 Property test for registry completeness
    - **Property 8: Migration registry completeness**
    - **Validates: Requirements 4.1**
    - 文件：`tests/property/version-unification-property-8.property.test.ts`，`numRuns: 200`

  - [x] 7.7 Property test for single-step write of target dsv
    - **Property 5: Migration step writes target dsv after success**
    - **Validates: Requirements 4.3**
    - 文件：`tests/property/version-unification-property-5.property.test.ts`，`numRuns: 200`

  - [x] 7.8 Property test for idempotence at target
    - **Property 6: Migration script idempotent at target**
    - **Validates: Requirements 4.4**
    - 文件：`tests/property/version-unification-property-6.property.test.ts`，`numRuns: 200`

  - [x] 7.9 Property test for atomic chain failure preserves pre-state
    - **Property 9: Atomic chain failure preserves pre-state**
    - **Validates: Requirements 4.5, 13.1, 13.2**
    - 文件：`tests/property/version-unification-property-9.property.test.ts`，`numRuns: 1000`（数据完整性关键）
    - 测试用内存 FS（design Testing Strategy）+ fault injection arbitrary

  - [x] 7.10 Unit test for migration test coverage
    - 扫 `src/migration/scripts/<N>.ts`，断言每个 script 都有同名 `<N>.test.ts` 和 `<N>.idempotence.test.ts`
    - **Validates: Requirements 4.6**
    - 文件：`tests/unit/migration-test-coverage.test.ts`


- [ ] 8. Degraded mode 与 reporter
  - [x] 8.1 实现 `src/degraded-mode/read-only-mode.ts`
    - 模块级状态 + `enterReadOnly(cause)` + `requireWritable()` 守卫（违反 → 抛 `ReadOnlyDegradedError`）
    - `cause` discriminator：`MIGRATION_FAILED` / `HIGHER_THAN_KNOWN` / `OTHER`
    - _Requirements: 13.3_

  - [x] 8.2 实现 `src/degraded-mode/degraded-reporter.ts`
    - `DegradedReporter.print(cause, details)` 按 cause 选模板（design §"Doctor / --version 输出格式"）
    - print 自身失败 → 静默 swallow，不重试，不抛新错（R13.4）
    - **MIGRATION_FAILED**：含 failed pair、log path、recommended next step
    - **HIGHER_THAN_KNOWN**：含 observed dsv、highest schema、upgrade 建议
    - **OTHER**：不含 migration-specific 短语
    - _Requirements: 3.4, 13.4, 13.5_

  - [x] 8.3 Property test for read-only degraded write rejection
    - **Property 12: Read-only degraded mode rejects every write**
    - **Validates: Requirements 13.3**
    - 文件：`tests/property/version-unification-property-12.property.test.ts`，`numRuns: 200`

  - [x] 8.4 Property test for degraded-mode output cause-keyed
    - **Property 13: Degraded-mode output keyed by cause**
    - **Validates: Requirements 13.4, 13.5**
    - 文件：`tests/property/version-unification-property-13.property.test.ts`，`numRuns: 200`

- [ ] 9. Legacy migrator（3 cycle 渐进 + in-place 转换）
  - [x] 9.1 实现 `src/legacy/detector.ts`
    - `isLegacy(rawJson)`：keys 与 `LEGACY_FIELDS_USER ∪ LEGACY_FIELDS_PROJECT` 求交集，命中即 true（与字段值无关）
    - _Requirements: 11.1_

  - [x] 9.2 实现 `src/legacy/release-cycle-policy.ts`
    - `current(): 'DUAL_WRITE'|'READ_OLD_WRITE_NEW'|'IN_PLACE_CONVERT'`
    - 由 `getCodeVersion()` 反推 cycle 序号
    - _Requirements: 11.2, 11.3, 11.4_

  - [x] 9.3 实现 `src/legacy/backup.ts`
    - `createLegacyBackup(manifestPath)`：拷贝原文件到 `<manifestPath>.legacy.bak`，**严格在改写之前**完成
    - 内容字节对等，不附加任何元数据
    - _Requirements: 11.5, 12.3_

  - [x] 9.4 实现 `src/legacy/migrator.ts`
    - `ManifestMigrator.migrateOnRead(rawJson, path)`：识别 legacy → 按 cycle 处理
    - `decorateOnWrite(manifest)`：cycle 1 双写、cycle 2/3 仅新字段
    - cycle 2 读到 legacy 时 emit 单次 process-level deprecation 警告（用模块级 set 跟踪已警告 path）
    - cycle 3 启动时调 `inPlaceConvert(path)`：先 `createLegacyBackup` → `atomicWrite` 新格式
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 9.5 Property test for legacy detection
    - **Property 21: Manifest_Migrator legacy detection**
    - **Validates: Requirements 11.1**
    - 文件：`tests/property/version-unification-property-21.property.test.ts`，`numRuns: 200`


  - [x] 9.6 Property test for release-cycle behavior
    - **Property 22: Release-cycle behavior**
    - **Validates: Requirements 11.2, 11.3, 11.4**
    - 文件：`tests/property/version-unification-property-22.property.test.ts`，`numRuns: 200`

  - [x] 9.7 Property test for in-place conversion backup
    - **Property 23: In-place conversion creates faithful backup**
    - **Validates: Requirements 11.5, 12.3**
    - 文件：`tests/property/version-unification-property-23.property.test.ts`，`numRuns: 1000`

- [ ] 10. Bootstrap：manifest 缺失兜底
  - [x] 10.1 实现 `src/bootstrap/user-missing.ts`
    - `handleUserManifestMissing({expectedPath, installerCommand, print})`
    - 打印含 expectedPath + installerCommand 的指引信息，exit 0；不修改任何 project 文件
    - _Requirements: 14.1, 14.2_

  - [x] 10.2 实现 `src/bootstrap/project-missing.ts`
    - `handleProjectManifestMissing({projectDir, highestKnown, writer, log})`
    - 用户已成功安装 → 调 `writer.writeFresh(path, HIGHEST_KNOWN_SCHEMA)`，emit 单次 info 消息（含绝对路径 + 选定 dsv）
    - 目录不可写 → 抛 `ManifestUnwritableDirError`，入口打印 dir + errno，exit ≠ 0
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 10.3 Property test for user-missing bootstrap
    - **Property 26: User-manifest-missing bootstrap behavior**
    - **Validates: Requirements 14.1, 14.2**
    - 文件：`tests/property/version-unification-property-26.property.test.ts`，`numRuns: 200`

  - [x] 10.4 Property test for invalid-JSON error path
    - **Property 27: User-manifest invalid-JSON error path**
    - **Validates: Requirements 14.3**
    - 文件：`tests/property/version-unification-property-27.property.test.ts`，`numRuns: 200`

  - [x] 10.5 Property test for project-missing bootstrap
    - **Property 28: Project-manifest-missing bootstrap creates new PM**
    - **Validates: Requirements 15.1, 15.2, 15.3**
    - 文件：`tests/property/version-unification-property-28.property.test.ts`，`numRuns: 200`

  - [x] 10.6 Property test for unwritable project dir
    - **Property 29: Unwritable project dir error path**
    - **Validates: Requirements 15.4**
    - 文件：`tests/property/version-unification-property-29.property.test.ts`,`numRuns: 200`


- [x] 11. 检查点 2
  - 跑 `bun test packages/version-unification/tests` 确认核心运行时（compat/migration/legacy/bootstrap）稳定
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. CLI 输出与 Doctor / `--version`
  - [x] 12.1 实现 `src/index.ts`
    - 仅 export 协议层（types / 错误类 / `getCodeVersion` / `StartupCompatibilityChecker.check` / `requireWritable` / `enterReadOnly`）
    - 不 export writer 内部 token，避免外部伪造 callerToken（保护 R7.2）
    - _Requirements: 7.2_

  - [x] 12.2 在 `packages/cli/src/` 实现 `--version` 子命令
    - 成功：stdout 输出 `${getCodeVersion()}\n`，stderr 空，exit 0
    - 失败：stderr 输出诊断信息，stdout 空，exit ≠ 0
    - _Requirements: 10.2_

  - [x] 12.3 在 `packages/cli/src/` 实现 `doctor` 子命令
    - 输出格式按 design §"Doctor 输出格式"：含 `code_version` / `min_supported_data_schema` / `data_schema_version` / user manifest 绝对路径 / project manifest 绝对路径 / mode
    - _Requirements: 10.3_

  - [x] 12.4 实现 `src/migration/progress-reporter.ts`
    - migration 链成功后输出单行：`[migration] data_schema_version <from> → <to> in <ms> ms`
    - _Requirements: 10.4_

  - [x] 12.5 业务输出过滤
    - 在 NORMAL_RW 模式下，业务命令的 stdout/stderr 不得包含 `code_version` / `data_schema_version` / `min_supported_data_schema` 三字段的字面值
    - 通过 cli 入口附加 reporter 过滤层实现
    - _Requirements: 10.1_

  - [x] 12.6 Property test for version surface visibility
    - **Property 19: Version surface visibility**
    - **Validates: Requirements 10.1, 10.2**
    - 文件：`tests/property/version-unification-property-19.property.test.ts`，`numRuns: 200`

  - [x] 12.7 Property test for diagnostic output formatter
    - **Property 20: Diagnostic output formatter**
    - **Validates: Requirements 10.3, 10.4, 10.5**
    - 文件：`tests/property/version-unification-property-20.property.test.ts`，`numRuns: 200`

- [ ] 13. `migrate-manifest` 子命令
  - [x] 13.1 在 `scripts/sf-installer.ts` 注册 `migrate-manifest` 子命令
    - 入口委托给 `src/legacy/migrate-manifest-command.ts`
    - _Requirements: 12.1_

  - [x] 13.2 实现 `src/legacy/migrate-manifest-command.ts`
    - 已是新格式 → byte-identical no-op，exit 0（R12.2）
    - legacy → 备份 `.legacy.bak` → 写新格式（含 `format: "CURRENT"` 元字段）→ exit 0（R12.3）
    - 任何阶段失败 → 不动 active manifest，append `<manifest-dir>/migrate-error.log`（JSONL，含 `schema_version: "1.0"` 头条目），exit ≠ 0（R12.4）
    - 反复执行幂等
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_


  - [x] 13.3 Property test for migrate-manifest idempotence
    - **Property 24: migrate-manifest command idempotence**
    - **Validates: Requirements 12.2, 12.5**
    - 文件：`tests/property/version-unification-property-24.property.test.ts`，`numRuns: 1000`

  - [x] 13.4 Property test for migrate-manifest atomic on failure
    - **Property 25: migrate-manifest atomic on failure**
    - **Validates: Requirements 12.4**
    - 文件：`tests/property/version-unification-property-25.property.test.ts`，`numRuns: 1000`

  - [x] 13.5 Unit test for sf-installer subcommand registration
    - 断言 `bun scripts/sf-installer.ts migrate-manifest --help` 正常返回（R12.1 字面契约）
    - **Validates: Requirements 12.1**
    - 文件：`tests/unit/sf-installer-subcommand.test.ts`

- [ ] 14. CI Version Guard：通用扫描器
  - [x] 14.1 实现 `scripts/ci/version-guard/diff-scanner.ts`
    - `git diff <base>...HEAD --name-only -z` + `git diff --unified=0` hunk 解析
    - 用 `Bun.file` 读取，跳过 >1 MB 文件（按 design D7）
    - _Requirements: 9.4_

  - [x] 14.2 实现 `scripts/ci/version-guard.ts` 主入口
    - `runVersionGuard({diffBase, repoRoot, hardTimeoutMs?})`：调度四条规则
    - 总耗时硬上限 30 s（R9.4），超时即 `process.exit(1)`
    - 输出聚合 `ViolationReport`：stdout JSON（schema_version=1.0）+ stderr 人类可读
    - 任何基础设施错误 → exit ≠ 0
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 14.3 实现 `scripts/ci/version-guard/code-version-rule.ts`
    - 扫 PR diff 中**非根 `package.json`** 的文件，正则 `code_version\s*[:=]\s*["'][0-9]+\.[0-9]+\.[0-9]+`
    - 命中 → 加 `CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON` violation（含 file + line + matchedText）
    - _Requirements: 5.2_

  - [x] 14.4 实现 `scripts/ci/version-guard/min-schema-rule.ts`
    - 比较 `MIN_SUPPORTED_DATA_SCHEMA` 在 PR 前后的值
    - `new < old` → `MIN_SCHEMA_DECREASED`（无视有无 dep doc）
    - `new > old ∧ ¬hasDepDoc` → `MIN_SCHEMA_NO_DEPRECATION_DOC`（含期望路径 `docs/deprecations/<schema-N>.md`）
    - _Requirements: 6.2, 6.3, 6.4, 8.3_

  - [x] 14.5 实现 `scripts/ci/version-guard/data-schema-write-rule.ts`
    - 扫 PR diff 中**非 `packages/version-unification/src/manifest/project-manifest-writer.ts`** 的文件，匹配 `data_schema_version\s*[:=]`（仅赋值/对象字面量赋值）
    - 命中 → `DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE`
    - _Requirements: 7.4_

  - [x] 14.6 实现 `scripts/ci/version-guard/schema-introduction-rule.ts`
    - 检测 PR 是否新增 schema 版本 N（`HIGHEST_KNOWN_SCHEMA` 上调 / 新增 `src/migration/scripts/<N>.ts`）
    - 收集**所有**缺失 artifact 后再返回（**禁止首条命中即退**），单次报告含 missing list（migration script / read-write 代码 / N-1 + N 测试 / `docs/schema-versions/<N>.md`）
    - _Requirements: 8.1, 8.2_


  - [x] 14.7 创建 `.github/workflows/version-guard.yml`
    - 触发：`on: pull_request`
    - step：`bun run scripts/ci/version-guard.ts --diffBase=origin/${{ github.base_ref }}`
    - `timeout-minutes: 5`（OS 级最后防线，R9.4 已是 30 s 内层）
    - 设为 required check
    - _Requirements: 9.1_

  - [x] 14.8 创建 release 预检脚本
    - 在 `scripts/ci/release-precheck.ts`：扫描所有非根 package.json 文件中是否注入了与 root version 不一致的 version 字符串，命中 → 拒绝发布
    - _Requirements: 5.3_

  - [x] 14.9 Property test for code_version literal CI rule
    - **Property 14: CI guard rejects code_version literal outside package.json**
    - **Validates: Requirements 5.2**
    - 文件：`tests/property/version-unification-property-14.property.test.ts`，`numRuns: 500`

  - [x] 14.10 Property test for MIN_SUPPORTED_DATA_SCHEMA monotonic + dep doc
    - **Property 15: CI guard for MIN_SUPPORTED_DATA_SCHEMA monotonic + deprecation doc**
    - **Validates: Requirements 6.2, 6.3, 6.4, 8.3**
    - 文件：`tests/property/version-unification-property-15.property.test.ts`，`numRuns: 500`

  - [x] 14.11 Property test for data_schema_version write location rule
    - **Property 16: CI guard for data_schema_version write location**
    - **Validates: Requirements 7.4**
    - 文件：`tests/property/version-unification-property-16.property.test.ts`，`numRuns: 500`

  - [x] 14.12 Property test for schema-introduction aggregated report
    - **Property 17: CI guard schema-introduction aggregated report**
    - **Validates: Requirements 8.1, 8.2**
    - 文件：`tests/property/version-unification-property-17.property.test.ts`，`numRuns: 500`

  - [x] 14.13 Property test for CI guard exit code semantics
    - **Property 18: CI guard exit code blocks merge**
    - **Validates: Requirements 9.3**
    - 文件：`tests/property/version-unification-property-18.property.test.ts`，`numRuns: 200`

  - [x] 14.14 Unit test for `MIN_SUPPORTED_DATA_SCHEMA` single source
    - grep 整个仓库，`MIN_SUPPORTED_DATA_SCHEMA = ` / `MIN_SUPPORTED_DATA_SCHEMA:` 仅在 `packages/version-unification/src/constants.ts` 出现
    - **Validates: Requirements 6.1**
    - 文件：`tests/unit/min-schema-single-source.test.ts`

  - [x] 14.15 Unit test for `data_schema_version` writer single source
    - grep 整个 `packages/` 与 `scripts/`，断言 `data_schema_version\s*[=:]` 写入位置仅 `project-manifest-writer.ts`
    - **Validates: Requirements 7.1**
    - 文件：`tests/unit/data-schema-write-single-source.test.ts`

  - [x] 14.16 Unit test for CI workflow trigger
    - 断言 `.github/workflows/version-guard.yml` 含 `pull_request` 触发器和 30 s 超时
    - **Validates: Requirements 9.1, 9.4**
    - 文件：`tests/unit/ci-workflow-trigger.test.ts`

  - [x] 14.17 Unit test for release pre-check rejecting drift
    - 注入冲突 version 字符串 → 退出非零
    - **Validates: Requirements 5.3**
    - 文件：`tests/unit/release-precheck.test.ts`


- [ ] 15. 集成 / 端到端
  - [x] 15.1 把启动决策接入 plugin / cli 入口
    - `.opencode/plugins/sf_specforge.ts` 与 `packages/cli/src/` 的实际启动路径调 `ManifestBootstrap → ManifestMigrator → StartupCompatibilityChecker → MigrationRunner（按需）`
    - 任何写操作入口前置 `requireWritable()` 守卫
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.1–11.5, 13.3, 14.1–14.3, 15.1–15.4_

  - [x] 15.2 集成测试：1000 文件 CI guard 性能
    - fixture 准备 1000 文件 + 模拟 PR diff，断言 `runVersionGuard` 在 30 s 内完成
    - **Validates: Requirements 9.4**
    - 文件：`tests/integration/version-guard-1000-files.test.ts`

  - [x] 15.3 集成测试：多步 migration chain end-to-end
    - 真实临时目录 + 多个 fixture migration script，断言文件树和 manifest 推进
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5_
    - 文件：`tests/integration/migration-end-to-end.test.ts`

  - [x] 15.4 集成测试：Cycle-3 启动 in-place 转换
    - 准备 legacy manifest → 启动 → 断言 `.legacy.bak` 存在 + 新格式 active
    - **Validates: Requirements 11.4, 11.5**
    - 文件：`tests/integration/legacy-cycle-3-bootstrap.test.ts`

- [x] 16. 最终检查点
  - 跑 `bun run test`（CI 全量回归）确认所有 PBT + unit + integration 通过
  - 跑 `bun run scripts/ci/version-guard.ts --diffBase=HEAD~1` 自检
  - 检查 `bun run scripts/sync-task-status.ts list version-unification` 状态收口
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标 `*` 的子任务为可选测试任务，可在 MVP 跳过；核心实现任务（无 `*`）必须实现
- 每条 Property 任务在标题中显式标注 Property 编号 + 验证的 Requirements 子条款，便于反向追溯
- 所有写文件路径和模块拓扑严格遵循 `packages/version-unification/`（project-structure 规则 1–2）
- `package.json` 含 `schema_version` 字段（项目结构规则 5）；migration / migrate error log JSONL 首条目记录 `schema_version: "1.0"`
- Bun 是唯一包管理 / 测试运行器；vitest.config.ts 强制 `pool: 'forks'` 与 `testTimeout: 10_000`，防止异步资源泄漏拖垮 CI
- Property 9 / 23 / 24 / 25 涉及数据完整性，迭代次数 1000；其余按 design Testing Strategy 矩阵
- 紧贴每个组件的 property test 任务在依赖图中放在该组件实现之后的下一个 wave，保证错误早暴露


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.1", "4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["4.4", "4.5", "4.6", "5.2", "8.1", "9.1", "9.2", "9.3"] },
    { "id": 5, "tasks": ["5.3", "5.4", "7.1", "7.2", "7.4", "8.2", "8.3", "9.4"] },
    { "id": 6, "tasks": ["7.3", "8.4", "9.5", "9.6", "9.7", "10.1", "10.2"] },
    { "id": 7, "tasks": ["7.5", "7.6", "7.7", "7.8", "7.10", "10.3", "10.4", "10.5", "10.6", "12.1", "12.4"] },
    { "id": 8, "tasks": ["7.9", "12.2", "12.3", "12.5", "13.1", "14.1"] },
    { "id": 9, "tasks": ["12.6", "12.7", "13.2", "14.2", "14.3", "14.4", "14.5", "14.6"] },
    { "id": 10, "tasks": ["13.3", "13.4", "13.5", "14.7", "14.8", "15.1"] },
    { "id": 11, "tasks": ["14.9", "14.10", "14.11", "14.12", "14.13", "14.14", "14.15", "14.16", "14.17", "15.2", "15.3", "15.4"] }
  ]
}
```

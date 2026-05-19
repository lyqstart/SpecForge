# Implementation Plan: V6.0 Distribution（W4）

## Overview

按 design.md 的 "Components and Interfaces / Data Models / Testing Strategy" 三大节，把 distribution 模块拆成 9 个 Phase 共 13 个顶层任务。所有源码落在 `packages/cli/src/distribution/`、`packages/cli/src/commands/init/`、`packages/cli/src/utils/`、`scripts/`、`.github/workflows/`，spec 目录只放文档。包管理器统一用 bun，所有 JSON/YAML 持久化文件带 `schema_version: "1.0"`，所有持有异步资源的类（LockManager、SmokeTestRunner）实现 Disposable + 自检 API + CARU 四阶段，测试 `afterEach` 必须断言 `getActive*Count() === 0`。

实现语言：TypeScript（design.md 已用 TS interface 定义所有契约）。

> Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Tasks

- [x] 1. Phase 1：项目骨架与共享类型
  - [x] 1.1 创建 `packages/cli/src/distribution/` 目录骨架与 `index.ts` 桶式导出，新增 `packages/cli/src/distribution/types.ts` 集中导出 design.md "Data Models" 定义的接口（`ParsedPackageJson`、`ValidationContext`、`ValidationResult`、`ValidationError`、`InstallationRecord`、`InitOptions`、`InitResult`、`InitJsonPayload`、`VersionInfoPayload`、`SmokeStep`、`SmokeStepResult`、`SmokeRunOptions`、`SmokeReport`、`ErrorPayload`、`ErrorCode`）；所有持久化数据类型必须带 `schema_version: "1.0"` 字段
    - 文件：`packages/cli/src/distribution/index.ts`、`packages/cli/src/distribution/types.ts`
    - _Requirements: 4.2, 6.4, 5.5_
  - [x] 1.2 强化 `packages/cli/vitest.config.ts`：补齐 `testTimeout: 10000`、`hookTimeout: 5000`、`teardownTimeout: 3000`、`pool: 'forks'`，并在文件顶部加注释指引"卡死时临时启用 `--reporter=hanging-process`"；若已有等价配置则验证一致
    - 文件：`packages/cli/vitest.config.ts`
    - _Requirements: 5.7（测试基础设施约束，承接 async-resource-coding-standards T3）_
  - [x] 1.3 在 `packages/cli/src/distribution/scope-gate-bridge.ts` 中创建 `ScopeGateExports` 适配器：从 `packages/scope-gate` 包导出 `p1p2FlagKeys: ReadonlyArray<string>`；如果 scope-gate 尚未暴露该常量，则在本文件提供 `getP1P2FlagKeys()` 工厂方法读取 `packages/scope-gate/src/...` 中已有的 P1/P2 flag 表（不要重复定义清单，单一真值来源在 scope-gate）
    - 文件：`packages/cli/src/distribution/scope-gate-bridge.ts`
    - _Requirements: 4.2（默认配置中所有 P1/P2 flag 初始为 false 的真值来源）_
  - [x] 1.4 创建 `scripts/publish-pipeline.ts` 与 `scripts/smoke-runner.ts` 的可执行入口骨架（仅解析 CLI 参数、打印 "TODO: implement" 后退出 0），保证 `bun run scripts/publish-pipeline.ts --help` 与 `bun run scripts/smoke-runner.ts --help` 可运行；用 shebang `#!/usr/bin/env bun`
    - 文件：`scripts/publish-pipeline.ts`、`scripts/smoke-runner.ts`
    - _Requirements: 1.5, 5.1（脚本入口存在性）_

- [x] 2. Phase 2：发布流水线（PackageValidator / DependencyRewriter / SchemaVersionManager）
  - [x] 2.1 实现 `PackageValidator`：纯函数 `validate(pkg, ctx)`，必需字段常量集合 `["name", "version", "description", "main", "types", "files", "license", "repository", "schema_version"]`，包名正则 `^@specforge\/[a-z][a-z0-9-]*$`，engines 严格等于 `{ node: ">=20", bun: ">=1.0" }`，publish 模式下 dependencies 中 `@specforge/*` 必须精确 `MAJOR.MINOR.PATCH`（禁止 `^`/`~`/`*`/`x`/range/dist-tag/git/file），返回 `ValidationResult` 含稳定 `code` 错误码
    - 文件：`packages/cli/src/distribution/package-validator.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.3, 6.1_
  - [x]* 2.2 编写 `package-validator` 单元测试：覆盖每个 `ValidationError.code` 至少一个 positive + negative 用例（`NAME_FORMAT`、`MISSING_FIELD` × 9 个必需字段、`ENGINES_NODE`、`ENGINES_BUN`、`WORKSPACE_NOT_REWRITTEN`、`DEP_RANGE_FORBIDDEN`、`DEP_VERSION_NOT_PINNED`），以及 `private: true` 跳过场景
    - 文件：`packages/cli/tests/unit/package-validator.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 2.3, 6.1_
  - [x] 2.3 实现 `DependencyRewriter`：纯函数 `rewrite(pkg, versionMap)`，遍历 `dependencies`/`devDependencies`，把 `workspace:*` 重写为精确版本，未在 `versionMap` 中找到的 `workspace:*` 抛错（错误信息含包名 + 依赖键），不 mutate 输入
    - 文件：`packages/cli/src/distribution/dependency-rewriter.ts`
    - _Requirements: 1.4_
  - [x]* 2.4 编写 `dependency-rewriter` 单元测试：覆盖 `workspace:*` → 精确版本、未注册依赖抛 `WORKSPACE_NOT_REWRITTEN`、devDependencies 同样改写、输入对象不被 mutate（深拷贝断言）
    - 文件：`packages/cli/tests/unit/dependency-rewriter.test.ts`
    - _Requirements: 1.4, 1.7_
  - [x] 2.5 实现 `SchemaVersionManager`：构造函数接收 build-time 注入的 `baseline` 字符串（`bun build --define SCHEMA_VERSION_BASELINE=...`，默认值 `"1.0"`），实现 `parseTuple` / `assertMonotonic(candidateBaseline, highestPublished)` / `compareForHealthCheck(diskValue, baseline)` 三态返回 `"equal" | "code_higher" | "code_lower"`，运行期不读盘
    - 文件：`packages/cli/src/distribution/schema-version-manager.ts`
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 7.5_
  - [x]* 2.6 编写 `schema-version-manager` 单元测试：`parseTuple` 对 `"1.0"`/`"1.10"`/`"2.0"` 返回正确元组、对 `"1"`/`"a.b"`/`""` 抛错；`assertMonotonic` 在 `null`/相等/上升/下降四种情况下的返回；`compareForHealthCheck` 三态完整 + `code_higher` 当且仅当 tuple 比较严格大于的反对称性
    - 文件：`packages/cli/tests/unit/schema-version-manager.test.ts`
    - _Requirements: 6.5, 6.6_
  - [x] 2.7 在 `scripts/publish-pipeline.ts` 中串联主流程：枚举 `packages/*` → `PackageValidator.validate(mode: "dev")` → `DependencyRewriter.rewrite` → `bun run build` → 验证 `dist/` 中 `main`/`types` 文件存在 → `PackageValidator.validate(mode: "publish")` → `SchemaVersionManager.assertMonotonic` → `bun publish`；任一步失败用 `ErrorCode` 中 `PUBLISH_*` 系列错误码退出非 0 并打印含包名的诊断；跳过 `private: true` 且不被 cli 依赖的包
    - 文件：`scripts/publish-pipeline.ts`
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 6.6_

- [x] 3. Checkpoint - 发布流水线已完成
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3：CLI 入口与 init/version/help 子命令骨架
  - [x] 4.1 实现 `PathResolver`：`resolveInstallRoot(override?)`、`resolveHomeDirectory()`（`linux`/`darwin` 下 `HOME` 为空抛 `INIT_HOME_NOT_SET`）、`platform()` 返回 `"win32"|"darwin"|"linux"`、`arch()` 返回 `"x64"|"arm64"`、`installSourceFromArgv(argv)` 返回 `"npm-global"|"npm-local"|"dev"`；`win32` 下解析 `~` 为 `%USERPROFILE%`
    - 文件：`packages/cli/src/utils/path-resolver.ts`
    - _Requirements: 4.6, 4.9_
  - [x]* 4.2 编写 `path-resolver` 单元测试：覆盖 win32/`%USERPROFILE%` 解析、darwin/linux + `HOME=""` 抛错、`installSourceFromArgv` 三态判定（含 `bun link` 场景视为 `dev`）
    - 文件：`packages/cli/tests/unit/path-resolver.test.ts`
    - _Requirements: 4.6, 4.9_
  - [x] 4.3 实现 `init-options-parser`：解析 argv → `InitOptions { force, json, installRootOverride? }`，仅接受 `--force`/`--json`/`--help`/`--install-root=<path>`，未知 flag 抛 `INIT_UNKNOWN_FLAG`（exit 2）
    - 文件：`packages/cli/src/commands/init/options-parser.ts`
    - _Requirements: 3.1_
  - [x]* 4.4 编写 `init-options-parser` 单元测试：覆盖每个合法 flag 单独/组合、未知 flag → exit 2 + 错误消息含 flag 名、`--help` 短路返回
    - 文件：`packages/cli/tests/unit/init-options-parser.test.ts`
    - _Requirements: 3.1, 3.5, 3.6_
  - [x] 4.5 实现 `specforge --version --json`：使用 `SchemaVersionManager.baseline` + 读取 `@specforge/cli` package.json#version + 读取 `~/.specforge/.installation.json#schema_version`（读不到/解析失败 → null），输出 `VersionInfoPayload` 单行 JSON；非 JSON 模式输出 `<cliVersion>\n<schema_version>`
    - 文件：`packages/cli/src/commands/version-cmd.ts`
    - _Requirements: 2.4, 2.5, 6.4_
  - [x]* 4.6 编写 `version-cmd` 单元测试：`--version` 退出码 0 + 2 秒内、`--version --json` 输出契合 `VersionInfoPayload` schema、`installRootSchemaVersion` 在缺文件/损坏 JSON/缺字段时三种 null 路径
    - 文件：`packages/cli/tests/unit/version-cmd.test.ts`
    - _Requirements: 2.4, 2.5, 6.4_
  - [x] 4.7 在 `packages/cli/src/cli.ts` 注册 `init` 子命令；保证 `specforge --help` 输出包含字面量 `init`/`daemon`/`job`/`webhook`；`specforge` 二进制入口在 `packages/cli/package.json#bin.specforge` 已声明（如缺则补）
    - 文件：`packages/cli/src/cli.ts`、`packages/cli/package.json`
    - _Requirements: 2.1, 2.5, 2.7_

- [x] 5. Phase 4：InstallationWizard（PathResolver / LockManager / 原子写 / 回滚 / wizard 主体）
  - [x] 5.1 实现 `LockManager`：基于 `proper-lockfile`（copyFile + unlink），实现 `acquire(timeoutMs)`/`release()`/`isHeld()`/`getActiveLockCount()` + `Symbol.asyncDispose`；锁文件 `~/.specforge/.init.lock` 元数据写 `{ pid, hostname, timestamp }`；构造器只赋值依赖句柄不做 I/O（lessons-injected JS1）；`acquire/release` 必须配对使用 `try/finally`；超时使用 `Promise.race` 时 finally 中 `clearTimeout` 败者 timer（C1）
    - 文件：`packages/cli/src/utils/lock-manager.ts`
    - _Requirements: 3.9（CARU 四阶段 + lessons-injected C1/JS1/JS2/JS3/X2）_
  - [x]* 5.2 编写 `lock-manager` 单元测试：`acquire` 成功/超时返回 false、并发第二个 acquire 拿到锁返回 false 且 stderr 提示含锁路径、`release` 幂等可在未 acquire 时调用、`afterEach` 断言 `getActiveLockCount() === 0`、`Symbol.asyncDispose` 释放锁
    - 文件：`packages/cli/tests/unit/lock-manager.test.ts`
    - _Requirements: 3.9_
  - [x] 5.3 实现 `FilesystemAdapter`：原子写 `writeAtomic(path, content)`（tmp + rename，UTF-8 无 BOM 末尾换行）、`mkdirTracked(path, createdSet)` 把已创建路径压栈、`rollback(createdSet)` 逆序删除；提供 `exists` / `readJson` 工具
    - 文件：`packages/cli/src/utils/filesystem-adapter.ts`
    - _Requirements: 4.5, 4.7, 4.8, 4.10_
  - [x] 5.4 实现 `ResourceCheck`：检测 CPU 核心数（`os.cpus().length` < 4）、总内存（`os.totalmem()` < 4 GiB）、目标盘空闲空间（`<` 40 GiB），任一不足追加 warning 字符串到 `warnings` 数组并 stderr 同步打印；返回 `warnings: string[]`，永不抛错
    - 文件：`packages/cli/src/commands/init/resource-check.ts`
    - _Requirements: 3.7_
  - [x]* 5.5 编写 `init-resource-check` 单元测试：mock `os.cpus`/`os.totalmem`/`fs.statfs`（或等价 API）三种维度各覆盖一条 below-threshold + above-threshold；warnings 数组上限 100 条 + 每条 ≤ 500 字符
    - 文件：`packages/cli/tests/unit/init-resource-check.test.ts`
    - _Requirements: 3.5, 3.7_
  - [x] 5.6 实现 `installation-record.ts`：`writeInstallationRecord(root, record)` 走 `FilesystemAdapter.writeAtomic`、`loadInstallationRecord(root)` 解析 JSON，缺字段/解析失败/缺文件分别返回封闭枚举 `{ kind: "missing" } | { kind: "unparseable" } | { kind: "missing_field" } | { kind: "ok", record }`；`schema_version` 严格等于 `SchemaVersionManager.baseline`，时间戳 ISO 8601 UTC 毫秒精度
    - 文件：`packages/cli/src/distribution/installation-record.ts`
    - _Requirements: 4.3, 4.5, 6.3_
  - [x] 5.7 实现 `default-config-generator.ts`：调用 configuration spec 的 `buildDefaultConfig()` 生成 yaml 字符串骨架，再遍历 `ScopeGateExports.p1p2FlagKeys` 强制写入每个 key 为 `false`，并在文件顶部强制注入 `schema_version: "1.0"`；返回 yaml 字符串供 `FilesystemAdapter.writeAtomic` 写入
    - 文件：`packages/cli/src/distribution/default-config-generator.ts`
    - _Requirements: 4.2, 4.5_
  - [x] 5.8 实现 `InstallationWizard.initialize(opts)` 主体：按 design.md state diagram 执行 CARU 四阶段（Created→Started→Locked→Inspected→Created2/NoOp→Persisted→Released；任意失败 → Rolled→Released）；`detectExistingInstallation` 仅看 6 个直接子目录是否存在；`--force` 仅可覆盖 `config/config.yaml` 与 `.installation.json`，`migrations/` 与 `logs/` 永不动；锁通过 `await using lock = ...` 释放；任意 `Promise.race` 在 finally 中清理 timer
    - 文件：`packages/cli/src/commands/init/wizard.ts`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.8, 4.1, 4.4, 4.7, 4.8, 4.10, 6.3, 7.1, 7.2, 7.3_
  - [x]* 5.9 编写 `init-rollback` 单元测试：mock `fs.mkdir` 在第二步抛 `EACCES` 后断言 `createdSet` 内所有路径已被逆序删除、`stderr` 含 path/errno/remedy 三件套、退出码 1
    - 文件：`packages/cli/tests/unit/init-rollback.test.ts`
    - _Requirements: 3.8, 4.10_
  - [x] 5.10 实现 `init` 输出层：JSON 模式输出 `InitJsonPayload` 单行无 ANSI；交互模式按 design.md 输出每个 createdDir 一行 + 5 个命名字段摘要块；`warnings` 上限 100 条/每条 ≤ 500 字符截断
    - 文件：`packages/cli/src/commands/init/output.ts`
    - _Requirements: 3.5, 3.6_
  - [x] 5.11 实现 `ErrorPayload` 工厂与 `ErrorCode → exitCode` 映射表（11 条 ErrorCode 全覆盖），`emitError(code, ctx, jsonMode)` 在 stderr 输出单行人类消息、JSON 模式额外在 stdout 输出 `ErrorPayload` 单行 JSON，并按表返回退出码（0/1/2/4/5）
    - 文件：`packages/cli/src/distribution/error-payload.ts`
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 4.9, 6.5, 7.5, 7.6_

- [x] 6. Checkpoint - InstallationWizard 已完成
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 5：Daemon HealthCheck 集成
  - [x] 7.1 在 `packages/cli/src/distribution/daemon-healthcheck.ts` 实现 `runDaemonHealthCheck()`：调用 `loadInstallationRecord(root)`，按 `kind` 分发——`missing|unparseable|missing_field` → `DAEMON_INSTALLATION_BROKEN` exit 5；`ok` → `SchemaVersionManager.compareForHealthCheck`，`equal` 返回让 daemon 继续启动、`code_higher` → `DAEMON_BASELINE_MISMATCH` exit 1、`code_lower` → `DAEMON_DOWNGRADE_REJECTED` exit 4，错误消息含 observed + expected；在 `packages/daemon-core/` 启动早期暴露的 hook 注册点中接入此函数（若 daemon-core 暴露的接口名不同，按其实际签名适配，但**不修改** daemon-core 的内部逻辑）
    - 文件：`packages/cli/src/distribution/daemon-healthcheck.ts`、必要时 `packages/daemon-core/src/.../*.ts` 的 hook 接入点
    - _Requirements: 6.5, 7.5, 7.6_
  - [x]* 7.2 编写 `daemon-healthcheck` 单元测试：四种 `loadInstallationRecord` 返回 × `compareForHealthCheck` 三态的笛卡尔积，断言每种组合的退出码与 stderr 含字面量 `"downgrade not supported"` / `"Run 'specforge init' to repair your installation"`
    - 文件：`packages/cli/tests/unit/daemon-healthcheck.test.ts`
    - _Requirements: 6.5, 7.5, 7.6_

- [x] 8. Phase 6：Property-Based Tests（恰好 3 个）+ ErrorPayload 单元测试
  - [x]* 8.1 编写 `distribution-property-14-baseline-equality.property.test.ts`
    - **Property 1: Schema Baseline Equality**
    - **Validates: Requirements 4.5, 6.2, 6.3, 6.5, 7.5**
    - **Derived-From: v6-architecture-overview Property 14**
    - 用 `fast-check` 生成随机 baseline 字符串（合法 + 非法）× 随机 `~/.specforge/.installation.json` 状态（missing / unparseable / missing_field / present(v)）；写入面在临时 HOME 跑 `wizard.initialize`，断言 `.installation.json#schema_version` 与 `config/config.yaml#schema_version` byte-equal `baseline`；校验面对纯函数 `compareForHealthCheck` 断言三态等价关系；迭代 ≥ 100；测试 describe 描述含 `Feature: distribution, Property 1: Schema Baseline Equality; Derived-From: v6-architecture-overview Property 14`；测试用例 `afterEach` 断言所有 LockManager 实例 `getActiveLockCount() === 0`
    - 文件：`packages/cli/tests/property/distribution-property-14-baseline-equality.property.test.ts`
  - [x]* 8.2 编写 `distribution-property-15-scope-default-off.property.test.ts`
    - **Property 2: P1/P2 Default Off**
    - **Validates: Requirements 4.2**
    - **Derived-From: v6-architecture-overview Property 15**
    - 用 `fast-check` 生成随机 P1/P2 flag 名称集合（含特殊字符、嵌套 key 如 `remote.api_key.enabled`）；调 `default-config-generator.generateDefaultConfig(flags)`，解析 yaml 后断言 `∀ f ∈ F: parseYaml(yaml).getEffective(f) ∈ { false, undefined }`；迭代 ≥ 100；describe 含 `Feature: distribution, Property 2: P1/P2 Default Off; Derived-From: v6-architecture-overview Property 15`
    - 文件：`packages/cli/tests/property/distribution-property-15-scope-default-off.property.test.ts`
  - [x]* 8.3 编写 `distribution-init-idempotent.property.test.ts`
    - **Property 3: Init Idempotency**
    - **Validates: Requirements 3.3, 3.4, 4.7, 4.8, 7.1, 7.2**
    - 用 `fast-check` 生成 `(预存目录子集 ⊆ 6 个直接子目录, 用户随机文件树 U ⊆ migrations/ ∪ logs/, force ∈ {true, false}, json ∈ {true, false})` 四元组；在临时 HOME 中物化 → 跑 `wizard.initialize` → 用 sha256 比对前后；断言四个子条件全成立：①用户文件零损伤、②`existingDirs` 准确等于已存在直接子目录与已存在 init 管理文件并集、③no-op 分支 `createdDirs = []`、④`--force` 仅覆盖 config.yaml + .installation.json；迭代 ≥ 100；用动态追踪列表清理临时 HOME（lessons-injected T1）；describe 含 `Feature: distribution, Property 3: Init Idempotency`
    - 文件：`packages/cli/tests/property/distribution-init-idempotent.property.test.ts`
  - [x]* 8.4 编写 `error-payload` 单元测试：覆盖全部 11 个 `ErrorCode` → 退出码映射表（0/1/2/4/5），断言 `INIT_RESOURCE_WARNING` 唯一退出 0、`DAEMON_DOWNGRADE_REJECTED` 退出 4、`DAEMON_INSTALLATION_BROKEN` 退出 5
    - 文件：`packages/cli/tests/unit/error-payload.test.ts`
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 4.9, 6.5, 7.5, 7.6_

- [x] 9. Phase 7：集成测试（6 个真实文件系统场景）
  - [x]* 9.1 编写 `pack-and-install.test.ts`：`bun pack` 生成本地 tarball → 在临时目录 `npm install -g <tarball>` → 验证 `specforge` 命令可用 + `specforge --version` 退出 0；afterEach 卸载 + 删除临时 dir
    - 文件：`tests/integration/distribution/pack-and-install.test.ts`
    - _Requirements: 1.5, 1.8, 1.9, 2.2_
  - [x]* 9.2 编写 `init-end-to-end.test.ts`：临时 HOME → `specforge init` → 断言 6 个直接子目录 + `config/config.yaml`（含 `schema_version: "1.0"`）+ `.installation.json`（5 个字段齐全 + `schema_version` 等于 baseline）+ `migrations/.gitkeep` + `migrations/README.md`；JSON 模式断言 `InitJsonPayload` schema 完整性
    - 文件：`tests/integration/distribution/init-end-to-end.test.ts`
    - _Requirements: 3.2, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x]* 9.3 编写 `init-concurrent-lock.test.ts`：spawn 两个 `specforge init` 子进程并发 → 断言一个退出 0、另一个退出 2 + stderr 含锁文件路径 + 持有者 PID；afterEach 用追踪列表清理（lessons-injected T1）
    - 文件：`tests/integration/distribution/init-concurrent-lock.test.ts`
    - _Requirements: 3.9_
  - [x]* 9.4 编写 `upgrade-in-place.test.ts`：装 vN → 装 vN+1（更高 baseline） → `specforge init` 后断言 `~/.specforge/` 内容（除 `config/config.yaml` 与 `.installation.json` 外）byte-equal、`migrations/`/`logs/` 完全未动；断言 stderr 含安装的 CLI 版本、baseline、磁盘 schema_version 与迁移命令字面量
    - 文件：`tests/integration/distribution/upgrade-in-place.test.ts`
    - _Requirements: 7.2, 7.3_
  - [x]* 9.5 编写 `uninstall-preserves-data.test.ts`：装好 + init 后跑 `npm uninstall -g @specforge/cli`，对 `~/.specforge/` 整树做 sha256 hash 比对，断言任何文件 byte-equal；断言 `specforge` 二进制不可用
    - 文件：`tests/integration/distribution/uninstall-preserves-data.test.ts`
    - _Requirements: 7.1_
  - [x]* 9.6 编写 `downgrade-rejection.test.ts`：写入一个 `.installation.json#schema_version="2.0"` → 跑 `runDaemonHealthCheck` with `baseline="1.0"` → 断言退出码 4 + stderr 含字面量 `"downgrade not supported"` + `"2.0"` + `"1.0"`
    - 文件：`tests/integration/distribution/downgrade-rejection.test.ts`
    - _Requirements: 7.5_

- [x] 10. Checkpoint - 测试金字塔验收（unit + 3 PBT + 6 integration 全绿）
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase 8：三平台烟雾测试（GitHub Actions matrix + smoke-runner）
  - [x] 11.1 实现 `SmokeTestRunner`：实现 `runStep(step)`（每步 120s timeout，用 `AbortController` + `Promise.race` + finally clearTimeout——遵守 lessons-injected C1）、`runAll(opts)`（5 步硬编码序列：`npm install -g <tarball>` / `specforge --version` / `specforge init` / `specforge --help` / `specforge daemon status`，stdout/stderr 截断 4096 字符，写 `SmokeReport` JSON）、`cleanup()`（卸载 + 删除临时 HOME，**仅触碰**临时 HOME 与全局 `@specforge/cli` 安装位置）；实现 `Disposable` + `getActiveStepCount()` 自检 API；在 `runAll` 抛错时 `cleanup` 也必须被调用（`try/finally`）；按规则：业务失败 exit 1、超时 exit 2、清理失败 exit 3、全成功 exit 0
    - 文件：`scripts/smoke-runner.ts`、`packages/cli/src/distribution/smoke-runner-core.ts`（实现核心抽到 cli 包供测试）
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.7, 5.8_
  - [x]* 11.2 编写 `smoke-runner` 单元测试：mock 子进程，覆盖 5 步全成功 → exit 0；任一步失败 → exit 1；任一步超时 → exit 2；cleanup 失败 → exit 3；JSON 报告字段完整性 + 4096 字符截断；afterEach 断言 `getActiveStepCount() === 0`
    - 文件：`packages/cli/tests/unit/smoke-runner.test.ts`
    - _Requirements: 5.3, 5.5, 5.7, 5.8_
  - [x] 11.3 创建 `.github/workflows/distribution-smoke.yml`：`fail-fast: false` + `matrix.os: [windows-latest, macos-latest, ubuntu-latest]`，`timeout-minutes: 15`；步骤 `bun pack packages/cli` → `bun run scripts/smoke-runner.ts --tarball=<path> --temp-home=<runner.temp>/specforge --report-path=$GITHUB_WORKSPACE/smoke-report.json` → `actions/upload-artifact` 上 `smoke-report.json`；任一矩阵作业非 0 即整 workflow 失败
    - 文件：`.github/workflows/distribution-smoke.yml`
    - _Requirements: 5.2, 5.6_

- [x] 12. Phase 9：文档与发布前自检
  - [x] 12.1 在 `packages/cli/README.md` 添加章节，**章节标题必须严格等于** `Complete Removal Including User Data`，正文为有序编号列表（`1.` `2.` ...），**每行恰好一条 shell 命令**；命令至少包含：`npm uninstall -g @specforge/cli` 与跨平台删除 `~/.specforge/` 的两条 `rm -rf ~/.specforge/`（POSIX）和 `Remove-Item -Recurse -Force $env:USERPROFILE\.specforge`（Windows）
    - 文件：`packages/cli/README.md`
    - _Requirements: 7.4_
  - [x] 12.2 创建 `.kiro/specs/distribution/artifacts/architecture-decisions.md`，把 design.md ADR 摘要中的 6 条（ADR-DIST-001 ～ ADR-DIST-006）展开成完整 ADR（Status / Context / Decision / Consequences）
    - 文件：`.kiro/specs/distribution/artifacts/architecture-decisions.md`
    - _Requirements: 6.2, 4.4, 5.4, 4.2, 7.5（追溯 ADR 涉及的 AC）_
  - [x] 12.3 实现 `scripts/check-version-alignment.ts`：读取最近 git tag（`git describe --tags --abbrev=0`）与 `packages/cli/package.json#version`，断言两者完全相等；在 `scripts/publish-pipeline.ts` 主流程的最早一步调用此函数；不相等退出 `PUBLISH_VALIDATION` 错误码
    - 文件：`scripts/check-version-alignment.ts`、（在 `scripts/publish-pipeline.ts` 中接入调用）
    - _Requirements: 6.1_

- [x] 13. Final Checkpoint - 全部产物可发布
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标 `*` 的子任务为可选（property tests / unit tests / integration tests / smoke unit tests），可为 MVP 跳过；标无 `*` 的子任务必须实现
- 每条任务用 `_Requirements: X.Y_` 标注实现的 acceptance criteria（来自 requirements.md 的 Requirement 1～7）
- 3 条 PBT 任务（8.1 / 8.2 / 8.3）均显式标注 `Property N: <Title>` + `Validates: Requirements ...` + `Derived-From: v6-architecture-overview Property N`（按 design.md "Correctness Properties" 与 v6-development-workflow 第 6 节"承接 Correctness Property 的规矩"要求）
- 所有持有异步资源的类（LockManager、SmokeTestRunner）严格遵守 async-resource-coding-standards：构造器无副作用 / Disposable + Symbol.asyncDispose / `getActive*Count()` 自检 API / `afterEach` 断言清零；任何 `Promise.race` 在 finally 中 clearTimeout 败者
- 所有 JSON/YAML 持久化文件携带 `schema_version: "1.0"`（`.installation.json` / `config/config.yaml` / `smoke-report.json`）
- 包管理器统一 bun（`bun install` / `bun run build` / `bun test <文件>` / `bun pack` / `bun publish`），用户对外安装命令仍是 `npm install -g @specforge/cli`
- 源码与测试位置严格遵守 project-structure.md 规则 1/2：`.kiro/specs/distribution/` 只放文档；源码在 `packages/cli/src/distribution/`、`packages/cli/src/commands/init/`、`packages/cli/src/utils/`、`scripts/`；测试在 `packages/cli/tests/{unit,property}/` 与 `tests/integration/distribution/`；CI workflow 在 `.github/workflows/`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "2.7"] },
    { "id": 3, "tasks": ["4.1", "4.3", "4.5"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.6", "4.7"] },
    { "id": 5, "tasks": ["5.1", "5.3", "5.4", "5.6", "5.7", "5.11"] },
    { "id": 6, "tasks": ["5.2", "5.5"] },
    { "id": 7, "tasks": ["5.8"] },
    { "id": 8, "tasks": ["5.9", "5.10"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2"] },
    { "id": 11, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 12, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 13, "tasks": ["11.1"] },
    { "id": 14, "tasks": ["11.2", "11.3", "12.1", "12.2", "12.3"] }
  ]
}
```

# 实施计划：安装器 Reconcile 重新设计

## 概述

本计划实现 SpecForge 安装器的声明式期望状态协调架构。实施采用自底向上的方式：先实现基础工具和类型，然后是核心管道模块（Discovery → State → Planner → Executor），再是编排层（Commit Manager、Reconcile Engine），最后是 CLI 集成和 Plugin 启动。每个模块均可独立测试，属性测试验证设计文档中定义的 16 个正确性属性。

**技术栈**：TypeScript、Bun 运行时、SHA-256 哈希、fast-check 属性测试

## 任务列表

- [x] 1. 搭建项目结构、共享类型和测试基础设施
  - [x] 1.1 创建目录结构和共享类型定义
    - 创建 `scripts/lib/` 目录用于所有 reconcile 模块
    - 创建 `tests/property/` 和 `tests/unit/` 目录
    - 在 `scripts/lib/types.ts` 中定义共享类型：`ManagedComponentType`、`ManagedKind`、`ReconcileScope`、`DesiredStateEntry`、`CurrentStateEntry`、`FileReconcileInput`、`PlanEntry`、`ReconcilePlan`、`PlanSummary`、`DecisionAction`、`ExecutableAction`、`FileDecision`、`PlanDiagnostics`、`ExecutionResult`、`ExecutedAction`、`FailedAction`、`ExecutionWarning`、`WarningCode`、`PendingDeleteEntry`、`UserLevelManifest`、`FileEntry`、`RuntimeManifest`、`RuntimeFileEntry`、`LockContent`、`CommandResult`、`EXIT_CODES`
    - 明确类型关系：`DecisionAction = "create" | "update" | "delete" | "skip" | "conflict" | "ignore" | "none"`；`ExecutableAction = "create" | "update" | "delete" | "skip" | "conflict"`；`PlanEntry.action` 使用 `ExecutableAction`，`ignore`/`none` 仅进入 `PlanDiagnostics`
    - 定义 `isCustomizable()` 辅助函数
    - _需求：1.2, 2.3, 14.1_

  - [x] 1.2 搭建 fast-check 测试基础设施
    - 添加 `fast-check` 依赖
    - 创建 `tests/helpers/generators.ts`，包含共享 fast-check 生成器：`arbRelativePath()`、`arbManagedComponentType()`、`arbSha256()`、`arbDesiredStateEntry()`、`arbCurrentStateEntry()`、`arbFileReconcileInput()`、`arbManifest()`
    - 创建 `tests/helpers/fixtures.ts`，包含集成测试用临时目录工具
    - 配置 `bun test` 相关设置
    - _需求：2.5, 14.1–14.11_

- [x] 2. 实现 Discovery 模块
  - [x] 2.1 实现 `scripts/lib/discovery.ts` — 源目录扫描
    - 实现 `buildDesiredState(options: DiscoveryOptions): Promise<DiscoveryResult>`
    - 扫描模式：`agents/*.md`、`tools/*.ts`（顶层）、`tools/lib/*.ts`、`plugins/*.ts`、`skills/*/SKILL.md`
    - 排除 `.gitkeep`、`node_modules/`、`package.json`、`package-lock.json`
    - 按目录分类文件：agent、tool、tool_lib、plugin、skill
    - 为每个文件计算 SHA-256，路径规范化为 POSIX 格式
    - 对缺失/空/不可读源目录返回类型化 `DiscoveryError`
    - 实现 `UserSharedProvider` 类封装 `buildDesiredState`
    - _需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.2 编写 Discovery 属性测试（属性 1 和 2）
    - **属性 1：Discovery 产生正确的期望状态**
    - 生成随机 `.opencode/` 目录结构
    - 验证返回条目精确匹配可部署文件集合及正确的 `ManagedComponentType`
    - 验证排除项（.gitkeep、node_modules、package.json、package-lock.json）
    - **属性 2：Discovery 哈希完整性**
    - 对每个发现的文件，验证 `sourceHash` 等于独立计算的 SHA-256
    - **验证需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.8**

  - [x] 2.3 编写 Discovery 边界用例单元测试
    - 测试空源目录（排除 .gitkeep 后）
    - 测试源目录不存在
    - 测试源目录不可读（权限错误）
    - 测试 skills 目录嵌套结构（仅部署 SKILL.md）
    - 测试 Windows 上混合路径分隔符
    - _需求：1.7, 1.6_

- [x] 3. 实现路径规范化工具
  - [x] 3.1 实现 `scripts/lib/paths.ts` — 路径规范化
    - `toPosix(path: string): string` — 将任意路径规范化为 POSIX 格式
    - `toNative(posixPath: string): string` — 将 POSIX 转换为 OS 原生路径
    - `normalizeSeparators(path: string): string` — 处理混合分隔符
    - `resolveTargetDir(): string` — 从 `OPENCODE_CONFIG_DIR` 环境变量或平台默认值解析 User_Level_Directory
    - _需求：10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 3.2 编写路径规范化属性测试（属性 3）
    - **属性 3：路径规范化往返一致性**
    - 生成包含 `/`、`\` 和混合分隔符的随机路径
    - 验证 `toNative(toPosix(path))` 解析到相同文件系统位置
    - 验证 DesiredState/CurrentState 中所有路径仅使用正斜杠
    - **验证需求：1.6, 10.1, 10.2, 10.4**

- [x] 4. 实现共享原子文件工具
  - [x] 4.1 实现 `scripts/lib/atomic.ts` — 共享原子写入工具
    - 供 Manifest、Executor、OpenCode Merge、RuntimeManifest 共用
    - 唯一临时文件后缀：pid + uuid 组合
    - 可选哈希验证（写入后计算 SHA-256 与预期比对）
    - 故障注入钩子（用于测试时模拟写入/rename 失败）
    - 接口：`atomicWrite(targetPath, content, options?: { expectedHash?, faultHook? }): Promise<AtomicWriteResult>`
    - 失败时清理临时文件，不留残留
    - _需求：4.1, 4.2, 4.6, 5.6, 12.5_

  - [x] 4.2 编写原子写入故障注入测试
    - 在 temp 写入阶段注入故障 → 验证目标文件未变更
    - 在 SHA-256 验证阶段注入故障 → 验证临时文件已清理
    - 在 rename 阶段注入故障 → 验证目标文件未变更且无临时文件残留
    - 正常路径验证：写入后文件 SHA-256 与预期一致
    - _需求：4.1, 4.2, 4.4, 4.6_

- [x] 5. 实现 Manifest 模块
  - [x] 5.1 实现 `scripts/lib/manifest.ts` — 两层校验（读取/验证）
    - 实现 `readAndValidateManifest(targetDir): Promise<ManifestResult>` 两层校验：
      - Layer 1（Header）：检查存在性、JSON 解析、必需字段（`shared_version`、`installed_at`、`updated_at`、`files`）
      - Layer 2（Entries）：验证各条目，报告警告但不使整体失效
    - _需求：5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 实现 `scripts/lib/manifest.ts` — 写入（含 pending_deletes）
    - 实现 `writeManifest(options: ManifestWriteOptions): Promise<boolean>`，使用共享 `atomic.ts` 原子写入
    - 写入的 Manifest 包含 `pending_deletes` 数组
    - 部分失败时构建 partial manifest，记录已执行动作和失败动作
    - _需求：4.3, 4.5, 5.5, 5.6_

  - [x] 5.3 实现旧版 Manifest 适配器（Legacy Manifest Adapter）
    - 检测旧版基于注册表的 Manifest 格式
    - 将旧版文件哈希规范化为 `UserLevelManifest.files` 结构
    - 保留 `shared_version`/`installed_at`/`updated_at`（如存在）
    - 发出迁移警告日志
    - _需求：11.1_

  - [x] 5.4 实现 RuntimeManifest 读写
    - 实现 `readRuntimeManifest()` 和 `writeRuntimeManifest()` 用于项目级轻量 Manifest
    - 使用 mtime + size 快速比较
    - _需求：7.4_

  - [x] 5.5 编写 Manifest 校验属性测试（属性 9）
    - **属性 9：Manifest 校验正确性**
    - 生成具有不同字段存在/类型的随机 JSON 对象
    - 验证 `valid: true` 当且仅当所有必需 header 字段存在且类型正确
    - 验证 entry 级别错误作为警告报告而不使 Manifest 失效
    - **验证需求：5.1, 5.2, 5.3**

- [x] 6. 实现 State 模块
  - [x] 6.1 实现 `scripts/lib/state.ts` — 当前状态构建器
    - 实现 `buildCurrentState(options: StateOptions): Promise<CurrentState>`
    - 从以下来源的并集构建条目：Manifest 文件条目 + managed 目录中 sf-/sf_ 前缀文件的文件系统扫描
    - 对每个条目：计算 `currentHash`（文件不存在时为 undefined），携带 Manifest 中的 `manifestHash`
    - 从路径推断 `componentType`（当不在 Manifest 中时）
    - 根据文件系统检查设置 `existsOnDisk` 标志
    - _需求：6.1, 14.1_

  - [x] 6.2 实现 pending_deletes 重新加载
    - 从 Manifest 读取 `pending_deletes` 条目
    - 如果文件仍存在 → 注入 CurrentState 作为 managed orphan 候选
    - 如果文件已不存在 → 在下次 Manifest 写入时从 pending_deletes 中移除
    - 确保 Planner 对 pending_delete 条目重新发出 delete 动作
    - _需求：5.5, 6.5_

  - [x] 6.3 编写 State 模块单元测试
    - 测试有效 Manifest + 所有文件存在
    - 测试有效 Manifest + 部分文件缺失（currentHash = undefined）
    - 测试 null Manifest（仅文件系统扫描）
    - 测试 sf-/sf_ 前缀检测
    - 测试非 managed 文件被排除
    - 测试 pending_deletes 重新加载逻辑
    - _需求：6.1, 6.4, 5.5, 6.5_

- [x] 7. 检查点 — 确保所有测试通过
  - 验证标准：Task 1–6 的所有测试文件必须通过，无跳过测试，覆盖 Discovery、路径、原子写入、Manifest、State 模块


- [x] 8. 实现 Planner 模块
  - [x] 8.1 实现 `scripts/lib/planner.ts` — R14 决策矩阵
    - 实现 `generatePlan(desired, current, options): ReconcilePlan`
    - 从 `union(desired.keys, current.keys)` 构建 `FileReconcileInput[]`
    - 按 R14 决策矩阵应用正确优先级排序：
      - R14.2：sourceHash 存在，currentHash 不存在 → create
      - R14.3：sourceHash === currentHash → skip
      - R14.9：sourceHash ≠ currentHash，manifestHash 不存在 → update（优先于 R14.5/R14.6）
      - R14.4：sourceHash ≠ currentHash，currentHash === manifestHash → update
      - R14.5：三者均不同，可自定义类型 → conflict（仅当 manifestHash 存在时）
      - R14.6：三者均不同，非可自定义类型 → update + tamper 警告
      - R14.7：sourceHash 不存在，currentHash 存在，managed → delete
      - R14.8：sourceHash 不存在，currentHash 存在，非 managed → ignore
      - R14.10：仅 manifestHash 存在 → skip + 移除 stale 条目
      - R14.11：全部不存在 → no action
    - 分离 `DecisionAction`（内部）和 `ExecutableAction`（计划输出）
    - 生成 `PlanDiagnostics`，包含所有决策（含 ignore/none）
    - 计算 `PlanSummary` 计数
    - 处理 `force` 标志：将 conflict 解析为 update
    - _需求：2.1, 2.2, 2.3, 14.1–14.11, 3.1_

  - [x] 8.2 编写 Planner 属性测试（属性 4）— R14 穷举矩阵测试
    - **属性 4：决策矩阵正确性**
    - 实现穷举 `EXHAUSTIVE_MATRIX` 测试用例，覆盖所有有效 R14 组合
    - 验证每个 `FileReconcileInput` 产生与 R14 规则完全一致的预期动作
    - 验证 R14.9 在 manifestHash 不存在时优先于 R14.5/R14.6
    - 验证 force 标志将 conflict 解析为 update
    - 验证非可自定义类型的 tamper 警告（R14.6）
    - **验证需求：2.1, 2.2, 2.3, 14.1–14.11**

  - [x] 8.3 编写 Planner 边界用例单元测试
    - 测试空 DesiredState + 空 CurrentState → 空计划
    - 测试全 skip 场景（状态完全一致）
    - 测试单计划中混合动作
    - 测试 PlanSummary 计数准确性
    - 测试诊断输出包含 ignore/none 决策
    - _需求：2.1, 2.2_

- [x] 9. 实现 Executor 模块
  - [x] 9.1 实现 `scripts/lib/executor.ts` — 原子动作执行器（create/update）
    - 实现 create/update 动作：使用共享 `atomic.ts` 进行原子写入
    - 确保目标目录存在（递归 mkdir）
    - create/update 失败时停止执行（R4.3）
    - _需求：4.1, 4.2, 4.3, 4.4_

  - [x] 9.2 实现 `scripts/lib/executor.ts` — delete/conflict 执行器
    - delete 动作：删除文件，失败时标记 `pending_delete` 并发出警告（非致命）
    - conflict + force：覆盖
    - conflict + !force：跳过并警告
    - orphan delete 失败时继续执行（R6.5）
    - _需求：6.3, 6.5, 3.1, 3.2, 3.3_

  - [x] 9.3 实现 `scripts/lib/executor.ts` — ExecutionResult 和失败语义
    - 实现 `executePlan(plan, options): Promise<ExecutionResult>`
    - 返回 `ExecutionResult`：已执行动作、失败动作、警告、pending_deletes
    - 部分失败时记录已执行动作和失败动作，确保下次 reconcile 可从文件系统 + manifest 安全恢复
    - _需求：4.3, 4.5, 6.5_

  - [x] 9.4 编写 Executor 属性测试（属性 6 和 7）
    - **属性 6：冲突解决遵循 force 标志**
    - 生成包含 conflict 条目的计划，分别以 force/非 force 执行
    - 验证 !force 时冲突文件不变，force 时以正确 sourceHash 覆盖
    - **属性 7：非 managed 文件安全不变量**
    - 生成包含非 managed 文件（无 sf-/sf_ 前缀，不在 Manifest 中）的目标目录
    - 执行 reconcile 计划，验证非 managed 文件未变更
    - **验证需求：3.1, 3.2, 3.3, 3.5, 6.4, 8.3**

- [x] 10. 实现 Lock 模块
  - [x] 10.1 实现 `scripts/lib/lock.ts` — 心跳锁与 stale 检测
    - 实现 `acquireLock(options: LockOptions): Promise<LockAcquireResult>`
    - 使用 `O_CREAT | O_EXCL` 创建锁文件（排他创建）
    - 锁内容：`lock_id`（UUID）、`pid`、`hostname`、`command`、`acquired_at`、`last_heartbeat`
    - 启动心跳定时器（默认 5 秒间隔）更新 `last_heartbeat`
    - 心跳更新前验证 `lock_id`
    - Stale 检测：heartbeat > staleThreshold（默认 10 分钟）→ 检查 PID 存活 + hostname 匹配
    - PID 不存活或 hostname 不匹配 → 确认 stale → 删除 + 重试创建
    - PID 存活且 hostname 匹配 → 非 stale，继续等待
    - 两阶段 stale 回收：读取 lock_id → 删除 → 创建（创建失败则其他进程已获取）
    - 实现 `LockHandle.release()`：停止心跳、验证 lock_id、删除锁文件
    - 超时后返回失败（默认 30 秒）
    - _需求：8.6, 13.5_

  - [x] 10.2 编写 Lock 互斥属性测试（属性 16）
    - **属性 16：锁互斥性**
    - 模拟并发锁获取尝试
    - 验证任意时刻最多一个进程持有锁
    - 验证 stale 锁（无心跳更新）最终可被回收
    - **验证需求：8.6, 13.5**

- [x] 11. 检查点 — 确保所有测试通过
  - 验证标准：Task 8–10 的所有测试文件必须通过，无跳过测试，覆盖 Planner 决策矩阵、Executor 原子执行、Lock 互斥

- [x] 12. 实现 ProjectRuntimeProvider + RuntimeManifest + 启动模式判定
  - [x] 12.1 实现 `scripts/lib/project_runtime.ts` — Plugin 启动模式
    - 实现 `determinePluginStartupMode(projectDir): Promise<PluginStartupDecision>`
      - specforge/ 不存在 → initialize
      - specforge/ 存在 + 有效 RuntimeManifest + 所有文件存在 → skip
      - specforge/ 存在 + 有效 RuntimeManifest + 部分文件缺失 → repair_missing
      - specforge/ 存在 + 无效/缺失 RuntimeManifest → repair_full
    - 实现 `ProjectRuntimeProvider` 类
    - 使用 mtime + size 快速比较（500ms 预算）
    - 仅在 repair_full 模式下当 mtime/size 不同时计算 SHA-256
    - 性能预算：< 50 文件时 < 500ms，超时记录警告
    - 失败时进入 degraded 模式（仅 permission guard，不崩溃）（R7.5）
    - _需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 12.2 编写 Plugin 500ms 强制性能测试
    - 使用 49 个运行时文件的 fixture
    - 有效 RuntimeManifest 快速路径
    - 断言启动 reconcile 在 500ms 内完成（硬性失败）
    - _需求：7.6_

  - [x] 12.3 编写 Plugin 启动模式判定单元测试
    - 测试每种启动模式触发条件
    - 测试性能预算执行
    - 测试 reconcile 失败时进入 degraded 模式（R7.5）
    - _需求：7.1, 7.2, 7.4, 7.5, 7.6_

- [x] 13. 实现 OpenCode Merge 模块
  - [x] 13.1 实现 `scripts/lib/opencode_merge.ts` — Agent 注册合并
    - 实现 `mergeOpenCodeJson(options: OpenCodeMergeOptions): Promise<OpenCodeMergeResult>`
    - 实现 `agentKeyFromPath(relativePath)`：提取不含扩展名的文件名作为 agent key
    - 读取目标 opencode.json（不存在则创建空结构）
    - 处理 JSON 解析失败：备份到 `.backup/`，创建新文件
    - 保留所有非 sf-* 条目不变
    - sf-* 条目：添加新 agent、更新现有（按 `MergeFieldPolicy`）、移除不存在的 agent
    - `MergeFieldPolicy`：`preserveUserOverrides=true` 时保留用户可覆盖字段（`model`），强制安装器管理字段（`mode`、`prompt`、`permission`）
    - 使用共享 `atomic.ts` 原子写入
    - 实现 `DEFAULT_MERGE_FIELD_POLICY`
    - _需求：9.1, 9.2, 9.3, 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 13.2 编写 OpenCode Merge 属性测试（属性 11 和 12）
    - **属性 11：opencode.json 合并保留非 sf-* 条目**
    - 生成包含任意非 sf-* 条目的随机 opencode.json
    - 合并后验证所有非 sf-* 条目内容和结构不变
    - **属性 12：Agent 注册同步**
    - 生成 DesiredState 中的随机 agent 文件集合
    - 验证 opencode.json 中每个发现的 agent 恰好有一个条目
    - 验证移除的 agent 条目被删除
    - 验证 MergeFieldPolicy 正确保留/覆盖字段
    - **验证需求：9.2, 9.3, 12.1, 12.4, 12.6**

- [x] 14. 实现 Commit Manager
  - [x] 14.1 实现 `scripts/lib/commit.ts` — 有序提交与日志恢复
    - 实现 `commit(options: CommitOptions): Promise<CommitResult>`
    - 提交顺序：opencode.json 合并 → 写入 partial_commit.journal → 写入 Manifest → 删除 journal
    - 构建 `PartialCommitJournal`，包含 `manifest_payload`（Manifest 写入所需全部数据）
    - opencode.json 合并失败 → 不写 Manifest → 返回失败
    - Manifest 写入失败 → journal 保留用于恢复
    - 实现 `recoverPartialCommit(targetDir): Promise<CommitResult | null>`
    - 检测 `partial_commit.journal` → 读取 `manifest_payload` → 直接写入 Manifest → 删除 journal
    - `project_runtime` scope 跳过 opencode.json 合并
    - _需求：4.3, 4.5_

  - [x] 14.2 实现部分执行状态记录
    - 当 `ExecutionResult.failed` 非 null 时，构建 partial manifest
    - 记录已执行动作和失败动作
    - 确保下次 reconcile 可从文件系统 + manifest 安全恢复
    - _需求：4.3, 4.5_

  - [x] 14.3 编写 Commit 恢复属性测试（属性 15）
    - **属性 15：提交顺序安全性**
    - 模拟 opencode.json 合并后、Manifest 写入前的崩溃
    - 验证下次 reconcile 检测到 journal 并完成 Manifest 写入
    - 验证系统在崩溃后 2 次 reconcile 调用内收敛到正确状态
    - **验证需求：4.3, 4.5**

- [x] 15. 实现 Preflight 检查
  - [x] 15.1 实现 `scripts/lib/preflight.ts` — 两阶段 preflight
    - 实现 `preflightTarget(options: TargetPreflightOptions): Promise<TargetPreflightResult>`
      - 检查目标目录存在且可写
      - 检查 `.backup/` 目录可创建
      - 检查临时文件可 rename（验证原子写入可行性）
    - 实现 `preflightPlan(options: PlanPreflightOptions): Promise<PlanPreflightResult>`
      - 检查磁盘空间 ≥ 计划 create/update 总大小 * 2（temp + final）
      - 文件数量合理性：> 1000 警告，> 5000 报错
    - _需求：4.4, 13.4_

  - [x] 15.2 编写 Preflight 单元测试
    - 测试目标目录不可写
    - 测试磁盘空间不足
    - 测试文件数量过多的警告/错误阈值
    - 测试成功 preflight 通过
    - _需求：4.4, 13.4_

- [x] 16. 实现 Generated Files Handler
  - [x] 16.1 实现 `scripts/lib/generated_files.ts` — 清理处理器
    - 实现 `GeneratedFileHandler` 接口：`checkForCleanup()` 和 `executeCleanup()`
    - 管理清理：`upgrade_journal.json`（旧安装器遗留）、`partial_commit.journal`（恢复后）
    - 在成功 Reconcile 完成后调用
    - _需求：11.5_


- [x] 17. 实现 Reconcile Engine（编排层）
  - [x] 17.1 实现 `scripts/lib/reconcile.ts` — 主编排入口（Happy Path）
    - 实现 `reconcile(options: ReconcileOptions): Promise<ReconcileResult>`
    - 完整编排流程：
      1. `acquireLock()`（仅 CLI scope）
      2. `preflightTarget(targetDir)`（在 DesiredState 之前）
      3. `recoverPartialCommit()`（journal 恢复）
      4. `provider.buildDesiredState()`
      5. `readAndValidateManifest()`（两层校验）
      6. `buildCurrentState(targetDir, manifest)`
      7. `generatePlan(desired, current, options)`
      8. `preflightPlan(targetDir, desiredState, plan)`
      9. `executePlan(plan, options)`
      10. `commit(result)`（opencode.json → journal → Manifest）
      11. `generatedFileHandler.executeCleanup()`
      12. 释放锁
    - _需求：2.1–2.6, 8.1, 8.2, 8.7_

  - [x] 17.2 实现降级门控 + DowngradeResult
    - 降级检测（source version < manifest version）
    - 降级 + !force → 停止（R15.2）
    - 降级 + force → 备份 opencode.json（R15.4）→ 继续
    - 生成 `DowngradeResult` 摘要（R15.5）：previousVersion、targetVersion、deletedFiles、overwrittenFiles、skippedConflicts
    - _需求：15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 17.3 实现部分提交恢复集成
    - 在 reconcile 流程开始时检测 partial_commit.journal
    - 存在 journal → 读取 manifest_payload → 直接写入 Manifest → 删除 journal
    - 恢复后继续正常 reconcile 流程
    - _需求：4.3, 4.5_

  - [x] 17.4 实现模式特定行为（full/fresh/repair_missing/repair_full）
    - `full`：完整 Reconcile（读取 Manifest + 文件系统）
    - `fresh_install`：忽略现有状态，视 CurrentState 为空
    - `repair_missing`：跳过降级检测、跳过 opencode.json 合并、仅执行 create 动作
    - `repair_full`：跳过降级检测、跳过 opencode.json 合并、执行 create/update/delete
    - degraded 模式处理：reconcile 失败时仅 permission guard，不崩溃（R7.5）
    - _需求：7.1, 7.3, 7.4, 7.5, 8.8_

  - [x] 17.5 编写 Reconcile 幂等性属性测试（属性 5）
    - **属性 5：Reconcile 幂等性**
    - 生成随机 DesiredState 和 CurrentState
    - 执行 reconcile，写入 manifest，再次执行 reconcile
    - 验证第二次运行仅产生 skip 动作（排除 pending_deletes）
    - **验证需求：2.5**

  - [x] 17.6 编写 Manifest 反映状态属性测试（属性 10）
    - **属性 10：Manifest 反映 reconcile 后的部署状态**
    - 成功 reconcile 后，验证 Manifest 条目与磁盘上实际文件 SHA-256 匹配
    - 验证 pending_deletes 包含所有失败的 orphan 删除
    - 验证 files + pending_deletes 的并集覆盖所有 managed 文件
    - **验证需求：5.5, 6.5**

  - [x] 17.7 编写降级检测属性测试（属性 13）
    - **属性 13：降级检测正确性**
    - 生成随机 semver 对
    - 验证降级被检测当且仅当 source version < manifest version（严格 semver 比较）
    - **验证需求：15.1**

  - [x] 17.8 编写 Scope 隔离属性测试（属性 14）
    - **属性 14：Scope 隔离**
    - 以 scope "project_runtime" 执行 reconcile
    - 验证无 User_Level_Directory 修改、无 opencode.json 合并、无降级检测
    - 以 scope "user_shared" 执行 reconcile
    - 验证无项目级运行时文件修改
    - **验证需求：7.3**

- [x] 18. 检查点 — 确保所有测试通过
  - 验证标准：Task 12–17 的所有测试文件必须通过，无跳过测试，覆盖 ProjectRuntime、OpenCode Merge、Commit、Preflight、Reconcile Engine

- [x] 19. 实现 Verify 模块
  - [x] 19.1 实现 `scripts/lib/verify.ts` — verify 子命令逻辑
    - 读取 Manifest，比较每个条目记录的 SHA-256 与实际文件哈希
    - 报告不匹配文件及预期 vs 实际哈希
    - 报告缺失文件（在 Manifest 中但不在磁盘上）
    - 报告多余文件（managed 目录中的 sf-* 文件但不在 Manifest 中）
    - 返回退出码 0（全部匹配）或 6（存在不匹配）
    - 只读操作，不修改文件
    - _需求：8.4, 13.6_

  - [x] 19.2 编写 Verify 单元测试
    - 测试所有文件匹配 → 退出码 0
    - 测试哈希不匹配检测
    - 测试缺失文件检测
    - 测试多余文件检测
    - _需求：8.4, 13.6_

- [x] 20. 实现 CLI 集成
  - [x] 20.1 实现 `scripts/sf-installer.ts` — install/upgrade 命令
    - 解析 CLI 参数：`install`、`upgrade`、`--force`
    - `cmdInstall()`：reconcile mode "full"、force=false、scope "user_shared"
      - Manifest 存在 → 视为升级（读取 CurrentState）
      - Manifest 不存在 → 全新安装行为（CurrentState 为空）
    - `cmdUpgrade()`：reconcile mode "full"、force=opts.force、scope "user_shared"
    - install/upgrade 必须透传并展示 `downgradeDetected` / `DowngradeResult`，不在 CLI 层重新实现降级判断
    - 显示操作摘要（created/updated/deleted/skipped/conflict 计数）
    - _需求：8.1, 8.2, 8.3, 8.7, 8.8, 15.1, 15.2_

  - [x] 20.2 实现 `scripts/sf-installer.ts` — verify/version 命令
    - `cmdVerify()`：调用 verify 模块（只读，不获取锁）
    - `cmdVersion()`：读取 Manifest → 显示 shared_version、installed_at、updated_at、文件数量、Manifest 路径
    - _需求：8.4, 13.3, 13.6_

  - [x] 20.3 实现 `scripts/sf-installer.ts` — uninstall 命令
    - `cmdUninstall()`：获取锁 → 读取 Manifest → 删除所有 managed 文件 → 从 opencode.json 移除 sf-* 条目 → 删除 Manifest → 删除 upgrade_journal.json → 释放锁
    - _需求：8.5, 8.6_

  - [x] 20.4 实现错误映射和摘要
    - 将错误映射到适当的 `EXIT_CODES`
    - 统一错误消息格式：文件路径、尝试的动作、错误原因
    - _需求：13.1, 13.2, 13.4, 13.5_

  - [x] 20.5 编写 CLI 关键集成测试
    - 测试全新安装流程（空目录）
    - 测试升级流程（已有安装）
    - 测试 upgrade --force（覆盖冲突）
    - 测试 verify（匹配和不匹配状态）
    - 测试 uninstall（完整清理）
    - 测试 --version 输出
    - 测试降级拒绝和 --force 覆盖
    - 测试旧版 Manifest 格式向后兼容
    - **验证需求：8.1–8.8, 11.1–11.5, 15.1–15.5**

- [x] 21. 实现降级备份/结果集成测试
  - [x] 21.1 编写降级备份/结果集成测试
    - 验证强制降级前创建 opencode.json 备份
    - 验证 DowngradeResult 的 previousVersion/targetVersion
    - 验证 deletedFiles/overwrittenFiles/skippedConflicts 计数
    - **验证需求：15.4, 15.5**

- [x] 22. 检查点 — 确保所有测试通过
  - 验证标准：Task 19–21 的所有测试文件必须通过，无跳过测试，覆盖 Verify、CLI 命令、降级备份

- [x] 23. 接入 Plugin 启动集成
  - [x] 23.1 将 reconcile 集成到 Plugin 入口
    - 修改 `.opencode/plugins/sf_specforge.ts`，启动时调用 `determinePluginStartupMode()`
    - 根据模式：以适当的 `ProjectRuntimeProvider` 和 `ReconcileMode` 调用 `reconcile()`
    - 处理失败 → 进入 degraded 模式（仅 permission guard，不崩溃）
    - 确保 Plugin 上下文中不执行用户级操作
    - _需求：7.1–7.6_

  - [x] 23.2 编写 Plugin 启动集成测试
    - 测试 initialize 模式（specforge/ 不存在 → 完整创建）
    - 测试 repair_missing 模式（缺失文件恢复）
    - 测试 repair_full 模式（无效 manifest → 完整 reconcile）
    - 测试 degraded 模式（reconcile 失败 → 优雅降级）
    - 测试 < 50 文件时 500ms 性能预算
    - _需求：7.1–7.6_

- [x] 24. 最终集成与向后兼容
  - [x] 24.1 向后兼容最终核验与 registry.ts 移除
    - 核验 Task 5.3 Legacy Adapter 和 Task 16.1 Generated Files Handler 已正确集成（不重复实现）
    - 验证 CLI 接口不变（相同子命令和标志）
    - 移除或弃用 `scripts/lib/registry.ts`（被 discovery.ts 替代）
    - 运行全量集成测试确认旧安装迁移路径正确
    - _需求：11.1–11.5_

  - [x] 24.2 编写端到端集成测试
    - 测试从旧注册表安装迁移到新 reconcile 系统
    - 测试旧安装器部署但已从源中移除的文件的 orphan 清理
    - 测试迁移期间保留现有用户自定义
    - _需求：11.1–11.5, 3.1–3.5_

- [x] 25. 最终检查点 — 确保所有测试通过
  - 验证标准：全部测试文件必须通过，无跳过测试，覆盖范围包括：属性测试（16 个属性）、单元测试、集成测试、端到端测试

## 说明

- 所有测试任务均为必需（非可选），必须全部通过
- 每个任务引用具体需求以确保可追溯性
- 检查点确保增量验证，验证标准明确指定必须通过的测试文件和覆盖范围
- 属性测试验证设计文档中的 16 个正确性属性
- 单元测试验证具体示例和边界用例
- 实施顺序遵循模块依赖：类型 → Discovery → 路径 → 原子工具 → Manifest（含 Legacy Adapter）→ State → Planner → Executor → Lock → ProjectRuntime → OpenCode Merge → Commit → Preflight → Reconcile → CLI → Plugin
- 所有文件 I/O 使用 Bun 兼容 API（`Bun.file()`、`Bun.write()`、需要时使用 `node:fs/promises`）
- SHA-256 通过 `Bun.CryptoHasher` 计算以获得最佳性能
- 共享 `atomic.ts` 工具在 Manifest、Executor、OpenCode Merge 之前实现，确保所有原子写入使用统一实现

## 任务依赖图

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"], "说明": "基础设施：类型定义和测试框架" },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"], "说明": "Discovery、路径工具、共享原子写入工具" },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "5.1", "5.3"], "说明": "Discovery 测试、路径测试、原子写入测试、Manifest 读取/验证、Legacy Adapter" },
    { "id": 3, "tasks": ["5.2", "5.4", "5.5", "6.1", "6.2"], "说明": "Manifest 写入、RuntimeManifest、Manifest 测试、State 构建、pending_deletes" },
    { "id": 4, "tasks": ["6.3", "8.1", "10.1", "12.1"], "说明": "State 测试、Planner、Lock、ProjectRuntime" },
    { "id": 5, "tasks": ["8.2", "8.3", "9.1", "9.2", "9.3", "10.2", "12.2", "12.3"], "说明": "Planner 测试、Executor 实现、Lock 测试、Plugin 性能测试" },
    { "id": 6, "tasks": ["9.4", "13.1", "15.1", "16.1"], "说明": "Executor 测试、OpenCode Merge、Preflight、Generated Files" },
    { "id": 7, "tasks": ["13.2", "14.1", "14.2", "15.2"], "说明": "Merge 测试、Commit Manager、部分执行记录、Preflight 测试" },
    { "id": 8, "tasks": ["14.3", "17.1", "17.2", "17.3", "17.4"], "说明": "Commit 恢复测试、Reconcile Engine 各子任务" },
    { "id": 9, "tasks": ["17.5", "17.6", "17.7", "17.8", "19.1"], "说明": "Reconcile 属性测试、Verify 模块" },
    { "id": 10, "tasks": ["19.2", "20.1", "20.2", "20.3", "20.4"], "说明": "Verify 测试、CLI 命令实现" },
    { "id": 11, "tasks": ["20.5", "21.1", "23.1"], "说明": "CLI 集成测试、降级测试、Plugin 集成" },
    { "id": 12, "tasks": ["23.2", "24.1"], "说明": "Plugin 集成测试、向后兼容" },
    { "id": 13, "tasks": ["24.2"], "说明": "端到端集成测试" }
  ]
}
```

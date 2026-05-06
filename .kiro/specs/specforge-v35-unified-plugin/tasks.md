# 实现任务 — SpecForge V3.5（统一 Plugin 架构重构）

## 任务总览

基于已通过评审的需求文档（11 个需求）和设计文档，将实现拆分为 8 个主任务，按依赖顺序排列。

**架构约定：**
- `sf_specforge.ts` 是运行时自包含单文件 Plugin，不运行时 import 外部模块
- CLI 安装器仅负责用户级操作（install/upgrade/verify/uninstall）
- Plugin 通过 `~/.config/opencode/plugins/` 目录自动发现加载
- 版本比较使用 `compareVersion()`，禁止字符串 `<` 比较
- 安全降级模式保留 permission_guard + error logging

---

- [x] 1. CLI 安装器重构（移除旧代码 + 简化命令）
  - [x] 1.1 重写 `scripts/sf-installer.ts`：仅保留 install/upgrade/verify/uninstall 四个子命令；移除 --target、--project-level、--runtime-only 参数；移除 LegacyManifest、FILE_REGISTRY、cmdInstallProjectLevel、cmdInstallRuntimeOnly
  - [x] 1.2 定义 SHARED_COMPONENT_REGISTRY（含 type 字段：agent/tool/tool_lib/skill/plugin），替代旧 USER_LEVEL_REGISTRY
  - [x] 1.3 实现 cmdInstall()：部署共享组件 + Merge_Write opencode.json（仅 agent 对象 sf-* 条目）+ 写入 User_Manifest
  - [x] 1.4 实现 cmdUpgrade()：逐文件原子替换 + upgrade_journal.json 记录 + 失败回滚 + 备份
  - [x] 1.5 实现 cmdVerify()：SHA-256 校验 + 锁存在时提示
  - [x] 1.6 实现 cmdUninstall()：仅删除 Manifest 记录的文件 + 从 opencode.json 移除 sf-* Agent + 未知 sf-* 文件仅提示
  - [x] 1.7 已移除参数的错误提示（--target/--project-level/--runtime-only → 明确报错）
  - [x] 1.8 错误码定义（E_INVALID_JSON/E_LOCK_TIMEOUT/E_CHECKSUM_MISMATCH/E_PERMISSION_DENIED/E_DISK_FULL）
  - [x] 1.9 install/upgrade 完成后显示成功摘要 + "需要重启 OpenCode" 提示

- [x] 2. 安装锁机制增强（lock_id + heartbeat + stale 二次确认）
  - [x] 2.1 重写 `scripts/lib/install_lock.ts`：锁文件增加 lock_id（UUID）字段；heartbeat 前校验 lock_id 所有权
  - [x] 2.2 实现 startHeartbeat()：每 5 秒刷新 last_heartbeat + unref() 防止阻止进程退出
  - [x] 2.3 实现 stale 二次确认：读锁 → 判断 stale → 等 1 秒 → 再读锁 → lock_id 不变且仍 stale 才接管
  - [x] 2.4 修复 releaseInstallLock()：先保存 lockId，再 stopHeartbeat()，再按 lockId+pid+hostname 校验删除
  - [x] 2.5 固化 CLI 命令模板：`await acquireLock(); try { ... } finally { await releaseLock(); }`
  - [x] 2.6 编写单元测试：锁获取/释放/heartbeat/stale 二次确认/lock_id 校验/unref

- [x] 3. Unified Plugin 核心框架（启动流程 + 降级模式）
  - [x] 3.1 创建 `.opencode/plugins/sf_specforge.ts` 骨架：导出 `sf_specforge`，实现 `determineStartupMode()` 决策逻辑
  - [x] 3.2 实现启用条件检查：User_Manifest 存在 + SPECFORGE_AUTO_INIT != false + 排除目录检查
  - [x] 3.3 实现项目根目录检测：Git root 优先 → cwd → SPECFORGE_PROJECT_ROOT 覆盖 → isExcludedDirectory() 校验
  - [x] 3.4 实现版本工具（内联）：parseVersion()（含 NaN 校验 + /^\d+\.\d+\.\d+$/ 正则）、compareVersion()、satisfiesRange()（不支持格式返回 false）
  - [x] 3.5 实现安全降级模式：degradedToolBeforeHandler（只写 guard.log/error.log + permission_guard fail-closed）+ degradedEventHandler
  - [x] 3.6 实现项目级 runtime lock（specforge/.runtime.lock）：initialize 前先 mkdir → 获取锁 → 执行 → 释放；获取失败进入 runtime_busy
  - [x] 3.7 实现 StartupMode 类型：initialize | repair | migrate | skip | degraded | noop | init_failed | runtime_busy
  - [x] 3.8 编写单元测试：启动决策逻辑、版本比较、satisfiesRange、排除目录、降级模式注册

- [x] 4. Plugin 项目运行时初始化与修复
  - [x] 4.1 实现 initialize 流程：创建完整目录结构 + 初始文件（state.json、events.jsonl、config/*.json）
  - [x] 4.2 实现 AGENTS.md 冲突处理：已存在 → 创建 AGENTS.specforge.md + app.log 提示；不存在 → 直接创建
  - [x] 4.3 实现 Agent 契约文件部署：AGENT_CONSTITUTION.md + contracts/*.contract.md（从 Plugin 内联模板生成）
  - [x] 4.4 实现 Runtime_Manifest 写入：schema_version、runtime_schema_version、required_shared_version_range、initialized_at
  - [x] 4.5 实现 repair 流程：检测必需目录/文件缺失 → 补齐 → 不覆盖已有 → 记录 app.log
  - [x] 4.6 编写单元测试：initialize 幂等性、repair 补齐、AGENTS.md 冲突、manifest 写入

- [x] 5. Plugin 版本迁移系统
  - [x] 5.1 实现 MIGRATIONS 注册表：线性演进、同一 from 只允许一个 migration、启动时校验无重复/无断链
  - [x] 5.2 实现 executeMigration()：逐步执行 + 每步前备份 touchedFiles + 失败回滚 + 更新 manifest
  - [x] 5.3 实现 inferRuntimeSchemaVersion()：根据目录/文件/字段推断当前版本；无法推断时标记 recovery_required
  - [x] 5.4 实现 manifest 损坏恢复：备份损坏文件 → 推断版本 → 安全补齐
  - [x] 5.5 编写第一个 migration（1.0 → 1.1）：示例迁移函数
  - [x] 5.6 编写单元测试：迁移执行、回滚、版本推断、manifest 恢复、注册表校验

- [x] 6. Plugin 事件处理器合并（5 Plugin → 1）
  - [x] 6.1 内联 permission_guard 逻辑：checkFileEditPermission() + checkToolCallPermission() + guard.log 写入
  - [x] 6.2 内联 event_logger 逻辑：logToolIntent()（before）+ logToolResult()（after）+ trace.jsonl + tool_calls.jsonl + conversations.jsonl
  - [x] 6.3 内联 cost_tracker 逻辑：extractTokens() + buildCostEntry() + hasCostData() + cost.jsonl
  - [x] 6.4 内联 session_recorder 逻辑：saveSession() + convertMessagesToJsonl() + session tracking
  - [x] 6.5 内联 checkpoint 逻辑：compactionHandler + generateRecoverySummary() + buildCompactionContext()
  - [x] 6.6 实现统一 toolBeforeHandler：event_logger.intent → permission_guard → throw on deny
  - [x] 6.7 实现统一 toolAfterHandler：event_logger.result → cost_tracker → session_recorder → checkpoint
  - [x] 6.8 实现统一 unifiedEventHandler：event_logger → cost_tracker → session_recorder → checkpoint（每个 try-catch 隔离）
  - [x] 6.9 编写单元测试：各子模块功能 + 错误隔离 + hook 顺序 + 降级模式下行为

- [x] 7. 集成测试与回归验证
  - [x] 7.1 编写集成测试：CLI install → verify → upgrade → verify 完整流程
  - [x] 7.2 编写集成测试：Plugin 启动 initialize → skip（幂等性）
  - [x] 7.3 编写集成测试：Plugin 启动 degraded 模式（版本不兼容时 permission_guard 仍工作）
  - [x] 7.4 编写集成测试：锁并发互斥 + heartbeat + stale 接管
  - [x] 7.5 编写回归测试：旧 5 Plugin 的输出文件格式兼容性（trace.jsonl、cost.jsonl、guard.log 字段结构不变）
  - [x] 7.6 运行全部现有测试，确认无回归

- [x] 8. 文档更新与清理
  - [x] 8.1 更新 README.md：简化安装说明（CLI 只做用户级 + Plugin 自动初始化项目）
  - [x] 8.2 更新 AGENTS.md：反映 V3.5 Plugin 架构变更
  - [x] 8.3 删除旧 Plugin 文件（sf_checkpoint.ts、sf_cost_tracker.ts、sf_event_logger.ts、sf_permission_guard.ts、sf_session_recorder.ts）
  - [x] 8.4 升级 package.json 版本号到 0.2.0
  - [x] 8.5 更新 SHARED_COMPONENT_REGISTRY 确保只包含 1 个 Plugin 文件

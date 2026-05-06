# 实现任务 — SpecForge V3.4.0（用户级安装与迁移基础版）

## 任务总览

基于已通过评审的设计文档，将实现拆分为 11 个主任务，按依赖顺序排列。

**架构约定：**
- `scripts/sf-installer.ts` 重构后只保留 CLI 解析、命令分发、错误处理
- 业务逻辑下沉到 `scripts/lib/*`
- V3.3 `--project-level` 逻辑保留为 `cmdInstallProjectLevel()`，走旧 FILE_REGISTRY
- 调用顺序：`loadSourceAgents → mergeOpenCodeJson → buildUserManifest`（确保 hash 与最终配置一致）

---

- [x] 1. 基础模块：类型定义、错误码、工具函数
  - [x] 1.1 新建 `scripts/lib/types.ts`，定义 UserLevelManifest、ProjectLevelManifest、LegacyManifest、FileEntry、InstallLockInfo、AgentConfig 接口
  - [x] 1.2 新建 `scripts/lib/errors.ts`，定义 InstallerErrorCode 枚举、InstallerError 类、EXIT_CODES 映射
  - [x] 1.3 新建 `scripts/lib/paths.ts`，实现 resolveUserLevelDirectory()、posixToNative()、nativeToPosix()、normalizeLongPathForWindows()（Windows >260 字符时添加 `\\?\` 前缀或依赖 Bun long path 支持，明确策略并加注释）
  - [x] 1.4 新建 `scripts/lib/crypto.ts`，实现 computeSHA256()、canonicalizeJson()、computeAgentConfigHash()
  - [x] 1.5 新建 `scripts/lib/atomic.ts`，实现 atomicWriteFile()、backupFile()
  - [x] 1.6 新建 `scripts/lib/semver.ts`，实现 parseVersion()、compareVersions()、satisfiesRange()、validateSemverRangeFormat()
  - [x] 1.7 新建 `scripts/lib/registry.ts`，定义 USER_LEVEL_REGISTRY、PROJECT_LEVEL_REGISTRY、RUNTIME_DIRECTORIES、SPECFORGE_AGENT_DEFINITIONS、loadSourceAgents()；保留旧 FILE_REGISTRY 导出供 --project-level 使用
  - [x] 1.8 编写单元测试 `tests/unit/installer/paths.test.ts`（跨平台路径解析 + OPENCODE_CONFIG_DIR 覆盖 + Windows 长路径：普通/不超 260/超 260/UNC 路径）
  - [x] 1.9 编写单元测试 `tests/unit/installer/canonicalize.test.ts`（规范化 JSON + Agent hash 计算）
  - [x] 1.10 编写单元测试 `tests/unit/installer/semver.test.ts`（satisfiesRange + validateSemverRangeFormat + 不支持格式返回 true）

- [x] 2. 安装锁模块
  - [x] 2.1 新建 `scripts/lib/install_lock.ts`，实现 acquireInstallLock()（含 JSON 损坏处理、字段非法处理、PID 检查、超时接管）
  - [x] 2.2 实现 releaseInstallLock()（含所有权校验：仅 pid+hostname 匹配时删除；损坏锁不删除，由 acquire 接管）
  - [x] 2.3 编写单元测试 `tests/unit/installer/install_lock.test.ts`（获取/释放/超时/崩溃恢复/JSON 损坏/字段非法/所有权校验/TOCTOU 场景）

- [x] 3. Manifest 管理模块
  - [x] 3.1 新建 `scripts/lib/manifest.ts`，实现 readUserManifest()、writeUserManifest()、readProjectManifest()、writeProjectManifest()
  - [x] 3.2 实现 validateUserManifest()（必填字段校验、类型校验、schema_version 校验）
  - [x] 3.3 实现 validateProjectManifest()（必填字段校验、类型校验、schema_version 校验）
  - [x] 3.4 实现 buildUserManifest(sourceAgents, deployedFiles)（遍历 USER_LEVEL_REGISTRY 计算 sha256+size，生成 managed_agents + managed_agent_hashes；注意：必须在 mergeOpenCodeJson 之后调用，确保 hash 与最终配置一致）
  - [x] 3.5 实现 buildProjectManifest()（遍历 PROJECT_LEVEL_REGISTRY 计算 sha256+size；写入前调用 validateSemverRangeFormat() 强校验 required_shared_version_range）
  - [x] 3.6 编写单元测试 `tests/unit/installer/manifest.test.ts`（读写/校验/schema 不支持/损坏场景/semver range 写入校验）

- [x] 4. opencode.json 合并模块
  - [x] 4.1 新建 `scripts/lib/opencode_merge.ts`，实现 mergeOpenCodeJsonUserLevel()（所有权判断三分支 + prompt 路径重写 + 原子写入 + JSON 有效性验证）
  - [x] 4.2 实现 verifyOpenCodeJson()（分级输出：error/warning/ignore）
  - [x] 4.3 编写单元测试 `tests/unit/installer/opencode_merge.test.ts`（合并三种所有权场景 + --force + 备份 + 回滚 + 多次备份不覆盖）
  - [x] 4.4 编写单元测试 `tests/unit/installer/opencode_verify.test.ts`（缺失 Agent=error、缺字段=error、hash 不一致=warning、非 sf-* 变化=ignore）

- [x] 5. 版本兼容性检查模块
  - [x] 5.1 新建 `scripts/lib/compatibility.ts`，实现 assertCompatibility()（project_level 跳过、user_level 检查、manifest 损坏=error、schema 不支持=error）
  - [x] 5.2 编写单元测试 `tests/unit/installer/compatibility.test.ts`（兼容/不兼容/旧项目无 manifest/manifest 损坏/schema 不支持/LegacyManifest）

- [x] 6. 校验复用模块
  - [x] 6.1 新建 `scripts/lib/verify.ts`，实现 verifySharedComponents()（文件存在性 + SHA-256 校验，hash 不一致=error）
  - [x] 6.2 实现 verifyProjectRuntime()（目录存在性 + 关键文件存在性）
  - [x] 6.3 实现 checkSharedComponentsIntegrity()（版本匹配 + 调用 verifySharedComponents，供 install 使用）
  - [x] 6.4 实现 printVerifyResults()（error>0 → exit 1；warning>0 且 error=0 → exit 0 + 显示 warning）

- [x] 7. install 命令重构
  - [x] 7.1 重构 `scripts/sf-installer.ts` 的 parseArgs()：新增 --project-level、--runtime-only；处理 --global 等未知/不支持参数（明确报错，不静默忽略）；禁止组合校验（--project-level + --runtime-only、--project-level + --global）
  - [x] 7.2 重构 CLI main() 错误处理：捕获 InstallerError 使用 EXIT_CODES 退出；未知错误 exit 1
  - [x] 7.3 保留/适配 V3.3 旧 FILE_REGISTRY 和旧 ManifestFile 逻辑，实现 cmdInstallProjectLevel()（确保 --project-level 不走 USER_LEVEL_REGISTRY）
  - [x] 7.4 实现 cmdInstall() 用户级模式主流程（获取锁 → 完整性检查 → 部署共享组件 → 合并 opencode.json → 写 Manifest → 初始化项目 runtime → 释放锁）
  - [x] 7.5 实现 deploySharedComponents()（遍历 USER_LEVEL_REGISTRY 部署文件到 User_Level_Directory）
  - [x] 7.6 实现 initProjectRuntime()（创建 RUNTIME_DIRECTORIES + 部署 PROJECT_LEVEL_REGISTRY 文件 + 写入项目 Manifest）
  - [x] 7.7 实现 cmdInstallRuntimeOnly()（不获取锁、不检查共享组件、仅初始化 runtime）
  - [x] 7.8 确认 uninstall/purge 旧参数解析不受改造影响，uninstall 命令原行为保持不变
  - [x] 7.9 编写单元测试 `tests/unit/installer/cli_args.test.ts`（--project-level、--runtime-only、--global 报错、禁止组合、未知参数报错、uninstall/purge 仍可解析）
  - [x] 7.10 编写单元测试 `tests/unit/installer/user_level_install.test.ts`（全新安装/已存在且完整/已存在但损坏/权限不足 mock EACCES/磁盘满 mock ENOSPC）
  - [x] 7.11 编写单元测试 `tests/unit/installer/runtime_only.test.ts`（不获取锁/不检查共享组件/仅初始化 runtime）

- [x] 8. upgrade 命令重构
  - [x] 8.1 重构 cmdUpgrade()（获取锁 → 防降级检查 → 逐文件差异升级 → 用户修改检测 → 备份 → 更新 Manifest）
  - [x] 8.2 实现 supplementProjectConfig()（检查项目级配置文件新增字段并补充）
  - [x] 8.3 编写单元测试 `tests/unit/installer/upgrade.test.ts`（正常升级/防降级/--force 降级/用户修改跳过/新文件部署/配置补充）

- [x] 9. verify 命令重构
  - [x] 9.1 重构 cmdVerify()（不获取锁 + 锁存在时 warning + 调用 verifySharedComponents + verifyProjectRuntime + opencode 局部校验 + 版本兼容性检查 + printVerifyResults）
  - [x] 9.2 编写单元测试 `tests/unit/installer/verify_command.test.ts`（全通过/文件缺失=error/hash 不一致=error/Agent hash 不一致=warning/退出码验证）

- [x] 10. sf_doctor 适配 + assertCompatibility 注入
  - [x] 10.1 修改 `.opencode/tools/lib/sf_doctor_core.ts`（或对应文件），新增 checkUserLevelInstallation() 检查项
  - [x] 10.2 抽象 assertCompatibility 工具入口 wrapper/helper
  - [x] 10.3 注入 sf_state_read_core.ts、sf_state_transition_core.ts 入口
  - [x] 10.4 注入 4 个 Gate core（sf_requirements_gate_core、sf_design_gate_core、sf_tasks_gate_core、sf_verification_gate_core）入口
  - [x] 10.5 注入 sf_knowledge_graph_core.ts、sf_knowledge_query_core.ts、sf_context_build_core.ts 入口
  - [x] 10.6 编写单元测试 `tests/unit/installer/doctor_user_level.test.ts`（关键文件检查/混合模式检测/版本兼容性）
  - [x] 10.7 确保 assertCompatibility() 在 project_level 模式和旧项目（无 manifest）下跳过检查，689 个现有测试不受影响

- [x] 11. 回归测试与集成验证
  - [x] 11.1 运行全部 689 个现有单元测试，确认全部通过
  - [x] 11.2 编写集成测试：完整 install → verify → upgrade → verify 流程（用户级模式）
  - [x] 11.3 编写集成测试：install --project-level 行为与 V3.3 一致（输出文件列表快照对比）
  - [x] 11.4 编写集成测试：并发安装锁互斥（两个进程同时 install）
  - [x] 11.5 编写 uninstall 旧行为回归测试（命令仍可解析、不误走用户级安装逻辑）
  - [x] 11.6 更新 AGENTS.md 文档反映 V3.4.0 变更

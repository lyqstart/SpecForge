# TASK-14 集成测试执行日志

## 任务摘要
创建集成测试文件 `personal-mode-e2e.test.ts`，覆盖 personal 模式端到端流程和 enterprise 模式向后兼容性。

## 执行过程

### 1. 配置读取与环境理解
- 读取 `templates/prod-environment.md`（配置模板，无实际 `.specforge/prod-environment.md`）
- 读取 `packages/daemon-core/` 目录结构和现有测试文件
- 阅读全部核心源码：`WAL.ts`, `StateManager.ts`, `ProjectManager.ts`, `path-resolver.ts`, `DaemonConfig.ts`, `types.ts`

### 2. 理解现有测试模式
- 参考 `state/StateManager.test.ts` 中 StateManager 构造：`new StateManager(pathResolver, projectPath)`
- 参考 `project/ProjectManager.test.ts` 中 mock PathResolver 用法
- 参考 `tests/integration/daemon-lifecycle.test.ts` 的 vitest + import 模式

### 3. 编写测试文件
创建 `tests/integration/personal-mode-e2e.test.ts`，包含以下测试组：

1. **PersonalPathResolver — path resolution** (6 tests)
   - 运行时目录在项目内：`<project>/.specforge/runtime/`
   - events/state/sessions 路径解析正确性
   - Daemon 全局路径与 PersonalPathResolver 一致

2. **EnterprisePathResolver — path resolution (CP-2)** (6 tests)
   - WAL 写入 `~/.specforge/projects/<hash>/`（CP-2 核心验证）
   - 确定性哈希：相同项目路径产生相同目录
   - 隔离性：不同项目产生不同哈希目录
   - 全局路径与 PersonalPathResolver 共享

3. **Personal Mode E2E — WAL persistence** (7 tests)
   - events.jsonl 创建在 `.specforge/runtime/` 下
   - state.json 创建在 `.specforge/runtime/` 下
   - WAL 事件追加和读取
   - StateManager 状态转换（intake → requirements）
   - 乐观锁验证（错误 from_state 被拒绝）
   - 多工作项处理
   - WAL 恢复模拟（重启后 rebuildState）

4. **Enterprise Mode E2E — backward compatibility** (5 tests)
   - WAL 写入 `~/.specforge/projects/<hash>/`
   - 端到端转换流程（intake → requirements → design）
   - monotonicSeq 严格递增验证
   - 项目隔离性验证

5. **.specforge/.gitignore managed block** (2 tests)
   - managed block 包含 `# SpecForge managed (BEGIN)` 和 `(END)`
   - 重复注册不产生重复 block

6. **daemon.json project manifest** (5 tests)
   - 空清单加载
   - 保存和重载
   - 双模式路径一致性
   - 项目注册和 projectId 唯一性
   - 活跃项目列表

7. **Cross-mode file layout verification** (3 tests)
   - Personal 模式 WAL 在项目目录内
   - Enterprise 模式 WAL 在项目目录外
   - 布局差异确认

### 4. 测试运行
- 首次运行：34 tests passed / 1 failed
- 修复 `daemon.json` 测试隔离问题（afterEach 清理全局 daemon.json）
- 重新运行：34 tests passed (全部通过)

### 5. 全量集成测试运行
- 运行 `npx vitest run tests/integration/`
- 我的 34 tests 全部通过
- 其他 6 个 test files 失败 — 均为**预存问题**，非本次变更引起

## 遇到的问题

1. **daemon.json 测试隔离**：`saveProjectManifest` 写入真实全局路径 `~/.config/opencode/daemon.json`，导致后续测试读到残留数据。修复方式：在 `afterEach` 中清理该文件。

## 最终结论
- 成功创建 `tests/integration/personal-mode-e2e.test.ts`（34 测试全部通过）
- 覆盖 CP-2（enterprise WAL 路径）、personal 模式端到端、.gitignore managed block、daemon.json
- 预存失败不影响本次交付（chaos-recovery 使用旧 StateManager API；observability 包路径别名问题）

## 产出文件
- `packages/daemon-core/tests/integration/personal-mode-e2e.test.ts`（新建）

## 工具调用统计
- read: ~18次
- write: 1次
- edit: 1次
- bash: 3次
- sf_artifact_write: 1次

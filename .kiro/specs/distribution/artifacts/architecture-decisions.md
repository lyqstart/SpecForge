# Architecture Decision Records (ADR)

本文档记录 Distribution 模块的关键架构决策，每个 ADR 遵循标准格式：Status / Context / Decision / Consequences。

## 追溯 Requirements

| ADR ID | 涉及 Requirements |
|--------|-------------------|
| ADR-DIST-001 | REQ-6.2 (baseline 嵌入), REQ-6.3 (单调性), REQ-4.5 (schema_version 一致) |
| ADR-DIST-002 | REQ-3.4 (--force 行为), REQ-7.1 (用户数据零损伤), REQ-7.2 (升级保留) |
| ADR-DIST-003 | REQ-3.9 (并发锁), REQ-4.10 (回滚) |
| ADR-DIST-004 | REQ-5.1 (烟雾测试序列), REQ-5.4 (离线可重复), REQ-5.2 (CI 矩阵) |
| ADR-DIST-005 | REQ-4.2 (默认 P1/P2 关闭), REQ-6.4 (baseline), REQ-6.5 (baseline 比较) |
| ADR-DIST-006 | REQ-7.5 (降级拒绝 exit 4), REQ-7.6 (安装损坏 exit 5), REQ-3.1 (通用退出码) |

---

## ADR-DIST-001: Schema Version Baseline 写死为 Build-Time 常量

### Status

**Accepted** - 已实现

### Context

Distribution 模块需要在两个场景中使用 `schema_version`：
1. **运行期**：`specforge init` 写入 `~/.specforge/.installation.json`
2. **健康检查**：`specforge daemon start` 比较磁盘 schema_version 与代码 baseline

核心问题：如果 baseline 可以从配置文件读取，那么"读盘的 schema_version 反过来污染 baseline"形成环依赖。

### Decision

- **baseline 写死成 build-time 常量**（通过 `bun build --define SCHEMA_VERSION_BASELINE=...`）
- 运行期**不读盘获取 baseline**（避免环依赖）
- 运行期**不读盘覆盖 baseline**（防降级伪造）

### Consequences

**Positive**:
- 打破环依赖：baseline 的真值来源是代码常量，不是磁盘文件
- 防伪造：用户无法通过修改磁盘文件来绕过版本检查
- 单一真值来源：代码构建时就确定，与发布版本绑定

**Negative**:
- 每个 CLI 版本只能对应一个 baseline（不能动态切换）
- 需要重新构建 CLI 才能改变 baseline 值
- 构建复杂度增加（需要 --define 注入）

**Mitigation**:
- 使用 bun 的 `--define` 选项在构建时注入常量
- 默认值 "1.0"，通过 CI/CD 环境变量覆盖

### Related Requirements

- REQ-6.2: "baseline 嵌入到构建产物"
- REQ-6.3: "baseline 必须单调递增"
- REQ-4.5: "安装后 schema_version 等于 baseline"

---

## ADR-DIST-002: --force 不动 migrations/ 与 logs/ 目录

### Status

**Accepted** - 已实现

### Context

`specforge init --force` 的语义需要明确定义：
- 是全量重建（覆盖所有目录）？
- 还是部分覆盖（只更新配置文件）？

**用户数据零损伤**是 V6.0 的硬约束（Property 3）。

### Decision

- `--force` **仅覆盖** `config/config.yaml` 和 `.installation.json`
- `migrations/` 和 `logs/` 目录**永不动**（无论是否存在）
- 用户在这两个目录下的所有文件**零损伤**

### Consequences

**Positive**:
- 用户升级后 logs 不丢失（可查看历史日志）
- 用户迁移脚本不被覆盖（可继续执行）
- 符合"用户数据零损伤"硬约束

**Negative**:
- `--force` 的效果受限（不是真正的"强制重建"）
- 需要额外的代码逻辑判断哪些目录可动、哪些不可动

**Mitigation**:
- 在 wizard.ts 中硬编码保护目录列表：`['migrations', 'logs']`
- 文档中明确说明哪些文件会被覆盖

### Related Requirements

- REQ-3.4: "--force 不修改 migrations/ 与 logs/"
- REQ-7.1: "卸载不修改 ~/.specforge/"
- REQ-7.2: "升级保留用户数据"

---

## ADR-DIST-003: 锁文件用 proper-lockfile（copyFile + unlink）

### Status

**Accepted** - 已实现

### Context

`specforge init` 需要防止并发执行（两个用户同时 init 同一台机器）。需要文件锁。

### Decision

- 使用 `proper-lockfile` 库（`copyFile + unlink` 模式）
- 锁文件路径：`~/.specforge/.init.lock`
- 锁文件元数据：`{ pid, hostname, timestamp }`

**不使用的方案**：
- `fs.flock`（系统级锁）：跨平台兼容性问题，特别是 Windows
- `lockfile` npm 包：有已知的 Windows EPERM rename bug

### Consequences

**Positive**:
- 跨平台兼容（Windows/macOS/Linux）
- 绕开 Windows EPERM rename bug（与 `scripts/sync-task-status.ts` 同款）
- 提供锁持有者信息（pid/hostname），便于用户排查

**Negative**:
- 依赖额外 npm 包（proper-lockfile）
- 需要在 finally 中显式释放锁

**Mitigation**:
- 使用 `await using lock = ...` 语法（TS 5.2+）确保释放
- 任何 `Promise.race` 在 finally 中 `clearTimeout` 败者 timer

### Related Requirements

- REQ-3.9: "并发 init 第二个进程 exit 2 + 锁路径 + PID"
- REQ-4.10: "失败时回滚已创建目录"

---

## ADR-DIST-004: 烟雾测试用本地 tarball 而非 npm registry

### Status

**Accepted** - 已实现

### Context

烟雾测试需要在 CI 三平台（Windows/macOS/Linux）上跑完整安装序列：
1. `npm install -g <tarball>`
2. `specforge --version`
3. `specforge init`
4. `specforge --help`
5. `specforge daemon status`

### Decision

- **本地 tarball**：`bun pack` 生成的 `.tgz` 文件，不推送到真 npm registry
- **离线安装**：CI 无需 NPM_TOKEN
- **可重复**：每次跑的都是同一个本地 tarball

**不使用的方案**：
- 推到真 registry 再 `npm install`：需要 NPM_TOKEN、可能因网络问题失败

### Consequences

**Positive**:
- 离线可重复：CI 无需网络（除初始 `bun pack`）
- 无需 NPM_TOKEN：简化 CI 配置
- 快速反馈：本地 tarball 比远程安装快

**Negative**:
- tarball 需要上传为 GitHub Actions artifact
- artifact 大小可能较大（但可接受）

**Mitigation**:
- CI workflow: `bun pack` → upload-artifact → 各平台 download-artifact → 安装测试

### Related Requirements

- REQ-5.1: "烟雾测试 5 步序列，每步 120s 超时"
- REQ-5.4: "无外部网络请求，只读本地文件系统"
- REQ-5.2: "15 分钟 wall-clock timeout"

---

## ADR-DIST-005: P1/P2 默认关闭由 scope-gate 提供 Flag 列表

### Status

**Accepted** - 已实现

### Context

`specforge init` 需要生成默认 `config/config.yaml`，其中：
- 所有 P1/P2 feature flag 必须初始为 `false`（或省略）
- P1/P2 flag 列表来自父规范 REQ-25

**问题**：这个列表应该在哪里定义？
- **选项 A**：在本 spec 内硬编码
- **选项 B**：从 scope-gate 包动态读取

### Decision

- **单一真值来源**：flag 列表由 `scope-gate` 包提供（`p1p2FlagKeys` 常量）
- Distribution 只负责**遍历列表**并写入 `<key>: false`
- 如 scope-gate 未暴露，则提供 `getP1P2FlagKeys()` 工厂方法读取源文件

### Consequences

**Positive**:
- 单一真值来源：避免多处定义导致不一致
- scope-gate 是 Property 15（Scope Boundary）的 owner
- 符合"接口分离"原则

**Negative**:
- 增加了 scope-gate 和 distribution 的耦合
- 需要维护 scope-gate 的导出接口稳定性

**Mitigation**:
- 在 `scope-gate-bridge.ts` 中封装访问逻辑
- 如 scope-gate 不可用，提供 fallback 空列表

### Related Requirements

- REQ-4.2: "默认配置中所有 P1/P2 flag 为 false"
- REQ-6.4: "baseline + platform 信息"
- REQ-6.5: "baseline 比较"

---

## ADR-DIST-006: Exit Code 4/5 与通用退出码错开

### Status

**Accepted** - 已实现

### Context

Distribution 模块需要返回多种退出码：
- 0：成功
- 1：一般错误（HOME 未设置、权限拒绝、baseline 不匹配）
- 2：用户输入错误（未知 flag、锁冲突）
- 4：降级拒绝
- 5：安装损坏

### Decision

- **4**：专用于 `DAEMON_DOWNGRADE_REJECTED`（REQ-7.5）
- **5**：专用于 `DAEMON_INSTALLATION_BROKEN`（REQ-7.6）
- 与通用错误码（1、2）**完全错开**
- 让 CI 与运维脚本能**精确区分**三类失败

**不使用**：
- 复用 1 或 2：无法区分降级/损坏/并发三类失败

### Consequences

**Positive**:
- CI 可精确判断失败类型
- 运维脚本可根据退出码采取不同行动
- 符合设计原则：每个退出码有唯一语义

**Negative**:
- 退出码语义需要文档化
- 需要确保不与第三方工具冲突（但 4/5 相对少用）

**Mitigation**:
- 在 README 和 error-payload.ts 中明确列出每个退出码的含义
- CLI spec 中也遵循同一约定

### Related Requirements

- REQ-7.5: "降级拒绝 exit 4 + 'downgrade not supported'"
- REQ-7.6: "安装损坏 exit 5 + 'Run specforge init to repair'"
- REQ-3.1: "未知 flag exit 2"

---

## ADR 元数据

| ADR ID | Title | Status | Date |
|--------|-------|--------|------|
| ADR-DIST-001 | Schema Baseline 写死为 Build-Time 常量 | Accepted | 2026-01 |
| ADR-DIST-002 | --force 不动 migrations/ 与 logs/ | Accepted | 2026-01 |
| ADR-DIST-003 | 锁文件用 proper-lockfile | Accepted | 2026-01 |
| ADR-DIST-004 | 烟雾测试用本地 tarball | Accepted | 2026-01 |
| ADR-DIST-005 | P1/P2 默认关闭由 scope-gate 提供 | Accepted | 2026-01 |
| ADR-DIST-006 | Exit Code 4/5 与通用退出码错开 | Accepted | 2026-01 |
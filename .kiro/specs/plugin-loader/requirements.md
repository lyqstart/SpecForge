# Requirements Document

## Introduction

本 spec 承接 V6 架构概览 spec（`v6-architecture-overview`）中的 **Property 28: Plugin Permission Gate**，实现插件加载器的静态权限检查（P0）与运行时沙箱（P2）能力。

### 背景

在 V6 架构中，SpecForge 作为独立 Daemon 引擎，需要支持第三方插件的安全加载与执行。插件可能来自社区、用户自定义或项目特定需求，必须确保插件不能随意访问系统资源，避免安全风险。

### 范围

- **P0（V6.0 必做）**：静态检查（禁止敏感 API 调用） + 权限声明（`requires` 字段与授权对比）
- **P2（V6.x 做）**：运行时沙箱（子进程隔离 + 资源限额 + 文件系统白名单）

本 spec 的骨架建立"Property 28 有归属"的静态事实，为后续实现提供明确的需求边界。

## Requirements

### Requirement 1: 插件权限声明

**User Story:** 作为插件开发者，我希望在插件清单中声明所需的权限，以便系统在加载时验证授权状态。

#### Acceptance Criteria

1. THE Plugin_Manifest SHALL 包含 `requires` 字段，类型为字符串数组。
2. THE `requires` 字段 SHALL 支持以下权限类型：
   - `filesystem.read`
   - `filesystem.write` 
   - `network`
   - `child_process`
   - `env.read`
3. THE Plugin_Loader SHALL 在加载插件时读取 `requires` 字段，与当前授权集合对比。
4. IF `p.manifest.requires \ grants ≠ ∅`（即存在未被授权的声明），THEN THE Plugin_Loader SHALL 拒绝加载插件 p。

### Requirement 2: 静态代码检查

**User Story:** 作为安全审计者，我希望插件源码在加载时经过静态检查，禁止敏感 API 的直接调用。

#### Acceptance Criteria

1. THE Plugin_Loader SHALL 对插件源码执行静态检查。
2. THE Static_Check SHALL 禁止以下敏感 API 的直接调用：
   - `child_process.exec`（及类似函数）
   - `fs` 模块的越界路径访问（如 `../../` 逃逸）
   - 未声明的网络访问（如 `http.request`、`fetch`）
3. IF 插件源码中存在禁止的敏感 API 调用，THEN THE Plugin_Loader SHALL 拒绝加载。
4. THE Static_Check SHALL 在编译/加载时执行，而非运行时。

### Requirement 3: 插件清单格式

**User Story:** 作为插件使用者，我希望插件有标准的清单格式，包含版本、兼容性、入口点等信息。

#### Acceptance Criteria

1. THE Plugin_Manifest SHALL 包含以下必需字段：
   - `id`: 插件唯一标识符
   - `version`: 语义化版本号
   - `requires`: 权限声明数组
   - `entry`: 插件入口文件路径
2. THE Plugin_Manifest SHALL 包含 `schema_version` 字段，支持未来格式演进。
3. THE Plugin_Manifest SHALL 支持可选字段：
   - `description`: 插件描述
   - `author`: 作者信息
   - `compatible`: 兼容的 SpecForge 版本范围

### Requirement 4: 授权管理

**User Story:** 作为系统管理员，我希望能够管理插件的授权状态，控制哪些权限被允许。

#### Acceptance Criteria

1. THE Authorization_Manager SHALL 维护当前授权集合 `grants`。
2. THE `grants` 集合 SHALL 支持用户级（`~/.specforge/`）和项目级（`<project>/.specforge/`）配置。
3. THE Authorization_Manager SHALL 支持运行时更新授权集合。
4. WHEN 授权集合更新，THE Plugin_Loader SHALL 在下次加载插件时应用新授权。

### Requirement 5: 运行时沙箱（P2）

**User Story:** 作为安全负责人，我希望插件在受限的运行时环境中执行，防止恶意行为。

#### Acceptance Criteria

1. THE Plugin_Sandbox SHALL 在子进程中隔离插件执行。
2. THE Plugin_Sandbox SHALL 实施资源限额：
   - CPU 时间限制
   - 内存使用限制
   - 执行时间限制
3. THE Plugin_Sandbox SHALL 实施文件系统白名单：
   - 仅允许访问指定目录
   - 禁止访问系统关键路径
4. THE Plugin_Sandbox SHALL 监控插件行为，记录异常活动。

### Requirement 6: 错误处理与日志

**User Story:** 作为运维人员，我希望插件加载失败时有清晰的错误信息和日志记录。

#### Acceptance Criteria

1. WHEN Plugin_Loader 拒绝加载插件，THE Error_Message SHALL 明确指示原因：
   - 权限未授权
   - 静态检查失败
   - 清单格式错误
2. THE Plugin_Loader SHALL 记录所有加载尝试（成功/失败）到事件日志。
3. THE Event_Log SHALL 包含插件 ID、加载结果、失败原因（如适用）。

### Requirement 7: 热加载支持

**User Story:** 作为开发者，我希望修改插件后能够热加载，无需重启 Daemon。

#### Acceptance Criteria

1. THE Plugin_Loader SHALL 支持插件热加载。
2. WHEN 插件文件发生变化，THE Plugin_Loader SHALL 在下一次调用时重新加载。
3. THE Hot_Reload SHALL 保持现有插件实例的稳定性，避免运行时中断。

### Requirement 8: 依赖管理

**User Story:** 作为插件开发者，我希望声明插件依赖，确保运行时环境满足要求。

#### Acceptance Criteria

1. THE Plugin_Manifest SHALL 支持 `dependencies` 字段。
2. THE `dependencies` 字段 SHALL 声明：
   - 其他插件依赖
   - 系统库/工具依赖
   - 环境变量要求
3. THE Plugin_Loader SHALL 在加载前验证依赖是否满足。
4. IF 依赖不满足，THEN THE Plugin_Loader SHALL 拒绝加载并提示缺失项。

### Requirement 9: 性能要求

**User Story:** 作为用户，我希望插件加载不影响系统整体性能。

#### Acceptance Criteria

1. THE Plugin_Loader SHALL 在 100ms 内完成静态检查。
2. THE Plugin_Loader SHALL 支持并行加载多个插件。
3. THE Plugin_Sandbox（P2）SHALL 的资源监控开销低于 5% CPU。

### Requirement 10: 向后兼容

**User Story:** 作为长期用户，我希望插件系统保持向后兼容，避免破坏现有插件。

#### Acceptance Criteria

1. THE Plugin_Manifest 的 `schema_version` 字段 SHALL 支持自动迁移。
2. WHEN `code_schema_version > file_schema_version`，THE Migration_Subsystem SHALL 自动运行迁移脚本。
3. THE Plugin_Loader SHALL 对旧版本插件提供兼容层（如适用）。

## 与父 spec 的关联

本 spec 直接实现 **Property 28: Plugin Permission Gate**（来自 `v6-architecture-overview` design.md），具体对应：

- **Property 28 前半部分**：`p.manifest.requires \ grants ≠ ∅` → 拒绝加载（对应 Requirement 1）
- **Property 28 后半部分**：源码中存在禁止的敏感 API 调用 → 拒绝加载（对应 Requirement 2）

本 spec 的 P0 范围（静态检查 + 权限声明）确保 V6.0 满足 Property 28 的要求；P2 范围（运行时沙箱）为未来扩展提供架构预留。

## 质量门槛

1. **静态检查覆盖率**：所有禁止的敏感 API 必须被检测到。
2. **权限验证正确性**：未授权权限必须导致加载拒绝。
3. **错误信息清晰度**：用户必须能理解加载失败原因。
4. **性能基准**：加载时间 < 100ms（静态检查部分）。

## 不做清单

1. **V6.0 内不做**：运行时沙箱（属于 P2）
2. **不做**：自动权限推断（必须显式声明）
3. **不做**：插件签名验证（V6.0 范围外）
4. **不做**：插件市场/分发系统
# 需求文档

## 简介

SpecForge 当前的安装机制依赖平台特定的脚本（`install.ps1`、`install.sh`、`reinstall.ps1`），存在以下问题：

- 无版本追踪 — 无法判断目标项目中安装的是哪个版本
- 无选择性升级 — 重装是全量删除+重新复制，无法只更新变化的文件
- 无独立卸载 — `reinstall.ps1` 将卸载和安装绑定，没有单独的卸载命令
- 无冲突检测 — 如果 OpenCode 或用户自己添加了同名 agent/tool，安装时会静默覆盖
- 平台分裂 — Windows 和 Unix 需要不同的脚本
- 无完整性校验 — 安装后无法验证文件是否完整

本需求定义统一的 install/upgrade/uninstall 命令系统，替代现有脚本，实现版本感知、冲突检测、安全操作的跨平台安装体验。

### 核心约束

**不与 OpenCode 冲突**：SpecForge 安装到 `.opencode/` 目录（OpenCode 的扩展目录），命令必须：
- 不覆盖任何非 SpecForge 文件
- 所有 SpecForge 文件使用 `sf-`（agent/skill）或 `sf_`（tool/plugin）前缀
- 安装前检测命名冲突
- 不修改 OpenCode 自身配置（仅操作 `opencode.json` 中 `sf-` 前缀的 agent 定义）

## 术语表

- **安装器（Installer）**：统一的 SpecForge 命令行入口，编排 install/upgrade/uninstall 操作
- **目标项目（Target_Project）**：用户的项目目录，SpecForge 文件部署到此处
- **源目录（Source_Directory）**：SpecForge 仓库目录，包含规范源文件
- **清单文件（Manifest）**：`specforge/manifest.json`，记录已安装版本、文件清单和校验和
- **SpecForge 文件（SF_File）**：由安装器部署的文件，通过 `sf-`/`sf_` 前缀或清单记录识别
- **用户文件（User_File）**：目标项目中非安装器部署的文件，不在清单中
- **冲突（Conflict）**：SpecForge 文件将覆盖用户文件或 OpenCode 原生文件的情况
- **运行时数据（Runtime_Data）**：SpecForge 运行中生成的可变状态文件，包括 `state.json`、`events.jsonl`、`specs/`、`sessions/`
- **完整性校验（Integrity_Check）**：验证已部署文件与清单中记录的校验和是否一致

## 需求

### REQ-1 统一跨平台入口

**用户故事：** 作为开发者，我希望有一个在 Windows 和 Unix 上都能工作的统一命令，以便不需要在平台特定脚本之间选择。

#### 验收标准

1. THE 安装器 SHALL 提供通过 `bun run sf-install`（或直接 `bun scripts/sf-installer.ts`）调用的单一入口，在 Windows 和 Unix 上行为一致
2. THE 安装器 SHALL 接受 `--target` 参数指定目标项目目录路径
3. WHEN `--target` 参数省略时，THE 安装器 SHALL 使用当前工作目录作为目标项目
4. THE 安装器 SHALL 接受 `install`、`upgrade`、`uninstall`、`verify` 作为第一个位置参数（子命令）
5. WHEN 未提供子命令时，THE 安装器 SHALL 显示用法信息，列出可用子命令和选项

### REQ-2 安装命令

**用户故事：** 作为开发者，我希望用一条命令将 SpecForge 安装到我的项目中，以便无需手动复制文件即可开始使用。

#### 验收标准

1. WHEN 对不包含清单文件的目标项目执行 `install` 子命令时，THE 安装器 SHALL 将所有 SF_File 部署到目标项目
2. WHEN 对已包含清单文件的目标项目执行 `install` 子命令时，THE 安装器 SHALL 中止并提示已安装，建议使用 `upgrade`
3. WHEN 部署文件时，THE 安装器 SHALL 在复制文件前创建所有必需的目录结构
4. WHEN 目标项目已有 `opencode.json` 时，THE 安装器 SHALL 将 SpecForge agent 定义合并到现有文件中，而非覆盖
5. WHEN 目标项目已有 `package.json` 时，THE 安装器 SHALL 将 SpecForge devDependencies 合并到现有文件中，而非覆盖
6. WHEN 安装成功完成时，THE 安装器 SHALL 写入清单文件到 `specforge/manifest.json`，记录已安装版本、时间戳和每个部署文件的 SHA-256 校验和
7. WHEN 安装成功完成时，THE 安装器 SHALL 显示部署文件摘要和后续步骤说明（包括 `bun install`）
8. IF 文件复制因权限问题失败，THEN THE 安装器 SHALL 报告具体文件路径和错误，跳过该文件，继续处理剩余文件
9. WHEN 所有文件部署完成后，THE 安装器 SHALL 执行完整性校验并报告任何不匹配

### REQ-3 OpenCode 冲突检测

**用户故事：** 作为开发者，我希望安装器能检测与 OpenCode 自身 agent/tool 的命名冲突，以便 SpecForge 不会破坏我的 OpenCode 配置。

#### 验收标准

1. WHEN 执行 `install` 或 `upgrade` 子命令时，THE 安装器 SHALL 扫描目标项目的 `.opencode/` 目录中现有的 agent、tool、plugin、skill 文件
2. WHEN `.opencode/` 中的非 SpecForge 文件与待部署的 SF_File 同名时，THE 安装器 SHALL 报告冲突并中止操作
3. THE 安装器 SHALL 通过文件名的 `sf-` 前缀（agent/skill）或 `sf_` 前缀（tool/plugin）识别 SpecForge 文件
4. WHEN 目标项目的 `opencode.json` 包含与 SpecForge agent 同名但非 SpecForge 安装的 agent 定义时，THE 安装器 SHALL 报告冲突并中止
5. WHEN 检测到冲突时，THE 安装器 SHALL 列出所有冲突文件路径并建议解决步骤
6. WHERE 提供了 `--force` 标志时，THE 安装器 SHALL 忽略冲突继续安装，覆盖冲突文件

### REQ-4 版本追踪

**用户故事：** 作为开发者，我希望知道项目中安装的 SpecForge 版本，以便判断是否需要升级。

#### 验收标准

1. THE 清单文件 SHALL 包含来自源目录 `package.json` 的 `version` 字段值
2. THE 清单文件 SHALL 包含 ISO 8601 格式的安装时间戳
3. THE 清单文件 SHALL 包含文件清单，映射每个已部署文件的相对路径到其 SHA-256 校验和
4. WHEN `install` 或 `upgrade` 完成时，THE 安装器 SHALL 用新版本和文件清单更新清单文件
5. THE 安装器 SHALL 提供 `--version` 标志，通过读取目标项目的清单文件显示当前安装的 SpecForge 版本

### REQ-5 升级命令

**用户故事：** 作为开发者，我希望升级 SpecForge 到新版本时保留运行时数据，以便获得新功能而不丢失工作历史。

#### 验收标准

1. WHEN 对包含清单文件的目标项目执行 `upgrade` 子命令时，THE 安装器 SHALL 比较源目录版本与已安装版本
2. WHEN 源目录版本等于已安装版本时，THE 安装器 SHALL 报告已是最新版本并退出，不做任何更改
3. WHEN 升级时，THE 安装器 SHALL 仅部署校验和与清单不同的文件或源目录中新增的文件
4. WHEN 升级时，THE 安装器 SHALL 保留所有运行时数据文件不做修改
5. WHEN 升级时，THE 安装器 SHALL 通过合并而非覆盖来保留用户对 `opencode.json` 和 `package.json` 的修改
6. WHEN 清单中记录的 SF_File 在源目录中已不存在时，THE 安装器 SHALL 从目标项目中删除该文件并更新清单
7. WHEN 对不包含清单文件的目标项目执行 `upgrade` 子命令时，THE 安装器 SHALL 中止并提示未安装，建议使用 `install`
8. WHEN 升级完成时，THE 安装器 SHALL 显示摘要，列出新增、更新和删除的文件

### REQ-6 卸载命令

**用户故事：** 作为开发者，我希望能干净地从项目中移除 SpecForge，以便只保留我自己的文件。

#### 验收标准

1. WHEN 对包含清单文件的目标项目执行 `uninstall` 子命令时，THE 安装器 SHALL 删除清单文件清单中列出的所有文件
2. WHEN 卸载时，THE 安装器 SHALL 从目标项目的 `opencode.json` 中移除 SpecForge agent 定义，不影响其他 agent 定义
3. WHEN 卸载时，THE 安装器 SHALL 从目标项目的 `package.json` 中移除 SpecForge devDependencies，不影响其他依赖
4. WHEN 卸载时，THE 安装器 SHALL 删除仅为 SF_File 创建的空目录
5. THE 安装器 SHALL NOT 在卸载时删除运行时数据文件，除非提供了 `--purge` 标志
6. WHERE 提供了 `--purge` 标志时，THE 安装器 SHALL 删除所有 SpecForge 目录，包括运行时数据
7. WHEN 卸载完成时，THE 安装器 SHALL 删除清单文件本身
8. WHEN 对不包含清单文件的目标项目执行 `uninstall` 子命令时，THE 安装器 SHALL 中止并提示未安装
9. WHEN 卸载完成时，THE 安装器 SHALL 显示已删除文件和目录的摘要

### REQ-7 安全文件操作

**用户故事：** 作为开发者，我希望安装器永远不会破坏我自己的文件，以便我可以信任它在项目中安全操作。

#### 验收标准

1. THE 安装器 SHALL NOT 在 install 或 upgrade 操作中覆盖任何用户文件
2. THE 安装器 SHALL NOT 在 uninstall 操作中删除任何用户文件
3. WHEN 用户文件占据了 SF_File 需要部署的路径时，THE 安装器 SHALL 报告冲突并跳过该文件
4. WHEN 目标项目中的 SF_File 已被用户修改（校验和与清单不同但文件在清单中）时，THE 安装器 SHALL 在升级时提示用户确认后再覆盖
5. WHERE 提供了 `--dry-run` 标志时，THE 安装器 SHALL 显示所有将执行的操作但不执行任何文件系统更改
6. THE 安装器 SHALL 将所有文件操作记录到 stdout，每个操作类型有清晰的标识（创建、更新、删除、跳过）

### REQ-8 依赖管理集成

**用户故事：** 作为开发者，我希望安装器在可能时自动处理依赖安装，以便减少手动的安装后步骤。

#### 验收标准

1. WHEN install 或 upgrade 完成且系统 PATH 中有 `bun` 时，THE 安装器 SHALL 在目标项目目录中执行 `bun install`
2. WHEN install 或 upgrade 完成且系统 PATH 中没有 `bun` 时，THE 安装器 SHALL 显示提示信息指导用户手动运行 `bun install`
3. WHERE 提供了 `--skip-deps` 标志时，THE 安装器 SHALL 跳过自动依赖安装，无论 `bun` 是否可用

### REQ-9 完整性校验

**用户故事：** 作为开发者，我希望能验证 SpecForge 安装是否完整，以便检测损坏或缺失的文件。

#### 验收标准

1. THE 安装器 SHALL 提供 `verify` 子命令，对清单执行完整性校验
2. WHEN 执行 `verify` 子命令时，THE 安装器 SHALL 计算清单中每个文件的 SHA-256 校验和并与记录的校验和比较
3. WHEN 清单中列出的文件在目标项目中缺失时，THE 安装器 SHALL 报告为缺失
4. WHEN 文件的计算校验和与清单校验和不同时，THE 安装器 SHALL 报告为已修改
5. WHEN 所有文件通过完整性校验时，THE 安装器 SHALL 报告安装完整
6. WHEN 发现完整性问题时，THE 安装器 SHALL 建议运行 `upgrade --force` 来恢复文件到预期状态

### REQ-10 OpenCode 配置安全

**用户故事：** 作为开发者，我希望安装器只以明确定义的方式修改 OpenCode 配置，以便我的 OpenCode 环境保持正常工作。

#### 验收标准

1. WHEN 合并到 `opencode.json` 时，THE 安装器 SHALL 仅添加或更新 `agent` 对象中以 `sf-` 开头的条目
2. THE 安装器 SHALL NOT 修改 `opencode.json` 中的 `$schema`、`permission` 或任何非 `sf-` 的 agent 条目
3. WHEN 合并到 `package.json` 时，THE 安装器 SHALL 仅添加或更新 `devDependencies` 中 SpecForge 所需的条目
4. THE 安装器 SHALL NOT 修改目标项目 `package.json` 中 `devDependencies` 以外的 `name`、`version`、`scripts`、`dependencies` 等字段
5. WHEN 目标项目的 `opencode.json` 的 `permission` 字段设置为非 `"allow"` 的值时，THE 安装器 SHALL 保留该值不变
6. IF `opencode.json` 文件无法解析为有效 JSON，THEN THE 安装器 SHALL 中止操作并报告解析错误，而非覆盖该文件

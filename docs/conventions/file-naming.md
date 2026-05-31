# 命名约定

> 本文档定义 SpecForge 项目中的文件命名规范。

## 目录名

### 项目目录

| 名称 | 说明 |
|------|------|
| `.specforge/` | 项目级 SpecForge 数据目录（SPEC_DIR_NAME 常量） |
| `.specforge/specs/` | Work Item 规格目录 |
| `.specforge/config/` | 项目配置目录 |
| `.specforge/knowledge/` | 知识图谱目录 |
| `.specforge/runtime/` | 运行时状态目录（gitignored） |
| `.specforge/archive/` | Agent Run 归档目录（gitignored） |
| `.specforge/sessions/` | 会话归档目录（gitignored） |
| `.specforge/cas/` | 内容寻址存储（gitignored） |
| `.specforge/logs/` | 日志目录（gitignored） |

### 用户级目录

| 名称 | 说明 |
|------|------|
| `~/.specforge/` | 用户级 SpecForge 数据目录 |

## Work Item ID 命名

**格式：** `WI-<digits>`

- 前缀 `WI-`（大写）
- 数字部分使用零填充的 3 位数（如 `WI-001`、`WI-010`、`WI-100`）
- 对应 `.specforge/specs/<WI-ID>/` 目录

**示例：**
```
.specforge/specs/WI-002/    ← Daemon 架构重设计调查
.specforge/specs/WI-010/    ← 目录结构治理 P0
.specforge/specs/WI-011/    ← 目录结构治理 P1
```

## Spec 文件命名

每个 Work Item 目录下的标准文件：

| 文件名 | 说明 | 生成阶段 |
|--------|------|---------|
| `_meta.json` | 元数据文件（WorkItemMeta） | 创建 WI 时 |
| `intake.md` | 需求/问题描述 | intake |
| `requirements.md` | 结构化需求文档 | requirements |
| `bugfix.md` | 缺陷分析文档 | bugfix_analysis |
| `design.md` | 设计文档 | design / fix_design |
| `design_delta.md` | 增量设计文档 | design_delta（change_request） |
| `refactor_analysis.md` | 重构分析文档 | refactor_analysis |
| `refactor_plan.md` | 重构计划文档 | refactor_plan |
| `investigation_plan.md` | 调查计划文档 | investigation_plan |
| `findings_report.md` | 调查报告 | findings_report |
| `impact_analysis.md` | 影响分析文档 | impact_analysis（change_request） |
| `ops_plan.md` | 运维计划文档 | ops_plan（ops_task） |
| `tasks.md` | 任务列表 | tasks / quick_tasks |
| `review_report.md` | 审查报告 | review |
| `verification_report.md` | 验证报告 | verification |

## Agent Run 归档命名

**格式：** `<WI-ID>-<agentType>-<序号>`

- `WI-ID`：Work Item ID
- `agentType`：Agent 类型名（如 `sf-executor`、`sf-verifier`）
- `序号`：从 1 开始递增的全局序号

**存储位置：** `.specforge/archive/agent_runs/<run_id>/`

**示例：**
```
.specforge/archive/agent_runs/WI-010-sf-executor-1/
.specforge/archive/agent_runs/WI-010-sf-executor-2/
.specforge/archive/agent_runs/WI-010-sf-verifier-1/
.specforge/archive/agent_runs/WI-011-sf-executor-1/
```

## `_meta.json` 命名约定

- 文件名固定为 `_meta.json`（前导下划线）
- 位于 Work Item 目录的根层级（如 `.specforge/specs/WI-010/_meta.json`）
- 编码：UTF-8
- 格式：标准 JSON（2 空格缩进）
- 字段规范详见 [meta-json-spec.md](meta-json-spec.md)

## 配置文件命名

| 文件名 | 说明 |
|--------|------|
| `manifest.json` | 项目清单文件 |
| `project-rules.md` | 项目规则 |
| `prod-environment.md` | 生产环境配置 |
| `project.json` | 项目配置 |
| `risk_policy.json` | 风险策略 |
| `skill_fragments.json` | Skill Fragment 配置 |

> **注意**：开发环境配置已从项目级 `dev-environment.md` 迁移至用户级
> `~/.specforge/host-profile.json`，由 `sf_project_init` 工具在启动时自动扫描生成。

## 日志文件命名

| 文件名 | 说明 |
|--------|------|
| `telemetry.jsonl` | 遥测日志 |
| `trace.jsonl` | 追踪日志 |
| `tool_calls.jsonl` | 工具调用日志 |
| `cost.jsonl` | 成本日志 |
| `conversations.jsonl` | 会话日志 |
| `wal.jsonl` | 写前日志 |

## 命名原则

1. **全小写 + 连字符**：文件名使用小写字母和连字符（如 `findings-report.md` → `findings_report.md` 以下划线为主，视已有约定）
2. **Spec 文件以下划线开头**：`_meta.json` 使用前导下划线标识元数据文件
3. **日志文件使用 `.jsonl` 扩展名**：JSON Lines 格式的日志统一使用 `.jsonl`
4. **Spec 文档使用 `.md` 扩展名**：所有阶段产物文档使用 Markdown 格式

## 相关文档

- [目录布局](directory-layout.md) — 完整路径常量定义
- [Work Item 生命周期](wi-lifecycle.md) — 各阶段产物文件的生成时机
- [_meta.json 字段规范](meta-json-spec.md) — 元数据文件详细规范

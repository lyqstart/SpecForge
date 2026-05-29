# `_meta.json` 字段规范

> 本文档定义 Work Item 目录下 `_meta.json` 文件的字段规范。
> 权威 Schema 源码：`packages/types/src/meta-schema.ts`（zod schema）。

## 概述

每个 Work Item 的 `.specforge/specs/<WI-ID>/_meta.json` 文件记录该工作项的元数据，
是 SpecForge V6 架构中"Schema 层"的核心交付物之一。

该文件通过 `WorkItemMetaSchema`（zod schema）在运行期校验，并通过 `WorkItemMeta`（TypeScript 类型）
在编译期同步，实现"运行期校验 + 编译期类型"双重防线。

## 字段定义

| 字段名 | 类型 | 必填/可选 | 说明 | 示例 |
|--------|------|----------|------|------|
| `id` | `string` | **必填** | Work Item ID，必须匹配 `WI-<digits>` 模式 | `"WI-010"` |
| `workflow_type` | `enum` | **必填** | 8 类工作流之一（见下表） | `"feature_spec"` |
| `title` | `string` | **必填** | Work Item 标题，非空字符串 | `"SpecForge V6 目录结构治理 P0"` |
| `summary` | `string` | **必填** | 摘要，≤ 500 字符 | `"建立单一真相源 Schema..."` |
| `key_decisions` | `string[]` | **必填** | 关键决策列表，可为空数组 | `["采用方案 A", "SPEC_DIR_NAME = '.specforge'"]` |
| `current_stage` | `enum` | **必填** | 当前所处阶段（见下表） | `"development"` |
| `created_at` | `string` | **必填** | ISO 8601 datetime 字符串 | `"2026-05-29T08:30:00Z"` |
| `completed_at` | `string` | **可选** | 完成时间，ISO 8601 datetime | `"2026-05-29T16:00:00Z"` |
| `related_modules` | `string[]` | **可选** | 相关模块路径列表 | `["packages/types", "packages/daemon-core"]` |
| `upstream_wis` | `string[]` | **可选** | 上游 Work Item ID 列表（被依赖的 WI） | `["WI-002", "WI-003"]` |
| `downstream_wis` | `string[]` | **可选** | 下游 Work Item ID 列表（依赖本 WI 的 WI） | `["WI-011"]` |

## 枚举值参考

### workflow_type 合法值

| 值 | 说明 |
|----|------|
| `feature_spec` | 标准需求驱动工作流 |
| `bugfix_spec` | 缺陷修复工作流 |
| `refactor` | 重构工作流 |
| `investigation` | 调查工作流 |
| `change_request` | 变更请求工作流 |
| `ops_task` | 运维任务工作流 |
| `quick_change` | 轻量变更工作流 |
| `feature_spec_design_first` | 设计优先工作流 |

### current_stage 合法值

| 值 | 适用工作流 | 说明 |
|----|-----------|------|
| `intake` | 所有 | 初始阶段 |
| `requirements` | feature_spec | 需求分析 |
| `design` | feature_spec, design_first | 架构设计 |
| `tasks` | 多种 | 任务拆分 |
| `development` | 多种 | 开发执行 |
| `review` | feature_spec, design_first, change_request, refactor(高风险) | 代码审查 |
| `verification` | 多种 | 验证确认 |
| `completed` | 所有 | 已完成 |
| `blocked` | 所有 | 阻塞状态 |
| `bugfix_analysis` | bugfix_spec | 缺陷分析 |
| `refactor_analysis` | refactor | 重构分析 |
| `refactor_plan` | refactor | 重构计划 |
| `refactor_analysis_gate` | refactor | 重构分析 Gate |
| `refactor_plan_gate` | refactor | 重构计划 Gate |
| `verification_gate` | 多种 | 验证 Gate |

## 完整示例

```json
{
  "id": "WI-010",
  "workflow_type": "refactor",
  "title": "SpecForge V6 目录结构治理 P0",
  "summary": "建立单一真相源 Schema（directory-layout.ts + meta-schema.ts），引入路径构造函数，创建迁移/备份脚本，记录 ADR-006 决策。风险路径 low，development 直跳 verification。",
  "key_decisions": [
    "采用方案 A（Schema 层 + 工具层 + 代码层 三层架构）",
    "SPEC_DIR_NAME = '.specforge'（带点），与 .git/ 风格一致",
    "LAYOUT 字典使用 as const 声明，编译期防御路径拼写错误"
  ],
  "current_stage": "completed",
  "created_at": "2026-05-29T00:00:00Z",
  "completed_at": "2026-05-29T00:00:00Z",
  "related_modules": ["packages/types"],
  "upstream_wis": ["WI-002"],
  "downstream_wis": ["WI-011"]
}
```

## 校验方式

### 运行期校验（zod）

```typescript
import { WorkItemMetaSchema, type WorkItemMeta } from '@specforge/types';

const raw = JSON.parse(fs.readFileSync('.specforge/specs/WI-010/_meta.json', 'utf-8'));
const meta: WorkItemMeta = WorkItemMetaSchema.parse(raw);
```

### 非抛错校验

```typescript
const result = WorkItemMetaSchema.safeParse(raw);
if (!result.success) {
  console.error(result.error.issues);
}
```

## 关联文档

- [Work Item 生命周期](wi-lifecycle.md) — `_meta.json` 在各阶段的更新时机
- [工作流详解](workflow-types.md) — workflow_type 各值对应的阶段流
- [术语表](glossary.md) — 相关术语定义

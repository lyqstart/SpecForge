# Intake: SpecForge V6 一次性切换方案

## 变更请求描述

根据项目评审专家对 SpecForge V5 系统的审计，发现 23 项问题，合并为 7 个 Epic，制定 V6 一次性切换方案。目标：交付 SpecForge V6.0 = 独立 Daemon + Thin Plugin + 数据驱动 workflow，一次性替换现在的 .opencode 内嵌实现。

## 业务背景与动机

SpecForge V5 存在以下核心架构问题：
- 状态管理分散：工具直接读写 specforge/ 目录文件，无 Single Source of Truth
- 事件系统不完整：parse error 频发、字段丢失、agent 身份无法识别
- 权限控制缺陷：PermissionGuard 无法正确识别调用者（agent=unknown）
- 硬编码工作流：state_machine.ts 包含 8 张硬编码表，无法扩展
- Skill 加载不可靠：依赖 LLM 自觉加载，无程序化保证
- Agent 触发手动化：重试/知识提取依赖自然语言指令

## 变更范围概要

### 7 个 Epic

| Epic | 名称 | 核心内容 |
|------|------|---------|
| E1 | Daemon Core 基石 | 独立 Daemon 进程、HTTP/SSE API、WAL 状态管理、Recovery、Multi-project、CAS |
| E2 | Observability 子系统 | 统一 Event schema、三级模式、Conversation 重写、agent 注入、sf-analyst |
| E3 | Permission Engine + Scope Gate | 三层规则合并器、决策事件、Tool/File/Agent 边界控制 |
| E4 | Workflow Runtime（数据驱动） | JSON workflow 定义、WorkflowEngine、GateRunner、Markdown auto-generated |
| E5 | Skill Loader 强制化 | Skill Registry、Phase-enter 强制加载、按 phase 自动注入 |
| E6 | Agent Roster 自动化触发 | 重试计数硬执行、completed 后置触发（sf-knowledge）|
| E7 | Adapter & Thin Plugin Cutover | OpenCodeAdapter、新 Thin Plugin (<5KB)、删除老代码、CLI |

### 依赖顺序
```
E1 → E2/E3/E4（并行）→ E5 → E6 → E7 → V6.0 发版
```

### 主要代码变更

**完全删除：**
- `.opencode/tools/lib/sf_specforge_plugin_entry.ts`（102 KB）
- `.opencode/tools/lib/sf_state_transition_core.ts`
- `.opencode/tools/lib/sf_state_read_core.ts`
- `.opencode/tools/lib/state_machine.ts`
- `.opencode/tools/lib/sf_conversation_recorder_core.ts`
- `.opencode/tools/lib/utils.ts` 中的 appendJsonl/recordGateResult
- 所有 sf_*_core.ts 中直接读写 specforge/ 目录的实现

**重写：**
- 19 个 `tools/sf_*.ts` 改为 HTTP 客户端壳
- 新 Thin Plugin（<5KB）
- 9 个 agent.md（阶段表改为 auto-generated）
- 8 个 workflow SKILL.md（阶段表改为 auto-generated）

**新增：**
- `~/.config/specforge/workflows/builtin/*.json`（8 个 workflow 定义）
- `scripts/render-workflow-docs.ts`（markdown 自动生成）
- `packages/workflow-runtime/src/WorkflowEngine.ts`
- `packages/daemon-core/src/` 完整 daemon 实现
- 项目级目录从 `specforge/` 改为 `.specforge/`（带点）

## 期望结果

- V6.0 完整实现，一次性替换 V5
- 无兼容代码，无数据迁移
- 所有 23 项审计问题解决
- 预计 14 周（3.5 个月），4 个里程碑

## 里程碑

| 里程碑 | Epic | 时间 | 退出标志 |
|--------|------|------|---------|
| M1 基石 | E1 | T+4w | Daemon 能跑、HTTP API 可用 |
| M2 三向并行 | E2+E3+E4 | T+9w | 事件/权限/workflow 全到位 |
| M3 自动化收尾 | E5+E6 | T+11w | Skill 强制 + Agent 自动触发 |
| M4 切换发版 | E7 | T+14w | 旧代码删除、新 Plugin 替换 |

## 受影响模块

- 14 个 packages（daemon-core, workflow-runtime, observability, permission-engine, scope-gate, opencode-adapter, plugin-loader, cli, self-healing, multimodal, types, configuration, migration, version-unification）
- 9 个 agent 定义文件
- 16 个 skill 文件
- 19 个 custom tool 文件
- 所有 V5 运行时数据（22 个 WI 全部废弃）

## 用户选择：先做全量设计

用户选择方案 C：先把 7 个 Epic 的实现规格全部细化为完整设计文档，再逐步开发。

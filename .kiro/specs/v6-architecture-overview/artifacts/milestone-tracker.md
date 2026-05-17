# V6.0 里程碑跟踪模板

## 概述

本文档跟踪 SpecForge V6.0 的 9 个里程碑（M1–M9）的进展。每个里程碑包含主题、覆盖的 P0 项编号、完成判据，并预留里程碑报告输出锚点。

**数据来源**：
- 里程碑主题：REQ-29.1
- P0 项分组：REQ-25.1
- 完成判据：基于各里程碑主题与 P0 项推导
- 里程碑报告锚点：REQ-29.2

## 里程碑定义

### M1: Daemon 骨架
**主题**: Daemon 骨架

**覆盖的 P0 项**:
- 基础设施组: Daemon、通信、Recovery
- 核心能力组: Thin Plugin
- 可观测性基础组: 基础日志
- 分发组: `schema_version` + 迁移框架

**完成判据**:
1. Daemon 进程可启动、监听动态端口、写入握手文件
2. HTTP/1.1 + SSE 通信协议基础实现
3. Thin Plugin 可上报事件并按需拉起 Daemon
4. 基础日志系统（events.jsonl 骨架）
5. `schema_version` 字段定义与迁移框架接口

**里程碑报告锚点**: <!-- M1_REPORT -->

---

### M2: 身份与权限
**主题**: 身份与权限（Session Registry + Permission Engine）

**覆盖的 P0 项**:
- 基础设施组: Session Registry、Permission、Adapter
- 核心能力组: 10 Agent（身份绑定部分）
- 可观测性基础组: Event Bus（基础）

**完成判据**:
1. Session Registry 实现预登记 + 首次接触绑定策略
2. AgentIdentity 结构体与三类记录（pending/active/history）
3. Permission Engine 三层权限模型（硬规则写死代码）
4. OpenCodeAdapter 基础接口实现
5. Event Bus 基础通信机制

**里程碑报告锚点**: <!-- M2_REPORT -->

---

### M3: 可观测性基础
**主题**: 可观测性基础（Event Bus + CAS + 三级模式 + 基础日志）

**覆盖的 P0 项**:
- 基础设施组: 通信（CAS 部分）
- 可观测性基础组: Event Bus、CAS、三级模式、基础日志、sf-analyst
- 扩展机制骨架组: Tool 注册（可观测性相关）

**完成判据**:
1. Event Bus 完整实现，支持跨层通信
2. CAS（内容寻址存储）基础实现，blob 引用机制
3. 三级模式（minimal/standard/deep）配置与事件过滤
4. 基础日志系统完整，支持 events.jsonl WAL 语义
5. sf-analyst Agent 骨架，可读 observability 数据

**里程碑报告锚点**: <!-- M3_REPORT -->

---

### M4: 核心工作流
**主题**: 核心工作流（10 Agent + feature_spec + 4 Gate + Thin Plugin）

**覆盖的 P0 项**:
- 核心能力组: 10 Agent、Feature Spec workflow、4 Gate、Thin Plugin、state.json、events.jsonl
- 扩展机制骨架组: 内置 Workflow、Skill 加载

**完成判据**:
1. 10 个内置 Agent 全部实现（sf-orchestrator、sf-requirements、sf-design、sf-task-planner、sf-executor、sf-debugger、sf-reviewer、sf-verifier、sf-knowledge、sf-analyst）
2. feature_spec workflow 端到端可执行
3. 4 个基础 Gate（requirements、design、tasks、verification）实现
4. Thin Plugin 完整功能（事件上报、Daemon 拉起、session 绑定）
5. state.json 派生检查点机制
6. Skill 加载器基础实现

**里程碑报告锚点**: <!-- M4_REPORT -->

---

### M5: 分析能力
**主题**: 分析能力（sf-analyst + 基础 observability 查询）

**覆盖的 P0 项**:
- 可观测性基础组: sf-analyst（完整实现）
- 核心能力组: 10 Agent（sf-analyst 完整能力）

**完成判据**:
1. sf-analyst Agent 完整实现，可生成结构化分析结果
2. 基础 observability 查询接口（按 project、work item、时间范围过滤）
3. 分析结果格式化输出（文本 + 结构化 JSON）
4. sf-debugger 与 sf-analyst 协作机制
5. 用户可调度 sf-analyst 进行手动分析

**里程碑报告锚点**: <!-- M5_REPORT -->

---

### M6: 崩溃恢复
**主题**: 崩溃恢复（WAL + 重连 + 一致性修复）

**覆盖的 P0 项**:
- 基础设施组: Recovery、Multi-project
- 核心能力组: state.json、events.jsonl（恢复语义）

**完成判据**:
1. WAL 语义完整实现：先 events.jsonl fsync → 再 state.json 更新
2. 崩溃后从 events.jsonl 重建状态
3. state.json 与 events.jsonl 不一致检测与修复规则
4. OpenCode session 重连机制（启动时一次性）
5. Multi-project 管理器与 per-project 写锁
6. 10 次随机 kill 测试 0 数据丢失（REQ-27 门槛 3）

**里程碑报告锚点**: <!-- M6_REPORT -->

---

### M7: 分发与迁移
**主题**: 分发与迁移（npm 包 + 安装向导 + schema_version 框架）

**覆盖的 P0 项**:
- 分发组: npm 包、安装向导、`schema_version` + 迁移框架
- 基础设施组: Config（安装配置部分）

**完成判据**:
1. npm 包打包与发布流程
2. 安装向导（CLI 首次使用体验）
3. `schema_version` 框架完整实现（自动迁移 + 拒绝降级）
4. 迁移脚本目录结构（`~/.specforge/migrations/`）
5. 文件备份机制（`~/.specforge/backups/<timestamp>/`）
6. 配置四层合并在安装过程中的应用

**里程碑报告锚点**: <!-- M7_REPORT -->

---

### M8: Telegram 集成
**主题**: Telegram 集成（CLI `--json` + webhook + OpenClaw 端到端）

**覆盖的 P0 项**:
- 基础设施组: 通信（webhook 部分）
- 核心能力组: CLI 双模式
- 分发组: 安装向导（OpenClaw 集成说明）

**完成判据**:
1. CLI `--json` 模式完整实现（所有命令支持）
2. Webhook 派发器（`specforge webhook register`）
3. OpenClaw 端到端集成测试通过
4. 远程访问安全层（API Key + IP 白名单 + 二步确认）
5. 用户绑定机制（OpenClaw 请求 → SpecForge 用户身份）
6. Telegram 集成作为 V6.0 质量门槛通过（REQ-27 门槛 4）

**里程碑报告锚点**: <!-- M8_REPORT -->

---

### M9: 北极星验证
**主题**: 北极星验证（10 类场景 5 分钟定位根因）

**覆盖的 P0 项**:
- 可观测性基础组: 全部（用于根因定位）
- 核心能力组: sf-analyst、sf-debugger
- 基础设施组: 全部（作为被观测系统）

**完成判据**:
1. 10 类排障场景全部可复现
2. 每类场景可在 5 分钟内通过 observability 数据定位根因
3. sf-analyst 可自动生成根因分析报告
4. 北极星验证作为 V6.0 质量门槛通过（REQ-27 门槛 2）
5. 可观测性三级模式均支持 5 分钟定位目标

**里程碑报告锚点**: <!-- M9_REPORT -->

## P0 项与里程碑映射表

| P0 项分组 | 包含项 | 覆盖里程碑 |
|-----------|--------|------------|
| **基础设施** (10项) | Daemon | M1 |
| | 通信 | M1, M3, M8 |
| | Session Registry | M2 |
| | Permission | M2 |
| | Adapter | M2 |
| | Config | M7 |
| | Directory | M1 |
| | CLI | M8 |
| | Recovery | M1, M6 |
| | Multi-project | M6 |
| **核心能力** (6项) | 10 Agent | M2, M4, M5 |
| | Feature Spec workflow | M4 |
| | 4 Gate | M4 |
| | state.json | M4, M6 |
| | events.jsonl | M1, M4, M6 |
| | Thin Plugin | M1, M4 |
| **可观测性基础** (5项) | Event Bus | M2, M3 |
| | CAS | M3 |
| | 三级模式 | M3 |
| | 基础日志 | M1, M3 |
| | sf-analyst | M3, M5, M9 |
| **扩展机制骨架** (3项) | Skill 加载 | M4 |
| | Tool 注册 | M3 |
| | 内置 Workflow | M4 |
| **分发** (3项) | npm 包 | M7 |
| | 安装向导 | M7 |
| | `schema_version` + 迁移框架 | M1, M7 |

## 使用说明

1. **里程碑进展跟踪**：每个里程碑完成后，在对应的锚点位置插入里程碑报告
2. **报告格式**：每个里程碑报告应包含：
   - 完成日期
   - 实际覆盖的 P0 项（与计划对比）
   - 完成判据验证结果
   - 遇到的问题与解决方案
   - 下一步计划
3. **P0 ���验证**：通过本表可追踪每个 P0 项在哪个里程碑交付
4. **质量门槛关联**：M8 和 M9 直接对应 REQ-27 的质量门槛 4 和 2

## 更新记录

- **创建日期**: [当前日期]
- **创建依据**: REQ-29.1, REQ-29.2, REQ-25.1
- **维护责任**: 项目管理者
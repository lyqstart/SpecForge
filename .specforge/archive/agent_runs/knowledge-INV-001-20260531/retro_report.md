# Knowledge Extraction Retro Report

> Work Item: INV-001
> Workflow Type: investigation
> Date: 2026-05-31
> Agent: sf-knowledge

---

## 1. 执行摘要

从调查 INV-001（events.jsonl / state.json 并发写入一致性调查）的发现报告中提取了 **6 条通用知识条目**，全部以 `candidate` 状态写入全局知识库。这些条目抽象了跨项目可复用的并发写入、类型安全和生命周期管理反模式。

---

## 2. Phase 执行记录

### Phase 1: 证据盘点

**数据源**：
- `.specforge/specs/INV-001/findings_report.md`（614 行完整调查报告）
- 加载了 `superpowers-engineering-lessons` Skill（注入 5 条已有经验做交叉参考）

**证据清单**：从调查报告中提取了 6 条关键发现（C1–C5, M2），每条有代码行号、调用链、Mermaid 图和并发时序分析作为证据支撑。

### Phase 2: 关键事件识别

| 编号 | 事件 | 严重度 | 根因类别 |
|------|------|--------|----------|
| C1 | events.jsonl WAL/EventLogger 双路径写入竞态 | Critical | 并发控制 |
| C2 | state.json StateManager/EventLogger/RecoverySubsystem 三重覆写 | Critical | 并发控制 |
| C3 | RecoverySubsystem 使用嵌套路径写入错误位置 | Critical | 路径解析 |
| C4 | daemon-core/observability Event 接口不兼容 + `as unknown as` | Critical | 类型安全 |
| C5 | EventLogger.initialize() 从未被调用 | Critical | 生命周期 |
| M2 | EventBus persistenceHook + WAL 双重写入 | High | 事件系统 |

### Phase 3: 根因分析

每条发现的根因提炼为通用原理：

| 条目 | 通用原理 |
|------|----------|
| C1 → KE-405 | 多文件句柄并发写入无协调 → Single Writer 原则 |
| C2 → KE-486 | 全量覆写 + 无版本控制 → Last-Write-Wins 静默丢失 |
| C3 → KE-604 | 路径解析方法选择错误 → 参数语义模糊 + 无运行时断言 |
| C4 → KE-626 | 跨包接口独立演化 + 强制类型转换 → 缺少适配器层 |
| C5 → KE-193 | 启动流程遗漏初始化调用 → 无状态守卫 |
| M2 → KE-063 | 两条独立持久化路径 → "publish and also write" 反模式 |

### Phase 4: 泛化 + 边界检查

每条知识条目均：
- 提取了通用反模式和修复模式
- 定义了适用边界（applicable_file_patterns, applicability）
- 定义了不适用条件（anti_conditions）
- 从 SpecForge 特定实现抽象为语言/框架无关的工程原则

**交叉参考**：与 `superpowers-engineering-lessons` Skill 中的现有经验无冲突：
- KE-405（并发写入）与 `async-resource-lifecycle.md` A1（败者清理）互补
- KE-193（缺失初始化）与 `javascript-explicit-resource-management.md` P1（构造器无副作用）互补

### Phase 5: 知识条目生成

6 条条目全部写入全局知识库。

### Phase 6: 质量自检

| 检查项 | 结果 |
|--------|------|
| 非重复（check_duplicate） | ✅ 通过 |
| 可搜索（search 返回全部 6 条） | ✅ 通过 |
| 分类完整（5 个 category） | ✅ 通过 |
| 标签充分（≥5 tags/条） | ✅ 通过 |
| 边界条件定义 | ✅ 全部有 anti_conditions |
| status=candidate, confidence=medium | ✅ 符合 investigation 规则 |
| quality_check | ✅ 无冲突/过期/未确认 candidate |

---

## 3. 知识条目清单

| Entry ID | 标题 | 分类 | 标签数 | 映射发现 |
|----------|------|------|--------|----------|
| KE-1780203563389-405 | 多路径并发写入同一文件导致竞态条件和数据丢失 | concurrency | 10 | C1 |
| KE-1780203572719-486 | 多个组件全量覆写同一 JSON 状态文件导致静默数据丢失 | concurrency | 9 | C2 |
| KE-1780203582267-604 | 路径解析层叠：全局路径与项目路径混用 | file-io | 8 | C3 |
| KE-1780203593086-626 | 跨包接口不兼容：使用 `as unknown as` 绕过类型检查 | type-safety | 9 | C4 |
| KE-1780203602947-193 | 组件初始化方法未在启动流程中调用 | lifecycle | 10 | C5 |
| KE-1780203612803-063 | 事件总线持久化钩子与 WAL 重复写入 | event-systems | 8 | M2 |

---

## 4. 知识分类统计

| 分类 | 条目数 | 说明 |
|------|--------|------|
| concurrency | 2 | 竞态条件和 Last-Write-Wins |
| file-io | 1 | 路径解析层叠 |
| type-safety | 1 | 跨包类型不兼容 |
| lifecycle | 1 | 初始化遗漏 |
| event-systems | 1 | 重复写入反模式 |

---

## 5. 项目特定知识（未入通用库）

以下发现标记为 SpecForge 项目特定，未提取为通用知识：
- `sf_state_transition` 工具处理器按需创建项目级文件（Q5 结论 — 设计预期，非缺陷）
- Commit `307f873` 的 fsync 异步化改造细节（Q6 — 项目特定历史）
- WAL rotation 的 5MB 阈值（配置细节）
- Daemon 构造函数中 `isDaemonGlobal=true` 的参数传递（项目特定 API）

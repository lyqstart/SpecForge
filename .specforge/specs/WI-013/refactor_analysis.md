# Refactor Analysis — WI-013

**work_item_id**: WI-013
**workflow_type**: refactor
**upstream**: WI-012（P2 防线建设，已完成验证）、WI-011（P1 代码全量切换）
**关联文档**: `docs/audit/2026-05-29-directory-governance-final-audit.md` #1~#8

---

## 代码问题识别

### R1：constants.ts 配置目录常量补点 — **已确认存在**

**文件**: `packages/configuration/src/constants.ts`

**现状**:
- 第 70 行: `project: 'specforge/config'` — 裸路径（无点前缀）
- 该文件仅导入 `ConfigLayerType`（来自 `./types`），**未导入** `SPEC_DIR_NAME`
- `CONFIG_DIRS` 对象定义了两个配置目录路径：
  - `user: '~/.specforge/config'` ✅ 正确（用户级路径）
  - `project: 'specforge/config'` ❌ 缺少点前缀，应为 `.specforge/config`

**影响范围**: 此常量被 `packages/configuration` 包内部使用。如果下游代码直接读取此值构造路径，会在项目根创建 `specforge/config/` 目录（无点）。

**风险**: 低 — 仅影响配置目录常量定义，下游使用范围有限。

---

### R2：fs-path-rules.ts 允许目录补点 — **已确认存在**

**文件**: `packages/plugin-loader/src/static-checker/fs-path-rules.ts`

**现状**:
- 第 818 行: `allowedDirs: ['~/.specforge/config', 'specforge/config']`
  - 第一项 `'~/.specforge/config'` ✅ 正确（用户主目录下）
  - 第二项 `'specforge/config'` ❌ 缺少点前缀
- 该文件头部（第 21 行）仅 `import path from 'path'`，**未导入** `SPEC_DIR_NAME` 或 `LAYOUT`
- 此白名单项 ID 为 `'config-dir'`，允许插件读取配置目录

**影响范围**: 插件文件系统访问白名单。裸路径意味着插件请求访问 `specforge/config` 时会被允许（匹配无点路径），但如果插件请求 `.specforge/config` 则不一定匹配。

**风险**: 低 — 白名单匹配，不影响目录创建逻辑。但语义不一致可能导致安全策略的"允许路径"与实际路径不同步。

---

### R3：sf-knowledge.md 路径补点 — **已确认存在**

**文件**: `setup/userlevel-opencode/agents/sf-knowledge.md`

**现状**:
- 第 78 行: `"retro_report_path": "specforge/archive/agent_runs/<run_id>/retro_report.md"` — 裸路径
- 第 90 行: `".specforge/archive/agent_runs/{run_id}/"` ✅ 此处使用了带点路径（正确）
- 同一文档中路径风格不一致：第 87-93 行数据源列表全部使用 `.specforge/`（带点），但第 78 行 JSON 示例中使用了 `specforge/`（无点）

**影响范围**: Agent markdown 文档中的示例 JSON。Agent 读取此文档后可能在报告输出中生成裸路径字符串。

**风险**: 低 — 文档/示例文本，不直接影响文件系统。但会导致 Agent 输出不一致的路径格式。

---

### R4：sf-orchestrator.md 路径补点 — **已确认存在**

**文件**: `setup/userlevel-opencode/agents/sf-orchestrator.md`

**现状**:
- 第 82 行: `specforge/runtime/checkpoints/*.recovery.md` — 裸路径（在代码块中）
- 该代码块描述了会话恢复流程的第一步"读取最新 checkpoint recovery 文件"

**影响范围**: Agent markdown 文档中的路径引用。Orchestrator 读取此描述后，如果按此路径去查找文件，会找不到实际的 `.specforge/runtime/checkpoints/` 目录。

**风险**: 低 — 文档级别，但可能导致 Orchestrator 会话恢复失败。

---

### R5：observability 写入者根因定位 — **根因已修复，残留待清理**

这是本 WI 最关键也最复杂的一项。经过完整代码追踪，结论如下：

#### 调用链追踪

1. **EventLogger 构造函数**（`packages/observability/src/event-logger/index.ts` 第 77 行）:
   - `constructor(basePath: string = './data/observability')`
   - 默认值是硬编码的 `'./data/observability'`，不是 `specforge/observability`
   - **不使用任何 LAYOUT 常量**

2. **Daemon.ts 中的实例化**（第 95 行）:
   - `this.eventLogger = new EventLogger(runtimeDir)`
   - `runtimeDir` = `this.config.getRuntimeDir()` = `this.pathResolver.resolveDaemonRuntimeDir()`
   - PersonalPathResolver: `resolveDaemonRuntimeDir()` → `resolveUserPath('runtime')` → `path.join(os.homedir(), '.specforge', 'runtime')` → `~/.specforge/runtime`
   - **Daemon 中 EventLogger 写入 `~/.specforge/runtime/events.jsonl`，不是 `specforge/observability/events.jsonl`** ✅

3. **permission-engine 中的历史路径**（WI-11 已修复）:
   - WI-11 的决策 D2 将 4 个文件中的 `'./specforge/observability/events.jsonl'` 替换为 `'./' + SPEC_DIR_NAME + '/logs/telemetry.jsonl'`
   - 当前代码确认已全部切换：`index.ts` L81/L307、`static-api-checker.ts` L395、`plugin-permission-validator.ts` L96、`plugin-loader-integration.ts` L165
   - **permission-engine 中不再有任何 `specforge/observability` 硬编码** ✅

4. **LAYOUT 字典分析**（`packages/types/src/directory-layout.ts`）:
   - **没有 `observability` 键** — 这是 WI-11 D2 的设计决策：用 `LAYOUT.logsTelemetry`（= `'logs/telemetry.jsonl'`）替代
   - `EventLogger` 默认 basePath `'./data/observability'` 是独立于 LAYOUT 的历史路径

#### 磁盘残留现状

磁盘上 **`specforge/`**（无点）目录确认存在，包含：
| 路径 | mtime | 大小 |
|------|-------|------|
| `specforge/knowledge/graph.json` | 2026/5/29 9:32:39 | 52 bytes |
| `specforge/observability/events.jsonl` | 2026/5/29 5:32:33~8:38:02 | 2560 bytes |

**根因判断**:
- permission-engine 的硬编码路径已被 WI-11 修复，**当前无活跃代码在写 `specforge/observability/`**
- `specforge/knowledge/graph.json` 的写入者可能是 `sf_knowledge_graph` MCP 工具在 daemon 未重启前的旧代码路径，或者是 MCP 上下文中 baseDir 传入了错误的路径
- `sf_knowledge_graph_core.ts` 第 91 行已正确使用 `join(SPEC_DIR_NAME, LAYOUT.knowledgeGraph)` = `.specforge/knowledge/graph.json`
- 这些文件是 **历史残留**，需要清理

**风险**: 中高 — 需要先停止 daemon → 删除残留 → 重启 daemon → 观察 5 分钟确认不再创建。如果删除后仍被重新创建，说明还有未追踪的写入者，需要进一步排查。

---

### R6：sf_doctor 路径常量 — **大部分已切换，有轻微不一致**

**文件**: `packages/daemon-core/src/tools/lib/sf_doctor_core.ts`

**现状**:
- 第 15 行: `import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath } from "@specforge/types/directory-layout"` ✅
- 第 93-94 行 `PROJECT_RUNTIME_KEY_FILES`:
  ```typescript
  `${SPEC_DIR_NAME}/runtime/state.json`   // 使用 SPEC_DIR_NAME ✅
  `${SPEC_DIR_NAME}/config/project.json`  // 使用 SPEC_DIR_NAME ✅
  ```
- 第 233-267 行 `checkInitializationCompleteness()`:
  - 使用 `join(baseDir, SPEC_DIR_NAME)` ✅
  - 使用 `join(specDir, LAYOUT.manifest)` ✅
  - 使用 `join(specDir, LAYOUT.configFiles.devEnv)` 等嵌套常量 ✅

**问题**: `PROJECT_RUNTIME_KEY_FILES` 使用模板字符串拼接 `${SPEC_DIR_NAME}/runtime/state.json`，语义上等价于 `LAYOUT.runtimeState`，但没有引用 LAYOUT 常量。这不是 bug（SPEC_DIR_NAME 值正确），但与 `checkInitializationCompleteness()` 中的风格不一致。

**影响**: 纯代码风格一致性问题。功能正确，不会创建错误路径。

**风险**: 极低 — 可选修复，提升代码一致性。

---

### R7：.specforge-/ 备份目录 — **已确认存在**

**磁盘状态**:
- `D:\code\temp\SpecForge\.specforge-\` 目录存在
- 包含子目录: `cas/`（含 20+ hex-hash 子目录）和 `observability/`
- 创建时间: 2026/5/25 ~ 2026/5/26
- **未被 git tracking**（`git status` 显示 clean）

**根因**: 这是早期目录结构治理过程中的备份目录（目录名 `.specforge-` 带短横线，既不是 `.specforge` 也不是 `specforge`）。包含 cas 内容寻址存储的完整副本和 observability 日志。可能是在 P0/P1 迁移过程中手动创建的安全备份。

**风险**: 低 — 纯垃圾文件，不在 git 中，安全删除。但按 intake 要求需先备份到 `.tmp/` 并经用户确认。

---

### R8：WI-012 _meta.json — **已确认缺失**

**现状**:
- `Test-Path ".specforge/specs/WI-012/_meta.json"` 返回 `False` ❌
- WI-012 目录下有 4 个文件: `intake.md`, `refactor_analysis.md`, `refactor_plan.md`, `verification_report.md`
- 对比:
  - WI-010: 有 `_meta.json` ✅ (workflow_type: "refactor", current_stage: "completed")
  - WI-011: 有 `_meta.json` ✅ (workflow_type: "change_request", current_stage: "development")
  - WI-012: **无** `_meta.json` ❌

**影响**: WI-012 元数据缺失，`sf_state_read` 等 MCP 工具查询 WI 列表时无法获取 WI-012 的元信息（标题、阶段、工作流类型等）。

**风险**: 低 — 纯元数据补全，不影响功能逻辑。

---

## 重构目标

从 intake.md 摘取，结合代码分析确认的具体目标：

| 编号 | 目标 | 当前状态 | 目标状态 |
|------|------|----------|----------|
| R1 | constants.ts 路径常量切换 | `project: 'specforge/config'` 裸路径 | 使用 `SPEC_DIR_NAME` 常量拼接 |
| R2 | fs-path-rules 白名单路径切换 | `'specforge/config'` 裸路径 | 使用 `SPEC_DIR_NAME` 常量或 `.specforge/config` |
| R3 | sf-knowledge.md 示例路径修正 | `specforge/archive/agent_runs/` 裸路径 | `.specforge/archive/agent_runs/` |
| R4 | sf-orchestrator.md 路径修正 | `specforge/runtime/checkpoints/` 裸路径 | `.specforge/runtime/checkpoints/` |
| R5 | 清理 `specforge/` 无点目录 + 确认无活跃写入者 | `specforge/` 目录存在，含 2 个残留文件 | 删除 `specforge/`，确认 daemon 5 分钟内不重建 |
| R6 | sf_doctor 路径常量风格统一 | 模板字符串 vs LAYOUT 常量混用 | 统一使用 LAYOUT 常量 |
| R7 | 删除 `.specforge-/` 备份目录 | 目录存在，含 cas/ + observability/ | 备份到 `.tmp/` → 用户确认 → 删除 |
| R8 | 补 WI-012 `_meta.json` | 不存在 | 参考 WI-010/WI-011 模板创建 |

**总体目标**: 确保项目根下不再存在 `specforge/`（无点）目录，且所有代码和文档中的路径引用统一使用 `.specforge/`（带点）或 `SPEC_DIR_NAME`/`LAYOUT` 常量。

---

## 不变行为声明

以下行为和接口在重构过程中 **必须保持不变**：

1. **Daemon 启动/运行行为**: Daemon 启动后 EventLogger 写入路径从无点变带点，但写入内容格式（JSONL、WAL 语义、fsync）不变
2. **EventLogger 公共接口**: `append()`, `getEvents()`, `initialize()`, `rebuildState()` 等方法签名和语义不变
3. **permission-engine 安全策略**: 文件系统访问白名单的匹配逻辑不变，只改路径值
4. **sf_doctor 检查逻辑**: 检查的项目、判断标准、报告格式不变，只改内部路径构造方式
5. **所有现有测试**: 必须继续通过（特别是 observability 包的单元测试）
6. **sf-installer verify**: 必须通过
7. **MCP 工具协议**: 所有 MCP 工具的输入输出 schema 不变
8. **Agent markdown 语义**: sf-knowledge.md 和 sf-orchestrator.md 的指令语义不变，只修正路径文本

---

## 风险评估

### 总体风险等级: **中高**

虽然 8 项修复中有 6 项是低风险的文本替换，但 R5（observability 残留清理）需要 daemon 级别的验证，R7 涉及文件删除，因此整体为中高风险。

### 各项风险评级

| 编号 | 风险等级 | 理由 | 回滚难度 |
|------|----------|------|----------|
| R1 | **低** | 单行常量修改，无运行时影响 | git revert |
| R2 | **低** | 白名单路径值修改，影响匹配但不影响功能 | git revert |
| R3 | **低** | 文档 Markdown 文本修改 | git revert |
| R4 | **低** | 文档 Markdown 文本修改 | git revert |
| R5 | **中高** | 需停止 daemon → 删除残留目录 → 重启 → 观察 5 分钟；如果仍有未追踪的写入者，需要二轮排查 | 删除的文件不可恢复（但已 gitignored，不影响代码） |
| R6 | **极低** | 代码风格统一，功能行为完全不变 | git revert |
| R7 | **低** | 纯垃圾文件删除，不在 git 中；但按 intake 要求先备份到 `.tmp/` | 从 `.tmp/` 恢复 |
| R8 | **低** | 新增元数据文件 | 直接删除 |

### R5 详细风险分析

**主要风险**:
1. **残留目录仍有活跃写入者**: 虽然代码分析显示 permission-engine 已切换、daemon 中 EventLogger 写入 `~/.specforge/runtime`，但 `specforge/knowledge/graph.json` 的 mtime 为当天 9:32:39，说明可能有未被追踪的代码路径仍在写入。如果直接删除后 daemon 仍在运行，可能会重建该目录。
2. **Daemon 未重启**: 如果 daemon 是在 WI-11 代码切换前启动的长驻进程，内存中仍是旧代码。需要重启 daemon 才能加载新代码。

**缓解措施**:
1. 修复前先停止 daemon 进程
2. 修复后删除 `specforge/` 目录
3. 重启 daemon
4. 运行 5 分钟后检查 `specforge/` 是否被重建
5. 如果被重建，用 `handle` / `Process Monitor` 等工具定位写入者

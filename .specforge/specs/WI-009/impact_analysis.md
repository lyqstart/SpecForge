---
doc_type: impact_analysis
work_item_id: WI-009
workflow_type: change_request
created_at: 2026-05-28
---

# WI-009 变更影响分析：SpecForge 项目初始化流程根治

## 变更范围

### B1: sf-intake skill frontmatter 修复

| 维度 | 详情 |
|------|------|
| **变更文件** | `~/.config/opencode/skills/sf-intake/SKILL.md`（用户级配置文件） |
| **变更内容** | frontmatter 新增 `name: sf-intake` 字段 |
| **当前状态** | frontmatter 包含 `description`、`mode: skill`、`autoload: false`，**缺少 `name` 字段**（第 1-5 行） |
| **影响模块** | 无代码模块影响；仅影响 OpenCode skill loader 的注册逻辑 |
| **影响接口** | 无 API 接口变更 |
| **调用方** | sf-orchestrator 在 intake 阶段通过 `skill: intake` 显式加载 |

### B2: daemon 初始化行为改为"探针 + 错误"

| 维度 | 详情 |
|------|------|
| **变更文件（核心）** | `packages/daemon-core/src/http/HTTPServer.ts` — `handleIngestRegister()`（第 918-948 行） |
| **变更文件（核心）** | `packages/daemon-core/src/session/SessionRegistry.ts` — `handleOpenCodeEvent()`（第 662-739 行） |
| **变更文件（关联）** | `packages/daemon-core/src/project/ProjectManager.ts` — `registerProject()`（第 59-92 行） |
| **变更文件（关联）** | `packages/daemon-core/src/tools/ToolDispatcher.ts` — `dispatch()`（第 47-57 行） |
| **变更文件（已有守卫）** | `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — 已有 `PROJECT_NOT_INITIALIZED` 检查（第 15-28 行） |
| **当前行为** | (1) OpenCode 启动 → plugin 发送 `POST /api/v1/ingest/register` → `ProjectManager.registerProject()` 自动创建 `{projectPath}/.specforge/runtime/` 目录树 → `SessionRegistry.registerPluginSession()` 创建会话绑定<br>(2) OpenCode 会话事件 `session.created` → `SessionRegistry.handleOpenCodeEvent()` 第 698-701 行 → 若无绑定则自动调用 `registerPluginSession()` 创建新会话 |
| **期望行为** | daemon 不再自动创建 `.specforge/` 目录结构；首次 daemon 工具调用检测到 `.specforge/` 不完整时返回 `PROJECT_NOT_INITIALIZED` 错误，触发 orchestrator 恢复协议 |
| **影响接口** | `POST /api/v1/ingest/register` 的行为语义变更：从"自动创建+注册"变为"检测+拒绝" |
| **调用方** | OpenCode plugin（ingest pipeline）、daemon ToolDispatcher |

**关键代码路径分析**：

1. **`HTTPServer.handleIngestRegister()`**（第 918-948 行）：
   - 当前直接调用 `projectManager.registerProject()` → 创建 `{projectPath}/.specforge/runtime/`
   - 然后调用 `sessionRegistry.registerPluginSession()` → 创建会话绑定并写入 WAL
   - **需要改为**：先检测 `.specforge/manifest.json` 是否存在；不存在则返回 `PROJECT_NOT_INITIALIZED`

2. **`SessionRegistry.handleOpenCodeEvent()`**（第 662-739 行）：
   - 第 697-706 行：当 `internalSessionId` 为 null 且 `subType === 'session.created'` 时，自动调用 `registerPluginSession()` 创建会话
   - **需要改为**：此路径不应自动创建会话，应仅记录 warning 或返回错误

3. **`ProjectManager.registerProject()`**（第 59-92 行）：
   - 第 68 行：`await fs.mkdir(dataDir, { recursive: true })` — 这是自动创建 `.specforge/runtime/` 的源头
   - **需要改为**：在创建目录前检测项目是否已初始化（manifest.json 存在）

4. **`ToolDispatcher.dispatch()`**（第 47-57 行）：
   - 当前无初始化守卫
   - **可选改动**：增加统一的初始化前置检查，避免每个 handler 各自实现

5. **`sf-state-transition.ts`**（第 15-28 行）：
   - 已有 `PROJECT_NOT_INITIALIZED` 守卫（仅在 `fromState === ''` 即创建新 WI 时检查）
   - **需评估**：是否扩展到所有 `sf_state_transition` 调用，还是增加通用守卫

### B3: orchestrator "配置不完整"从软提示升级为硬阀

| 维度 | 详情 |
|------|------|
| **变更文件** | `~/.config/opencode/agents/sf-orchestrator.md`（用户级配置文件） |
| **变更内容** | 步骤 3 的文字描述从软提示改为强制规则 |
| **当前状态** | 步骤 3（第 86-90 行）：`"部分缺失 → 提示用户：'将在首次 WI 的 intake 阶段补全'"` |
| **期望行为** | 步骤 1 后增加强制规则：manifest 存在但 dev-environment.md / prod-environment.md 任一缺失 → **禁止**进入意图分类，**必须**执行步骤 2-3 |
| **影响模块** | 无代码模块；仅影响 orchestrator agent 的行为指令 |
| **关联代码** | `HTTPServer.ts` 的 `handleIngestRegister` — 如果 B2 改为返回错误，orchestrator 必须能正确响应 |
| **关联协议** | `sf-orchestrator.md` 的"硬性前置条件守卫"（第 44-46 行）和"PROJECT_NOT_INITIALIZED 错误处理协议"（第 319-336 行） |

### B4: /sf-doctor 增加初始化完整性自检

| 维度 | 详情 |
|------|------|
| **变更文件（核心）** | `packages/daemon-core/src/tools/lib/sf_doctor_core.ts` — `checkUserLevelInstallation()`（第 106-214 行） |
| **变更文件（入口）** | `packages/daemon-core/src/tools/handlers/sf-doctor.ts`（第 1-28 行） |
| **当前状态** | 检查 4 类项目：(1) 用户级目录文件、(2) 项目运行时文件（仅 `state.json` 和 `project.json`）、(3) 混合模式检测、(4) 版本兼容性 |
| **缺失检查** | 不检查 `.specforge/manifest.json`、`dev-environment.md`、`prod-environment.md`、`project-rules.md` 的齐全度 |
| **期望行为** | 新增第 5 类检查："初始化完整性"，检测 manifest + 3 个 md 文件 |
| **影响接口** | `sf_doctor` 工具返回值新增 `initialization` 检查项 |

---

## 风险评估

### B1: sf-intake frontmatter 修复 — 风险：**低**

| 风险项 | 说明 | 缓解措施 |
|--------|------|----------|
| OpenCode skill 加载失败 | `name` 字段值与 OpenCode 预期不匹配 | 验证 OpenCode skill loader 对 `name` 字段的格式要求 |
| 与现有 orchestrator 加载协议冲突 | orchestrator 使用 `加载 skill: intake` 加载 | `name: sf-intake` 与 `autoload: false` 组合，由 orchestrator 显式调用，不依赖自动发现 |
| 已有项目不受影响 | 用户级配置文件变更不影响已有项目 | 无需迁移 |

### B2: daemon 初始化行为变更 — 风险：**高**

| 风险项 | 说明 | 缓解措施 |
|--------|------|----------|
| **已有项目会话恢复中断** | 已有项目的 `.specforge/` 目录结构由 daemon 创建，但 `manifest.json` 可能不在预期位置；若 B2 改为严格检查，已有项目首次会话可能被误判为未初始化 | 添加迁移逻辑：检测到 `.specforge/runtime/state.json` 存在但 `manifest.json` 不存在时，自动补全 `manifest.json` |
| **ingest/register 路径行为变更** | OpenCode plugin 在每次会话启动时调用 `ingest/register`，当前逻辑是自动注册；改为拒绝后 plugin 需处理错误 | 确保 plugin 能处理 `PROJECT_NOT_INITIALIZED` 错误并传递给 orchestrator |
| **SessionRegistry.handleOpenCodeEvent 回归** | `session.created` 路径改为不自动创建会话后，后续的 `session.idle`、`session.error` 事件可能找不到 session | 改为仅在 session 找不到时记录 warning（第 703 行已有此逻辑），不影响正常流程 |
| **WAL 事件一致性** | `registerPluginSession` 会写入 `session.registered` WAL 事件；若此路径被阻断，daemon 重启后的 WAL replay 可能缺少会话信息 | 确保会话注册延迟到 orchestrator 完成初始化后再执行 |
| **ToolDispatcher 通用守卫** | 若在 ToolDispatcher 层增加初始化检查，所有工具调用都会受影响 | 采取渐进式方案：仅在关键入口（`sf_state_transition`、`sf_state_read`、`sf_doctor`）检查，不修改 ToolDispatcher |

### B3: orchestrator 硬阀升级 — 风险：**低**

| 风险项 | 说明 | 缓解措施 |
|--------|------|----------|
| 模型遵循率不确定 | 硬阀仍为提示词级别的指令，模型可能忽略 | 使用更强的格式（如 ALL CAPS + 不可违反标记），结合 B2 的 `PROJECT_NOT_INITIALIZED` 错误形成双重保障 |
| 影响已有项目 | 已有项目若配置完整则不受影响；若配置不完整则会被阻止 | 这是期望行为 — 强制补全配置 |

### B4: sf_doctor 自检增强 — 风险：**低**

| 风险项 | 说明 | 缓解措施 |
|--------|------|----------|
| 检查项增多导致误报 | 新增文件检查可能对非标准项目结构产生误报 | 仅做 warning 级别报告，不影响 overall 健康状态 |
| 性能影响 | 额外的文件存在性检查 | 使用 `existsSync` 同步检查，影响极小 |

---

## 回归测试范围

### 3.1 必须回归的测试文件

| 测试文件 | 测试内容 | 回归原因 |
|----------|----------|----------|
| `packages/daemon-core/src/project/ProjectManager.test.ts` | 项目注册、锁管理、活跃项目列表 | B2 修改 `registerProject()` 行为 |
| `packages/daemon-core/src/session/SessionRegistry.test.ts` | 会话注册、激活、终止、touch、session tree | B2 修改 `handleOpenCodeEvent()` 行为 |
| `packages/daemon-core/src/http/HTTPServer.test.ts` | HTTP 服务启停、路由匹配 | B2 修改 `handleIngestRegister()` 行为 |
| `packages/daemon-core/src/state/StateManager.test.ts` | 状态读写 | B2 可能影响 state manager 初始化 |
| `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts` | checkpoint 保存恢复 | B2 修改初始化路径可能影响恢复逻辑 |

### 3.2 需新增的测试场景

| 测试场景 | 覆盖变更 | 优先级 |
|----------|----------|--------|
| `ProjectManager.registerProject()` 在无 manifest.json 时返回 PROJECT_NOT_INITIALIZED | B2 | P0 |
| `ProjectManager.registerProject()` 在有 manifest.json 时正常注册 | B2 | P0 |
| 已有项目（有 runtime/ 但无 manifest.json）的迁移兼容性 | B2 | P0 |
| `SessionRegistry.handleOpenCodeEvent('session.created')` 不再自动创建会话 | B2 | P0 |
| `HTTPServer.handleIngestRegister()` 返回 PROJECT_NOT_INITIALIZED 错误 | B2 | P0 |
| `sf_doctor` 新增初始化完整性检查（4 个文件齐全/缺失的各种组合） | B4 | P1 |
| `sf_state_transition` 已有守卫在所有初始化场景下的行为 | B2 | P1 |
| sf-intake skill 加载验证（frontmatter 含 name 字段） | B1 | P2 |
| orchestrator 硬阀场景（manifest 存在但 md 缺失时阻止意图分类） | B3 | P2 |

### 3.3 集成测试要点

| 集成场景 | 描述 |
|----------|------|
| **新项目首次启动** | OpenCode 启动 → plugin 调 ingest/register → daemon 返回 PROJECT_NOT_INITIALIZED → plugin 通知 orchestrator → orchestrator 执行启动流程 1-4 → 重新 ingest/register → 成功 |
| **已有项目会话恢复** | OpenCode 启动 → 已有 `.specforge/` 且 manifest.json 存在 → 正常注册 → 恢复进行中的 WI |
| **`/sf-doctor` 端到端** | 调用 sf_doctor → 返回包含初始化完整性检查的报告 → 缺失文件标记为 error |

---

## KG 关联

### 4.1 与本次变更直接相关的 KG 节点

| 节点 ID | 类型 | 标签 | 关联原因 |
|---------|------|------|----------|
| `WI-001:task:1` | task | Daemon HTTP Server 基础框架 | B2 修改 HTTPServer.handleIngestRegister() |
| `WI-001:task:4` | task | Multi-project Manager | B2 修改 ProjectManager.registerProject() |
| `WI-001:task:5` | task | Session Registry | B2 修改 SessionRegistry.handleOpenCodeEvent() |
| `WI-001:task:9` | task | Daemon 启动/关闭/握手 | B2 影响初始化握手流程 |
| `WI-001:task:27` | task | 删除 state_machine.ts + 重写 sf_state_transition | B2 与 PROJECT_NOT_INITIALIZED 守卫关联 |
| `WI-001:task:37` | task | sf-orchestrator.md 瘦身 | B3 修改 orchestrator 启动流程步骤 |

### 4.2 KG 边关系

| 源节点 | 目标节点 | 边类型 | 说明 |
|--------|----------|--------|------|
| `WI-009:B2` | `WI-001:task:1` | traces_to | B2 变更追溯至 HTTP Server 基础框架 |
| `WI-009:B2` | `WI-001:task:4` | traces_to | B2 变更追溯至 ProjectManager |
| `WI-009:B2` | `WI-001:task:5` | traces_to | B2 变更追溯至 SessionRegistry |
| `WI-009:B3` | `WI-001:task:37` | traces_to | B3 变更追溯至 orchestrator.md |

### 4.3 受影响的代码文件节点

| 文件路径 | 关联变更 |
|----------|----------|
| `packages/daemon-core/src/http/HTTPServer.ts` | B2 |
| `packages/daemon-core/src/session/SessionRegistry.ts` | B2 |
| `packages/daemon-core/src/project/ProjectManager.ts` | B2 |
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | B2（关联） |
| `packages/daemon-core/src/tools/lib/sf_doctor_core.ts` | B4 |
| `packages/daemon-core/src/tools/handlers/sf-doctor.ts` | B4 |
| `packages/daemon-core/src/tools/ToolDispatcher.ts` | B2（可选） |

---

## 5. 变更依赖与执行顺序

```
B1 (frontmatter) ─── 独立，可最先执行
        │
B2 (daemon 行为) ─── 核心变更，影响最大
        │
        ├──→ B3 (orchestrator 硬阀) ─── 依赖 B2 的错误返回机制
        │
        └──→ B4 (sf_doctor 自检) ─── 独立，但建议在 B2 之后执行以对齐检查逻辑
```

**推荐执行顺序**：B1 → B2 → B4 → B3

- B1 风险最低，可立即执行并验证
- B2 是核心变更，需要充分的测试覆盖
- B4 紧随 B2 之后，确保 doctor 检查与新的初始化语义一致
- B3 最后执行，因为它依赖 B2 的错误机制作为底层保障

---

## 6. 总结

| 变更部件 | 风险等级 | 代码变更量 | 测试新增量 | 涉及代码文件数 |
|----------|----------|-----------|-----------|--------------|
| B1 | 低 | 1 行（frontmatter） | 0 | 1（配置文件） |
| B2 | **高** | ~50-80 行 | ~150-200 行 | 3-5 |
| B3 | 低 | ~10 行（提示词） | 0 | 1（配置文件） |
| B4 | 低 | ~30-40 行 | ~40-60 行 | 2 |

**整体风险评估**：中高。B2 是整个变更的核心风险点，涉及 daemon 核心初始化路径的行为变更，必须确保已有项目的向后兼容性。B1/B3/B4 均为低风险变更。

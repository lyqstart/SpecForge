# Design: 修复新项目初始化流程被意图分类抢占

> **Work Item**: WI-035  
> **Workflow**: bugfix_spec  
> **阶段**: design  
> **基于**: `specforge/specs/WI-035/bugfix.md`

---

## 架构概述

本 bug 的根因是 **prompt 层面的执行顺序竞争**，而非代码逻辑错误。系统包含三条执行路径，修复需要协调它们：

```
用户消息
    │
    ▼
┌────────────────────────────────────────────────────┐
│              sf-orchestrator.md (Prompt)            │
│                                                    │
│  ┌──────────────┐          ┌──────────────────┐    │
│  │  启动流程     │ ⚡竞争   │  意图分类         │    │
│  │  Step 1-4    │◄───────►│  "第一步"声明     │    │
│  │              │          │  → 工作流路由     │    │
│  └──────┬───────┘          └────────┬─────────┘    │
│         │ 创建目录                  │ 创建 WI       │
│         │ manifest.json             │               │
│         ▼                           ▼               │
│  .specforge/                 sf_state_transition    │
│  dev-environment.md          (from="")              │
│  project-rules.md                                   │
└────────────────────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  sf_state_transition (thin)     │
                    │  → daemon.invokeTool            │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  Daemon Handler                 │
                    │  → WorkflowEngine.transitionFull│
                    │  → StateManager.transition      │
                    │  → WAL write                    │
                    └─────────────────────────────────┘
```

**问题链路**：LLM 收到 system prompt（含启动流程指令）和 user message（触发意图分类），两条指令都声称自己是"第一步" → LLM 一致选择意图分类路径 → 跳过 `.specforge/` 创建、环境扫描、manifest.json 生成 → 首次 WI 在缺少项目配置的情况下创建。

---

## 需求追溯映射

本 bugfix_spec 使用 EARS 格式（`bugfix.md`），不含传统 REQ-N 编号。以下将 bugfix.md 中的关键需求映射为 REQ 引用：

| REQ 编号 | 来源（bugfix.md） | 需求描述 |
|----------|-------------------|----------|
| **REQ-1** | 预期行为.Step1 | 检测 `.specforge/` 不存在时，SHALL 创建目录并进入"项目初始化"流程 |
| **REQ-2** | 预期行为.Step2 | 首次使用时 SHALL 扫描开发环境并生成 `dev-environment.md` |
| **REQ-3** | 预期行为.Step3 | SHALL 检测 `prod-environment.md` 和 `project-rules.md`，缺失时提示用户 |
| **REQ-4** | 预期行为.完整正确流程示意 | 启动流程 Step 1-4 必须在意图分类之前执行 |
| **REQ-5** | 不变行为.INV-1 | `sf_state_transition` 状态流转正确性（WAL-first 写入顺序）不得改变 |
| **REQ-6** | 不变行为.INV-2 | `ProjectManager.registerProject()` 行为不得改变 |
| **REQ-7** | 不变行为.INV-3 | 意图分类功能（bugfix_spec/feature_spec 等工作流路由）不得受影响 |
| **REQ-8** | 不变行为.INV-4 | 会话恢复流程（`.specforge/` 存在 + 进行中 WI）必须继续正常工作 |
| **REQ-9** | 不变行为.INV-5 | 已有项目的启动流程（schema_version 检查 + Step 2-4）必须继续正常执行 |
| **REQ-10** | 不变行为.INV-6 | 插件注册流程（`sf_specforge.ts` → `daemonClient.register()`）不得改变 |
| **REQ-11** | 不变行为.INV-7 | `manifest.json` 读取逻辑（`sf_doctor.assertCompatibility()`）必须继续正确 |

---

## Out of Scope

- **不涉及**修改 WorkflowEngine 核心逻辑（状态机验证、WAL 写入已正确，不属于根因）
- **不涉及**修改 ProjectManager.registerProject()（daemon 端正确创建 runtime 目录，路径 A 与路径 B 职责不同）
- **不涉及**修改 sf_doctor 功能（sf_doctor 仅检查健康状态，不负责初始化）
- **不涉及**修改意图分类路由表（分类规则本身正确，只是执行顺序错误）
- **不涉及**自动化测试框架搭建（测试策略描述验证方法，测试实现由 sf-executor 负责）

---

## Assumptions（设计假设）

- **AS-1**：orchestrator 始终作为 OpenCode primary agent 运行，能访问完整的 system prompt
- **AS-2**：daemon 已启动且 `sf_state_transition` 工具可用（插件注册成功）
- **AS-3**：`sf_safe_bash`、`sf_artifact_write` 等工具在 orchestrator 启动流程中均可调用
- **AS-4**：用户级配置文件 `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 是权威定义，项目级 `.opencode-\agents\sf-orchestrator.md` 为覆盖层（混合模式警告已由 sf_doctor 处理）
- **AS-5**：新项目的工作目录可写，`.specforge/` 目录创建不会因权限问题失败
- **AS-6**：`manifest.json` 的 `schema_version` 字段与 orchestrator 启动流程 Step 1 的检查逻辑一致（当前存在 `data_schema_version` 字段命名不一致，本设计一并修复）

---

## 设计决策

### DD-1 Prompt 执行顺序守卫（主要修复）

**refs**: [REQ-1, REQ-2, REQ-3, REQ-4]  
**constrained_by**: 纯 prompt 修改，不涉及代码；必须兼容已有项目（`.specforge/` 已存在时的正常路径，即 REQ-9）

#### 修复内容

对 `sf-orchestrator.md`（用户级 + 项目级两份文件）执行以下修改：

**1.1 重组启动流程为硬性前置条件**

将"启动流程"从第 44 行的独立章节重构为"硬性前置条件"，在 `# Role` 和 `# 核心行为约束` 之后、所有其他章节之前，增加一条**不可违反的守卫规则**：

```markdown
# 启动流程（硬性前置条件）

**⚠️ 硬性前置条件：这是 orchestrator 在任何会话中必须首先完成的操作序列。
在启动流程全部完成之前，绝不执行意图分类、绝不创建 Work Item、绝不调度子 Agent。**

## 步骤 0：启动流程入口判定

每次会话开始时，orchestrator 必须首先执行以下判定：

1. 是否已完成启动流程？
   - 检查内部状态：如果已在当前会话中完成 Step 1-4 → 跳过启动流程，直接进入意图分类
   - 否则 → 执行 Step 1
```

**1.2 移除意图分类的"第一步"声明**

在"意图分类"章节中：

```diff
- # 意图分类（处理用户每条消息的第一步）
- **⚠️ 这是处理用户每条消息的第一步。在执行任何其他动作之前，必须先完成意图分类并路由到工作流。**
+ # 意图分类（启动流程完成后执行）
+ **仅在启动流程全部完成后，才处理用户消息进行意图分类。**
```

**1.3 增加启动流程完成后的意图分类衔接**

在启动流程 Step 4 末尾增加衔接指令：

```markdown
## 步骤 4：等待用户输入 → 意图分类

启动流程完成后，如果用户消息已存在（新会话带消息启动），则立即执行意图分类。
如果用户消息尚未到达（会话恢复等待确认），则展示状态并等待。
```

**1.4 Step 1 增加 manifest.json 创建指令**

```diff
 1. 检测 .specforge/ 目录是否存在
-   不存在 → 创建目录，进入"项目初始化"流程
+   不存在 → 
+     a. 创建 .specforge/ 目录
+     b. 创建 .specforge/manifest.json（内容见 DD-3）
+     c. 进入"项目初始化"流程（继续 Step 2）
    存在 → 读取 manifest.json 的 schema_version
           < v6.0 → 停止，提示用户升级
           ≥ v6.0 → 继续
```

#### 涉及文件

| 文件 | 操作 | 原因 |
|------|------|------|
| `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` | 修改 | 用户级权威定义，所有项目使用 |
| `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md` | 修改 | 项目级覆盖层，同步修复 |

#### 预期效果

- LLM 看到 system prompt 中明确的前置条件守卫，不再在启动流程完成前执行意图分类
- 即使在新会话中用户消息已存在，orchestrator 也会先检查/创建 `.specforge/` 和 `manifest.json`
- 已有项目的正常路径（`.specforge/` 存在 → 读取 schema_version → 检查进行中 WI → 等待用户输入）不受影响

---

### DD-2 代码级守卫：sf_state_transition 项目初始化检查（防御性修复）

**refs**: [REQ-1, REQ-5, REQ-7]  
**constrained_by**: 必须在 `from_state=""` 时检查；不得影响已有项目的正常 WI 创建（REQ-5, REQ-9）；必须返回可操作的错误信息

#### 接口变更

**`sf_state_transition` handler 增强**（`packages/daemon-core/src/tools/handlers/sf-state-transition.ts`）

```typescript
// 新增: 项目初始化守卫
registerHandler('sf_state_transition', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  const fromState = (args['from_state'] as string) ?? '';
  const toState = args['to_state'] as string;

  // ── 新增：项目初始化守卫 ──
  if (fromState === '') {
    const projectPath = context?.directory ?? process.cwd();
    const manifestPath = path.join(projectPath, '.specforge', 'manifest.json');
    try {
      await fs.access(manifestPath);
    } catch {
      return {
        success: false,
        error: 'PROJECT_NOT_INITIALIZED',
        hint: '项目尚未初始化。请先执行启动流程：创建 .specforge/ 目录和 manifest.json，完成环境扫描后再创建 Work Item。',
        recovery_action: 'execute_startup_flow',
      };
    }
  }
  // ── 守卫结束 ──

  // ... 原有逻辑不变
});
```

**Errors**:
- `PROJECT_NOT_INITIALIZED` — `.specforge/manifest.json` 不存在，orchestrator 应回退执行启动流程 Step 1
- 已有项目（manifest.json 存在）→ 无影响，直接进入原有 transitionFull 逻辑

#### 依赖注入

handler 需要访问文件系统：
- 方案 A：通过 `deps` 注入 `pathResolver` 或 `fs` 模块
- 方案 B：使用 `node:fs/promises` + `node:path` 直接访问（handler 运行在 daemon 进程内，文件系统访问安全）

**推荐方案 B**：handler 已运行在 Node.js daemon 进程中，直接使用 `fs.access` 是最简方案，不引入额外依赖。

#### 错误处理协议

orchestrator 收到 `PROJECT_NOT_INITIALIZED` 后的处理流程：

```
sf_state_transition 返回 error: "PROJECT_NOT_INITIALIZED"
    │
    ▼
orchestrator 识别 recovery_action: "execute_startup_flow"
    │
    ▼
执行启动流程 Step 1：
  1. 创建 .specforge/ 目录
  2. 创建 manifest.json
  3. 继续 Step 2-4
    │
    ▼
启动流程完成后，重新调用 sf_state_transition 创建 Work Item
```

#### 涉及文件

| 文件 | 操作 | 原因 |
|------|------|------|
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | 修改 | 增加项目初始化守卫 |

---

### DD-3 manifest.json 引导创建

**refs**: [REQ-1, REQ-11]  
**constrained_by**: 文件格式必须与 sf_doctor.assertCompatibility() 兼容（至少包含 `install_mode` 可选字段）；orchestrator prompt 检查 `schema_version` 字段

#### manifest.json 模板

在项目初始化时（启动流程 Step 1），orchestrator 通过 `sf_artifact_write` 或直接文件写入创建：

```json
{
  "schema_version": "6.0",
  "install_mode": "user_level",
  "initialized_at": "<ISO 8601 timestamp>",
  "updated_at": "<ISO 8601 timestamp>"
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `schema_version` | string | SpecForge 规格版本号。orchestrator 启动流程 Step 1 读取此字段判断兼容性（`< v6.0` 提示升级） |
| `install_mode` | string | 安装模式：`"user_level"` \| `"project_level"`。sf_doctor.assertCompatibility() 读取此字段决定兼容性检查策略 |
| `initialized_at` | string | 项目首次初始化时间（ISO 8601） |
| `updated_at` | string | 最后更新时间（ISO 8601） |

**注意**：当前 `D:\code\temp\SpecForge\specforge\manifest.json` 使用字段名 `data_schema_version`，而 orchestrator prompt 引用 `schema_version`。本设计统一为 `schema_version`，新创建的 manifest.json 使用此命名。已有文件可保留 `data_schema_version` 作为历史记录，同时添加 `schema_version` 字段。

#### 创建方式

orchestrator 在启动流程 Step 1 中使用 `sf_artifact_write` 工具或 `write` 工具创建文件：

```markdown
# orchestrator 执行伪代码
if .specforge/ 不存在:
  1. 使用 write 工具创建 .specforge/manifest.json
  2. 内容为上述模板，initialized_at = 当前时间
  3. 记录日志："项目初始化完成，schema_version=6.0"
```

---

### DD-4 不变行为保护策略

**refs**: [REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11]  
**constrained_by**: 所有修改不得破坏 7 条不变行为

| 不变行为 | 保护措施 | 验证方法 |
|----------|----------|----------|
| **INV-1** 状态流转正确性 | DD-2 守卫仅在 `from_state=""` 时触发，不修改 transitionFull 或 StateManager.transition 逻辑 | 已有 WI 的 from_state ≠ ""，守卫直接跳过 |
| **INV-2** ProjectManager.registerProject() | 不修改 ProjectManager 任何代码 | 代码审查确认无改动 |
| **INV-3** 意图分类功能 | DD-1 只调整意图分类的执行时机（启动流程完成后），不修改分类逻辑、关键词匹配、路由表 | 手动测试：启动流程完成后输入各类型请求，验证路由正确 |
| **INV-4** 会话恢复流程 | 启动流程 Step 1 中"存在 .specforge/ → 读取 manifest.json → 检查进行中 WI → 会话恢复"路径不变 | 手动测试：`.specforge/` 已存在 + 有进行中 WI 时，验证恢复提示 |
| **INV-5** 已有项目启动流程 | manifest.json 存在 → 读取 schema_version ≥ v6.0 → 继续 Step 2-4，路径不变 | 手动测试：已有项目目录中启动，验证正常执行 |
| **INV-6** 插件注册流程 | 不修改 `sf_specforge.ts` 插件代码 | 代码审查确认无改动 |
| **INV-7** manifest.json 读取 | DD-3 新增 manifest.json 创建逻辑，但 sf_doctor.assertCompatibility() 对缺失文件已有容错逻辑（返回 compatible:true, installMode:"project_level"） | 代码审查 + 单元测试确认 compat 逻辑不受影响 |

---

### DD-5 文件修改清单

**refs**: [REQ-1, REQ-4, REQ-5, REQ-6, REQ-10]  
**constrained_by**: 只改必要文件，最小化变更范围

| # | 文件 | 修改类型 | 修改内容 | 风险等级 |
|---|------|----------|----------|----------|
| 1 | `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` | **修改** | DD-1: 重组启动流程为硬性前置条件，移除意图分类的"第一步"声明，增加 manifest.json 创建指令 | 中（prompt 修改，需验证 LLM 行为变化） |
| 2 | `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md` | **修改** | DD-1: 同步应用相同修复（混合模式下两份文件需一致） | 低（与用户级保持一致） |
| 3 | `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | **修改** | DD-2: 增加 `from_state=""` 时的 manifest.json 存在性检查 | 低（仅新增守卫，不改原有逻辑） |
| 4 | `specforge/manifest.json`（当前项目） | **修改** | DD-3: 将 `data_schema_version` 统一为 `schema_version`，添加 `install_mode` 字段 | 低（字段兼容，不影响已有读取逻辑） |
| **不修改** | `packages/daemon-core/src/project/ProjectManager.ts` | — | 职责分离：ProjectManager 管 runtime/，orchestrator 管 manifest.json | — |
| **不修改** | `packages/workflow-runtime/src/WorkflowEngine.ts` | — | transitionFull 逻辑正确，无 bug | — |
| **不修改** | `packages/daemon-core/src/tools/lib/sf_doctor_core.ts` | — | assertCompatibility 对缺失 manifest.json 已正确容错 | — |

---

## Correctness Properties

### CP-1 启动流程严格先于意图分类

**test_type**: property  
**test_file**: tests/property/startup-flow-ordering.property.test.ts  
**requirement_ref**: REQ-4

对任意会话状态 s ∈ {未初始化, 已初始化, 有进行中WI} 和任意用户消息 m，orchestrator 的行为必须满足：
- 若 `.specforge/` 不存在 → 先创建 `.specforge/` 和 `manifest.json`，再处理 m
- 若 `.specforge/` 存在且 `manifest.json` 存在 → 先读取 `schema_version`，再处理 m

即：`firstAction(s, m)` 必须是启动流程 Step 1 的某个子步骤，绝不能是意图分类。

### CP-2 sf_state_transition 守卫幂等性

**test_type**: property  
**test_file**: tests/property/transition-guard-idempotency.property.test.ts  
**requirement_ref**: REQ-1, REQ-5

对任意项目路径 p：
- 若 `p/.specforge/manifest.json` 不存在 → `sf_state_transition(from="", to="intake")` 返回 `{success: false, error: "PROJECT_NOT_INITIALIZED"}`（无论调用多少次）
- 若 `p/.specforge/manifest.json` 存在 → `sf_state_transition(from="", to="intake")` 正常创建 Work Item（与修复前行为一致）

即守卫检查结果仅取决于 manifest.json 的存在性，与调用次数无关。

### CP-3 已有项目不受影响

**test_type**: integration  
**test_file**: tests/integration/existing-project-startup.integration.test.ts  
**requirement_ref**: REQ-8, REQ-9

对已有项目（`.specforge/` 已存在，`manifest.json` 已存在，`schema_version ≥ "6.0"`）：
- 启动流程 Step 1 正常读取 manifest.json → 检查版本 → 继续
- 意图分类正常路由用户请求到工作流
- `sf_state_transition(from="", ...)` 正常创建 Work Item

### CP-4 manifest.json 字段兼容性

**test_type**: unit  
**test_file**: tests/unit/manifest-compatibility.unit.test.ts  
**requirement_ref**: REQ-11

对含 `schema_version` 字段的 manifest.json：
- `sf_doctor.assertCompatibility()` 不因新字段而失败
- orchestrator 启动流程正确读取 `schema_version` 字段值

对仅含 `data_schema_version`（旧格式）且不含 `schema_version` 的 manifest.json：
- orchestrator 启动流程应检测 `schema_version` 缺失并提示升级（降级处理）

---

## 测试策略

### T-1 单元测试

| 测试目标 | 测试内容 | 涉及文件 |
|----------|----------|----------|
| sf_state_transition handler | `from_state=""` + manifest.json 不存在 → 返回 `PROJECT_NOT_INITIALIZED` | `sf-state-transition.handler.test.ts` |
| sf_state_transition handler | `from_state=""` + manifest.json 存在 → 正常执行 | `sf-state-transition.handler.test.ts` |
| sf_state_transition handler | `from_state!=""` → 守卫不触发，正常执行 | `sf-state-transition.handler.test.ts` |
| manifest.json 解析 | `schema_version` 字段正确读取 | `manifest-parsing.test.ts` |

### T-2 属性测试

| 测试目标 | 测试内容 | 涉及文件 |
|----------|----------|----------|
| 启动流程顺序 | 随机会话状态 + 随机用户消息 → firstAction 始终是启动流程步骤（CP-1） | `startup-ordering.property.test.ts` |
| 守卫幂等性 | 任意项目路径 → 守卫结果仅取决于 manifest.json（CP-2） | `transition-guard.property.test.ts` |

### T-3 集成测试

| 测试目标 | 测试内容 | 涉及文件 |
|----------|----------|----------|
| 新项目初始化 | 空目录 → 启动 orchestrator → `.specforge/` 被创建 → manifest.json 存在 → 意图分类正常 | `new-project-init.integration.test.ts` |
| 已有项目启动 | `.specforge/` 已存在 → 启动流程正常执行 → 意图分类正常 | `existing-project.integration.test.ts` |
| 会话恢复 | `.specforge/` 已存在 + 进行中 WI → 会话恢复提示 → 确认继续 → 正常流转 | `session-resume.integration.test.ts` |

### T-4 E2E 测试

| 测试目标 | 测试内容 |
|----------|----------|
| 新项目完整流程 | 空目录 → OpenCode 发起开发请求 → orchestrator 初始化项目 → 创建 WI → intake 阶段正常（dev-environment.md 可生成） |
| 已有项目完整流程 | 已初始化项目 → OpenCode 发起开发请求 → orchestrator 正常路由到工作流 → WI 正常创建和执行 |

### T-5 兼容性测试

| 测试目标 | 测试内容 |
|----------|----------|
| 旧 manifest.json 兼容 | `manifest.json` 仅有 `data_schema_version` 无 `schema_version` → orchestrator 启动流程降级处理（提示升级或自动补充） |
| 混合模式兼容 | 同时存在用户级和项目级 `sf-orchestrator.md` → sf_doctor 警告 → 两份文件均含修复 → 行为一致 |

---

## 错误处理策略

### E-1 PROJECT_NOT_INITIALIZED 错误流

```
sf_state_transition 返回
  { success: false, error: "PROJECT_NOT_INITIALIZED", recovery_action: "execute_startup_flow" }
    │
    ▼
orchestrator Gate 处理协议（已有）
    │
    ▼
识别为可恢复错误（非 blocked）
    │
    ▼
执行恢复动作：启动流程 Step 1-4
    │
    ├─ 成功 → 重新调用 sf_state_transition 创建 Work Item
    └─ 失败 → 向用户报告错误，等待指示
```

### E-2 manifest.json 创建失败

- 原因：磁盘满、权限不足、路径不可写
- 处理：orchestrator 捕获错误，向用户报告具体原因（"无法创建 .specforge/manifest.json：权限不足"），不创建 Work Item

### E-3 schema_version 不兼容

- `< v6.0` → orchestrator 停止，提示用户升级 SpecForge
- 缺失 `schema_version` 字段（旧格式） → orchestrator 提示："检测到旧版 manifest.json，正在升级..." → 写入 `schema_version: "6.0"`

---

## 备选方案评估

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|------|------|------|------|------|
| **方案 A** | 仅修改 prompt（DD-1） | 改动最小，纯文本修改 | 依赖 LLM 行为一致性，无硬性保障 | 独立使用不够可靠 |
| **方案 B** | 仅修改代码（DD-2） | 硬性保障，LLM 无法绕过 | orchestrator 收到错误后的恢复路径仍依赖 prompt 指令 | 独立使用不够完整 |
| **方案 C** ✅ | 组合方案（DD-1 + DD-2 + DD-3） | prompt 主路径 + 代码兜底，双保险；manifest.json 引导确保基础设施完整 | 改动略多（3-4 个文件） | **推荐**：从根本上消除竞争条件，同时提供代码级硬守卫 |

---

## 架构自检（5 条属性）

### A1 单一职责

| 组件 | "我是 X" 陈述 |
|------|---------------|
| orchestrator prompt（启动流程段） | 我是"会话启动时的项目环境就绪检查器" |
| orchestrator prompt（意图分类段） | 我是"用户意图到工作流的路由器" |
| sf_state_transition handler | 我是"Work Item 状态流转的执行器 + 项目初始化守卫" |
| WorkflowEngine | 我是"工作流定义加载和实例生命周期管理器" |
| manifest.json | 我是"项目初始化状态的持久化凭证" |

### A2 显式依赖

Mermaid 依赖图已在"架构概述"中绘制，所有组件间调用关系均已标注。

### A3 可替换性

| 组件 | Interface | 可替换为 |
|------|-----------|----------|
| sf_state_transition handler | `async (args, context, deps) => {success, error?, hint?}` | mock handler 返回固定结果 |
| manifest.json 检查 | `fs.access(manifestPath)` | 可替换为配置服务检查 |
| 启动流程守卫 | prompt 中的文本指令 | 可替换为 skill 加载检查 |

### A4 失败可观测

| 失败路径 | 可观测方式 |
|----------|-----------|
| `PROJECT_NOT_INITIALIZED` | sf_state_transition 返回 `{success: false, error: "PROJECT_NOT_INITIALIZED"}` |
| manifest.json 创建失败 | orchestrator 向用户报告错误，写入 events.jsonl |
| schema_version 不兼容 | orchestrator 停止并向用户展示升级提示 |
| 启动流程被跳过（DD-2 守卫触发） | daemon handler 返回结构化错误，orchestrator 日志可见 |

### A5 边界明确

已在"Out of Scope"和"Assumptions"段中定义。

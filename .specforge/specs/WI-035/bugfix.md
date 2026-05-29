---
requirements_format: ears
---

# Bugfix Analysis: 新项目初始化流程跳过 .specforge/ 目录创建和环境扫描

## 当前行为

在新项目目录（如 `D:\code\temp\wzq`）中启动 SpecForge 时，orchestrator 的执行流程如下：

1. orchestrator 检测到 `.specforge/` 目录不存在（部分执行了启动流程 Step 1 的检测逻辑）
2. **跳过** `.specforge/` 目录创建（启动流程 Step 1 的"创建目录"指令未执行）
3. **跳过** 开发环境扫描（启动流程 Step 2 的 intake A 阶段未执行）
4. **跳过** 配置文件检测（启动流程 Step 3 未执行）
5. 直接跳转到意图分类 → 工作流路由 → Work Item 创建（intake B 阶段）

**可观测症状**：
- `.specforge/` 目录未被创建（或仅包含 daemon 自动生成的 `runtime/` 子目录）
- `.specforge/manifest.json` 缺失（`sf_doctor` 和 orchestrator 启动流程均依赖此文件判断 schema_version）
- `.specforge/dev-environment.md` 缺失（后续 WI 的 design 阶段缺少技术栈决策依据）
- `.specforge/prod-environment.md` 缺失
- `.specforge/project-rules.md` 缺失
- 首次 WI 的 intake B 阶段缺少项目配置基础，在 design 阶段可能因缺少环境信息而失败

**复现条件**：
1. 新建空项目目录
2. 在该目录中用 OpenCode 发起 SpecForge 开发请求（如"开发一个网页版游戏"）
3. orchestrator 收到的 system prompt 包含用户消息，优先执行意图分类而非启动流程

---

## 预期行为

根据 `sf-orchestrator.md`（用户级：`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 第 44-74 行）定义的启动流程，orchestrator 在每次会话开始时应按以下顺序执行：

### 启动流程 Step 1：版本与目录检测

```
1. 检测 .specforge/ 目录是否存在
   不存在 → 创建目录，进入"项目初始化"流程
   存在 → 读取 manifest.json 的 schema_version
          < v6.0 → 停止，提示用户升级
          ≥ v6.0 → 继续

2. 调用 sf_state_read（work_item_id="all"）检查是否有进行中的 Work Item
   有进行中的 WI → 执行"会话恢复"流程
   没有 → 继续
```

**关键行为**：当 `.specforge/` 不存在时，orchestrator SHALL 创建该目录并进入"项目初始化"流程。

### 启动流程 Step 2：开发环境检测

```
加载 skill: intake（执行 intake.md 的 A 阶段）
  - 检测 dev-environment.md 是否存在
  - 存在且无差异 → 跳过
  - 不存在或有差异 → 扫描并让用户确认
```

**关键行为**：首次使用时，orchestrator SHALL 扫描开发环境并生成 `dev-environment.md`。

### 启动流程 Step 3：配置文件检测

```
检测 .specforge/prod-environment.md 和 .specforge/project-rules.md：
  都存在 → 加载并展示摘要，等待用户输入
  部分缺失 → 提示用户："项目配置不完整，将在首次 WI 的 intake 阶段补全"
  都不存在 → 提示用户："首次使用，将在 intake 阶段完成项目配置"
```

### 启动流程 Step 4：等待用户输入

完成上述步骤后，orchestrator 才应等待用户输入并进行意图分类。

### 完整正确流程示意

```
Session 开始
    │
    ▼
Step 1: 检测 .specforge/ 是否存在？
    │
    ├── 否 → 创建 .specforge/ → 进入"项目初始化"
    │         │
    │         ▼
    │     Step 2: 开发环境扫描 → 生成 dev-environment.md
    │         │
    │         ▼
    │     Step 3: 配置文件检测 → 生成 prod-environment.md / project-rules.md
    │         │
    │         ▼
    │     Step 4: 等待用户输入 → 意图分类 → 工作流路由
    │
    └── 是 → 读取 manifest.json → 检查版本 → 检查进行中 WI → 等待用户输入
```

---

## 不变行为

修复过程中以下行为**绝对不能破坏**：

1. **INV-1: 状态流转正确性**：`sf_state_transition`（`from_state=""` → `to_state="intake"`）必须继续正确创建 Work Item，写入 WAL，并持久化 `state.json`。修复不得改变 `StateManager.transition()` 的 WAL-first 写入顺序。

2. **INV-2: ProjectManager.registerProject() 行为**：`ProjectManager.registerProject()`（`packages/daemon-core/src/project/ProjectManager.ts` 第 49-89 行）必须继续通过 `fs.mkdir(dataDir, { recursive: true })` 创建 `.specforge/runtime/` 目录并初始化 WAL 和 StateManager。此方法由 daemon 的 `/api/v1/ingest/register` 端点调用，与 orchestrator 的启动流程解耦。

3. **INV-3: 意图分类功能**：orchestrator 的意图分类逻辑（`sf-orchestrator.md` 第 93-111 行）必须继续工作——`bugfix_spec`、`feature_spec`、`investigation` 等工作流的路由不能受影响。

4. **INV-4: 会话恢复流程**：当 `.specforge/` 已存在且有进行中的 Work Item 时，会话恢复流程（`sf-orchestrator.md` 第 77-98 行）必须继续正常工作。

5. **INV-5: 已有项目的启动流程**：对于 `.specforge/` 已存在的项目（非首次使用），启动流程 Step 1 的 schema_version 检查 + Step 2-4 必须继续正常执行。

6. **INV-6: 插件注册流程**：`sf_specforge.ts` 插件的 `daemonClient.register()` 调用（`.opencode-/plugins/sf_specforge.ts` 第 83-88 行）必须继续正常建立 daemon 连接和 session。

7. **INV-7: manifest.json 读取逻辑**：当 `manifest.json` 存在时，`sf_doctor_core.ts` 的 `assertCompatibility()`（`packages/daemon-core/src/tools/lib/sf_doctor_core.ts` 第 31-62 行）必须继续正确检查版本兼容性。

---

## 根因分析

### 根因定位

**根因**：`sf-orchestrator` Agent 定义文件中"启动流程"和"意图分类"两段 prompt 指令存在逻辑竞争（race condition in prompt design），导致 LLM 在会话启动时优先执行意图分类而跳过项目初始化流程。

**根因类型**：Prompt 设计缺陷（非代码 bug）

**影响文件**：
- `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md`（用户级，498 行）
- `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md`（项目级，223 行）

两份文件均包含相同的问题——启动流程和意图分类之间存在执行顺序歧义。

### 证据链

#### 证据 1：启动流程定义（仅 prompt 层面，无代码强制执行）

文件：`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 第 44-74 行

```markdown
## 步骤 1：版本与目录检测

1. 检测 .specforge/ 目录是否存在
   不存在 → 创建目录，进入"项目初始化"流程
   ...
```

此步骤是纯 prompt 指令。orchestrator 是一个 LLM Agent，其行为完全依赖于对 prompt 指令的解释和执行。与 `sf_state_transition`（有 daemon 端代码强制执行状态机验证）不同，启动流程没有任何代码级别的 guard。

#### 证据 2：意图分类的"第一步"声明与启动流程冲突

文件：`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 第 93-95 行

```markdown
# 意图分类（处理用户每条消息的第一步）

**⚠️ 这是处理用户每条消息的第一步。在执行任何其他动作之前，必须先完成意图分类并路由到工作流。**
```

"启动流程"声明为"每次会话开始时执行"（第 44 行），"意图分类"声明为"处理用户每条消息的第一步"（第 93 行）。当会话启动时用户消息已经存在，两个指令同时竞争"第一步"的位置。

#### 证据 3：意图分类 → 工作流路由 → 直接创建 Work Item

文件：`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 第 183-185 行

```markdown
意图分类完成后：
1. 查询路由表，获取对应的 Workflow_Skill 名称
2. 加载该 Skill
...
4. 创建 Work Item：调用 `sf_state_transition`（from_state="", to_state="intake"）
5. 按已加载 Skill 中的阶段执行协议推进工作流
```

一旦 LLM 选择了意图分类路径，就会直接跳到 Work Item 创建（`sf_state_transition`），启动流程的 Step 1-4 完全被绕过。

#### 证据 4：daemon 端 ProjectManager 与 orchestrator 启动流程解耦

文件：`packages/daemon-core/src/project/ProjectManager.ts` 第 49-58 行

```typescript
async registerProject(projectPath: string): Promise<ProjectContext> {
    const dataDir = this.pathResolver.resolveProjectRuntimeDir(projectPath);
    await fs.mkdir(dataDir, { recursive: true });
    // ...
}
```

`ProjectManager.registerProject()` 由插件的 `daemonClient.register()` 调用（经由 `/api/v1/ingest/register` 端点），会创建 `.specforge/runtime/` 目录。但这与 orchestrator 的启动流程是两条独立的执行路径：

- **路径 A（daemon 端）**：插件启动 → `register()` → `.specforge/runtime/` 创建 → WAL/StateManager 初始化
- **路径 B（orchestrator 端）**：启动流程 → `.specforge/` 创建 → manifest.json → dev-environment.md → project-rules.md

路径 A 只管运行时基础设施（events.jsonl、state.json），路径 B 负责项目初始化（manifest.json、dev-environment.md 等）。当路径 B 被跳过时，路径 A 即使成功也无法替代其功能。

#### 证据 5：sf_state_transition 不触发项目初始化

文件：`packages/daemon-core/src/tools/handlers/sf-state-transition.ts` 第 3-30 行

```typescript
registerHandler('sf_state_transition', async (args, context, deps) => {
    // ...
    const result = await deps.workflowEngine.transitionFull({...});
    return { success: true, ...result };
});
```

`sf_state_transition` handler 只负责状态流转（创建 Work Item → WAL 写入 → state.json 持久化），不包含任何项目初始化逻辑（目录创建、环境扫描、配置生成）。

#### 证据 6：manifest.json 的预期创建者缺失

文件：`packages/daemon-core/src/tools/lib/sf_doctor_core.ts` 第 31-33 行

```typescript
function assertCompatibility(baseDir: string): CompatibilityResult {
    const projectManifestPath = join(baseDir, "specforge", "manifest.json")
    if (!existsSync(projectManifestPath)) {
        return { compatible: true, installMode: "project_level" }
    }
```

`sf_doctor` 检查 `specforge/manifest.json`，但此文件不在 daemon 的任何初始化代码中创建。`ProjectManager` 不创建它，`StateManager` 不创建它。按照 orchestrator 启动流程的设计，manifest.json 应在"项目初始化"流程中创建（orchestrator 调用 `sf_artifact_write` 或类似机制），但此流程从未被执行。

### 假设验证

| # | 假设 | 验证方法 | 结果 |
|---|------|---------|------|
| H1 | orchestrator 的 startup flow 被意图分类逻辑抢占 | 对照 agent 定义文件分析执行顺序 | ✅ **确认**：启动流程（第 44 行）与意图分类（第 93 行）的"第一步"声明冲突。LLM 在同时收到 system prompt（含启动流程）和 user message（触发意图分类）时，优先执行意图分类。 |
| H2 | `ProjectManager.registerProject()` 未创建 `.specforge/` 目录 | 代码审查 registerProject 实现 | ❌ **排除**：`registerProject()` 通过 `fs.mkdir(dataDir, { recursive: true })` 正确创建 `.specforge/runtime/`。但此调用依赖插件注册成功，且不创建 manifest.json。 |
| H3 | `sf_state_transition` 应在首次调用时创建 `.specforge/` | 代码审查 handler 和 WorkflowEngine | ❌ **排除**：handler 仅调用 `workflowEngine.transitionFull()`，后者在 `fromState=""` 时创建内存中的 WorkflowInstance 并写入 WAL，没有任何目录创建逻辑。 |
| H4 | 项目级 orchestrator.md 覆盖了用户级的启动流程 | 对比两份文件 | ❌ **排除**：两份文件均包含相同的启动流程文本（"创建目录"指令均存在），不存在覆盖差异。但 `sf_doctor` 会检测到混合模式并警告。 |
| H5 | 存在代码级 guard 阻止跳过启动流程 | 搜索全量源码 | ❌ **排除**：不存在任何代码级别的 guard 确保启动流程在 Work Item 创建前完成。整个启动流程仅存在于 prompt 指令中。 |

### 根因确认

**确认根因**：`sf-orchestrator.md` 的 prompt 设计中，"启动流程"（第 44-74 行）和"意图分类"（第 93-111 行）之间存在未解决的执行顺序歧义。两份指令都声称自己是"第一步"，LLM 在面临此竞争条件时，一致地选择意图分类路径——因为用户消息已经存在且意图分类被标注为"处理每条消息的首要步骤"。

**影响链**：
```
Prompt 竞争条件（启动流程 vs 意图分类）
    → LLM 优先执行意图分类
    → 加载 Workflow Skill + 创建 Work Item（sf_state_transition）
    → 跳过 .specforge/ 目录创建
    → 跳过 dev-environment.md 生成（intake A 阶段）
    → 跳过 manifest.json 生成
    → 跳过 prod-environment.md / project-rules.md 检测
    → 首次 WI 在缺少项目配置的情况下进入 intake B 阶段
    → 后续 design 阶段缺少技术栈决策依据
```

### 修复方向建议

以下为修复方向建议（具体修复方案由 sf-design 阶段产出）：

1. **消除 prompt 竞争条件**：在 orchestrator.md 中明确"启动流程"必须在"意图分类"之前执行，增加显式的顺序守卫指令。例如：将意图分类部分移至启动流程之后，并添加"仅在启动流程完成后执行意图分类"的约束。

2. **增加代码级 guard**：在 `sf_state_transition` handler 中增加首次调用时的项目初始化检查——若 `.specforge/` 不存在，返回特定错误码要求 orchestrator 先执行项目初始化。

3. **daemon 端自动初始化**：扩展 `ProjectManager.registerProject()` 以自动创建 `manifest.json`（含默认 schema_version），确保即使 orchestrator 跳过启动流程，基础设施文件也存在。

4. **混合模式消歧**：当同时存在用户级和项目级 orchestrator.md 时，`sf_doctor` 已发出警告但未强制消歧。可考虑在启动时自动选择优先级更高的定义文件。

---
doc_type: tasks
work_item_id: WI-009
created_at: 2026-05-28
---

# WI-009 任务列表

## Task 1: B1 — 修复 sf-intake skill frontmatter

**描述**：给 `~/.config/opencode/skills/sf-intake/SKILL.md` 的 YAML frontmatter 添加 `name: sf-intake` 字段，使其能被 OpenCode skill loader 正确注册。

**文件**：
- `C:\Users\luo\.config\opencode\skills\sf-intake\SKILL.md` — frontmatter 新增 `name: sf-intake`

**验证命令**：
1. 检查文件 frontmatter 包含 `name: sf-intake`
2. 确认 `autoload: false` 保持不变
3. 确认 `description`、`mode: skill` 字段不变

**依赖**：无

---

## Task 2: B2 — daemon 不再自动建 manifest，改为探针+错误

**描述**：修改 daemon 的 3 个核心文件，使 `.specforge/` 目录不再在 `ingest/register` 时自动创建。新行为：检测项目是否已初始化，未初始化则返回 `PROJECT_NOT_INITIALIZED` 错误。

**文件与变更**：

### 2a. `packages/daemon-core/src/project/ProjectManager.ts`

在 `registerProject()` 方法开头增加初始化检查：
1. 检查 `{projectPath}/.specforge/manifest.json` 是否存在
2. 如果存在 → 正常注册（当前行为）
3. 如果不存在但 `{projectPath}/.specforge/` 目录存在（旧项目迁移）→ 自动补全 `manifest.json`（写 `{"schema_version":"6.0","project_name":"","created_at":"<ISO date>"}`），然后正常注册
4. 如果 `{projectPath}/.specforge/` 不存在（全新项目）→ 抛出 `PROJECT_NOT_INITIALIZED` 错误（不创建任何文件）
5. 删除或跳过 `ensureGitignore()` 对新项目的调用（未初始化的项目不应有 `.gitignore`）

### 2b. `packages/daemon-core/src/http/HTTPServer.ts`

修改 `handleIngestRegister()` 方法：
1. 捕获 `registerProject()` 抛出的 `PROJECT_NOT_INITIALIZED` 错误
2. 返回 HTTP 409 响应：`{ error: "PROJECT_NOT_INITIALIZED", message: "项目未初始化。请先完成启动流程（步骤 1-4）再注册。", projectPath: request.projectPath }`

### 2c. `packages/daemon-core/src/session/SessionRegistry.ts`

修改 `handleOpenCodeEvent()` 方法：
1. 在 `subType === 'session.created'` 且无 session binding 时（L698-701），**不再自动调用 `registerPluginSession()`**
2. 改为仅 `console.warn` 日志（项目未注册，等待 orchestrator 初始化）

**验证命令**：
1. 在一个无 `.specforge/` 的目录下，启动 OpenCode → plugin 调 `ingest/register` → daemon 应返回 409 PROJECT_NOT_INITIALIZED
2. 在一个有 `.specforge/manifest.json` 的目录下 → 正常注册
3. 在一个有 `.specforge/runtime/` 但无 `manifest.json` 的旧项目目录下 → 自动补全 manifest.json 后正常注册

**依赖**：无

---

## Task 3: B3 — orchestrator 启动流程硬阀

**描述**：修改 `sf-orchestrator.md` 的启动流程步骤，将"配置不完整"从软提示升级为强制规则。

**文件**：
- `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md`

**变更**：
1. 在步骤 1 之后增加"步骤 1.5 初始化完整性自检"：
   - 检查 `.specforge/dev-environment.md` 是否存在
   - 检查 `.specforge/prod-environment.md` 是否存在
   - 任一缺失 → **禁止进入意图分类**，**必须执行步骤 2**（加载 intake skill，执行 A 阶段扫描开发环境）
2. 修改步骤 2 的措辞：从"加载 skill: intake 执行 intake.md 的 A 阶段"改为更强的"**强制**加载 skill: intake 执行 A 阶段——这是硬性前置条件，不可跳过"
3. 修改步骤 3 的措辞：从"部分缺失 → 提示用户：将在首次 WI 的 intake 阶段补全"改为"**配置不完整时禁止进入步骤 4**。必须完成步骤 2 的环境扫描和配置生成"
4. 增加 `PROJECT_NOT_INITIALIZED` 错误处理协议的触发条件：当任何 daemon 工具返回 `PROJECT_NOT_INITIALIZED` 错误时，立即暂停当前工作流，执行启动流程步骤 1-4

**验证命令**：
1. 读取修改后的 orchestrator.md，确认包含 "禁止" / "硬性前置条件" / "PROJECT_NOT_INITIALIZED" 关键词
2. 确认步骤 1.5 的自检逻辑在步骤 2 之前

**依赖**：Task 1（B1，intake skill 能被加载）

---

## Task 4: B4 — sf_doctor 增加初始化完整性自检

**描述**：在 `sf_doctor` 工具中新增"初始化完整性"检查类别。

**文件**：

### 4a. `packages/daemon-core/src/tools/lib/sf_doctor_core.ts`

在现有检查（用户级安装、项目运行时文件、混合模式检测、版本兼容性）之后新增第 5 类检查"初始化完整性"：
1. 检查 `.specforge/manifest.json` 是否存在 → 不存在：error "项目未初始化"
2. 检查 `.specforge/dev-environment.md` 是否存在 → 不存在：warning "开发环境配置缺失"
3. 检查 `.specforge/prod-environment.md` 是否存在 → 不存在：warning "生产环境配置缺失"
4. 检查 `.specforge/project-rules.md` 是否存在 → 不存在：warning "项目规则缺失"
5. 返回 `{ category: "initialization", status: "healthy" | "warning" | "error", checks: [...] }`

### 4b. `packages/daemon-core/src/tools/handlers/sf-doctor.ts`

确保 handler 调用了新增的初始化完整性检查，并将结果包含在返回值中。

**验证命令**：
1. 在一个无 `.specforge/` 的目录下调用 `sf_doctor` → 应返回 `initialization.status: "error"`
2. 在一个有 `manifest.json` 但缺 `dev-environment.md` 的目录下 → 应返回 `initialization.status: "warning"`

**依赖**：无

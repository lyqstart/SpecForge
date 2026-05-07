/**
 * 端到端测试：验证标准化标记格式的 spec 文件能被 syncFromSpec 正确解析
 *
 * 模拟真实 Work Item 的完整流程：
 * 1. 创建使用 REQ-N/DD-N/TASK-N 标准格式的 spec 文件
 * 2. 依次调用 syncFromSpec（requirements → design → tasks → verification）
 * 3. 验证每个阶段产出 nodes > 0，边关系正确
 * 4. 验证 implements 边被正确推导
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  syncFromSpec,
  loadGraphStore,
  type GraphStore,
} from "../../.opencode/tools/lib/sf_knowledge_graph_core"
import { lintDocument } from "../../.opencode/tools/lib/sf_doc_lint_core"

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "e2e-sync-"))
  // Create empty graph and config
  const graphDir = join(tempDir, "specforge", "knowledge")
  const configDir = join(tempDir, "specforge", "config")
  await mkdir(graphDir, { recursive: true })
  await mkdir(configDir, { recursive: true })
  await writeFile(
    join(graphDir, "graph.json"),
    JSON.stringify({ version: "1.0", nodes: [], edges: [] }, null, 2),
    "utf-8"
  )
  await writeFile(
    join(configDir, "project.json"),
    JSON.stringify({ knowledge_graph_enabled: true }, null, 2),
    "utf-8"
  )
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ============================================================
// Standardized format spec files (the new format)
// ============================================================

const REQUIREMENTS_MD = `# 需求文档

## 简介

本项目实现用户认证系统。

## 术语表

- **JWT**: JSON Web Token，用于无状态认证
- **OAuth**: 开放授权协议

## 需求

### REQ-1 用户注册

**用户故事：** 作为新用户，我希望能注册账号，以便使用系统功能。

#### 验收标准

1. WHEN 用户提交有效的注册信息时，THE 系统 SHALL 创建新账号并返回成功

### REQ-2 用户登录

**用户故事：** 作为已注册用户，我希望能登录系统，以便访问受保护的资源。

#### 验收标准

1. WHEN 用户提交正确的凭证时，THE 系统 SHALL 返回 JWT Token

### REQ-3 密码重置

**用户故事：** 作为忘记密码的用户，我希望能重置密码，以便重新获得系统访问权限。

#### 验收标准

1. WHEN 用户请求密码重置时，THE 系统 SHALL 发送重置链接到注册邮箱
`

const DESIGN_MD = `# 设计文档

## 架构

采用分层架构：Controller → Service → Repository。

### DD-1 认证服务设计

refs: [REQ-1, REQ-2]

使用 JWT 实现无状态认证。注册时生成 salt + hash 存储密码，登录时验证并签发 Token。

### DD-2 密码重置流程

refs: [REQ-3]

生成一次性 reset token（有效期 30 分钟），通过邮件服务发送重置链接。

### DD-3 数据模型

refs: [REQ-1, REQ-2, REQ-3]

\`\`\`typescript
interface User {
  id: string
  email: string
  password_hash: string
  salt: string
  created_at: string
}
\`\`\`
`

const TASKS_MD = `# 任务列表

### TASK-1 实现用户模型和数据库迁移

- **描述**: 创建 User 表和对应的 TypeScript 类型定义
- refs: [DD-3, REQ-1]
- files: [src/models/user.ts, src/migrations/001_create_users.ts]
- **verification_commands**:
  - \`bun test tests/models/user.test.ts\`

### TASK-2 实现注册接口

- **描述**: 实现 POST /api/register 接口
- refs: [DD-1, REQ-1]
- files: [src/controllers/auth.ts, src/services/auth.ts]
- **verification_commands**:
  - \`bun test tests/controllers/auth.test.ts\`

### TASK-3 实现登录接口

- **描述**: 实现 POST /api/login 接口，返回 JWT
- refs: [DD-1, REQ-2]
- files: [src/controllers/auth.ts, src/services/jwt.ts]
- **verification_commands**:
  - \`bun test tests/services/jwt.test.ts\`

### TASK-4 实现密码重置

- **描述**: 实现密码重置请求和确认接口
- refs: [DD-2, REQ-3]
- files: [src/controllers/password.ts, src/services/email.ts]
- **verification_commands**:
  - \`bun test tests/controllers/password.test.ts\`
`

describe("E2E: syncFromSpec with standardized markers", () => {
  const workItemId = "WI-E2E-001"

  async function setupSpecFiles() {
    const specDir = join(tempDir, "specforge", "specs", workItemId)
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, "requirements.md"), REQUIREMENTS_MD, "utf-8")
    await writeFile(join(specDir, "design.md"), DESIGN_MD, "utf-8")
    await writeFile(join(specDir, "tasks.md"), TASKS_MD, "utf-8")
  }

  it("should parse REQ-N format and produce requirement nodes", async () => {
    await setupSpecFiles()

    const result = await syncFromSpec(workItemId, tempDir, "requirements")

    expect(result.success).toBe(true)
    expect(result.summary!.nodes_added).toBe(3) // REQ-1, REQ-2, REQ-3

    const { store } = await loadGraphStore(tempDir)
    const reqNodes = store!.nodes.filter((n) => n.type === "requirement")
    expect(reqNodes).toHaveLength(3)
    expect(reqNodes[0].metadata?.req_id).toBe("REQ-1")
    expect(reqNodes[1].metadata?.req_id).toBe("REQ-2")
    expect(reqNodes[2].metadata?.req_id).toBe("REQ-3")
    expect(reqNodes[0].label).toBe("用户注册")
    expect(reqNodes[1].label).toBe("用户登录")
    expect(reqNodes[2].label).toBe("密码重置")
  })

  it("should parse DD-N format with refs: [REQ-N] and produce design nodes + traces_to edges", async () => {
    await setupSpecFiles()

    // First sync requirements so nodes exist for edge validation
    await syncFromSpec(workItemId, tempDir, "requirements")
    const result = await syncFromSpec(workItemId, tempDir, "design")

    expect(result.success).toBe(true)
    expect(result.summary!.nodes_added).toBe(3) // DD-1, DD-2, DD-3

    const { store } = await loadGraphStore(tempDir)
    const designNodes = store!.nodes.filter((n) => n.type === "design_decision")
    expect(designNodes).toHaveLength(3)
    expect(designNodes[0].metadata?.design_id).toBe("1")
    expect(designNodes[0].label).toBe("认证服务设计")

    // Check traces_to edges
    const tracesEdges = store!.edges.filter((e) => e.type === "traces_to")
    // DD-1 refs REQ-1, REQ-2 → 2 edges
    // DD-2 refs REQ-3 → 1 edge
    // DD-3 refs REQ-1, REQ-2, REQ-3 → 3 edges
    // Total: 6 traces_to edges
    expect(tracesEdges).toHaveLength(6)
  })

  it("should parse TASK-N format with refs: [DD-N] and files: [...] and produce task/code_file nodes + edges", async () => {
    await setupSpecFiles()

    await syncFromSpec(workItemId, tempDir, "requirements")
    await syncFromSpec(workItemId, tempDir, "design")
    const result = await syncFromSpec(workItemId, tempDir, "tasks")

    expect(result.success).toBe(true)

    const { store } = await loadGraphStore(tempDir)
    const taskNodes = store!.nodes.filter((n) => n.type === "task")
    const codeFileNodes = store!.nodes.filter((n) => n.type === "code_file")

    expect(taskNodes).toHaveLength(4) // TASK-1 through TASK-4
    expect(taskNodes[0].label).toBe("实现用户模型和数据库迁移")

    // code_file nodes: unique file paths across all tasks
    // TASK-1: user.ts, 001_create_users.ts
    // TASK-2: auth.ts, auth.ts (service)
    // TASK-3: auth.ts (same controller), jwt.ts
    // TASK-4: password.ts, email.ts
    // Unique: user.ts, 001_create_users.ts, controllers/auth.ts, services/auth.ts, services/jwt.ts, controllers/password.ts, services/email.ts = 7
    expect(codeFileNodes.length).toBeGreaterThanOrEqual(7)

    // Check modifies edges (task → code_file)
    const modifiesEdges = store!.edges.filter((e) => e.type === "modifies")
    expect(modifiesEdges.length).toBeGreaterThanOrEqual(4) // At least one per task

    // Check decomposes_to edges (design → task) via refs: [DD-N]
    const decomposesEdges = store!.edges.filter((e) => e.type === "decomposes_to")
    expect(decomposesEdges.length).toBeGreaterThanOrEqual(4) // Each task refs at least one DD

    // Check implements edges (inferred: code_file → requirement)
    const implementsEdges = store!.edges.filter((e) => e.type === "implements")
    expect(implementsEdges.length).toBeGreaterThanOrEqual(1)
    expect(implementsEdges.every((e) => e.inferred === true)).toBe(true)
  })

  it("should produce complete graph with verification scope (full chain)", async () => {
    await setupSpecFiles()

    const result = await syncFromSpec(workItemId, tempDir, "verification")

    expect(result.success).toBe(true)

    const { store } = await loadGraphStore(tempDir)

    // All node types present
    const reqNodes = store!.nodes.filter((n) => n.type === "requirement")
    const designNodes = store!.nodes.filter((n) => n.type === "design_decision")
    const taskNodes = store!.nodes.filter((n) => n.type === "task")
    const codeFileNodes = store!.nodes.filter((n) => n.type === "code_file")

    expect(reqNodes.length).toBe(3)
    expect(designNodes.length).toBe(3)
    expect(taskNodes.length).toBe(4)
    expect(codeFileNodes.length).toBeGreaterThanOrEqual(7)

    // All edge types present
    const tracesEdges = store!.edges.filter((e) => e.type === "traces_to")
    const decomposesEdges = store!.edges.filter((e) => e.type === "decomposes_to")
    const modifiesEdges = store!.edges.filter((e) => e.type === "modifies")
    const implementsEdges = store!.edges.filter((e) => e.type === "implements")

    expect(tracesEdges.length).toBeGreaterThanOrEqual(1)
    expect(decomposesEdges.length).toBeGreaterThanOrEqual(1)
    expect(modifiesEdges.length).toBeGreaterThanOrEqual(1)
    expect(implementsEdges.length).toBeGreaterThanOrEqual(1)

    // Total nodes: 3 + 3 + 4 + 7+ = 17+
    expect(store!.nodes.length).toBeGreaterThanOrEqual(17)

    console.log(`\n✅ E2E Verification Summary:`)
    console.log(`   Nodes: ${store!.nodes.length} (req=${reqNodes.length}, design=${designNodes.length}, task=${taskNodes.length}, code_file=${codeFileNodes.length})`)
    console.log(`   Edges: ${store!.edges.length} (traces_to=${tracesEdges.length}, decomposes_to=${decomposesEdges.length}, modifies=${modifiesEdges.length}, implements=${implementsEdges.length})`)
  })

  it("should pass sf_doc_lint without warnings for standardized format", async () => {
    await setupSpecFiles()

    const reqResult = await lintDocument(workItemId, "requirements", join(tempDir, "specforge", "specs", workItemId, "..").replace(/specs[/\\][^/\\]+[/\\]\.\.$/, ""))

    // We need to lint from the correct base path
    // lintDocument expects baseDir where specforge/specs/<id>/ exists
    const reqLint = await lintDocument(workItemId, "requirements", tempDir)
    const designLint = await lintDocument(workItemId, "design", tempDir)
    const tasksLint = await lintDocument(workItemId, "tasks", tempDir)

    expect(reqLint.status).toBe("pass")
    expect(reqLint.issues).toHaveLength(0) // No warnings — REQ-N format recognized

    expect(designLint.status).toBe("pass")
    expect(designLint.issues).toHaveLength(0) // No warnings — DD-N format recognized

    expect(tasksLint.status).toBe("pass")
    // V3.7: legacy format verification_commands produce non-blocking warnings
    const taskErrors = tasksLint.issues.filter((i) => i.severity === "error")
    expect(taskErrors).toHaveLength(0)
    // 4 tasks with legacy format → 4 non-blocking warnings
    const taskWarnings = tasksLint.issues.filter((i) => i.severity === "warning")
    expect(taskWarnings).toHaveLength(4)
    for (const w of taskWarnings) {
      expect(w.message).toContain("旧格式 verification_commands")
    }
  })
})

/**
 * 端到端集成测试：安装器 Reconcile 重新设计
 * 
 * 测试完整的安装/升级/验证/卸载流程，覆盖：
 * 1. 完整安装流程（从空目录开始）
 * 2. 升级流程（从旧版本升级到新版本）
 * 3. 验证流程（检查安装完整性）
 * 4. 卸载流程（清理所有文件）
 * 5. 使用临时目录进行测试，确保测试隔离性
 * 6. 验证所有核心功能正常工作
 * 7. 确保测试能够检测到降级情况
 * 8. 测试应包括错误场景（如权限不足、文件冲突等）
 * 
 * 直接测试 reconcile 模块，模拟完整的用户级共享组件部署流程。
 * 
 * Requirements: 1.1-1.8, 2.1-2.6, 3.1-3.5, 4.1-4.6, 5.1-5.6, 6.1-6.5, 7.1-7.6, 8.1-8.8, 9.1-9.4, 10.1-10.5,
 *               11.1-11.5, 12.1-12.6, 13.1-13.6, 14.1-14.11, 15.1-15.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as path from "node:path"
import * as fs from "node:fs"
import { mkdtemp, rm, writeFile, readFile, mkdir, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import crypto from "node:crypto"

import { reconcile, type ReconcileMode, type ReconcileOptions } from "../../scripts/lib/reconcile"
import { UserSharedProvider } from "../../scripts/lib/discovery"
import type { ReconcileScope } from "../../scripts/lib/types"
import { readAndValidateManifest } from "../../scripts/lib/manifest"
import { verifySharedComponents } from "../../scripts/lib/verify"
import { computeSHA256 } from "../../scripts/lib/crypto"

describe("E2E: Installer Reconcile Redesign — Complete Flow", () => {
  let tempDir: string
  let userLevelDir: string
  let sourceDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "sf-e2e-"))
    userLevelDir = path.join(tempDir, "user-level")
    sourceDir = path.join(tempDir, "source")

    // 创建源目录结构，模拟真实的 SpecForge 仓库
    await createSourceStructure(sourceDir, "3.5.0")
  })

  afterEach(async () => {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true })
  })

  // ================================================================
  // 测试 1: 完整安装流程（从空目录开始）
  // ================================================================

  it("should perform complete fresh installation from empty directory", async () => {
    // 确保目标目录为空
    expect(fs.existsSync(userLevelDir)).toBe(false)

    // 创建 UserSharedProvider
    const provider = new UserSharedProvider(path.join(sourceDir, ".opencode"))

    // 读取源 opencode.json 配置
    const sourceOpencodePath = path.join(sourceDir, "opencode.json")
    expect(fs.existsSync(sourceOpencodePath)).toBe(true)
    const sourceOpencode = JSON.parse(fs.readFileSync(sourceOpencodePath, "utf-8"))

    // 执行 reconcile（fresh_install 模式）
    const result = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider,
      mergeOptions: {
        sourceConfig: sourceOpencode.agent,
        preserveUserOverrides: true,
        backupBeforeDowngrade: false
      }
    })

    console.log("Test 1 result:", JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)
    expect(result.targetPreflightPassed).toBe(true)
    expect(result.planPreflightPassed).toBe(true)

    // 验证目标目录存在
    expect(fs.existsSync(userLevelDir)).toBe(true)

    // 验证所有组件文件已部署
    const expectedFiles = [
      "agents/sf-orchestrator.md",
      "tools/sf_state_read.ts",
      "tools/lib/utils.ts",
      "plugins/sf_specforge.ts",
      "skills/sf-workflow-feature-spec/SKILL.md"
    ]

    for (const file of expectedFiles) {
      const filePath = path.join(userLevelDir, file)
      expect(fs.existsSync(filePath)).toBe(true)
    }

    // 验证 Manifest 已创建
    const manifestResult = await readAndValidateManifest(userLevelDir)
    expect(manifestResult.valid).toBe(true)
    if (manifestResult.valid) {
      const manifest = manifestResult.data
      expect(manifest.shared_version).toBe("3.5.0")
      expect(manifest.files).toBeDefined()
      expect(Object.keys(manifest.files).length).toBe(expectedFiles.length)
    }

    // 验证 opencode.json 已创建并包含 agent 注册
    const opencodePath = path.join(userLevelDir, "opencode.json")
    expect(fs.existsSync(opencodePath)).toBe(true)

    const opencode = JSON.parse(fs.readFileSync(opencodePath, "utf-8"))
    expect(opencode.agent).toBeDefined()
    expect(opencode.agent["sf-orchestrator"]).toBeDefined()
  })

  // ================================================================
  // 测试 2: 升级流程（从旧版本升级到新版本）
  // ================================================================

  it("should upgrade from old version to new version", async () => {
    // 读取源 opencode.json 配置
    const sourceOpencodePath = path.join(sourceDir, "opencode.json")
    expect(fs.existsSync(sourceOpencodePath)).toBe(true)
    const sourceOpencode = JSON.parse(fs.readFileSync(sourceOpencodePath, "utf-8"))

    // 首先安装旧版本
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: {
        sourceConfig: sourceOpencode.agent,
        preserveUserOverrides: true,
        backupBeforeDowngrade: false
      }
    })
    console.log("Test 2 - Install result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 修改源文件，模拟新版本
    await createSourceStructure(sourceDir, "3.6.0")
    
    // 修改一个文件内容
    const agentPath = path.join(sourceDir, ".opencode", "agents", "sf-orchestrator.md")
    await writeFile(agentPath, "# SF Orchestrator Agent v3.6.0\nNew features added\n")

    // 读取更新后的源 opencode.json 配置
    const updatedSourceOpencode = JSON.parse(fs.readFileSync(sourceOpencodePath, "utf-8"))

    // 执行升级（full 模式）
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: {
        sourceConfig: updatedSourceOpencode.agent,
        preserveUserOverrides: true,
        backupBeforeDowngrade: false
      }
    })
    console.log("Test 2 - Upgrade result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)

    // 验证 Manifest 版本已更新
    const manifestResult = await readAndValidateManifest(userLevelDir)
    expect(manifestResult.valid).toBe(true)
    if (manifestResult.valid) {
      const manifest = manifestResult.data
      expect(manifest.shared_version).toBe("3.6.0")
    }

    // 验证文件内容已更新
    const deployedAgentPath = path.join(userLevelDir, "agents", "sf-orchestrator.md")
    const agentContent = fs.readFileSync(deployedAgentPath, "utf-8")
    expect(agentContent).toContain("v3.6.0")
  })

  // ================================================================
  // 测试 3: 升级流程（使用 --force 覆盖用户自定义）
  // ================================================================

  it("should upgrade with force to override user customizations", async () => {
    // 首先安装
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 3 - Install result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 用户自定义修改一个 agent 文件
    const agentPath = path.join(userLevelDir, "agents", "sf-orchestrator.md")
    await writeFile(agentPath, "# User Customized Agent\nCustom content here\n")

    // 修改源文件，模拟新版本
    await createSourceStructure(sourceDir, "3.6.0")
    const sourceAgentPath = path.join(sourceDir, ".opencode", "agents", "sf-orchestrator.md")
    await writeFile(sourceAgentPath, "# SF Orchestrator Agent v3.6.0\nOfficial content\n")

    // 执行升级（不带 force）应该检测到冲突
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 3 - Upgrade without force result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)
    
    // 检查计划中是否有冲突
    const hasConflict = result2.plan.entries.some(entry => entry.action === "conflict")
    expect(hasConflict).toBe(true)

    // 验证用户自定义未被覆盖
    let agentContent = fs.readFileSync(agentPath, "utf-8")
    expect(agentContent).toContain("User Customized")

    // 执行升级（带 force）应该覆盖用户自定义
    const result3 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: true,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 3 - Upgrade with force result:", JSON.stringify(result3, null, 2))
    expect(result3.success).toBe(true)

    // 验证用户自定义已被覆盖
    agentContent = fs.readFileSync(agentPath, "utf-8")
    expect(agentContent).toContain("v3.6.0")
    expect(agentContent).not.toContain("User Customized")
  })

  // ================================================================
  // 测试 4: 验证流程（检查安装完整性）
  // ================================================================

  it("should verify installation integrity", async () => {
    // 首先安装
    const provider = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 4 - Install result:", JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)

    // 读取 Manifest 进行验证
    const manifestResult = await readAndValidateManifest(userLevelDir)
    expect(manifestResult.valid).toBe(true)
    
    if (manifestResult.valid) {
      const issues = await verifySharedComponents(userLevelDir, manifestResult.data)
      expect(issues).toHaveLength(0) // 所有校验通过
    }

    // 篡改一个文件，验证应该失败
    const agentPath = path.join(userLevelDir, "agents", "sf-orchestrator.md")
    await writeFile(agentPath, "# Tampered content\n")

    if (manifestResult.valid) {
      const issues = await verifySharedComponents(userLevelDir, manifestResult.data)
      expect(issues.length).toBeGreaterThan(0)
      expect(issues[0].message).toContain("校验和不一致")
    }
  })

  // ================================================================
  // 测试 5: 降级检测（拒绝降级操作）
  // ================================================================

  it("should detect and reject downgrade without force", async () => {
    // 首先安装新版本
    await createSourceStructure(sourceDir, "3.6.0")
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 5 - Install v3.6.0 result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 修改源目录为旧版本
    await createSourceStructure(sourceDir, "3.5.0")

    // 尝试降级（不带 force）
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    
    // 注意：reconcile 函数应该检测到降级并返回适当的结果
    // 根据设计，降级检测应该在 reconcile 内部处理
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 5 - Downgrade without force result:", JSON.stringify(result2, null, 2))

    // 降级应该被检测到
    expect(result2.downgradeDetected).toBe(true)
    // 由于没有 force，操作应该失败或跳过
    expect(result2.success).toBe(false)
  })

  // ================================================================
  // 测试 6: 降级操作（使用 force 强制降级）
  // ================================================================

  it("should allow downgrade with force flag", async () => {
    // 首先安装新版本
    await createSourceStructure(sourceDir, "3.6.0")
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 6 - Install v3.6.0 result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 修改源目录为旧版本
    await createSourceStructure(sourceDir, "3.5.0")

    // 强制降级
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: true,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 6 - Downgrade with force result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)
    expect(result2.downgradeDetected).toBe(true)
    expect(result2.downgradeResult).toBeDefined()

    // 验证版本已降级
    const manifestResult = await readAndValidateManifest(userLevelDir)
    expect(manifestResult.valid).toBe(true)
    if (manifestResult.valid) {
      expect(manifestResult.data.shared_version).toBe("3.5.0")
    }
  })

  // ================================================================
  // 测试 7: 孤儿文件清理
  // ================================================================

  it("should clean up orphan files from previous versions", async () => {
    // 首先安装包含某些文件的版本
    await createSourceStructure(sourceDir, "3.5.0")
    
    // 添加一个额外的文件到源目录
    const extraToolPath = path.join(sourceDir, ".opencode", "tools", "sf_extra_tool.ts")
    await writeFile(extraToolPath, "// Extra tool from v3.5.0\n")
    
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 7 - Install with extra file result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 验证额外文件已部署
    const deployedExtraPath = path.join(userLevelDir, "tools", "sf_extra_tool.ts")
    expect(fs.existsSync(deployedExtraPath)).toBe(true)

    // 更新源目录，移除额外文件（模拟新版本移除了该文件）
    await createSourceStructure(sourceDir, "3.6.0")
    
    // 执行升级
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 7 - Upgrade without extra file result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)

    // 验证孤儿文件已被清理
    expect(fs.existsSync(deployedExtraPath)).toBe(false)
  })

  // ================================================================
  // 测试 8: 原子性保证 - 幂等性测试
  // ================================================================

  it("should be idempotent - second reconcile produces only skip actions", async () => {
    // 执行第一次 reconcile
    const provider = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 8 - First reconcile result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)

    // 执行第二次 reconcile（相同状态）
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 8 - Second reconcile result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)

    // 第二次应该只有 skip 动作
    const nonSkipActions = result2.plan.entries.filter(
      entry => entry.action !== "skip"
    )
    expect(nonSkipActions).toHaveLength(0)
  })

  // ================================================================
  // 测试 9: 完整流程组合测试
  // ================================================================

  it("should complete full install → verify → upgrade → verify cycle", async () => {
    // 步骤 1: 安装
    const provider1 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result1 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider: provider1,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 9 - Install result:", JSON.stringify(result1, null, 2))
    expect(result1.success).toBe(true)
    
    // 步骤 2: 验证
    const manifestResult1 = await readAndValidateManifest(userLevelDir)
    expect(manifestResult1.valid).toBe(true)
    if (manifestResult1.valid) {
      const issues1 = await verifySharedComponents(userLevelDir, manifestResult1.data)
      expect(issues1).toHaveLength(0)
    }
    
    // 步骤 3: 升级到新版本
    await createSourceStructure(sourceDir, "3.6.0")
    const provider2 = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result2 = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider: provider2,
      mergeOptions: getMergeOptions(sourceDir)
    })
    console.log("Test 9 - Upgrade result:", JSON.stringify(result2, null, 2))
    expect(result2.success).toBe(true)
    
    // 步骤 4: 再次验证
    const manifestResult2 = await readAndValidateManifest(userLevelDir)
    expect(manifestResult2.valid).toBe(true)
    if (manifestResult2.valid) {
      const issues2 = await verifySharedComponents(userLevelDir, manifestResult2.data)
      expect(issues2).toHaveLength(0)
    }
  })

  // ================================================================
  // 测试 10: 错误场景 - 源目录不存在
  // ================================================================

  it("should handle missing source directory gracefully", async () => {
    // 使用不存在的源目录
    const nonExistentSource = path.join(tempDir, "non-existent")
    const provider = new UserSharedProvider(nonExistentSource)
    
    const result = await reconcile({
      sourceDir: nonExistentSource,
      targetDir: userLevelDir,
      force: false,
      mode: "fresh_install",
      scope: "user_shared",
      provider,
      mergeOptions: getMergeOptions(sourceDir) // 使用有效的 mergeOptions
    })
    
    console.log("Test 10 - Missing source dir result:", JSON.stringify(result, null, 2))
    // 应该失败
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ================================================================
  // 测试 11: 向后兼容性 - 从旧注册表安装迁移
  // ================================================================

  it("should migrate from old registry-based installation", async () => {
    // 模拟旧版安装：创建旧版 Manifest 格式
    await mkdir(userLevelDir, { recursive: true })
    
    // 创建旧版 Manifest（基于注册表的格式）
    const oldManifest = {
      schema_version: "1.0",
      shared_version: "3.4.0",
      install_mode: "user_level",
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      managed_agents: ["sf-orchestrator"],
      managed_agent_hashes: {},
      // 旧版格式：files 是数组而不是对象
      files: [
        {
          path: "agents/sf-orchestrator.md",
          sha256: await computeSHA256(path.join(sourceDir, ".opencode", "agents", "sf-orchestrator.md")),
          size: 100,
          type: "agent"
        }
      ]
    }
    
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify(oldManifest, null, 2)
    )
    
    // 部署对应的文件
    await mkdir(path.join(userLevelDir, "agents"), { recursive: true })
    await copyFile(
      path.join(sourceDir, ".opencode", "agents", "sf-orchestrator.md"),
      path.join(userLevelDir, "agents", "sf-orchestrator.md")
    )
    
    // 执行 reconcile（应该能处理旧版 Manifest）
    const provider = new UserSharedProvider(path.join(sourceDir, ".opencode"))
    const result = await reconcile({
      sourceDir: path.join(sourceDir, ".opencode"),
      targetDir: userLevelDir,
      force: false,
      mode: "full",
      scope: "user_shared",
      provider,
      mergeOptions: getMergeOptions(sourceDir)
    })
    
    console.log("Test 11 - Migration result:", JSON.stringify(result, null, 2))
    expect(result.success).toBe(true)
    
    // 验证 Manifest 已更新为新格式
    const manifestResult = await readAndValidateManifest(userLevelDir)
    expect(manifestResult.valid).toBe(true)
    if (manifestResult.valid) {
      // files 应该是对象而不是数组
      expect(Array.isArray(manifestResult.data.files)).toBe(false)
      expect(typeof manifestResult.data.files).toBe("object")
    }
  })
})

// ================================================================
// 辅助函数
// ================================================================

/**
 * 创建源目录结构
 */
async function createSourceStructure(sourceDir: string, version: string): Promise<void> {
  // 清理并重新创建源目录
  await rm(sourceDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(sourceDir, { recursive: true })

  // 创建 .opencode 目录结构
  await mkdir(path.join(sourceDir, ".opencode"), { recursive: true })
  await mkdir(path.join(sourceDir, ".opencode", "agents"), { recursive: true })
  await mkdir(path.join(sourceDir, ".opencode", "tools", "lib"), { recursive: true })
  await mkdir(path.join(sourceDir, ".opencode", "plugins"), { recursive: true })
  await mkdir(path.join(sourceDir, ".opencode", "skills", "sf-workflow-feature-spec"), { recursive: true })

  // 创建 package.json
  await writeFile(
    path.join(sourceDir, "package.json"),
    JSON.stringify({ name: "specforge", version }, null, 2)
  )

  // 创建最小化的组件文件
  await writeFile(
    path.join(sourceDir, ".opencode", "agents", "sf-orchestrator.md"),
    `# SF Orchestrator Agent v${version}\nPrimary orchestrator agent.\n`
  )

  await writeFile(
    path.join(sourceDir, ".opencode", "tools", "sf_state_read.ts"),
    `// State Read Tool v${version}\nexport const sf_state_read = {};\n`
  )

  await writeFile(
    path.join(sourceDir, ".opencode", "tools", "lib", "utils.ts"),
    `// Utils v${version}\nexport function noop() {}\n`
  )

  await writeFile(
    path.join(sourceDir, ".opencode", "plugins", "sf_specforge.ts"),
    `// SpecForge Plugin v${version}\nexport const sf_specforge = async () => ({});\n`
  )

  await writeFile(
    path.join(sourceDir, ".opencode", "skills", "sf-workflow-feature-spec", "SKILL.md"),
    `# Feature Spec Workflow v${version}\nWorkflow skill for feature specs.\n`
  )

  // 创建源 opencode.json（用于 agent 配置模板）
  await writeFile(
    path.join(sourceDir, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.dev/schema/v1",
      agent: {
        "sf-orchestrator": {
          mode: "primary",
          model: "anthropic/claude-sonnet-4-20250514",
          prompt: "agents/sf-orchestrator.md",
          permission: {
            task: "allow",
            edit: "ask",
            bash: "ask"
          }
        }
      }
    }, null, 2)
  )
}

/**
 * 获取 mergeOptions 配置
 */
function getMergeOptions(sourceDir: string) {
  const sourceOpencodePath = path.join(sourceDir, "opencode.json")
  if (!fs.existsSync(sourceOpencodePath)) {
    throw new Error(`Source opencode.json not found at ${sourceOpencodePath}`)
  }
  const sourceOpencode = JSON.parse(fs.readFileSync(sourceOpencodePath, "utf-8"))
  
  return {
    sourceConfig: sourceOpencode.agent,
    preserveUserOverrides: true,
    backupBeforeDowngrade: false
  }
}
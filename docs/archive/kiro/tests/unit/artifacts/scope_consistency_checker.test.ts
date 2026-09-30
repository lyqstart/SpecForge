/**
 * Unit tests for scope_consistency_checker.ts
 * 
 * Tests for task 5.3: 实现 scope 一致性校验
 * 
 * Requirements: 25.4, 30.15
 * Property 15: Scope Boundary
 * 
 * 包含故意把某个 stub 标为 `p0` 但引用 P1 能力的反例 fixture，断言验证器正确 fail
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { fileURLToPath } from "url"
import { dirname } from "path"

// Import the functions to test
import {
  validateScopeConsistency,
  parseScopeBoundary,
  readSpecConfig,
  SpecConfig,
  ScopeBoundary,
  detectP1P2References
} from "../../../.kiro/specs/v6-architecture-overview/artifacts/scope_consistency_checker"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================
// Test Helpers
// ============================================================

/**
 * Create a temporary test directory structure
 */
async function createTestDir(): Promise<string> {
  const testDir = join(__dirname, `test-scope-${Date.now()}-${Math.random().toString(36).substring(2)}`)
  await mkdir(testDir, { recursive: true })
  return testDir
}

/**
 * Clean up test directory
 */
async function cleanupTestDir(testDir: string): Promise<void> {
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true, force: true })
  }
}

/**
 * Create a mock requirements.md with REQ-25 content
 */
async function createMockRequirements(testDir: string): Promise<string> {
  const requirementsPath = join(testDir, "requirements.md")
  
  const content = `# Requirements Document

## Requirements

### Requirement 25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为 V6.0 的项目经理，我希望范围被明确切分为 P0 / P1 / P2，避免"边做边加"。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 以列表形式列出 V6.0 P0 必做项（共 27 项），分组为：
   - 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。
   - 核心能力（10 Agent、Feature Spec workflow、4 Gate、state.json、events.jsonl、Thin Plugin，共 6 项）。
   - 可观测性基础（Event Bus、CAS、三级模式、基础日志、sf-analyst，共 5 项）。
   - 扩展机制骨架（Skill 加载、Tool 注册、内置 Workflow，共 3 项）。
   - 分发（npm 包、安装向导、schema_version + 迁移框架，共 3 项）。

2. THE Requirements_Document SHALL 以列表形式列出 V6.1 P1 项（共 15 项），包含 bugfix workflow、design-first workflow、quick change workflow、Knowledge Graph、全局知识库 + sf-knowledge、Context Builder、成本追踪、并行任务调度、跨会话续接、Telegram Webhook 通知、用户自定义 Tool、用户自定义 Skill、sf-debugger 自愈闭环、Workflow 数据驱动扩展、Gate 组合。

3. THE Requirements_Document SHALL 以列表形式列出 V6.x P2 项，包含多模态完整支持、自愈完整闭环、V3.6 四工作流（change_request / refactor / ops_task / investigation）、插件沙箱、多机同步、Web UI、跨项目自动学习。

4. WHEN 某项被明确列入 P1 或 P2，THE V6_0_Scope SHALL 禁止在 V6.0 交付该项。

5. THE Requirements_Document SHALL 允许在 ADR（记录在 design.md）中调整 P0 / P1 / P2 归属，但必须同步更新本文档。
`
  
  await writeFile(requirementsPath, content, "utf-8")
  return requirementsPath
}

/**
 * Create a mock spec directory with .config.kiro file
 */
async function createMockSpec(
  specsRoot: string,
  specName: string,
  scopeTag: 'p0' | 'p1' | 'p2' = 'p0',
  parentSpec: string = 'v6-architecture-overview'
): Promise<void> {
  const specDir = join(specsRoot, specName)
  await mkdir(specDir, { recursive: true })
  
  const config = {
    specId: specName,
    workflowType: "requirements-first",
    specType: "feature",
    scopeTag,
    parentSpec
  }
  
  await writeFile(
    join(specDir, ".config.kiro"),
    JSON.stringify(config, null, 2),
    "utf-8"
  )
}

/**
 * Create a mock spec without scopeTag (invalid)
 */
async function createMockSpecWithoutScopeTag(
  specsRoot: string,
  specName: string
): Promise<void> {
  const specDir = join(specsRoot, specName)
  await mkdir(specDir, { recursive: true })
  
  const config = {
    specId: specName,
    workflowType: "requirements-first",
    specType: "feature",
    parentSpec: "v6-architecture-overview"
    // Missing scopeTag intentionally
  }
  
  await writeFile(
    join(specDir, ".config.kiro"),
    JSON.stringify(config, null, 2),
    "utf-8"
  )
}

/**
 * Create a mock spec with invalid scopeTag value
 */
async function createMockSpecWithInvalidScopeTag(
  specsRoot: string,
  specName: string
): Promise<void> {
  const specDir = join(specsRoot, specName)
  await mkdir(specDir, { recursive: true })
  
  const config = {
    specId: specName,
    workflowType: "requirements-first",
    specType: "feature",
    scopeTag: "invalid",  // Invalid value
    parentSpec: "v6-architecture-overview"
  }
  
  await writeFile(
    join(specDir, ".config.kiro"),
    JSON.stringify(config, null, 2),
    "utf-8"
  )
}

/**
 * Create a mock spec with P1/P2 capability references
 */
async function createMockSpecWithP1P2References(
  specsRoot: string,
  specName: string,
  scopeTag: 'p0' | 'p1' | 'p2' = 'p0',
  references: string[] = []
): Promise<void> {
  const specDir = join(specsRoot, specName)
  await mkdir(specDir, { recursive: true })
  
  // Create config
  const config = {
    specId: specName,
    workflowType: "requirements-first",
    specType: "feature",
    scopeTag,
    parentSpec: "v6-architecture-overview"
  }
  
  await writeFile(
    join(specDir, ".config.kiro"),
    JSON.stringify(config, null, 2),
    "utf-8"
  )
  
  // Create requirements.md with P1/P2 references
  if (references.length > 0) {
    const requirementsContent = `# Requirements Document: ${specName}

## Introduction

This spec references the following P1/P2 capabilities: ${references.join(', ')}.

## Requirements

### Requirement 1: Test P1/P2 References

This requirement depends on ${references[0]} capability.

**Validates: Requirements 25.4**
`
    
    await writeFile(
      join(specDir, "requirements.md"),
      requirementsContent,
      "utf-8"
    )
  }
}

// ============================================================
// Unit Tests
// ============================================================

describe("scope_consistency_checker", () => {
  let testDir: string
  let specsRoot: string
  let requirementsPath: string
  
  beforeEach(async () => {
    testDir = await createTestDir()
    specsRoot = join(testDir, "specs")
    await mkdir(specsRoot, { recursive: true })
    requirementsPath = await createMockRequirements(testDir)
  })
  
  afterEach(async () => {
    await cleanupTestDir(testDir)
  })
  
  describe("parseScopeBoundary", () => {
    it("should parse REQ-25 scope boundary successfully", async () => {
      const result = parseScopeBoundary(requirementsPath)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
      
      if (result.data) {
        expect(result.data.p0).toBeInstanceOf(Array)
        expect(result.data.p1).toBeInstanceOf(Array)
        expect(result.data.p2).toBeInstanceOf(Array)
        
        // Check that P0 items were parsed
        expect(result.data.p0.length).toBeGreaterThan(0)
        
        // Check P0 item structure
        const p0Item = result.data.p0[0]
        expect(p0Item).toHaveProperty('label')
        expect(p0Item).toHaveProperty('priority', 'p0')
        expect(p0Item).toHaveProperty('category')
      }
    })
    
    it("should return error when REQ-25 not found", async () => {
      const invalidPath = join(testDir, "invalid-requirements.md")
      await writeFile(invalidPath, "# No REQ-25 here", "utf-8")
      
      const result = parseScopeBoundary(invalidPath)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('未找到 REQ-25 章节')
      expect(result.data).toBeUndefined()
    })
    
    it("should handle file not found error", async () => {
      const nonExistentPath = join(testDir, "non-existent.md")
      
      const result = parseScopeBoundary(nonExistentPath)
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })
  
  describe("readSpecConfig", () => {
    it("should read valid spec config successfully", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      const config = {
        specId: "test-spec",
        workflowType: "requirements-first",
        specType: "feature",
        scopeTag: "p0",
        parentSpec: "v6-architecture-overview"
      }
      
      await writeFile(
        join(specDir, ".config.kiro"),
        JSON.stringify(config, null, 2),
        "utf-8"
      )
      
      const result = readSpecConfig(specDir)
      
      expect(result).not.toBeNull()
      if (result) {
        expect(result.specId).toBe("test-spec")
        expect(result.workflowType).toBe("requirements-first")
        expect(result.specType).toBe("feature")
        expect(result.scopeTag).toBe("p0")
        expect(result.parentSpec).toBe("v6-architecture-overview")
      }
    })
    
    it("should return null for missing config file", async () => {
      const specDir = join(specsRoot, "no-config-spec")
      await mkdir(specDir, { recursive: true })
      
      const result = readSpecConfig(specDir)
      
      expect(result).toBeNull()
    })
    
    it("should return null for config missing required fields", async () => {
      const specDir = join(specsRoot, "invalid-spec")
      await mkdir(specDir, { recursive: true })
      
      const config = {
        // Missing specId, workflowType, specType, scopeTag
        someField: "value"
      }
      
      await writeFile(
        join(specDir, ".config.kiro"),
        JSON.stringify(config, null, 2),
        "utf-8"
      )
      
      const result = readSpecConfig(specDir)
      
      expect(result).toBeNull()
    })
    
    it("should return null for invalid scopeTag value", async () => {
      const specDir = join(specsRoot, "invalid-scope-spec")
      await mkdir(specDir, { recursive: true })
      
      const config = {
        specId: "invalid-scope-spec",
        workflowType: "requirements-first",
        specType: "feature",
        scopeTag: "invalid-value"  // Not one of 'p0', 'p1', 'p2'
      }
      
      await writeFile(
        join(specDir, ".config.kiro"),
        JSON.stringify(config, null, 2),
        "utf-8"
      )
      
      const result = readSpecConfig(specDir)
      
      expect(result).toBeNull()
    })
    
    it("should handle JSON parse error", async () => {
      const specDir = join(specsRoot, "malformed-spec")
      await mkdir(specDir, { recursive: true })
      
      // Write invalid JSON
      await writeFile(
        join(specDir, ".config.kiro"),
        "{ invalid json }",
        "utf-8"
      )
      
      const result = readSpecConfig(specDir)
      
      expect(result).toBeNull()
    })
  })
  
  describe("detectP1P2References", () => {
    it("should detect P1 capability references", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      // Create requirements.md with P1 reference (using exact capability names)
      const requirementsContent = `# Requirements Document
      
This spec depends on knowledge graph 集成 and sf-knowledge 完整 capabilities.
We also need sf-debugger 自愈闭环 support.
`
      
      await writeFile(
        join(specDir, "requirements.md"),
        requirementsContent,
        "utf-8"
      )
      
      const references = detectP1P2References(specDir)
      
      expect(references).toContain("knowledge graph 集成")
      expect(references).toContain("sf-knowledge 完整")
      expect(references).toContain("sf-debugger 自愈闭环")
      expect(references.length).toBe(3)
    })
    
    it("should detect P2 capability references", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      // Create design.md with P2 reference (using exact capability names)
      const designContent = `# Design Document
      
This design requires 多模态完整支持 and 插件沙箱 capabilities.
We also need web ui 集成 for administration.
`
      
      await writeFile(
        join(specDir, "design.md"),
        designContent,
        "utf-8"
      )
      
      const references = detectP1P2References(specDir)
      
      expect(references).toContain("多模态完整支持")
      expect(references).toContain("插件沙箱")
      expect(references).toContain("web ui 集成")
      expect(references.length).toBe(3)
    })
    
    it("should detect references in both requirements and design files", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      // Create requirements.md with P1 reference
      await writeFile(
        join(specDir, "requirements.md"),
        "This spec uses knowledge graph 集成.",
        "utf-8"
      )
      
      // Create design.md with P2 reference
      await writeFile(
        join(specDir, "design.md"),
        "This design requires 多模态完整支持.",
        "utf-8"
      )
      
      const references = detectP1P2References(specDir)
      
      expect(references).toContain("knowledge graph 集成")
      expect(references).toContain("多模态完整支持")
      expect(references.length).toBe(2)
    })
    
    it("should return empty array when no references found", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      // Create requirements.md without P1/P2 references
      await writeFile(
        join(specDir, "requirements.md"),
        "This spec only uses P0 capabilities like Daemon and Session Registry.",
        "utf-8"
      )
      
      const references = detectP1P2References(specDir)
      
      expect(references).toEqual([])
    })
    
    it("should handle missing files gracefully", async () => {
      const specDir = join(specsRoot, "test-spec")
      await mkdir(specDir, { recursive: true })
      
      // Don't create any files
      const references = detectP1P2References(specDir)
      
      expect(references).toEqual([])
    })
  })
  
  describe("validateScopeConsistency", () => {
    it("should pass validation with all valid specs", async () => {
      // Create valid specs with proper scopeTags
      await createMockSpec(specsRoot, "daemon-core", "p0")
      await createMockSpec(specsRoot, "observability", "p0")
      await createMockSpec(specsRoot, "permission-engine", "p0")
      await createMockSpec(specsRoot, "multimodal", "p0")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      expect(result.success).toBe(true)
      expect(result.errorCode).toBeUndefined()
      expect(result.error).toBeUndefined()
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(4)
        expect(result.details.passedSpecs).toBe(4)
        expect(result.details.failedSpecs).toBe(0)
        expect(result.details.failures).toBeUndefined()
        expect(result.details.scopeStats.p0).toBe(4)
        expect(result.details.scopeStats.p1).toBe(0)
        expect(result.details.scopeStats.p2).toBe(0)
        expect(result.details.scopeStats.missingScopeTag).toBe(0)
      }
    })
    
    it("should fail validation with specs missing scopeTag", async () => {
      // Create some valid specs
      await createMockSpec(specsRoot, "daemon-core", "p0")
      await createMockSpec(specsRoot, "observability", "p0")
      
      // Create spec without scopeTag
      await createMockSpecWithoutScopeTag(specsRoot, "invalid-spec")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.error).toContain('scope 边界违例')
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(3)
        expect(result.details.passedSpecs).toBe(2)
        expect(result.details.failedSpecs).toBe(1)
        expect(result.details.failures).toBeDefined()
        expect(result.details.failures?.length).toBe(1)
        expect(result.details.failures?.[0].specName).toBe("invalid-spec")
        expect(result.details.failures?.[0].errorCode).toBe("v6_scope_boundary_missing_config")
        expect(result.details.scopeStats.missingScopeTag).toBe(1)
      }
    })
    
    it("should fail validation with specs having invalid scopeTag value", async () => {
      // Create some valid specs
      await createMockSpec(specsRoot, "daemon-core", "p0")
      
      // Create spec with invalid scopeTag
      await createMockSpecWithInvalidScopeTag(specsRoot, "invalid-scope-spec")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.failedSpecs).toBe(1)
        expect(result.details.failures).toBeDefined()
        expect(result.details.failures?.[0].specName).toBe("invalid-scope-spec")
        expect(result.details.scopeStats.missingScopeTag).toBe(1)
      }
    })
    
    it("should handle mixed valid and invalid specs", async () => {
      // Create valid specs
      await createMockSpec(specsRoot, "daemon-core", "p0")
      await createMockSpec(specsRoot, "observability", "p0")
      await createMockSpec(specsRoot, "permission-engine", "p0")
      
      // Create invalid specs
      await createMockSpecWithoutScopeTag(specsRoot, "missing-scope-spec")
      await createMockSpecWithInvalidScopeTag(specsRoot, "invalid-value-spec")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(5)
        expect(result.details.passedSpecs).toBe(3)
        expect(result.details.failedSpecs).toBe(2)
        expect(result.details.failures?.length).toBe(2)
        expect(result.details.scopeStats.p0).toBe(3)
        expect(result.details.scopeStats.missingScopeTag).toBe(2)
      }
    })
    
    it("should return error when specs root directory does not exist", async () => {
      const nonExistentRoot = join(testDir, "non-existent-specs")
      
      const result = validateScopeConsistency(nonExistentRoot, requirementsPath)
      
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_specs_root_not_found")
      expect(result.error).toContain('Specs 根目录不存在')
    })
    
    it("should return error when requirements file cannot be parsed", async () => {
      await createMockSpec(specsRoot, "daemon-core", "p0")
      
      const invalidRequirementsPath = join(testDir, "invalid-req.md")
      await writeFile(invalidRequirementsPath, "# No REQ-25", "utf-8")
      
      const result = validateScopeConsistency(specsRoot, invalidRequirementsPath)
      
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_parsing_failed")
      expect(result.error).toBeDefined()
      // The error could be either "未找到 REQ-25 章节" or "无法解析 REQ-25 范围边界"
      expect(result.error).toMatch(/REQ-25/)
    })
    
    it("should handle specs with different scopeTags", async () => {
      // Create specs with different scopeTags
      await createMockSpec(specsRoot, "daemon-core", "p0")
      await createMockSpec(specsRoot, "observability", "p0")
      await createMockSpec(specsRoot, "future-feature", "p1")
      await createMockSpec(specsRoot, "experimental", "p2")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      expect(result.success).toBe(true)  // All have valid scopeTags
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(4)
        expect(result.details.passedSpecs).toBe(4)
        expect(result.details.failedSpecs).toBe(0)
        expect(result.details.scopeStats.p0).toBe(2)
        expect(result.details.scopeStats.p1).toBe(1)
        expect(result.details.scopeStats.p2).toBe(1)
        expect(result.details.scopeStats.missingScopeTag).toBe(0)
      }
    })
    
    it("should handle empty specs directory", async () => {
      // Create empty specs directory
      const emptySpecsRoot = join(testDir, "empty-specs")
      await mkdir(emptySpecsRoot, { recursive: true })
      
      const result = validateScopeConsistency(emptySpecsRoot, requirementsPath)
      
      expect(result.success).toBe(true)
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(0)
        expect(result.details.passedSpecs).toBe(0)
        expect(result.details.failedSpecs).toBe(0)
        expect(result.details.scopeStats.p0).toBe(0)
        expect(result.details.scopeStats.p1).toBe(0)
        expect(result.details.scopeStats.p2).toBe(0)
        expect(result.details.scopeStats.missingScopeTag).toBe(0)
      }
    })
  })
  
  describe("Property 15: Scope Boundary validation (task 5.4 requirement)", () => {
    it("should detect P0 spec that references P1/P2 capabilities", async () => {
      // Create a P0 spec that references P1 capabilities
      await createMockSpecWithP1P2References(
        specsRoot,
        "p0-spec-with-p1-refs",
        "p0",
        ["knowledge graph 集成", "sf-knowledge 完整"]
      )
      
      // Create a valid P0 spec without P1/P2 references
      await createMockSpec(specsRoot, "valid-p0-spec", "p0")
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      // Validation should fail because P0 spec references P1 capabilities
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(2)
        expect(result.details.passedSpecs).toBe(1)
        expect(result.details.failedSpecs).toBe(1)
        expect(result.details.failures?.length).toBe(1)
        expect(result.details.failures?.[0].specName).toBe("p0-spec-with-p1-refs")
        expect(result.details.failures?.[0].errorCode).toBe("v6_scope_boundary_violation")
        expect(result.details.failures?.[0].reason).toContain("P0 spec 引用了 P1/P2 能力")
      }
    })
    
    it("should allow P1 spec to reference P1 capabilities", async () => {
      // Create a P1 spec that references P1 capabilities (this is allowed)
      await createMockSpecWithP1P2References(
        specsRoot,
        "p1-spec-with-p1-refs",
        "p1",
        ["knowledge graph 集成", "sf-knowledge 完整"]
      )
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      // Validation should pass because P1 spec can reference P1 capabilities
      expect(result.success).toBe(true)
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(1)
        expect(result.details.passedSpecs).toBe(1)
        expect(result.details.failedSpecs).toBe(0)
        expect(result.details.scopeStats.p1).toBe(1)
      }
    })
    
    it("should allow P2 spec to reference P2 capabilities", async () => {
      // Create a P2 spec that references P2 capabilities (this is allowed)
      await createMockSpecWithP1P2References(
        specsRoot,
        "p2-spec-with-p2-refs",
        "p2",
        ["多模态完整支持", "插件沙箱"]
      )
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      // Validation should pass because P2 spec can reference P2 capabilities
      expect(result.success).toBe(true)
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(1)
        expect(result.details.passedSpecs).toBe(1)
        expect(result.details.failedSpecs).toBe(0)
        expect(result.details.scopeStats.p2).toBe(1)
      }
    })
    
    it("should detect P0 spec that references P2 capabilities", async () => {
      // Create a P0 spec that references P2 capabilities
      await createMockSpecWithP1P2References(
        specsRoot,
        "p0-spec-with-p2-refs",
        "p0",
        ["多模态完整支持", "web ui 集成"]
      )
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      // Validation should fail because P0 spec references P2 capabilities
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.failedSpecs).toBe(1)
        expect(result.details.failures?.[0].specName).toBe("p0-spec-with-p2-refs")
        expect(result.details.failures?.[0].errorCode).toBe("v6_scope_boundary_violation")
        expect(result.details.failures?.[0].reason).toContain("P0 spec 引用了 P1/P2 能力")
      }
    })
    
    it("should handle mixed valid and invalid specs", async () => {
      // Create valid P0 spec
      await createMockSpec(specsRoot, "valid-p0-spec", "p0")
      
      // Create P0 spec with P1 references (invalid)
      await createMockSpecWithP1P2References(
        specsRoot,
        "invalid-p0-spec",
        "p0",
        ["knowledge graph 集成"]
      )
      
      // Create P1 spec with P1 references (valid)
      await createMockSpecWithP1P2References(
        specsRoot,
        "valid-p1-spec",
        "p1",
        ["sf-knowledge 完整"]
      )
      
      const result = validateScopeConsistency(specsRoot, requirementsPath)
      
      // Validation should fail because one P0 spec has P1 references
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe("v6_scope_boundary_violation")
      expect(result.details).toBeDefined()
      
      if (result.details) {
        expect(result.details.totalSpecs).toBe(3)
        expect(result.details.passedSpecs).toBe(2)
        expect(result.details.failedSpecs).toBe(1)
        expect(result.details.failures?.length).toBe(1)
        expect(result.details.failures?.[0].specName).toBe("invalid-p0-spec")
        expect(result.details.scopeStats.p0).toBe(2)  // Both P0 specs counted
        expect(result.details.scopeStats.p1).toBe(1)
      }
    })
  })
})
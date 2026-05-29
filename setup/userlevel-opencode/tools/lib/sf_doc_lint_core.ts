/**
 * sf_doc_lint 核心逻辑
 * 检查规格文档的结构合规性
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, REQ-3 AC-8, REQ-8 AC-6
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseTaskVerification } from "./sf_markdown_verification_parser"
import { isValidVerificationType } from "./sf_verification_types"
import { logErrorToFile } from "./utils"

const SPEC_DIR_NAME = '.specforge' as const;

// ============================================================
// Types
// ============================================================

export type DocType = "requirements" | "design" | "tasks" | "bugfix"

export interface LintIssue {
  severity: "error" | "warning" | "info"
  message: string
  location: string
  errorCode?: string
}

export interface DocLintResult {
  status: "pass" | "fail"
  issues: LintIssue[]
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行文档 lint 检查
 *
 * @param workItemId - Work Item ID
 * @param docType - 文档类型
 * @param baseDir - 项目根目录路径
 * @returns lint 检查结果
 */
export async function lintDocument(
  workItemId: string,
  docType: DocType,
  baseDir: string
): Promise<DocLintResult> {
  try {
    const specDir = join(baseDir, SPEC_DIR_NAME, "specs", workItemId)
    const docFileName = getDocFileName(docType)
    const docPath = join(specDir, docFileName)

    // 1. 读取文档
    let content: string
    try {
      content = await readFile(docPath, "utf-8")
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "ENOENT") {
        return {
          status: "fail",
          issues: [
            {
              severity: "error",
              message: `File not found: ${docFileName}`,
              location: docFileName,
            },
          ],
        }
      }
      return {
        status: "fail",
        issues: [
          {
            severity: "error",
            message: `Failed to read ${docFileName}: ${error.message}`,
            location: docFileName,
          },
        ],
      }
    }

    // 2. 根据 doc_type 执行对应检查
    switch (docType) {
      case "requirements":
        return lintRequirements(content, docFileName)
      case "design":
        return lintDesign(content, docFileName)
      case "tasks":
        return lintTasks(content, docFileName)
      case "bugfix":
        return lintBugfix(content, docFileName)
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_doc_lint_core", "lintDocument", err)
    throw err
  }
}

// ============================================================
// Document-specific lint logic
// ============================================================

/**
 * 检查 requirements.md 的结构
 * 必须包含: 简介/Introduction, 术语表/Glossary, 需求/Requirements 章节
 * 警告: 需求标题应使用 REQ-N 标准化格式
 */
function lintRequirements(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Check for Introduction section (case-insensitive heading)
  if (!hasHeading(content, ["简介", "introduction"])) {
    issues.push({
      severity: "error",
      message: '缺少"简介"/"Introduction"章节',
      location: fileName,
    })
  }

  // Check for Glossary section
  if (!hasHeading(content, ["术语表", "glossary"])) {
    issues.push({
      severity: "error",
      message: '缺少"术语表"/"Glossary"章节',
      location: fileName,
    })
  }

  // Check for Requirements section
  if (!hasHeading(content, ["需求", "requirements"])) {
    issues.push({
      severity: "error",
      message: '缺少"需求"/"Requirements"章节',
      location: fileName,
    })
  }

  // Check for standardized REQ-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "requirements")) {
    issues.push({
      severity: "warning",
      message: '需求标题未使用标准化格式"### REQ-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  // V6 架构: 仅对包含对应 REQ 节的文档检查对应规则
  // 检查文档是否包含V6相关关键词
  const isV6ArchitectureDoc = content.includes("V6") || 
                              content.includes("v6-architecture") ||
                              content.includes("SpecForge V6") ||
                              content.includes("V6架构")
  
  if (isV6ArchitectureDoc) {
    // 仅在文档包含对应 REQ 节时检查对应规则
    if (content.match(/^#{1,6}\s+(?:REQ-2|Requirement\s+2|需求\s*2)[:：]?\s+V6\s+不做的边界/im)) {
      const boundaryResult = checkV6ArchNotDoingBoundary(content, fileName, "requirements")
      issues.push(...boundaryResult.issues)
    }
    
    if (content.match(/^#{1,6}\s+(?:REQ-3|Requirement\s+3|需求\s*3)[:：]?\s+北极星目标/im)) {
      const northStarResult = checkV6ArchNorthStarScenarios(content, fileName, "requirements")
      issues.push(...northStarResult.issues)
    }
    
    if (content.match(/^#{1,6}\s+(?:REQ-25|Requirement\s+25|需求\s*25)[:：]?\s*(?:V6\.0\s+)?开发范围边界/im)) {
      const scopeListsResult = checkV6ArchScopeLists(content, fileName, "requirements")
      issues.push(...scopeListsResult.issues)
    }
    
    if (content.match(/^#{1,6}\s+(?:REQ-27|Requirement\s+27|需求\s*27)[:：]?\s+V6\.0\s+质量门槛/im)) {
      const releaseGatesResult = checkV6ArchReleaseGates(content, fileName, "requirements")
      issues.push(...releaseGatesResult.issues)
    }
    
    if (content.match(/^#{1,6}\s+(?:REQ-28|Requirement\s+28|需求\s*28)[:：]?\s+平台与环境/im)) {
      const platformDeclarationResult = checkV6ArchPlatformDeclaration(content, fileName, "requirements")
      issues.push(...platformDeclarationResult.issues)
    }
    
    if (content.match(/^#{1,6}\s+(?:REQ-29|Requirement\s+29|需求\s*29)[:：]?\s+里程碑规划/im)) {
      const milestonesResult = checkV6ArchMilestones(content, fileName, "requirements")
      issues.push(...milestonesResult.issues)
    }
    
    // V6 架构: 检查 Agent Constitution 节（REQ-7.8）
    // 仅在文档包含 REQ-7 或 Glossary 中有 Agent Constitution 引用时检查
    if (content.includes("Agent Constitution") || content.match(/^#{1,6}\s+(?:REQ-7|Requirement\s+7|需求\s*7)[:：]/im)) {
      const agentConstitutionResult = checkV6ArchAgentConstitution(content, fileName, "requirements")
      issues.push(...agentConstitutionResult.issues)
    }
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 design.md 的结构
 * - 检查是否包含设计相关章节
 * - 检查是否不包含任务拆分内容
 * - 警告: 设计决策标题应使用 DD-N 标准化格式
 * - V6 架构: 检查核心设计原则节
 */
function lintDesign(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Check for design-related sections (架构/Architecture, 设计/Design, 接口/Interface)
  const hasDesignSection =
    hasHeading(content, ["架构", "architecture"]) ||
    hasHeading(content, ["设计", "design"]) ||
    hasHeading(content, ["接口", "interface", "interfaces"]) ||
    hasHeading(content, ["组件", "component", "components"])

  if (!hasDesignSection) {
    issues.push({
      severity: "error",
      message: "缺少设计相关章节（架构/设计/接口/组件）",
      location: fileName,
    })
  }

  // Check that design doc does NOT contain task breakdown content
  if (hasTaskBreakdownContent(content)) {
    issues.push({
      severity: "error",
      message: "设计文档不应包含任务拆分内容",
      location: fileName,
    })
  }

  // Check for standardized DD-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "design")) {
    issues.push({
      severity: "warning",
      message: '设计决策标题未使用标准化格式"### DD-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  // V6 架构: 检查核心设计原则节（仅对V6架构文档）
  // 检查文档是否包含V6相关关键词或核心设计原则节
  const isV6ArchitectureDoc = content.includes("V6") || 
                              content.includes("v6-architecture") ||
                              content.includes("SpecForge V6") ||
                              content.includes("V6架构") ||
                              content.includes("核心设计原则")
  
  if (isV6ArchitectureDoc) {
    // 仅在文档包含对应节时检查对应规则
    if (content.match(/^#{1,6}\s+核心设计原则/im)) {
      const designPrinciplesResult = checkV6ArchDesignPrinciples(content, fileName)
      issues.push(...designPrinciplesResult.issues)
    }
    
    // 检查 V6 不做边界节（仅在节存在时）
    if (content.match(/^#{1,6}\s+V6\s+不做边界/im)) {
      const boundaryResult = checkV6ArchNotDoingBoundary(content, fileName, "design")
      issues.push(...boundaryResult.issues)
    }
    
    // V6 架构: 检查北极星目标节（仅在节存在时）
    if (content.match(/^#{1,6}\s+北极星目标/im)) {
      const northStarResult = checkV6ArchNorthStarScenarios(content, fileName, "design")
      issues.push(...northStarResult.issues)
    }
    
    // V6 架构: 检查范围列表节（仅在"本文档自身的验收检查"节存在时）
    if (content.match(/^#{1,6}\s+本文档自身的验收检查/im)) {
      const scopeListsResult = checkV6ArchScopeLists(content, fileName, "design")
      issues.push(...scopeListsResult.issues)
    }
    
    // V6 架构: 检查发版门槛节（仅在节存在时）
    if (content.match(/^#{1,6}\s+V6\.0\s+发版综合测试门槛/im)) {
      const releaseGatesResult = checkV6ArchReleaseGates(content, fileName, "design")
      issues.push(...releaseGatesResult.issues)
    }
    
    // V6 架构: 检查平台声明节（仅在"本文档自身的验收检查"节存在时）
    if (content.match(/^#{1,6}\s+本文档自身的验收检查/im) || content.match(/^#{1,6}\s+平台与环境/im)) {
      const platformDeclarationResult = checkV6ArchPlatformDeclaration(content, fileName, "design")
      issues.push(...platformDeclarationResult.issues)
    }
    
    // V6 架构: 检查里程碑节（仅在"本文档自身的验收检查"节或里程碑节存在时）
    if (content.match(/^#{1,6}\s+本文档自身的验收检查/im) || content.match(/^#{1,6}\s+里程碑/im)) {
      const milestonesResult = checkV6ArchMilestones(content, fileName, "design")
      issues.push(...milestonesResult.issues)
    }
    
    // V6 架构: 检查 Agent Constitution 节（仅在节存在时）
    if (content.match(/Agent\s+Constitution\s+9\s+条/im) || content.match(/^#{1,6}\s+.*Agent\s+Constitution/im)) {
      const agentConstitutionResult = checkV6ArchAgentConstitution(content, fileName, "design")
      issues.push(...agentConstitutionResult.issues)
    }
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 V6 架构设计原则节
 * 校验 design.md "核心设计原则" 节存在 5 条且编号顺序为 1–5，文本匹配 REQ-1.2 列表
 */
function checkV6ArchDesignPrinciples(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []
  
  // 查找"核心设计原则"节
  const lines = content.split("\n")
  let inDesignPrinciplesSection = false
  let principlesFound: Array<{ number: number; text: string }> = []
  let currentPrincipleNumber = 0
  let currentPrincipleText = ""
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 检查是否进入"核心设计原则"节
    if (line.match(/^#{1,6}\s+核心设计原则/i)) {
      inDesignPrinciplesSection = true
      continue
    }
    
    // 如果不在该节中，继续查找
    if (!inDesignPrinciplesSection) {
      continue
    }
    
    // 如果遇到下一个同级或更高级标题，退出该节
    if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+核心设计原则/i)) {
      // 检查当前标题级别是否小于或等于"核心设计原则"的级别
      const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
      if (currentHeadingMatch) {
        // 假设"核心设计原则"是三级标题（###），如果遇到三级或更高级标题，退出
        if (currentHeadingMatch[1].length <= 3) {
          inDesignPrinciplesSection = false
          break
        }
      }
    }
    
    // 在节内查找编号列表项
    const listItemMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (listItemMatch) {
      // 如果之前有收集的原则文本，保存它
      if (currentPrincipleNumber > 0) {
        principlesFound.push({
          number: currentPrincipleNumber,
          text: currentPrincipleText.trim()
        })
      }
      
      currentPrincipleNumber = parseInt(listItemMatch[1], 10)
      currentPrincipleText = listItemMatch[2].trim()
    } else if (currentPrincipleNumber > 0 && line.trim() !== "") {
      // 继续收集多行原则文本
      currentPrincipleText += " " + line.trim()
    }
  }
  
  // 保存最后一个原则
  if (currentPrincipleNumber > 0) {
    principlesFound.push({
      number: currentPrincipleNumber,
      text: currentPrincipleText.trim()
    })
  }
  
  // 检查是否找到原则节
  if (principlesFound.length === 0) {
    issues.push({
      severity: "error",
      message: '缺少"核心设计原则"节或未找到编号列表项',
      location: fileName,
      errorCode: "v6_arch_missing_or_reordered_principle"
    })
    return { status: "fail", issues }
  }
  
  // 检查原则数量是否为5
  if (principlesFound.length !== 5) {
    issues.push({
      severity: "error",
      message: `"核心设计原则"节应包含5条原则，实际找到${principlesFound.length}条`,
      location: fileName,
      errorCode: "v6_arch_missing_or_reordered_principle"
    })
    return { status: "fail", issues }
  }
  
  // 检查编号顺序是否为1-5
  const expectedNumbers = [1, 2, 3, 4, 5]
  const actualNumbers = principlesFound.map(p => p.number)
  
  if (!arraysEqual(actualNumbers, expectedNumbers)) {
    issues.push({
      severity: "error",
      message: `"核心设计原则"节编号顺序应为1-5，实际为${actualNumbers.join(",")}`,
      location: fileName,
      errorCode: "v6_arch_missing_or_reordered_principle"
    })
    return { status: "fail", issues }
  }
  
  // 检查原则文本是否匹配REQ-1.2列表
  const expectedPrinciples = [
    "Daemon 是唯一的 Source of Truth",
    "SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为",
    "程序硬控优先于 Prompt 控制（继承 V5）",
    "可观测性是一级组件，不是附加能力",
    "扩展性优先于完备性"
  ]
  
  let allPrinciplesMatch = true
  for (let i = 0; i < principlesFound.length; i++) {
    const principle = principlesFound[i]
    const expectedText = expectedPrinciples[i]
    
    // 检查原则文本是否包含预期关键词（允许有额外描述）
    if (!principle.text.includes(expectedText)) {
      allPrinciplesMatch = false
      issues.push({
        severity: "error",
        message: `原则${principle.number}文本不匹配REQ-1.2。预期包含:"${expectedText}"，实际:"${principle.text}"`,
        location: fileName,
        errorCode: "v6_arch_missing_or_reordered_principle"
      })
    }
  }
  
  if (!allPrinciplesMatch) {
    return { status: "fail", issues }
  }
  
  return { status: "pass", issues }
}

/**
 * 检查 V6 架构不做边界节
 * 校验 requirements.md REQ-2 与 design.md "V6 不做边界" 节各自包含 6 项架构层边界
 */
function checkV6ArchNotDoingBoundary(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  const lines = content.split("\n")
  let boundariesFound: string[] = []
  let inBoundarySection = false
  let currentBoundaryText = ""
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-2 节
    let inReq2Section = false
    let foundReq2Heading = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-2 节
      if (line.match(/^#{1,6}\s+(?:REQ-2|Requirement\s+2|需求\s*2)[:：]?\s+V6\s+不做的边界/i)) {
        foundReq2Heading = true
        inReq2Section = true
        continue
      }
      
      // 如果找到了 REQ-2 标题但还没进入节，继续查找
      if (!inReq2Section && foundReq2Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inReq2Section = true
          continue
        }
      }
      
      // 如果不在 REQ-2 节中，继续查找
      if (!inReq2Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 REQ-2 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq2Section = false
            break
          }
        }
      }
      
      // 在节内查找列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const boundaryText = listItemMatch[1].trim()
        // 检查是否是架构层边界项（包含特定关键词）
        if (boundaryText.includes("LLM Provider") || 
            boundaryText.includes("IDE") || 
            boundaryText.includes("编辑器插件") ||
            boundaryText.includes("多租户") ||
            boundaryText.includes("云服务") ||
            boundaryText.includes("DevOps") ||
            boundaryText.includes("LLM 评估") ||
            boundaryText.includes("微调")) {
          boundariesFound.push(boundaryText)
        }
      }
    }
    
    // 检查是否找到 REQ-2 节
    if (!foundReq2Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-2 "V6 不做的边界" 节',
        location: fileName,
        errorCode: "v6_arch_missing_or_reordered_boundary"
      })
      return { status: "fail", issues }
    }
    
    // 检查边界数量是否为6
    if (boundariesFound.length !== 6) {
      issues.push({
        severity: "error",
        message: `REQ-2 应包含6项架构层边界，实际找到${boundariesFound.length}项`,
        location: fileName,
        errorCode: "v6_arch_missing_or_reordered_boundary"
      })
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中查找 "V6 不做边界" 节
    let inBoundarySection = false
    let foundBoundaryHeading = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 "V6 不做边界" 节
      if (line.match(/^#{1,6}\s+V6\s+不做边界/i)) {
        foundBoundaryHeading = true
        inBoundarySection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inBoundarySection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+V6\s+不做边界/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 "V6 不做边界" 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inBoundarySection = false
            break
          }
        }
      }
      
      // 在节内查找"架构层："后的列表项
      if (line.includes("架构层")) {
        // 提取"架构层："后面的内容（支持 **架构层**： 格式）
        const archLayerMatch = line.match(/架构层\**\s*[：:]\s*(.+)/)
        if (archLayerMatch) {
          const afterArchLayer = archLayerMatch[1].trim()
          // 尝试从同一行提取边界项（支持中文顿号、逗号分隔）
          const boundariesInLine = afterArchLayer.split(/[、，,]/).map(b => b.trim()).filter(b => b.length > 0)
          boundariesFound.push(...boundariesInLine)
        }
      }
      
      // 也检查后续行中的列表项（以 - 或 * 开头）
      const listItemMatch = line.match(/^[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const boundaryText = listItemMatch[1].trim()
        boundariesFound.push(boundaryText)
      }
    }
    
    // 检查是否找到 "V6 不做边界" 节
    if (!foundBoundaryHeading) {
      issues.push({
        severity: "error",
        message: '缺少 "V6 不做边界" 节',
        location: fileName,
        errorCode: "v6_arch_missing_or_reordered_boundary"
      })
      return { status: "fail", issues }
    }
    
    // 检查边界数量是否为6
    if (boundariesFound.length !== 6) {
      issues.push({
        severity: "error",
        message: `"V6 不做边界" 节应包含6项架构层边界，实际找到${boundariesFound.length}项`,
        location: fileName,
        errorCode: "v6_arch_missing_or_reordered_boundary"
      })
      return { status: "fail", issues }
    }
  }
  
  return { status: "pass", issues }
}

/**
 * 检查 V6 架构北极星目标节
 * 校验"北极星目标"声明存在且列出 10 类排障场景
 */
function checkV6ArchNorthStarScenarios(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  const lines = content.split("\n")
  let scenariosFound: string[] = []
  let inNorthStarSection = false
  let foundNorthStarHeading = false
  let foundNorthStarGoal = false
  
  // 预期的10类排障场景（来自REQ-3.2）
  const expectedScenarios = [
    "Gate 反复失败",
    "Agent 偏离 prompt",
    "Tool 调用错误", 
    "权限拒绝",
    "升级 / 安装失败",
    "状态机卡住",
    "并发死锁",
    "Skill 是否被调用",
    "Workflow 是否按预期执行",
    "Workflow 执行结果偏离预期"
  ]
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-3 节
    let inReq3Section = false
    let foundReq3Heading = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-3 节
      if (line.match(/^#{1,6}\s+(?:REQ-3|Requirement\s+3|需求\s*3)[:：]?\s+北极星目标/i)) {
        foundReq3Heading = true
        inReq3Section = true
        continue
      }
      
      // 如果找到了 REQ-3 标题但还没进入节，继续查找
      if (!inReq3Section && foundReq3Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inReq3Section = true
          continue
        }
      }
      
      // 如果不在 REQ-3 节中，继续查找
      if (!inReq3Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/) 
        if (currentHeadingMatch) {
          // 假设 REQ-3 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq3Section = false
            break
          }
        }
      }
      
      // 检查是否包含北极星目标声明
      if (line.includes("5 分钟内从发生问题定位到根因")) {
        foundNorthStarGoal = true
      }
      
      // 在节内查找列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const scenarioText = listItemMatch[1].trim()
        // 检查是否是排障场景项
        for (const expectedScenario of expectedScenarios) {
          if (scenarioText.includes(expectedScenario)) {
            scenariosFound.push(expectedScenario)
            break
          }
        }
      }
    }
    
    // 检查是否找到 REQ-3 节
    if (!foundReq3Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-3 "北极星目标" 节',
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否找到北极星目标声明
    if (!foundNorthStarGoal) {
      issues.push({
        severity: "error",
        message: 'REQ-3 缺少北极星目标声明："5 分钟内从发生问题定位到根因"',
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
    }
    
    // 检查场景数量是否为10
    if (scenariosFound.length !== 10) {
      issues.push({
        severity: "error",
        message: `REQ-3 应包含10类排障场景，实际找到${scenariosFound.length}类`,
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否包含所有预期的场景
    const missingScenarios = expectedScenarios.filter(scenario => !scenariosFound.includes(scenario))
    if (missingScenarios.length > 0) {
      issues.push({
        severity: "error",
        message: `REQ-3 缺少以下排障场景：${missingScenarios.join("、")}`,
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中查找 "北极星目标" 节
    // 重置 section tracking variables for design.md
    inNorthStarSection = false
    foundNorthStarHeading = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 "北极星目标" 节
      if (line.match(/^#{1,6}\s+北极星目标/i)) {
        foundNorthStarHeading = true
        inNorthStarSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inNorthStarSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+北极星目标/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 "北极星目标" 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inNorthStarSection = false
            break
          }
        }
      }
      
      // 检查是否包含北极星目标声明
      if (line.includes("5 分钟内从发生问题定位到根因")) {
        foundNorthStarGoal = true
      }
      
      // 查找排障场景列表（通常在括号内或列表项中）
      // 尝试匹配包含10类场景的行
      for (const expectedScenario of expectedScenarios) {
        if (line.includes(expectedScenario) && !scenariosFound.includes(expectedScenario)) {
          scenariosFound.push(expectedScenario)
        }
      }
      
      // 也检查列表项格式
      const listItemMatch = line.match(/^[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const scenarioText = listItemMatch[1].trim()
        for (const expectedScenario of expectedScenarios) {
          if (scenarioText.includes(expectedScenario) && !scenariosFound.includes(expectedScenario)) {
            scenariosFound.push(expectedScenario)
            break
          }
        }
      }
    }
    
    // 检查是否找到 "北极星目标" 节
    if (!foundNorthStarHeading) {
      issues.push({
        severity: "error",
        message: '缺少 "北极星目标" 节',
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否找到北极星目标声明
    if (!foundNorthStarGoal) {
      issues.push({
        severity: "error",
        message: '"北极星目标" 节缺少目标声明："5 分钟内从发生问题定位到根因"',
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
    }
    
    // 检查场景数量是否为10
    if (scenariosFound.length !== 10) {
      issues.push({
        severity: "error",
        message: `"北极星目标" 节应包含10类排障场景，实际找到${scenariosFound.length}类`,
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否包含所有预期的场景
    const missingScenarios = expectedScenarios.filter(scenario => !scenariosFound.includes(scenario))
    if (missingScenarios.length > 0) {
      issues.push({
        severity: "error",
        message: `"北极星目标" 节缺少以下排障场景：${missingScenarios.join("、")}`,
        location: fileName,
        errorCode: "v6_arch_missing_north_star"
      })
      return { status: "fail", issues }
    }
  }
  
  return { status: "pass", issues }
}

/**
 * 检查 tasks.md 的结构
 * 每个 task 必须包含 verification_commands 字段
 * V3.7: 对 typed 格式验证类型键合法性，对 legacy 格式添加非阻塞警告
 * 警告: 任务标题应使用 TASK-N 标准化格式
 */
function lintTasks(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Split content into task sections (## headings)
  const taskSections = getTaskSections(content)

  if (taskSections.length === 0) {
    issues.push({
      severity: "error",
      message: "未找到任何任务章节",
      location: fileName,
    })
    return { status: "fail", issues }
  }

  // Check each task section for verification_commands using V3.7 parser
  for (const section of taskSections) {
    const taskVerification = parseTaskVerification(section.content)

    if (taskVerification.format === "empty") {
      // V3.7 parser didn't find **verification_commands**: field
      // Fall back to basic existence check for backward compatibility
      // (handles plain `verification_commands:` without bold markdown formatting)
      if (!hasVerificationCommands(section.content)) {
        issues.push({
          severity: "error",
          message: `任务"${section.title}"缺少 verification_commands 字段`,
          location: `${fileName}#${section.title}`,
        })
      }
    } else if (taskVerification.format === "typed") {
      // Typed format: validate type key legality

      // Check invalidTypedKeys (MUST include this check per DD-10)
      if (taskVerification.invalidTypedKeys) {
        for (const key of taskVerification.invalidTypedKeys) {
          issues.push({
            severity: "error",
            message: `任务"${section.title}"的 verification_commands 包含非法类型键: "${key}"`,
            location: `${fileName}#${section.title}`,
          })
        }
      }

      // Also validate typed command keys using isValidVerificationType
      if (taskVerification.typedCommands) {
        for (const key of Object.keys(taskVerification.typedCommands)) {
          if (!isValidVerificationType(key)) {
            issues.push({
              severity: "error",
              message: `任务"${section.title}"的 verification_commands 包含非法类型键: "${key}"`,
              location: `${fileName}#${section.title}`,
            })
          }
        }
      }
    } else if (taskVerification.format === "legacy") {
      // Legacy format: pass + non-blocking warning (consistent with sf_tasks_gate)
      issues.push({
        severity: "warning",
        message: `任务"${section.title}"使用旧格式 verification_commands，建议迁移到类型化格式`,
        location: `${fileName}#${section.title}`,
      })
    }

    // Validate manual_verification_checks structure (must be string list)
    if (taskVerification.manualChecks !== undefined) {
      // Accept the field — only validate structure
      if (!Array.isArray(taskVerification.manualChecks)) {
        issues.push({
          severity: "error",
          message: `任务"${section.title}"的 manual_verification_checks 必须为字符串列表`,
          location: `${fileName}#${section.title}`,
        })
      } else {
        for (let i = 0; i < taskVerification.manualChecks.length; i++) {
          if (typeof taskVerification.manualChecks[i] !== "string") {
            issues.push({
              severity: "error",
              message: `任务"${section.title}"的 manual_verification_checks[${i}] 不是字符串`,
              location: `${fileName}#${section.title}`,
            })
          }
        }
      }
    }
  }

  // Check for standardized TASK-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "tasks")) {
    issues.push({
      severity: "warning",
      message: '任务标题未使用标准化格式"### TASK-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 bugfix.md 的结构
 * 必须包含: 当前行为/Current Behavior, 预期行为/Expected Behavior,
 *           不变行为/Unchanged Behavior, 根因分析/Root Cause Analysis
 */
function lintBugfix(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  if (!hasHeading(content, ["当前行为", "current behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"当前行为"/"Current Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["预期行为", "expected behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"预期行为"/"Expected Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["不变行为", "unchanged behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"不变行为"/"Unchanged Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["根因分析", "root cause analysis"])) {
    issues.push({
      severity: "error",
      message: '缺少"根因分析"/"Root Cause Analysis"章节',
      location: fileName,
    })
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    issues,
  }
}

// ============================================================
// Helper functions
// ============================================================

function getDocFileName(docType: DocType): string {
  switch (docType) {
    case "requirements":
      return "requirements.md"
    case "design":
      return "design.md"
    case "tasks":
      return "tasks.md"
    case "bugfix":
      return "bugfix.md"
  }
}

/**
 * 检查文档中是否包含指定标题（case-insensitive heading search）
 * 匹配 markdown heading 格式: # Title, ## Title, ### Title 等
 */
export function hasHeading(content: string, keywords: string[]): boolean {
  const lines = content.split("\n")
  for (const line of lines) {
    // Match markdown headings (# to ######)
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/i)
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase()
      for (const keyword of keywords) {
        if (headingText.includes(keyword.toLowerCase())) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * 检查文档是否包含任务拆分内容
 * 匹配: "任务拆分", "Task Breakdown", "## Task" 模式
 */
export function hasTaskBreakdownContent(content: string): boolean {
  const patterns = [
    /任务拆分/i,
    /task\s+breakdown/i,
    /^##\s+task\s/im,
  ]
  return patterns.some((pattern) => pattern.test(content))
}

/**
 * 从 tasks.md 中提取任务章节
 */
export interface TaskSection {
  title: string
  content: string
}

export function getTaskSections(content: string): TaskSection[] {
  const sections: TaskSection[] = []
  const lines = content.split("\n")
  let currentTitle = ""
  let currentContent: string[] = []

  // Task heading patterns - match actual task headings, not auxiliary sections
  // Standardized: "### TASK-1 ...", "## TASK-1 ..."
  // Legacy: "## Task 1: ...", "## 任务 1: ...", "### Task 1: ...", "### 任务 1: ..."
  const taskHeadingPattern = /^#{2,6}\s+(TASK-\d|Task\s+\d|任务\s*\d)/i

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,6}\s+(.+)$/)
    if (headingMatch && taskHeadingPattern.test(line)) {
      // Save previous section if it exists
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentContent.join("\n"),
        })
      }
      currentTitle = headingMatch[1].trim()
      currentContent = []
    } else if (currentTitle) {
      currentContent.push(line)
    }
  }

  // Save last section
  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentContent.join("\n"),
    })
  }

  return sections
}

/**
 * 检查任务内容是否包含 verification_commands
 */
export function hasVerificationCommands(content: string): boolean {
  return /verification_commands/i.test(content)
}

/**
 * 检查文档是否包含标准化标记格式
 * - requirements: 至少一个 ### REQ-N 标题
 * - design: 至少一个 ### DD-N 标题
 * - tasks: 至少一个 ### TASK-N 标题
 *
 * 也接受兼容的旧格式（不报 warning）：
 * - requirements: ### 需求 N 或 ### Requirement N
 * - design: ### N.N 标题（数字章节号）
 * - tasks: ## Task N: 或 - [ ] N.
 */
export function hasStandardizedMarkers(content: string, docType: "requirements" | "design" | "tasks"): boolean {
  switch (docType) {
    case "requirements":
      // Standardized: REQ-N, also accept legacy: 需求 N, Requirement N
      return /^#{1,6}\s+(?:REQ-\d+|(?:需求|Requirement)\s+\d+)/m.test(content)
    case "design":
      // Standardized: DD-N, also accept legacy: N.N Title (numbered sections)
      return /^#{1,6}\s+(?:DD-\d+|\d+(?:\.\d+)?[.、：:\s]+.+)/m.test(content)
    case "tasks":
      // Standardized: TASK-N, also accept legacy: Task N:, - [ ] N.
      return /(?:^#{1,6}\s+(?:TASK-\d+|Task\s+\d+)|^-\s+\[[ x~-]\]\s+\d+\.)/m.test(content)
  }
}

/**
 * 比较两个数组是否相等
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * 检查 V6 架构发版门槛节
 * 校验 REQ-27.1 的 6 条发版门槛在 requirements.md 与 design.md Testing Strategy §3 中同步存在
 */
function checkV6ArchReleaseGates(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  // 预期的6条发版门槛（来自REQ-27.1）
  const expectedGates = [
    "feature_spec workflow 端到端测试通过",
    "北极星验证——10 类场景在 5 分钟内定位根因",
    "崩溃恢复——10 次随机 kill 测试 0 数据丢失",
    "Telegram 集成——OpenClaw 端到端完整 spec 创建和执行",
    "性能——Daemon 启动时间小于 3 秒；事件记录开销小于 5 ms/event；standard 模式事件文件大小小于 1 GB/天",
    "文档完整——架构文档 + 用户手册齐全"
  ]
  
  const lines = content.split("\n")
  let gatesFound: string[] = []
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-27 节
    let inReq27Section = false
    let foundReq27Heading = false
    let inAcceptanceCriteria = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-27 节
      if (line.match(/^#{1,6}\s+(?:REQ-27|Requirement\s+27|需求\s*27)[:：]?\s+V6\.0\s+质量门槛/i)) {
        foundReq27Heading = true
        inReq27Section = true
        continue
      }
      
      // 如果找到了 REQ-27 标题但还没进入节，继续查找
      if (!inReq27Section && foundReq27Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inAcceptanceCriteria = true
          inReq27Section = true
          continue
        }
      }
      
      // 如果不在 REQ-27 节中，继续查找
      if (!inReq27Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 REQ-27 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq27Section = false
            break
          }
        }
      }
      
      // 在节内查找列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const gateText = listItemMatch[1].trim()
        // 检查是否是发版门槛项（包含"门槛"关键词）
        if (gateText.includes("门槛")) {
          // 提取门槛文本（去掉"门槛 X："前缀）
          const gateMatch = gateText.match(/门槛\s*\d+\s*[：:]\s*(.+)/)
          if (gateMatch) {
            gatesFound.push(gateMatch[1].trim())
          } else {
            // 如果没有"门槛 X："格式，直接使用整个文本
            gatesFound.push(gateText)
          }
        }
      }
    }
    
    // 检查是否找到 REQ-27 节
    if (!foundReq27Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-27 "V6.0 质量门槛" 节',
        location: fileName,
        errorCode: "v6_arch_missing_release_gates"
      })
      return { status: "fail", issues }
    }
    
    // 检查门槛数量是否为6
    if (gatesFound.length !== 6) {
      issues.push({
        severity: "error",
        message: `REQ-27 应包含6条发版门槛，实际找到${gatesFound.length}条`,
        location: fileName,
        errorCode: "v6_arch_missing_release_gates"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否包含所有预期的门槛（允许文本有细微差异，检查关键词）
    for (let i = 0; i < expectedGates.length; i++) {
      const expectedGate = expectedGates[i]
      const foundGate = gatesFound[i]
      
      // 检查是否包含关键部分
      let keyParts: string[] = []
      if (i === 0) {
        keyParts = ["feature_spec", "workflow", "端到端"]
      } else if (i === 1) {
        keyParts = ["北极星", "10 类场景", "5 分钟"]
      } else if (i === 2) {
        keyParts = ["崩溃恢复", "10 次", "kill", "0 数据丢失"]
      } else if (i === 3) {
        keyParts = ["Telegram", "集成", "OpenClaw", "端到端"]
      } else if (i === 4) {
        keyParts = ["性能", "Daemon", "启动", "3 秒", "事件记录", "5 ms", "1 GB"]
      } else if (i === 5) {
        keyParts = ["文档完整", "架构文档", "用户手册"]
      }
      
      let allKeyPartsFound = true
      for (const keyPart of keyParts) {
        if (!foundGate.includes(keyPart)) {
          allKeyPartsFound = false
          break
        }
      }
      
      if (!allKeyPartsFound) {
        issues.push({
          severity: "error",
          message: `门槛${i + 1}文本不匹配预期。预期包含关键词: "${keyParts.join("、")}"，实际:"${foundGate}"`,
          location: fileName,
          errorCode: "v6_arch_missing_release_gates"
        })
      }
    }
    
    if (issues.length > 0) {
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中查找 "V6.0 发版综合测试门槛（REQ-27）" 节
    let inReleaseGatesSection = false
    let foundReleaseGatesHeading = false
    let inTableSection = false
    let tableRowsFound = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 "V6.0 发版综合测试门槛（REQ-27）" 节
      if (line.match(/^#{1,6}\s+V6\.0\s+发版综合测试门槛.*REQ-27/i)) {
        foundReleaseGatesHeading = true
        inReleaseGatesSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inReleaseGatesSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+V6\.0\s+发版综合测试门槛.*REQ-27/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设该节是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReleaseGatesSection = false
            break
          }
        }
      }
      
      // 查找表格行（以 | 开头和结尾）
      const tableRowMatch = line.match(/^\s*\|(.+)\|\s*$/)
      if (tableRowMatch) {
        const rowContent = tableRowMatch[1].trim()
        // 跳过表头分隔行（包含 --- 或 :--: 等）
        if (rowContent.match(/^[-:]+$/)) {
          continue
        }
        
        // 跳过表头行（包含"门槛"、"类型"、"通过标准"等）
        if (rowContent.includes("门槛") && rowContent.includes("类型") && rowContent.includes("通过标准")) {
          inTableSection = true
          continue
        }
        
        if (inTableSection) {
          // 解析表格单元格
          const cells = rowContent.split("|").map(cell => cell.trim()).filter(cell => cell.length > 0)
          if (cells.length >= 3) {
            const gateCell = cells[0] // 第一列是门槛描述
            // 检查是否包含门槛编号（门槛 1：等）
            if (gateCell.includes("门槛")) {
              tableRowsFound++
              // 提取门槛文本
              const gateMatch = gateCell.match(/门槛\s*\d+\s*[：:]\s*(.+)/)
              if (gateMatch) {
                gatesFound.push(gateMatch[1].trim())
              } else {
                gatesFound.push(gateCell)
              }
            }
          }
        }
      }
    }
    
    // 检查是否找到 "V6.0 发版综合测试门槛" 节
    if (!foundReleaseGatesHeading) {
      issues.push({
        severity: "error",
        message: '缺少 "V6.0 发版综合测试门槛（REQ-27）" 节',
        location: fileName,
        errorCode: "v6_arch_missing_release_gates"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否找到表格
    if (!inTableSection) {
      issues.push({
        severity: "error",
        message: '"V6.0 发版综合测试门槛" 节缺少表格或表格格式不正确',
        location: fileName,
        errorCode: "v6_arch_missing_release_gates"
      })
      return { status: "fail", issues }
    }
    
    // 检查表格行数是否为6
    if (tableRowsFound !== 6) {
      issues.push({
        severity: "error",
        message: `"V6.0 发版综合测试门槛" 节应包含6条门槛，实际找到${tableRowsFound}条`,
        location: fileName,
        errorCode: "v6_arch_missing_release_gates"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否包含所有预期的门槛（允许文本有细微差异，检查关键词）
    for (let i = 0; i < expectedGates.length; i++) {
      const expectedGate = expectedGates[i]
      const foundGate = gatesFound[i]
      
      if (!foundGate) {
        issues.push({
          severity: "error",
          message: `缺少门槛${i + 1}`,
          location: fileName,
          errorCode: "v6_arch_missing_release_gates"
        })
        continue
      }
      
      // 检查是否包含关键部分
      let keyParts: string[] = []
      if (i === 0) {
        keyParts = ["feature_spec", "workflow", "端到端"]
      } else if (i === 1) {
        keyParts = ["北极星", "10 类场景", "5 分钟"]
      } else if (i === 2) {
        keyParts = ["崩溃恢复", "10 次", "kill", "数据完整性"]
      } else if (i === 3) {
        keyParts = ["OpenClaw", "端到端", "spec", "创建"]
      } else if (i === 4) {
        keyParts = ["性能", "Daemon", "启动", "3", "事件", "5 ms", "1 GB"]
      } else if (i === 5) {
        keyParts = ["文档完整", "架构文档", "用户手册"]
      }
      
      let allKeyPartsFound = true
      for (const keyPart of keyParts) {
        if (!foundGate.includes(keyPart)) {
          allKeyPartsFound = false
          break
        }
      }
      
      if (!allKeyPartsFound) {
        issues.push({
          severity: "error",
          message: `门槛${i + 1}文本不匹配预期。预期包含关键词: "${keyParts.join("、")}"，实际:"${foundGate}"`,
          location: fileName,
          errorCode: "v6_arch_missing_release_gates"
        })
      }
    }
    
    if (issues.length > 0) {
      return { status: "fail", issues }
    }
  }
  
  return { status: "pass", issues }
}

/**
 * 检查 V6 架构平台声明节
 * 校验 REQ-28 中 OS 列表、OpenCode 最低版本、运行时、最低/推荐硬件齐全
 */
function checkV6ArchPlatformDeclaration(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  // 预期的平台声明要素（来自REQ-28）
  const expectedElements = [
    { type: "os", keywords: ["Windows", "macOS", "Linux", "操作系统"] },
    { type: "opencode_version", keywords: ["OpenCode", "最低版本", "1.14.41"] },
    { type: "runtime", keywords: ["Bun", "Node.js", "运行时", "LTS"] },
    { type: "min_hardware", keywords: ["4 核", "4 GB", "40 GB", "最低硬件"] },
    { type: "recommended_hardware", keywords: ["8 核", "16 GB", "200 GB", "推荐硬件"] }
  ]
  
  const lines = content.split("\n")
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-28 节
    let inReq28Section = false
    let foundReq28Heading = false
    let inAcceptanceCriteria = false
    let elementsFound: Record<string, boolean> = {}
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-28 节
      if (line.match(/^#{1,6}\s+(?:REQ-28|Requirement\s+28|需求\s*28)[:：]?\s+平台与环境/i)) {
        foundReq28Heading = true
        inReq28Section = true
        continue
      }
      
      // 如果找到了 REQ-28 标题但还没进入节，继续查找
      if (!inReq28Section && foundReq28Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inAcceptanceCriteria = true
          inReq28Section = true
          continue
        }
      }
      
      // 如果不在 REQ-28 节中，继续查找
      if (!inReq28Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 REQ-28 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq28Section = false
            break
          }
        }
      }
      
      // 在节内检查各个要素
      for (const element of expectedElements) {
        // 检查是否包含该要素的关键词
        let found = false
        for (const keyword of element.keywords) {
          if (line.includes(keyword)) {
            found = true
            break
          }
        }
        
        if (found && !elementsFound[element.type]) {
          elementsFound[element.type] = true
        }
      }
      
      // 检查列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-\*]\s+(.+)$/)
      if (listItemMatch) {
        const itemText = listItemMatch[1].trim()
        // 检查列表项内容是否包含各个要素
        for (const element of expectedElements) {
          let found = false
          for (const keyword of element.keywords) {
            if (itemText.includes(keyword)) {
              found = true
              break
            }
          }
          
          if (found && !elementsFound[element.type]) {
            elementsFound[element.type] = true
          }
        }
      }
    }
    
    // 检查是否找到 REQ-28 节
    if (!foundReq28Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-28 "平台与环境" 节',
        location: fileName,
        errorCode: "v6_arch_missing_platform_declaration"
      })
      return { status: "fail", issues }
    }
    
    // 检查所有要素是否齐全
    const missingElements = expectedElements.filter(element => !elementsFound[element.type])
    if (missingElements.length > 0) {
      const missingTypes = missingElements.map(element => {
        switch (element.type) {
          case "os": return "操作系统列表"
          case "opencode_version": return "OpenCode最低版本"
          case "runtime": return "运行时要求"
          case "min_hardware": return "最低硬件要求"
          case "recommended_hardware": return "推荐硬件要求"
          default: return element.type
        }
      })
      
      issues.push({
        severity: "error",
        message: `REQ-28 缺少以下要素：${missingTypes.join("、")}`,
        location: fileName,
        errorCode: "v6_arch_missing_platform_declaration"
      })
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中，REQ-28 的验证可能在不同位置
    // 根据 design.md 的"本文档自身的验收检查"节，REQ-28 应该被引用
    let foundReq28Reference = false
    let inSelfCheckSection = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入"本文档自身的验收检查"节
      if (line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        inSelfCheckSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inSelfCheckSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设该节是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inSelfCheckSection = false
            break
          }
        }
      }
      
      // 检查是否包含 REQ-28 引用
      if (line.includes("REQ-28") || line.includes("平台") || line.includes("运行时") || line.includes("硬件")) {
        foundReq28Reference = true
        // 检查是否包含关键要素关键词
        let hasKeyElements = false
        for (const element of expectedElements) {
          for (const keyword of element.keywords) {
            if (line.includes(keyword)) {
              hasKeyElements = true
              break
            }
          }
          if (hasKeyElements) break
        }
        
        if (!hasKeyElements) {
          // 检查后续行是否包含要素
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j]
            for (const element of expectedElements) {
              for (const keyword of element.keywords) {
                if (nextLine.includes(keyword)) {
                  hasKeyElements = true
                  break
                }
              }
              if (hasKeyElements) break
            }
            if (hasKeyElements) break
          }
        }
        
        if (!hasKeyElements) {
          issues.push({
            severity: "warning",
            message: 'design.md 中 REQ-28 引用缺少具体的平台/硬件要求细节',
            location: fileName,
            errorCode: "v6_arch_missing_platform_declaration"
          })
        }
        break
      }
    }
    
    // 检查是否找到 REQ-28 引用（非强制，因为 design.md 可能不直接包含平台声明）
    if (!foundReq28Reference) {
      issues.push({
        severity: "warning",
        message: 'design.md 中未找到 REQ-28 "平台与环境" 的明确引用',
        location: fileName,
        errorCode: "v6_arch_missing_platform_declaration"
      })
    }
  }
  
  return { status: "pass", issues }
}
/**
 * 检查 V6 架构范围列表节
 * 校验 REQ-25 的 P0 列表条目数 = 27、P1 列表条目数 = 15、P2 列表非空
 */
export function checkV6ArchScopeLists(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  const lines = content.split("\n")
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-25 节
    let inReq25Section = false
    let foundReq25Heading = false
    let inAcceptanceCriteria = false
    let currentListType: "p0" | "p1" | "p2" | null = null
    let p0Items: string[] = []
    let p1Items: string[] = []
    let p2Items: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-25 节
      if (line.match(/^#{1,6}\s+(?:REQ-25|Requirement\s+25|需求\s*25)[:：]?\s*(?:V6\.0\s+)?开发范围边界.*P0.*P1.*P2/i)) {
        foundReq25Heading = true
        inReq25Section = true
        continue
      }
      
      // 如果找到了 REQ-25 标题但还没进入节，继续查找
      if (!inReq25Section && foundReq25Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inAcceptanceCriteria = true
          inReq25Section = true
          continue
        }
      }
      
      // 如果不在 REQ-25 节中，继续查找
      if (!inReq25Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 REQ-25 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq25Section = false
            break
          }
        }
      }
      
      // 检查 P0/P1/P2 列表标题
      if (line.includes("P0") && line.includes("必做项") && line.includes("27")) {
        currentListType = "p0"
        continue
      } else if (line.includes("P1") && line.includes("15")) {
        currentListType = "p1"
        continue
      } else if (line.includes("P2") && line.includes("非空")) {
        currentListType = "p2"
        continue
      }
      
      // 在节内查找列表项（以 - 或 * 开头，允许前面有空格）
      const listItemMatch = line.match(/^\s*[-\*]\s+(.+)$/)
      if (listItemMatch && currentListType) {
        const itemText = listItemMatch[1].trim()
        
        // 解析复合列表项：检查是否包含括号和子项计数
        // 例如："基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。"
        const subItemsMatch = itemText.match(/（([^）]+)，共\s*(\d+)\s*项[）)]/)
        if (subItemsMatch) {
          // 提取子项数量
          const subItemCount = parseInt(subItemsMatch[2], 10)
          // 根据当前列表类型添加相应数量的项
          if (currentListType === "p0") {
            for (let i = 0; i < subItemCount; i++) {
              p0Items.push(`${itemText} [子项 ${i+1}/${subItemCount}]`)
            }
          } else if (currentListType === "p1") {
            for (let i = 0; i < subItemCount; i++) {
              p1Items.push(`${itemText} [子项 ${i+1}/${subItemCount}]`)
            }
          } else if (currentListType === "p2") {
            for (let i = 0; i < subItemCount; i++) {
              p2Items.push(`${itemText} [子项 ${i+1}/${subItemCount}]`)
            }
          }
        } else {
          // 普通列表项
          // P1/P2 的每一行列表项计为 1 项（括号内的描述不拆分）
          // P0 的普通列表项（无"共 N 项"标记）也计为 1 项
          if (currentListType === "p0") {
            p0Items.push(itemText)
          } else if (currentListType === "p1") {
            p1Items.push(itemText)
          } else if (currentListType === "p2") {
            p2Items.push(itemText)
          }
        }
      }
      
      // 检查分组标题（如"基础设施"、"核心能力"等）并重置计数
      // 这些标题通常以" - "开头或包含括号
      if (line.includes("基础设施") || line.includes("核心能力") || 
          line.includes("可观测性基础") || line.includes("扩展机制骨架") || 
          line.includes("分发")) {
        // 这些是 P0 的分组标题，不重置 currentListType
        continue
      }
      
      // 如果遇到空行，可能表示列表结束，但不重置 currentListType
      // 因为 P0/P1/P2 列表可能包含多个分组
    }
    
    // 检查是否找到 REQ-25 节
    if (!foundReq25Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-25 "V6.0 开发范围边界（P0 / P1 / P2）" 节',
        location: fileName,
        errorCode: "v6_arch_missing_scope_lists"
      })
      return { status: "fail", issues }
    }
    
    // 检查 P0 列表条目数是否为 27
    if (p0Items.length !== 27) {
      issues.push({
        severity: "error",
        message: `REQ-25 P0 列表应包含27项，实际找到${p0Items.length}项`,
        location: fileName,
        errorCode: "v6_arch_missing_scope_lists"
      })
    }
    
    // 检查 P1 列表条目数是否为 15
    if (p1Items.length !== 15) {
      issues.push({
        severity: "error",
        message: `REQ-25 P1 列表应包含15项，实际找到${p1Items.length}项`,
        location: fileName,
        errorCode: "v6_arch_missing_scope_lists"
      })
    }
    
    // 检查 P2 列表是否非空
    if (p2Items.length === 0) {
      issues.push({
        severity: "error",
        message: "REQ-25 P2 列表应为非空",
        location: fileName,
        errorCode: "v6_arch_missing_scope_lists"
      })
    }
    
    if (issues.length > 0) {
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中，REQ-25 的验证可能在不同位置
    // 根据 design.md 的"本文档自身的验收检查"节，REQ-25 应该被引用
    let foundReq25Reference = false
    let inSelfCheckSection = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入"本文档自身的验收检查"节
      if (line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        inSelfCheckSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inSelfCheckSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设该节是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inSelfCheckSection = false
            break
          }
        }
      }
      
      // 检查是否包含 REQ-25 引用
      if (line.includes("REQ-25") || line.includes("P0") || line.includes("P1") || line.includes("P2") || line.includes("范围边界")) {
        foundReq25Reference = true
        // 检查是否包含关键要素关键词
        let hasKeyElements = line.includes("27") || line.includes("15") || line.includes("非空")
        
        if (!hasKeyElements) {
          // 检查后续行是否包含要素
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j]
            if (nextLine.includes("27") || nextLine.includes("15") || nextLine.includes("非空")) {
              hasKeyElements = true
              break
            }
          }
        }
        
        if (!hasKeyElements) {
          issues.push({
            severity: "warning",
            message: 'design.md 中 REQ-25 引用缺少具体的范围边界细节（P0=27项、P1=15项、P2非空）',
            location: fileName,
            errorCode: "v6_arch_missing_scope_lists"
          })
        }
        break
      }
    }
    
    // 检查是否找到 REQ-25 引用（非强制，因为 design.md 可能不直接包含范围列表）
    if (!foundReq25Reference) {
      issues.push({
        severity: "warning",
        message: 'design.md 中未找到 REQ-25 "V6.0 开发范围边界" 的明确引用',
        location: fileName,
        errorCode: "v6_arch_missing_scope_lists"
      })
    }
  }
  
  return { status: "pass", issues }
}
/**
 * 检查 V6 架构里程碑节
 * 校验 REQ-29 中每个里程碑有明确主题；允许数量偏离 9 但必须文档化
 */
function checkV6ArchMilestones(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  const lines = content.split("\n")
  
  if (docType === "requirements") {
    // 在 requirements.md 中查找 REQ-29 节
    let inReq29Section = false
    let foundReq29Heading = false
    let inAcceptanceCriteria = false
    let milestonesFound: Array<{ id: string; theme: string }> = []
    let currentMilestoneId = ""
    let currentMilestoneTheme = ""
    let hasFlexibilityClause = false // 是否包含灵活性条款（允许数量偏离9）
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 REQ-29 节
      if (line.match(/^#{1,6}\s+(?:REQ-29|Requirement\s+29|需求\s*29)[:：]?\s+里程碑规划/i)) {
        foundReq29Heading = true
        inReq29Section = true
        continue
      }
      
      // 如果找到了 REQ-29 标题但还没进入节，继续查找
      if (!inReq29Section && foundReq29Heading) {
        // 检查是否进入 Acceptance Criteria 部分
        if (line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
          inAcceptanceCriteria = true
          inReq29Section = true
          continue
        }
      }
      
      // 如果不在 REQ-29 节中，继续查找
      if (!inReq29Section) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:Acceptance\s+Criteria|验收标准)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 REQ-29 是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inReq29Section = false
            break
          }
        }
      }
      
      // 检查是否包含灵活性条款（允许里程碑数量偏离9）
      if (line.includes("允许 9 个以外的数量") || 
          line.includes("允许里程碑数量灵活调整") ||
          line.includes("允许数量偏离 9")) {
        hasFlexibilityClause = true
      }
      
      // 在节内查找里程碑列表项
      // 匹配格式：- M1：Daemon 骨架。 或 - M9：（空主题）
      const milestoneMatch = line.match(/^\s*[-\*]\s+(M\d+)[：:]\s*(.*?)(?:。|$)/)
      if (milestoneMatch) {
        const milestoneId = milestoneMatch[1]
        const milestoneTheme = milestoneMatch[2].trim()
        
        milestonesFound.push({
          id: milestoneId,
          theme: milestoneTheme
        })
      }
      
      // 也检查其他格式的里程碑（如 M1 - Daemon 骨架）
      const altMilestoneMatch = line.match(/^\s*[-\*]\s+(M\d+)\s*[-—]\s*(.+?)(?:。|$)/)
      if (altMilestoneMatch && !milestoneMatch) {
        const milestoneId = altMilestoneMatch[1]
        const milestoneTheme = altMilestoneMatch[2].trim()
        
        milestonesFound.push({
          id: milestoneId,
          theme: milestoneTheme
        })
      }
    }
    
    // 检查是否找到 REQ-29 节
    if (!foundReq29Heading) {
      issues.push({
        severity: "error",
        message: '缺少 REQ-29 "里程碑规划" 节',
        location: fileName,
        errorCode: "v6_arch_missing_milestones"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否找到至少一个里程碑
    if (milestonesFound.length === 0) {
      issues.push({
        severity: "error",
        message: 'REQ-29 中未找到任何里程碑定义',
        location: fileName,
        errorCode: "v6_arch_missing_milestones"
      })
      return { status: "fail", issues }
    }
    
    // 检查每个里程碑是否有明确主题
    const milestonesWithoutTheme = milestonesFound.filter(m => !m.theme || m.theme.trim().length === 0)
    if (milestonesWithoutTheme.length > 0) {
      issues.push({
        severity: "error",
        message: `以下里程碑缺少明确主题：${milestonesWithoutTheme.map(m => m.id).join(", ")}`,
        location: fileName,
        errorCode: "v6_arch_missing_milestones"
      })
      return { status: "fail", issues }
    }
    
    // 检查里程碑ID是否连续（M1, M2, M3...）
    const milestoneNumbers = milestonesFound.map(m => parseInt(m.id.substring(1), 10))
    const expectedNumbers = Array.from({ length: milestonesFound.length }, (_, i) => i + 1)
    
    if (!arraysEqual(milestoneNumbers.sort((a, b) => a - b), expectedNumbers)) {
      issues.push({
        severity: "warning",
        message: `里程碑编号不连续或重复：${milestonesFound.map(m => m.id).join(", ")}`,
        location: fileName,
        errorCode: "v6_arch_missing_milestones"
      })
    }
    
    // 检查里程碑数量是否为9，如果不是，检查是否有灵活性条款
    if (milestonesFound.length !== 9) {
      if (!hasFlexibilityClause) {
        issues.push({
          severity: "error",
          message: `里程碑数量为${milestonesFound.length}个（非9个），但未在文档中明确说明允许数量偏离9`,
          location: fileName,
          errorCode: "v6_arch_missing_milestones"
        })
        return { status: "fail", issues }
      } else {
        // 有灵活性条款，数量可以偏离9
        issues.push({
          severity: "info",
          message: `里程碑数量为${milestonesFound.length}个（非9个），但文档中包含灵活性条款，允许数量偏离9`,
          location: fileName,
          errorCode: "v6_arch_missing_milestones"
        })
      }
    }
    
    // 检查基准里程碑列表（如果数量为9）
    if (milestonesFound.length === 9) {
      const expectedMilestones = [
        { id: "M1", theme: "Daemon 骨架" },
        { id: "M2", theme: "身份与权限" },
        { id: "M3", theme: "可观测性基础" },
        { id: "M4", theme: "核心工作流" },
        { id: "M5", theme: "分析能力" },
        { id: "M6", theme: "崩溃恢复" },
        { id: "M7", theme: "分发与迁移" },
        { id: "M8", theme: "Telegram 集成" },
        { id: "M9", theme: "北极星验证" }
      ]
      
      let allMatch = true
      for (let i = 0; i < milestonesFound.length; i++) {
        const found = milestonesFound[i]
        const expected = expectedMilestones[i]
        
        // 检查ID是否匹配
        if (found.id !== expected.id) {
          issues.push({
            severity: "warning",
            message: `里程碑${i+1}的ID应为${expected.id}，实际为${found.id}`,
            location: fileName,
            errorCode: "v6_arch_missing_milestones"
          })
          allMatch = false
        }
        
        // 检查主题是否包含预期关键词（允许有额外描述）
        if (!found.theme.includes(expected.theme)) {
          issues.push({
            severity: "warning",
            message: `里程碑${found.id}的主题应包含"${expected.theme}"，实际为"${found.theme}"`,
            location: fileName,
            errorCode: "v6_arch_missing_milestones"
          })
          allMatch = false
        }
      }
      
      if (!allMatch) {
        // 不返回失败，只记录警告
        return { status: "pass", issues }
      }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中，REQ-29 的验证可能在不同位置
    // 根据 design.md 的"本文档自身的验收检查"节，REQ-29 应该被引用
    let inSelfCheckSection = false
    let foundReq29Reference = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 查找"本文档自身的验收检查"节
      if (line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        inSelfCheckSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inSelfCheckSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+本文档自身的验收检查/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设该节是三级标题（###），如果遇到三级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 3) {
            inSelfCheckSection = false
            break
          }
        }
      }
      
      // 检查是否包含 REQ-29 引用
      if (line.includes("REQ-29") || line.includes("里程碑") || line.includes("M1") || line.includes("M9")) {
        foundReq29Reference = true
        // 检查是否包含关键要素关键词
        let hasKeyElements = line.includes("明确主题") || line.includes("数量偏离") || line.includes("文档化")
        
        if (!hasKeyElements) {
          // 检查后续行是否包含要素
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j]
            if (nextLine.includes("明确主题") || nextLine.includes("数量偏离") || nextLine.includes("文档化")) {
              hasKeyElements = true
              break
            }
          }
        }
        
        if (!hasKeyElements) {
          issues.push({
            severity: "warning",
            message: 'design.md 中 REQ-29 引用缺少具体的里程碑验证细节（明确主题、允许数量偏离但需文档化）',
            location: fileName,
            errorCode: "v6_arch_missing_milestones"
          })
        }
        break
      }
    }
    
    // 检查是否找到 REQ-29 引用（非强制，因为 design.md 可能不直接包含里程碑列表）
    if (!foundReq29Reference) {
      issues.push({
        severity: "warning",
        message: 'design.md 中未找到 REQ-29 "里程碑规划" 的明确引用',
        location: fileName,
        errorCode: "v6_arch_missing_milestones"
      })
    }
  }
  
  return { status: "pass", issues }
}

/**
 * 检查 V6 架构 Agent Constitution 节
 * 校验 requirements.md Glossary 引用 Agent Constitution 9 条底线（或 design.md §4 "Agent Constitution 9 条"），
 * 且至少显式包含"不得绕过 Gate"与"不得伪造验证"
 */
export function checkV6ArchAgentConstitution(content: string, fileName: string, docType: "requirements" | "design"): DocLintResult {
  const issues: LintIssue[] = []
  
  const lines = content.split("\n")
  
  // 必须包含的两条底线
  const requiredRules = [
    "不得绕过 Gate",
    "不得伪造验证"
  ]
  
  // design.md 中实际的规则文本（第二条是"不得伪造验证结果"）
  const designRequiredRules = [
    "不得绕过 Gate",
    "不得伪造验证结果"
  ]
  
  if (docType === "requirements") {
    // 在 requirements.md 中，检查 Glossary 部分是否引用 Agent Constitution
    let inGlossarySection = false
    let foundAgentConstitutionEntry = false
    let foundRequiredRules: string[] = []
    let mentionsNineRules = false
    let agentConstitutionLine = ""
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 Glossary 节
      if (line.match(/^#{1,6}\s+(?:术语表|Glossary)/i)) {
        inGlossarySection = true
        continue
      }
      
      // 如果不在 Glossary 节中，继续查找
      if (!inGlossarySection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+(?:术语表|Glossary)/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 Glossary 是二级标题（##），如果遇到二级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 2) {
            inGlossarySection = false
            break
          }
        }
      }
      
      // 检查是否包含 Agent Constitution 词条
      if (line.includes("Agent Constitution") || line.includes("Agent Constitution")) {
        foundAgentConstitutionEntry = true
        agentConstitutionLine = line
        
        // 检查是否提到"9条"或"9 条"
        if (line.includes("9条") || line.includes("9 条") || line.includes("9条底线") || line.includes("9 条底线")) {
          mentionsNineRules = true
        }
        
        // 检查是否包含必须的两条底线
        for (const rule of requiredRules) {
          if (line.includes(rule)) {
            foundRequiredRules.push(rule)
          }
        }
        
        // 检查后续行是否包含底线和"9条"引用
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j]
          
          // 检查是否提到"9条"
          if (!mentionsNineRules && (nextLine.includes("9条") || nextLine.includes("9 条") || nextLine.includes("9条底线") || nextLine.includes("9 条底线"))) {
            mentionsNineRules = true
          }
          
          for (const rule of requiredRules) {
            if (nextLine.includes(rule) && !foundRequiredRules.includes(rule)) {
              foundRequiredRules.push(rule)
            }
          }
        }
      }
    }
    
    // 检查是否找到 Agent Constitution 词条
    if (!foundAgentConstitutionEntry) {
      issues.push({
        severity: "error",
        message: 'Glossary 中缺少 "Agent Constitution" 词条引用',
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否提到"9条"底线
    if (!mentionsNineRules) {
      issues.push({
        severity: "error",
        message: 'Agent Constitution 词条未明确引用"9条"或"9 条"底线',
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否包含所有必须的底线
    const missingRules = requiredRules.filter(rule => !foundRequiredRules.includes(rule))
    if (missingRules.length > 0) {
      issues.push({
        severity: "error",
        message: `Agent Constitution 引用缺少必须的底线：${missingRules.join("、")}`,
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
    
  } else if (docType === "design") {
    // 在 design.md 中，检查 §4 "Agent Constitution 9 条" 节
    let inAgentConstitutionSection = false
    let foundSectionHeading = false
    let foundRequiredRules: string[] = []
    let rulesFound: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 检查是否进入 "Agent Constitution 9 条" 节
      // 设计文档中该节可能以加粗文本形式出现：**Agent Constitution 9 条**
      if (line.match(/\*\*Agent\s+Constitution\s+9\s+条\*\*/i) || 
          line.match(/^#{1,6}\s+Agent\s+Constitution\s+9\s+条/i) || 
          line.match(/^#{1,6}\s+.*Agent\s+Constitution.*/i)) {
        foundSectionHeading = true
        inAgentConstitutionSection = true
        continue
      }
      
      // 如果不在该节中，继续查找
      if (!inAgentConstitutionSection) {
        continue
      }
      
      // 如果遇到下一个同级或更高级标题，退出该节
      if (line.match(/^#{1,6}\s+/) && !line.match(/^#{1,6}\s+Agent\s+Constitution/i)) {
        const currentHeadingMatch = line.match(/^(#{1,6})\s+/)
        if (currentHeadingMatch) {
          // 假设 "Agent Constitution 9 条" 是四级标题（####），如果遇到四级或更高级标题，退出
          if (currentHeadingMatch[1].length <= 4) {
            inAgentConstitutionSection = false
            break
          }
        }
      }
      
      // 在节内查找编号列表项（1. 2. 3. ...，允许行首有空格）
      const listItemMatch = line.match(/^\s*(\d+)\.\s+(.+)$/)
      if (listItemMatch) {
        const ruleText = listItemMatch[2].trim()
        rulesFound.push(ruleText)
        
        // 检查是否包含必须的底线（使用design.md中的实际文本）
        for (const rule of designRequiredRules) {
          if (ruleText.includes(rule) && !foundRequiredRules.includes(rule)) {
            foundRequiredRules.push(rule)
          }
        }
      } else if (rulesFound.length > 0 && line.trim() !== "" && !line.match(/^#{1,6}\s+/)) {
        // 继续收集多行规则文本（如果当前行不是空行也不是标题）
        const lastRuleIndex = rulesFound.length - 1
        rulesFound[lastRuleIndex] += " " + line.trim()
        
        // 再次检查是否包含必须的底线（针对多行规则，使用design.md中的实际文本）
        for (const rule of designRequiredRules) {
          if (rulesFound[lastRuleIndex].includes(rule) && !foundRequiredRules.includes(rule)) {
            foundRequiredRules.push(rule)
          }
        }
      }
    }
    
    // 检查是否找到 "Agent Constitution 9 条" 节
    if (!foundSectionHeading) {
      issues.push({
        severity: "error",
        message: '缺少 "Agent Constitution 9 条" 节',
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
    
    // 检查是否找到至少一条规则
    if (rulesFound.length === 0) {
      issues.push({
        severity: "error",
        message: '"Agent Constitution 9 条" 节中未找到任何规则定义',
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
    
    // 检查规则数量是否为9（可选检查，根据设计文档应该有9条）
    if (rulesFound.length !== 9) {
      issues.push({
        severity: "warning",
        message: `"Agent Constitution 9 条" 节中找到 ${rulesFound.length} 条规则，预期为9条`,
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
    }
    
    // 检查是否包含所有必须的底线（对于design.md，使用designRequiredRules）
    const missingRules = designRequiredRules.filter(rule => !foundRequiredRules.includes(rule))
    if (missingRules.length > 0) {
      // 将"不得伪造验证结果"转换为更通用的"不得伪造验证"用于错误消息
      const displayMissingRules = missingRules.map(rule => 
        rule === "不得伪造验证结果" ? "不得伪造验证" : rule
      )
      issues.push({
        severity: "error",
        message: `Agent Constitution 缺少必须的底线：${displayMissingRules.join("、")}`,
        location: fileName,
        errorCode: "v6_arch_missing_agent_constitution"
      })
      return { status: "fail", issues }
    }
  }
  
  return { status: "pass", issues }
}
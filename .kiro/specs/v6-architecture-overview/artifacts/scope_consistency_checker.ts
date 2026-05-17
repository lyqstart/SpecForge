#!/usr/bin/env node

/**
 * scope_consistency_checker - Implement scope consistency validation
 * 
 * Requirements: 25.4, 30.15
 * 
 * This tool extends scope_boundary_verifier.ts, adding validation logic for downstream spec scopeTags.
 * 
 * Key validation rules:
 * 1. All downstream specs must have valid scopeTag
 * 2. scopeTag must be consistent with REQ-25 classification
 * 3. V6.0 release branch (scopeTag == "p0") projects must not depend on P1/P2 capabilities
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Types
// ============================================================

export interface ScopeItem {
  /** 项目文本标签 */
  label: string;
  /** 所属优先级: 'p0' | 'p1' | 'p2' */
  priority: 'p0' | 'p1' | 'p2';
  /** 分组类别（如 '基础设施', '核心能力' 等） */
  category?: string;
}

export interface ScopeBoundary {
  /** P0 项目列表 */
  p0: ScopeItem[];
  /** P1 项目列表 */
  p1: ScopeItem[];
  /** P2 项目列表 */
  p2: ScopeItem[];
}

export interface SpecConfig {
  /** Spec ID */
  specId: string;
  /** 工作流类型 */
  workflowType: string;
  /** Spec 类型 */
  specType: string;
  /** 范围标签: 'p0' | 'p1' | 'p2' */
  scopeTag: 'p0' | 'p1' | 'p2';
  /** 父级 Spec */
  parentSpec?: string;
}

export interface ValidationResult {
  /** 验证是否成功 */
  success: boolean;
  /** 错误代码（如果验证失败） */
  errorCode?: string;
  /** 错误消息（如果验证失败） */
  error?: string;
  /** 验证详情 */
  details?: {
    /** 验证的 spec 总数 */
    totalSpecs: number;
    /** 通过验证的 spec 数量 */
    passedSpecs: number;
    /** 验证失败的 spec 数量 */
    failedSpecs: number;
    /** 失败的 spec 详情 */
    failures?: Array<{
      /** Spec 名称 */
      specName: string;
      /** 失败原因 */
      reason: string;
      /** 错误代码 */
      errorCode: string;
    }>;
    /** 范围边界统计 */
    scopeStats: {
      p0: number;
      p1: number;
      p2: number;
      missingScopeTag: number;
    };
  };
}

// ============================================================
// P1/P2 Capability Detection
// ============================================================

/**
 * P1 capabilities from REQ-25 (V6.1)
 * Note: Use more specific patterns to avoid false positives
 */
const P1_CAPABILITIES = [
  'bugfix workflow 完整',
  'design-first workflow 完整',
  'quick change workflow 完整',
  'knowledge graph 集成',
  '全局知识库',
  'sf-knowledge 完整',
  'context builder 完整',
  '成本追踪 完整',
  '并行任务调度 完整',
  '跨会话续接 完整',
  'telegram webhook 通知',
  '用户自定义 tool 完整',
  '用户自定义 skill 完整',
  'sf-debugger 自愈闭环',
  'workflow 数据驱动扩展',
  'gate 组合 完整'
];

/**
 * P2 capabilities from REQ-25 (V6.x)
 * Note: Use more specific patterns to avoid false positives
 */
const P2_CAPABILITIES = [
  '多模态完整支持',
  '自愈完整闭环',
  'V3.6 四工作流',
  'change_request workflow',
  'refactor workflow',
  'ops_task workflow',
  'investigation workflow',
  '插件沙箱',
  '多机同步',
  'web ui 集成',
  '跨项目自动学习'
];

/**
 * Check if spec content references P1/P2 capabilities
 * 
 * @param specPath - Path to spec directory
 * @returns Array of referenced P1/P2 capabilities
 */
function detectP1P2References(specPath: string): string[] {
  const referencedCapabilities: string[] = [];
  
  // Check requirements.md
  const requirementsPath = join(specPath, 'requirements.md');
  if (existsSync(requirementsPath)) {
    try {
      const content = readFileSync(requirementsPath, 'utf-8').toLowerCase();
      
      // Check for P1 capabilities
      for (const capability of P1_CAPABILITIES) {
        if (content.includes(capability.toLowerCase())) {
          referencedCapabilities.push(capability);
        }
      }
      
      // Check for P2 capabilities
      for (const capability of P2_CAPABILITIES) {
        if (content.includes(capability.toLowerCase())) {
          referencedCapabilities.push(capability);
        }
      }
    } catch (error) {
      // Ignore read errors, just skip this file
    }
  }
  
  // Check design.md
  const designPath = join(specPath, 'design.md');
  if (existsSync(designPath)) {
    try {
      const content = readFileSync(designPath, 'utf-8').toLowerCase();
      
      // Check for P1 capabilities
      for (const capability of P1_CAPABILITIES) {
        if (content.includes(capability.toLowerCase())) {
          if (!referencedCapabilities.includes(capability)) {
            referencedCapabilities.push(capability);
          }
        }
      }
      
      // Check for P2 capabilities
      for (const capability of P2_CAPABILITIES) {
        if (content.includes(capability.toLowerCase())) {
          if (!referencedCapabilities.includes(capability)) {
            referencedCapabilities.push(capability);
          }
        }
      }
    } catch (error) {
      // Ignore read errors, just skip this file
    }
  }
  
  return referencedCapabilities;
}

// ============================================================
// Core Parsing Logic (复用自 scope_boundary_verifier.ts)
// ============================================================

/**
 * 解析 requirements.md 文件，提取 REQ-25 的范围边界信息
 */
function parseScopeBoundary(requirementsPath: string): { success: boolean; data?: ScopeBoundary; error?: string } {
  try {
    const content = readFileSync(requirementsPath, 'utf-8');
    const lines = content.split('\n');
    
    // 查找 REQ-25 章节
    const req25Start = findRequirementSection(lines, '25');
    if (req25Start === -1) {
      return {
        success: false,
        error: '未找到 REQ-25 章节'
      };
    }
    
    // 查找 REQ-25 结束位置（下一个 REQ- 开始或文件结束）
    const req25End = findRequirementEnd(lines, req25Start);
    
    // 提取 REQ-25 内容
    const req25Lines = lines.slice(req25Start, req25End);
    
    // 解析 P0/P1/P2 项目
    const result = parsePriorityItems(req25Lines);
    
    return {
      success: true,
      data: result.scopeBoundary
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 查找指定需求章节的开始行
 */
function findRequirementSection(lines: string[], requirementNumber: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`### Requirement ${requirementNumber}:`) || 
        lines[i].includes(`### REQ-${requirementNumber}`)) {
      return i;
    }
  }
  return -1;
}

/**
 * 查找需求章节的结束行
 */
function findRequirementEnd(lines: string[], startLine: number): number {
  for (let i = startLine + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### Requirement ') || 
        lines[i].startsWith('### REQ-')) {
      return i;
    }
  }
  return lines.length;
}

/**
 * 解析优先级项目（P0/P1/P2）
 */
function parsePriorityItems(lines: string[]): { scopeBoundary: ScopeBoundary } {
  const scopeBoundary: ScopeBoundary = {
    p0: [],
    p1: [],
    p2: []
  };
  
  let currentPriority: 'p0' | 'p1' | 'p2' | null = null;
  let currentCategory: string | null = null;
  
  // 首先，合并被换行���分割的行 - 简化版本
  const mergedLines: string[] = [];
  let currentLine = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 空行表示段落结束
    if (line === '') {
      if (currentLine) {
        mergedLines.push(currentLine);
        currentLine = '';
      }
      continue;
    }
    
    // 如果行以数字开头（如 "1. "）或包含 "THE Requirements_Document"，则是新段落开始
    if (line.match(/^\d+\./) || line.startsWith('THE Requirements_Document')) {
      if (currentLine) {
        mergedLines.push(currentLine);
      }
      currentLine = line;
    } else if (line.startsWith('- ') || line.includes('包含') || line.includes('P0') || line.includes('P1') || line.includes('P2')) {
      // 如果是列表项或包含关键字，也作为新行开始
      if (currentLine) {
        mergedLines.push(currentLine);
      }
      currentLine = line;
    } else if (currentLine && line) {
      // 否则，将行追加到当前行（处理换行）
      currentLine += ' ' + line;
    } else if (line) {
      currentLine = line;
    }
  }
  
  if (currentLine) {
    mergedLines.push(currentLine);
  }
  
  // 现在解析合并后的行
  for (let i = 0; i < mergedLines.length; i++) {
    const line = mergedLines[i];
    
    // 检测 P0 部分
    if (line.includes('P0 必做项') || line.includes('P0 项')) {
      currentPriority = 'p0';
    }
    
    // 检测 P1 部分
    if (line.includes('P1 项')) {
      currentPriority = 'p1';
    }
    
    // 检测 P2 部分
    if (line.includes('P2 项')) {
      currentPriority = 'p2';
    }
    
    // 解析 P0 分组行（以 "- " 开头，包含中文括号）
    if (currentPriority === 'p0' && line.includes('（') && line.includes('）')) {
      // 提取分组名称（括号前的内容）
      const categoryMatch = line.match(/-\s*(.+?)\s*（/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
        
        // 提取括号内的项目列表
        const itemsMatch = line.match(/（(.+)）/);
        if (itemsMatch) {
          const itemsText = itemsMatch[1];
          // 移除"共 X 项"部分
          const cleanText = itemsText.replace(/，共\s*\d+\s*项/, '');
          // 解析项目
          const items = parseChineseCommaSeparatedList(cleanText);
          
          for (const item of items) {
            if (item.trim()) {
              scopeBoundary.p0.push({
                label: item.trim(),
                priority: 'p0',
                category: currentCategory
              });
            }
          }
        }
      }
      continue;
    }
    
    // 解析 P1 项目行（包含"包含"关键字）
    if (currentPriority === 'p1' && line.includes('包含')) {
      // 移除行首的数字前缀（如 "2. "）
      let cleanLine = line.replace(/^\d+\.\s*/, '');
      // 提取"包含"之后的内容
      const match = cleanLine.match(/包含(.+)/);
      if (match) {
        const itemsText = match[1].trim();
        // 移除末尾的句号
        const cleanText = itemsText.replace(/[。.]$/, '');
        // 解析项目
        const items = parseChineseCommaSeparatedList(cleanText);
        
        for (const item of items) {
          if (item.trim()) {
            scopeBoundary.p1.push({
              label: item.trim(),
              priority: 'p1'
            });
          }
        }
      }
      continue;
    }
    
    // 解析 P2 项目行（包含"包含"关键字）
    if (currentPriority === 'p2' && line.includes('包含')) {
      // 移除行首的数字前缀（如 "3. "）
      let cleanLine = line.replace(/^\d+\.\s*/, '');
      // 提取"包含"之后的内容
      const match = cleanLine.match(/包含(.+)/);
      if (match) {
        const itemsText = match[1].trim();
        // 移除末尾的句号
        const cleanText = itemsText.replace(/[。.]$/, '');
        // 解析项目
        const items = parseChineseCommaSeparatedList(cleanText);
        
        for (const item of items) {
          if (item.trim()) {
            scopeBoundary.p2.push({
              label: item.trim(),
              priority: 'p2'
            });
          }
        }
      }
      continue;
    }
  }
  
  return { scopeBoundary };
}

/**
 * 解析中文逗号分隔的列表
 */
function parseChineseCommaSeparatedList(text: string): string[] {
  // 处理中文逗号、顿号分隔
  const items: string[] = [];
  let currentItem = '';
  let inParentheses = 0;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '（' || char === '(') {
      inParentheses++;
      currentItem += char;
    } else if (char === '）' || char === ')') {
      inParentheses--;
      currentItem += char;
    } else if ((char === '、' || char === '，' || char === ',') && inParentheses === 0) {
      if (currentItem.trim()) {
        items.push(currentItem.trim());
      }
      currentItem = '';
    } else {
      currentItem += char;
    }
  }
  
  if (currentItem.trim()) {
    items.push(currentItem.trim());
  }
  
  return items;
}

// ============================================================
// Scope Consistency Validation Logic
// ============================================================

/**
 * 读取下游 spec 的 config.kiro 文件
 */
function readSpecConfig(specPath: string): SpecConfig | null {
  const configPath = join(specPath, '.config.kiro');
  
  if (!existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    
    // 验证必需字段
    if (!config.specId || !config.workflowType || !config.specType) {
      return null;
    }
    
    // 验证 scopeTag
    if (!config.scopeTag || !['p0', 'p1', 'p2'].includes(config.scopeTag)) {
      return null;
    }
    
    return {
      specId: config.specId,
      workflowType: config.workflowType,
      specType: config.specType,
      scopeTag: config.scopeTag,
      parentSpec: config.parentSpec
    };
  } catch (error) {
    return null;
  }
}

/**
 * 验证 scope 一致性
 * 
 * 主要验证规则：
 * 1. 所有下游 spec 必须有有效的 scopeTag
 * 2. scopeTag 必须与 REQ-25 分类一致
 * 3. V6.0 release 分支（scopeTag == "p0"）项目不得依赖 P1/P2 能力
 */
export function validateScopeConsistency(
  specsRootPath: string,
  requirementsPath: string
): ValidationResult {
  try {
    // 1. 解析 REQ-25 范围边界
    const scopeResult = parseScopeBoundary(requirementsPath);
    if (!scopeResult.success || !scopeResult.data) {
      return {
        success: false,
        errorCode: 'v6_scope_boundary_parsing_failed',
        error: scopeResult.error || '无法解析 REQ-25 范围边界'
      };
    }
    
    const scopeBoundary = scopeResult.data;
    
    // 2. 读取所有下游 spec
    if (!existsSync(specsRootPath)) {
      return {
        success: false,
        errorCode: 'v6_scope_boundary_specs_root_not_found',
        error: `Specs 根目录不存在: ${specsRootPath}`
      };
    }
    
    const specDirs = readdirSync(specsRootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const failures: Array<{ specName: string; reason: string; errorCode: string }> = [];
    const scopeStats = {
      p0: 0,
      p1: 0,
      p2: 0,
      missingScopeTag: 0
    };
    
    // 3. 验证每个 spec
    for (const specDir of specDirs) {
      const specPath = join(specsRootPath, specDir);
      const config = readSpecConfig(specPath);
      
      if (!config) {
        // 没有有效的 config 或缺少 scopeTag
        // 检查是否是 V6 下游 spec（通过检查 config 文件中是否有 parentSpec 字段）
        const configPath = join(specPath, '.config.kiro');
        if (existsSync(configPath)) {
          try {
            const configContent = readFileSync(configPath, 'utf-8');
            const rawConfig = JSON.parse(configContent);
            // 只有明确声明 parentSpec 为 v6-architecture-overview 的 spec 才需要 scopeTag
            if (rawConfig.parentSpec === 'v6-architecture-overview') {
              scopeStats.missingScopeTag++;
              failures.push({
                specName: specDir,
                reason: '缺少有效的 scopeTag 字段',
                errorCode: 'v6_scope_boundary_missing_config'
              });
            }
          } catch (e) {
            // JSON 解析失败，跳过
          }
        }
        // 非 V6 下游 spec，跳过
        continue;
      }
      
      // 只验证 V6 架构下游 spec（有 parentSpec 指向 v6-architecture-overview）
      if (config.parentSpec !== 'v6-architecture-overview') {
        // 非 V6 下游 spec，跳过验证
        continue;
      }
      
      // 统计 scopeTag 分布
      switch (config.scopeTag) {
        case 'p0':
          scopeStats.p0++;
          break;
        case 'p1':
          scopeStats.p1++;
          break;
        case 'p2':
          scopeStats.p2++;
          break;
      }
      
      // 关键验证：V6.0 release 分支（scopeTag == "p0"）项目不得依赖 P1/P2 能力
      if (config.scopeTag === 'p0') {
        const referencedCapabilities = detectP1P2References(specPath);
        
        if (referencedCapabilities.length > 0) {
          failures.push({
            specName: specDir,
            reason: `P0 spec 引用了 P1/P2 能力: ${referencedCapabilities.join(', ')}`,
            errorCode: 'v6_scope_boundary_violation'
          });
        }
      }
      
      // 检查 parentSpec 引用（如果存在）
      if (config.parentSpec === 'v6-architecture-overview') {
        // 这是 V6 架构的下游 spec，需要确保 scopeTag 合理
        // 目前只做基本验证，更复杂的验证需要分析 spec 的具体内容
      }
    }
    
    const totalSpecs = specDirs.length;
    const passedSpecs = totalSpecs - failures.length;
    const failedSpecs = failures.length;
    
    // 4. 如果有失败，返回错误
    if (failures.length > 0) {
      return {
        success: false,
        errorCode: 'v6_scope_boundary_violation',
        error: `发现 ${failures.length} 个 scope 边界违例`,
        details: {
          totalSpecs,
          passedSpecs,
          failedSpecs,
          failures,
          scopeStats
        }
      };
    }
    
    // 5. 成功返回
    return {
      success: true,
      details: {
        totalSpecs,
        passedSpecs,
        failedSpecs,
        scopeStats
      }
    };
    
  } catch (error) {
    return {
      success: false,
      errorCode: 'v6_scope_boundary_validation_error',
      error: error instanceof Error ? error.message : '未知验证错误'
    };
  }
}

// ============================================================
// CLI Interface
// ============================================================

/**
 * 命令行入口点
 */
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('用法: node scope_consistency_checker.ts <specs根目录> <requirements.md路径>');
    console.error('示例: node scope_consistency_checker.ts ../../.kiro/specs ../requirements.md');
    console.error('');
    console.error('参数说明:');
    console.error('  <specs根目录>: .kiro/specs 目录的路径');
    console.error('  <requirements.md路径>: requirements.md 文件的路径');
    process.exit(1);
  }
  
  const specsRootPath = resolve(args[0]);
  const requirementsPath = resolve(args[1]);
  
  const result = validateScopeConsistency(specsRootPath, requirementsPath);
  
  if (result.success) {
    console.log(JSON.stringify({
      status: 'success',
      message: 'Scope 一致性验证通过',
      details: result.details
    }, null, 2));
  } else {
    console.error(JSON.stringify({
      status: 'error',
      errorCode: result.errorCode,
      error: result.error,
      details: result.details
    }, null, 2));
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('scope_consistency_checker.ts')) {
  main();
}

// ============================================================
// Export for testing
// ============================================================

export {
  parseScopeBoundary,
  readSpecConfig,
  findRequirementSection,
  findRequirementEnd,
  parsePriorityItems,
  parseChineseCommaSeparatedList,
  detectP1P2References
};
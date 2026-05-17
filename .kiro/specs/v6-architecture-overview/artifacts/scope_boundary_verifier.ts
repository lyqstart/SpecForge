#!/usr/bin/env node

/**
 * scope_boundary_verifier - 解析 requirements.md REQ-25 并抽取 P0/P1/P2 范围边界
 * 
 * 本工具解析 requirements.md 中的 REQ-25 章节，提取 P0、P1、P2 各项的文本标签，
 * 输出结构化列表供后续范围边界验证使用。
 * 
 * Requirements: 25.1, 25.2, 25.3
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
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

export interface ParseResult {
  /** 解析是否成功 */
  success: boolean;
  /** 解析出的范围边界数据 */
  data?: ScopeBoundary;
  /** 错误信息（如果解析失败） */
  error?: string;
  /** 原始文本位置信息 */
  metadata?: {
    /** P0 项目总数 */
    p0Count: number;
    /** P1 项目总数 */
    p1Count: number;
    /** P2 项目总数 */
    p2Count: number;
    /** 解析的原始行范围 */
    linesParsed: [number, number];
  };
}

// ============================================================
// Core Parsing Logic
// ============================================================

/**
 * 解析 requirements.md 文件，提取 REQ-25 的范围边界信息
 * 
 * @param requirementsPath - requirements.md 文件路径
 * @returns 解析结果
 */
export function parseScopeBoundary(
  requirementsPath: string
): ParseResult {
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
      data: result.scopeBoundary,
      metadata: {
        p0Count: result.scopeBoundary.p0.length,
        p1Count: result.scopeBoundary.p1.length,
        p2Count: result.scopeBoundary.p2.length,
        linesParsed: [req25Start, req25End]
      }
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
  
  // 首先，合并被换行符分割的行 - 简化版本
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
  
  // 调试：输出合并后的行（仅在需要调试时启用）
  // console.error('=== 合并后的行 ===');
  // for (let i = 0; i < mergedLines.length; i++) {
  //   console.error(`${i}: ${mergedLines[i]}`);
  // }
  // console.error('================');
  
  // 现在解析合并后的行
  for (let i = 0; i < mergedLines.length; i++) {
    const line = mergedLines[i];
    
    // 检测 P0 部分
    if (line.includes('P0 必做项') || line.includes('P0 项')) {
      currentPriority = 'p0';
      // 继续处理同一行，因为 P0 项可能在同一行
    }
    
    // 检测 P1 部分
    if (line.includes('P1 项')) {
      currentPriority = 'p1';
      // 继续处理同一行，因为 P1 项可能在同一行
    }
    
    // 检测 P2 部分
    if (line.includes('P2 项')) {
      currentPriority = 'p2';
      // 继续处理同一行，因为 P2 项可能在同一行
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
// CLI Interface
// ============================================================

/**
 * 命令行入口点
 */
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node scope_boundary_verifier.ts <requirements.md 路径>');
    console.error('示例: node scope_boundary_verifier.ts ../requirements.md');
    process.exit(1);
  }
  
  const requirementsPath = args[0];
  const result = parseScopeBoundary(requirementsPath);
  
  if (result.success && result.data) {
    console.log(JSON.stringify({
      status: 'success',
      data: result.data,
      metadata: result.metadata
    }, null, 2));
  } else {
    console.error(JSON.stringify({
      status: 'error',
      error: result.error
    }, null, 2));
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('scope_boundary_verifier.ts')) {
  main();
}

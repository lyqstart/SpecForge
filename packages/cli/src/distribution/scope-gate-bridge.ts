/**
 * Scope Gate Bridge - Adapter for accessing P1/P2 flag lists from scope-gate package
 * 
 * This module provides a bridge to access P1/P2 feature flag keys by reading
 * the parent specification's REQ-25 directly. This ensures a single source of
 * truth while avoiding circular dependencies.
 * 
 * Requirements: 4.2 (P1/P2 Default Off - truth source)
 * Property: 15 (Scope Boundary - P1/P2 flags default to false)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Interface for scope-gate exports used by distribution module
 */
export interface ScopeGateExports {
  /** 
   * 父 REQ-25 中标记为 P1 / P2 的所有 feature flag 的稳定 key 列表
   * 
   * 这是 Property 15（P1/P2 Default Off）的真值来源。
   * Distribution 模块在生成默认配置时，遍历此列表将每个 flag 初始化为 false。
   */
  readonly p1p2FlagKeys: ReadonlyArray<string>;
}

/**
 * 获取 P1/P2 feature flag keys 列表
 * 
 * 策略：
 * 1. 从父规范的 requirements.md 读取 REQ-25 数据（单一真值来源）
 * 2. 提取 P1 和 P2 能力的 ID 列表
 * 3. 转换为 feature flag key 格式（enable_<capability-id>）
 * 
 * 注：本实现直接读取父规范，避免对 scope-gate 包的循环依赖。
 * scope-gate 包的 Req25Parser 是权威解析器，但在 distribution 模块中
 * 我们使用简化版本以保持模块独立性。
 * 
 * @returns P1/P2 feature flag keys 的只读数组
 * @throws 如果无法读取或解析 REQ-25 数据
 */
export function getP1P2FlagKeys(): ReadonlyArray<string> {
  try {
    // 读取父规范的 requirements.md
    const parentSpecPath = resolveParentSpecPath();
    const requirementsContent = readFileSync(parentSpecPath, 'utf-8');
    
    // 提取 P1 和 P2 能力列表
    const p1Capabilities = extractCapabilities(requirementsContent, 'P1');
    const p2Capabilities = extractCapabilities(requirementsContent, 'P2');
    
    // 合并并转换为 feature flag key 格式
    const allP1P2Ids = [...p1Capabilities, ...p2Capabilities];
    const flagKeys = allP1P2Ids.map(id => `enable_${id}`);
    
    // 返回只读数组
    return Object.freeze(flagKeys);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load P1/P2 flag keys from parent specification: ${message}. ` +
      `This is a critical error as it prevents generating default configuration with correct P1/P2 flags.`
    );
  }
}

/**
 * 从 requirements.md 中提取指定级别（P1 或 P2）的能力列表
 * 
 * 这是 scope-gate 包 Req25Parser 的简化版本，专门用于 distribution 模块。
 * 
 * @param markdown - requirements.md 的内容
 * @param level - 'P1' 或 'P2'
 * @returns 能力 ID 列表（已规范化为 kebab-case）
 */
function extractCapabilities(markdown: string, level: 'P1' | 'P2'): string[] {
  // 查找 REQ-25 部分
  const req25Match = markdown.match(/#+\s*Requirement\s*25[:\s]/i);
  if (!req25Match) {
    return [];
  }
  
  const req25Start = req25Match.index!;
  const afterReq25 = markdown.slice(req25Start);
  
  // 找到 REQ-25 的结束位置（下一个 Requirement 或文档结束）
  const nextReqMatch = afterReq25.match(/\n#+\s+Requirement\s+\d+/i);
  const req25End = nextReqMatch ? req25Start + nextReqMatch.index! : markdown.length;
  const req25Section = markdown.slice(req25Start, req25End);
  
  // 根据级别查找对应的 AC（P1 对应 AC-2，P2 对应 AC-3）
  const acNum = level === 'P1' ? 2 : 3;
  const acPattern = new RegExp(
    `^\\s*${acNum}\\.\\s+THE\\s+Requirements_Document\\s+SHALL\\s+.*?包含([^。]+)`,
    'ism'
  );
  
  const acMatch = acPattern.exec(req25Section);
  if (!acMatch) {
    return [];
  }
  
  const listText = acMatch[1];
  
  // 分割能力列表（使用中文和英文分隔符）
  // 格式：bugfix workflow、design-first workflow、quick change workflow、...
  const items = listText
    .split(/[、，；]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
  
  // 规范化为 kebab-case ID
  const capabilities: string[] = [];
  const seenIds = new Set<string>();
  
  for (const item of items) {
    // 跳过结构性文本和括号说明
    if (/^共\s*\d+\s*项/.test(item)) continue;
    if (/^\d+\s*项/.test(item)) continue;
    if (item.length < 2) continue;
    
    const id = normalizeCapabilityId(item);
    
    // 跳过重复和空 ID
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    
    capabilities.push(id);
  }
  
  return capabilities;
}

/**
 * 规范化能力 ID 为 kebab-case 格式
 * 
 * 示例：
 *   "bugfix workflow" → "bugfix-workflow"
 *   "Knowledge Graph" → "knowledge-graph"
 *   "全局知识库 + sf-knowledge" → "全局知识库-sf-knowledge"
 * 
 * @param rawName - 原始能力名称
 * @returns 规范化的 ID
 */
function normalizeCapabilityId(rawName: string): string {
  if (!rawName) return '';
  
  let normalized = rawName.trim();
  
  // 移除括号内容（中英文括号）
  while (/[（(][^)）]+[)）]/.test(normalized)) {
    normalized = normalized.replace(/[（(][^)）]+[)）]/g, '');
  }
  
  // 替换中文标点为空格
  normalized = normalized.replace(/[、，。；：]/g, ' ');
  
  // 处理 + / _
  normalized = normalized
    .replace(/\+/g, ' ')
    .replace(/\//g, ' ')
    .replace(/_/g, ' ');
  
  // 转小写
  normalized = normalized.toLowerCase();
  
  // 替换空格为连字符
  normalized = normalized
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  return normalized;
}

/**
 * 解析父规范 requirements.md 的路径
 * 
 * 从当前包（@specforge/cli）向上查找 monorepo 根目录，
 * 然后定位到 .kiro/specs/v6-architecture-overview/requirements.md
 * 
 * @returns 父规范 requirements.md 的绝对路径
 * @throws 如果无法找到父规范文件
 */
function resolveParentSpecPath(): string {
  // 从当前文件向上查找 monorepo 根目录
  // 当前文件: packages/cli/src/distribution/scope-gate-bridge.ts
  // 目标: .kiro/specs/v6-architecture-overview/requirements.md
  
  // CommonJS 环境下使用 __dirname
  const currentDir = __dirname;
  
  // 从 packages/cli/src/distribution 向上 4 级到达 monorepo 根
  const repoRoot = resolve(currentDir, '../../../../');
  
  // 构造父规范路径
  const parentSpecPath = resolve(
    repoRoot,
    '.kiro/specs/v6-architecture-overview/requirements.md'
  );
  
  // 验证文件存在
  try {
    readFileSync(parentSpecPath, 'utf-8');
    return parentSpecPath;
  } catch {
    throw new Error(
      `Parent specification not found at expected path: ${parentSpecPath}. ` +
      `Ensure the v6-architecture-overview spec exists in .kiro/specs/.`
    );
  }
}

/**
 * 创建 ScopeGateExports 实例
 * 
 * 这是推荐的使用方式，提供了懒加载和缓存。
 * 
 * @returns ScopeGateExports 实例
 */
export function createScopeGateExports(): ScopeGateExports {
  // 懒加载：只在首次访问时读取
  let cachedKeys: ReadonlyArray<string> | null = null;
  
  return {
    get p1p2FlagKeys(): ReadonlyArray<string> {
      if (cachedKeys === null) {
        cachedKeys = getP1P2FlagKeys();
      }
      return cachedKeys;
    }
  };
}

/**
 * 默认导出：预创建的 ScopeGateExports 实例
 * 
 * 使用示例：
 * ```typescript
 * import scopeGateExports from './scope-gate-bridge';
 * const flagKeys = scopeGateExports.p1p2FlagKeys;
 * ```
 */
const scopeGateExports = createScopeGateExports();
export default scopeGateExports;

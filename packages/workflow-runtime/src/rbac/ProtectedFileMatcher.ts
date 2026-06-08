/**
 * ProtectedFileMatcher.ts — 受保护文件路径匹配器
 *
 * 根据 filePath 判断资源类型（ResourceType）。
 * 路径匹配保持保守：只识别 .specforge/ 下的已知文件名，
 * 不将普通源码文件误判为受保护资源。
 *
 * 无法识别的路径返回 undefined（调用方应视为不受保护 / code_file），
 * 不提升权限。
 */

import type { ResourceType } from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// 匹配规则
// ---------------------------------------------------------------------------

/**
 * 文件名 → 资源类型映射。
 *
 * 只匹配确切的文件名（basename），不匹配目录前缀。
 * 调用方负责确保 filePath 是文件路径而非目录路径。
 */
const FILE_NAME_TO_RESOURCE_TYPE: ReadonlyMap<string, ResourceType> = new Map([
  // spec_file
  ['requirements.md', 'spec_file'],
  ['design.md', 'spec_file'],
  ['tasks.md', 'spec_file'],

  // gate_file
  ['gate_summary.md', 'gate_file'],
  ['gate_result.md', 'gate_file'],

  // decision_file
  ['user_decision.json', 'decision_file'],

  // merge_file
  ['merge_report.md', 'merge_file'],

  // evidence_file
  ['verification_report.md', 'evidence_file'],
  ['changed_files_audit.md', 'evidence_file'],
  ['close_gate.md', 'evidence_file'],
  ['close_gate.json', 'evidence_file'],
]);

/**
 * 目录片段 → 资源类型映射。
 *
 * 如果路径包含这些目录片段，即使文件名不在上面映射中，
 * 也可以归入对应资源类型。
 */
const DIR_SEGMENT_TO_RESOURCE_TYPE: ReadonlyMap<string, ResourceType> = new Map([
  // .specforge/specs/WI-XXX/ 下的 spec 文件
  // 不匹配——由文件名匹配覆盖

  // gates/ 目录下的文件
  ['gates', 'gate_file'],

  // evidence/ 目录下的文件
  ['evidence', 'evidence_file'],
]);

// ---------------------------------------------------------------------------
// extractBasename
// ---------------------------------------------------------------------------

/**
 * 从路径中提取文件名（最后一个路径片段）。
 * 同时处理 / 和 \ 路径分隔符。
 */
function extractBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

// ---------------------------------------------------------------------------
// ProtectedFileMatcher
// ---------------------------------------------------------------------------

/**
 * 受保护文件路径匹配器。
 *
 * 用法：
 * ```ts
 * const resourceType = ProtectedFileMatcher.match('.specforge/specs/WI-001/requirements.md');
 * // => 'spec_file'
 *
 * const unknown = ProtectedFileMatcher.match('src/index.ts');
 * // => undefined
 * ```
 */
export const ProtectedFileMatcher = {
  /**
   * 根据文件路径判断资源类型。
   *
   * @param filePath 文件路径（相对项目根或绝对路径均可）
   * @returns ResourceType 或 undefined
   *
   * 匹配策略（按优先级）：
   * 1. 精确文件名匹配（basename）
   * 2. 目录片段匹配（如果路径在 .specforge/ 下）
   * 3. 未识别 → undefined
   */
  match(filePath: string): ResourceType | undefined {
    if (!filePath || typeof filePath !== 'string') {
      return undefined;
    }

    const normalized = filePath.replace(/\\/g, '/');

    // 安全边界：只识别 .specforge/ 下的路径
    // 不将普通源码文件误判
    if (!normalized.includes('.specforge/')) {
      return undefined;
    }

    // 策略 1：精确文件名匹配
    const basename = extractBasename(filePath);
    const byName = FILE_NAME_TO_RESOURCE_TYPE.get(basename);
    if (byName !== undefined) {
      return byName;
    }

    // 策略 2：目录片段匹配（保守）
    // 例如 .specforge/specs/WI-001/gates/xxx.md → gate_file
    // 例如 .specforge/specs/WI-001/evidence/xxx.md → evidence_file
    const segments = normalized.split('/');
    for (let i = segments.length - 2; i >= 0; i--) {
      const segment = segments[i];
      const byDir = DIR_SEGMENT_TO_RESOURCE_TYPE.get(segment);
      if (byDir !== undefined) {
        return byDir;
      }
    }

    // 策略 3：未识别
    return undefined;
  },

  /**
   * 判断文件路径是否为受保护的 spec 文件。
   */
  isSpecFile(filePath: string): boolean {
    return this.match(filePath) === 'spec_file';
  },

  /**
   * 判断文件路径是否为受保护的 evidence 文件。
   */
  isEvidenceFile(filePath: string): boolean {
    return this.match(filePath) === 'evidence_file';
  },

  /**
   * 判断文件路径是否为受保护的 gate 文件。
   */
  isGateFile(filePath: string): boolean {
    return this.match(filePath) === 'gate_file';
  },

  /**
   * 判断文件路径是否为受保护的 decision 文件。
   */
  isDecisionFile(filePath: string): boolean {
    return this.match(filePath) === 'decision_file';
  },

  /**
   * 判断文件路径是否为受保护的 merge 文件。
   */
  isMergeFile(filePath: string): boolean {
    return this.match(filePath) === 'merge_file';
  },

  /**
   * 判断文件路径是否为任何受保护文件。
   */
  isProtected(filePath: string): boolean {
    return this.match(filePath) !== undefined;
  },
} as const;

/**
 * 独立函数形式，方便解构使用。
 */
export function matchProtectedFile(filePath: string): ResourceType | undefined {
  return ProtectedFileMatcher.match(filePath);
}

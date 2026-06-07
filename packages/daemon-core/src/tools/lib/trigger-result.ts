/**
 * trigger-result.ts — §6.3 匹配结果类型
 *
 * 从 workflow-path-selector-v11.ts 提取的类型定义。
 */

// ---------------------------------------------------------------------------
// §6.3 匹配结果类型
// ---------------------------------------------------------------------------

export type MatchResultType =
  | 'exact_match'
  | 'partial_match'
  | 'related_match'
  | 'conflict_match'
  | 'no_match'
  | 'spec_gap_match';

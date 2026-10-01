/**
 * write-guard-v11.ts — v1.1 标准 Write Guard（§12.5-§12.6）
 *
 * 产品边界：SPS-1.0。当前可执行合同由本模块导出、Runtime 消费者与回归测试固定；归档 v1.1 标准仅作历史证据。
 *
 * **CANONICAL WRITE GUARD — all write decisions MUST go through this module.**
 *
 * Write Guard 是程序级写入拦截器，必须覆盖所有写入入口。
 * 所有写入必须声明 expected_write_files，无声明则默认只读或阻断。
 *
 * 拦截规则（§12.6）：
 * 1. 无 active WI 写代码
 * 2. code_change_allowed=false 写代码
 * 3. 写入不在 allowed_write_files 内的代码文件
 * 4. 普通 Agent 写 .specforge/project/**
 * 5. 普通 Agent 写 user_decision.json
 * 6. 普通 Agent 写 gates/**
 * 7. 普通 Agent 写 gate_summary.md
 * 8. 普通 Agent 写 merge_report.md
 * 9. 冻结后修改 Candidate / Manifest / Gate Summary
 * 10. closed WI 继续写入
 *
 * Default is DENY; allow only for controlled subjects with specific path patterns.
 * ACTOR_ROLES: 'merge_runner', 'gate_runner', 'user_decision_recorder',
 *              'sf-orchestrator', 'code_permission_service', 'close_gate', 'agent'
 */

import { ACTOR_ROLES } from '@specforge/types/actor-roles'
import {
  decideWritePermission,
  type WriteDecisionContext,
  type WriteDecisionResult,
  type WriteTargetDetails,
} from '@specforge/permission-engine'

// ---------------------------------------------------------------------------
// Core types — canonical definitions
// ---------------------------------------------------------------------------

/**
 * Context for the canonical write guard check.
 * All write-policy consumers MUST use this type.
 */
export type WriteGuardContext = WriteDecisionContext;

/**
 * Result of a write-permission check.
 */
export type WriteCheckResult = WriteDecisionResult;

// ---------------------------------------------------------------------------
// checkWrite — CANONICAL single judgment entry point (§12.5-§12.6)
// ---------------------------------------------------------------------------

/**
 * Check whether a write operation is allowed.
 *
 * This is the **single canonical entry point** for ALL write-permission
 * decisions in the system. Every module that needs to gate writes MUST
 * call this function (or a thin wrapper that delegates here).
 *
 * @param ctx Write Guard context
 * @param targetPath Target path to write (relative to project root)
 * @param operation Write operation type
 */
export function checkWrite(
  ctx: WriteGuardContext,
  targetPath: string,
  operation: 'create' | 'modify' | 'delete',
  targetDetails: WriteTargetDetails = {},
): WriteCheckResult {
  return decideWritePermission(ctx, targetPath, operation, targetDetails);
}

// ---------------------------------------------------------------------------
// changed_files_audit（§12.7）
// ---------------------------------------------------------------------------

export interface AuditEntry {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  in_allowed_write_files: boolean;
  is_spec_write: boolean;
  is_side_effect: boolean;
}

export interface AuditResult {
  passed: boolean;
  total_files: number;
  in_scope: number;
  out_of_scope: number;
  spec_writes: number;
  side_effects: number;
  violations: string[];
  entries: AuditEntry[];
}

/**
 * Execute a changed-files audit (§12.7).
 */
export function performChangedFilesAudit(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
  actor?: string,
): AuditResult {
  const entries: AuditEntry[] = [];
  const violations: string[] = [];
  const normalizedAllowed = new Map(
    allowedWriteFiles.map(f => [f.path.replace(/\\/g, '/'), f.operation] as const),
  );

  for (const file of changedFiles) {
    const normalized = file.path.replace(/\\/g, '/');
    const inScope = Array.from(normalizedAllowed.entries()).some(([allowedPath, allowedOp]) => {
      const pathMatch = normalized === allowedPath || normalized.startsWith(allowedPath + '/');
      const opMatch = allowedOp === file.operation || allowedOp === 'any';
      return pathMatch && opMatch;
    });
    let isSpecWrite = normalized.startsWith('.specforge/project/');
    const isSideEffect = !inScope && !isSpecWrite;

    if (isSpecWrite) {
      if (actor === ACTOR_ROLES.mergeRunner) {
        // Legitimate merge_runner write — not a violation
        isSpecWrite = false;
      } else {
        violations.push(`spec_write_by_non_merge_runner: ${normalized} (actor: ${actor ?? 'unknown'})`);
      }
    }

    entries.push({
      path: normalized,
      operation: file.operation,
      in_allowed_write_files: inScope,
      is_spec_write: isSpecWrite,
      is_side_effect: isSideEffect,
    });

    if (!inScope && !isSpecWrite) {
      violations.push(`out_of_scope: ${normalized}`);
    }
  }

  return {
    passed: violations.length === 0,
    total_files: changedFiles.length,
    in_scope: entries.filter(e => e.in_allowed_write_files).length,
    out_of_scope: entries.filter(e => !e.in_allowed_write_files && !e.is_spec_write).length,
    spec_writes: entries.filter(e => e.is_spec_write).length,
    side_effects: entries.filter(e => e.is_side_effect).length,
    violations,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './bash-guard.js'

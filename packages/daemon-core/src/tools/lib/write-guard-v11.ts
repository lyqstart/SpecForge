/**
 * write-guard-v11.ts — v1.1 标准 Write Guard（§12.5-§12.6）
 *
 * 依据：SpecForge 最终融合标准 v1.1
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

import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles'

// ---------------------------------------------------------------------------
// Core types — canonical definitions
// ---------------------------------------------------------------------------

/**
 * Context for the canonical write guard check.
 * All write-policy consumers MUST use this type (or the WritePolicyContext alias).
 */
export interface WriteGuardContext {
  /** Whether there is an active Work Item */
  hasActiveWI: boolean;
  /** Current WI's work_item.json content */
  workItem?: {
    work_item_id: string;
    status: string;
    code_change_allowed: boolean;
    allowed_write_files: Array<{ path: string; operation: string }>;
    workflow_path: string | null;
  };
  /** Caller role — determines which paths the subject may write */
  callerRole: ActorRole;
  /** Whether the WI is in frozen state (after gate_summary_gate passes) */
  isFrozen: boolean;
}

/**
 * Result of a write-permission check.
 */
export interface WriteCheckResult {
  allowed: boolean;
  violations: string[];
}

/**
 * Alias for backward compatibility — consumers that imported WritePolicyResult
 * from write-policy.ts or path-policy.ts get the same shape.
 */
export type WritePolicyResult = WriteCheckResult;

/**
 * Alias for backward compatibility — WritePolicyContext is structurally
 * identical to WriteGuardContext.
 */
export type WritePolicyContext = WriteGuardContext;

// ---------------------------------------------------------------------------
// Rule-engine types (for extensibility / audit)
// ---------------------------------------------------------------------------

/**
 * A single write-policy rule that can be evaluated independently.
 */
export interface WritePolicyRule {
  id: string;
  description: string;
  check: (ctx: WritePolicyContext, targetPath: string) => string | null;
}

// ---------------------------------------------------------------------------
// Built-in rules (§12.6)
// ---------------------------------------------------------------------------

/** Rule 10: closed WI cannot be written */
const ruleClosedWI: WritePolicyRule = {
  id: 'closed-wi',
  description: 'closed WI cannot be written',
  check(ctx, _targetPath) {
    if (ctx.workItem && ctx.workItem.status === 'closed') {
      return `closed WI cannot be written: ${ctx.workItem.work_item_id}`;
    }
    return null;
  },
};

/** Rule 1: no active WI → no code writes */
const ruleNoActiveWI: WritePolicyRule = {
  id: 'no-active-wi',
  description: 'no active WI, cannot write code',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (!ctx.hasActiveWI && !normalized.startsWith('.specforge/')) {
      return `no active WI, cannot write code: ${targetPath}`;
    }
    return null;
  },
};

/** Rule 4: agent cannot write .specforge/project/ */
const ruleAgentSpecForgeProject: WritePolicyRule = {
  id: 'agent-specforge-project',
  description: 'agent cannot write .specforge/project/',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (ctx.callerRole === 'agent' && normalized.startsWith('.specforge/project/')) {
      return `agent cannot write .specforge/project/: ${targetPath}`;
    }
    return null;
  },
};

/** Rule 5: agent cannot write user_decision.json */
const ruleAgentUserDecision: WritePolicyRule = {
  id: 'agent-user-decision',
  description: 'agent cannot write user_decision.json',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (ctx.callerRole === 'agent' && normalized.includes('user_decision.json')) {
      return `agent cannot write user_decision.json`;
    }
    return null;
  },
};

/** Rule 6-8: agent cannot write gates/, gate_summary.md, merge_report.md */
const ruleAgentRestrictedFiles: WritePolicyRule = {
  id: 'agent-restricted-files',
  description: 'agent cannot write gates/, gate_summary.md, merge_report.md',
  check(ctx, targetPath) {
    if (ctx.callerRole !== 'agent') return null;
    const normalized = targetPath.replace(/\\/g, '/');
    if (normalized.includes('/gates/')) return `agent cannot write gates/`;
    if (normalized.endsWith('gate_summary.md')) return `agent cannot write gate_summary.md`;
    if (normalized.endsWith('merge_report.md')) return `agent cannot write merge_report.md`;
    return null;
  },
};

/** Rule 9: frozen state restrictions */
const ruleFrozen: WritePolicyRule = {
  id: 'frozen',
  description: 'frozen: cannot modify candidates/manifest/gate_summary',
  check(ctx, targetPath) {
    if (!ctx.isFrozen) return null;
    const normalized = targetPath.replace(/\\/g, '/');
    if (normalized.includes('/candidates/')) return `frozen: cannot modify candidates/: ${targetPath}`;
    if (normalized.endsWith('candidate_manifest.json')) return `frozen: cannot modify candidate_manifest.json`;
    if (normalized.endsWith('gate_summary.md')) return `frozen: cannot modify gate_summary.md`;
    return null;
  },
};

/** Rules 2-3: code write permission & allowed_write_files check */
const ruleCodeWritePermission: WritePolicyRule = {
  id: 'code-write-permission',
  description: 'code_change_allowed and allowed_write_files check',
  check(ctx, targetPath) {
    if (!ctx.workItem) return null;
    const normalized = targetPath.replace(/\\/g, '/');
    if (normalized.startsWith('.specforge/')) return null;

    if (!ctx.workItem.code_change_allowed) {
      return `code_change_allowed=false, cannot write: ${targetPath}`;
    }

    const allowed = ctx.workItem.allowed_write_files ?? [];
    const isInAllowed = allowed.some(
      (f) =>
        normalized === f.path.replace(/\\/g, '/') ||
        normalized.startsWith(f.path.replace(/\\/g, '/') + '/'),
    );
    if (!isInAllowed && allowed.length > 0) {
      return `file not in allowed_write_files: ${targetPath}`;
    }
    return null;
  },
};

/**
 * Default rule set (ordered by priority).
 * Exported so that consumers (e.g. bash-guard) can reference individual rules.
 */
export const DEFAULT_WRITE_POLICY_RULES: WritePolicyRule[] = [
  ruleClosedWI,
  ruleNoActiveWI,
  ruleAgentSpecForgeProject,
  ruleAgentUserDecision,
  ruleAgentRestrictedFiles,
  ruleFrozen,
  ruleCodeWritePermission,
];

// ---------------------------------------------------------------------------
// evaluatePolicy — rule-engine evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a set of write-policy rules against the given context and target.
 *
 * Returns the first violation from each rule (short-circuit per rule),
 * but continues checking all rules to collect the full set of violations.
 */
export function evaluatePolicy(
  ctx: WritePolicyContext,
  targetPath: string,
  operation: 'create' | 'modify' | 'delete',
  rules: WritePolicyRule[] = DEFAULT_WRITE_POLICY_RULES,
): WritePolicyResult {
  const violations: string[] = [];

  for (const rule of rules) {
    const violation = rule.check(ctx, targetPath);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

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
): WriteCheckResult {
  const violations: string[] = [];
  const normalized = targetPath.replace(/\\/g, '/');

  // Rule 10: closed WI
  if (ctx.workItem && ctx.workItem.status === 'closed') {
    violations.push(`closed WI cannot be written: ${ctx.workItem.work_item_id}`);
    return { allowed: false, violations };
  }

  // Rule 1: no active WI → no code writes (non-.specforge/ = code)
  if (!ctx.hasActiveWI && !normalized.startsWith('.specforge/')) {
    violations.push(`no active WI, cannot write code: ${targetPath}`);
    return { allowed: false, violations };
  }

  // Rule 4: agent cannot write .specforge/project/**
  if (ctx.callerRole === 'agent' && normalized.startsWith('.specforge/project/')) {
    violations.push(`agent cannot write .specforge/project/: ${targetPath}`);
    return { allowed: false, violations };
  }

  // Rule 5: agent cannot write user_decision.json
  if (ctx.callerRole === 'agent' && normalized.includes('user_decision.json')) {
    violations.push(`agent cannot write user_decision.json`);
    return { allowed: false, violations };
  }

  // Rule 6: agent cannot write gates/**
  if (ctx.callerRole === 'agent' && normalized.includes('/gates/')) {
    violations.push(`agent cannot write gates/`);
    return { allowed: false, violations };
  }

  // Rule 7: agent cannot write gate_summary.md
  if (ctx.callerRole === 'agent' && normalized.endsWith('gate_summary.md')) {
    violations.push(`agent cannot write gate_summary.md`);
    return { allowed: false, violations };
  }

  // Rule 8: agent cannot write merge_report.md
  if (ctx.callerRole === 'agent' && normalized.endsWith('merge_report.md')) {
    violations.push(`agent cannot write merge_report.md`);
    return { allowed: false, violations };
  }

  // Rule 9: frozen state — cannot modify candidates/manifest/gate_summary
  if (ctx.isFrozen) {
    if (normalized.includes('/candidates/')) {
      violations.push(`frozen: cannot modify candidates/: ${targetPath}`);
    }
    if (normalized.endsWith('candidate_manifest.json')) {
      violations.push(`frozen: cannot modify candidate_manifest.json`);
    }
    if (normalized.endsWith('gate_summary.md')) {
      violations.push(`frozen: cannot modify gate_summary.md`);
    }
    if (violations.length > 0) {
      return { allowed: false, violations };
    }
  }

  // Rules 2-3: code write permission + allowed_write_files
  if (ctx.workItem && !normalized.startsWith('.specforge/')) {
    if (!ctx.workItem.code_change_allowed) {
      violations.push(`code_change_allowed=false, cannot write: ${targetPath}`);
      return { allowed: false, violations };
    }

    const allowed = ctx.workItem.allowed_write_files ?? [];
    const isInAllowed = allowed.some(
      (f) => normalized === f.path.replace(/\\/g, '/') || normalized.startsWith(f.path.replace(/\\/g, '/') + '/'),
    );
    if (!isInAllowed && allowed.length > 0) {
      violations.push(`file not in allowed_write_files: ${targetPath}`);
      return { allowed: false, violations };
    }
  }

  // Privileged role exemptions
  const privilegedRoles = new Set<ActorRole>([ACTOR_ROLES.mergeRunner, ACTOR_ROLES.gateRunner, ACTOR_ROLES.userDecisionRecorder, ACTOR_ROLES.orchestrator, ACTOR_ROLES.codePermissionService, ACTOR_ROLES.closeGate]);
  if (privilegedRoles.has(ctx.callerRole)) {
    if (ctx.callerRole === ACTOR_ROLES.mergeRunner && normalized.startsWith('.specforge/project/')) {
      return { allowed: true, violations: [] };
    }
    if (ctx.callerRole === ACTOR_ROLES.userDecisionRecorder && normalized.includes('user_decision.json')) {
      return { allowed: true, violations: [] };
    }
    if (ctx.callerRole === ACTOR_ROLES.gateRunner && (normalized.includes('/gates/') || normalized.endsWith('gate_summary.md'))) {
      return { allowed: true, violations: [] };
    }
  }

  return { allowed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// enforceWritePolicy — adapter for path-policy.ts consumers
// ---------------------------------------------------------------------------

/**
 * Enforce write policy based on actor + path + operation + WI status.
 *
 * This is a convenience adapter that translates the flat-parameter calling
 * convention (used by path-policy.ts) into the canonical `checkWrite()` call.
 * ALL logic lives in `checkWrite()`; this function only maps parameters.
 */
export function enforceWritePolicy(params: {
  actor: string;
  filePath: string;
  operation: 'read' | 'write' | 'delete';
  wiStatus?: string;
  codePermission?: boolean;
  allowedWriteFiles?: string[];
}): WritePolicyResult {
  const { actor, filePath, operation, wiStatus, codePermission, allowedWriteFiles } = params;

  // Reads are always allowed
  if (operation === 'read') {
    return { allowed: true, violations: [] };
  }

  // Map flat params to WriteGuardContext
  const ctx: WriteGuardContext = {
    hasActiveWI: wiStatus !== undefined && wiStatus !== 'closed',
    workItem: wiStatus !== undefined
      ? {
          work_item_id: '',
          status: wiStatus,
          code_change_allowed: codePermission !== false,
          allowed_write_files: (allowedWriteFiles ?? []).map(f => ({ path: f, operation: 'modify' })),
          workflow_path: null,
        }
      : undefined,
    callerRole: actor as WriteGuardContext['callerRole'],
    isFrozen: false,
  };

  const mappedOp: 'create' | 'modify' | 'delete' =
    operation === 'delete' ? 'delete' : 'modify';

  return checkWrite(ctx, filePath, mappedOp);
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
): AuditResult {
  const entries: AuditEntry[] = [];
  const violations: string[] = [];
  const normalizedAllowed = new Set(allowedWriteFiles.map(f => f.path.replace(/\\/g, '/')));

  for (const file of changedFiles) {
    const normalized = file.path.replace(/\\/g, '/');
    const inScope = normalizedAllowed.has(normalized);
    const isSpecWrite = normalized.startsWith('.specforge/project/');
    const isSideEffect = !inScope && !isSpecWrite;

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

    if (isSpecWrite) {
      violations.push(`spec_write_by_agent: ${normalized}`);
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

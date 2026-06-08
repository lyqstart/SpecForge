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
  /**
   * Whether RBAC file protection is enabled for protected spec/evidence files.
   * When true, spec files (requirements.md, design.md, tasks.md) and evidence
   * files cannot be modified/deleted by sf-orchestrator or unknown actors.
   * Default: undefined (treated as false — no behavior change).
   */
  enableRBAC?: boolean;
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
  check: (ctx: WritePolicyContext, targetPath: string, operation?: 'create' | 'modify' | 'delete') => string | null;
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

/** Rule 4: .specforge/project/ only writable by merge_runner */
const ruleSpecForgeProject: WritePolicyRule = {
  id: 'specforge-project-access',
  description: '.specforge/project/ only writable by merge_runner',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (!normalized.startsWith('.specforge/project/')) return null;
    if (ctx.callerRole === ACTOR_ROLES.mergeRunner) return null;
    return `only merge_runner may write .specforge/project/: ${targetPath}`;
  },
};

/** Rule 5: user_decision.json only writable by user_decision_recorder */
const ruleUserDecision: WritePolicyRule = {
  id: 'user-decision-access',
  description: 'user_decision.json only writable by user_decision_recorder',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (!normalized.includes('user_decision.json')) return null;
    if (ctx.callerRole === ACTOR_ROLES.userDecisionRecorder) return null;
    return `only user_decision_recorder may write user_decision.json`;
  },
};

/** Rules 6-8: gates/ only gate_runner, gate_summary.md only gate_runner, merge_report.md only merge_runner */
const ruleRestrictedFiles: WritePolicyRule = {
  id: 'restricted-files-access',
  description: 'gates/ only gate_runner, gate_summary.md only gate_runner, merge_report.md only merge_runner',
  check(ctx, targetPath) {
    const normalized = targetPath.replace(/\\/g, '/');
    if (normalized.includes('/gates/') && ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      return `only gate_runner may write gates/: ${targetPath}`;
    }
    if (normalized.endsWith('gate_summary.md') && ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      return `only gate_runner may write gate_summary.md`;
    }
    if (normalized.endsWith('merge_report.md') && ctx.callerRole !== ACTOR_ROLES.mergeRunner) {
      return `only merge_runner may write merge_report.md`;
    }
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

/** Rules 2-3: code write permission + allowed_write_files (path + operation match) */
const ruleCodeWritePermission: WritePolicyRule = {
  id: 'code-write-permission',
  description: 'code_change_allowed and allowed_write_files (path + operation) check',
  check(ctx, targetPath, operation) {
    if (!ctx.workItem) return null;
    const normalized = targetPath.replace(/\\/g, '/');
    if (normalized.startsWith('.specforge/')) return null;

    if (!ctx.workItem.code_change_allowed) {
      return `code_change_allowed=false, cannot write: ${targetPath}`;
    }

    const allowed = ctx.workItem.allowed_write_files ?? [];
    if (allowed.length > 0) {
      const matchByPathAndOp = allowed.some(
        (f) => {
          const normalizedAllowed = f.path.replace(/\\/g, '/');
          const pathMatch = normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + '/');
          const opMatch = f.operation === operation || f.operation === 'any';
          return pathMatch && opMatch;
        },
      );
      if (!matchByPathAndOp) {
        return `file+operation not in allowed_write_files: ${targetPath} (${operation})`;
      }
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
  ruleSpecForgeProject,
  ruleUserDecision,
  ruleRestrictedFiles,
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
    const violation = rule.check(ctx, targetPath, operation);
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

  // v1.1: Default DENY — unknown actor
  const VALID_ROLES = new Set<string>(Object.values(ACTOR_ROLES));
  if (!VALID_ROLES.has(ctx.callerRole)) {
    violations.push(`unknown actor role: ${ctx.callerRole}, write denied`);
    return { allowed: false, violations };
  }

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

  // v1.1: Per-resource positive allowlist — only declared actor may write

  // .specforge/project/** → only merge_runner
  if (normalized.startsWith('.specforge/project/')) {
    if (ctx.callerRole !== ACTOR_ROLES.mergeRunner) {
      violations.push(`only merge_runner may write .specforge/project/: ${targetPath} (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  // gates/** → only gate_runner
  if (normalized.includes('/gates/')) {
    if (ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      violations.push(`only gate_runner may write gates/: ${targetPath} (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  // gate_summary.md → only gate_runner
  if (normalized.endsWith('gate_summary.md')) {
    if (ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      violations.push(`only gate_runner may write gate_summary.md (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  // user_decision.json → only user_decision_recorder
  if (normalized.includes('user_decision.json')) {
    if (ctx.callerRole !== ACTOR_ROLES.userDecisionRecorder) {
      violations.push(`only user_decision_recorder may write user_decision.json (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  // merge_report.md → only merge_runner
  if (normalized.endsWith('merge_report.md')) {
    if (ctx.callerRole !== ACTOR_ROLES.mergeRunner) {
      violations.push(`only merge_runner may write merge_report.md (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
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

  // Rule RBAC: protected spec/evidence file protection (Round B.1)
  // Only active when enableRBAC=true. Does not change behavior when false/undefined.
  if (ctx.enableRBAC === true && normalized.includes('.specforge/')) {
    const rbacViolation = checkRBACFileProtection(ctx, normalized, operation);
    if (rbacViolation !== null) {
      return { allowed: false, violations: [rbacViolation] };
    }
  }

  // Rules 2-3: code write permission + allowed_write_files (path + operation match)
  if (ctx.workItem && !normalized.startsWith('.specforge/')) {
    if (!ctx.workItem.code_change_allowed) {
      violations.push(`code_change_allowed=false, cannot write: ${targetPath}`);
      return { allowed: false, violations };
    }

    const allowed = ctx.workItem.allowed_write_files ?? [];
    if (allowed.length > 0) {
      const matchByPathAndOp = allowed.some(
        (f) => {
          const normalizedAllowed = f.path.replace(/\\/g, '/');
          const pathMatch = normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + '/');
          const opMatch = f.operation === operation || f.operation === 'any';
          return pathMatch && opMatch;
        },
      );
      if (!matchByPathAndOp) {
        violations.push(`file+operation not in allowed_write_files: ${targetPath} (${operation})`);
        return { allowed: false, violations };
      }
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
// RBAC protected file detection (Round B.1)
// ---------------------------------------------------------------------------

/**
 * Protected spec file basenames.
 * These files require authorized subjects for create/modify when enableRBAC=true.
 */
const RBAC_SPEC_FILES = new Set([
  'requirements.md',
  'design.md',
  'tasks.md',
]);

/**
 * Protected evidence file basenames.
 */
const RBAC_EVIDENCE_FILES = new Set([
  'verification_report.md',
  'changed_files_audit.md',
  'close_gate.md',
  'close_gate.json',
]);

/**
 * Extract basename from a normalized (forward-slash) path.
 */
function extractBasename(normalizedPath: string): string {
  const idx = normalizedPath.lastIndexOf('/');
  return idx >= 0 ? normalizedPath.slice(idx + 1) : normalizedPath;
}

/**
 * Detect if a normalized path is a RBAC-protected file.
 * Returns the resource type string or undefined.
 */
function detectProtectedResource(normalizedPath: string): string | undefined {
  const basename = extractBasename(normalizedPath);

  // Spec files
  if (RBAC_SPEC_FILES.has(basename)) return 'spec_file';

  // Decision file
  if (basename === 'user_decision.json') return 'decision_file';

  // Merge file
  if (basename === 'merge_report.md') return 'merge_file';

  // Gate files (by name)
  if (basename === 'gate_summary.md' || basename === 'gate_result.md') return 'gate_file';

  // Gate files (by directory)
  if (normalizedPath.includes('/gates/')) return 'gate_file';

  // Evidence files (by name)
  if (RBAC_EVIDENCE_FILES.has(basename)) return 'evidence_file';

  // Evidence files (by directory)
  if (normalizedPath.includes('/evidence/')) return 'evidence_file';

  return undefined;
}

/**
 * Actors that can modify specific resource types under RBAC.
 * Map of actorRole -> Set of resource types they can create/modify.
 */
const RBAC_AUTHORIZED_MODIFY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [ACTOR_ROLES.gateRunner, new Set(['gate_file'])],
  [ACTOR_ROLES.userDecisionRecorder, new Set(['decision_file'])],
  [ACTOR_ROLES.mergeRunner, new Set(['merge_file'])],
  [ACTOR_ROLES.closeGate, new Set(['evidence_file'])],
  // agent can create evidence only (not modify/delete)
]);

/**
 * Actors that can create specific resource types under RBAC.
 */
const RBAC_AUTHORIZED_CREATE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [ACTOR_ROLES.gateRunner, new Set(['gate_file'])],
  [ACTOR_ROLES.userDecisionRecorder, new Set(['decision_file'])],
  [ACTOR_ROLES.mergeRunner, new Set(['merge_file'])],
  [ACTOR_ROLES.closeGate, new Set(['evidence_file'])],
  [ACTOR_ROLES.agent, new Set(['evidence_file'])],
]);

/**
 * Check RBAC file protection rules.
 * Returns a violation string or null if allowed.
 *
 * Rules:
 * 1. sf-orchestrator cannot modify/delete any protected file
 * 2. Only authorized subjects can modify their designated resource types
 * 3. Only authorized subjects can create their designated resource types
 * 4. Unknown/unmapped actors get no special permissions
 */
function checkRBACFileProtection(
  ctx: WriteGuardContext,
  normalizedPath: string,
  operation: 'create' | 'modify' | 'delete',
): string | null {
  const resource = detectProtectedResource(normalizedPath);
  if (resource === undefined) return null; // Not a protected file

  // sf-orchestrator cannot modify/delete protected files
  if (ctx.callerRole === ACTOR_ROLES.orchestrator) {
    if (operation === 'modify' || operation === 'delete') {
      return `RBAC: sf-orchestrator cannot ${operation} protected ${resource}: ${normalizedPath}`;
    }
    // create: fall through to general authorization check
  }

  // Check if actor is authorized for this operation on this resource
  const authMap = operation === 'create' ? RBAC_AUTHORIZED_CREATE : RBAC_AUTHORIZED_MODIFY;
  const authorizedResources = authMap.get(ctx.callerRole);
  if (authorizedResources && authorizedResources.has(resource)) {
    return null; // Authorized
  }

  // Not authorized
  return `RBAC: ${ctx.callerRole} is not authorized to ${operation} ${resource}: ${normalizedPath}`;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './bash-guard.js'

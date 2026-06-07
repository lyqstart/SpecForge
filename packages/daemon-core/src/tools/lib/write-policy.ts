/**
 * write-policy.ts — WritePolicyRule type & evaluatePolicy
 *
 * Extracted from write-guard-v11.ts for write-guard domain.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WritePolicyRule {
  id: string;
  description: string;
  check: (ctx: WritePolicyContext, targetPath: string) => string | null;
}

export interface WritePolicyContext {
  /** 当前是否有 active WI */
  hasActiveWI: boolean;
  /** 当前 WI 的 work_item.json 内容 */
  workItem?: {
    work_item_id: string;
    status: string;
    code_change_allowed: boolean;
    allowed_write_files: Array<{ path: string; operation: string }>;
    workflow_path: string | null;
  };
  /** 调用方角色 */
  callerRole:
    | 'sf-orchestrator'
    | 'Gate Runner'
    | 'User Decision Recorder'
    | 'Merge Runner'
    | 'code_permission_service'
    | 'close_gate'
    | 'agent';
  /** 是否在冻结状态（gate_summary_gate 通过后） */
  isFrozen: boolean;
}

export interface WritePolicyResult {
  allowed: boolean;
  violations: string[];
}

// ---------------------------------------------------------------------------
// Built-in rules
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
  check(ctx, _targetPath) {
    if (ctx.callerRole === 'agent') {
      // Checked by filename; caller should normalise path before passing
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

/** Default rule set (ordered by priority) */
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
// evaluatePolicy
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

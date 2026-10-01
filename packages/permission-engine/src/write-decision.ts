import { ACTOR_ROLES, type ActorRole } from '@specforge/types/actor-roles';

export type WriteOperation = 'create' | 'modify' | 'delete';

export interface WriteDecisionContext {
  hasActiveWI: boolean;
  workItem?: {
    work_item_id: string;
    status: string;
    code_change_allowed: boolean;
    allowed_write_files: Array<{ path: string; operation: string }>;
    workflow_path: string | null;
  };
  callerRole: ActorRole;
  isFrozen: boolean;
  enableRBAC?: boolean;
}

export interface WriteDecisionResult {
  allowed: boolean;
  violations: string[];
  reason?: string;
  hard_stop?: true;
}

export const WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL =
  'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL';

export function isWorkItemArtifactReference(value: string): boolean {
  return value.replace(/\\/g, '/').toLowerCase().includes('.specforge/work-items/');
}

export function decideWorkItemArtifactWriteBoundary(
  value: string,
): WriteDecisionResult | null {
  if (!isWorkItemArtifactReference(value)) return null;
  return {
    allowed: false,
    reason: WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL,
    violations: [WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL],
    hard_stop: true,
  };
}

const VALID_ROLES = new Set<string>(Object.values(ACTOR_ROLES));

const RBAC_SPEC_FILES = new Set([
  'requirements.md',
  'design.md',
  'tasks.md',
]);

const RBAC_EVIDENCE_FILES = new Set([
  'verification_report.md',
  'changed_files_audit.md',
  'close_gate.md',
  'close_gate.json',
]);

const RBAC_AUTHORIZED_MODIFY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [ACTOR_ROLES.gateRunner, new Set(['gate_file'])],
  [ACTOR_ROLES.userDecisionRecorder, new Set(['decision_file'])],
  [ACTOR_ROLES.mergeRunner, new Set(['merge_file'])],
  [ACTOR_ROLES.closeGate, new Set(['evidence_file'])],
]);

const RBAC_AUTHORIZED_CREATE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [ACTOR_ROLES.gateRunner, new Set(['gate_file'])],
  [ACTOR_ROLES.userDecisionRecorder, new Set(['decision_file'])],
  [ACTOR_ROLES.mergeRunner, new Set(['merge_file'])],
  [ACTOR_ROLES.closeGate, new Set(['evidence_file'])],
  [ACTOR_ROLES.agent, new Set(['evidence_file'])],
]);

function extractBasename(normalizedPath: string): string {
  const index = normalizedPath.lastIndexOf('/');
  return index >= 0 ? normalizedPath.slice(index + 1) : normalizedPath;
}

function detectProtectedResource(normalizedPath: string): string | undefined {
  const basename = extractBasename(normalizedPath);
  if (RBAC_SPEC_FILES.has(basename)) return 'spec_file';
  if (basename === 'user_decision.json') return 'decision_file';
  if (basename === 'merge_report.md') return 'merge_file';
  if (basename === 'gate_summary.md' || basename === 'gate_result.md') return 'gate_file';
  if (normalizedPath.includes('/gates/')) return 'gate_file';
  if (RBAC_EVIDENCE_FILES.has(basename)) return 'evidence_file';
  if (normalizedPath.includes('/evidence/')) return 'evidence_file';
  return undefined;
}

function checkRBACFileProtection(
  ctx: WriteDecisionContext,
  normalizedPath: string,
  operation: WriteOperation,
): string | null {
  const resource = detectProtectedResource(normalizedPath);
  if (resource === undefined) return null;

  if (
    ctx.callerRole === ACTOR_ROLES.orchestrator &&
    (operation === 'modify' || operation === 'delete')
  ) {
    return `RBAC: sf-orchestrator cannot ${operation} protected ${resource}: ${normalizedPath}`;
  }

  const authorization = operation === 'create' ? RBAC_AUTHORIZED_CREATE : RBAC_AUTHORIZED_MODIFY;
  if (authorization.get(ctx.callerRole)?.has(resource)) return null;

  return `RBAC: ${ctx.callerRole} is not authorized to ${operation} ${resource}: ${normalizedPath}`;
}

/**
 * Canonical, side-effect-free write authorization decision.
 * Daemon and tool boundaries enforce this decision and own audit side effects.
 */
export function decideWritePermission(
  ctx: WriteDecisionContext,
  targetPath: string,
  operation: WriteOperation,
): WriteDecisionResult {
  const violations: string[] = [];
  const normalized = targetPath.replace(/\\/g, '/');

  if (!VALID_ROLES.has(ctx.callerRole)) {
    violations.push(`unknown actor role: ${ctx.callerRole}, write denied`);
    return { allowed: false, violations };
  }

  if (ctx.workItem && ctx.workItem.status === 'closed') {
    violations.push(`closed WI cannot be written: ${ctx.workItem.work_item_id}`);
    return { allowed: false, violations };
  }

  const workItemArtifactBoundary = decideWorkItemArtifactWriteBoundary(targetPath);
  if (workItemArtifactBoundary) return workItemArtifactBoundary;

  if (!ctx.hasActiveWI && !normalized.startsWith('.specforge/')) {
    violations.push(`no active WI, cannot write code: ${targetPath}`);
    return { allowed: false, violations };
  }

  if (normalized.startsWith('.specforge/project/')) {
    if (ctx.callerRole !== ACTOR_ROLES.mergeRunner) {
      violations.push(`only merge_runner may write .specforge/project/: ${targetPath} (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  if (normalized.includes('/gates/')) {
    if (ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      violations.push(`only gate_runner may write gates/: ${targetPath} (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  if (normalized.endsWith('gate_summary.md')) {
    if (ctx.callerRole !== ACTOR_ROLES.gateRunner) {
      violations.push(`only gate_runner may write gate_summary.md (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  if (normalized.includes('user_decision.json')) {
    if (ctx.callerRole !== ACTOR_ROLES.userDecisionRecorder) {
      violations.push(`only user_decision_recorder may write user_decision.json (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  if (normalized.endsWith('merge_report.md')) {
    if (ctx.callerRole !== ACTOR_ROLES.mergeRunner) {
      violations.push(`only merge_runner may write merge_report.md (actor: ${ctx.callerRole})`);
      return { allowed: false, violations };
    }
    return { allowed: true, violations: [] };
  }

  if (ctx.isFrozen) {
    if (normalized.includes('/candidates/')) {
      violations.push(`frozen: cannot modify candidates/: ${targetPath}`);
    }
    if (normalized.endsWith('candidate_manifest.json')) {
      violations.push('frozen: cannot modify candidate_manifest.json');
    }
    if (normalized.endsWith('gate_summary.md')) {
      violations.push('frozen: cannot modify gate_summary.md');
    }
    if (violations.length > 0) return { allowed: false, violations };
  }

  if (ctx.enableRBAC === true && normalized.includes('.specforge/')) {
    const rbacViolation = checkRBACFileProtection(ctx, normalized, operation);
    if (rbacViolation !== null) return { allowed: false, violations: [rbacViolation] };
  }

  if (ctx.workItem && !normalized.startsWith('.specforge/')) {
    if (!ctx.workItem.code_change_allowed) {
      violations.push(`code_change_allowed=false, cannot write: ${targetPath}`);
      return { allowed: false, violations };
    }

    const allowed = ctx.workItem.allowed_write_files ?? [];
    if (allowed.length > 0) {
      const matchByPathAndOperation = allowed.some(file => {
        const normalizedAllowed = file.path.replace(/\\/g, '/');
        const pathMatches =
          normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + '/');
        const operationMatches = file.operation === operation || file.operation === 'any';
        return pathMatches && operationMatches;
      });
      if (!matchByPathAndOperation) {
        violations.push(`file+operation not in allowed_write_files: ${targetPath} (${operation})`);
        return { allowed: false, violations };
      }
    }
  }

  return { allowed: true, violations: [] };
}

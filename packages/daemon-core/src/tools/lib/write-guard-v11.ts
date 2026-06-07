/**
 * write-guard-v11.ts — v1.1 标准 Write Guard（§12.5-§12.6）
 *
 * 依据：SpecForge 最终融合标准 v1.1
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
 */

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface WriteGuardContext {
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
  callerRole: 'sf-orchestrator' | 'Gate Runner' | 'User Decision Recorder' | 'Merge Runner' | 'code_permission_service' | 'close_gate' | 'agent';
  /** 是否在冻结状态（gate_summary_gate 通过后） */
  isFrozen: boolean;
}

export interface WriteCheckResult {
  allowed: boolean;
  violations: string[];
}

// ---------------------------------------------------------------------------
// Write Guard 检查
// ---------------------------------------------------------------------------

/**
 * 检查写入是否被允许。
 *
 * @param ctx Write Guard 上下文
 * @param targetPath 要写入的目标路径（相对于项目根）
 * @param operation 写入操作类型
 */
export function checkWrite(
  ctx: WriteGuardContext,
  targetPath: string,
  operation: 'create' | 'modify' | 'delete',
): WriteCheckResult {
  const violations: string[] = [];
  const normalized = targetPath.replace(/\\/g, '/');

  // 规则 10: closed WI 继续写入
  if (ctx.workItem && ctx.workItem.status === 'closed') {
    violations.push(`closed WI cannot be written: ${ctx.workItem.work_item_id}`);
    return { allowed: false, violations };
  }

  // 规则 1: 无 active WI 写代码（非 .specforge/ 内的文件视为代码）
  if (!ctx.hasActiveWI && !normalized.startsWith('.specforge/')) {
    violations.push(`no active WI, cannot write code: ${targetPath}`);
    return { allowed: false, violations };
  }

  // 规则 4: 普通 Agent 写 .specforge/project/**
  if (ctx.callerRole === 'agent' && normalized.startsWith('.specforge/project/')) {
    violations.push(`agent cannot write .specforge/project/: ${targetPath}`);
    return { allowed: false, violations };
  }

  // 规则 5: 普通 Agent 写 user_decision.json
  if (ctx.callerRole === 'agent' && normalized.includes('user_decision.json')) {
    violations.push(`agent cannot write user_decision.json`);
    return { allowed: false, violations };
  }

  // 规则 6: 普通 Agent 写 gates/**
  if (ctx.callerRole === 'agent' && normalized.includes('/gates/')) {
    violations.push(`agent cannot write gates/`);
    return { allowed: false, violations };
  }

  // 规则 7: 普通 Agent 写 gate_summary.md
  if (ctx.callerRole === 'agent' && normalized.endsWith('gate_summary.md')) {
    violations.push(`agent cannot write gate_summary.md`);
    return { allowed: false, violations };
  }

  // 规则 8: 普通 Agent 写 merge_report.md
  if (ctx.callerRole === 'agent' && normalized.endsWith('merge_report.md')) {
    violations.push(`agent cannot write merge_report.md`);
    return { allowed: false, violations };
  }

  // 规则 9: 冻结后修改 Candidate / Manifest / Gate Summary
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

  // 规则 2-3: 代码写入权限检查
  if (ctx.workItem && !normalized.startsWith('.specforge/')) {
    // 这是代码文件
    if (!ctx.workItem.code_change_allowed) {
      violations.push(`code_change_allowed=false, cannot write: ${targetPath}`);
      return { allowed: false, violations };
    }

    // 检查是否在 allowed_write_files 内
    const allowed = ctx.workItem.allowed_write_files ?? [];
    const isInAllowed = allowed.some(
      (f) => normalized === f.path.replace(/\\/g, '/') || normalized.startsWith(f.path.replace(/\\/g, '/') + '/'),
    );
    if (!isInAllowed && allowed.length > 0) {
      violations.push(`file not in allowed_write_files: ${targetPath}`);
      return { allowed: false, violations };
    }
  }

  // 特殊角色豁免
  const privilegedRoles = new Set(['Merge Runner', 'Gate Runner', 'User Decision Recorder', 'sf-orchestrator', 'code_permission_service', 'close_gate']);
  if (privilegedRoles.has(ctx.callerRole)) {
    // Merge Runner 可以写 .specforge/project/
    if (ctx.callerRole === 'Merge Runner' && normalized.startsWith('.specforge/project/')) {
      return { allowed: true, violations: [] };
    }
    // User Decision Recorder 可以写 user_decision.json
    if (ctx.callerRole === 'User Decision Recorder' && normalized.includes('user_decision.json')) {
      return { allowed: true, violations: [] };
    }
    // Gate Runner 可以写 gates/ 和 gate_summary.md
    if (ctx.callerRole === 'Gate Runner' && (normalized.includes('/gates/') || normalized.endsWith('gate_summary.md'))) {
      return { allowed: true, violations: [] };
    }
  }

  return { allowed: violations.length === 0, violations };
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
 * 执行 changed_files_audit（§12.7）。
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

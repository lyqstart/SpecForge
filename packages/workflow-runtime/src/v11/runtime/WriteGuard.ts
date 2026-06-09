/**
 * WriteGuard.ts — SpecForge v1.1 Write Guard Interceptor
 *
 * Intercepts and blocks all unauthorized file write operations.
 * Checks against WriteGuardPolicy for each tool type.
 *
 * Requirements: 4.1-4.29
 */

import { PathPolicy, type PathCaller } from './PathPolicy.js';

// ---- Types ----

export type ToolType =
  | 'edit'
  | 'custom_write'
  | 'bash'
  | 'code_formatter'
  | 'code_generator'
  | 'package_manager'
  | 'snapshot_update'
  | 'git_operation';

export interface WriteContext {
  workItemId?: string;
  codeChangeAllowed: boolean;
  allowedWriteFiles: string[];
  frozenFiles: string[];
  isWorkItemClosed: boolean;
}

export interface WritePermission {
  allowed: boolean;
  reason?: string | undefined;
}

export interface EscapedWriteIncident {
  workItemId: string;
  command: string;
  expectedFiles: string[];
  actualChangedFiles: string[];
  escapedWrites: string[];
  timestamp: string;
}

export interface WriteCheckResult {
  allowed: boolean;
  reason?: string | undefined;
  intercepted?: boolean;
}

/**
 * WriteGuard — intercepts all file write operations and enforces policy.
 *
 * Requirements: 4.1-4.29
 */
export class WriteGuard {
  private readonly pathPolicy: PathPolicy;
  private readonly frozenFiles: Set<string> = new Set();
  private readonly escapedIncidents: EscapedWriteIncident[] = [];

  constructor(pathPolicy?: PathPolicy) {
    this.pathPolicy = pathPolicy ?? new PathPolicy();
  }

  /**
   * Check if a write operation is allowed.
   * Requirements: 4.1-4.5, 4.20-4.26
   */
  checkWrite(params: {
    filePath: string;
    caller: PathCaller;
    context: WriteContext;
    toolType?: ToolType;
  }): WriteCheckResult {
    const { filePath, caller, context } = params;

    // Requirement 4.26: Block all writes when work item is closed
    if (context.isWorkItemClosed) {
      return { allowed: false, reason: 'Work item is closed — all writes blocked' };
    }

    // Check path policy
    const pathResult = this.pathPolicy.canWriteToPath(filePath, caller);
    if (!pathResult.valid) {
      return { allowed: false, reason: pathResult.reason, intercepted: true };
    }

    // Agent-specific checks
    if (caller === 'agent') {
      // Requirement 4.3: Block writes when no active work item
      if (!context.workItemId) {
        return { allowed: false, reason: 'No active work item — code writes blocked' };
      }

      // Requirement 4.4: Block writes when code_change_allowed is false
      if (!context.codeChangeAllowed) {
        return { allowed: false, reason: 'code_change_allowed is false — writes blocked' };
      }
    }

    // Requirement 4.25: Block writes to frozen files (checked before allowed_write_files)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (this.frozenFiles.has(normalizedPath)) {
      return { allowed: false, reason: `File '${filePath}' is frozen — writes blocked` };
    }

    // Requirement 4.5: Block agent writes to files not in allowed_write_files
    if (caller === 'agent' && context.allowedWriteFiles.length > 0) {
      const normalized = filePath.replace(/\\/g, '/');
      const isAllowed = context.allowedWriteFiles.some(
        (allowed) => allowed.replace(/\\/g, '/') === normalized,
      );
      if (!isAllowed) {
        return { allowed: false, reason: `File '${filePath}' not in allowed_write_files` };
      }
    }

    return { allowed: true };
  }

  /**
   * Intercept a tool-specific write operation.
   * Requirements: 4.6-4.13
   */
  interceptToolWrite(params: {
    toolType: ToolType;
    filePath: string;
    caller: PathCaller;
    context: WriteContext;
  }): WriteCheckResult {
    // All tool types go through the same write check
    // The interception point varies but the policy is the same
    return this.checkWrite({
      filePath: params.filePath,
      caller: params.caller,
      context: params.context,
      toolType: params.toolType,
    });
  }

  /**
   * Freeze a file after user approval.
   * Requirement: 4.25
   */
  freezeFile(filePath: string): void {
    this.frozenFiles.add(filePath.replace(/\\/g, '/'));
  }

  /**
   * Check if a file is frozen.
   */
  isFileFrozen(filePath: string): boolean {
    return this.frozenFiles.has(filePath.replace(/\\/g, '/'));
  }

  /**
   * Record an escaped write incident.
   * Requirements: 4.17, 4.18, 4.19
   */
  recordEscapedWriteIncident(incident: EscapedWriteIncident): void {
    this.escapedIncidents.push(incident);
  }

  /**
   * Check if there are any unresolved escaped write incidents.
   */
  hasEscapedWriteIncidents(workItemId?: string): boolean {
    if (workItemId) {
      return this.escapedIncidents.some((i) => i.workItemId === workItemId);
    }
    return this.escapedIncidents.length > 0;
  }

  /**
   * Get all escaped write incidents.
   */
  getEscapedWriteIncidents(workItemId?: string): EscapedWriteIncident[] {
    if (workItemId) {
      return this.escapedIncidents.filter((i) => i.workItemId === workItemId);
    }
    return [...this.escapedIncidents];
  }

  /**
   * Clear escaped write incidents for a work item.
   */
  clearEscapedWriteIncidents(workItemId: string): void {
    let idx = this.escapedIncidents.findIndex((i) => i.workItemId === workItemId);
    while (idx !== -1) {
      this.escapedIncidents.splice(idx, 1);
      idx = this.escapedIncidents.findIndex((i) => i.workItemId === workItemId);
    }
  }
}

/**
 * CodePermissionService — manages code modification permissions.
 * Requirements: 4.1, 4.2
 */
export class CodePermissionService {
  private codeChangeAllowed = false;
  private allowedWriteFiles: string[] = [];
  private activeWorkItemId?: string;

  /**
   * Enable code changes for a work item.
   * Requirements: 4.1, 4.2
   */
  enableCodeChanges(workItemId: string, allowedFiles: string[]): void {
    this.activeWorkItemId = workItemId;
    this.codeChangeAllowed = true;
    this.allowedWriteFiles = [...allowedFiles];
  }

  /**
   * Disable code changes.
   */
  disableCodeChanges(): void {
    this.codeChangeAllowed = false;
    this.allowedWriteFiles = [];
  }

  /**
   * Check if code change is currently allowed.
   */
  isCodeChangeAllowed(): boolean {
    return this.codeChangeAllowed;
  }

  /**
   * Get the list of allowed write files.
   */
  getAllowedFiles(): string[] {
    return [...this.allowedWriteFiles];
  }

  /**
   * Add a file to the allowed write files list.
   */
  addAllowedFile(filePath: string): void {
    if (!this.allowedWriteFiles.includes(filePath)) {
      this.allowedWriteFiles.push(filePath);
    }
  }

  /**
   * Remove a file from the allowed write files list.
   */
  removeAllowedFile(filePath: string): void {
    this.allowedWriteFiles = this.allowedWriteFiles.filter((f) => f !== filePath);
  }

  /**
   * Get the active work item ID.
   */
  getActiveWorkItemId(): string | undefined {
    return this.activeWorkItemId;
  }
}

/**
 * ChangedFilesAudit — audits actual file changes against declared expectations.
 * Requirements: 4.14-4.19
 */
export class ChangedFilesAudit {
  /**
   * Compare actual changed files against expected.
   * Requirements: 4.14, 4.15, 4.16
   */
  auditFileChanges(params: {
    expectedFiles: string[];
    actualChangedFiles: string[];
    command: string;
    workItemId: string;
  }): EscapedWriteIncident | null {
    const expected = new Set(params.expectedFiles.map((f) => f.replace(/\\/g, '/')));
    const actual = params.actualChangedFiles.map((f) => f.replace(/\\/g, '/'));

    const escapedWrites = actual.filter((f) => !expected.has(f));

    if (escapedWrites.length === 0) {
      return null; // No incidents
    }

    // Requirement 4.17: Record escaped write incident
    const incident: EscapedWriteIncident = {
      workItemId: params.workItemId,
      command: params.command,
      expectedFiles: params.expectedFiles,
      actualChangedFiles: params.actualChangedFiles,
      escapedWrites,
      timestamp: new Date().toISOString(),
    };

    return incident;
  }
}

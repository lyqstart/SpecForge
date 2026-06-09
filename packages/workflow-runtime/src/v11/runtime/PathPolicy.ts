/**
 * PathPolicy.ts — SpecForge v1.1 Path Policy validator
 *
 * Validates path strings against v1.1 rules:
 * 1. Must be project-root-relative (no absolute paths)
 * 2. Must use POSIX-style forward slashes (no \)
 * 3. Must not contain path traversal (..)
 * 4. Must not contain home expansion (~)
 * 5. Spec file references must start with .specforge/
 *
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
 */

/** Result of path validation */
export interface ValidationResult {
  valid: boolean;
  reason?: string | undefined;
}

/** Detailed path validation result with all violations */
export interface DetailedValidationResult {
  valid: boolean;
  violations: string[];
}

/** Caller identity for authorization-aware path validation */
export type PathCaller =
  | 'agent'
  | 'state_machine'
  | 'gate_runner'
  | 'user_decision_recorder'
  | 'merge_runner'
  | 'code_permission_service'
  | 'close_gate'
  | 'runtime';

/** Write operation types */
export type WriteOperation = 'create' | 'update' | 'delete';

/**
 * PathPolicy — validates paths against v1.1 directory model rules.
 */
export class PathPolicy {
  /**
   * Validate a path string for general compliance.
   * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
   */
  validatePath(inputPath: string): ValidationResult {
    // Rule 1.6: Reject absolute paths (Unix / or Windows C:\)
    if (inputPath.startsWith('/') || /^[A-Za-z]:/.test(inputPath)) {
      return { valid: false, reason: 'absolute_path_not_allowed' };
    }

    // Rule 1.9: Reject Windows backslashes
    if (inputPath.includes('\\')) {
      return { valid: false, reason: 'backslash_not_allowed' };
    }

    // Rule 1.7: Reject path traversal (..)
    if (inputPath.includes('..')) {
      return { valid: false, reason: 'parent_traversal_not_allowed' };
    }

    // Rule 1.8: Reject home expansion (~)
    if (inputPath.includes('~')) {
      return { valid: false, reason: 'home_expansion_not_allowed' };
    }

    return { valid: true };
  }

  /**
   * Validate a path with all checks and return detailed violations.
   * Requirements: 1.4-1.10
   */
  validatePathDetailed(inputPath: string): DetailedValidationResult {
    const violations: string[] = [];

    if (inputPath.startsWith('/') || /^[A-Za-z]:/.test(inputPath)) {
      violations.push('absolute_path_not_allowed');
    }

    if (inputPath.includes('\\')) {
      violations.push('backslash_not_allowed');
    }

    if (inputPath.includes('..')) {
      violations.push('parent_traversal_not_allowed');
    }

    if (inputPath.includes('~')) {
      violations.push('home_expansion_not_allowed');
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate a spec file path requires .specforge/ prefix.
   * Requirement: 1.10
   */
  validateSpecPath(inputPath: string): ValidationResult {
    // First run basic validation
    const basicResult = this.validatePath(inputPath);
    if (!basicResult.valid) {
      return basicResult;
    }

    // Requirement 1.10: Spec files must have .specforge/ prefix
    const normalized = inputPath.replace(/\\/g, '/');
    if (!normalized.startsWith('.specforge/') && !normalized.startsWith('.specforge\\')) {
      return { valid: false, reason: 'missing_specforge_prefix' };
    }

    return { valid: true };
  }

  /**
   * Check if a path is a legacy spec path (.specforge/specs/**).
   * Requirement: 1.11, 1.12
   */
  isLegacySpecPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.startsWith('.specforge/specs/') || normalized === '.specforge/specs';
  }

  /**
   * Check if a path is a project spec path (.specforge/project/**).
   */
  isProjectSpecPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.startsWith('.specforge/project/') || normalized === '.specforge/project';
  }

  /**
   * Check if a path is a work item path (.specforge/work-items/**).
   */
  isWorkItemPath(inputPath: string): boolean {
    const normalized = inputPath.replace(/\\/g, '/');
    return normalized.startsWith('.specforge/work-items/') || normalized === '.specforge/work-items';
  }

  /**
   * Check if a write operation to a given path is allowed for a given caller.
   * Requirements: 1.11, 1.12, 3.29-3.34
   */
  canWriteToPath(inputPath: string, caller: PathCaller): ValidationResult {
    const normalized = inputPath.replace(/\\/g, '/');

    // Legacy specs are always read-only (Requirement 1.11)
    if (this.isLegacySpecPath(normalized)) {
      return { valid: false, reason: 'legacy_specs_read_only' };
    }

    // Agent cannot write to protected paths
    if (caller === 'agent') {
      // .specforge/project/** — only Merge Runner can write (Requirement 3.29)
      if (normalized.startsWith('.specforge/project/')) {
        return { valid: false, reason: 'agent_cannot_write_project_specs' };
      }

      // user_decision.json (Requirement 3.30)
      if (normalized.endsWith('user_decision.json')) {
        return { valid: false, reason: 'agent_cannot_write_user_decision' };
      }

      // gates/** (Requirement 3.31)
      if (normalized.includes('/gates/') || normalized.endsWith('/gates')) {
        return { valid: false, reason: 'agent_cannot_write_gates' };
      }

      // gate_summary.md (Requirement 3.32)
      if (normalized.endsWith('gate_summary.md')) {
        return { valid: false, reason: 'agent_cannot_write_gate_summary' };
      }

      // merge_report.md (Requirement 3.33)
      if (normalized.endsWith('merge_report.md')) {
        return { valid: false, reason: 'agent_cannot_write_merge_report' };
      }

      // extension_registry.json (Requirement 5.28)
      if (normalized.endsWith('extension_registry.json')) {
        return { valid: false, reason: 'agent_cannot_write_extension_registry' };
      }
    }

    // Merge Runner can write to .specforge/project/** (Requirement 4.27)
    if (caller === 'merge_runner' && normalized.startsWith('.specforge/project/')) {
      return { valid: true };
    }

    // User Decision Recorder can write to user_decision.json (Requirement 4.28)
    if (caller === 'user_decision_recorder' && normalized.endsWith('user_decision.json')) {
      return { valid: true };
    }

    // Gate Runner can write to gates/** and gate_summary.md (Requirement 4.29)
    if (caller === 'gate_runner') {
      if (normalized.includes('/gates/') || normalized.endsWith('gate_summary.md')) {
        return { valid: true };
      }
    }

    return { valid: true };
  }

  /**
   * Check if creating a directory is allowed.
   * Requirements: 1.18, 1.19, 1.20
   */
  canCreateDirectory(dirPath: string): ValidationResult {
    const normalized = dirPath.replace(/\\/g, '/');

    // Forbidden directories (Requirements 1.18, 1.19, 1.20)
    const forbiddenDirs = [
      '.specforge/archive',
      '.specforge/state',
      '.specforge/gates',
    ];

    for (const forbidden of forbiddenDirs) {
      if (normalized === forbidden || normalized.startsWith(forbidden + '/')) {
        return { valid: false, reason: `forbidden_directory:${forbidden}` };
      }
    }

    return { valid: true };
  }
}

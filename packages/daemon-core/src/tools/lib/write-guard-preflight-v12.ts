/**
 * write-guard-preflight-v12.ts
 *
 * v1.2 Write Guard Preflight Enforcement.
 *
 * This module is the v1.2 write-before-control layer. It does not replace
 * the v1.1 changed-files audit; it prevents invalid writes before they happen
 * and produces deterministic audit events for tests/tools.
 */

export type V12WriteOperation =
  | 'read'
  | 'create'
  | 'modify'
  | 'delete'
  | 'shell_command'
  | 'project_spec_merge';

export type V12PreflightDecisionCode =
  | 'ALLOWED'
  | 'READ_ONLY_ALLOWED'
  | 'STATE_NOT_IMPLEMENTATION_RUNNING'
  | 'CODE_PERMISSION_NOT_ENABLED'
  | 'CODE_PERMISSION_REVOKED'
  | 'OUT_OF_SCOPE_WRITE'
  | 'DENIED_PATH'
  | 'DIRECT_PROJECT_SPEC_WRITE'
  | 'UNKNOWN_SHELL_WRITE_TARGET'
  | 'SHELL_WRITE_RISK'
  | 'NO_TARGET_PATHS'
  | 'CLOSE_BLOCKED_BY_WRITE_GUARD';

export interface V12AllowedWriteEntry {
  path: string;
  operation?: 'create' | 'modify' | 'delete' | 'any';
}

export interface V12WriteGuardPreflightInput {
  work_item_id: string;
  tool_name: string;
  operation: V12WriteOperation;
  target_paths?: string[];
  command?: string;
  current_state: string;
  code_permission_enabled: boolean;
  code_permission_revoked?: boolean;
  allowed_write_files?: V12AllowedWriteEntry[];
  allowed_write_dirs?: string[];
  denied_paths?: string[];
  allow_project_spec_write?: boolean;
  reason?: string;
}

export interface V12ShellWriteRisk {
  is_write_risk: boolean;
  risk_reason?: string;
  extracted_target_paths: string[];
  unknown_target: boolean;
}

export interface V12WriteGuardAuditEvent {
  type: 'write_guard.preflight' | 'write_guard.violation';
  work_item_id: string;
  tool_name: string;
  operation: V12WriteOperation;
  state: string;
  allowed: boolean;
  target_paths: string[];
  violations: string[];
}

export interface V12WriteGuardPreflightResult {
  allowed: boolean;
  denied: boolean;
  decision: V12PreflightDecisionCode;
  violations: string[];
  blocked_write_attempts: number;
  normalized_paths: string[];
  shell_write_risk?: V12ShellWriteRisk;
  audit_event: V12WriteGuardAuditEvent;
}

export interface V12CloseGateWriteGuardInput {
  blocked_write_attempts: number;
  violations?: string[];
}

export interface V12CloseGateWriteGuardResult {
  allowed: boolean;
  decision: 'CLOSE_ALLOWED' | 'CLOSE_BLOCKED_BY_WRITE_GUARD';
  violations: string[];
}

const DEFAULT_DENIED_PATHS = [
  '.specforge/work-items/**',
];

function normalizeSlash(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '');
}

function trimQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isProjectSpecPath(value: string): boolean {
  const normalized = normalizeSlash(value);
  return normalized === '.specforge/project' || normalized.startsWith('.specforge/project/');
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizeSlash(glob);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function matchesPattern(pathValue: string, pattern: string): boolean {
  const normalizedPath = normalizeSlash(pathValue);
  const normalizedPattern = normalizeSlash(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
  }
  if (normalizedPattern.includes('*')) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern || normalizedPath.startsWith(normalizedPattern + '/');
}

function matchesAllowedFile(
  targetPath: string,
  operation: V12WriteOperation,
  allowed: V12AllowedWriteEntry[],
): boolean {
  const normalized = normalizeSlash(targetPath);
  const mappedOperation = operation === 'shell_command' ? 'modify' : operation;
  return allowed.some((entry) => {
    const allowedPath = normalizeSlash(entry.path);
    const op = entry.operation ?? 'any';
    const pathMatch = normalized === allowedPath || normalized.startsWith(allowedPath + '/');
    const opMatch = op === 'any' || op === mappedOperation || (op !== 'delete' && (mappedOperation === 'create' || mappedOperation === 'modify'));
    return pathMatch && opMatch;
  });
}

function matchesAllowedDir(targetPath: string, allowedDirs: string[]): boolean {
  const normalized = normalizeSlash(targetPath);
  return allowedDirs.some((dir) => {
    const normalizedDir = normalizeSlash(dir).replace(/\/$/, '');
    return normalized === normalizedDir || normalized.startsWith(normalizedDir + '/');
  });
}

function extractRedirectTargets(command: string): string[] {
  const targets: string[] = [];
  const redirectRegex = /(?:^|[^>])>>?\s*(['"]?)([^'"`\s|;&]+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = redirectRegex.exec(command)) !== null) {
    const target = trimQuotes(match[2] ?? '');
    if (target && target !== 'NUL' && target !== '/dev/null') {
      targets.push(target);
    }
  }
  return targets;
}

function extractPowerShellTargets(command: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /\bSet-Content\b[^|;&]*?\s+-Path\s+(['"])(.*?)\1/gi,
    /\bSet-Content\b\s+(['"])(.*?)\1/gi,
    /\bOut-File\b[^|;&]*?\s+-FilePath\s+(['"])(.*?)\1/gi,
    /\bNew-Item\b[^|;&]*?\s+-Path\s+(['"])(.*?)\1/gi,
    /\bCopy-Item\b[^|;&]*?\s+(['"])(.*?)\1\s+(['"])(.*?)\3/gi,
    /\bMove-Item\b[^|;&]*?\s+(['"])(.*?)\1\s+(['"])(.*?)\3/gi,
    /\bRemove-Item\b[^|;&]*?\s+(['"])(.*?)\1/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(command)) !== null) {
      const last = match[match.length - 1];
      if (last) targets.push(trimQuotes(last));
    }
  }

  return targets;
}

function extractNodePythonTargets(command: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /fs\.writeFileSync\(\s*(['"`])([^'"`]+)\1/g,
    /fs\.appendFileSync\(\s*(['"`])([^'"`]+)\1/g,
    /open\(\s*(['"])([^'"]+)\1\s*,\s*(['"])[wa]\3/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(command)) !== null) {
      const value = match[2];
      if (value) targets.push(trimQuotes(value));
    }
  }

  return targets;
}

export function classifyShellWriteRisk(command: string | undefined): V12ShellWriteRisk {
  const raw = String(command ?? '').trim();
  if (!raw) {
    return {
      is_write_risk: false,
      extracted_target_paths: [],
      unknown_target: false,
    };
  }

  const extracted = unique([
    ...extractRedirectTargets(raw),
    ...extractPowerShellTargets(raw),
    ...extractNodePythonTargets(raw),
  ]).map(normalizeSlash);

  const writeIndicators = [
    />/,
    /\bSet-Content\b/i,
    /\bOut-File\b/i,
    /\bNew-Item\b[^|;&]*-ItemType\s+File/i,
    /\bCopy-Item\b/i,
    /\bMove-Item\b/i,
    /\bRemove-Item\b/i,
    /\bdel\b/i,
    /\brm\b/i,
    /fs\.writeFileSync/i,
    /fs\.appendFileSync/i,
    /open\([^)]*['"][wa]['"]/i,
  ];

  const hasWriteIndicator = writeIndicators.some((pattern) => pattern.test(raw));
  if (!hasWriteIndicator) {
    return {
      is_write_risk: false,
      extracted_target_paths: [],
      unknown_target: false,
    };
  }

  return {
    is_write_risk: true,
    risk_reason: 'shell command contains write-capable syntax',
    extracted_target_paths: extracted,
    unknown_target: extracted.length === 0,
  };
}

function isReadOnlyOperation(input: V12WriteGuardPreflightInput): boolean {
  if (input.operation === 'read') return true;
  if (input.operation !== 'shell_command') return false;
  const risk = classifyShellWriteRisk(input.command);
  return !risk.is_write_risk;
}

function buildResult(
  input: V12WriteGuardPreflightInput,
  allowed: boolean,
  decision: V12PreflightDecisionCode,
  violations: string[],
  normalizedPaths: string[],
  shellRisk?: V12ShellWriteRisk,
): V12WriteGuardPreflightResult {
  const audit_event: V12WriteGuardAuditEvent = {
    type: allowed ? 'write_guard.preflight' : 'write_guard.violation',
    work_item_id: input.work_item_id,
    tool_name: input.tool_name,
    operation: input.operation,
    state: input.current_state,
    allowed,
    target_paths: normalizedPaths,
    violations,
  };

  return {
    allowed,
    denied: !allowed,
    decision,
    violations,
    blocked_write_attempts: allowed ? 0 : 1,
    normalized_paths: normalizedPaths,
    shell_write_risk: shellRisk,
    audit_event,
  };
}

export function sfWriteGuardPreflight(input: V12WriteGuardPreflightInput): V12WriteGuardPreflightResult {
  const shellRisk = input.operation === 'shell_command'
    ? classifyShellWriteRisk(input.command)
    : undefined;

  const targetPaths = unique([
    ...(input.target_paths ?? []),
    ...(shellRisk?.extracted_target_paths ?? []),
  ].map(normalizeSlash));

  if (isReadOnlyOperation(input)) {
    return buildResult(input, true, 'READ_ONLY_ALLOWED', [], targetPaths, shellRisk);
  }

  if (input.current_state !== 'implementation_running') {
    return buildResult(
      input,
      false,
      'STATE_NOT_IMPLEMENTATION_RUNNING',
      [`write denied outside implementation_running: ${input.current_state}`],
      targetPaths,
      shellRisk,
    );
  }

  if (input.code_permission_revoked === true) {
    return buildResult(
      input,
      false,
      'CODE_PERMISSION_REVOKED',
      ['write denied because code permission has been revoked'],
      targetPaths,
      shellRisk,
    );
  }

  if (!input.code_permission_enabled) {
    return buildResult(
      input,
      false,
      'CODE_PERMISSION_NOT_ENABLED',
      ['write denied because code permission is not enabled'],
      targetPaths,
      shellRisk,
    );
  }

  if (input.operation === 'shell_command' && shellRisk?.is_write_risk && shellRisk.unknown_target) {
    return buildResult(
      input,
      false,
      'UNKNOWN_SHELL_WRITE_TARGET',
      ['shell write denied because target path cannot be determined'],
      targetPaths,
      shellRisk,
    );
  }

  if (targetPaths.length === 0) {
    return buildResult(
      input,
      false,
      'NO_TARGET_PATHS',
      ['write denied because no target_paths were supplied'],
      targetPaths,
      shellRisk,
    );
  }

  const deniedPatterns = [...DEFAULT_DENIED_PATHS, ...(input.denied_paths ?? [])];
  for (const target of targetPaths) {
    const deniedPattern = deniedPatterns.find((pattern) => matchesPattern(target, pattern));
    if (deniedPattern) {
      return buildResult(
        input,
        false,
        'DENIED_PATH',
        [`write denied by denied path pattern ${deniedPattern}: ${target}`],
        targetPaths,
        shellRisk,
      );
    }

    if (isProjectSpecPath(target)) {
      const allowedProjectSpecTool = input.allow_project_spec_write === true && input.tool_name === 'sf_project_spec_merge';
      if (!allowedProjectSpecTool) {
        return buildResult(
          input,
          false,
          'DIRECT_PROJECT_SPEC_WRITE',
          [`direct project spec write denied: ${target}`],
          targetPaths,
          shellRisk,
        );
      }
      continue;
    }

    const inAllowedFiles = matchesAllowedFile(target, input.operation, input.allowed_write_files ?? []);
    const inAllowedDirs = matchesAllowedDir(target, input.allowed_write_dirs ?? []);
    if (!inAllowedFiles && !inAllowedDirs) {
      return buildResult(
        input,
        false,
        input.operation === 'shell_command' ? 'SHELL_WRITE_RISK' : 'OUT_OF_SCOPE_WRITE',
        [`out-of-scope write denied: ${target}`],
        targetPaths,
        shellRisk,
      );
    }
  }

  return buildResult(input, true, 'ALLOWED', [], targetPaths, shellRisk);
}

export function checkCloseGateWriteGuard(input: V12CloseGateWriteGuardInput): V12CloseGateWriteGuardResult {
  const violations = input.violations ?? [];
  if (input.blocked_write_attempts > 0 || violations.length > 0) {
    return {
      allowed: false,
      decision: 'CLOSE_BLOCKED_BY_WRITE_GUARD',
      violations: violations.length > 0 ? violations : ['blocked_write_attempts > 0'],
    };
  }

  return {
    allowed: true,
    decision: 'CLOSE_ALLOWED',
    violations: [],
  };
}

export const SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT = {
  schema_version: '1.2',
  canonical_entry: 'sfWriteGuardPreflight',
  rules: [
    'read-only operations are allowed',
    'writes require implementation_running',
    'writes require enabled code permission',
    'writes fail after revoke',
    'target paths must be in allowed files or dirs',
    'direct project spec writes require sf_project_spec_merge',
    'shell write commands with unknown target are denied by default',
    'close gate must fail when blocked_write_attempts > 0',
  ],
} as const;

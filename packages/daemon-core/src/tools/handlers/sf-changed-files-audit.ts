/**
 * sf_changed_files_audit — Changed Files Audit Tool Handler.
 *
 * v1.3.2 hotfix:
 * - Adds an explicit `mode=no_code_change` / `mode=not_applicable` path for
 *   investigation/no-code review Work Items.
 * - The no-code path does NOT enable code_permission and does NOT fabricate
 *   allowed_write_files. It writes a real changed_files_audit.md whose verdict
 *   is PASS only when no project/business file writes are observed.
 * - A previously latched CODE_PERMISSION_NOT_ENABLED hard_stop may be cleared
 *   only after the no-code audit passes for an allowed no-code workflow.
 *
 * v1.2.8 hotfix:
 * - Reads project-level write_guard_authorizations.jsonl as scoped policy facts.
 * - Keeps v1.2.7 hard_stop_resolution.jsonl classification behavior.
 * - Continues to split deployment / remote-ops entries from project file writes.
 */
import { join } from 'node:path';
import * as fs from 'node:fs/promises';
import { registerHandler } from '../ToolDispatcher';
import { runChangedFilesAudit, normalizeAuditPath } from '../lib/changed-files-audit';
import {
  blockedWriteClassificationToViolation,
  classifyBlockedWriteAttempts,
} from '../lib/blocked-write-classification';
import { getFactualChangedFiles, summarizeWriteGuardLog } from '../lib/write-guard-log';
import { readHardStopResolutionLog } from '../lib/hard-stop-resolution-log';
import { readWriteGuardAuthorizations } from '../lib/write-guard-authorization-log';
import {
  SPEC_DIR_NAME,
  workItemCandidateManifest,
  workItemRoot,
} from '@specforge/types/directory-layout';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { checkHardStop, guardHardStop, resetHardStop, setHardStop } from '../lib/hard-stop-latch';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';

type ChangedFile = { path: string; operation: 'create' | 'modify' | 'delete' };
type AllowedFile = { path: string; operation: string };

function normalizeAllowedFiles(input: unknown): AllowedFile[] {
  if (!Array.isArray(input)) return [];
  return input.map((f: string | { path: string; operation?: string }) =>
    typeof f === 'string'
      ? { path: f, operation: 'modify' }
      : { path: f.path, operation: f.operation ?? 'modify' }
  );
}

function normalizeChangedFileArgs(input: unknown): ChangedFile[] {
  if (!Array.isArray(input)) return [];
  return input.map((f: string | { path: string; operation?: string }) =>
    typeof f === 'string'
      ? { path: f, operation: 'modify' }
      : { path: f.path, operation: (f.operation ?? 'modify') as ChangedFile['operation'] }
  );
}

function readString(value: unknown): string {
  return String(value ?? '').trim();
}

function isNoCodeAuditMode(value: unknown): boolean {
  const mode = readString(value)
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  return (
    mode === 'no_code_change' || mode === 'not_applicable' || mode === 'no_code' || mode === 'none'
  );
}

function workflowValue(...values: unknown[]): string {
  return (
    values
      .map(value =>
        readString(value)
          .toLowerCase()
          .replace(/[-\s]+/g, '_')
      )
      .find(value => value.length > 0) ?? ''
  );
}

function isNoCodeWorkflow(wiJson: any, triggerResult?: any): boolean {
  const workflowType = workflowValue(wiJson?.workflow_type, triggerResult?.workflow_type);
  const workflowPath = workflowValue(wiJson?.workflow_path, triggerResult?.workflow_path);
  const intent = workflowValue(wiJson?.intent, triggerResult?.intent, triggerResult?.change_type);

  const allowedTypes = new Set([
    'investigation',
    'review',
    'audit',
    'analysis',
    'no_code_review',
    'no_code_change',
    'read_only_review',
  ]);

  if (allowedTypes.has(workflowType)) return true;
  if (allowedTypes.has(intent)) return true;

  // Keep this deliberately narrow: requirement_change_path alone is not enough,
  // because normal feature/bugfix Work Items also use it.
  return workflowPath === 'investigation_path' || workflowPath === 'review_path';
}

const PRE_IMPLEMENTATION_SPEC_STATES = new Set([
  'created',
  'intake_ready',
  'impact_analyzing',
  'impact_analyzed',
  'workflow_selected',
  'candidate_preparing',
  'candidate_prepared',
  'gates_running',
  'gates_failed',
  'approval_required',
]);

function isPreImplementationSpecificationPhase(input: {
  wiJson: any;
  triggerResult?: any;
  candidateManifest?: any;
  authoritativeState: string | null;
}): boolean {
  const workflowType = workflowValue(
    input.wiJson?.workflow_type,
    input.triggerResult?.workflow_type
  );
  const workflowPath = workflowValue(
    input.wiJson?.workflow_path,
    input.triggerResult?.workflow_path
  );
  const candidatePhase = workflowValue(input.candidateManifest?.candidate_phase);
  const specWorkflowTypes = new Set([
    'feature_spec',
    'feature_spec_design_first',
    'bugfix_spec',
    'change_request',
    'design_change',
    'architecture_change',
    'task_change',
    'refactor',
  ]);
  const specWorkflowPaths = new Set([
    'requirement_change_path',
    'design_change_path',
    'architecture_change_path',
    'task_change_path',
    'spec_migration_path',
  ]);

  return (
    (specWorkflowTypes.has(workflowType) || specWorkflowPaths.has(workflowPath)) &&
    ['design', 'requirements', 'tasks', 'full'].includes(candidatePhase) &&
    input.authoritativeState !== null &&
    PRE_IMPLEMENTATION_SPEC_STATES.has(input.authoritativeState)
  );
}

function codePermissionWasEnabled(wiJson: any): boolean {
  return (
    wiJson?.code_change_allowed === true ||
    wiJson?.permission_enabled_at !== undefined ||
    wiJson?.code_permission_released === true ||
    wiJson?.code_permission_revoked === true ||
    wiJson?.code_permission_revoked_at !== undefined ||
    normalizeAllowedFiles(wiJson?.allowed_write_files).length > 0 ||
    normalizeAllowedFiles(wiJson?.allowed_write_files_snapshot).length > 0
  );
}

function codePermissionFacts(wiJson: any): string[] {
  return [
    `code_change_allowed=${String(wiJson?.code_change_allowed ?? 'undefined')}`,
    `permission_enabled_at=${String(wiJson?.permission_enabled_at ?? 'undefined')}`,
    `code_permission_released=${String(wiJson?.code_permission_released ?? 'undefined')}`,
    `code_permission_revoked=${String(wiJson?.code_permission_revoked ?? 'undefined')}`,
    `code_permission_revoked_at=${String(wiJson?.code_permission_revoked_at ?? 'undefined')}`,
    `allowed_write_files=${normalizeAllowedFiles(wiJson?.allowed_write_files).length}`,
    `allowed_write_files_snapshot=${normalizeAllowedFiles(wiJson?.allowed_write_files_snapshot).length}`,
  ];
}

function isRemoteOpsAuditPath(filePath: string): boolean {
  const p = String(filePath ?? '')
    .replace(/\\/g, '/')
    .toLowerCase();
  const n = normalizeAuditPath(p);
  if (!p.startsWith('/') && !/^[a-z]:\//i.test(p)) return false;
  return (
    n.startsWith('/var/lib/pgsql') ||
    n.startsWith('/opt/fj') ||
    n.startsWith('/etc/nginx') ||
    n.startsWith('/etc/systemd') ||
    n.includes('/fj.conf') ||
    n.includes('postgresql') ||
    n.includes('pm2') ||
    n.includes('fj-server')
  );
}

function isGovernanceArtifactPath(filePath: string, workItemId: string): boolean {
  const p = String(filePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  return (
    p.startsWith(`${SPEC_DIR_NAME}/work-items/${workItemId}/`) ||
    p.startsWith(`.specforge/work-items/${workItemId}/`)
  );
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function hardStopIsCodePermissionNotEnabled(record: any): boolean {
  const text = [record?.reason, record?.source_tool, record?.hard_stop_id]
    .map(v => String(v ?? ''))
    .join('\n');
  return text.includes('CODE_PERMISSION_NOT_ENABLED');
}

function changedFilesFromFacts(input: {
  workItemDir: string;
  wiJson: any;
  actualChangedFiles: unknown;
}): {
  changedFiles: ChangedFile[];
  dataSource: string;
  writeGuardSummary: ReturnType<typeof summarizeWriteGuardLog>;
} {
  const writeGuardSummary = summarizeWriteGuardLog(input.workItemDir);
  const factualFiles = getFactualChangedFiles(input.workItemDir);

  if (factualFiles.length > 0) {
    return {
      changedFiles: factualFiles.map(f => ({
        path: f.path,
        operation: f.operation ?? 'modify',
      })),
      dataSource: `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes, ${(writeGuardSummary.blockedWrites ?? []).length} blocked writes)`,
      writeGuardSummary,
    };
  }

  if (
    Array.isArray(input.wiJson?.actual_changed_files) &&
    input.wiJson.actual_changed_files.length > 0
  ) {
    return {
      changedFiles: normalizeChangedFileArgs(input.wiJson.actual_changed_files),
      dataSource: 'work_item.actual_changed_files',
      writeGuardSummary,
    };
  }

  if (Array.isArray(input.actualChangedFiles) && input.actualChangedFiles.length > 0) {
    return {
      changedFiles: normalizeChangedFileArgs(input.actualChangedFiles),
      dataSource:
        'debug_hint.actual_changed_files (deprecated fallback; not a trusted Runtime source)',
      writeGuardSummary,
    };
  }

  return { changedFiles: [], dataSource: 'none', writeGuardSummary };
}

async function writeNoCodeAudit(input: {
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  command?: string;
  wiJson: any;
  triggerResult?: any;
  candidateManifest?: any;
  authoritativeState: string | null;
  actualChangedFiles: unknown;
  activeCodePermissionHardStop: boolean;
}) {
  const { changedFiles, dataSource, writeGuardSummary } = changedFilesFromFacts({
    workItemDir: input.workItemDir,
    wiJson: input.wiJson,
    actualChangedFiles: input.actualChangedFiles,
  });

  const blockedWrites = writeGuardSummary.blockedWrites ?? [];
  const hardStopResolutions = readHardStopResolutionLog(input.workItemDir);
  const writeGuardAuthorizations = readWriteGuardAuthorizations(input.projectRoot);
  const allowedWriteFiles: AllowedFile[] = [];

  const blockedWriteClassifications = classifyBlockedWriteAttempts(
    blockedWrites,
    changedFiles,
    allowedWriteFiles,
    hardStopResolutions,
    writeGuardAuthorizations
  );
  const unresolvedBlockedWriteClassifications = blockedWriteClassifications.filter(
    c => c.status === 'unresolved_blocked_attempt'
  );
  const unresolvedBlockedWriteViolations = unresolvedBlockedWriteClassifications.map(
    blockedWriteClassificationToViolation
  );

  const remoteOpsFiles = changedFiles.filter(file => isRemoteOpsAuditPath(file.path));
  const governanceFiles = changedFiles.filter(file =>
    isGovernanceArtifactPath(file.path, input.workItemId)
  );
  const projectChangedFiles = changedFiles.filter(
    file =>
      !isRemoteOpsAuditPath(file.path) && !isGovernanceArtifactPath(file.path, input.workItemId)
  );

  const legacyNoCodeWorkflow = isNoCodeWorkflow(input.wiJson, input.triggerResult);
  const preImplementationSpecPhase = isPreImplementationSpecificationPhase({
    wiJson: input.wiJson,
    triggerResult: input.triggerResult,
    candidateManifest: input.candidateManifest,
    authoritativeState: input.authoritativeState,
  });
  const workflowAllowed = legacyNoCodeWorkflow || preImplementationSpecPhase;
  const codePermissionEnabled = codePermissionWasEnabled(input.wiJson);
  const passed =
    workflowAllowed &&
    !codePermissionEnabled &&
    projectChangedFiles.length === 0 &&
    unresolvedBlockedWriteViolations.length === 0;

  const failureReasons: string[] = [];
  if (!workflowAllowed)
    failureReasons.push('workflow_type/workflow_path is not allowed for no_code_change audit mode');
  if (codePermissionEnabled)
    failureReasons.push(
      'code_permission was enabled or revoked; no_code_change mode requires code_permission to have never been enabled'
    );
  if (projectChangedFiles.length > 0)
    failureReasons.push('project/business file changes were observed');
  if (unresolvedBlockedWriteViolations.length > 0)
    failureReasons.push('unresolved blocked write attempts exist');

  const auditMd = [
    '# Changed Files Audit',
    '',
    `Work Item: ${input.workItemId}`,
    `Command: ${input.command ?? 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`,
    'Mode: no_code_change / not_applicable',
    `Data Source: ${dataSource}`,
    `Policy Source: no_code_change workflow guard + authoritative phase + hard_stop_resolution.jsonl (${hardStopResolutions.length}) + write_guard_authorizations.jsonl (${writeGuardAuthorizations.length})`,
    `Authoritative State: ${input.authoritativeState ?? 'missing'}`,
    `Candidate Phase: ${readString(input.candidateManifest?.candidate_phase) || 'missing'}`,
    `Legacy No-Code Workflow: ${legacyNoCodeWorkflow}`,
    `Pre-Implementation Spec Phase: ${preImplementationSpecPhase}`,
    '',
    `## Result: ${passed ? 'PASS' : 'FAIL'}`,
    '',
    '## No-code audit facts',
    '',
    `- Status: ${passed ? 'not_applicable / no_code_change / PASS' : 'not_applicable / no_code_change / FAIL'}`,
    `- Workflow type: ${input.wiJson?.workflow_type ?? input.triggerResult?.workflow_type ?? 'unknown'}`,
    `- Workflow path: ${input.wiJson?.workflow_path ?? input.triggerResult?.workflow_path ?? 'unknown'}`,
    `- No-code workflow allowed: ${workflowAllowed}`,
    `- Code permission was never enabled: ${!codePermissionEnabled}`,
    `- Total files: ${projectChangedFiles.length}`,
    `- In scope: ${governanceFiles.length}`,
    `- Out of scope: ${projectChangedFiles.length}`,
    `- Violations: ${projectChangedFiles.length + unresolvedBlockedWriteViolations.length}`,
    `- Remote ops entries: ${remoteOpsFiles.length}`,
    `- Blocked write attempts: ${blockedWrites.length}`,
    `- Historical/resolved blocked write attempts: ${blockedWriteClassifications.length - unresolvedBlockedWriteClassifications.length}`,
    `- Unresolved blocked write attempts: ${unresolvedBlockedWriteClassifications.length}`,
    '',
    '## Code permission facts',
    '',
    ...codePermissionFacts(input.wiJson).map(line => `- ${line}`),
    '',
    '## Governance artifact writes',
    '',
    ...(governanceFiles.length > 0
      ? governanceFiles.map(
          f => `- [${f.operation}] ${f.path} → governance_artifact_not_business_code`
        )
      : ['None.']),
    '',
    '## Project / business file changes',
    '',
    ...(projectChangedFiles.length > 0
      ? projectChangedFiles.map(
          f => `- [${f.operation}] ${f.path} → OUT_OF_SCOPE_FOR_NO_CODE_AUDIT`
        )
      : ['None.']),
    '',
    '## Remote Ops Entries',
    '',
    ...(remoteOpsFiles.length > 0
      ? remoteOpsFiles.map(f => `- [${f.operation}] ${f.path} → remote_ops_not_project_file_write`)
      : ['None.']),
    '',
    '## Blocked Write Attempts',
    '',
    `- Total blocked write attempts: ${blockedWrites.length}`,
    `- Unresolved: ${unresolvedBlockedWriteClassifications.length}`,
    '',
    ...(unresolvedBlockedWriteViolations.length > 0
      ? [
          '### Unresolved Blocked Writes',
          '',
          ...unresolvedBlockedWriteViolations.map(v => `- ${v}`),
          '',
        ]
      : ['### Unresolved Blocked Writes', '', 'None.', '']),
    ...(failureReasons.length > 0
      ? ['## Blocking Reasons', '', ...failureReasons.map(r => `- ${r}`), '']
      : []),
    '## Conclusion',
    '',
    passed
      ? 'PASS: This Work Item is in an allowed no-code or pre-implementation specification phase. No business/project file changes were observed. changed_files_audit is not_applicable/no_code_change.'
      : 'FAIL: This Work Item cannot use no_code_change audit mode until the blocking reasons above are resolved.',
    '',
  ].join('\n');

  await fs.writeFile(join(input.workItemDir, 'changed_files_audit.md'), auditMd, 'utf-8');

  let clearedCodePermissionHardStop = false;
  if (passed && input.activeCodePermissionHardStop) {
    clearedCodePermissionHardStop = resetHardStop(input.projectRoot, input.workItemId);
  }

  return {
    success: true,
    passed,
    status: passed ? 'not_applicable' : 'failed',
    mode: 'no_code_change',
    work_item_id: input.workItemId,
    data_source: dataSource,
    workflow_allowed: workflowAllowed,
    legacy_no_code_workflow: legacyNoCodeWorkflow,
    pre_implementation_spec_phase: preImplementationSpecPhase,
    authoritative_state: input.authoritativeState,
    candidate_phase: readString(input.candidateManifest?.candidate_phase) || null,
    code_permission_was_never_enabled: !codePermissionEnabled,
    total_files: projectChangedFiles.length,
    in_scope: governanceFiles.length,
    out_of_scope: projectChangedFiles.length,
    violations: failureReasons,
    remote_ops_entries: remoteOpsFiles.length,
    blocked_write_attempts: blockedWrites.length,
    unresolved_blocked_write_attempts: unresolvedBlockedWriteClassifications.length,
    cleared_code_permission_hard_stop: clearedCodePermissionHardStop,
    audit_path: join(input.workItemDir, 'changed_files_audit.md'),
  };
}

registerHandler('sf_changed_files_audit', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  const command = args['command'] as string | undefined;
  const actualChangedFiles = args['actual_changed_files'];
  const noCodeMode = isNoCodeAuditMode(args['mode']) || isNoCodeAuditMode(args['audit_mode']);
  const idError = validateWorkItemId(workItemId);
  if (idError) return { success: false, error: idError };

  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemDir = workItemRoot(projectRoot, workItemId);

  let wiJson: any;
  try {
    wiJson = JSON.parse(await fs.readFile(join(workItemDir, 'work_item.json'), 'utf-8'));
  } catch {
    setHardStop(projectRoot, workItemId, 'WORK_ITEM_JSON_NOT_FOUND', 'sf_changed_files_audit');
    return {
      success: false,
      error:
        'WORK_ITEM_JSON_NOT_FOUND: work_item.json does not exist — cannot perform audit without it',
      hard_stop: true,
    };
  }

  if (noCodeMode) {
    const activeHardStop = checkHardStop(projectRoot, workItemId);
    const hasActiveCodePermissionHardStop =
      activeHardStop.blocked && hardStopIsCodePermissionNotEnabled(activeHardStop.record);
    if (activeHardStop.blocked && activeHardStop.record && !hasActiveCodePermissionHardStop) {
      return {
        success: false,
        error:
          `HARD_STOP_ACTIVE: Work item ${workItemId} is blocked. ` +
          `Only CODE_PERMISSION_NOT_ENABLED may be resolved by no_code_change audit mode. ` +
          `Reason: ${activeHardStop.record.reason}`,
        hard_stop: true,
        hard_stop_record: activeHardStop.record,
      };
    }

    const triggerResult = await readJsonIfExists(join(workItemDir, 'trigger_result.json'));
    const candidateManifest = await readJsonIfExists(
      workItemCandidateManifest(projectRoot, workItemId)
    );
    const authoritativeState = await readAuthoritativeState({ deps, projectRoot, workItemId });
    return writeNoCodeAudit({
      projectRoot,
      workItemId,
      workItemDir,
      command,
      wiJson,
      triggerResult,
      candidateManifest,
      authoritativeState: authoritativeState.current_state,
      actualChangedFiles,
      activeCodePermissionHardStop: hasActiveCodePermissionHardStop,
    });
  }

  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_changed_files_audit');
  if (!hardStopGuard.allowed) {
    return {
      success: false,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    };
  }

  const codePermWasEnabled = codePermissionWasEnabled(wiJson);
  if (!codePermWasEnabled) {
    setHardStop(projectRoot, workItemId, 'CODE_PERMISSION_NOT_ENABLED', 'sf_changed_files_audit');
    return {
      success: false,
      error:
        'CODE_PERMISSION_NOT_ENABLED: code_permission was never enabled for this WI.\nCannot audit without prior permission grant.',
      hard_stop: true,
      remediation:
        'For investigation/no-code review Work Items, call sf_changed_files_audit with mode="no_code_change". ' +
        'For implementation Work Items, enable sf_code_permission before code changes.',
    };
  }

  const allowedWriteFilesCurrent = normalizeAllowedFiles(wiJson.allowed_write_files);
  const allowedWriteFilesSnapshot = normalizeAllowedFiles(wiJson.allowed_write_files_snapshot);
  const allowedWriteFiles =
    allowedWriteFilesCurrent.length > 0 ? allowedWriteFilesCurrent : allowedWriteFilesSnapshot;

  if (allowedWriteFiles.length === 0) {
    setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_EMPTY', 'sf_changed_files_audit');
    return {
      success: false,
      error:
        'ALLOWED_WRITE_FILES_EMPTY: allowed_write_files and allowed_write_files_snapshot are empty.\nAudit cannot proceed.',
      hard_stop: true,
    };
  }

  const { changedFiles, dataSource, writeGuardSummary } = changedFilesFromFacts({
    workItemDir,
    wiJson,
    actualChangedFiles,
  });
  const blockedWrites = writeGuardSummary.blockedWrites ?? [];
  const hardStopResolutions = readHardStopResolutionLog(workItemDir);
  const writeGuardAuthorizations = readWriteGuardAuthorizations(projectRoot);

  const remoteOpsFiles = changedFiles.filter(file => isRemoteOpsAuditPath(file.path));
  const projectChangedFiles = changedFiles.filter(file => !isRemoteOpsAuditPath(file.path));

  const auditResult = runChangedFilesAudit(projectChangedFiles, allowedWriteFiles, 'agent');
  const blockedWriteClassifications = classifyBlockedWriteAttempts(
    blockedWrites,
    changedFiles,
    allowedWriteFiles,
    hardStopResolutions,
    writeGuardAuthorizations
  );
  const unresolvedBlockedWriteClassifications = blockedWriteClassifications.filter(
    c => c.status === 'unresolved_blocked_attempt'
  );
  const resolvedBlockedWriteClassifications = blockedWriteClassifications.filter(
    c => c.status !== 'unresolved_blocked_attempt'
  );
  const authorizationResolvedClassifications = blockedWriteClassifications.filter(
    c => c.status === 'write_guard_authorization_resolved'
  );
  const unresolvedBlockedWriteViolations = unresolvedBlockedWriteClassifications.map(
    blockedWriteClassificationToViolation
  );

  const finalPassed = auditResult.passed && unresolvedBlockedWriteViolations.length === 0;
  const finalViolations = [...auditResult.violations, ...unresolvedBlockedWriteViolations];
  const finalOutOfScope = auditResult.out_of_scope + unresolvedBlockedWriteViolations.length;

  const historicalBlockedLines = resolvedBlockedWriteClassifications.map(c => {
    return `- [${c.operation}] ${c.path} → ${c.status} (${c.reason})`;
  });
  const unresolvedBlockedLines = unresolvedBlockedWriteClassifications.map(c => {
    return `- [${c.operation}] ${c.path} → ${c.status} (${c.reason})`;
  });
  const remoteOpsLines = remoteOpsFiles.map(
    f => `- [${f.operation}] ${f.path} → remote_ops_not_project_file_write`
  );

  const auditMd = [
    '# Changed Files Audit',
    '',
    `Work Item: ${workItemId}`,
    `Command: ${command ?? 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Data Source: ${dataSource}`,
    `Policy Source: hard_stop_resolution.jsonl (${hardStopResolutions.length}) + write_guard_authorizations.jsonl (${writeGuardAuthorizations.length})`,
    '',
    `## Result: ${finalPassed ? 'PASS' : 'FAIL'}`,
    '',
    `- Total files: ${auditResult.total_files}`,
    `- In scope: ${auditResult.in_scope}`,
    `- Out of scope: ${finalOutOfScope}`,
    `- Violations: ${finalViolations.length}`,
    `- Remote ops entries: ${remoteOpsFiles.length}`,
    `- Blocked write attempts: ${blockedWrites.length}`,
    `- Historical/resolved blocked write attempts: ${resolvedBlockedWriteClassifications.length}`,
    `- Authorization-resolved blocked write attempts: ${authorizationResolvedClassifications.length}`,
    `- Unresolved blocked write attempts: ${unresolvedBlockedWriteClassifications.length}`,
    '',
    '## Remote Ops Entries',
    '',
    ...(remoteOpsLines.length > 0 ? remoteOpsLines : ['None.']),
    '',
    '## Blocked Write Attempts',
    '',
    `- Total blocked write attempts: ${blockedWrites.length}`,
    `- Historical/resolved: ${resolvedBlockedWriteClassifications.length}`,
    `- Authorization-resolved: ${authorizationResolvedClassifications.length}`,
    `- Unresolved: ${unresolvedBlockedWriteClassifications.length}`,
    `- Hard stop resolutions: ${hardStopResolutions.length}`,
    `- Project-level write_guard authorizations: ${writeGuardAuthorizations.length}`,
    '',
    ...(historicalBlockedLines.length > 0
      ? ['### Historical / Resolved Blocked Writes', '', ...historicalBlockedLines, '']
      : ['### Historical / Resolved Blocked Writes', '', 'None.', '']),
    ...(unresolvedBlockedLines.length > 0
      ? ['### Unresolved Blocked Writes', '', ...unresolvedBlockedLines, '']
      : ['### Unresolved Blocked Writes', '', 'None.', '']),
    ...(finalViolations.length > 0
      ? ['## Violations', '', ...finalViolations.map(v => `- ${v}`), '']
      : []),
    ...(auditResult.entries.length > 0
      ? [
          '## Entries',
          '',
          ...auditResult.entries.map(
            e =>
              `- [${e.operation}] ${e.path} → ${e.in_allowed_write_files ? 'in_scope' : 'OUT_OF_SCOPE'}`
          ),
          '',
        ]
      : ['## Entries', '', 'No project file changes detected.', '']),
  ].join('\n');

  try {
    await fs.writeFile(join(workItemDir, 'changed_files_audit.md'), auditMd, 'utf-8');
  } catch {
    // Non-critical: audit result is returned even if file write fails.
  }

  return {
    success: true,
    passed: finalPassed,
    total_files: auditResult.total_files,
    in_scope: auditResult.in_scope,
    out_of_scope: finalOutOfScope,
    violations: finalViolations,
    side_effects: auditResult.side_effects,
    remote_ops_entries: remoteOpsFiles.length,
    remote_ops_files: remoteOpsFiles,
    work_item_id: workItemId,
    data_source: dataSource,
    blocked_write_attempts: blockedWrites.length,
    resolved_blocked_write_attempts: resolvedBlockedWriteClassifications.length,
    authorization_resolved_blocked_write_attempts: authorizationResolvedClassifications.length,
    unresolved_blocked_write_attempts: unresolvedBlockedWriteClassifications.length,
    hard_stop_resolutions: hardStopResolutions.length,
    write_guard_authorizations: writeGuardAuthorizations.length,
    blocked_write_classifications: blockedWriteClassifications,
  };
});

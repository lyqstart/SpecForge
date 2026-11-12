import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateMergeReport, validateCurrentUserDecisionValue } from '@specforge/types';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type { TrustedToolInvocationProof } from '@specforge/types/trusted-tool-invocation';
import { guardHardStop } from './hard-stop-latch';
import { readWorkItemMetadata } from './work-item-metadata';
import { candidateManifestContentBlockCode } from './candidate-manifest-owner';
import {
  computeCandidateHash,
  validateApprovedUserDecisionForClose,
} from './governance-invariants-v11';
import {
  auditActualGovernanceScope,
  verifyProjectGovernanceAfterImplementation,
  inspectFormalGitBinding,
} from './project-governance-v2';
import { inspectFilesystemVerificationAuthority } from '../../verification/filesystem-source';
import { parseChangedFilesAuditPass } from './write-guard-runtime-v12';
import { inspectWriteGuardAuditBinding } from './write-guard-audit-binding';
import {
  assertVerificationPath,
  canonicalVerificationJson,
  readVerificationFile,
} from '../../verification/owner-store';
import type { TransitionWithEvidenceInput } from './state-coordinator-v11';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function requireRecovery(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`BLOCKED_VERIFICATION_RECOVERY_${code}`);
}
function samePath(a: string, b: string): boolean {
  const normalize = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

/** A state-only return to a proven prior verification stage; no application execution. */
export async function inspectBlockedVerificationRecovery(input: TransitionWithEvidenceInput) {
  if (input.fromState !== 'blocked' || input.toState !== 'verification_running') return null;
  requireRecovery(
    input.actorRole === 'sf-orchestrator' &&
      input.transitionContext?.source === 'sf_state_transition',
    'OWNER_REQUIRED'
  );
  requireRecovery(
    input.invocationArgs && input.deps?.toolInvocationVerifier,
    'INVOCATION_REQUIRED'
  );
  requireRecovery(
    !Object.hasOwn(input.transitionContext ?? {}, 'verification_recovery'),
    'CALLER_PROOF_FORBIDDEN'
  );
  const context = input.context;
  requireRecovery(
    typeof context?.sessionID === 'string' && typeof context?.messageID === 'string',
    'INVOCATION_REQUIRED'
  );
  const invocation: TrustedToolInvocationProof =
    await input.deps.toolInvocationVerifier.verifyToolInvocation({
      tool: 'sf_state_transition',
      args: input.invocationArgs,
      directory: input.projectRoot,
      sessionId: context.sessionID,
      messageId: context.messageID,
    });
  requireRecovery(
    invocation?.source === 'runtime-tool-invocation/v1' &&
      invocation.agent === 'sf-orchestrator' &&
      invocation.tool === 'sf_state_transition' &&
      invocation.sessionId === context.sessionID &&
      invocation.messageId === context.messageID &&
      typeof invocation.directory === 'string' &&
      samePath(invocation.directory, input.projectRoot) &&
      invocation.inputSha256 === hash(canonicalVerificationJson(input.invocationArgs)) &&
      typeof invocation.callId === 'string' &&
      invocation.callId.length > 0 &&
      Number.isSafeInteger(invocation.startedAt) &&
      Date.now() >= invocation.startedAt &&
      Date.now() - invocation.startedAt <= 300000,
    'INVOCATION_NOT_PROVED'
  );
  const stop = guardHardStop(input.projectRoot, input.workItemId, 'sf_state_transition');
  requireRecovery(stop.allowed, 'HARD_STOP_ACTIVE');
  const sm = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  requireRecovery(typeof sm.readLastWorkItemTransition === 'function', 'HISTORY_OWNER_REQUIRED');
  const blocking = await sm.readLastWorkItemTransition(input.workItemId);
  requireRecovery(
    blocking?.payload.from_state === 'verification_running' &&
      blocking.payload.to_state === 'blocked' &&
      blocking.payload.workflow_type === input.workflowType,
    'PRIOR_VERIFICATION_REQUIRED'
  );

  const root = path.resolve(input.projectRoot),
    wi = path.resolve(input.workItemDir);
  requireRecovery(
    wi === path.join(root, SPEC_DIR_NAME, 'work-items', input.workItemId),
    'WORK_ITEM_PATH_INVALID'
  );
  const files: Record<string, string> = {};
  let total = 0;
  async function read(file: string): Promise<Buffer> {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    requireRecovery(
      relative && !relative.startsWith('../') && !path.isAbsolute(relative),
      'PATH_OUTSIDE_PROJECT'
    );
    const bytes = await readVerificationFile(file);
    total += bytes.length;
    requireRecovery(
      total <= 16 * 1024 * 1024 && Object.keys(files).length < 2048,
      'EVIDENCE_BUDGET'
    );
    files[relative] = hash(bytes);
    return bytes;
  }
  const metadata = await readWorkItemMetadata(wi, input.workItemId);
  await read(path.join(wi, 'work_item.json'));
  requireRecovery(
    metadata.code_change_allowed === false &&
      Array.isArray(metadata.allowed_write_files) &&
      metadata.allowed_write_files.length === 0 &&
      typeof metadata.code_permission_revoked_at === 'string' &&
      Number.isFinite(Date.parse(metadata.code_permission_revoked_at)),
    'CODE_PERMISSION_NOT_REVOKED'
  );
  const manifestPath = path.join(wi, 'candidate_manifest.json'),
    decisionPath = path.join(wi, 'user_decision.json');
  const manifestBytes = await read(manifestPath),
    decision = JSON.parse((await read(decisionPath)).toString('utf8'));
  requireRecovery(
    !candidateManifestContentBlockCode(manifestBytes.toString('utf8'), input.workItemId),
    'CANDIDATE_INVALID'
  );
  requireRecovery(
    validateCurrentUserDecisionValue(decision, input.workItemId).valid,
    'APPROVAL_SCHEMA_INVALID'
  );
  const approval = await validateApprovedUserDecisionForClose({
    projectRoot: root,
    workItemDir: wi,
    workItemId: input.workItemId,
    candidateManifestPath: manifestPath,
    userDecisionPath: decisionPath,
  });
  requireRecovery(approval.valid, 'APPROVAL_INVALID');
  const candidateHash = await computeCandidateHash(wi);
  requireRecovery(decision.candidate_hash === candidateHash, 'APPROVED_CANDIDATE_CHANGED');
  const merge = evaluateMergeReport(
    (await read(path.join(wi, 'merge_report.md'))).toString('utf8'),
    input.workItemId
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const noMerge =
    metadata.workflow_path === 'code_only_fast_path' &&
    manifest.merge_required === false &&
    Array.isArray(manifest.entries) &&
    manifest.entries.length === 0 &&
    merge.status === 'not_applicable';
  requireRecovery(merge.valid && (merge.status === 'success' || noMerge), 'MERGE_INVALID');
  const scope: Record<string, unknown> = JSON.parse(
    (await read(path.join(wi, 'governance_scope.json'))).toString('utf8')
  );
  const projectManifest = JSON.parse(
    (await read(path.join(root, SPEC_DIR_NAME, 'project', 'spec_manifest.json'))).toString('utf8')
  );
  const psv = projectManifest.project_spec_version;
  requireRecovery(
    typeof psv === 'string' &&
      /^PSV-[0-9]{4,}$/.test(psv) &&
      scope.schema_version === '1.0' &&
      scope.work_item_id === input.workItemId &&
      scope.project_spec_version === psv &&
      metadata.project_spec_version_at_permission === psv &&
      (scope.version_control_mode === 'git' || scope.version_control_mode === 'filesystem') &&
      Array.isArray(scope.allowed_write_files) &&
      scope.allowed_write_files.every((value: unknown) => typeof value === 'string'),
    'FROZEN_SCOPE_INVALID'
  );
  if (scope.version_control_mode === 'filesystem') {
    await read(path.join(wi, 'filesystem_baseline.json'));
    await inspectFilesystemVerificationAuthority(root, {
      workItemId: input.workItemId,
      psv,
      files,
    });
    const git = await fs.lstat(path.join(root, '.git')).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    requireRecovery(git === null, 'FILESYSTEM_GIT_PRESENT');
  }
  const auditText = (await read(path.join(wi, 'changed_files_audit.md'))).toString('utf8');
  requireRecovery(
    parseChangedFilesAuditPass(auditText, input.workItemId).passed,
    'IMPLEMENTATION_AUDIT_INVALID'
  );
  const auditBinding = inspectWriteGuardAuditBinding(root, wi, auditText);
  requireRecovery(auditBinding.passed && 'sha256' in auditBinding, 'IMPLEMENTATION_AUDIT_STALE');
  const governance = await verifyProjectGovernanceAfterImplementation({
    projectRoot: root,
    workItemDir: wi,
    workItemId: input.workItemId,
  });
  requireRecovery(governance.passed, 'PROJECT_GOVERNANCE_INVALID');
  const actual = await auditActualGovernanceScope({ projectRoot: root, workItemDir: wi });
  requireRecovery(actual.passed, 'IMPLEMENTATION_SCOPE_INVALID');
  let gitBinding;
  let gitContext;
  if (scope.version_control_mode === 'git') {
    gitContext = JSON.parse((await read(path.join(wi, 'git_context.json'))).toString('utf8'));
    gitBinding = await inspectFormalGitBinding({
      projectRoot: root,
      gitContext,
      implementationFiles: actual.actual_files,
    });
    requireRecovery(
      gitBinding.enabled &&
        gitBinding.branch_name === gitBinding.expected_branch &&
        /^[a-f0-9]{40}$/.test(gitBinding.head_commit) &&
        gitBinding.base_is_ancestor &&
        gitBinding.implementation_file_set_matches &&
        gitBinding.missing_from_commit.length === 0 &&
        gitBinding.uncommitted_implementation_files.length === 0,
      'GIT_BINDING_INVALID'
    );
  }
  const allowed = new Set(scope.allowed_write_files);
  for (const file of actual.actual_files) {
    requireRecovery(allowed.has(file), 'IMPLEMENTATION_SCOPE_EXCEEDED');
    const full = path.resolve(root, file);
    requireRecovery(full.startsWith(root + path.sep), 'PATH_OUTSIDE_PROJECT');
    // A deletion stays represented by the existing audit; no file is recreated.
    try {
      await read(full);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      files[file] = 'absent';
    }
  }
  async function tree(directory: string): Promise<void> {
    await assertVerificationPath(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      requireRecovery(!entry.isSymbolicLink(), 'EVIDENCE_LINK');
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await tree(full);
      else await read(full);
    }
  }
  await tree(path.join(wi, 'candidates'));
  await tree(path.join(root, SPEC_DIR_NAME, 'project'));
  requireRecovery((await computeCandidateHash(wi)) === candidateHash, 'APPROVED_CANDIDATE_CHANGED');
  for (const [file, expected] of Object.entries(files)) {
    if (expected === 'absent') {
      const stat = await fs.lstat(path.join(root, file)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      requireRecovery(stat === null, 'EVIDENCE_CHANGED');
    } else
      requireRecovery(
        hash(await readVerificationFile(path.join(root, file))) === expected,
        'EVIDENCE_CHANGED'
      );
  }
  requireRecovery(
    inspectWriteGuardAuditBinding(root, wi, auditText).passed,
    'IMPLEMENTATION_AUDIT_STALE'
  );
  requireRecovery(
    guardHardStop(root, input.workItemId, 'sf_state_transition').allowed,
    'HARD_STOP_ACTIVE'
  );
  if (gitBinding)
    requireRecovery(
      canonicalVerificationJson(
        await inspectFormalGitBinding({
          projectRoot: root,
          gitContext,
          implementationFiles: actual.actual_files,
        })
      ) === canonicalVerificationJson(gitBinding),
      'GIT_BINDING_CHANGED'
    );
  const binding = {
    contract: 'blocked-verification-recovery/v1',
    work_item_id: input.workItemId,
    blocked_event_id: blocking.eventId,
    project_spec_version: psv,
    candidate_hash: candidateHash,
    write_guard_sha256: auditBinding.sha256,
    files,
    invocation,
    git_binding: gitBinding ?? null,
    code_permission_granted: false,
    application_executed: false,
  };
  return { ...binding, binding_sha256: hash(canonicalVerificationJson(binding)) };
}

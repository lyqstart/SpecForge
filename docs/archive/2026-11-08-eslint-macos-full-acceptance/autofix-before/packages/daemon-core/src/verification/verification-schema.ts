import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
/** Strict persistent schemas shared by producers and every execution-evidence consumer. */
import path from 'node:path';
import type { TrustedToolInvocationProof } from '@specforge/types/trusted-tool-invocation';
import { canonicalVerificationJson as json, verificationId as hash } from './owner-store';
import { assertVerificationRelativePath } from './source-snapshot';
import {
  VERIFICATION_BUDGET,
  VERIFICATION_PROFILE,
  PINNED_NODE_SHA256,
  type VerificationPlan,
  type VerificationAttempt,
  type VerificationExecutionReceipt,
  type VerificationInvocationLeaseRecord,
} from './verification-plan';

export function verificationRequire(value: unknown, code: string): asserts value {
  if (!value) throw new Error('VERIFICATION_' + code);
}
export function verificationRecord(value: unknown, keys?: string[]): Record<string, unknown> {
  verificationRequire(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    'OBJECT_INVALID'
  );
  const record = value as Record<string, unknown>;
  if (keys)
    verificationRequire(
      Object.keys(record).sort().join(',') === [...keys].sort().join(','),
      'SCHEMA_FIELDS_INVALID'
    );
  return record;
}
export function verificationHash(value: unknown): asserts value is string {
  verificationRequire(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'HASH_INVALID');
}
export function verificationInstant(value: unknown): asserts value is string {
  verificationRequire(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'UTC_INVALID'
  );
}
export function sameVerificationPath(a: string, b: string): boolean {
  return process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);
}
export function validateTrustedInvocationProof(
  value: unknown,
  role: 'sf-orchestrator' | 'sf-verifier'
): asserts value is TrustedToolInvocationProof {
  const p = verificationRecord(value, [
    'source',
    'sessionId',
    'messageId',
    'callId',
    'agent',
    'directory',
    'tool',
    'inputSha256',
    'startedAt',
    'observedAt',
    'runtimeProjectionSha256',
  ]);
  verificationRequire(
    p.source === 'runtime-tool-invocation/v1' &&
      p.agent === role &&
      p.tool === (role === 'sf-orchestrator' ? 'sf_verification_plan' : 'sf_verification_run') &&
      typeof p.sessionId === 'string' &&
      p.sessionId.length > 0 &&
      p.sessionId.length <= 256 &&
      typeof p.messageId === 'string' &&
      p.messageId.length > 0 &&
      p.messageId.length <= 256 &&
      typeof p.callId === 'string' &&
      p.callId.length > 0 &&
      p.callId.length <= 256 &&
      typeof p.directory === 'string' &&
      path.isAbsolute(p.directory) &&
      Number.isSafeInteger(p.startedAt) &&
      (p.startedAt as number) >= 0,
    'OWNER_PROOF_INVALID'
  );
  verificationHash(p.inputSha256);
  verificationHash(p.runtimeProjectionSha256);
  verificationInstant(p.observedAt);
  verificationRequire((p.startedAt as number) <= Date.parse(p.observedAt), 'OWNER_TIME_INVALID');
  const {
    source: _source,
    observedAt: _observed,
    runtimeProjectionSha256: _projection,
    ...projection
  } = p;
  verificationRequire(
    hash(json(projection)) === p.runtimeProjectionSha256,
    'OWNER_PROJECTION_INVALID'
  );
}
function assets(value: unknown): void {
  const a = verificationRecord(value, [
    'contract',
    'profile',
    'nodePath',
    'nodeSha256',
    'launcherPath',
    'launcherSha256',
    'daemonPath',
    'daemonSha256',
    'manifestSha256',
  ]);
  verificationRequire(
    a.contract === 'verification-assets/v1' &&
      a.profile === VERIFICATION_PROFILE &&
      a.nodeSha256 === PINNED_NODE_SHA256,
    'ASSET_CONTRACT_INVALID'
  );
  for (const field of ['nodePath', 'launcherPath', 'daemonPath'])
    verificationRequire(
      typeof a[field] === 'string' && path.isAbsolute(a[field] as string),
      'ASSET_PATH_INVALID'
    );
  for (const field of ['nodeSha256', 'launcherSha256', 'daemonSha256', 'manifestSha256'])
    verificationHash(a[field]);
}
function budget(value: unknown): void {
  verificationRequire(json(value) === json(VERIFICATION_BUDGET), 'BUDGET_INVALID');
}
export function validateVerificationPlan(value: unknown): asserts value is VerificationPlan {
  const p = verificationRecord(value, [
    'contract',
    'createdAt',
    'expiresAt',
    'projectRoot',
    'workItemId',
    'authority',
    'source',
    'command',
    'assets',
    'profile',
    'budget',
    'permission',
    'owner',
  ]);
  verificationRequire(
    p.contract === 'verification-plan/v1' &&
      p.profile === VERIFICATION_PROFILE &&
      typeof p.projectRoot === 'string' &&
      path.isAbsolute(p.projectRoot) &&
      typeof p.workItemId === 'string' &&
      /^WI-[0-9]{4,}$/.test(p.workItemId),
    'PLAN_IDENTITY_INVALID'
  );
  verificationInstant(p.createdAt);
  verificationInstant(p.expiresAt);
  verificationRequire(
    Date.parse(p.expiresAt) > Date.parse(p.createdAt) &&
      Date.parse(p.expiresAt) - Date.parse(p.createdAt) === 600000,
    'PLAN_LIFETIME_INVALID'
  );
  validateTrustedInvocationProof(p.owner, 'sf-orchestrator');
  verificationRequire(
    sameVerificationPath(p.owner.directory, p.projectRoot),
    'OWNER_PROJECT_MISMATCH'
  );
  verificationRequire(
    json(p.permission) ===
      json({
        kind: 'independent-readonly-verification/v1',
        grantee: 'sf-verifier',
        codeWriteGranted: false,
      }),
    'PERMISSION_INVALID'
  );
  assets(p.assets);
  budget(p.budget);
  const s = verificationRecord(p.source, [
    'projectRoot',
    'head',
    'branch',
    'indexSha256',
    'configSha256',
    'files',
    'trackedPaths',
    'identity',
  ]);
  verificationRequire(
    s.projectRoot === p.projectRoot &&
      typeof s.head === 'string' &&
      /^[a-f0-9]{40}$/.test(s.head) &&
      typeof s.branch === 'string' &&
      s.branch.length > 0 &&
      Array.isArray(s.files) &&
      s.files.length <= 2048 &&
      Array.isArray(s.trackedPaths),
    'SOURCE_SCHEMA_INVALID'
  );
  for (const field of ['indexSha256', 'configSha256', 'identity']) verificationHash(s[field]);
  const paths = new Set<string>();
  let bytes = 0;
  for (const value of s.files) {
    const f = verificationRecord(value, ['path', 'bytes', 'sha256', 'device', 'inode']);
    verificationRequire(typeof f.path === 'string', 'INPUT_PATH_INVALID');
    assertVerificationRelativePath(f.path);
    verificationRequire(
      !f.path
        .split('/')
        .some(part => ['.git', SPEC_DIR_NAME, 'node_modules'].includes(part.toLowerCase())),
      'PROTECTED_INPUT'
    );
    const identity = process.platform === 'win32' ? f.path.toLowerCase() : f.path;
    verificationRequire(
      !paths.has(identity) &&
        Number.isSafeInteger(f.bytes) &&
        (f.bytes as number) >= 0 &&
        typeof f.device === 'string' &&
        /^\d+$/.test(f.device) &&
        typeof f.inode === 'string' &&
        /^\d+$/.test(f.inode),
      'INPUT_IDENTITY_INVALID'
    );
    paths.add(identity);
    bytes += f.bytes as number;
    verificationHash(f.sha256);
  }
  verificationRequire(
    bytes <= 16777216 && s.trackedPaths.every(v => typeof v === 'string'),
    'INPUT_BUDGET_INVALID'
  );
  for (const name of s.trackedPaths as string[]) assertVerificationRelativePath(name);
  const { identity: _sourceId, ...sourceBody } = s;
  verificationRequire(hash(json(sourceBody)) === s.identity, 'SOURCE_IDENTITY_INVALID');
  const a = verificationRecord(p.authority, [
    'state',
    'purpose',
    'workItemId',
    'psv',
    'files',
    'taskPath',
    'taskId',
    'verificationType',
    'commandIndex',
    'command',
    'metadataRawSha256',
    'metadataBasisSha256',
    'basisIdentity',
    'identity',
  ]);
  verificationRequire(
    a.workItemId === p.workItemId &&
      ((a.state === 'implementation_running' && a.purpose === 'implementation') ||
        (a.state === 'verification_running' && a.purpose === 'formal')) &&
      typeof a.psv === 'string' &&
      /^PSV-[0-9]{4,}$/.test(a.psv) &&
      typeof a.taskId === 'string' &&
      new RegExp('^TASK-' + p.workItemId + '-[0-9]{3}$').test(a.taskId) &&
      ['unit', 'property', 'integration', 'e2e', 'regression'].includes(
        String(a.verificationType)
      ) &&
      Number.isSafeInteger(a.commandIndex) &&
      (a.commandIndex as number) >= 0 &&
      (a.commandIndex as number) <= 63 &&
      typeof a.command === 'string' &&
      typeof a.taskPath === 'string',
    'AUTHORITY_SCHEMA_INVALID'
  );
  assertVerificationRelativePath(a.taskPath);
  const files = verificationRecord(a.files);
  verificationRequire(
    Object.keys(files).length > 0 && Object.keys(files).length <= 2048,
    'AUTHORITY_FILES_INVALID'
  );
  for (const [name, identity] of Object.entries(files)) {
    assertVerificationRelativePath(name);
    verificationRequire(name.startsWith(`${SPEC_DIR_NAME}/` as const), 'AUTHORITY_PATH_INVALID');
    verificationHash(identity);
  }
  for (const key of ['metadataRawSha256', 'metadataBasisSha256', 'basisIdentity', 'identity'])
    verificationHash(a[key]);
  const { identity: _id, basisIdentity: _basisId, ...body } = a;
  const { state: _state, metadataRawSha256: _raw, ...basis } = body;
  verificationRequire(
    hash(json(body)) === a.identity && hash(json(basis)) === a.basisIdentity,
    'AUTHORITY_IDENTITY_INVALID'
  );
  const c = verificationRecord(p.command, [
    'contract',
    'original',
    'kind',
    'argv',
    'entry',
    'inlineSource',
    'semanticProof',
  ]);
  verificationRequire(
    c.contract === 'readonly-node-command/v1' &&
      c.original === a.command &&
      ['node-test-file', 'node-inline'].includes(String(c.kind)) &&
      Array.isArray(c.argv) &&
      c.argv.every(v => typeof v === 'string'),
    'COMMAND_SCHEMA_INVALID'
  );
  verificationRequire(
    c.kind === 'node-test-file'
      ? typeof c.entry === 'string' && c.inlineSource === null
      : c.entry === null && typeof c.inlineSource === 'string',
    'COMMAND_KIND_INVALID'
  );
  const semantic = verificationRecord(c.semanticProof, ['rule', 'inputHashes']);
  verificationRequire(
    ['single-file-no-host-observation/v1', 'finite-posix-readonly-predicate/v1'].includes(
      String(semantic.rule)
    ),
    'SEMANTIC_PROOF_INVALID'
  );
  for (const [name, identity] of Object.entries(verificationRecord(semantic.inputHashes))) {
    assertVerificationRelativePath(name);
    verificationHash(identity);
    verificationRequire(
      (s.files as Array<Record<string, unknown>>).some(
        f => f.path === name && f.sha256 === identity
      ),
      'PROOF_INPUT_MISMATCH'
    );
  }
}
export function validateVerificationAttempt(value: unknown): asserts value is VerificationAttempt {
  const a = verificationRecord(value, [
    'contract',
    'planId',
    'attemptId',
    'createdAt',
    'projectRoot',
    'workItemId',
    'owner',
    'nativeConfigSha256',
    'initialAttemptAbsent',
  ]);
  verificationRequire(
    a.contract === 'verification-attempt/v1' &&
      typeof a.attemptId === 'string' &&
      /^[a-f0-9]{32}$/.test(a.attemptId) &&
      a.initialAttemptAbsent === true &&
      typeof a.projectRoot === 'string' &&
      path.isAbsolute(a.projectRoot) &&
      typeof a.workItemId === 'string' &&
      /^WI-[0-9]{4,}$/.test(a.workItemId),
    'ATTEMPT_INVALID'
  );
  verificationHash(a.planId);
  verificationHash(a.nativeConfigSha256);
  verificationInstant(a.createdAt);
  validateTrustedInvocationProof(a.owner, 'sf-verifier');
  verificationRequire(
    sameVerificationPath(a.owner.directory, a.projectRoot),
    'ATTEMPT_OWNER_PROJECT_INVALID'
  );
}
export function validateVerificationReceipt(
  value: unknown
): asserts value is VerificationExecutionReceipt {
  const r = verificationRecord(value, [
    'contract',
    'planId',
    'attemptId',
    'projectRoot',
    'workItemId',
    'purpose',
    'startedAt',
    'finishedAt',
    'owner',
    'sourceIdentity',
    'authorityIdentity',
    'assets',
    'profile',
    'budget',
    'processStarted',
    'processResumed',
    'exitCode',
    'launcherExitCode',
    'jobEnded',
    'cleanupProved',
    'outputComplete',
    'stdoutSha256',
    'stderrSha256',
    'nativeReceiptSha256',
    'nativeEventsSha256',
    'inspectionSha256',
    'reservationId',
    'leaseId',
    'outcome',
    'failure',
  ]);
  verificationRequire(
    r.contract === 'verification-execution/v1' &&
      typeof r.attemptId === 'string' &&
      /^[a-f0-9]{32}$/.test(r.attemptId) &&
      typeof r.projectRoot === 'string' &&
      path.isAbsolute(r.projectRoot) &&
      typeof r.workItemId === 'string' &&
      /^WI-[0-9]{4,}$/.test(r.workItemId) &&
      ['implementation', 'formal'].includes(String(r.purpose)) &&
      r.profile === VERIFICATION_PROFILE,
    'RECEIPT_IDENTITY_INVALID'
  );
  for (const key of [
    'planId',
    'sourceIdentity',
    'authorityIdentity',
    'stdoutSha256',
    'stderrSha256',
    'reservationId',
    'leaseId',
  ])
    verificationHash(r[key]);
  for (const key of ['nativeReceiptSha256', 'nativeEventsSha256', 'inspectionSha256'])
    if (r[key] !== null) verificationHash(r[key]);
  for (const key of [
    'processStarted',
    'processResumed',
    'jobEnded',
    'cleanupProved',
    'outputComplete',
  ])
    verificationRequire(typeof r[key] === 'boolean', 'RECEIPT_BOOLEAN_INVALID');
  for (const key of ['exitCode', 'launcherExitCode'])
    verificationRequire(
      r[key] === null ||
        (Number.isSafeInteger(r[key]) &&
          (r[key] as number) >= 0 &&
          (r[key] as number) <= 4294967295),
      'RECEIPT_EXIT_INVALID'
    );
  verificationInstant(r.startedAt);
  verificationInstant(r.finishedAt);
  verificationRequire(Date.parse(r.finishedAt) >= Date.parse(r.startedAt), 'RECEIPT_TIME_INVALID');
  validateTrustedInvocationProof(r.owner, 'sf-verifier');
  assets(r.assets);
  budget(r.budget);
  verificationRequire(
    ['passed', 'failed', 'not_executed', 'cancelled', 'interrupted'].includes(String(r.outcome)) &&
      (r.failure === null || typeof r.failure === 'string'),
    'RECEIPT_OUTCOME_INVALID'
  );
  if (r.outcome === 'passed')
    verificationRequire(
      r.processStarted &&
        r.processResumed &&
        r.exitCode === 0 &&
        r.launcherExitCode === 0 &&
        r.jobEnded &&
        r.cleanupProved &&
        r.outputComplete &&
        r.nativeReceiptSha256 !== null &&
        r.nativeEventsSha256 !== null &&
        r.inspectionSha256 !== null &&
        r.failure === null,
      'PASSED_RECEIPT_INCOMPLETE'
    );
}

export function validateVerificationInvocationLease(
  value: unknown
): asserts value is VerificationInvocationLeaseRecord {
  const l = verificationRecord(value, [
    'contract',
    'planId',
    'attemptId',
    'reservationId',
    'owner',
    'startedAt',
    'finishedAt',
    'terminal',
    'checks',
  ]);
  verificationRequire(
    l.contract === 'verification-invocation-lease/v1' &&
      typeof l.attemptId === 'string' &&
      /^[a-f0-9]{32}$/.test(l.attemptId),
    'LEASE_IDENTITY_INVALID'
  );
  verificationHash(l.planId);
  verificationHash(l.reservationId);
  validateTrustedInvocationProof(l.owner, 'sf-verifier');
  verificationInstant(l.startedAt);
  verificationInstant(l.finishedAt);
  verificationRequire(
    Date.parse(l.finishedAt) >= Date.parse(l.startedAt) &&
      ['completed', 'cancelled', 'lost'].includes(String(l.terminal)) &&
      Array.isArray(l.checks) &&
      l.checks.length >= 1 &&
      l.checks.length <= 361,
    'LEASE_SCHEMA_INVALID'
  );
  let previous = Date.parse(l.startedAt),
    lost = false;
  for (const value of l.checks) {
    const c = verificationRecord(value, ['observedAt', 'active', 'projectionSha256', 'reason']);
    verificationInstant(c.observedAt);
    verificationRequire(
      !lost &&
        typeof c.active === 'boolean' &&
        Date.parse(c.observedAt) >= previous &&
        Date.parse(c.observedAt) <= Date.parse(l.finishedAt),
      'LEASE_CHECK_TIME_INVALID'
    );
    previous = Date.parse(c.observedAt);
    if (c.active) {
      verificationRequire(
        c.reason === null &&
          c.projectionSha256 === (l.owner as TrustedToolInvocationProof).runtimeProjectionSha256,
        'LEASE_ACTIVE_PROOF_INVALID'
      );
    } else {
      verificationRequire(
        c.projectionSha256 === null &&
          typeof c.reason === 'string' &&
          /^[A-Z][A-Z_]{1,127}$/.test(c.reason),
        'LEASE_LOSS_INVALID'
      );
      lost = true;
    }
  }
  verificationRequire(l.terminal === 'lost' ? lost : !lost, 'LEASE_TERMINAL_INVALID');
  if (l.terminal === 'completed')
    verificationRequire(l.checks.length >= 2, 'LEASE_COMPLETION_PROOF_REQUIRED');
}

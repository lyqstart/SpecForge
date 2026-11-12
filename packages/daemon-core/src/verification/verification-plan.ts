/** Pure versioned objects shared by producer and all execution-evidence consumers. */
import type { TrustedToolInvocationProof } from '@specforge/types/trusted-tool-invocation';
import type { NodeCommandPlan } from './node-command-contract';
import type { VerificationSourceSnapshot } from './source-snapshot';
import type { FilesystemVerificationSource } from './filesystem-source';

export const VERIFICATION_PLAN_CONTRACT = 'verification-plan/v1' as const;
export const VERIFICATION_RECEIPT_CONTRACT = 'verification-execution/v1' as const;
export const VERIFICATION_PROFILE = 'windows-lpac-node-single-process-readonly/v1' as const;
export const PINNED_NODE_SHA256 =
  '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
export const VERIFICATION_BUDGET = Object.freeze({
  processes: 1,
  memoryBytes: 1073741824,
  stdoutBytes: 1048576,
  stderrBytes: 1048576,
  wallMs: 120000,
});

export interface VerificationAuthoritySnapshot {
  state:
    | 'implementation_running'
    | 'implementation_done'
    | 'verification_running'
    | 'verification_done'
    | 'closed';
  purpose: 'implementation' | 'formal';
  workItemId: string;
  psv: string;
  files: Record<string, string>;
  taskPath: string;
  taskId: string;
  verificationType: string;
  commandIndex: number;
  command: string;
  metadataRawSha256: string;
  metadataBasisSha256: string;
  basisIdentity: string;
  identity: string;
}

export interface VerificationAssets {
  contract: 'verification-assets/v1';
  profile: typeof VERIFICATION_PROFILE;
  nodePath: string;
  nodeSha256: typeof PINNED_NODE_SHA256;
  launcherPath: string;
  launcherSha256: string;
  daemonPath: string;
  daemonSha256: string;
  manifestSha256: string;
}

interface VerificationPlanCommon {
  createdAt: string;
  expiresAt: string;
  projectRoot: string;
  workItemId: string;
  authority: VerificationAuthoritySnapshot;
  command: NodeCommandPlan;
  assets: VerificationAssets;
  profile: typeof VERIFICATION_PROFILE;
  budget: typeof VERIFICATION_BUDGET;
  permission: {
    kind: 'independent-readonly-verification/v1';
    grantee: 'sf-verifier';
    codeWriteGranted: false;
  };
  owner: TrustedToolInvocationProof;
}

export type VerificationPlan = VerificationPlanCommon &
  (
    | { contract: typeof VERIFICATION_PLAN_CONTRACT; source: VerificationSourceSnapshot }
    | { contract: 'verification-plan/v2'; source: FilesystemVerificationSource }
  );

export interface VerificationExecutionReceipt {
  contract: typeof VERIFICATION_RECEIPT_CONTRACT;
  planId: string;
  attemptId: string;
  projectRoot: string;
  workItemId: string;
  purpose: VerificationAuthoritySnapshot['purpose'];
  startedAt: string;
  finishedAt: string;
  owner: TrustedToolInvocationProof;
  sourceIdentity: string;
  authorityIdentity: string;
  assets: VerificationAssets;
  profile: typeof VERIFICATION_PROFILE;
  budget: typeof VERIFICATION_BUDGET;
  processStarted: boolean;
  processResumed: boolean;
  exitCode: number | null;
  launcherExitCode: number | null;
  jobEnded: boolean;
  cleanupProved: boolean;
  outputComplete: boolean;
  stdoutSha256: string;
  stderrSha256: string;
  nativeReceiptSha256: string | null;
  nativeEventsSha256: string | null;
  inspectionSha256: string | null;
  reservationId: string;
  leaseId: string;
  outcome: 'passed' | 'failed' | 'not_executed' | 'cancelled' | 'interrupted';
  failure: string | null;
}

export interface VerificationInvocationLeaseRecord {
  contract: 'verification-invocation-lease/v1';
  planId: string;
  attemptId: string;
  reservationId: string;
  owner: TrustedToolInvocationProof;
  startedAt: string;
  finishedAt: string;
  terminal: 'completed' | 'cancelled' | 'lost';
  checks: Array<{
    observedAt: string;
    active: boolean;
    projectionSha256: string | null;
    reason: string | null;
  }>;
}

export interface VerificationAttempt {
  contract: 'verification-attempt/v1';
  planId: string;
  attemptId: string;
  createdAt: string;
  projectRoot: string;
  workItemId: string;
  owner: TrustedToolInvocationProof;
  nativeConfigSha256: string;
  initialAttemptAbsent: true;
}

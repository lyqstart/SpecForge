import {
  readTrustedGitGovernanceProjectWrites,
  type TrustedGitGovernanceWrite,
} from './git-governance-write-provenance';
import {
  readTrustedAtomicSpecMergeProjectWrites,
  type TrustedAtomicSpecMergeWrite,
} from './atomic-spec-merge-write-provenance';

export type TrustedChangedFilesAuditControlPlaneWrite =
  | TrustedGitGovernanceWrite
  | TrustedAtomicSpecMergeWrite;

/**
 * Canonical producer resolver for every Changed Files Audit entry point.
 *
 * Each underlying provenance reader remains responsible for its own
 * schema/hash/legacy validation. Consumers must not select a subset of
 * producer types because that would make audit verdicts depend on which
 * lifecycle tool invoked the audit.
 */
export function readTrustedChangedFilesAuditControlPlaneWrites(
  projectRoot: string,
): TrustedChangedFilesAuditControlPlaneWrite[] {
  return [
    ...readTrustedGitGovernanceProjectWrites(projectRoot),
    ...readTrustedAtomicSpecMergeProjectWrites(projectRoot),
  ];
}

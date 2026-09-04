import {
  normalizeArtifactInventory,
  normalizeReleaseAuthority,
  type ArtifactInventoryDocument,
  type ReleaseAuthorityDocument,
} from './release-evidence-normalizer';
import {
  ReleaseSetValidator,
  type ScopeVerdict,
} from './release-set-validator';

export type ScopeReleaseErrorCode =
  | 'SCOPE_AUTHORITY_CONFLICT'
  | 'SCOPE_EVIDENCE_INSUFFICIENT'
  | 'SCOPE_BOUNDARY_VIOLATION'
  | 'RELEASE_SET_INCOMPLETE';

export interface ScopeReleasePrecheckResult {
  status: 'passed' | 'failed';
  errorCode?: ScopeReleaseErrorCode;
  releaseId: string;
  candidateId: string;
  authorityErrors: readonly string[];
  inventoryErrors: readonly string[];
  verdict: ScopeVerdict;
}

function failedVerdict(incompleteEvidence: readonly string[]): ScopeVerdict {
  return {
    status: 'failed',
    missingRequired: [],
    unexpectedExcluded: [],
    invalidDependencies: [],
    incompleteEvidence: [...incompleteEvidence].sort((left, right) => left.localeCompare(right)),
  };
}

/**
 * Formal Scope Gate decision kernel. File reading, clean-candidate production,
 * and release CLI concerns stay outside this package boundary.
 */
export function runScopeReleasePrecheck(
  authorityDocument: ReleaseAuthorityDocument | unknown,
  inventoryDocument: ArtifactInventoryDocument | unknown,
): ScopeReleasePrecheckResult {
  const authority = normalizeReleaseAuthority(authorityDocument);
  if (!authority.ok) {
    return {
      status: 'failed',
      errorCode: 'SCOPE_AUTHORITY_CONFLICT',
      releaseId: authority.releaseId,
      candidateId: '',
      authorityErrors: authority.errors,
      inventoryErrors: [],
      verdict: failedVerdict(['authority:untrusted']),
    };
  }

  const inventory = normalizeArtifactInventory(inventoryDocument, authority.releaseId);
  if (!inventory.ok) {
    return {
      status: 'failed',
      errorCode: 'SCOPE_EVIDENCE_INSUFFICIENT',
      releaseId: authority.releaseId,
      candidateId: inventory.candidateId,
      authorityErrors: [],
      inventoryErrors: inventory.errors,
      verdict: failedVerdict(inventory.errors),
    };
  }

  const verdict = new ReleaseSetValidator().validate(authority.items, inventory.inventory);
  if (verdict.unexpectedExcluded.length > 0) {
    return {
      status: 'failed',
      errorCode: 'SCOPE_BOUNDARY_VIOLATION',
      releaseId: authority.releaseId,
      candidateId: inventory.candidateId,
      authorityErrors: [],
      inventoryErrors: [],
      verdict,
    };
  }
  if (
    verdict.missingRequired.length > 0
    || verdict.invalidDependencies.length > 0
  ) {
    return {
      status: 'failed',
      errorCode: 'RELEASE_SET_INCOMPLETE',
      releaseId: authority.releaseId,
      candidateId: inventory.candidateId,
      authorityErrors: [],
      inventoryErrors: [],
      verdict,
    };
  }
  if (verdict.incompleteEvidence.length > 0) {
    return {
      status: 'failed',
      errorCode: 'SCOPE_EVIDENCE_INSUFFICIENT',
      releaseId: authority.releaseId,
      candidateId: inventory.candidateId,
      authorityErrors: [],
      inventoryErrors: verdict.incompleteEvidence,
      verdict,
    };
  }

  return {
    status: 'passed',
    releaseId: authority.releaseId,
    candidateId: inventory.candidateId,
    authorityErrors: [],
    inventoryErrors: [],
    verdict,
  };
}

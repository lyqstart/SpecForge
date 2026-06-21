/**
 * extension-subflow-v12.ts
 *
 * v1.2 Extension Registry + Extension Request Artifact.
 *
 * Pure deterministic helpers for controlled Extension Subflow:
 * request -> proposal -> validation -> approved registry merge -> parent resume token.
 */

export type V12ExtensionKind =
  | 'artifact_type'
  | 'workflow_type'
  | 'gate_type'
  | 'project_spec_section'
  | 'tool_contract';

export type V12ExtensionStatus = 'proposed' | 'active' | 'rejected' | 'deprecated';

export type V12ExtensionDecision =
  | 'EXTENSION_REQUESTED'
  | 'EXTENSION_PROPOSED'
  | 'EXTENSION_VALID'
  | 'EXTENSION_INVALID'
  | 'EXTENSION_MERGED'
  | 'REGISTRY_VERSION_STALE'
  | 'UNAPPROVED_EXTENSION_MERGE_DENIED'
  | 'DUPLICATE_EXTENSION_ID';

export interface V12ExtensionRequestInput {
  parent_work_item_id: string;
  missing_kind: V12ExtensionKind;
  missing_name: string;
  reason: string;
  return_state: string;
  requested_by?: string;
  request_index?: number;
}

export interface V12ExtensionRequestArtifact {
  schema_version: '1.2';
  parent_work_item_id: string;
  request_id: string;
  missing_kind: V12ExtensionKind;
  missing_name: string;
  reason: string;
  return_state: string;
  requested_by: string;
  decision: 'EXTENSION_REQUESTED';
}

export interface V12ExtensionProposalInput {
  request: V12ExtensionRequestArtifact;
  extension_id?: string;
  usage_contract?: Record<string, unknown>;
  schema_delta?: Record<string, unknown>;
  compatibility_impact?: 'low' | 'medium' | 'high';
  recursive_depth?: number;
}

export interface V12ExtensionProposalArtifact {
  schema_version: '1.2';
  proposal_id: string;
  request_id: string;
  parent_work_item_id: string;
  extension_id: string;
  kind: V12ExtensionKind;
  missing_name: string;
  schema_delta: Record<string, unknown>;
  usage_contract: Record<string, unknown>;
  compatibility_impact: 'low' | 'medium' | 'high';
  return_to_parent: {
    parent_work_item_id: string;
    return_state: string;
  };
  decision: 'EXTENSION_PROPOSED';
}

export interface V12ExtensionRegistryEntry {
  extension_id: string;
  kind: V12ExtensionKind;
  status: V12ExtensionStatus;
  schema_ref?: string;
  usage_contract?: Record<string, unknown>;
  created_by_request_id?: string;
}

export interface V12ExtensionRegistry {
  schema_version: '1.2';
  registry_version: string;
  extensions: V12ExtensionRegistryEntry[];
}

export interface V12ExtensionGateResult {
  allowed: boolean;
  decision: V12ExtensionDecision;
  violations: string[];
}

export interface V12ExtensionMergeInput {
  registry: V12ExtensionRegistry;
  proposal: V12ExtensionProposalArtifact;
  expected_registry_version: string;
  user_approved: boolean;
}

export interface V12ExtensionMergeResult {
  allowed: boolean;
  decision: V12ExtensionDecision;
  registry: V12ExtensionRegistry;
  violations: string[];
  merge_evidence?: {
    extension_id: string;
    previous_registry_version: string;
    next_registry_version: string;
    parent_work_item_id: string;
    request_id: string;
  };
}

export interface V12ParentResumeToken {
  parent_work_item_id: string;
  extension_id: string;
  registry_version: string;
  return_state: string;
  next_action: 'resume_parent_workflow';
}

export interface V12ExtensionTriggerInput {
  artifact_type_exists?: boolean;
  workflow_path_exists?: boolean;
  gate_type_exists?: boolean;
  project_spec_section_exists?: boolean;
  tool_contract_exists?: boolean;
  user_requested_extension?: boolean;
}

export function normalizeExtensionName(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9_.\-/]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function defaultExtensionId(kind: V12ExtensionKind, missingName: string): string {
  return `${kind}.${normalizeExtensionName(missingName)}`;
}

export function createExtensionRequest(input: V12ExtensionRequestInput): V12ExtensionRequestArtifact {
  const parent = String(input.parent_work_item_id ?? '').trim();
  const missingName = String(input.missing_name ?? '').trim();
  const reason = String(input.reason ?? '').trim();
  const returnState = String(input.return_state ?? '').trim();

  if (!parent) throw new Error('parent_work_item_id is required');
  if (!missingName) throw new Error('missing_name is required');
  if (!reason) throw new Error('reason is required');
  if (!returnState) throw new Error('return_state is required');

  const suffix = String(input.request_index ?? 1).padStart(3, '0');

  return {
    schema_version: '1.2',
    parent_work_item_id: parent,
    request_id: `EXTREQ-${parent}-${suffix}`,
    missing_kind: input.missing_kind,
    missing_name: missingName,
    reason,
    return_state: returnState,
    requested_by: input.requested_by ?? 'sf-orchestrator',
    decision: 'EXTENSION_REQUESTED',
  };
}

export function createExtensionProposal(input: V12ExtensionProposalInput): V12ExtensionProposalArtifact {
  if ((input.recursive_depth ?? 0) > 0) {
    throw new Error('recursive extension subflow is denied');
  }

  const extensionId = input.extension_id ?? defaultExtensionId(input.request.missing_kind, input.request.missing_name);

  return {
    schema_version: '1.2',
    proposal_id: `EXTPROP-${input.request.request_id}`,
    request_id: input.request.request_id,
    parent_work_item_id: input.request.parent_work_item_id,
    extension_id: extensionId,
    kind: input.request.missing_kind,
    missing_name: input.request.missing_name,
    schema_delta: input.schema_delta ?? {},
    usage_contract: input.usage_contract ?? {},
    compatibility_impact: input.compatibility_impact ?? 'low',
    return_to_parent: {
      parent_work_item_id: input.request.parent_work_item_id,
      return_state: input.request.return_state,
    },
    decision: 'EXTENSION_PROPOSED',
  };
}

export function createEmptyExtensionRegistry(registryVersion = 'EXT-0000'): V12ExtensionRegistry {
  return {
    schema_version: '1.2',
    registry_version: registryVersion,
    extensions: [],
  };
}

export function validateExtensionProposal(
  proposal: V12ExtensionProposalArtifact,
  registry?: V12ExtensionRegistry,
): V12ExtensionGateResult {
  const violations: string[] = [];

  if (proposal.schema_version !== '1.2') violations.push('schema_version must be 1.2');
  if (!proposal.extension_id) violations.push('extension_id is required');
  if (!proposal.parent_work_item_id) violations.push('parent_work_item_id is required');
  if (!proposal.request_id) violations.push('request_id is required');
  if (!proposal.return_to_parent?.return_state) violations.push('return_state is required');
  if (proposal.return_to_parent.parent_work_item_id !== proposal.parent_work_item_id) {
    violations.push('return_to_parent.parent_work_item_id must match proposal.parent_work_item_id');
  }

  if (registry?.extensions.some((entry) => entry.extension_id === proposal.extension_id && entry.status === 'active')) {
    violations.push(`duplicate active extension_id: ${proposal.extension_id}`);
  }

  return {
    allowed: violations.length === 0,
    decision: violations.length === 0 ? 'EXTENSION_VALID' : 'EXTENSION_INVALID',
    violations,
  };
}

function nextRegistryVersion(current: string): string {
  const match = /^EXT-(\d+)$/.exec(current);
  if (!match) return 'EXT-0001';
  return `EXT-${String(Number(match[1]) + 1).padStart(4, '0')}`;
}

export function mergeExtensionRegistry(input: V12ExtensionMergeInput): V12ExtensionMergeResult {
  const registry = input.registry;

  if (registry.registry_version !== input.expected_registry_version) {
    return {
      allowed: false,
      decision: 'REGISTRY_VERSION_STALE',
      registry,
      violations: [
        `registry version mismatch: expected ${input.expected_registry_version}, actual ${registry.registry_version}`,
      ],
    };
  }

  if (!input.user_approved) {
    return {
      allowed: false,
      decision: 'UNAPPROVED_EXTENSION_MERGE_DENIED',
      registry,
      violations: ['extension registry merge requires user approval'],
    };
  }

  const validation = validateExtensionProposal(input.proposal, registry);
  if (!validation.allowed) {
    return {
      allowed: false,
      decision: validation.violations.some((v) => v.includes('duplicate')) ? 'DUPLICATE_EXTENSION_ID' : 'EXTENSION_INVALID',
      registry,
      violations: validation.violations,
    };
  }

  const nextVersion = nextRegistryVersion(registry.registry_version);
  const nextRegistry: V12ExtensionRegistry = {
    schema_version: '1.2',
    registry_version: nextVersion,
    extensions: [
      ...registry.extensions,
      {
        extension_id: input.proposal.extension_id,
        kind: input.proposal.kind,
        status: 'active',
        usage_contract: input.proposal.usage_contract,
        created_by_request_id: input.proposal.request_id,
      },
    ],
  };

  return {
    allowed: true,
    decision: 'EXTENSION_MERGED',
    registry: nextRegistry,
    violations: [],
    merge_evidence: {
      extension_id: input.proposal.extension_id,
      previous_registry_version: registry.registry_version,
      next_registry_version: nextVersion,
      parent_work_item_id: input.proposal.parent_work_item_id,
      request_id: input.proposal.request_id,
    },
  };
}

export function createParentResumeToken(
  proposal: V12ExtensionProposalArtifact,
  registryVersion: string,
): V12ParentResumeToken {
  return {
    parent_work_item_id: proposal.parent_work_item_id,
    extension_id: proposal.extension_id,
    registry_version: registryVersion,
    return_state: proposal.return_to_parent.return_state,
    next_action: 'resume_parent_workflow',
  };
}

export function shouldTriggerExtensionSubflow(input: V12ExtensionTriggerInput): boolean {
  return Boolean(
    input.user_requested_extension ||
    input.artifact_type_exists === false ||
    input.workflow_path_exists === false ||
    input.gate_type_exists === false ||
    input.project_spec_section_exists === false ||
    input.tool_contract_exists === false,
  );
}

export const SF_EXTENSION_SUBFLOW_V12_CONTRACT = {
  schema_version: '1.2',
  registry_path: '.specforge/project/extensions/extension_registry.json',
  request_decision: 'EXTENSION_REQUESTED',
  proposal_decision: 'EXTENSION_PROPOSED',
  merge_decision: 'EXTENSION_MERGED',
  parent_resume_action: 'resume_parent_workflow',
  rules: [
    'missing extension type must create an Extension Request',
    'extension proposal must pass gate validation before approval',
    'registry merge requires user approval',
    'registry merge requires matching registry version',
    'duplicate active extension_id is denied',
    'parent workflow resumes only with parent_work_item_id, extension_id, registry_version, return_state',
    'recursive extension subflow is denied',
  ],
} as const;

import { describe, expect, it } from 'vitest';
import {
  createEmptyExtensionRegistry,
  createExtensionProposal,
  createExtensionRequest,
  createParentResumeToken,
  mergeExtensionRegistry,
  shouldTriggerExtensionSubflow,
  validateExtensionProposal,
} from '../src/tools/lib/extension-subflow-v12';

describe('v1.2 extension subflow request/proposal/merge', () => {
  it('creates a deterministic extension request artifact', () => {
    const request = createExtensionRequest({
      parent_work_item_id: 'WI-0001',
      missing_kind: 'artifact_type',
      missing_name: 'security_review',
      reason: 'workflow needs security review artifact',
      return_state: 'candidate_preparing',
    });

    expect(request.schema_version).toBe('1.2');
    expect(request.request_id).toBe('EXTREQ-WI-0001-001');
    expect(request.decision).toBe('EXTENSION_REQUESTED');
  });

  it('creates and validates an extension proposal', () => {
    const request = createExtensionRequest({
      parent_work_item_id: 'WI-0001',
      missing_kind: 'artifact_type',
      missing_name: 'security_review',
      reason: 'workflow needs security review artifact',
      return_state: 'candidate_preparing',
    });

    const proposal = createExtensionProposal({ request });
    const validation = validateExtensionProposal(proposal, createEmptyExtensionRegistry());

    expect(proposal.extension_id).toBe('artifact_type.security_review');
    expect(proposal.return_to_parent.return_state).toBe('candidate_preparing');
    expect(validation.allowed).toBe(true);
    expect(validation.decision).toBe('EXTENSION_VALID');
  });

  it('merges an approved extension proposal and increments registry version', () => {
    const registry = createEmptyExtensionRegistry('EXT-0000');
    const request = createExtensionRequest({
      parent_work_item_id: 'WI-0001',
      missing_kind: 'artifact_type',
      missing_name: 'security_review',
      reason: 'workflow needs security review artifact',
      return_state: 'candidate_preparing',
    });
    const proposal = createExtensionProposal({ request });

    const merged = mergeExtensionRegistry({
      registry,
      proposal,
      expected_registry_version: 'EXT-0000',
      user_approved: true,
    });

    expect(merged.allowed).toBe(true);
    expect(merged.decision).toBe('EXTENSION_MERGED');
    expect(merged.registry.registry_version).toBe('EXT-0001');
    expect(merged.registry.extensions).toHaveLength(1);
    expect(merged.merge_evidence?.extension_id).toBe('artifact_type.security_review');

    const resume = createParentResumeToken(proposal, merged.registry.registry_version);
    expect(resume.parent_work_item_id).toBe('WI-0001');
    expect(resume.next_action).toBe('resume_parent_workflow');
  });

  it('detects missing extension triggers', () => {
    expect(shouldTriggerExtensionSubflow({ artifact_type_exists: false })).toBe(true);
    expect(shouldTriggerExtensionSubflow({ user_requested_extension: true })).toBe(true);
    expect(shouldTriggerExtensionSubflow({ artifact_type_exists: true })).toBe(false);
  });
});

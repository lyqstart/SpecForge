import { describe, expect, it } from 'vitest';
import {
  SF_EXTENSION_SUBFLOW_V12_CONTRACT,
  createEmptyExtensionRegistry,
  createExtensionProposal,
  createExtensionRequest,
  mergeExtensionRegistry,
  validateExtensionProposal,
} from '../src/tools/lib/extension-subflow-v12';

function proposal() {
  const request = createExtensionRequest({
    parent_work_item_id: 'WI-0002',
    missing_kind: 'gate_type',
    missing_name: 'security_gate',
    reason: 'workflow requires a security gate',
    return_state: 'gates_running',
  });
  return createExtensionProposal({ request });
}

describe('v1.2 extension subflow negative contract coverage', () => {
  it('exports frozen contract markers', () => {
    expect(SF_EXTENSION_SUBFLOW_V12_CONTRACT.schema_version).toBe('1.2');
    expect(SF_EXTENSION_SUBFLOW_V12_CONTRACT.registry_path).toBe('.specforge/project/extensions/extension_registry.json');
    expect(SF_EXTENSION_SUBFLOW_V12_CONTRACT.rules.join('\n')).toContain('registry merge requires user approval');
  });

  it('denies unapproved registry merge', () => {
    const result = mergeExtensionRegistry({
      registry: createEmptyExtensionRegistry('EXT-0000'),
      proposal: proposal(),
      expected_registry_version: 'EXT-0000',
      user_approved: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('UNAPPROVED_EXTENSION_MERGE_DENIED');
  });

  it('denies stale registry version', () => {
    const result = mergeExtensionRegistry({
      registry: createEmptyExtensionRegistry('EXT-0007'),
      proposal: proposal(),
      expected_registry_version: 'EXT-0006',
      user_approved: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('REGISTRY_VERSION_STALE');
  });

  it('denies duplicate active extension_id', () => {
    const existing = proposal();
    const registry = {
      schema_version: '1.2' as const,
      registry_version: 'EXT-0001',
      extensions: [
        {
          extension_id: existing.extension_id,
          kind: existing.kind,
          status: 'active' as const,
        },
      ],
    };

    const validation = validateExtensionProposal(existing, registry);
    expect(validation.allowed).toBe(false);
    expect(validation.violations.join('\n')).toContain('duplicate active extension_id');

    const result = mergeExtensionRegistry({
      registry,
      proposal: existing,
      expected_registry_version: 'EXT-0001',
      user_approved: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('DUPLICATE_EXTENSION_ID');
  });

  it('denies recursive extension proposal creation', () => {
    const request = createExtensionRequest({
      parent_work_item_id: 'WI-0003',
      missing_kind: 'tool_contract',
      missing_name: 'new_tool',
      reason: 'tool contract missing',
      return_state: 'candidate_preparing',
    });

    expect(() => createExtensionProposal({ request, recursive_depth: 1 })).toThrow(/recursive extension subflow is denied/);
  });
});

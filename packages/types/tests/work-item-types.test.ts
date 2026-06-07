/**
 * work-item-types.test.ts — v1.1 Work Item 核心类型单元测试
 *
 * 验证 zod schema、状态机、workflow_path 等。
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  WI_STATUSES,
  WORKFLOW_PATHS,
  GATE_IDS,
  GATE_TYPES,
  GATE_SUMMARY_STATUSES,
  USER_DECISION_STATUSES,
  WorkItemJsonSchema,
  CandidateManifestSchema,
  CandidateManifestEntrySchema,
  GateReportSchema,
  UserDecisionSchema,
  SpecManifestSchema,
  ExtensionRegistrySchema,
  ExtensionRequestSchema,
  EvidenceManifestSchema,
  FORBIDDEN_TRANSITIONS,
  isForbiddenTransition,
} from '../src/work-item-types';

describe('WI_STATUSES（§5.1）', () => {
  it('contains all v1.1 required statuses', () => {
    const required = [
      'created', 'intake_ready', 'impact_analyzing', 'impact_analyzed',
      'workflow_selected', 'candidate_preparing', 'candidate_prepared',
      'gates_running', 'gates_failed', 'approval_required', 'approved',
      'merge_ready', 'merging', 'merged', 'post_merge_verified',
      'implementation_ready', 'implementation_running', 'implementation_done',
      'verification_running', 'verification_done', 'closed', 'blocked',
      'rejected', 'superseded',
    ];
    for (const s of required) {
      expect(WI_STATUSES).toContain(s);
    }
  });
});

describe('WORKFLOW_PATHS（§6.4）', () => {
  it('contains all 7 workflow paths', () => {
    expect(WORKFLOW_PATHS).toContain('requirement_change_path');
    expect(WORKFLOW_PATHS).toContain('design_change_path');
    expect(WORKFLOW_PATHS).toContain('architecture_change_path');
    expect(WORKFLOW_PATHS).toContain('task_change_path');
    expect(WORKFLOW_PATHS).toContain('code_only_fast_path');
    expect(WORKFLOW_PATHS).toContain('spec_migration_path');
    expect(WORKFLOW_PATHS).toContain('rollback_path');
    expect(WORKFLOW_PATHS.length).toBe(7);
  });
});

describe('GATE_IDS（§9.2）', () => {
  it('contains all required gate IDs', () => {
    const required = [
      'entry_gate', 'workflow_selection_gate', 'required_files_gate',
      'candidate_manifest_gate', 'path_policy_gate', 'schema_gate',
      'spec_consistency_gate', 'trace_gate', 'workflow_specific_gate',
      'gate_summary_gate', 'merge_ready_gate', 'post_merge_gate',
      'verification_gate', 'close_gate', 'extension_gate',
    ];
    for (const g of required) {
      expect(GATE_IDS).toContain(g);
    }
  });
});

describe('isForbiddenTransition（§5.2）', () => {
  it('forbids created → implementation_running', () => {
    expect(isForbiddenTransition('created', 'implementation_running')).toBe(true);
  });

  it('forbids approval_required → merging', () => {
    expect(isForbiddenTransition('approval_required', 'merging')).toBe(true);
  });

  it('forbids closed → any', () => {
    expect(isForbiddenTransition('closed', 'created')).toBe(true);
    expect(isForbiddenTransition('closed', 'intake_ready')).toBe(true);
  });

  it('allows valid transitions', () => {
    expect(isForbiddenTransition('created', 'intake_ready')).toBe(false);
    expect(isForbiddenTransition('gates_running', 'gates_failed')).toBe(false);
    expect(isForbiddenTransition('approved', 'merge_ready')).toBe(false);
  });
});

describe('WorkItemJsonSchema（§4.4）', () => {
  const minimal = {
    schema_version: '1.0' as const,
    work_item_id: 'WI-0001',
    status: 'created' as const,
    workflow_path: null,
    code_change_allowed: false,
    allowed_write_files: [],
    created_at: '2026-06-07T00:00:00Z',
    updated_at: '2026-06-07T00:00:00Z',
    created_by: 'sf-orchestrator' as const,
  };

  it('parses minimal valid work_item.json', () => {
    const parsed = WorkItemJsonSchema.parse(minimal);
    expect(parsed.work_item_id).toBe('WI-0001');
    expect(parsed.code_change_allowed).toBe(false);
  });

  it('rejects invalid WI ID format', () => {
    expect(() => WorkItemJsonSchema.parse({
      ...minimal,
      work_item_id: 'WI-01',
    })).toThrow(ZodError);
  });

  it('rejects unknown status', () => {
    expect(() => WorkItemJsonSchema.parse({
      ...minimal,
      status: 'unknown_status',
    })).toThrow(ZodError);
  });

  it('accepts allowed_write_files with operations', () => {
    const withFiles = {
      ...minimal,
      allowed_write_files: [
        { path: 'src/auth.ts', operation: 'modify' as const },
        { path: 'src/auth.test.ts', operation: 'create' as const },
      ],
    };
    const parsed = WorkItemJsonSchema.parse(withFiles);
    expect(parsed.allowed_write_files.length).toBe(2);
  });
});

describe('CandidateManifestSchema（§8.3）', () => {
  it('parses valid manifest', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      entries: [
        {
          candidate_path: '.specforge/work-items/WI-0001/candidates/project/modules/AUTH/requirements.md',
          target_path: '.specforge/project/modules/AUTH/requirements.md',
          operation: 'replace',
          candidate_hash: 'sha256:abc123',
        },
      ],
    };
    const parsed = CandidateManifestSchema.parse(manifest);
    expect(parsed.entries.length).toBe(1);
  });

  it('accepts empty entries for code_only_fast_path', () => {
    const manifest = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      workflow_path: 'code_only_fast_path',
      base_spec_version: 'PSV-0001',
      merge_required: false,
      entries: [],
    };
    const parsed = CandidateManifestSchema.parse(manifest);
    expect(parsed.entries).toEqual([]);
  });
});

describe('GateReportSchema（§9.4）', () => {
  it('parses valid gate report', () => {
    const report = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      gate_id: 'candidate_manifest_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: ['candidate_manifest.json'],
      checks: [
        { check_id: 'entries_valid', description: 'Entries valid', passed: true },
      ],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: '2026-06-07T00:00:00Z',
      finished_at: '2026-06-07T00:00:01Z',
      runner: 'Gate Runner',
    };
    const parsed = GateReportSchema.parse(report);
    expect(parsed.status).toBe('passed');
  });
});

describe('UserDecisionSchema（§10.2）', () => {
  it('parses valid user decision', () => {
    const decision = {
      schema_version: '1.0',
      decision_id: 'UD-001',
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      candidate_manifest_path: 'candidate_manifest.json',
      manifest_hash: 'sha256:abc',
      candidate_hash: 'sha256:def',
      gate_summary_path: 'gate_summary.md',
      gate_summary_hash: 'sha256:ghi',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'user',
      decided_at: '2026-06-07T01:00:00Z',
      decision_scope: 'full',
      waivers: [],
    };
    const parsed = UserDecisionSchema.parse(decision);
    expect(parsed.decision_status).toBe('approved');
  });

  it('rejects old status needs_revision (§10.3)', () => {
    // needs_revision should not be a valid status
    expect(USER_DECISION_STATUSES).not.toContain('needs_revision');
    expect(USER_DECISION_STATUSES).toContain('request_changes');
  });
});

describe('SpecManifestSchema（§2.3）', () => {
  it('parses valid spec manifest', () => {
    const manifest = {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'TestProject',
      project: {
        extension_registry: '.specforge/project/extension_registry.json',
        requirements_index: '.specforge/project/requirements_index.md',
        design_index: '.specforge/project/design_index.md',
        architecture: '.specforge/project/architecture.md',
        glossary: '.specforge/project/glossary.md',
        decisions: '.specforge/project/decisions.md',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [
        {
          name: 'AUTH',
          path: '.specforge/project/modules/AUTH',
          module_file: '.specforge/project/modules/AUTH/module.json',
          requirements: '.specforge/project/modules/AUTH/requirements.md',
          design: '.specforge/project/modules/AUTH/design.md',
          trace: '.specforge/project/modules/AUTH/trace.md',
        },
      ],
    };
    const parsed = SpecManifestSchema.parse(manifest);
    expect(parsed.modules[0].name).toBe('AUTH');
  });
});

describe('ExtensionRegistrySchema（v1.1 Patch 1）', () => {
  it('parses empty extension registry', () => {
    const registry = {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {
        requirement_types: [],
        design_types: [],
        task_types: [],
        verification_types: [],
        gate_types: [],
      },
      updated_by_work_item: null,
      updated_at: null,
    };
    const parsed = ExtensionRegistrySchema.parse(registry);
    expect(parsed.namespaces.design_types).toEqual([]);
  });
});

describe('ExtensionRequestSchema（v1.1 Patch 1 §7）', () => {
  it('parses valid extension request', () => {
    const request = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      requested_by_agent: 'sf-design',
      requested_namespace: 'design_types',
      requested_key: 'retry_policy',
      reason: 'Need retry_policy design type for login feature',
      blocking_current_flow: true,
      created_at: '2026-06-07T00:00:00Z',
    };
    const parsed = ExtensionRequestSchema.parse(request);
    expect(parsed.blocking_current_flow).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';
import {
  decideWritePermission,
  decideWorkItemArtifactWriteBoundary,
  type WriteDecisionContext,
  type WriteOperation,
} from '../../src/write-decision';

const baseContext: WriteDecisionContext = {
  hasActiveWI: true,
  callerRole: ACTOR_ROLES.agent,
  isFrozen: false,
  workItem: {
    work_item_id: 'WI-TEST',
    status: 'implementation_running',
    code_change_allowed: true,
    allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
    workflow_path: null,
  },
};

function decide(
  path: string,
  operation: WriteOperation = 'modify',
  overrides: Partial<WriteDecisionContext> = {},
) {
  return decideWritePermission({ ...baseContext, ...overrides }, path, operation);
}

describe('canonical write decision', () => {
  it('allows an authorized code write', () => {
    expect(decide('src/app.ts')).toEqual({ allowed: true, violations: [] });
  });

  it('denies unknown actors before evaluating paths', () => {
    expect(decide('src/app.ts', 'modify', { callerRole: 'unknown' as never })).toEqual({
      allowed: false,
      violations: ['unknown actor role: unknown, write denied'],
    });
  });

  it('denies writes after the Work Item is closed', () => {
    expect(decide('src/app.ts', 'modify', {
      workItem: { ...baseContext.workItem!, status: 'closed' },
    })).toEqual({
      allowed: false,
      violations: ['closed WI cannot be written: WI-TEST'],
    });
  });

  it('denies code writes without an active Work Item', () => {
    expect(decideWritePermission({
      hasActiveWI: false,
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    }, 'src/app.ts', 'modify')).toEqual({
      allowed: false,
      violations: ['no active WI, cannot write code: src/app.ts'],
    });
  });

  it('enforces controlled governance writers', () => {
    expect(decide('.specforge/project/modules/CORE/design.md')).toEqual({
      allowed: false,
      violations: [
        'only merge_runner may write .specforge/project/: .specforge/project/modules/CORE/design.md (actor: agent)',
      ],
    });
    expect(decide('.specforge/project/modules/CORE/design.md', 'modify', {
      callerRole: ACTOR_ROLES.mergeRunner,
    })).toEqual({ allowed: true, violations: [] });
  });

  it('requires controlled tools for Work Item artifact references', () => {
    const expected = {
      allowed: false,
      reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL',
      violations: ['WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL'],
      hard_stop: true,
    };

    expect(decide('.specforge/work-items/WI-TEST/intake.md')).toEqual(expected);
    expect(decide('.specforge\\work-items\\WI-TEST\\intake.md')).toEqual(expected);
    expect(decideWorkItemArtifactWriteBoundary(
      'echo x > .specforge/work-items/WI-TEST/intake.md',
    )).toEqual(expected);
    expect(decideWorkItemArtifactWriteBoundary('src/app.ts')).toBeNull();
  });

  it('denies frozen Candidate changes', () => {
    expect(decide('.specforge/work-items/WI-TEST/candidates/design.md', 'modify', {
      isFrozen: true,
    })).toEqual({
      allowed: false,
      reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL',
      violations: ['WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL'],
      hard_stop: true,
    });
  });

  it('enforces code permission and path-operation scope', () => {
    expect(decide('src/app.ts', 'modify', {
      workItem: { ...baseContext.workItem!, code_change_allowed: false },
    }).violations).toEqual(['code_change_allowed=false, cannot write: src/app.ts']);

    expect(decide('src/other.ts')).toEqual({
      allowed: false,
      violations: ['file+operation not in allowed_write_files: src/other.ts (modify)'],
    });
  });

  it('requires authoritative implementation_running state for code writes', () => {
    expect(decide('src/app.ts', 'modify', {
      workItem: { ...baseContext.workItem!, status: 'implementation_ready' },
    })).toEqual({
      allowed: false,
      violations: ['write requires implementation_running state: current=implementation_ready'],
    });

    expect(decide('src/app.ts', 'modify', {
      workItem: { ...baseContext.workItem!, status: '' },
    })).toEqual({
      allowed: false,
      violations: ['authoritative runtime state unavailable; write denied'],
    });
  });

  it('allows only explicit in-scope directory preparation', () => {
    expect(decideWritePermission(baseContext, 'src', 'create', { kind: 'directory' })).toEqual({
      allowed: true,
      violations: [],
    });

    expect(decideWritePermission(baseContext, 'other', 'create', { kind: 'directory' })).toEqual({
      allowed: false,
      violations: ['directory preparation not in allowed_write_files scope: other'],
    });

    expect(decide('src', 'create')).toEqual({
      allowed: false,
      violations: ['file+operation not in allowed_write_files: src (create)'],
    });
  });

  it('denies directory preparation after code permission is revoked', () => {
    expect(decideWritePermission({
      ...baseContext,
      workItem: { ...baseContext.workItem!, code_permission_revoked: true },
    }, 'src', 'create', { kind: 'directory' })).toEqual({
      allowed: false,
      violations: ['code permission revoked, cannot write: src'],
    });
  });

  it('preserves protected-file RBAC decisions', () => {
    expect(decide('.specforge/specs/WI-TEST/requirements.md', 'modify', {
      enableRBAC: true,
    })).toEqual({
      allowed: false,
      violations: [
        'RBAC: agent is not authorized to modify spec_file: .specforge/specs/WI-TEST/requirements.md',
      ],
    });

    expect(decide('.specforge/specs/WI-TEST/verification_report.md', 'create', {
      enableRBAC: true,
    })).toEqual({ allowed: true, violations: [] });
  });
});

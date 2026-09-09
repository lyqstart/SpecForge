import { describe, expect, it } from 'vitest';

import {
  GateAttemptResultSchema,
  GateAttemptStartSchema,
  GateReportSchema,
} from '@specforge/types';

describe('Gate Attempt current persistent contract', () => {
  it('accepts the formal version gate and rejects unknown Gate Report fields', () => {
    const report = {
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      gate_id: 'formal_version_gate',
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: '2026-09-09T00:00:00.000Z',
      finished_at: '2026-09-09T00:00:01.000Z',
      runner: 'gate_runner',
    };

    expect(GateReportSchema.safeParse(report).success).toBe(true);
    expect(GateReportSchema.safeParse({ ...report, unknown: true }).success).toBe(false);
  });

  it('allows only current gate_run Attempt Start documents', () => {
    const start = {
      schema_version: '1.0',
      attempt_id: 'attempt-0001',
      work_item_id: 'WI-0001',
      source: 'gate_run',
      started_at: '2026-09-09T00:00:00.000Z',
      requested_gate_ids: ['verification_gate', 'formal_version_gate'],
    };

    expect(GateAttemptStartSchema.safeParse(start).success).toBe(true);
    expect(
      GateAttemptStartSchema.safeParse({ ...start, source: 'legacy_latest_snapshot' }).success,
    ).toBe(false);
  });

  it('distinguishes exact success and error Attempt Result variants', () => {
    const base = {
      schema_version: '1.0',
      attempt_id: 'attempt-0001',
      work_item_id: 'WI-0001',
      source: 'gate_run',
      started_at: '2026-09-09T00:00:00.000Z',
      completed_at: '2026-09-09T00:00:01.000Z',
      requested_gate_ids: ['entry_gate'],
      current_report_gate_ids: ['entry_gate'],
    };
    const success = {
      ...base,
      summary_report_gate_ids: ['entry_gate'],
      summary_status: 'passed',
      input_snapshot: 'input-snapshot.json',
    };
    const failure = {
      ...base,
      execution_status: 'error',
      error: 'gate execution failed',
    };

    expect(GateAttemptResultSchema.safeParse(success).success).toBe(true);
    expect(GateAttemptResultSchema.safeParse(failure).success).toBe(true);
    expect(
      GateAttemptResultSchema.safeParse({ ...success, execution_status: 'error' }).success,
    ).toBe(false);
  });
});

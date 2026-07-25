import { describe, expect, it } from 'vitest';
import { assessWaiverFollowUp } from '../../src/tools/lib/close-gate.js';

describe('assessWaiverFollowUp', () => {
  it('does not treat waiver_allowed=true as an actual waiver', () => {
    const result = assessWaiverFollowUp(
      {
        decision_status: 'approved',
        decision_type: 'user_approved',
        waivers: [],
      },
      [
        {
          gate_id: 'trace_gate',
          status: 'passed',
          waiver_allowed: true,
          waiver_required: false,
          waiver_ids: [],
        },
      ]
    );

    expect(result.waiverUsed).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.missingFollowUpWaiverIds).toEqual([]);
  });

  it('fails when an actual waiver has no follow-up WI', () => {
    const result = assessWaiverFollowUp(
      {
        decision_status: 'waived',
        decision_type: 'waived',
        waivers: [{ waiver_id: 'WV-1', gate_id: 'trace_gate' }],
      },
      [{ gate_id: 'trace_gate', status: 'waived', waiver_ids: ['WV-1'] }]
    );

    expect(result.waiverUsed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.missingFollowUpWaiverIds).toEqual(['WV-1']);
  });

  it('passes when every actual waiver has a follow-up WI', () => {
    const result = assessWaiverFollowUp(
      {
        decision_status: 'waived',
        decision_type: 'waived',
        waivers: [
          {
            waiver_id: 'WV-1',
            gate_id: 'trace_gate',
            follow_up_wi: 'WI-0099',
          },
        ],
      },
      [{ gate_id: 'trace_gate', status: 'waived', waiver_ids: ['WV-1'] }]
    );

    expect(result.waiverUsed).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.missingFollowUpWaiverIds).toEqual([]);
  });

  it('fails when a Gate Report waiver is absent from User Decision', () => {
    const result = assessWaiverFollowUp(
      {
        decision_status: 'approved',
        decision_type: 'user_approved',
        waivers: [],
      },
      [{ gate_id: 'trace_gate', status: 'waived', waiver_ids: ['WV-2'] }]
    );

    expect(result.waiverUsed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.missingFollowUpWaiverIds).toEqual(['WV-2']);
  });

  it('fails closed when the decision declares waiver but has no waiver records', () => {
    const result = assessWaiverFollowUp(
      {
        decision_status: 'waived',
        decision_type: 'waived',
        waivers: [],
      },
      []
    );

    expect(result.waiverUsed).toBe(true);
    expect(result.passed).toBe(false);
  });
});

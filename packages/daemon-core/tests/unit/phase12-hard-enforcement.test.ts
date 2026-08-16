import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { computeGateSummaryStatus } from '../../src/tools/lib/gate-chain';
import { getGateStrictness, getRequiredGates } from '../../src/tools/lib/required-gates';

const CORE_GATES = [
  'spec_consistency_gate',
  'contract_integrity_gate',
  'trace_gate',
] as const;

describe('Phase 12 final hard enforcement', () => {
  it('pins all three core Gate strictness values to hard', () => {
    for (const gateId of CORE_GATES) {
      expect(getGateStrictness(gateId, 'requirement_change_path')).toBe('hard');
      expect(getGateStrictness(gateId, 'code_only_fast_path')).toBe('hard');
    }
  });

  it('covers all three core Gates in every Authority 11.9 governance Workflow and Fast Path', () => {
    const cases = [
      ['requirement_change_path', 'requirements', 'feature_spec'],
      ['requirement_change_path', 'requirements', 'bugfix_spec'],
      ['requirement_change_path', 'requirements', 'change_request'],
      ['design_change_path', 'design', 'feature_spec_design_first'],
      ['architecture_change_path', 'design', 'architecture_change'],
      ['code_only_fast_path', 'full', 'quick_change'],
      ['contract_change_path', 'full', 'contract_change'],
      ['spec_migration_path', 'design', 'spec_migration'],
    ] as const;

    for (const [workflowPath, candidatePhase, workflowType] of cases) {
      const gates = getRequiredGates(
        workflowPath,
        'candidate',
        candidatePhase,
        workflowType,
      );
      for (const gateId of CORE_GATES) {
        expect(gates, `${workflowType}/${workflowPath} missing ${gateId}`).toContain(gateId);
      }
    }
  });

  it('pins source registration to hard and removes runtime severity switching', () => {
    const libRoot = path.resolve(import.meta.dir, '../../src/tools/lib');
    const gateRunner = readFileSync(path.join(libRoot, 'gate-runner-v11.ts'), 'utf-8');
    const gateChain = readFileSync(path.join(libRoot, 'gate-chain.ts'), 'utf-8');

    for (const gateId of CORE_GATES) {
      expect(gateRunner).toContain(`registerGate('${gateId}', 'hard_gate', true`);
      expect(gateRunner).not.toContain(`registerGate('${gateId}', 'soft_gate'`);
    }
    expect(gateChain).not.toContain('forceHardWhenActive');
    expect(gateChain).toContain('base.gate_type');
  });

  it('treats a failed required hard core Gate as a failed Gate Summary', () => {
    expect(
      computeGateSummaryStatus([
        {
          gate_id: 'trace_gate',
          gate_type: 'hard_gate',
          required: true,
          status: 'failed',
          checks: [],
          input_files: [],
        } as any,
      ]),
    ).toBe('failed');
  });

  it('pins candidate state sealing so a non-passing Gate Summary cannot reach approval_required', () => {
    const handlerPath = path.resolve(
      import.meta.dir,
      '../../src/tools/handlers/sf-v11-gate-run.ts',
    );
    const handler = readFileSync(handlerPath, 'utf-8');

    expect(handler).toContain(
      "const passed = ['passed', 'passed_with_waiver_required'].includes(String(input.summaryStatus));",
    );
    expect(handler).toContain(
      "const finalState = passed ? 'approval_required' : 'gates_failed';",
    );
  });
});

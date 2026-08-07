import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  candidateGateRecoverySequence,
} from '../../src/tools/handlers/sf-v11-gate-run';
import { isValidTransition } from '../../src/tools/lib/state_machine';

describe('Candidate Gate retry state recovery', () => {
  it('uses the legal v1.1 chain when current state is gates_failed', () => {
    const sequence = candidateGateRecoverySequence(
      'gates_failed',
      'architecture_change',
    );

    expect(sequence).toEqual([
      'gates_failed',
      'candidate_preparing',
      'candidate_prepared',
      'gates_running',
    ]);

    for (let index = 0; index < sequence.length - 1; index += 1) {
      expect(
        isValidTransition(
          sequence[index]!,
          sequence[index + 1]!,
          'architecture_change',
        ),
      ).toBe(true);
    }

    expect(
      isValidTransition(
        'gates_running',
        'approval_required',
        'architecture_change',
      ),
    ).toBe(true);
    expect(
      isValidTransition('gates_running', 'gates_failed', 'architecture_change'),
    ).toBe(true);
    expect(
      isValidTransition(
        'gates_failed',
        'approval_required',
        'architecture_change',
      ),
    ).toBe(false);
  });

  it('preserves existing recovery sequences for normal Candidate states', () => {
    expect(
      candidateGateRecoverySequence(
        'candidate_prepared',
        'architecture_change',
      ),
    ).toEqual([
      'created',
      'intake_ready',
      'impact_analyzing',
      'impact_analyzed',
      'workflow_selected',
      'candidate_preparing',
      'candidate_prepared',
      'gates_running',
    ]);

    expect(
      candidateGateRecoverySequence(
        'candidate_prepared',
        'contract_change',
      ),
    ).toEqual([
      'created',
      'intake_ready',
      'candidate_preparing',
      'candidate_prepared',
      'gates_running',
    ]);
  });

  it('wires gates_failed into Candidate Gate auto-advance without changing state_machine', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const handler = await readFile(
      join(
        repoRoot,
        'packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts',
      ),
      'utf-8',
    );

    expect(handler).toContain("    'gates_failed',");
    expect(handler).toContain(
      'candidateGateRecoverySequence(currentState, workflowType)',
    );
    expect(handler).toContain(
      "state authority recovery step ' + from + '->' + to",
    );
  });

  it('pins authority and failure-ledger synchronization', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const authority = await readFile(
      join(
        repoRoot,
        'docs/design/SpecForge架构一致性治理最终实施方案.md',
      ),
      'utf-8',
    );
    const ledger = await readFile(
      join(
        repoRoot,
        'docs/rule/specforge-development-error-ledger-and-experience.md',
      ),
      'utf-8',
    );
    const handoff = await readFile(
      join(
        repoRoot,
        'docs/implementation/architecture-consistency/current-handoff.md',
      ),
      'utf-8',
    );
    const closure = await readFile(
      join(
        repoRoot,
        'docs/implementation/architecture-consistency/P0-contract-consumer-closure.md',
      ),
      'utf-8',
    );

    expect(authority).toContain('GATE-RETRY-STATE-001');
    for (const token of [
      'ERR-178',
      'ERR-179',
      'ERR-180',
      'ERR-181',
      'EXP-150',
      'EXP-151',
      'EXP-152',
      'EXP-153',
    ]) {
      expect(ledger).toContain(token);
    }
    expect(handoff).toContain('attempt-0003');
    expect(closure).toContain('attempt-0003');
  });
});

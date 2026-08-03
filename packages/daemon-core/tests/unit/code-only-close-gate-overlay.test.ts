import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closeSpecArtifactRequirements } from '../../src/tools/lib/close-gate';

const repoRoot = join(import.meta.dirname, '../../../..');

describe('Close Gate workflow artifact applicability', () => {
  it('requires tasks but not Trace Delta for code_only_fast_path', () => {
    expect(closeSpecArtifactRequirements('code_only_fast_path', 'quick_change')).toEqual({
      tasks: true,
      traceDelta: false,
    });
  });

  it('requires tasks and Trace Delta for spec-changing workflows', () => {
    expect(closeSpecArtifactRequirements('requirement_change_path', 'feature_spec')).toEqual({
      tasks: true,
      traceDelta: true,
    });
    expect(closeSpecArtifactRequirements('design_change_path', 'design_change')).toEqual({
      tasks: true,
      traceDelta: true,
    });
  });

  it('does not require Candidate tasks or Trace Delta for investigation and contract workflows', () => {
    expect(closeSpecArtifactRequirements('investigation_path', 'investigation')).toEqual({
      tasks: false,
      traceDelta: false,
    });
    expect(closeSpecArtifactRequirements('contract_change_path', 'contract_change')).toEqual({
      tasks: false,
      traceDelta: false,
    });
  });

  it('keeps Close applicability in the layer used by the formal close handler', () => {
    const handler = readFileSync(
      join(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts'),
      'utf-8',
    );
    const gateChain = readFileSync(
      join(repoRoot, 'packages/daemon-core/src/tools/lib/gate-chain.ts'),
      'utf-8',
    );

    expect(handler).toContain('runCloseGate({ workItemId, workItemDir, projectRoot })');
    expect(gateChain).not.toContain('filterCloseGateChecksForWorkflow');
    expect(gateChain).not.toContain('CODE_ONLY_CLOSE_EXCLUDED_CHECK_IDS');
  });
});

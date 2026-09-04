import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectReleaseAuthority } from '../src/release-authority-projection';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const requirementsPath = '.kiro/specs/v6-architecture-overview/requirements.md';
const designPath = '.kiro/specs/v6-architecture-overview/design.md';
const matrixPath = 'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md';

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('current release authority projection', () => {
  it('expands the frozen Step 5 matrix into the complete hash-bound release set', () => {
    const result = projectReleaseAuthority({
      releaseId: 'specforge-v6-current',
      requirements: { path: requirementsPath, content: read(requirementsPath) },
      design: { path: designPath, content: read(designPath) },
      matrix: { path: matrixPath, content: read(matrixPath) },
    });

    expect(result.ok, result.errors.join('\n')).toBe(true);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.items).toHaveLength(172);

    const byId = new Map(result.document?.items.map((item) => [item.id, item]));
    expect(byId.get('@specforge/daemon-core')?.classification).toBe('CURRENT_RELEASE_CORE');
    expect(byId.get('workflow:feature_spec')?.classification).toBe('CURRENT_RELEASE_SUPPORTING');
    expect(byId.get('workflow:bugfix_spec')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('agent:sf-analyst')?.classification).toBe('CURRENT_RELEASE_SUPPORTING');
    expect(byId.get('tool:sf_context_build')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('legacy:cli-legacy-paths')?.classification).toBe('LEGACY_ONLY');
    expect(byId.get('history:error-ledger')?.classification).toBe('HISTORICAL_EVIDENCE_ONLY');
  });
});

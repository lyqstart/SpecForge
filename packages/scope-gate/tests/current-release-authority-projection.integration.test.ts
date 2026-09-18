import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectReleaseAuthority } from '../src/release-authority-projection';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const productSpecPath = 'docs/product-specification/specforge-product-specification.md';

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('current release authority projection', () => {
  it('expands SPS-1.0 into the complete hash-bound release set', () => {
    const result = projectReleaseAuthority({
      releaseId: 'specforge-v6-current',
      productSpecification: {
        path: productSpecPath,
        content: read(productSpecPath),
      },
    });

    expect(result.ok, result.errors.join('\n')).toBe(true);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.sources.map((source) => source.path)).toEqual([productSpecPath]);
    expect(result.document?.items).toHaveLength(172);

    const byId = new Map(result.document?.items.map((item) => [item.id, item]));
    expect(byId.get('@specforge/daemon-core')?.classification).toBe('CURRENT_RELEASE_CORE');
    expect(byId.get('@specforge/opencode-adapter')?.classification).toBe('CURRENT_RELEASE_CORE');
    expect(byId.get('workflow:feature_spec')?.classification).toBe('CURRENT_RELEASE_SUPPORTING');
    expect(byId.get('workflow:bugfix_spec')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('@specforge/plugin-loader')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('@specforge/self-healing')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('@specforge/multimodal')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('@specforge/migration')?.classification).toBe('BUILT_NOT_ENABLED');
    expect(byId.get('thin-plugin:daemon-start')?.classification).toBe('LEGACY_ONLY');
    expect(byId.get('legacy:cli-legacy-paths')?.classification).toBe('LEGACY_ONLY');
    expect(byId.get('history:error-ledger')?.classification).toBe('HISTORICAL_EVIDENCE_ONLY');
  });
});

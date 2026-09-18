import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  produceReleaseManifest,
  produceRuntimeEntrySurfaceReport,
} from '../../../scripts/lib/release-manifest-producer';
import { projectReleaseAuthority } from '../src/release-authority-projection';
import { ReleaseSetValidator } from '../src/release-set-validator';

const candidateRoot = fileURLToPath(new URL('../../../', import.meta.url));
const productSpecPath = 'docs/product-specification/specforge-product-specification.md';

function read(path: string): string {
  return readFileSync(resolve(candidateRoot, path), 'utf8');
}

describe('current repository release manifest and runtime entry surfaces', () => {
  it('reports deferred-package drift on the release manifest while runtime entries stay aligned', async () => {
    const releaseId = 'specforge-v6-current';
    const candidateId = (JSON.parse(read('release/release-manifest.json')) as {
      candidateId: string;
    }).candidateId;
    expect(candidateId).toMatch(/^main-[0-9a-f]{8}-working-tree-step[0-9a-z]+$/);
    const authority = projectReleaseAuthority({
      releaseId,
      productSpecification: { path: productSpecPath, content: read(productSpecPath) },
    });
    const manifest = await produceReleaseManifest({ candidateRoot, releaseId, candidateId });
    const runtime = await produceRuntimeEntrySurfaceReport({ candidateRoot, releaseId, candidateId });

    expect(authority.ok, authority.errors.join('\n')).toBe(true);
    expect(manifest.errors).toEqual([]);
    expect(runtime.errors).toEqual([]);

    const verdict = new ReleaseSetValidator().validate(authority.document?.items ?? [], {
      complete: true,
      enumeratedSurfaces: [
        'clean_build',
        'dynamic_registry',
        'installer_asset',
        'package_export',
        'release_manifest',
        'runtime_entry',
      ],
      items: [...manifest.report.items, ...runtime.report.items],
    });
    const selectedSuffixes = ['@release_manifest', '@runtime_entry'];
    expect({
      missingRequired: verdict.missingRequired.filter((entry) => (
        selectedSuffixes.some((suffix) => entry.endsWith(suffix))
      )),
      unexpectedExcluded: verdict.unexpectedExcluded.filter((entry) => (
        selectedSuffixes.some((suffix) => entry.endsWith(suffix))
      )),
    }).toEqual({
      missingRequired: [],
      unexpectedExcluded: [
        '@specforge/multimodal@release_manifest',
        '@specforge/plugin-loader@release_manifest',
        '@specforge/self-healing@release_manifest',
      ],
    });
  });
});

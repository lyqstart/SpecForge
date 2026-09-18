import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCurrentReleasePrecheck } from '../../../scripts/lib/current-release-precheck';

const candidateRoot = resolve(import.meta.dirname, '../../..');
const releaseId = 'specforge-v6-current';
const candidateId = (JSON.parse(
  readFileSync(resolve(candidateRoot, 'release/release-manifest.json'), 'utf8'),
) as { candidateId: string }).candidateId;

describe('current repository formal release precheck', () => {
  it('uses SPS-1.0 and passes once deferred packages are absent from current release surfaces', async () => {
    expect(candidateId).toMatch(/^main-[0-9a-f]{8}-working-tree-step[0-9a-z]+$/);
    const outcome = await runCurrentReleasePrecheck({ candidateRoot, releaseId, candidateId });

    expect(outcome.producerErrors).toEqual([]);
    expect(outcome.inventoryErrors).toEqual([]);
    expect(outcome.passed).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    expect(outcome.result?.errorCode).toBeUndefined();
    expect(outcome.result?.authorityErrors).toEqual([]);
    expect(outcome.result?.verdict.missingRequired).toEqual([]);
    expect(outcome.result?.verdict.unexpectedExcluded).toEqual([]);
  });
});

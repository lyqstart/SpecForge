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
  it('passes the hash-bound authority comparison across all six release surfaces', async () => {
    expect(candidateId).toMatch(/^main-[0-9a-f]{8}-working-tree-step[0-9a-z]+$/);
    const outcome = await runCurrentReleasePrecheck({ candidateRoot, releaseId, candidateId });

    expect(outcome.producerErrors).toEqual([]);
    expect(outcome.inventoryErrors).toEqual([]);
    expect(outcome.passed, JSON.stringify(outcome.result?.verdict, null, 2)).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    expect(outcome.result?.verdict.missingRequired).toEqual([]);
    expect(outcome.result?.verdict.unexpectedExcluded).toEqual([]);
  });
});

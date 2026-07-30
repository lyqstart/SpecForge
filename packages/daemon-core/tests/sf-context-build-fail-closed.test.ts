import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextBuildError } from '../src/tools/lib/sf_context_build_core.js';

describe('sf_context_build fail-closed behavior', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'sf-ctx-fail-'));
    await mkdir(path.join(baseDir, '.specforge'), { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('ContextBuildError has correct name and code', () => {
    const err = new ContextBuildError('TEST_CODE', 'test message');
    expect(err.name).toBe('ContextBuildError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('throws CONTEXT_INCOMPLETE when no fragments collected', async () => {
    const { buildTaskContext } = await import('../src/tools/lib/sf_context_build_core.js');
    await expect(
      buildTaskContext(
        { work_item_id: 'WI-NONEXIST' },
        [],
        baseDir
      )
    ).rejects.toMatchObject({ code: 'CONTEXT_INCOMPLETE', name: 'ContextBuildError' });
  });
});

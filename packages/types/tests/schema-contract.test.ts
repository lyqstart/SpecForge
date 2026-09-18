import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  precheckSchemaDescriptors,
  type PersistentFileSchemaDescriptor,
} from '../src/schema-contract';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-schema-contract-'));
  roots.push(root);
  return root;
}

function descriptor(overrides: Partial<PersistentFileSchemaDescriptor> = {}): PersistentFileSchemaDescriptor {
  return {
    id: 'current-document',
    owner: '@specforge/test-owner',
    relativePath: 'document.json',
    format: 'json',
    required: true,
    currentSchemaId: '1.0',
    validateCurrent: (value) => (
      typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && (value as Record<string, unknown>).kind === 'current'
    ),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('current persistent schema contract', () => {
  it('accepts only the declared current schema', async () => {
    const root = await createRoot();
    await writeFile(
      join(root, 'document.json'),
      JSON.stringify({ schema_version: '1.0', kind: 'current' }),
    );

    const result = await precheckSchemaDescriptors(root, [descriptor()]);

    expect(result).toEqual({
      ok: true,
      checks: [
        expect.objectContaining({
          descriptorId: 'current-document',
          status: 'current',
          observedSchemaId: '1.0',
          currentSchemaId: '1.0',
        }),
      ],
    });
    expect(result).not.toHaveProperty('needsMigration');
  });

  it('fails closed on an older or unknown schema without a migration state', async () => {
    const root = await createRoot();
    await writeFile(
      join(root, 'document.json'),
      JSON.stringify({ schema_version: '0.9', kind: 'current' }),
    );

    const result = await precheckSchemaDescriptors(root, [descriptor()]);

    expect(result.ok).toBe(false);
    expect(result.checks[0]).toEqual(expect.objectContaining({
      status: 'blocked',
      errorCode: 'SCHEMA_VERSION_MISMATCH',
      observedSchemaId: '0.9',
      currentSchemaId: '1.0',
    }));
    expect(JSON.stringify(result)).not.toContain('migration_required');
    expect(JSON.stringify(result)).not.toContain('CHAIN_GAP');
  });

  it('distinguishes missing optional files from malformed current files', async () => {
    const root = await createRoot();

    const optional = await precheckSchemaDescriptors(root, [
      descriptor({ id: 'optional', required: false }),
    ]);
    expect(optional.ok).toBe(true);
    expect(optional.checks[0]?.status).toBe('missing_optional');

    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'document.json'), '{bad-json');
    const malformed = await precheckSchemaDescriptors(root, [descriptor()]);
    expect(malformed.ok).toBe(false);
    expect(malformed.checks[0]?.errorCode).toBe('FILE_PARSE_FAILED');
  });

  it('rejects descriptor paths that escape the supplied owner root', async () => {
    const root = await createRoot();
    const result = await precheckSchemaDescriptors(root, [
      descriptor({ relativePath: '../outside.json' }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.checks[0]?.errorCode).toBe('PATH_OUTSIDE_ROOT');
  });
});

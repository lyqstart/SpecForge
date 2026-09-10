import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAtomicSpecMergeWriteProvenanceSchemaDescriptor,
  createGitGovernanceWriteProvenanceSchemaDescriptor,
  precheckSchemaDescriptors,
} from '../src';

describe('control-plane write provenance schema descriptors', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('uses exact current schemas and exposes no legacy transitions', () => {
    const atomic = createAtomicSpecMergeWriteProvenanceSchemaDescriptor();
    const git = createGitGovernanceWriteProvenanceSchemaDescriptor();
    expect(atomic.currentSchemaId).toBe('atomic_spec_merge_controlled_writes.v1');
    expect(git.currentSchemaId).toBe('git_governance_controlled_writes.v1');
    expect(atomic.transitions).toEqual([]);
    expect(git.transitions).toEqual([]);
  });

  for (const descriptor of [
    createAtomicSpecMergeWriteProvenanceSchemaDescriptor(),
    createGitGovernanceWriteProvenanceSchemaDescriptor(),
  ]) {
    it(`fails unknown ${descriptor.id} schema without changing source bytes`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'sf-provenance-descriptor-'));
      roots.push(root);
      const filePath = path.join(root, descriptor.relativePath);
      const bytes = '{"schema_version":"unknown.v9","writes":[]}\n';
      await writeFile(filePath, bytes, 'utf8');

      const result = await precheckSchemaDescriptors(root, [descriptor]);

      expect(result.ok).toBe(false);
      expect(result.checks[0]?.errorCode).toBe('CHAIN_GAP');
      expect(await readFile(filePath, 'utf8')).toBe(bytes);
    });
  }
});

import { describe, expect, test } from 'vitest';
import { normalizeImpactScope, resolveModuleOwnershipFromManifest } from './project-governance-v2.js';

describe('project governance v2', () => {
  test('normalizes Impact Scope deterministically', () => {
    expect(normalizeImpactScope({ affected_modules: ['SYNC','SYNC'], architecture_refs: ['ARCH-FILE-001'] })).toEqual({
      affected_modules: ['SYNC'],
      architecture_refs: ['ARCH-FILE-001'],
      data_model_refs: [],
      design_refs: [],
      project_contract_refs: [],
      module_contract_refs: [],
      planned_code_paths: [],
    });
  });

  test('code_paths establish unique Module ownership', () => {
    const manifest = { modules: [
      { module_code: 'SYNC', code_paths: ['packages/sync/**'] },
      { module_code: 'CORE', code_paths: ['packages/core/**'] },
    ]};
    expect(resolveModuleOwnershipFromManifest(manifest, 'packages/sync/a.ts')).toEqual(['SYNC']);
    expect(resolveModuleOwnershipFromManifest(manifest, 'packages/other/a.ts')).toEqual([]);
  });

  test('ambiguous code ownership is visible and never guessed', () => {
    const manifest = { modules: [
      { module_code: 'SYNC', code_paths: ['packages/**'] },
      { module_code: 'CORE', code_paths: ['packages/core/**'] },
    ]};
    expect(resolveModuleOwnershipFromManifest(manifest, 'packages/core/a.ts')).toEqual(['CORE','SYNC']);
  });
});

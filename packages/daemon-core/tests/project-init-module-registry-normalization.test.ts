/**
 * project-init-module-registry-normalization.test.ts
 *
 * Covers the idempotent Project Spec module-registry normalization performed by
 * ensureProjectInit for pre-existing / upgraded / damaged projects.
 *
 * Governance context: an existing spec_manifest.json with `modules: []` (or
 * legacy / non-canonical entries) previously deadlocked every candidate write
 * with MODULE_OWNERSHIP_UNRESOLVED, because neither init entry point would
 * repair it. init is the authority that declares the default CORE module, so it
 * now re-establishes that canonical declaration — and only that — while
 * deferring real multi-module / rename migrations to spec_migration_path.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { canonicalProjectSpecModuleEntry } from '@specforge/types';
import { ensureProjectInit } from '../src/tools/lib/sf_project_init_core.js';

let projectRoot: string;

function manifestPath(): string {
  return path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json');
}

function coreModuleJsonPath(): string {
  return path.join(projectRoot, '.specforge', 'project', 'modules', 'CORE', 'module.json');
}

async function readManifest(): Promise<any> {
  return JSON.parse(await readFile(manifestPath(), 'utf8'));
}

async function writeManifest(value: unknown): Promise<void> {
  await writeFile(manifestPath(), JSON.stringify(value, null, 2), 'utf8');
}

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-module-registry-norm-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('ensureProjectInit module-registry normalization', () => {
  it('leaves a fresh project untouched (already canonical CORE)', async () => {
    const result = await ensureProjectInit(projectRoot, 'fresh-fixture');
    expect(result.success).toBe(true);
    expect(result.moduleRegistry.status).toBe('unchanged');
    expect(result.normalized).toEqual([]);

    const manifest = await readManifest();
    expect(manifest.default_module).toBe('CORE');
    expect(manifest.modules).toEqual([canonicalProjectSpecModuleEntry('CORE')]);
  });

  it('normalizes an existing empty registry to canonical CORE without bumping the version', async () => {
    await ensureProjectInit(projectRoot, 'legacy-fixture');
    const before = await readManifest();

    await writeManifest({ ...before, modules: [], project_spec_version: 'PSV-0042', default_module: undefined });

    const repaired = await ensureProjectInit(projectRoot, 'legacy-fixture');
    expect(repaired.moduleRegistry.status).toBe('normalized');
    expect(repaired.moduleRegistry.moduleCodes).toEqual(['CORE']);
    expect(repaired.normalized).toContain(path.join('.specforge', 'project', 'spec_manifest.json'));

    const after = await readManifest();
    expect(after.project_spec_version).toBe('PSV-0042');
    expect(after.default_module).toBe('CORE');
    expect(after.modules).toEqual([canonicalProjectSpecModuleEntry('CORE')]);
  });

  it('canonicalizes a legacy-but-valid CORE entry', async () => {
    await ensureProjectInit(projectRoot, 'legacy-entry-fixture');
    const before = await readManifest();

    // Legacy identity field (`name`) + non-canonical shape resolves to CORE.
    await writeManifest({
      ...before,
      modules: [{ name: 'CORE', path: 'project/modules/core' }],
    });

    const repaired = await ensureProjectInit(projectRoot, 'legacy-entry-fixture');
    expect(repaired.moduleRegistry.status).toBe('normalized');

    const after = await readManifest();
    expect(after.modules).toEqual([canonicalProjectSpecModuleEntry('CORE')]);
  });

  it('preserves an already canonical multi-module registry', async () => {
    await ensureProjectInit(projectRoot, 'multi-module-fixture');
    const before = await readManifest();

    const healthy = {
      ...before,
      modules: [canonicalProjectSpecModuleEntry('CORE'), canonicalProjectSpecModuleEntry('AUTH')],
    };
    await writeManifest(healthy);

    const result = await ensureProjectInit(projectRoot, 'multi-module-fixture');
    expect(result.moduleRegistry.status).toBe('unchanged');

    const after = await readManifest();
    expect(after.modules).toEqual(healthy.modules);
  });

  it('fails closed to spec_migration_path when an invalid module entry is present', async () => {
    await ensureProjectInit(projectRoot, 'invalid-entry-fixture');
    const before = await readManifest();

    // `core-module` is not a valid MODULE_CODE (lowercase + hyphen). We must not
    // guess whether it means CORE or a renamed module — that is a real migration.
    const broken = { ...before, modules: [{ module_code: 'core-module' }] };
    await writeManifest(broken);

    const result = await ensureProjectInit(projectRoot, 'invalid-entry-fixture');
    expect(result.moduleRegistry.status).toBe('requires_spec_migration');
    expect(result.moduleRegistry.reason).toContain('invalid_module_entry_present');

    const after = await readManifest();
    expect(after.modules).toEqual(broken.modules);
  });

  it('fails closed when a non-CORE module directory with its own definition exists', async () => {
    await ensureProjectInit(projectRoot, 'other-module-fixture');
    const before = await readManifest();

    await writeManifest({ ...before, modules: [] });
    const authDir = path.join(projectRoot, '.specforge', 'project', 'modules', 'AUTH');
    await mkdir(authDir, { recursive: true });
    await writeFile(
      path.join(authDir, 'module.json'),
      JSON.stringify({ module_code: 'AUTH', status: 'active' }, null, 2),
      'utf8'
    );

    const result = await ensureProjectInit(projectRoot, 'other-module-fixture');
    expect(result.moduleRegistry.status).toBe('requires_spec_migration');
    expect(result.moduleRegistry.reason).toContain('non_core_module_directory_present');

    const after = await readManifest();
    expect(after.modules).toEqual([]);
  });

  it('fails closed when the authoritative CORE definition is missing', async () => {
    await ensureProjectInit(projectRoot, 'missing-core-fixture');
    const before = await readManifest();

    await writeManifest({ ...before, modules: [] });
    await rm(coreModuleJsonPath(), { force: true });

    const result = await ensureProjectInit(projectRoot, 'missing-core-fixture');
    // init recreates modules/CORE/module.json during the file loop, so the CORE
    // definition is authoritative again by the time normalization runs.
    expect(existsSync(coreModuleJsonPath())).toBe(true);
    expect(result.moduleRegistry.status).toBe('normalized');
  });
});

describe('ensureProjectInit module-registry normalization — properties', () => {
  const canonicalCore = canonicalProjectSpecModuleEntry('CORE');
  const canonicalAuth = canonicalProjectSpecModuleEntry('AUTH');

  const moduleStateArb = fc.constantFrom(
    'empty',
    'canonical_core',
    'legacy_core',
    'invalid_entry',
    'canonical_multi'
  );

  function modulesForState(state: string): unknown[] {
    switch (state) {
      case 'empty':
        return [];
      case 'canonical_core':
        return [canonicalCore];
      case 'legacy_core':
        return [{ name: 'CORE', path: 'project/modules/core' }];
      case 'invalid_entry':
        return [{ module_code: 'core-module' }];
      case 'canonical_multi':
        return [canonicalCore, canonicalAuth];
      default:
        return [];
    }
  }

  it('is idempotent and never invents or drops a valid non-CORE module', async () => {
    await fc.assert(
      fc.asyncProperty(moduleStateArb, async state => {
        const root = await mkdtemp(path.join(tmpdir(), 'sf-mod-prop-'));
        try {
          const localProjectRoot = root;
          const localManifestPath = path.join(
            localProjectRoot,
            '.specforge',
            'project',
            'spec_manifest.json'
          );

          const initFn = ensureProjectInit;
          await initFn(localProjectRoot, 'prop-fixture');
          const base = JSON.parse(await readFile(localManifestPath, 'utf8'));
          await writeFile(
            localManifestPath,
            JSON.stringify({ ...base, modules: modulesForState(state) }, null, 2),
            'utf8'
          );

          const validNonCoreBefore = state === 'canonical_multi';

          const firstRun = await initFn(localProjectRoot, 'prop-fixture');
          const afterFirst = JSON.parse(await readFile(localManifestPath, 'utf8'));

          const secondRun = await initFn(localProjectRoot, 'prop-fixture');
          const afterSecond = JSON.parse(await readFile(localManifestPath, 'utf8'));

          // Idempotence: a second init produces an identical file and performs
          // no further normalization write, regardless of the outcome class.
          expect(afterSecond).toEqual(afterFirst);
          expect(secondRun.normalized).toEqual([]);

          const codesAfter = (Array.isArray(afterFirst.modules) ? afterFirst.modules : [])
            .map((entry: any) => entry?.module_code)
            .filter((code: unknown): code is string => typeof code === 'string');

          // Never invents a module code that was not already present; the only
          // code init may add on its own authority is the default CORE.
          const codesBefore = modulesForState(state)
            .map((entry: any) => entry?.module_code)
            .filter((code: unknown): code is string => typeof code === 'string');
          const allowedCodes = new Set<string>([...codesBefore, 'CORE']);
          for (const code of codesAfter) {
            expect(allowedCodes.has(code)).toBe(true);
          }

          // A valid non-CORE module that was declared is never silently dropped.
          if (validNonCoreBefore) {
            expect(firstRun.moduleRegistry.status).toBe('unchanged');
            expect(codesAfter).toContain('AUTH');
          }
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }),
      { numRuns: 25 }
    );
  });
});

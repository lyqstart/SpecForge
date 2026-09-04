import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('current Scope Gate release boundary', () => {
  it('exports release/build validation only', async () => {
    const index = await readFile(resolve(packageRoot, 'src/index.ts'), 'utf8');

    expect(index).toContain("export { ReleaseSetValidator }");
    expect(index).toContain("export { runScopeReleasePrecheck }");
    expect(index).not.toMatch(/FeatureFlagManager|RuntimeScopeChecker|ScopeRegistry|AuditLogger/);
  });

  it('does not ship runtime scope CLIs', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(manifest).not.toHaveProperty('bin');
    expect(manifest.description).toContain('release');
  });
});

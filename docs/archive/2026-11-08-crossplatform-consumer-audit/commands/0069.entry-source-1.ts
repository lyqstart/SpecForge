import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAcceptedConfigSync } from '../src/accepted-config';
import { loadRuntimeConfig } from '../src/config-loader';
import { createConfigAccess } from '../src/config-access';
import { logger } from '../src/logger';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sf-config-accept-')); roots.push(root);
  const userRoot = join(root, 'user'); const projectPath = join(root, 'project');
  mkdirSync(join(userRoot, 'config'), { recursive: true });
  mkdirSync(join(projectPath, '.specforge/config'), { recursive: true });
  writeFileSync(join(projectPath, '.specforge/config/project.json'), '{}');
  return { userRoot, projectPath, env: {} };
}
describe('production configuration acceptance', () => {
  it('applies four layers, deep objects and replacement arrays', () => {
    const options = fixture();
    writeFileSync(join(options.userRoot, 'config/config.json'), JSON.stringify({ timeoutMs: 101, hotReload: { watchPaths: ['a'], debounceMs: 20 } }));
    writeFileSync(join(options.projectPath, '.specforge/config/project.json'), JSON.stringify({ timeoutMs: 202, hotReload: { watchPaths: ['b'] } }));
    const result = loadAcceptedConfigSync({ ...options, runtime: { timeoutMs: 303 } });
    expect(result.merged.timeoutMs).toBe(303);
    expect(result.merged.hotReload).toMatchObject({ watchPaths: ['b'], debounceMs: 20 });
  });
  it('permits absent optional user settings but rejects corrupt settings', () => {
    const options = fixture(); expect(loadAcceptedConfigSync(options).merged.timeoutMs).toBe(30000);
    writeFileSync(join(options.userRoot, 'config/config.json'), '{bad');
    expect(() => loadAcceptedConfigSync(options)).toThrow('CONFIGURATION_INVALID_OBJECT');
  });
  it.each([{ tokens: { key: 'secret' } }, { schema_version: '999' }, { service_management: { stop_timeout_sec: -1 } }])('rejects invalid project settings %j', data => {
    const options = fixture(); writeFileSync(join(options.projectPath, '.specforge/config/project.json'), JSON.stringify(data));
    expect(() => loadAcceptedConfigSync(options)).toThrow(/CONFIGURATION_/);
  });
  it('never emits values in configuration logs', () => {
    const output: unknown[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation((...args) => { output.push(args); });
    loadRuntimeConfig({ cliArgs: { innocentlyNamedField: 'SYNTHETIC_SECRET' } });
    const config = loadAcceptedConfigSync({ ...fixture(), runtime: { tokens: { key: 'SYNTHETIC_SECRET' } } });
    createConfigAccess(config).get('tokens.key');
    logger.error('invalid input', { schemaVersion: 'SYNTHETIC_SECRET', SYNTHETIC_SECRET: 'hidden', layer: 'SYNTHETIC_SECRET' });
    expect(JSON.stringify(output)).not.toContain('SYNTHETIC_SECRET');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { PersonalPathResolver, EnterprisePathResolver } from '../../src/daemon/path-resolver';
import { ToolDispatcher } from '../../src/tools';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture(mode = 'personal') {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'sf-activation-loss-')); roots.push(root);
  vi.stubEnv('OPENCODE_CONFIG_DIR', path.join(root, 'user'));
  vi.stubEnv('SPECFORGE_CONFIG_OVERRIDES', '');
  const file = path.join(root, '.specforge/config/project.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (timeoutMs: number) => fs.writeFileSync(file, JSON.stringify({ schema_version: '1.0', timeoutMs }));
  write(2000);
  const resolver = mode === 'personal' ? new PersonalPathResolver() : new EnterprisePathResolver();
  const create = () => new ProjectManager(new EventBus(), resolver, undefined as any);
  return { root, file, write, create, resolver, activation: path.join(resolver.resolveProjectRuntimeDir(root), 'configuration-activation.json') };
}

describe('missing configuration activation at the actual consumer', () => {
  for (const mode of ['personal', 'enterprise']) {
    for (const restart of [false, true]) {
      it.each([2000, 10000])(`${mode}, recreated=${restart}: rejects missing record with active work and timeout %i`, async timeout => {
        const f = fixture(mode); const original = f.create();
        await original.getProjectConfiguration(f.root);
        const accepted = fs.readFileSync(f.activation);
        const state = await original.getProjectStateManager(f.root);
        await state.transition('WI-0001', '', 'created');
        const events = fs.readFileSync(f.resolver.resolveEventsPath(f.root));
        fs.unlinkSync(f.activation); f.write(timeout);
        const consumer = restart ? f.create() : original;
        for (let attempt = 0; attempt < 2; attempt++) {
          await expect(consumer.getProjectConfiguration(f.root)).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
          expect(fs.existsSync(f.activation)).toBe(false);
        }
        expect(fs.readFileSync(f.resolver.resolveEventsPath(f.root))).toEqual(events);
        expect(JSON.parse(fs.readFileSync(f.file, 'utf8')).timeoutMs).toBe(timeout);
        // Isolated fixture recovery: put back the exact previously captured evidence.
        // This is not a product recovery API or permission to fabricate a new identity.
        fs.writeFileSync(f.activation, accepted); f.write(2000);
        expect((await consumer.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
        expect(fs.readFileSync(f.activation)).toEqual(accepted);
      });
    }
  }

  it('accepts first use and changed configuration without active work, including recreation', async () => {
    const f = fixture();
    expect((await f.create().getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
    fs.unlinkSync(f.activation); f.write(10000);
    expect((await f.create().getProjectConfiguration(f.root)).merged.timeoutMs).toBe(10000);
    expect(fs.existsSync(f.activation)).toBe(true);
  });

  it('reads unchanged accepted configuration during active work without rewriting its identity', async () => {
    const f = fixture(); const manager = f.create();
    await manager.getProjectConfiguration(f.root);
    const state = await manager.getProjectStateManager(f.root);
    await state.transition('WI-0001', '', 'created');
    const original = fs.readFileSync(f.activation);
    for (const reader of [manager, f.create()]) {
      expect((await reader.getProjectConfiguration(f.root)).merged.timeoutMs).toBe(2000);
      expect(fs.readFileSync(f.activation)).toEqual(original);
    }
  });

  it.each(['closed', 'rejected', 'superseded'])('allows missing-record acceptance when all events are terminal (%s)', async terminal => {
    const f = fixture(); const manager = f.create();
    await manager.getProjectConfiguration(f.root);
    const state = await manager.getProjectStateManager(f.root);
    // StateManager event fixture, not an invocation of a business Close/Gate workflow.
    await state.transition('WI-0001', '', 'created');
    await state.transition('WI-0001', 'created', terminal);
    fs.unlinkSync(f.activation); f.write(10000);
    expect((await f.create().getProjectConfiguration(f.root)).merged.timeoutMs).toBe(10000);
  });

  it('does not trust a stale empty state projection when activation is missing', async () => {
    const f = fixture(); const manager = f.create();
    await manager.getProjectConfiguration(f.root);
    const state = await manager.getProjectStateManager(f.root);
    await state.transition('WI-0001', '', 'created');
    const projection = JSON.parse(fs.readFileSync(f.resolver.resolveStatePath(f.root), 'utf8'));
    projection.workItems = [];
    fs.writeFileSync(f.resolver.resolveStatePath(f.root), JSON.stringify(projection));
    fs.unlinkSync(f.activation);
    await expect(f.create().getProjectConfiguration(f.root)).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    expect(fs.existsSync(f.activation)).toBe(false);
  });

  it('blocks ordinary dispatch and native writes before consumers can execute', async () => {
    const f = fixture(); const manager = f.create();
    await manager.getProjectConfiguration(f.root);
    const state = await manager.getProjectStateManager(f.root);
    await state.transition('WI-0001', '', 'created');
    fs.unlinkSync(f.activation); f.write(10000);
    const deps = { projectManager: manager } as any;
    const result: any = await new ToolDispatcher(deps).dispatch({ tool: 'sf_state_read', args: { work_item_id: 'all' }, context: { directory: f.root } });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    await expect(checkNativeTool(deps, f.root, 'write', { filePath: path.join(f.root, 'must-not-exist.txt') })).rejects.toThrow('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    expect(fs.existsSync(f.activation)).toBe(false);
    expect(fs.existsSync(path.join(f.root, 'must-not-exist.txt'))).toBe(false);
  });

  it('rejects missing activation after actual process exit and fresh process startup', () => {
    const f = fixture();
    const bun = process.env.npm_execpath;
    expect(bun).toMatch(/bun(?:\.exe)?$/i);
    const script = fileURLToPath(new URL('../fixtures/configuration-activation-process.ts', import.meta.url));
    const run = (action: string) => {
      const child = spawnSync(bun!, [script, f.root, action], { encoding: 'utf8', windowsHide: true });
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      const line = child.stdout.split(/\r?\n/).find(line => line.startsWith('ACTIVATION_RESULT='));
      expect(line).toBeDefined();
      console.log(line);
      return JSON.parse(line!.slice('ACTIVATION_RESULT='.length));
    };
    const first = run('initialize-active');
    expect(first.timeoutMs).toBe(2000);
    fs.unlinkSync(f.activation); f.write(10000);
    const restarted = run('read');
    expect(restarted.pid).not.toBe(first.pid);
    expect(restarted.error).toContain('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
    expect(restarted.activationExists).toBe(false);
    expect(restarted.states).toEqual(['created']);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { captureVerificationSource, readFrozenVerificationInputs } from '../../src/verification/source-snapshot';
import { collectNodeCommandInputs, compileNodeCommand } from '../../src/verification/node-command-contract';

const roots: string[] = [];
const git = (root: string, args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), ...args], {
  cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-verification-source-test-'));
  roots.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  await fs.writeFile(path.join(root, 'library.ts'), 'export const value = 1;\n');
  git(root, ['add', 'library.ts']);
  git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@localhost.invalid', 'commit', '-q', '-m', 'synthetic baseline']);
  const sourceEnvironment:NodeJS.ProcessEnv={};
  for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','PATHEXT','SYSTEMDRIVE'])if(process.env[key]!==undefined)sourceEnvironment[key]=process.env[key];
  Object.assign(sourceEnvironment,{GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'});
  const probe=(args:string[],env:NodeJS.ProcessEnv)=>{
    const result=spawnSync('git',['--no-pager','-c','core.fsmonitor=false','-c','protocol.allow=never','-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'-c','gc.auto=0',...args],{cwd:root,env,encoding:'utf8',windowsHide:true,maxBuffer:65536});
    return {exit:result.status,stdout:result.stdout,stderr:result.stderr,spawn_error_code:(result.error as NodeJS.ErrnoException|undefined)?.code};
  };
  console.log('QUALIFICATION_GIT_IDENTITY='+JSON.stringify({platform:process.platform,root,canonical:await fs.realpath(root),metadata_directory:(await fs.lstat(path.join(root,'.git'))).isDirectory(),plain:{top:probe(['rev-parse','--show-toplevel'],process.env),common:probe(['rev-parse','--git-common-dir'],process.env)},source_reader_environment:{top:probe(['rev-parse','--show-toplevel'],sourceEnvironment),common:probe(['rev-parse','--git-common-dir'],sourceEnvironment)}}));
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('sf-verification-source-test-')) throw new Error('UNSAFE_FIXTURE_CLEANUP');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

describe('verification raw source and Git identity', () => {
  it('records a bounded stage for a failed Git read without logging the project path', async () => {
    const root=await fixture();git(root,['switch','--detach','HEAD']);
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{
      await expect(captureVerificationSource(root)).rejects.toThrow();
      const diagnostic=log.mock.calls.map(row=>JSON.parse(String(row[0]))).find(v=>v.stage==='source_git_read');
      expect(diagnostic.git_operation).toBe('symbolic-ref');expect(JSON.stringify(diagnostic)).not.toContain(root);
    }finally{log.mockRestore();}
  });
  it('captures current raw input and rejects a changed source without invoking clean filters', async () => {
    const root = await fixture();
    const first = await captureVerificationSource(root);
    expect(first.files.map(f => f.path)).toEqual(['library.ts']);
    expect((await readFrozenVerificationInputs(first)).get('library.ts')?.toString()).toContain('value = 1');
    await fs.writeFile(path.join(root, 'library.ts'), 'export const value = 2;\n');
    await expect(readFrozenVerificationInputs(first)).rejects.toThrow('SOURCE_CHANGED');
    expect((await captureVerificationSource(root)).identity).not.toBe(first.identity);
  });

  it('rejects undeclared untracked code and hardlinked tracked input', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'undeclared.ts'), 'export {};');
    await expect(captureVerificationSource(root)).rejects.toThrow('UNTRACKED_INPUT');
    await fs.unlink(path.join(root, 'undeclared.ts'));
    await fs.link(path.join(root, 'library.ts'), path.join(root, '.git', 'owned-hardlink-fixture'));
    await expect(captureVerificationSource(root)).rejects.toThrow('HARDLINK_FORBIDDEN');
  });

  it('binds branch, index and repository configuration', async () => {
    const root = await fixture(), first = await captureVerificationSource(root);
    git(root, ['branch', 'codex/other']);
    git(root, ['switch', '-q', 'codex/other']);
    expect((await captureVerificationSource(root)).identity).not.toBe(first.identity);
    const current = await captureVerificationSource(root);
    git(root, ['config', '--local', 'filter.synthetic.clean', 'MUST_NOT_EXECUTE']);
    expect((await captureVerificationSource(root)).configSha256).not.toBe(current.configSha256);
  });

  it('freezes only reachable code and package metadata, without reading unrelated tracked files', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'test.mjs'), 'import { test } from "node:test"; import assert from "node:assert/strict"; import {value} from "./library.ts"; test("value",()=>assert.equal(value,1));');
    await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    await fs.writeFile(path.join(root, 'private.env'), 'SYNTHETIC_SECRET_NOT_AN_INPUT=1');
    git(root, ['add', 'test.mjs', 'package.json', 'private.env']);
    // A hardlink makes any attempted content read fail in the production reader.
    await fs.link(path.join(root, 'private.env'), path.join(root, '.git', 'private-alias'));
    const inventory = await captureVerificationSource(root, []);
    expect(inventory.files).toEqual([]);
    const selected = await collectNodeCommandInputs(root, 'node --test test.mjs', inventory.trackedPaths);
    expect(selected.inputPaths).toEqual(['library.ts', 'package.json', 'test.mjs']);
    expect(compileNodeCommand('node --test test.mjs', selected.sources).kind).toBe('node-test-file');
    const frozen = await captureVerificationSource(root, selected.inputPaths);
    expect([...((await readFrozenVerificationInputs(frozen)).keys())]).toEqual(selected.inputPaths);
    await expect(captureVerificationSource(root)).rejects.toThrow('HARDLINK_FORBIDDEN');
  });
});

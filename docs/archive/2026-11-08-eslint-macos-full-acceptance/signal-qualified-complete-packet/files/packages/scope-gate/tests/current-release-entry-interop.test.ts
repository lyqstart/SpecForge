import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';
import path from 'node:path';

import {describe,it,expect} from 'vitest';

describe('public release entry module interoperability',()=>{
 it('initializes every declared foundation entry before real built CJS configuration consumers',()=>{
  const bun=process.env.npm_execpath;if(!bun||!/^bun(?:\.exe)?$/i.test(path.basename(bun)))throw Error('TEST_REQUIRES_INVOKING_BUN');
  const repository=path.resolve(import.meta.dirname,'../../..');
  const program=`const {initializeSharedRuntimeExports}=await import('./scripts/lib/prepare-current-release.ts'); const entries=await initializeSharedRuntimeExports(process.cwd()); if(!entries.includes('./dist/user-level-paths.js'))throw Error('USER_LEVEL_PATH_OWNER_NOT_INITIALIZED'); await import('./packages/configuration/dist/index.js'); console.log(JSON.stringify({initialized:entries,cjs_configuration_loaded:true}));`;
  const result=spawnSync(bun,['--eval',program],{cwd:repository,env:process.env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
  expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);
  const value=JSON.parse(result.stdout);expect(value.cjs_configuration_loaded).toBe(true);expect(value.initialized).toContain('./dist/user-level-paths.js');
 });
 it('reaches the authoritative missing-root input error through the actual Bun entry',()=>{
  const bun=process.env.npm_execpath;if(!bun||!/^bun(?:\.exe)?$/i.test(path.basename(bun)))throw Error('TEST_REQUIRES_INVOKING_BUN');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-release-entry-'));
  try{
   const entry=path.resolve(import.meta.dirname,'../../../scripts/prepare-current-release.ts');
   const result=spawnSync(bun,[entry],{cwd:root,env:{...process.env,OPENCODE_CONFIG_DIR:path.join(root,'opencode')},encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
   expect(result.error).toBeUndefined();expect(result.status).toBe(1);
   expect(result.stderr).toContain('ENOENT');expect(result.stderr).not.toContain('require() async module');
   expect(fs.readdirSync(root)).toEqual([]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});

import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';

describe('public release entry module interoperability',()=>{
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

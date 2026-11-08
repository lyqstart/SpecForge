import fs from 'node:fs';import os from 'node:os';
import path from 'node:path';

import {describe,it,expect} from 'vitest';

import {cleanPackageBuild} from '../../../scripts/clean-workspace';
describe('current workspace clean ownership',()=>{
 it('removes only a current package build directory and retains source and unrelated data',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-clean-boundary-'));try{fs.mkdirSync(path.join(root,'packages/cli/dist'),{recursive:true});fs.writeFileSync(path.join(root,'packages/cli/dist/build.js'),'synthetic');fs.writeFileSync(path.join(root,'packages/cli/source.ts'),'source');fs.mkdirSync(path.join(root,'private'));expect(cleanPackageBuild(root,'cli')).toBe(true);expect(cleanPackageBuild(root,'cli')).toBe(false);expect(fs.readFileSync(path.join(root,'packages/cli/source.ts'),'utf8')).toBe('source');expect(fs.existsSync(path.join(root,'private'))).toBe(true);expect(()=>cleanPackageBuild(root,'../private')).toThrow('CLEAN_PACKAGE_NOT_CURRENT');}finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('rejects a directory link and never deletes its external target',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-clean-link-'));try{fs.mkdirSync(path.join(root,'packages/cli'),{recursive:true});fs.mkdirSync(path.join(root,'external'));fs.writeFileSync(path.join(root,'external/sentinel'),'keep');fs.symlinkSync(path.join(root,'external'),path.join(root,'packages/cli/dist'),process.platform==='win32'?'junction':'dir');expect(()=>cleanPackageBuild(root,'cli')).toThrow('CLEAN_BUILD_LINK_OR_NON_DIRECTORY_REFUSED');expect(fs.readFileSync(path.join(root,'external/sentinel'),'utf8')).toBe('keep');}finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});

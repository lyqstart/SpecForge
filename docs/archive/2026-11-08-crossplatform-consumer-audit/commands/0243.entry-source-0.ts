import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import * as source from '../../src/tools/lib/sf_knowledge_base_core';
import * as installed from '../../../../setup/userlevel-opencode/tools/lib/sf_knowledge_base_core';
vi.mock('../../src/tools/lib/utils',()=>({logErrorToFile:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../../../../setup/userlevel-opencode/tools/lib/utils',()=>({logErrorToFile:vi.fn().mockResolvedValue(undefined)}));
describe.each(Object.entries({source,installed}))('current knowledge store owner: %s',(_name,owner)=>{
 let root:string,file:string;
 const valid=()=>({version:'1.0' as const,categories:[],entries:[],metadata:{total_entries:0,last_updated:new Date().toISOString()}});
 beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-knowledge-owner-'));file=path.join(root,'insights.json');vi.stubEnv('SF_KNOWLEDGE_STORE_DIR',root);});
 afterEach(async()=>{vi.unstubAllEnvs();await fs.rm(root,{recursive:true,force:true});});
 it('creates the existing1.0 format and preserves legal CRUD',async()=>{
  const store=await owner.loadStore();expect(store.version).toBe('1.0');expect(store.entries).toEqual([]);
  const added=await owner.addEntry({title:'Owned synthetic knowledge',content:'Verified example',category:'workflow_tip',tags:[],applicable_file_patterns:[],confidence:'medium',source_project:'fixture',source_work_item:'WI-0001',anti_conditions:[],applicability:'synthetic only',normalized_key:'workflow_tip:owned-example'});
  expect(added.success).toBe(true);expect((await owner.loadStore()).entries).toHaveLength(1);
  expect((await owner.updateEntry({entry_id:added.entry_id!,title:'Updated synthetic knowledge'})).success).toBe(true);
  expect((await owner.removeEntry(added.entry_id!)).success).toBe(true);expect((await owner.loadStore()).entries).toEqual([]);
 });
 it.each(['9.0',undefined,1])('preserves unsupported version %s on read and on valid replacement',async version=>{
  const bytes=JSON.stringify({...valid(),version});await fs.writeFile(file,bytes);
  await expect(owner.loadStore()).rejects.toThrow('KNOWLEDGE_STORE_SCHEMA_UNSUPPORTED');
  await expect(owner.saveStore(valid())).rejects.toThrow('KNOWLEDGE_STORE_SCHEMA_UNSUPPORTED');
  expect(await fs.readFile(file,'utf8')).toBe(bytes);expect(await fs.readdir(root)).toEqual(['insights.json']);
 });
 it.each(['{broken','null','[]','{"version":"1.0","entries":[],"categories":[],"metadata":{}}'])('preserves corrupt or incomplete storage: %s',async bytes=>{
  await fs.writeFile(file,bytes);await expect(owner.loadStore()).rejects.toThrow();await expect(owner.saveStore(valid())).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toBe(bytes);expect(await fs.readdir(root)).toEqual(['insights.json']);
 });
 it('rejects an invalid new value before creating files or changing input',async()=>{
  const candidate={...valid(),version:'9.0'},before=JSON.stringify(candidate);await expect(owner.saveStore(candidate as any)).rejects.toThrow('KNOWLEDGE_STORE_SCHEMA_UNSUPPORTED');expect(JSON.stringify(candidate)).toBe(before);expect(await fs.readdir(root)).toEqual([]);
 });
 it('requires the source and installed validators to be identical',()=>{
  expect(source.validateKnowledgeStore.toString()).toBe(installed.validateKnowledgeStore.toString());
 });
});

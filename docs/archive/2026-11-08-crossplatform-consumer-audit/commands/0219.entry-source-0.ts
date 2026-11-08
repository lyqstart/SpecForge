import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import '../../src/tools/handlers/sf-artifact-write';
import {getHandler} from '../../src/tools/ToolDispatcher';

describe('Runtime-owned Work Item metadata',()=>{
  it.each(['sf-orchestrator','sf-verifier','sf-executor'])('refuses generic permission and identity replacement by %s without writes',async agent=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-metadata-owner-'));
    const dir=path.join(root,'.specforge/work-items/WI-0001');
    try{
      await fs.mkdir(dir,{recursive:true});
      const original=JSON.stringify({schema_version:'1.1',work_item_id:'WI-0001',workflow_type:'feature_spec',workflow_path:'requirement_change_path',permissions:{code_change_allowed:false},allowed_write_files:[]},null,2)+'\n';
      const file=path.join(dir,'work_item.json');await fs.writeFile(file,original);
      const result:any=await getHandler('sf_artifact_write')!({work_item_id:'WI-0001',file_type:'work_item',content:JSON.stringify({permissions:{code_change_allowed:true},allowed_write_files:['src/escape.ts'],workflow_type:'architecture_change'})},{directory:root,agent},{} as any);
      expect(result.success).toBe(false);expect(result.error).toBe('WORK_ITEM_METADATA_OWNED_BY_RUNTIME');
      expect(await fs.readFile(file,'utf8')).toBe(original);expect(await fs.readdir(dir)).toEqual(['work_item.json']);
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
});

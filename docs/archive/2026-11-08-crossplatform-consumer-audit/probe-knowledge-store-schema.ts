// Self-owned direct storage-owner probe; never opens the user's knowledge store.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import * as source from '../../../packages/daemon-core/src/tools/lib/sf_knowledge_base_core';
import * as installed from '../../../setup/userlevel-opencode/tools/lib/sf_knowledge_base_core';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'sf-knowledge-schema-probe-')),cwd=process.cwd(),prior=process.env.SF_KNOWLEDGE_STORE_DIR,results=[];
process.chdir(base);
try{
 for(const [name,owner] of Object.entries({source,installed})){
  const dir=path.join(base,name);await fs.mkdir(dir);process.env.SF_KNOWLEDGE_STORE_DIR=dir;
  const file=path.join(dir,'insights.json'),valid={version:'1.0',categories:[],entries:[],metadata:{total_entries:0,last_updated:new Date().toISOString()}};
  await fs.writeFile(file,JSON.stringify(valid));assert.deepEqual(await owner.loadStore(),valid);
  for(const version of ['9.0',undefined]){
   const bytes=JSON.stringify({...valid,version});await fs.writeFile(file,bytes);let rejected=false;try{await owner.loadStore();}catch{rejected=true;}
   assert.equal(await fs.readFile(file,'utf8'),bytes);results.push({owner:name,operation:'read',version:version??'<missing>',rejected});
   const before=await fs.readFile(file,'utf8');rejected=false;try{await owner.saveStore({...valid,version} as any);}catch{rejected=true;}
   results.push({owner:name,operation:'write',version:version??'<missing>',rejected,preserved:(await fs.readFile(file,'utf8'))===before});
  }
 }
 console.log(JSON.stringify({fixture:base,results,all_rejected:results.every(r=>r.rejected),original_business_or_global_store_touched:false},null,2));
 assert(results.every(r=>r.rejected),'UNKNOWN_OR_MISSING_KNOWLEDGE_SCHEMA_ACCEPTED');
}finally{process.chdir(cwd);if(prior===undefined)delete process.env.SF_KNOWLEDGE_STORE_DIR;else process.env.SF_KNOWLEDGE_STORE_DIR=prior;/* Preserve owned evidence fixture, including failures. */}

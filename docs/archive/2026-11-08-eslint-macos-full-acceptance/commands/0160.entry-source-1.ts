import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {workItemCandidateRequirements} from '@specforge/types/directory-layout';
import {lintDocument} from '../../src/tools/lib/sf_doc_lint_core';
import '../../src/tools/handlers/sf-doc-lint';import {getHandler} from '../../src/tools/ToolDispatcher';
describe('current document lint authority',()=>{
 it('does not impose historical V6 product acceptance lists on a business Candidate',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-doc-authority-'));try{
   const file=workItemCandidateRequirements(root,'WI-0001','CORE');await fs.mkdir(path.dirname(file),{recursive:true});
   await fs.writeFile(file,'# Requirements\n## Introduction\nThe V6 label belongs to this synthetic business.\n## Glossary\nV6: business label\n## Requirements\n### REQ-27: V6.0 质量门槛\nThe business validates its own requirements.\n');
   const result=await lintDocument('WI-0001','requirements',root);expect(result.status).toBe('pass');expect(result.issues.filter(i=>i.severity==='error')).toEqual([]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it('refuses a retired document type before reading an unowned path',async()=>{
  const result:any=await getHandler('sf_doc_lint')!({work_item_id:'WI-0001',doc_type:'bugfix'},{directory:'nonexistent-unowned-path'},{} as any);expect(result.error).toBe('UNSUPPORTED_CURRENT_DOCUMENT_TYPE');
 });
});

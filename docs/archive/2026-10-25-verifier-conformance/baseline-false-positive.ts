import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureImplementationBaseline, validateImplementationTruthBeforeSeal } from '../../../packages/daemon-core/src/tools/lib/implementation-baseline';
const out=import.meta.dir,fixture=fs.mkdtempSync(path.join(os.tmpdir(),'sf-baseline-audit-unit-'));
const id='WI-BASELINE-PROBE',dir=path.join(fixture,'.specforge/work-items',id),candidates=path.join(dir,'candidates');
fs.mkdirSync(candidates,{recursive:true});
fs.writeFileSync(path.join(fixture,'README.md'),'# Existing README\n');
fs.writeFileSync(path.join(dir,'trigger_result.json'),JSON.stringify({impact_scope:{planned_code_paths:['README.md','src/greet.ts','tests/greet.test.ts','package.json','tsconfig.json']}}));
const baseline=await captureImplementationBaseline(fixture,id);
fs.writeFileSync(path.join(dir,'implementation_baseline.json'),JSON.stringify(baseline));
const facts='CORE 模块当前无既有业务源代码、无既有测试、无既有工程配置；README.md 是唯一既有交付文件。';
const cases=[
 {name:'accurate_facts',text:facts},
 {name:'scoped_greenfield_explanation',text:'CORE 模块当前无既有业务源代码、无既有测试、无既有工程配置（greenfield 指本次新建业务实现）；README.md 是唯一既有交付文件。'},
 {name:'quoted_term_not_assertion',text:facts+'\n说明：术语 greenfield 出现在上游描述中；本候选明确承认 README.md 已存在，不能将所有文件视为新建。'}
];
const results=[];
for(const c of cases){const content=`implementation_baseline_id: ${baseline.snapshot_id}\n\n${c.text}\n`;fs.writeFileSync(path.join(candidates,'tasks.md'),content);results.push({...c,content,result:await validateImplementationTruthBeforeSeal({projectRoot:fixture,workItemId:id})});}
const record={utc:new Date().toISOString(),fixture,scope:'Isolated unregistered unit fixture only; no live business project/Runtime state edited. Real source validator, valid binding in every case, same accurate filesystem facts.',baseline,results};
fs.writeFileSync(path.join(out,'baseline-false-positive.json'),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify(results.map(c=>({name:c.name,valid:c.result.valid,errors:c.result.errors}))));
if(!results[0].result.valid)throw Error('CONTROL_FAILED');

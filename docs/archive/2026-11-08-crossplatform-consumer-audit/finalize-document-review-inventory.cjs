const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),root=process.cwd(),out=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=JSON.parse(fs.readFileSync(path.join(out,'document-review-scope.json'))),qualified='docs/archive/2026-11-08-role-alignment/fresh-loader-03',agents=JSON.parse(fs.readFileSync(qualified+'/agents.json')),skills=JSON.parse(fs.readFileSync(qualified+'/skills.json')),base=JSON.parse(fs.readFileSync(qualified+'/base-global.json')),members=[];
for(const d of original.documents){const raw=fs.readFileSync(d.path),record={path:d.path,role:d.classification,bytes:raw.length,sha256:sha(raw),initial_inventory_sha256:d.sha256,changed:sha(raw)!==d.sha256};
 if(d.classification==='CURRENT_AGENT'||d.classification==='CURRENT_SKILL'){
  const name=d.classification==='CURRENT_AGENT'?path.basename(d.path,'.md'):d.path.split('/')[3];
  const previous=d.classification==='CURRENT_AGENT'?(name==='_AGENT_BASE'?{installed_sha256:base.base_sha256}:agents.find(a=>a.name===name)):skills.find(s=>s.name===name);
  assert(previous,name);assert.equal(record.sha256,previous.installed_sha256,'QUALIFIED_GUIDANCE_BYTES_CHANGED:'+name);
  record.disposition='UNCHANGED_QUALIFIED_GUIDANCE_SOURCE';record.evidence=qualified+'/'+(d.classification==='CURRENT_SKILL'?'skills.json':name==='_AGENT_BASE'?'base-global.json':'agents.json');record.limitation='Reuses exact prior guidance/source review and actual loader byte identity, not a new model behavioral run. Final deployed loader acceptance remains separate.';
 }else if(d.classification==='ADR_REVIEW'){
  record.disposition='SUBORDINATE_DECISION_REVIEWED';record.basis='SPS/Registry priority; current-effective notes separate enduring path/governance decisions from historical fallback, disabled workflows and old progress. Original bytes retained.';
 }else if(d.classification==='PACKAGE_HISTORY_REVIEW'){
  assert(raw.toString('utf8').includes('历史实施证据'));record.disposition='HISTORICAL_REPORT_EXPLICITLY_BOUND';record.basis='Applicability/header and current consumers checked; historical results are preserved and do not establish present correctness.';
 }else if(/^CURRENT_|^SETUP_REFERENCE_REVIEW/.test(d.classification)){
  new TextDecoder('utf-8',{fatal:true}).decode(raw);
  record.disposition=d.path.includes('/engineering-lessons/')?'GENERIC_REFERENCE_APPLICABILITY_REVIEWED':'CURRENT_CONSUMER_REVIEWED';record.basis='current-consumer-review.md; actual authority and responsible source/registry/API/help/error contracts, targeted regressions and platform receipts. No unconditional execution grants from prose.';
  record.limitation=d.path.includes('/engineering-lessons/')?'Product applicability and product-specific references reviewed; generic language/third-party examples are not a certification of all versions or a new current capability.':'Per-file review does not itself prove runtime execution or every dynamic error branch.';
 }else{
  record.disposition='NONCURRENT_APPLICABILITY_RETAINED';record.basis=d.disposition;record.limitation='No present product behavior inferred from retained bytes.';
 }
 members.push(record);
}
const counts={};for(const m of members)counts[m.disposition]=(counts[m.disposition]||0)+1;
fs.writeFileSync(path.join(out,'document-review-final-inputs.json'),JSON.stringify({utc:new Date().toISOString(),members,counts,qualification:'Per-file semantic/applicability review dispositions with exact current hashes. Historical/generic dispositions are bounded and are not wholesale content or runtime PASS labels. Current project-status is the single resumable entry; this evidence snapshot does not replace it.'},null,2)+'\n',{flag:'wx'});
const receipts=fs.readdirSync(path.join(out,'commands')).filter(n=>/^\d{4}\.result\.json$/.test(n)).map(n=>({name:n,...JSON.parse(fs.readFileSync(path.join(out,'commands',n)))})),render=receipts.findLast(r=>r.purpose==='frozen02-directory-layout-readonly-render');assert(render&&render.inner_exit_code===0);const actual=fs.readFileSync('docs/conventions/directory-layout.md','utf8'),generated=fs.readFileSync(path.join(out,'commands',render.name.replace('.result.json','.stdout.txt')),'utf8');assert.equal(generated.trimEnd(),actual.trimEnd(),'DIRECTORY_LAYOUT_GENERATED_DOC_DRIFT');
console.log(JSON.stringify({documents:members.length,counts,directory_layout_matches_readonly_render:true,exact_prior_guidance:19}));

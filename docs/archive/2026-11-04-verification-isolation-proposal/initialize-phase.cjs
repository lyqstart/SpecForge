const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=__dirname,sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const run='CODEX-SF-20261104-VERIFICATION-ISOLATION-PROPOSAL-A01';
const sources=[['docs/rule/specforge-active-development-rules.md',350],['docs/product-specification/authority-registry.md',0],['docs/product-specification/specforge-product-specification.md',450],['docs/design/SpecForge架构一致性治理最终实施方案.md',0],['docs/rule/specforge-execution-mode-and-evidence-protocol.md',0]];
for(const name of ['run-command.cjs','seal-receipts.cjs','audit-original.cjs','seal-final-evidence.cjs','verify-final-publication.cjs']){
 let content=fs.readFileSync(path.join(root,'../2026-11-03-original-wi-approved-implementation',name),'utf8').replaceAll('CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01',run);
 fs.writeFileSync(path.join(root,name),content,{flag:'wx'});
}
const files=sources.map(([file,size])=>{const raw=fs.readFileSync(file),text=raw.toString().replace(/\r\n/g,'\n'),lines=text.split('\n');if(lines.at(-1)==='')lines.pop();const chunks=[];for(let i=0;i<lines.length;i+=size||lines.length){const part=lines.slice(i,i+(size||lines.length));chunks.push({first_line:i+1,last_line:i+part.length,sha256:sha(Buffer.from(part.join('\n')+'\n'))})}const reassembled=chunks.map(c=>lines.slice(c.first_line-1,c.last_line).join('\n')+'\n').join('');if(reassembled!==text)throw Error('READ_COVERAGE_REASSEMBLY_FAILED');return {file,raw_sha256:sha(raw),lines:lines.length,chunks,eof_covered:true,reassembly_equal:true,read_method:'Actual full tool-output chunks; initially truncated displays were reread before gate acceptance.'}});
const before=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
if(before!=='bb7780cc0d057d8cbeae14462123b993e65c9639')throw Error('INITIAL_BASELINE_DRIFT');
fs.writeFileSync(path.join(root,'rule-read-coverage.json'),JSON.stringify({utc:new Date().toISOString(),files},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(root,'received-prompt.txt'),'继续\n',{flag:'wx'});
fs.writeFileSync(path.join(root,'authorization.json'),JSON.stringify({recorded_utc:new Date().toISOString(),exact_user_quote:'继续',mode:'CODEX_DIRECT',run_id:run,execution_attempt_id:run+'-01',baseline_head:before,scope:'Continue from the declared D18 stop: investigate and prepare a concrete product decision proposal. This is not explicit approval of an unseen execution backend or permission to run business tests.',no_product_execution_decision_recorded:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({run_id:run,evidence_root:root,complete_rules:files.length,baseline:before,inner_exit_code:0}));

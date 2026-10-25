const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const prior=path.resolve(root,'../2026-10-24-sps-conformance-audit');
const priorLines=fs.readFileSync(path.join(prior,'manifest.sha256'),'utf8').trim().split(/\r?\n/);
for(const l of priorLines){const [,sha,file]=/^([a-f0-9]{64})\s+(.+)$/.exec(l)||[];if(!sha||hash(fs.readFileSync(path.join(prior,file)))!==sha)throw Error('PRIOR_EVIDENCE_CHANGED '+file);}
const token=JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json','utf8')).token;
const commands=fs.readdirSync(root).filter(n=>n.endsWith('.result.json')).map(n=>{const r=JSON.parse(fs.readFileSync(path.join(root,n)));if(typeof r.inner_exit_code!=='number')throw Error('NON_NUMERIC_EXIT '+n);return {file:n,id:r.id,inner_exit_code:r.inner_exit_code,started_utc:r.started_utc,finished_utc:r.finished_utc};});
fs.writeFileSync(path.join(root,'command-index.json'),JSON.stringify({utc:new Date().toISOString(),commands,interpretation:'Failures retained; retries are separate runs; exit zero from an audit probe may mean a defect was successfully reproduced.'},null,2),{flag:'wx'});
const excluded=new Set(['manifest.sha256','manifest-verification.json']);
const entries=fs.readdirSync(root).filter(n=>!excluded.has(n)&&fs.statSync(path.join(root,n)).isFile()).sort().map(file=>{const b=fs.readFileSync(path.join(root,file));if(token&&b.includes(Buffer.from(token)))throw Error('LIVE_TOKEN_IN_EVIDENCE '+file);return {file,sha256:hash(b),bytes:b.length,local_only:file.endsWith('.log')};});
fs.writeFileSync(path.join(root,'manifest.sha256'),entries.map(e=>`${e.sha256}  ${e.file}`).join('\n')+'\n',{flag:'wx'});
for(const e of entries)if(hash(fs.readFileSync(path.join(root,e.file)))!==e.sha256)throw Error('SEAL_MISMATCH '+e.file);
const result={utc:new Date().toISOString(),exit_code:0,files:entries.length,prior_files_verified:priorLines.length,live_token_scan:'PASS',local_only:entries.filter(e=>e.local_only),scope:'Snapshot of evidence at seal time. Later Git receipts are append-only post-seal evidence. Ignored raw .log files remain local, hashes record their identity.'};
fs.writeFileSync(path.join(root,'manifest-verification.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(result));

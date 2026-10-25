const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(args,opts={})=>cp.execFileSync('git',args,{cwd:process.cwd(),windowsHide:true,maxBuffer:256*1024*1024,...opts});
const stage=new Map(git(['ls-files','--stage','-z']).toString().split('\0').filter(Boolean).map(l=>{const [meta,file]=l.split('\t');return [file,meta.split(' ')[1]]}));
const entries=[];
for(const folder of ['docs/archive/2026-10-24-sps-conformance-audit','docs/archive/2026-10-25-verifier-conformance']){
 for(const line of fs.readFileSync(path.join(folder,'manifest.sha256'),'utf8').trim().split(/\r?\n/)){
  const [,expected,file]=/^([a-f0-9]{64})\s+(.+)$/.exec(line)||[];if(!expected)throw Error('BAD_MANIFEST');
  if(file.endsWith('.log'))continue;
  const f=folder+'/'+file,id=stage.get(f);if(!id)throw Error('NOT_STAGED '+f);entries.push({file:f,id,expected});
 }
 for(const file of ['manifest.sha256','manifest-verification.json']){const f=folder+'/'+file,id=stage.get(f);if(!id)throw Error('NOT_STAGED '+f);entries.push({file:f,id,expected:sha(fs.readFileSync(f))});}
}
const raw=git(['cat-file','--batch'],{input:entries.map(e=>e.id).join('\n')+'\n'});let offset=0;
for(const e of entries){const end=raw.indexOf(10,offset),header=raw.subarray(offset,end).toString(),size=Number(header.split(' ')[2]);if(!Number.isInteger(size))throw Error('INVALID_BLOB_HEADER '+header);const bytes=raw.subarray(end+1,end+1+size);if(sha(bytes)!==e.expected)throw Error('GIT_BYTE_DRIFT '+e.file);offset=end+1+size+1;}
console.log(JSON.stringify({utc:new Date().toISOString(),verified_staged_blobs:entries.length,exit_code:0,scope:'Git index bytes independently match sealed SHA-256 manifests; ignored local raw logs excluded explicitly.'}));

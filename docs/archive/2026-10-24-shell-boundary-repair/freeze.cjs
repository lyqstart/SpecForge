const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
for(const f of ['packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts','setup/userlevel-opencode/tools/lib/sf_safe_bash_core.ts'])fs.writeFileSync(f,fs.readFileSync(f,'utf8').trimEnd()+'\n');
fs.writeFileSync('setup/userlevel-opencode/tools/lib/sf_safe_bash_executor.ts',fs.readFileSync('packages/daemon-core/src/tools/lib/sf_safe_bash_executor.ts'));
const files=cp.execFileSync('git',['diff','--name-only','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);files.push('packages/daemon-core/tests/unit/shell-readonly-boundary.test.ts');
const snapshot=files.map(file=>{const b=fs.readFileSync(file);let original=null;try{original=cp.execFileSync('git',['show','682846c5:'+file],{maxBuffer:16*1024*1024,windowsHide:true,stdio:['ignore','pipe','pipe']}).toString('base64')}catch{}return{file,base64:b.toString('base64'),sha256:crypto.createHash('sha256').update(b).digest('hex'),originalBase64:original}});
fs.writeFileSync(__dirname+'/candidate-source.json',JSON.stringify(snapshot),{flag:'wx'});console.log(JSON.stringify({files:files.length}));

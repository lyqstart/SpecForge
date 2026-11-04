const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[];
function walk(dir,prefix=''){for(const name of fs.readdirSync(dir).sort()){const full=path.join(dir,name),relative=prefix+name,stat=fs.lstatSync(full);if(stat.isSymbolicLink())throw Error('LINK');if(stat.isDirectory())walk(full,relative+'/');else if(!['manifest.sha256','manifest-check.json'].includes(relative))files.push(relative);}}
if(fs.existsSync(path.join(__dirname,'manifest.sha256')))throw Error('SEAL_EXISTS');walk(__dirname);
const contents=files.map(name=>sha(fs.readFileSync(path.join(__dirname,name)))+'  '+name+'\n').join('');
fs.writeFileSync(path.join(__dirname,'manifest.sha256'),contents,{flag:'wx'});
for(const file of files)if(sha(fs.readFileSync(path.join(__dirname,file)))!==contents.split('\n').find(line=>line.slice(66)===file).slice(0,64))throw Error('SEAL_CHECK_FAILED');
const result={utc:new Date().toISOString(),run_id:'CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01',files:files.length,manifest_sha256:sha(Buffer.from(contents)),self_check:'PASS',exclusions:'Only manifest and its own check excluded to avoid recursive hash. No private credential data collected.',inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'manifest-check.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));

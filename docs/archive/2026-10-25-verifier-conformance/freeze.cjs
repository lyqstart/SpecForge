const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{cwd:process.cwd(),windowsHide:true,maxBuffer:128*1024*1024});
const files=[...new Set(git('ls-files','-m','-o','--exclude-standard','-z').toString().split('\0').filter(Boolean))];
const tracked=new Set(git('ls-files','-z').toString().split('\0'));
const entries=files.map(file=>{const bytes=fs.readFileSync(file);let baseline;if(tracked.has(file))baseline=git('show',`HEAD:${file}`);return {file,sha256:hash(bytes),bytes_base64:bytes.toString('base64'),baseline_sha256:baseline?hash(baseline):null,baseline_base64:baseline?.toString('base64')}});
const record={utc:new Date().toISOString(),head:git('rev-parse','HEAD').toString().trim(),scope:'All currently modified/untracked nonignored files before creating this snapshot. Prior audit preserved; running command journals may subsequently grow and are excluded from source commit.',entries,diff:git('diff','--binary','HEAD').toString()};
fs.writeFileSync(path.join(__dirname,process.argv[2]),JSON.stringify(record,null,2),{flag:'wx'});
console.log(JSON.stringify({files:entries.length,utc:record.utc,head:record.head}));

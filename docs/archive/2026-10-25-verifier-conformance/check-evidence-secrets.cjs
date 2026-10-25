const fs=require('node:fs'),path=require('node:path');
const root=__dirname,token=JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json')).token;
let files=0,decoded=0;const matches=[];
function inspect(bytes,where,depth=0){
 if(token&&bytes.includes(Buffer.from(token)))matches.push(where);
 if(depth>8)return;
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{return;}
 function walk(v,p){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(typeof x==='string'&&k.endsWith('base64')){decoded++;inspect(Buffer.from(x,'base64'),where+'::'+p+k,depth+1);}else if(x&&typeof x==='object')walk(x,p+k+'.');}}
 walk(value,'');
}
for(const folder of [root,path.resolve(root,'../2026-10-24-sps-conformance-audit')])for(const n of fs.readdirSync(folder)){const f=path.join(folder,n);if(!fs.statSync(f).isFile()||n.endsWith('.log'))continue;files++;inspect(fs.readFileSync(f),path.relative(process.cwd(),f));}
const result={utc:new Date().toISOString(),files,decoded_snapshots:decoded,live_daemon_credential_found:matches.length>0,match_locations:matches,scope:'Exact current Daemon credential scan including recursively encoded snapshot payloads; not a universal secret-detection claim.'};
fs.writeFileSync(path.join(root,process.argv[2]||'credential-scan.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(matches.length)process.exitCode=1;

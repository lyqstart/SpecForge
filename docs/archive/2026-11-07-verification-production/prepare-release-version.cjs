// Mechanical product version update. No dependency resolution, install, tag or deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..'),before='1.0.21',after='1.0.22',changes=[];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function plan(file,transform){const absolute=path.join(root,file),raw=fs.readFileSync(absolute),next=transform(raw.toString('utf8'));if(next===raw.toString('utf8'))throw Error('NO_CHANGE:'+file);changes.push({file,absolute,raw,next});}
const packages=['package.json',...fs.readdirSync(path.join(root,'packages')).filter(n=>fs.existsSync(path.join(root,'packages',n,'package.json'))).map(n=>'packages/'+n+'/package.json')];
for(const file of packages)plan(file,text=>{const value=JSON.parse(text);if(value.version!==before)throw Error('BASE_VERSION_DRIFT:'+file);const next=text.replace(/("version"\s*:\s*")1\.0\.21(")/,(_,a,b)=>a+after+b);if(JSON.parse(next).version!==after)throw Error('VERSION_UPDATE_FAILED');return next;});
plan('bun.lock',text=>{
 const parsed=ts.parseConfigFileTextToJson('bun.lock',text);if(parsed.error)throw Error('LOCK_PARSE');const expected=structuredClone(parsed.config),prior=[];
 for(const file of packages.filter(p=>p!=='package.json')){const key=path.posix.dirname(file),entry=expected.workspaces[key];if(!entry||entry.name!==JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).name||entry.version!=='1.0.8')throw Error('LOCK_WORKSPACE_DRIFT:'+key);prior.push({workspace:key,previous_lock_version:entry.version,previous_package_version:before});entry.version=after;}
 let count=0;const next=text.replace(/("packages\/[^"\n]+"\s*:\s*\{\s*"name"\s*:\s*"@specforge\/[^"\n]+"\s*,\s*"version"\s*:\s*")1\.0\.8(")/g,(_,a,b)=>{count++;return a+after+b;});
 const actual=ts.parseConfigFileTextToJson('bun.lock',next);if(actual.error||count!==prior.length||JSON.stringify(actual.config)!==JSON.stringify(expected))throw Error('UNEXPECTED_LOCK_CHANGE');return next;
});
plan('docs/product-specification/specforge-product-specification.md',text=>{const marker='> Product release version: '+before;if(text.split(marker).length!==2)throw Error('SPS_VERSION_HEADER');return text.replace(marker,'> Product release version: '+after);});
if(fs.existsSync(path.join(__dirname,'release-version-preparation.json')))throw Error('RECEIPT_COLLISION');
for(const c of changes)if(sha(fs.readFileSync(c.absolute))!==sha(c.raw))throw Error('WRITE_PREFLIGHT_DRIFT');
for(const c of changes)fs.writeFileSync(c.absolute,c.next);
const result={utc:new Date().toISOString(),before,after,remote_tag_precheck:'2026-11-07 direct git ls-remote returned0 and no refs/tags/specforge-v1.0.22',source_version_only:true,installed_version_unchanged:true,preexisting_lock_workspace_version:'1.0.8',changes:changes.map(c=>({file:c.file,before_sha256:sha(c.raw),after_sha256:sha(fs.readFileSync(c.absolute))}))};
fs.writeFileSync(path.join(__dirname,'release-version-preparation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({source_version:after,files:changes.length,installed_version_unchanged:true,dependency_resolution_performed:false}));

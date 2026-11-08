const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),out=__dirname;
const fixture=JSON.parse(fs.readFileSync(path.join(out,'lint-ab-02/lint-ab-result.json'))).fixture,project=fs.realpathSync(path.join(fixture,'project'));
assert(path.dirname(fixture)===fs.realpathSync(os.tmpdir()));assert(path.basename(fixture).startsWith('sf-lint-ab-'));assert(path.dirname(project)===fs.realpathSync(fixture));
const bun='C:/Users/lyq/AppData/Roaming/npm/node_modules/bun/bin/bun.exe',env={...process.env,OPENCODE_CONFIG_DIR:path.join(fixture,'test-opencode'),BUN_RUNTIME_TRANSPILER_CACHE_PATH:'0'},commands=[];
for(const [label,args] of [['clean',['scripts/clean-workspace.ts']],['prepare',['scripts/prepare-current-release.ts']]]){
 const started=new Date().toISOString(),r=cp.spawnSync(bun,args,{cwd:project,env,windowsHide:true,maxBuffer:64*1024*1024});
 for(const channel of ['stdout','stderr'])fs.writeFileSync(path.join(out,'cold-release-before.'+label+'.'+channel+'.raw'),r[channel]||Buffer.alloc(0),{flag:'wx'});
 commands.push({label,executable:bun,args,cwd:project,started_utc:started,finished_utc:new Date().toISOString(),exit_code:r.status,signal:r.signal,spawn_error:r.error?.code??null});if(label==='clean')assert.equal(r.status,0);
}
fs.writeFileSync(path.join(out,'cold-release-before.json'),JSON.stringify({utc:new Date().toISOString(),commands,cache_policy:{name:'BUN_RUNTIME_TRANSPILER_CACHE_PATH',value:'0',reference:'https://bun.com/docs/runtime/environment-variables'},qualification:'Owned full-source-subset fixture. Clean build outputs are removed only through the bounded current-workspace owner. Missing setup/docs may affect later precheck; an import-before-build failure is separately evidenced by absence of workspace build markers.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(commands.map(c=>({label:c.label,exit_code:c.exit_code}))));

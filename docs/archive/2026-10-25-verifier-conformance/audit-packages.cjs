const cp=require('node:child_process'),path=require('node:path');
let failed=false;for(const name of process.argv.slice(2)){
 const result=cp.spawnSync(process.execPath,[path.join(__dirname,'run.cjs'),`audit-${name}`,`D:/code/SpecForge/packages/${name}`,'C:/Users/lyq/AppData/Roaming/npm/node_modules/bun/bin/bun.exe','run','test','--','--maxWorkers=1','--minWorkers=1'],{windowsHide:true,stdio:'inherit'});
 if(result.status!==0)failed=true;
}process.exit(failed?1:0);

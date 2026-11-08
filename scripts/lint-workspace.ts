import path from 'node:path';
import {CURRENT_WORKSPACE_PACKAGES} from './lib/workspace-packages';

const root=path.resolve(import.meta.dir,'..'),failures:string[]=[];
for(const name of CURRENT_WORKSPACE_PACKAGES){
 const cwd=path.join(root,'packages',name),manifest=await Bun.file(path.join(cwd,'package.json')).json();
 if(typeof manifest.scripts?.lint!=='string'){throw new Error(`[lint-workspace] CURRENT_LINT_OWNER_MISSING ${name}`);}
 const result=Bun.spawnSync({cmd:[process.execPath,'run','lint'],cwd,env:process.env,stdout:'inherit',stderr:'inherit'});
 if(result.exitCode!==0)failures.push(`${name}(exit=${result.exitCode})`);
}
if(failures.length){console.error(`[lint-workspace] FAILED ${failures.join(', ')}`);process.exitCode=1;}

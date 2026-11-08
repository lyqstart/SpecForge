import fs from 'node:fs';
import path from 'node:path';
import {CURRENT_WORKSPACE_PACKAGES} from './lib/workspace-packages';

/** Only owned workspace build directories. Reject links rather than following them. */
export function cleanPackageBuild(root:string,name:string):boolean {
  if(!CURRENT_WORKSPACE_PACKAGES.includes(name as typeof CURRENT_WORKSPACE_PACKAGES[number]))throw Error('CLEAN_PACKAGE_NOT_CURRENT');
  const resolvedRoot=fs.realpathSync(root),packages=path.join(resolvedRoot,'packages');
  if(fs.lstatSync(packages).isSymbolicLink()||fs.realpathSync(packages)!==packages)throw Error('CLEAN_PACKAGES_LINK_REFUSED');
  const packageRoot=path.join(packages,name);
  if(fs.lstatSync(packageRoot).isSymbolicLink()||fs.realpathSync(packageRoot)!==packageRoot)throw Error('CLEAN_PACKAGE_LINK_REFUSED');
  const target=path.resolve(packageRoot,'dist');
  if(path.dirname(target)!==packageRoot||path.basename(target)!=='dist')throw Error('CLEAN_TARGET_OUTSIDE_PACKAGE');
  let entry:fs.Stats;try{entry=fs.lstatSync(target);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  if(entry.isSymbolicLink()||!entry.isDirectory())throw Error('CLEAN_BUILD_LINK_OR_NON_DIRECTORY_REFUSED');
  if(fs.realpathSync(target)!==target)throw Error('CLEAN_BUILD_RESOLUTION_REFUSED');
  fs.rmSync(target,{recursive:true,force:false});return true;
}
if(import.meta.main){
 const root=path.resolve(import.meta.dir,'..'),args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=='--package'))throw Error('CLEAN_USAGE: clean-workspace.ts [--package <current-package>]');
 const names=args.length?[args[1]]:CURRENT_WORKSPACE_PACKAGES;
 for(const name of names)console.log(JSON.stringify({package:name,removed:cleanPackageBuild(root,name)}));
}

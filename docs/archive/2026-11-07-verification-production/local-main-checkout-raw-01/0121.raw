/** Build-time only Windows backend assets. Runtime never downloads or compiles code. */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const profile='windows-lpac-node-single-process-readonly/v1';
const pinnedNode='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export interface VerificationAssetBuildResult {path:string;sha256:string;size:number;}
export interface VerificationAssetBuildOptions {
  candidateRoot:string;platform?:NodeJS.Platform;architecture?:string;nodeSource?:string;
}
export async function buildVerificationAssets(options:VerificationAssetBuildOptions):Promise<VerificationAssetBuildResult[]> {
  const platform=options.platform??process.platform,architecture=options.architecture??process.arch;
  if(platform!=='win32'||architecture!=='x64')return [];
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('VERIFICATION_ASSET_NATIVE_WINDOWS_BUILD_REQUIRED');
  const root=path.resolve(options.candidateRoot), output=path.join(root,'release','bin','verification');
  const source=path.join(root,'packages','daemon-core','src','verification','windows');
  const nodeSource=path.resolve(options.nodeSource??path.join(process.env.ProgramFiles??'C:\\Program Files','nodejs','node.exe'));
  const nodeStat=await lstat(nodeSource);if(!nodeStat.isFile()||nodeStat.isSymbolicLink()||nodeStat.nlink!==1)throw Error('VERIFICATION_ASSET_NODE_PHYSICAL_FILE_REQUIRED');
  const nodeBytes=await readFile(nodeSource);if(hash(nodeBytes)!==pinnedNode)throw Error('VERIFICATION_ASSET_PINNED_NODE_REQUIRED');
  const compiler=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const sources=(await readdir(source,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.cs')).map(entry=>path.join(source,entry.name)).sort();
  if(sources.length===0||!sources.some(file=>file.endsWith(path.sep+'LpacProductionPlan.cs'))||!sources.some(file=>file.endsWith(path.sep+'LpacProductionRecovery.cs')))throw Error('VERIFICATION_ASSET_PRODUCT_ENTRY_MISSING');
  for(const file of sources){const stat=await lstat(file);if(stat.isSymbolicLink()||stat.nlink!==1)throw Error('VERIFICATION_ASSET_SOURCE_ALIAS');}
  await mkdir(output,{recursive:true});
  const launcher=path.join(output,'specforge-verify.exe');
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(compiler,['/nologo','/platform:x64','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Management.dll','/main:LpacVerificationMain','/out:'+launcher,...sources],{cwd:root,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    const stdout:Buffer[]=[],stderr:Buffer[]=[];let size=0,overflow=false;
    const collect=(target:Buffer[]) => (bytes:Buffer)=>{size+=bytes.length;if(size>1048576){overflow=true;child.kill('SIGKILL');}else target.push(Buffer.from(bytes));};
    child.stdout.on('data',collect(stdout));child.stderr.on('data',collect(stderr));
    const timer=setTimeout(()=>child.kill('SIGKILL'),60000);child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);if(code!==0||signal||overflow)reject(Error('VERIFICATION_ASSET_COMPILE_FAILED:'+JSON.stringify({code,signal,overflow,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')})));else resolve();});
  });
  await copyFile(nodeSource,path.join(output,'node.exe'));
  if(hash(await readFile(path.join(output,'node.exe')))!==pinnedNode)throw Error('VERIFICATION_ASSET_NODE_COPY_DRIFT');
  const launcherBytes=await readFile(launcher),daemonBytes=await readFile(path.join(root,'release','bin','specforged.exe'));
  if(!launcherBytes.length||!daemonBytes.length)throw Error('VERIFICATION_ASSET_EXECUTABLE_EMPTY');
  const manifest={contract:'verification-assets/v1',profile,node:{file:'node.exe',sha256:pinnedNode},launcher:{file:'specforge-verify.exe',sha256:hash(launcherBytes)},daemon:{file:'specforged.exe',sha256:hash(daemonBytes)}};
  await writeFile(path.join(output,'assets.json'),JSON.stringify(manifest,null,2)+'\n');
  const results:VerificationAssetBuildResult[]=[];
  for(const file of ['node.exe','specforge-verify.exe','assets.json']){const bytes=await readFile(path.join(output,file));results.push({path:'release/bin/verification/'+file,sha256:hash(bytes),size:bytes.length});}
  return results;
}

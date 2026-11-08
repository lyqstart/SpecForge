#!/usr/bin/env bun
/** Current-source path audit. Historical evidence and Markdown use separate document review. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {CURRENT_WORKSPACE_PACKAGES} from '../lib/workspace-packages';
import {reviewPathLiterals} from './source-policy';

export function currentPathAuditMember(file:string):boolean {
  const normalized=file.replace(/\\/g,'/');
  if(!normalized.endsWith('.ts')||normalized.endsWith('.d.ts')||/\.(test|spec)\.ts$/.test(normalized))return false;
  if(normalized.startsWith('scripts/'))return true;
  return CURRENT_WORKSPACE_PACKAGES.some(name=>normalized.startsWith('packages/'+name+'/src/'));
}
export function collectPathAuditFiles(root:string):string[]{
  const result=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','packages','scripts'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  if(result.status!==0)throw Error('PATH_AUDIT_SOURCE_INVENTORY_UNAVAILABLE');
  return [...new Set(result.stdout.split('\0').filter(currentPathAuditMember))].sort();
}
function glob(pattern:string):RegExp{return new RegExp('^'+pattern.split('**').map(p=>p.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$');}
export function auditCurrentPaths(root:string){
  const config=JSON.parse(fs.readFileSync(path.join(root,'.lintrc-layout.json'),'utf8'));
  if(config.version!==1||!Array.isArray(config.whitelist)||!config.whitelist.every((x:unknown)=>typeof x==='string'))throw Error('PATH_AUDIT_CONFIG_INVALID');
  const whitelist=config.whitelist.map(glob),files=collectPathAuditFiles(root),findings=[];
  for(const file of files){if(whitelist.some((p:RegExp)=>p.test(file)))continue;
    const content=fs.readFileSync(path.join(root,file),'utf8');
    for(const finding of reviewPathLiterals(content,file))findings.push({file,...finding});
  }
  return {files:files.length,findings,qualification:'Syntax-level current production source check. Historical/fixture documentation is reviewed separately; no success claim for excluded runtime scope.'};
}
if(import.meta.main){
 try{const report=auditCurrentPaths(path.resolve(import.meta.dir,'../..'));console.log(JSON.stringify(report,null,2));process.exitCode=report.findings.length&&!process.argv.includes('--list-violations')?1:0;}
 catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}

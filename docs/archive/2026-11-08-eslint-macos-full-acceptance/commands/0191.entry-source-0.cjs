const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve('.lint-platform-a01'),files=[];
const scope='packages/scope-gate/tests/current-crossplatform-ci-contract.test.ts',before=fs.readFileSync(path.join(root,scope),'utf8'),start=before.indexOf("  it('uses the same physical temporary target through an owned alias without changing product guards',()=>{"),next=before.indexOf("  it('uses the official current release",start);assert(start>=0&&next>start);const replacement=[
"  it('uses the same physical temporary target through an owned alias without changing product guards',()=>{",
"    const parent=realpathSync(tmpdir()),owned=mkdtempSync(path.join(parent,'sf-qualification-temp-')),physical=path.join(owned,'physical'),alias=path.join(owned,'alias');",
"    ownedTemporaryDirectories.push({owned,parent});",
"    mkdirSync(physical);symlinkSync(physical,alias,process.platform==='win32'?'junction':'dir');",
"    const result=qualifyTemporaryEnvironment(alias);",
"    expect(result.canonical).toBe(realpathSync(physical));",
"    expect(result.environment).toEqual({TMPDIR:result.canonical,TEMP:result.canonical,TMP:result.canonical});",
"    expect(result.ancestors.some(item=>item.path===alias&&item.kind==='symlink')).toBe(true);",
"    expect(()=>qualifyTemporaryEnvironment(path.join(owned,'missing'))).toThrow();",
"    for(const file of ['scripts/test-workspace.ts','scripts/run-root-tests.mjs','scripts/run-ci-regression.mjs'])expect(read(file),file).toContain('...temporary.environment');",
"  });",
""
].join('\n');let scopeAfter=before.slice(0,start)+replacement+before.slice(next);const importLine="import {describe,it,expect} from 'vitest';";assert(scopeAfter.includes(importLine));scopeAfter=scopeAfter.replace(importLine,"import {describe,it,expect,afterEach} from 'vitest';");const marker="const root=path.resolve(import.meta.dirname,'../../..')";assert(scopeAfter.includes(marker));scopeAfter=scopeAfter.replace(marker,[
"const ownedTemporaryDirectories:Array<{owned:string;parent:string}>=[];",
"afterEach(()=>{",
"  for(const {owned,parent} of ownedTemporaryDirectories.splice(0)){",
"    if(realpathSync(owned)!==owned||path.dirname(owned)!==parent||!path.basename(owned).startsWith('sf-qualification-temp-'))throw new Error('UNOWNED_TEMP_CLEANUP');",
"    rmSync(owned,{recursive:true,force:true});",
"  }",
"});",
marker
].join('\n'));files.push({file:scope,changes:[{from:before,to:scopeAfter}]});
const source='packages/daemon-core/tests/unit/verification-source-snapshot.test.ts',sourceBefore=fs.readFileSync(path.join(root,source),'utf8');assert(sourceBefore.includes("import { execFileSync } from 'node:child_process';"));const call="  git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@localhost.invalid', 'commit', '-q', '-m', 'synthetic baseline']);";assert(sourceBefore.includes(call));const diagnostic=[
"  const sourceEnvironment:NodeJS.ProcessEnv={};",
"  for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','PATHEXT','SYSTEMDRIVE'])if(process.env[key]!==undefined)sourceEnvironment[key]=process.env[key];",
"  Object.assign(sourceEnvironment,{GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'});",
"  const probe=(args:string[],env:NodeJS.ProcessEnv)=>{",
"    const result=spawnSync('git',['--no-pager','-c','core.fsmonitor=false','-c','protocol.allow=never','-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'-c','gc.auto=0',...args],{cwd:root,env,encoding:'utf8',windowsHide:true,maxBuffer:65536});",
"    return {exit:result.status,stdout:result.stdout,stderr:result.stderr,spawn_error_code:(result.error as NodeJS.ErrnoException|undefined)?.code};",
"  };",
"  console.log('QUALIFICATION_GIT_IDENTITY='+JSON.stringify({platform:process.platform,root,canonical:await fs.realpath(root),metadata_directory:(await fs.lstat(path.join(root,'.git'))).isDirectory(),plain:{top:probe(['rev-parse','--show-toplevel'],process.env),common:probe(['rev-parse','--git-common-dir'],process.env)},source_reader_environment:{top:probe(['rev-parse','--show-toplevel'],sourceEnvironment),common:probe(['rev-parse','--git-common-dir'],sourceEnvironment)}}));"
].join('\n');files.push({file:source,changes:[{from:"import { execFileSync } from 'node:child_process';",to:"import { execFileSync, spawnSync } from 'node:child_process';"},{from:call,to:call+'\n'+diagnostic}]});
const plan=path.join(__dirname,'platform-cleanup-and-diagnostic-plan.json');fs.writeFileSync(plan,JSON.stringify({id:'platform-cleanup-and-diagnostic',reason:'0189 actual full lint rejects throw in finally. Move guarded cleanup to Vitest afterEach so framework preserves test/hook errors separately; keep actual deletion-time ownership checks. Actual Windows CI df9 also fails strict external-Git identity checks; do not change comparison or guards without evidence. Add bounded read-only Git metadata diagnostics only for self-owned test repositories, comparing actual ordinary/sanitized environments. No secrets/global config contents, business path or product behavior changes.',required_verification:'Complete lint plus affected actual tests and new full three-OS CI. Windows cause remains INSUFFICIENT_EVIDENCE until actual diagnostic data arrives.',files},null,2)+'\n',{flag:'wx'});require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'apply-reviewed-platform-edits.cjs'),plan],{cwd:process.cwd(),stdio:'inherit'});

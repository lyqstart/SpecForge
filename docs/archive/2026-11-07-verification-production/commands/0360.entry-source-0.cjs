const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),bun='C:/Users/lyq/AppData/Roaming/npm/node_modules/bun/bin/bun.exe';assert.ok(fs.lstatSync(bun).isFile());
const files=process.argv.slice(2);assert.ok(files.length>0&&files.every(n=>/^tests\/[A-Za-z0-9/_-]+\.test\.ts$/.test(n)));
const result=cp.spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run',...files,'--maxWorkers=1'],{cwd:path.join(root,'packages/daemon-core'),env:{...process.env,npm_execpath:bun},windowsHide:true,maxBuffer:64*1024*1024});
process.stdout.write(result.stdout||Buffer.alloc(0));process.stderr.write(result.stderr||Buffer.alloc(0));if(result.error)console.error(result.error.code);process.exitCode=Number.isInteger(result.status)?result.status:1;

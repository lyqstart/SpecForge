// Actual installed public SDK/Zod schema path, private copies only; no tool execution.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const info=JSON.parse(fs.readFileSync(path.join(import.meta.dir,'public-kernel-fixture-03.json'),'utf8'));
const input=path.join(info.config,'tools/sf_artifact_write.ts'),bytes=fs.readFileSync('setup/userlevel-opencode/tools/sf_artifact_write.ts');
if(fs.existsSync(input))throw Error('SCHEMA_PROBE_COLLISION');fs.writeFileSync(input,bytes,{flag:'wx'});
const definition=(await import(pathToFileURL(input).href)).default;
const z=await import(pathToFileURL(path.join(info.config,'node_modules/zod/index.js')).href);
const result={utc:new Date().toISOString(),scope:'Actual public SDK schema conversion, not Kernel invocation or native execution',tool_sha256:createHash('sha256').update(bytes).digest('hex'),schema_sdk:'@opencode-ai/plugin1.18.16 + zod4.1.8',converted:false,error:null as string|null};
try{z.toJSONSchema(z.object(definition.args));result.converted=true;}catch(error){result.error=String(error);}
fs.writeFileSync(path.join(import.meta.dir,'artifact-schema-probe.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(!result.converted)process.exitCode=1;

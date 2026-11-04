'use strict';console.log('SFPROBE_STAGE:before_require');const cp=require('node:child_process');console.log('SFPROBE_STAGE:after_require');
const decode=x=>Buffer.from(x,'base64').toString('utf8');
const reg=decode('QzpcV0lORE9XU1xzeXN0ZW0zMlxyZWcuZXhl');
const canary=decode('SEtDVVxTb2Z0d2FyZVxTcGVjRm9yZ2VJc29sYXRpb25DYW5hcnktMGM2Njk4MzRlMDY4NDI1NjkyZWJhYTM2OWRkY2I3ZmQ=');
const systemKey=decode('SEtMTVxTeXN0ZW1cQ3VycmVudENvbnRyb2xTZXRcU2VydmljZXNcV2luU29jazJcUGFyYW1ldGVycw==');
function query(args){const r=cp.spawnSync(reg,args,{timeout:10000,maxBuffer:131072,windowsHide:true});return {status:r.status,signal:r.signal,error:r.error?r.error.code:null,stdout_b64:r.stdout?r.stdout.toString('base64'):'',stderr_b64:r.stderr?r.stderr.toString('base64'):''};}
console.log('SFPROBE_STAGE:before_system_query');
const system=query(['query',systemKey]);console.log('SFPROBE_STAGE:after_system_query');const target=query(['query',canary,'/v','FakeCredential']);console.log(JSON.stringify({probe:'D21_R01_REGISTRY_CANARY',pid:process.pid,system,target}));
if(system.status!==0||system.error||system.signal)process.exitCode=41;else if(target.status===0)process.exitCode=40;else if(target.status===1&&!target.error&&!target.signal)console.log('SPECFORGE_REGISTRY_CANARY_READ_DENIED');else process.exitCode=41;

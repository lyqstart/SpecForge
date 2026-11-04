'use strict';console.log('SFPROBE_STAGE:before_require');const cp=require('node:child_process');console.log('SFPROBE_STAGE:after_require');
const decode=x=>Buffer.from(x,'base64').toString('utf8');const reg=decode('QzpcV0lORE9XU1xzeXN0ZW0zMlxyZWcuZXhl');
const canary=decode('SEtDVVxTb2Z0d2FyZVxTcGVjRm9yZ2VJc29sYXRpb25DYW5hcnktZmI3NTBjZmZmZDZiNGFlMmEzYTQ3Yjk5NjAyMDYwNGI=');const systemKey=decode('SEtMTVxTeXN0ZW1cQ3VycmVudENvbnRyb2xTZXRcU2VydmljZXNcV2luU29jazJcUGFyYW1ldGVycw==');
function query(label,args){console.log('SFPROBE_STAGE:'+label+'_begin');const r=cp.spawnSync(reg,args,{stdio:'inherit',timeout:5000,windowsHide:true});const x={status:r.status,signal:r.signal,error:r.error?r.error.code:null};console.log('\nSFPROBE_STATUS:'+JSON.stringify({label,pid:process.pid,...x}));return x;}
const system=query('system',['query',systemKey]);let target=null;if(system.status===0&&!system.error&&!system.signal)target=query('target',['query',canary,'/v','FakeCredential']);
console.log('\nSFPROBE_REPORT:'+JSON.stringify({probe:'D21_R01_REGISTRY_CANARY_INHERITED',pid:process.pid,system,target}));
if(system.status!==0||system.error||system.signal||target===null)process.exitCode=41;else if(target.status===0)process.exitCode=40;else if(target.status===1&&!target.error&&!target.signal)console.log('SPECFORGE_REGISTRY_CANARY_READ_DENIED');else process.exitCode=41;

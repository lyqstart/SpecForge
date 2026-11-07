// Independent Node/Bun transport diagnosis. No SpecForge state, profile, credentials or external network.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto');
const mode=process.argv[2],pause=ms=>new Promise(r=>setTimeout(r,ms));
if(mode==='server'){
 const observations=[];const server=http.createServer((req,res)=>{
  if(req.url==='/facts'){res.end(JSON.stringify(observations));return;}
  const observe=name=>observations.push({name,utc:new Date().toISOString(),request_aborted:req.aborted,response_ended:res.writableEnded,response_destroyed:res.destroyed,socket_destroyed:req.socket?.destroyed});
  observe('request');req.on('aborted',()=>observe('request_aborted'));req.on('close',()=>observe('request_close'));res.on('close',()=>observe('response_close'));req.socket?.on('close',()=>observe('socket_close'));req.resume();req.on('end',()=>observe('request_end'));
 });server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,runtime:globalThis.Bun?.version||process.version})));
}else if(mode==='client'){
 (async()=>{const started=Date.now(),c=new AbortController();setTimeout(()=>c.abort(),300);try{await fetch(process.argv[3]+'/wait',{method:'POST',body:'fixed probe body',signal:c.signal});throw Error('UNEXPECTED_RESPONSE');}catch(e){console.log(JSON.stringify({elapsed_ms:Date.now()-started,error:e.name,aborted:c.signal.aborted,runtime:globalThis.Bun?.version||process.version}));if(!c.signal.aborted)process.exitCode=1;}await pause(1000);})();
}else{
 (async()=>{const records=[],bun='C:\\Users\\lyq\\AppData\\Roaming\\npm\\node_modules\\bun\\bin\\bun.exe';
  for(const serverRuntime of ['node','bun'])for(const clientRuntime of ['node','bun']){
   const child=cp.spawn(serverRuntime==='node'?process.execPath:bun,[__filename,'server'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
   const ended=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));let ready;
   try{for(let n=0;n<100;n++){try{ready=JSON.parse(output.trim());}catch{}if(ready)break;if(child.exitCode!==null)throw Error('SERVER_EXIT '+errors);await pause(50);}if(!ready)throw Error('SERVER_TIMEOUT');
    const base='http://127.0.0.1:'+ready.port,client=cp.spawn(clientRuntime==='node'?process.execPath:bun,[__filename,'client',base],{windowsHide:true,stdio:['ignore','pipe','pipe']});let clientOut='',clientErr='';client.stdout.on('data',b=>clientOut+=b);client.stderr.on('data',b=>clientErr+=b);const status=await new Promise(r=>client.once('close',(code,signal)=>r({code,signal})));await pause(300);const facts=await(await fetch(base+'/facts')).json();records.push({serverRuntime,clientRuntime,server:ready,client:status,clientOut,clientErr,facts});
   }finally{child.kill();await ended;}
  }
  const result={utc:new Date().toISOString(),scope:'Transport diagnosis only, actual local Node/Bun processes and loopback',records};fs.writeFileSync(path.join(__dirname,'http-abort-transport-probe.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
 })().catch(e=>{console.error(e);process.exitCode=1;});
}

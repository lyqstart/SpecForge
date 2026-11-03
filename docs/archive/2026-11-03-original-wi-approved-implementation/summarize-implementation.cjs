const fs = require('node:fs'), path = require('node:path');
const suffix = process.argv[2]; if (!/^[a-z0-9-]+$/.test(suffix || '')) throw Error('suffix required');
const directory = path.join(__dirname,'native-resume-implementation');
const input = JSON.parse(fs.readFileSync(path.join(directory,'inspection-'+suffix+'-redacted.json'))).data;
const messages = [...input.messages, ...input.childMessages.flatMap(child=>child.messages)];
const events = messages.flatMap(message=>(message.parts||[]).filter(part=>part.type==='tool').map(part=>({message:message.info?.id, agent:message.info?.agent, variant:message.info?.variant, tool:part.tool, state:part.state})));
fs.writeFileSync(path.join(__dirname,'implementation-native-events-'+suffix+'.json'),JSON.stringify({utc:new Date().toISOString(),events},null,2)+'\n',{flag:'wx'});
const result = events.filter(event=>event.tool?.startsWith('sf_')).map(event=>{ let output; try {output=JSON.parse(event.state?.output)} catch {output={text:String(event.state?.output||'').slice(-300)}} return {agent:event.agent,tool:event.tool,input:event.state?.input,status:event.state?.status,success:output.success,error:output.error,code:output.code,bootstrap_plan_sha256:output.bootstrap_plan_sha256,base_commit:output.base_commit,current_state:output.current_state,result:output.result,summary:output.summary}; });
console.log(JSON.stringify({statuses:input.statuses,events:result},null,2));

/** Read-only examples: no workflow mutation, model prompt or lifecycle ownership. */
import {readFile} from 'node:fs/promises';
import {parseHandshakeFile} from '@specforge/service-management';
import {resolveSpecForgeHandshakePath} from '@specforge/types/user-level-paths';

export async function createDaemonReadClient(handshakePath=resolveSpecForgeHandshakePath()) {
  let text:string;
  try { text=await readFile(handshakePath,'utf8'); }
  catch(error) { throw new Error('HANDSHAKE_READ_FAILED:'+((error as NodeJS.ErrnoException).code??'UNKNOWN')+'; use specforge daemon status'); }
  const handshake=parseHandshakeFile(JSON.parse(text));
  const url='http://127.0.0.1:'+handshake.port;
  const request=(route:string,authenticated=false)=>fetch(url+route,{method:'GET',...(authenticated?{headers:{Authorization:'Bearer '+handshake.token}}:{}),signal:AbortSignal.timeout(5000)});
  async function health(){
    const response=await request('/api/v1/healthz');if(response.status!==200)throw new Error('DAEMON_HEALTH_HTTP:'+response.status);
    const body=await response.json();if(body.status!=='ok'||body.pid!==handshake.pid||body.version!==handshake.version)throw new Error('DAEMON_IDENTITY_MISMATCH');
    return {pid:body.pid,port:handshake.port,version:body.version,handshake_schema:handshake.schema_version,task_contract:handshake.artifact_contract_versions.task_document};
  }
  return {
    health,
    async sessionCount(){await health();const response=await request('/api/v1/session/list',true);if(response.status!==200)throw new Error('SESSION_LIST_HTTP:'+response.status);const body=await response.json();if(body.success!==true||!Array.isArray(body.data?.sessions))throw new Error('SESSION_LIST_CONTRACT_INVALID');return body.data.sessions.length;},
    async verifyAuthenticationRefusal(){await health();const response=await request('/api/v1/session/list');if(response.status!==401)throw new Error('EXPECTED_AUTHENTICATION_REFUSAL');const body=await response.json();if(body.error?.code!=='UNAUTHORIZED')throw new Error('AUTHENTICATION_ERROR_CONTRACT_INVALID');return {status:response.status,code:body.error.code};},
  };
}

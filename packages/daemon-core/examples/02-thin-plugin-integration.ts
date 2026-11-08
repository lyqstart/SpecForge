/** Read-only connection example; does not replace the actual Thin Plugin or spawn a model. */
import {createDaemonReadClient} from './current-read-client';
export async function main(){const client=await createDaemonReadClient();console.log(JSON.stringify({sessions:await client.sessionCount(),qualification:'Read-only Daemon query; no workflow state mutation or Agent execution claim.'}));}
if(import.meta.main)main().catch(error=>{console.error(error instanceof Error?error.message:'DAEMON_READ_FAILED');process.exitCode=1;});

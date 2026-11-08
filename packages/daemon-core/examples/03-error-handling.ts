/** Demonstrate an authentication failure using a read; never attempt a governance write. */
import {createDaemonReadClient} from './current-read-client';
export async function main(){const client=await createDaemonReadClient();console.log(JSON.stringify(await client.verifyAuthenticationRefusal()));}
if(import.meta.main)main().catch(error=>{console.error(error instanceof Error?error.message:'DAEMON_READ_FAILED');process.exitCode=1;});

import {afterEach,describe,it,expect,vi} from 'vitest';
import {ReconnectingDaemonClient as SourceClient} from '../../src/plugin/reconnecting-daemon-client';
import {ReconnectingDaemonClient as InstalledClient} from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
describe.each([['workspace',SourceClient],['installed',InstalledClient]] as const)('%s reconnect timer ownership',(_name,Client)=>{
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
 it('owns exactly one real timer and settles pending delivery on disposal',async()=>{
  vi.useFakeTimers();const client=new Client({initialDelayMs:10000,maxCumulativeBackoffMs:60000});
  const pending=Reflect.apply(Reflect.get(Client.prototype,'startBackoff'),client,['synthetic-session','synthetic-event',{}]) as Promise<unknown>;
  try{expect(vi.getTimerCount()).toBe(1);client.dispose();expect(vi.getTimerCount()).toBe(0);await expect(pending).resolves.toEqual({ok:false,dropped:true,reason:'disposed'});}finally{client.dispose();}
 });
 it('settles superseded waits and leaves one current timer',async()=>{
  vi.useFakeTimers();const client=new Client({initialDelayMs:10000,maxCumulativeBackoffMs:60000});
  const start=()=>Reflect.apply(Reflect.get(Client.prototype,'startBackoff'),client,['synthetic-session','synthetic-event',{}]) as Promise<unknown>;
  const first=start();start();try{await expect(first).resolves.toEqual({ok:false,dropped:true,reason:'rejected'});expect(vi.getTimerCount()).toBe(1);}finally{client.dispose();}
 });
});

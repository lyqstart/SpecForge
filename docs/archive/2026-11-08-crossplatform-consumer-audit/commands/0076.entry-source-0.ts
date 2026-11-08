import {afterEach,describe,it,expect,vi} from 'vitest';
import {ReconnectingDaemonClient as SourceClient} from '../../src/plugin/reconnecting-daemon-client';
import {ReconnectingDaemonClient as InstalledClient} from '../../../../setup/userlevel-opencode/scripts/lib/sf_plugin_client';
describe.each([['workspace',SourceClient],['installed',InstalledClient]] as const)('%s reconnect timer ownership',(_name,Client)=>{
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
 it('owns exactly one real timer and settles pending delivery on disposal',async()=>{
  vi.useFakeTimers();const client=new Client({initialDelayMs:10000,maxCumulativeBackoffMs:60000});let completed:unknown;
  const pending=Reflect.apply(Reflect.get(Client.prototype,'startBackoff'),client,['synthetic-session','synthetic-event',{}]) as Promise<unknown>;pending.then(result=>{completed=result;});
  try{expect(vi.getTimerCount()).toBe(1);client.dispose();await Promise.resolve();await Promise.resolve();expect(vi.getTimerCount()).toBe(0);expect(completed).toEqual({ok:false,dropped:true,reason:'disposed'});}finally{client.dispose();}
 });
 it('settles superseded waits and leaves one current timer',async()=>{
  vi.useFakeTimers();const client=new Client({initialDelayMs:10000,maxCumulativeBackoffMs:60000});let first:unknown;
  const start=()=>Reflect.apply(Reflect.get(Client.prototype,'startBackoff'),client,['synthetic-session','synthetic-event',{}]) as Promise<unknown>;
  start().then(result=>{first=result;});start();try{await Promise.resolve();await Promise.resolve();expect(first).toEqual({ok:false,dropped:true,reason:'rejected'});expect(vi.getTimerCount()).toBe(1);}finally{client.dispose();}
 });
});

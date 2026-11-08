import {afterEach,describe,it,expect,vi} from 'vitest';
import {HTTPServer} from '../../src/http/HTTPServer';
describe('HTTP event fallback timeout ownership',()=>{
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
 const call=(promise:Promise<string>,timeout=3000)=>Reflect.apply(Reflect.get(HTTPServer.prototype,'withTimeout'),{},[promise,timeout,'fallback']) as Promise<string>;
 it('clears the losing timer after success',async()=>{vi.useFakeTimers();expect(await call(Promise.resolve('ok'))).toBe('ok');expect(vi.getTimerCount()).toBe(0);});
 it('clears the losing timer after rejection',async()=>{vi.useFakeTimers();expect(await call(Promise.reject(Error('synthetic failure')))).toBe('fallback');expect(vi.getTimerCount()).toBe(0);});
 it('retains the bounded fallback when timeout actually wins',async()=>{vi.useFakeTimers();const result=call(new Promise(()=>{}),25);await vi.advanceTimersByTimeAsync(25);expect(await result).toBe('fallback');expect(vi.getTimerCount()).toBe(0);});
 it('clears the overall ingest deadline when processing finishes first',async()=>{
  vi.useFakeTimers();const send=vi.fn(),owner={sendJsonResponse:send,successBody:(data:unknown)=>({success:true,data}),routeIngestEvent:async()=>undefined};
  await Reflect.apply(Reflect.get(HTTPServer.prototype,'handleIngestEvent'),owner,[{},{setHeader:vi.fn()},JSON.stringify({sessionId:'synthetic-session',type:'synthetic-event'})]);expect(send).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
});

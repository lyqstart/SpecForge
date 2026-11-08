import {afterEach,describe,expect,it,vi} from 'vitest';
import {ServiceHealthChecker} from '../../src/orchestrator/healthcheck';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('health request timeout ownership',()=>{
  for(const method of ['httpGet','httpGetRaw'] as const){
    it.each(['success','rejection'] as const)('clears the explicit loser timer after '+method+' %s',async outcome=>{
      vi.useFakeTimers();vi.stubGlobal('fetch',outcome==='success'
        ?vi.fn().mockResolvedValue({status:200,ok:true,json:async()=>({status:'ok'})})
        :vi.fn().mockRejectedValue(new Error('synthetic connection refused')));
      const checker=new ServiceHealthChecker({requestTimeoutMs:30000});
      // Exercise the real two transport methods without outer poll/deadline timers.
      const call=Reflect.get(checker,method).call(checker,'http://127.0.0.1:1/health','synthetic-not-a-credential');
      if(outcome==='success')await expect(call).resolves.toBeDefined();else await expect(call).rejects.toThrow('synthetic connection refused');
      expect(vi.getTimerCount()).toBe(0);
      checker[Symbol.dispose]();
    });
  }
});

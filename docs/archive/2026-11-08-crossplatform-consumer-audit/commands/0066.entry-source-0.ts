import {afterEach,describe,it,expect,vi} from 'vitest';
import {logger} from '../src/logger';
describe('configuration diagnostic output contract',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('keeps machine-readable stdout clear and preserves metadata redaction on stderr',()=>{
  const stdout=[vi.spyOn(console,'log').mockImplementation(()=>{}),vi.spyOn(console,'info').mockImplementation(()=>{}),vi.spyOn(console,'debug').mockImplementation(()=>{})];
  const stderr=[vi.spyOn(console,'warn').mockImplementation(()=>{}),vi.spyOn(console,'error').mockImplementation(()=>{})];
  for(const level of ['debug','info','warn','error'] as const)logger[level]('configuration operation',{layer:'user',keyCount:2,value:'synthetic-secret-value',unexpectedSecretKey:'synthetic-secret-key'});
  expect(stdout.flatMap(s=>s.mock.calls)).toHaveLength(0);
  const calls=stderr.flatMap(s=>s.mock.calls);expect(calls).toHaveLength(4);const text=JSON.stringify(calls);expect(text).not.toContain('synthetic-secret');expect(text).not.toContain('unexpectedSecretKey');expect(text).toContain('keyCount');
 });
});

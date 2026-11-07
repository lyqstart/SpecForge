/** Neutral Runtime lease behavior only; real SDK/Bun cancellation has separate integration evidence. */
import {describe,it,expect} from 'vitest';
import path from 'node:path';
import type {TrustedToolInvocationProof} from '@specforge/types/trusted-tool-invocation';
import {VerificationInvocationLease} from '../../src/verification/invocation-lease';
import {validateVerificationInvocationLease} from '../../src/verification/verification-schema';
import {canonicalVerificationJson as json,verificationId as hash} from '../../src/verification/owner-store';
function owner():TrustedToolInvocationProof{
 const p={sessionId:'unit-session',messageId:'unit-message',callId:'unit-call',agent:'sf-verifier' as const,directory:path.resolve('.'),tool:'sf_verification_run' as const,inputSha256:'a'.repeat(64),startedAt:Date.now()};
 return {source:'runtime-tool-invocation/v1',...p,observedAt:new Date().toISOString(),runtimeProjectionSha256:hash(json(p))};
}
const subject=(proof:TrustedToolInvocationProof)=>({planId:'b'.repeat(64),attemptId:'c'.repeat(32),reservationId:'d'.repeat(64),owner:proof,startedAt:new Date().toISOString()});
describe('actual invocation lifetime lease',()=>{
 it('requires a final active observation and produces a strict completed record',async()=>{
  const proof=owner();let calls=0;
  const lease=new VerificationInvocationLease({...subject(proof),verify:async()=>{calls++;return {...proof,observedAt:new Date().toISOString()};}});
  expect(await lease.start()).toBe(true);const result=await lease.finish();validateVerificationInvocationLease(result);expect(result.terminal).toBe('completed');expect(calls).toBe(2);expect(result.checks).toHaveLength(2);
 });
 it('cancels a live operation when Runtime ends the call even though the HTTP signal never aborts',async()=>{
  const proof=owner(),http=new AbortController();let active=true;
  const lease=new VerificationInvocationLease({...subject(proof),signal:http.signal,verify:async()=>{if(!active)throw Error('TOOL_INVOCATION_RUNNING_CALL_REQUIRED');return {...proof,observedAt:new Date().toISOString()};}});
  expect(await lease.start()).toBe(true);const aborted=new Promise<void>(resolve=>lease.signal.addEventListener('abort',()=>resolve(),{once:true}));active=false;await aborted;
  expect(http.signal.aborted).toBe(false);const record=await lease.finish();validateVerificationInvocationLease(record);expect(record.terminal).toBe('lost');expect(record.checks.at(-1)?.reason).toBe('TOOL_INVOCATION_RUNNING_CALL_REQUIRED');
 });
 it('fails closed on unavailable Runtime before launching or discharging a passing lease',async()=>{
  const proof=owner(),lease=new VerificationInvocationLease({...subject(proof),verify:async()=>{throw Error('connection failed with private response');}});
  expect(await lease.start()).toBe(false);const record=await lease.finish();validateVerificationInvocationLease(record);expect(record.terminal).toBe('lost');expect(json(record)).not.toContain('private response');
 });
 it('preserves explicit HTTP cancellation even while the real invocation is still active',async()=>{
  const proof=owner(),controller=new AbortController(),lease=new VerificationInvocationLease({...subject(proof),signal:controller.signal,verify:async()=>({...proof,observedAt:new Date().toISOString()})});
  await lease.start();controller.abort();expect(lease.signal.aborted).toBe(true);const record=await lease.finish();validateVerificationInvocationLease(record);expect(record.terminal).toBe('cancelled');
 });
 it('does not accept a different running call with the same caller-supplied identity',async()=>{
  const proof=owner(),other=owner();other.callId='another-call';const {source:_source,observedAt:_time,runtimeProjectionSha256:_hash,...projection}=other;other.runtimeProjectionSha256=hash(json(projection));
  const lease=new VerificationInvocationLease({...subject(proof),verify:async()=>other});expect(await lease.start()).toBe(false);expect((await lease.finish()).terminal).toBe('lost');
 });
 it('checks the real owner again at completion instead of relying on a previously active observation',async()=>{
  const proof=owner();let active=true;const lease=new VerificationInvocationLease({...subject(proof),verify:async()=>{if(!active)throw Error('TOOL_INVOCATION_RUNNING_CALL_REQUIRED');return {...proof,observedAt:new Date().toISOString()};}});
  await lease.start();active=false;const record=await lease.finish();validateVerificationInvocationLease(record);expect(record.terminal).toBe('lost');
  expect(()=>validateVerificationInvocationLease({...record,terminal:'completed'})).toThrow('LEASE_TERMINAL_INVALID');
 });
});

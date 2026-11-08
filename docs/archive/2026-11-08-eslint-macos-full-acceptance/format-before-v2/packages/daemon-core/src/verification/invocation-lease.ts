/** A running call is the execution owner even when a host HTTP shim loses disconnect events. */
import type {TrustedToolInvocationProof} from '@specforge/types/trusted-tool-invocation';
import type {VerificationInvocationLeaseRecord} from './verification-plan';
import {validateTrustedInvocationProof,verificationRequire as requireFact} from './verification-schema';

export class VerificationInvocationLease {
  readonly controller=new AbortController();
  private closed=false;
  private lostReason:string|null=null;
  private externalCancelled=false;
  private checks:VerificationInvocationLeaseRecord['checks']=[];
  private watcher:Promise<void>|undefined;
  private wake:()=>void=()=>{};
  private readonly onExternalAbort=()=>{this.externalCancelled=true;this.controller.abort();this.wake();};
  constructor(private readonly input:{planId:string;attemptId:string;reservationId:string;owner:TrustedToolInvocationProof;startedAt:string;verify:()=>Promise<TrustedToolInvocationProof>;signal?:AbortSignal}){
    input.signal?.addEventListener('abort',this.onExternalAbort,{once:true});
    if(input.signal?.aborted)this.onExternalAbort();
  }
  get signal():AbortSignal{return this.controller.signal;}
  get lost():boolean{return this.lostReason!==null;}
  private async check():Promise<void>{
    if(this.lost)return;
    try{
      requireFact(this.checks.length<360,'INVOCATION_LEASE_BUDGET');
      const proof=await this.input.verify();validateTrustedInvocationProof(proof,'sf-verifier');
      requireFact(proof.runtimeProjectionSha256===this.input.owner.runtimeProjectionSha256&&Date.parse(proof.observedAt)>=Date.parse(this.input.startedAt),'INVOCATION_LEASE_SUBJECT_CHANGED');
      this.checks.push({observedAt:proof.observedAt,active:true,projectionSha256:proof.runtimeProjectionSha256,reason:null});
    }catch(error){
      const message=error instanceof Error?error.message:'';
      this.lostReason=/^[A-Z][A-Z_]{1,127}$/.test(message)?message:'RUNTIME_INVOCATION_UNAVAILABLE';
      this.checks.push({observedAt:new Date().toISOString(),active:false,projectionSha256:null,reason:this.lostReason});
      this.controller.abort();this.wake();
    }
  }
  async start():Promise<boolean>{
    await this.check();
    if(!this.signal.aborted)this.watcher=this.watch();
    return !this.signal.aborted;
  }
  private async watch():Promise<void>{
    while(!this.closed&&!this.signal.aborted){
      await new Promise<void>(resolve=>{const timer=setTimeout(resolve,500);this.wake=()=>{clearTimeout(timer);resolve();};});
      if(!this.closed&&!this.signal.aborted)await this.check();
    }
  }
  async finish():Promise<VerificationInvocationLeaseRecord>{
    this.closed=true;this.wake();
    try{
      await this.watcher;
      // Verify again immediately before the owner discharges the lease and signs a receipt.
      await this.check();
      return {contract:'verification-invocation-lease/v1',planId:this.input.planId,attemptId:this.input.attemptId,reservationId:this.input.reservationId,
        owner:this.input.owner,startedAt:this.input.startedAt,finishedAt:new Date().toISOString(),
        terminal:this.lost?'lost':this.externalCancelled?'cancelled':'completed',checks:this.checks};
    }finally{this.input.signal?.removeEventListener('abort',this.onExternalAbort);}
  }
}

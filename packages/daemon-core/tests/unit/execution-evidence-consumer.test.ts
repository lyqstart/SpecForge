import { describe, expect, it, vi } from 'vitest';
import { inspectExecutionEvidence, type ExecutionEvidenceConsumer } from '../../src/verification/execution-evidence-consumer';
import { isVerificationRecoveryRequest, verificationRequestAbort, VERIFICATION_REQUEST_ABORT } from '../../src/verification/request-context';
const id='a'.repeat(64), projectRoot=process.cwd(), workItemId='WI-9001';
const reference={execution_receipt_id:id,task_id:'TASK-WI-9001-001',verification_type:'unit',command_index:0,command:'node --test tests/owned.test.mjs'};
const command={...reference,status:'pass',output_summary:'four assertions'};
const entry={...reference,evidence_id:'EV-1',status:'passed',path:'verification-owner:receipt:'+id,hash:'sha256:'+id,hash_domain:'canonical-json:verification-execution/v1'};
const owner=()=>({consume:vi.fn(async()=>({}))} as unknown as ExecutionEvidenceConsumer);

describe('shared execution reference consumer (unit transport only)',()=>{
  it('uses the same exact subject for Report and Evidence and verifies it once',async()=>{
    const consumer=owner();
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[command]},manifest:{entries:[entry]},consumer})).toEqual([]);
    expect(consumer.consume).toHaveBeenCalledTimes(1);
    expect(consumer.consume).toHaveBeenCalledWith({receiptId:id,projectRoot,workItemId,taskId:reference.task_id,verificationType:'unit',commandIndex:0,command:reference.command,purpose:'formal'});
  });
  it('rejects a free-text passed command without an authenticated receipt',async()=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[{command:'node --test test.mjs',status:'pass'}]},consumer:owner()})).toContain('execution_reference_invalid:command-0');
  });
  it('fails closed without the composed owner or when that owner rejects freshness',async()=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[command]}})).toContain('execution_owner_unavailable:command-0');
    const consumer={consume:vi.fn(async()=>{throw Error('VERIFICATION_SOURCE_CHANGED');})};
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[command]},consumer})).toContain('execution_receipt_rejected:command-0');
  });
  it('rejects copied subjects, duplicate command receipts and missing manifest links',async()=>{
    const report={verification_commands:[command,{...command,task_id:'TASK-WI-9001-002'}]};
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report,consumer:owner()})).toContain('execution_receipt_reused_for_another_subject:command-1');
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[command,command]},consumer:owner()})).toContain('execution_receipt_duplicate_command:1');
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[command]},manifest:{entries:[]},consumer:owner()})).toContain('execution_receipt_missing_from_manifest:'+id);
  });
  it.each(['path','hash','hash_domain'])('checks the manifest %s domain rather than trusting a copied path',async key=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,manifest:{entries:[{...entry,[key]:'copied'}]},consumer:owner()})).toContain('execution_evidence_identity_invalid:0');
  });
  it('does not permit an executable declaration to be relabeled manual',async()=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[{...command,execution_kind:'manual-observation/v1',evidence_refs:['EV-1']}]},manifest:{entries:[{evidence_id:'EV-1',status:'passed',evidence_type:'manual_acceptance'}]},consumer:owner()})).toContain('manual_observation_reference_invalid:0');
  });
  it('does not let a manual prefix claim an executable Task or receipt subject',async()=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[{...command,command:'manual: checked the executable Task',execution_kind:'manual-observation/v1',evidence_refs:['EV-1']}]},manifest:{entries:[{evidence_id:'EV-1',status:'passed',evidence_type:'manual_acceptance'}]},consumer:owner()})).toContain('manual_observation_reference_invalid:0');
  });
  it('keeps separate manual observations without treating them as an executable Task completion',async()=>{
    const consumer=owner();
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[{command:'manual: user observed the device',status:'pass',execution_kind:'manual-observation/v1',evidence_refs:['EV-1']}]},manifest:{entries:[{evidence_id:'EV-1',status:'passed',evidence_type:'manual_acceptance'}]},consumer})).toEqual([]);
    expect(consumer.consume).not.toHaveBeenCalled();
  });
  it('does not interpret newer required fields as proof of an old closure defect',async()=>{
    expect(await inspectExecutionEvidence({projectRoot,workItemId,report:{verification_commands:[{command:'old',status:'pass'}]},historicalClosed:true})).toEqual([]);
  });
});

describe('request lifetime and recovery action boundary',()=>{
  it('only trusts the process-local signal symbol',()=>{
    const controller=new AbortController();
    expect(verificationRequestAbort(JSON.parse('{"abort":{},"VERIFICATION_REQUEST_ABORT":{}}'))).toBeUndefined();
    expect(verificationRequestAbort({[VERIFICATION_REQUEST_ABORT]:controller.signal})).toBe(controller.signal);
  });
  it.each([['sf_verification_plan','create',false],['sf_verification_plan','recover',false],['sf_verification_plan','revoke',true],
    ['sf_verification_run','prepare',false],['sf_verification_run','run',false],['sf_verification_run','cancel',true],['sf_verification_run','recover',true],['sf_safe_bash','recover',false]] as const)('classifies only resource recovery %s/%s', (tool,action,allowed)=>{
    expect(isVerificationRecoveryRequest(tool,{action})).toBe(allowed);
  });
});

import {describe,it,expect} from 'vitest';
import {applyRules} from '../../src/tools/lib/sf_safe_bash_rules';
import {applyRules as installedRules} from '../../../../setup/userlevel-opencode/tools/lib/sf_safe_bash_rules';
import type {HostProfile} from '../../src/tools/lib/sf_safe_bash_core';
import {checkDesignGate as legacyLocalGate} from '../../../../setup/userlevel-opencode/tools/lib/sf_design_gate_core';
import {checkRequirementsGate,checkBugfixGate} from '../../../../setup/userlevel-opencode/tools/lib/sf_requirements_gate_core';
import {checkTasksGate} from '../../../../setup/userlevel-opencode/tools/lib/sf_tasks_gate_core';
import {checkVerificationGate} from '../../../../setup/userlevel-opencode/tools/lib/sf_verification_gate_core';
describe('retained tool libraries cannot reintroduce retired execution',()=>{
 it('refuses every other filesystem-based local Gate without touching an unowned path',async()=>{
  for(const gate of [checkRequirementsGate,checkBugfixGate,checkTasksGate,checkVerificationGate]){
   const result=await gate('WI-0001','nonexistent-unowned-path');
   expect(result.status).toBe('blocked');expect(result.blocking_issues).toEqual(['LOCAL_GATE_NOT_CURRENT_OWNER']);
  }
 });
 for(const [name,query] of [['source',applyRules],['installed',installedRules]] as const){
  it(`${name} uses the current readonly syntax and never suggests temporary-script execution`,()=>{
   for(const command of ['pwd','cat ordinary.txt','echo literal'])expect(query(command,{} as HostProfile)).toEqual({kind:'pass'});
   for(const command of ['bun test','node --test test.js','bash /tmp/script.sh','python /tmp/script.py','sudo anything','git push --force','cat <<EOF','pwsh -File helper.ps1']){
    const result=query(command,{} as HostProfile);expect(result.kind).toBe('reject');
    if(result.kind==='reject'){expect(result.rejection.suggestion).toContain('not_executed/blocked');expect(result.rejection.suggestion).toContain('sf_verification_plan');expect(result.rejection.hint).toContain('Do not retry');}
   }
  });
 }
 it('closes the old local Design Gate regardless of legacy mode or workflow arguments',async()=>{
  for(const workflow of ['feature_spec','feature_spec_design_first','investigation']){
   const result=await legacyLocalGate('WI-0001','nonexistent-unowned-path',workflow,{mode:'ops_plan'});
   expect(result.status).toBe('blocked');expect(result.blocking_issues).toEqual(['LOCAL_DESIGN_GATE_NOT_CURRENT_OWNER']);
  }
 });
});

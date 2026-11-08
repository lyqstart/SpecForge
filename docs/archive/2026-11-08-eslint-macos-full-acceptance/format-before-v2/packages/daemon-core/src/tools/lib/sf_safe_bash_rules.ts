/** Retained syntax query. Execution and path/role/state authorization belong to the current controlled owners. */
import type {RuleResult} from "./sf_safe_bash_types";
import type {HostProfile} from "./sf_safe_bash_core";
import {parseReadOnlyCommand} from "./sf_safe_bash_executor";
export function applyRules(command:string,_profile:HostProfile):RuleResult {
 if(parseReadOnlyCommand(command))return {kind:"pass"};
 return {kind:"reject",rejection:{
  rule:"SHELL_EXECUTION_UNAVAILABLE",
  reason:"D18 sf_safe_bash supports internal read operations only; no shell or child process is available.",
  suggestion:"Scripts, builds and tests were not executed. D23 verification requires sf-orchestrator / sf_verification_plan and sf-verifier / sf_verification_run within the approved platform/profile; otherwise remain not_executed/blocked.",
  hint:"Do not retry through another shell, temporary script, native tool or direct Daemon HTTP call. A syntax pass does not grant path, role, state or execution permission."
 }};
}

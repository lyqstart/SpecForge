const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),crypto=require('node:crypto'),changes=[],out=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function plan(file,fn){const before=fs.readFileSync(file),after=Buffer.from(fn(before.toString('utf8')));assert.equal(ts.createSourceFile(file,after.toString(),ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,file);changes.push({file,before,after});}
for(const prefix of ['packages/daemon-core/src/tools/lib/','setup/userlevel-opencode/tools/lib/']){
 plan(prefix+'sf_safe_bash_core.ts',text=>{const src=ts.createSourceFile('core.ts',text,ts.ScriptTarget.Latest,true),profile=src.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='HostProfile'),entry=src.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='safeBashExecute');assert(profile&&entry);return '/** SPS §9.2 / D18: internal read operations and a fixed audit sink; no shell, subprocess or HostProfile synthesis. */\nimport * as path from "node:path";\nimport type {SafeBashArgs, SafeBashResult} from "./sf_safe_bash_types";\nimport {executeCommand, appendShellAudit} from "./sf_safe_bash_executor";\n'+profile.getText(src)+'\nexport type {HostProfile};\n\n'+entry.getText(src)+'\n';});
 plan(prefix+'sf_safe_bash_rules.ts',()=>`/** Retained syntax query. Execution and path/role/state authorization belong to the current controlled owners. */
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
`);
 plan(prefix+'sf_safe_bash_types.ts',text=>text.replace('详细规范见 docs/engineering-lessons/universal/shell-command-execution.md','当前合同：SPS §9.2 / D18。保留的内部类型不授予 Shell 或子进程执行能力。').replace('要执行的 shell 命令','内部只读操作文本，不是 Shell 命令').replace('环境变量增量（合并到当前 env）','保留输入字段；当前入口拒绝传入 env，不合并宿主环境').replace('stdin 输入（多数命令不需要）','保留输入字段；当前入口拒绝传入 stdin').replace('缺失时默认 \'agent\'。','真实角色由受控 Handler 校验，不从此字段授予身份。').replace('子进程退出码，被拦截或异常时为 null','内部操作结果码；无子进程，被拦截时为 null').replace('实际执行的命令（可能含编码注入前缀和自动包装）','原始操作文本，不进行编码注入或自动包装').replace('使用的 shell 名','保留结果字段；当前始终为 null').replace('true = 超时被强杀','true = 内部操作达到时间预算；未启动进程').replace('命令重写结果（不拒绝，但替换命令为更安全的版本）','历史类型投影；当前规则库不返回 rewrite，也不据此启动执行'));
}
plan('setup/userlevel-opencode/tools/lib/sf_design_gate_core.ts',text=>{const source=ts.createSourceFile('gate.ts',text,ts.ScriptTarget.Latest,true),fn=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='checkDesignGate');assert(fn?.body);const body=`{
  return {status:"blocked",blocking_issues:["LOCAL_DESIGN_GATE_NOT_CURRENT_OWNER"],warnings:[],next_action:"ask_user"};
}`;return '/** Retained pure content helpers. Current Design Gate execution belongs exclusively to the authenticated Daemon sf_design_gate handler. The legacy local file runner is closed. */\n'+text.slice(0,fn.body.getStart(source))+body+text.slice(fn.body.end);});
const dir=path.join(out,'retained-tool-libraries-before');assert(!fs.existsSync(dir));for(const c of changes){const dest=path.join(dir,c.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,c.before,{flag:'wx'});}
fs.writeFileSync(path.join(out,'retained-tool-libraries-plan.json'),JSON.stringify(changes.map(c=>({path:c.file,before_sha256:sha(c.before),after_sha256:sha(c.after)})),null,2)+'\n',{flag:'wx'});for(const c of changes){assert.equal(sha(fs.readFileSync(c.file)),sha(c.before));fs.writeFileSync(c.file,c.after);}console.log(JSON.stringify({changed:changes.length}));

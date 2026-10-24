const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('assert/strict');
const repo='D:/code/SpecForge',d='packages/daemon-core/src/tools/lib/',t='setup/userlevel-opencode/tools/lib/';
function replaceFunction(file,name,source){const f=path.join(repo,file),s=fs.readFileSync(f,'utf8'),ast=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true),nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(nodes.length,1,name);const n=nodes[0];fs.writeFileSync(f,s.slice(0,n.getStart(ast))+source+s.slice(n.end));}
const core=`export async function safeBashExecute(args: SafeBashArgs, baseDir: string): Promise<SafeBashResult> {
  const result = await executeCommand({command: args.command, cwd: path.resolve(baseDir, args.cwd ?? '.'), projectRoot: baseDir,
    timeoutMs: args.timeoutMs ?? 60000, outputLimit: args.outputLimit ?? 4096, env: args.env, stdin: args.stdin});
  return result;
}`;
replaceFunction(d+'sf_safe_bash_core.ts','safeBashExecute',core);
replaceFunction(t+'sf_safe_bash_core.ts','safeBashExecute',core);
fs.copyFileSync(path.join(repo,d+'sf_safe_bash_executor.ts'),path.join(repo,t+'sf_safe_bash_executor.ts'));
// The historical verifier library must never provide an alternative shell executor.
replaceFunction(t+'sf_verifier_execution_core.ts','execPromise',`async function execPromise(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await executeReadOnlyCommand({command, cwd: process.cwd(), timeoutMs: 120000, outputLimit: 65536});
  return {stdout: result.stdout, stderr: result.stderr || result.suggestion || result.rule || '', exitCode: result.exitCode ?? (result.timeout ? 124 : -1)};
}`);
let f=path.join(repo,t+'sf_verifier_execution_core.ts'),s=fs.readFileSync(f,'utf8');assert.ok(s.includes('import { exec } from "node:child_process"'));fs.writeFileSync(f,s.replace('import { exec } from "node:child_process"','import { executeCommand as executeReadOnlyCommand } from "./sf_safe_bash_executor"'));
// Persist caller decision and current phase without creating another current-status file.
fs.writeFileSync(path.join(__dirname,'decision-and-plan.txt'),`User decision: 先安全封堵：保留受控只读操作，无法隔离的脚本、构建和测试命令明确拒绝；不宣称这些执行功能可用。
CONFIRMED baseline installed inline/script/child writes on closed original-project copy.
RUNTIME_DEFECT: command-text target extraction is not a complete effects boundary; handler/core/template executor use ambient shell.
Plan: in-process finite read interpreter shared byte-for-byte in daemon/template; no process starts or fallback; all caller text and injected env/stdin denied outside the grammar. Historical verifier fallback uses same boundary. Preserve state/HardStop checks and refusal logs; audit read results. SPS/registry D18, tool/agent docs and package release consumers synchronized.
Validation: baseline effects then denial zero file writes for scripts/interpreters/children/compound commands/env/stdin/protected/report paths, active and closed state, both libraries, real installed HTTP, restart and six original issues. Positive reads/hash/list/text/timeouts; full regression/build/release/install and independent raw-byte review. Original project authority unchanged.
Writes: product source/tests/deployment/docs/version; evidence and isolated fixture truth; runtime observer logs only on original.
Stop: after final independent six-item review; no claim generic build/test available.
`);
f=path.join(repo,'docs/project-status.md');s=fs.readFileSync(f,'utf8');const fields={ACTIVE_INITIATIVE:'SHELL_WRITE_BOUNDARY_REPAIR',OBJECTIVE:'Apply approved D18 read-only containment; verify scripts interpreters child processes and six original acceptance issues.',CURRENT_PHASE:'IMPLEMENTATION_AND_REGRESSION',EXECUTION_STATE:'IN_PROGRESS',EXECUTION_RUN_ID:'CODEX-SF-20261024-SHELL-BOUNDARY-A01',EXECUTION_EVIDENCE_ROOT:'D:/code/SpecForge/.tmp/shell-boundary-repair-20261024',LAST_EXECUTION_CHECKPOINT:'Bootstrap READY at682846c5; unchanged full-read receipts verified; installed baseline scripts and children reproduced; user approved restricted read-only scope.',CURRENT_BLOCKER:'NONE',NEXT_LEGAL_ACTION:'Implement internal read-only executor and synchronize all consumers; test deploy and independently review six items.',NEXT_EXECUTION_STOP:'AFTER_REPAIR_DEPLOYMENT_AND_INDEPENDENT_SIX_REVIEW'};for(const[k,v]of Object.entries(fields))s=s.replace(new RegExp('^'+k+'=.*$','m'),k+'='+v);fs.writeFileSync(f,s);
fs.appendFileSync(path.join(repo,'docs/rule/specforge-development-error-ledger-and-experience.md'),'\n### ERR-1878：命令边界修复准备与执行范围冻结\n\n- 用户明确选择D18安全封堵；当前脚本、构建和测试功能不宣称可用。安装版基线在隔离副本重现内联、脚本、子进程三条写入。证据.tmp/shell-boundary-repair-20261024。\n- 组合大文件读取被截断，复用本会话已完整读取且SHA256一致的封存分块回执；不存在ToolSchemas和安装命令短名均为检索路径错误；WSL沙箱权限失败不证明缺少WSL。apply_patch同一路径delete/add被拒绝且未修改，改为顺序单动作。复用EXP-004/006/007/008/261/282/284。\n');

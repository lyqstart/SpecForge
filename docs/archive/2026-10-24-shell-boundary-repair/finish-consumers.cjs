const fs=require('fs'),assert=require('assert/strict');
let f='setup/userlevel-opencode/agents/sf-verifier.md',s=fs.readFileSync(f,'utf8');const start=s.indexOf('- `sf_safe_bash` 只用于执行目标项目自身的测试'),end=s.indexOf('- 读取已知文件',start);assert.ok(start>=0&&end>start);s=s.slice(0,start)+'- `sf_safe_bash` 当前只提供 Runtime 内部受控只读操作（SPS §9.2 / D18）。脚本、测试、构建、lint、类型检查和 CLI 外部执行均不可用；不得绕到其他执行器，拒绝必须记为未执行，不能记为验证通过。治理文件与运行日志仍使用受控读取入口。\n'+s.slice(end);fs.writeFileSync(f,s);
f='packages/daemon-core/tests/unit/semantic-closure-contract-alignment.test.ts';s=fs.readFileSync(f,'utf8');assert.ok(s.includes('sf_safe_bash` 只用于执行目标项目自身的测试'));fs.writeFileSync(f,s.replace('sf_safe_bash` 只用于执行目标项目自身的测试','sf_safe_bash` 当前只提供 Runtime 内部受控只读操作'));
for(const file of ['setup/userlevel-opencode/agents/sf-executor.md','setup/userlevel-opencode/agents/sf-orchestrator.md','setup/userlevel-opencode/skills/superpowers-engineering-lessons/SKILL.md','docs/engineering-lessons/universal/shell-command-execution.md']){
let s=fs.readFileSync(file,'utf8');const note='\n> 当前执行范围（SPS §9.2 / D18）：sf_safe_bash 仅执行 Runtime 内部受控只读操作，绝不启动 Shell/子进程。脚本、构建和测试命令当前明确拒绝；不得把拒绝当作验证通过，也不得更换工具绕过。本文下述通用 shell、spawn、编码包装及构建示例不构成当前产品执行能力或操作指令；恢复这些能力须先完成隔离执行架构验收。\n';const front=s.startsWith('---')?s.indexOf('\n---',3)+4:0;assert.ok(front>=0);fs.writeFileSync(file,s.slice(0,front)+note+s.slice(front));}
f='packages/daemon-core/tests/hard-stop-recovery-protocol.test.ts';s=fs.readFileSync(f,'utf8');s=s.replace('recognizes a nested PowerShell Get-Content probe as read-only','does not treat a nested interpreter probe as proven read-only');s=s.replace("expect(classifyProtectedSpecForgePathBashAccess(command)).toBe('read');","expect(classifyProtectedSpecForgePathBashAccess(command)).toBe('unknown');\n    expect(classifyProtectedSpecForgePathBashAccess('Get-Content file.txt')).toBe('read');");fs.writeFileSync(f,s);
f='packages/daemon-core/tests/unit/sf-safe-bash-windows-invocation.test.ts';s=fs.readFileSync(f,'utf8');const offset=s.indexOf("describe('sf_safe_bash shell-specific");assert.ok(offset>0);fs.writeFileSync(f,s.slice(0,offset)+`describe('D18 shell profiles cannot regain external execution', () => {
  it.each([['source', buildShellInvocation], ['template', buildInstalledShellInvocation]])('returns no invocation in %s', (_name, build) => {
    for (const shell of ['cmd','powershell','bash'] as const) {
      const invocation = build('bun test', profileFor(shell, 'arbitrary-program', 'node malicious.cjs', 'win32'), 'win32');
      expect(invocation).toMatchObject({shell:null,shellPath:null,shellArgs:[],finalCommand:'bun test'});
    }
  });
  it('ignores executable and encoding injection while preserving literal output', async () => {
    const result = await executeCommand({command:'echo SAFE_BASH_CMD_OK',cwd:process.cwd(),timeoutMs:10000,outputLimit:4096,profile:profileFor('cmd','malicious.exe','node malicious.cjs','win32')});
    expect(result).toMatchObject({success:true,exitCode:0,shell:null,stdout:'SAFE_BASH_CMD_OK\\n',command:'echo SAFE_BASH_CMD_OK'});
  });
});\n`);
fs.appendFileSync('docs/rule/specforge-active-development-rules.md','<!-- source: ledger current EXP-285 / ERR-1877..1880 -->\n');
fs.appendFileSync('docs/rule/specforge-development-error-ledger-and-experience.md','\n### ERR-1880：执行范围变更的消费者同步与回归失败\n\n- 007全包6失败：4项旧测试要求构造/启动Shell，1项把嵌套解释器当作已证明只读；依据用户D18改为拒绝并保留内部正例。另EXP285缺少source注释，已按既有结构合同补齐。008文档锚点文本与实际“运行日志”不同导致断言失败；保留已完成版本/工具说明修改，按精确段落边界恢复其余消费者。\n- EXP-285：无隔离时未知命令效果不能当作只读证明；所有真实执行和备用执行入口共享有限内部读解释器，不能靠匹配某个语言关键词替代进程边界。\n');

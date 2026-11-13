import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isValidV11TransitionForWorkflow } from '../src/tools/lib/state-machine-v11';
import { evaluateChangedFilesAuditVerdict } from '../src/tools/lib/changed-files-audit-verdict';
import { compileNodeCommand } from '../src/verification/node-command-contract';

const CONTRACT_START = '<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:START -->';
const CONTRACT_END = '<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->';

function daemonRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'src', 'tools'))) return cwd;
  const fromRepo = path.join(cwd, 'packages', 'daemon-core');
  if (existsSync(path.join(fromRepo, 'src', 'tools'))) return fromRepo;
  throw new Error(`Cannot locate packages/daemon-core from cwd=${cwd}`);
}

const DAEMON_ROOT = daemonRoot();
const REPO_ROOT = path.resolve(DAEMON_ROOT, '..', '..');
const USERLEVEL_ROOT = path.join(REPO_ROOT, 'setup', 'userlevel-opencode');

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/`/g, '');
}

function read(relativePath: string): string {
  const filePath = path.join(REPO_ROOT, relativePath);
  expect(existsSync(filePath), `missing file: ${relativePath}`).toBe(true);
  return normalizeText(readFileSync(filePath, 'utf8'));
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkMarkdown(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function relativeToRepo(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function targetMarkdownFiles(): string[] {
  const files: string[] = [];

  const agentsDir = path.join(USERLEVEL_ROOT, 'agents');
  files.push(...walkMarkdown(agentsDir));

  const rootAgents = path.join(USERLEVEL_ROOT, 'AGENTS.md');
  if (existsSync(rootAgents)) files.push(rootAgents);

  const skillsDir = path.join(USERLEVEL_ROOT, 'skills');
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      if (!entry.startsWith('sf-')) continue;
      const full = path.join(skillsDir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...walkMarkdown(full));
      }
    }
  }

  return [...new Set(files)].sort();
}

function contractBody(text: string): string {
  const start = text.indexOf(CONTRACT_START);
  const end = text.indexOf(CONTRACT_END);
  expect(start, 'missing contract start marker').toBeGreaterThanOrEqual(0);
  expect(end, 'missing contract end marker').toBeGreaterThan(start);
  return normalizeText(text.slice(start, end + CONTRACT_END.length));
}

function withoutContract(text: string): string {
  return text.replace(
    new RegExp(
      `${CONTRACT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CONTRACT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'g'
    ),
    ''
  );
}

describe('v1.1.5 Agent/Skill final governance contract alignment', () => {
  it('keeps finite-source boundaries and verifier raw evidence ownership consistent',()=>{
    const current=targetMarkdownFiles().filter(file=>readFileSync(file,'utf8').includes('### D18 / D23 verification ownership'));
    expect(current.length).toBeGreaterThan(10);
    for(const file of current){const body=contractBody(readFileSync(file,'utf8'));for(const token of ['SPS §9.2.7 / D26','readonly-node-command/v3','single-file-finite-local-keys/v1','verification-rejection/v1'])expect(body,relativeToRepo(file)).toContain(token);}
    const verifier=read('setup/userlevel-opencode/agents/sf-verifier.md');
    const role=verifier.split('你唯一允许写入的治理产物是自己拥有的')[1]?.split('## D23')[0]??'';
    for(const type of ['verification_report','evidence_manifest','verification_evidence','sf_artifact_write'])expect(role).toContain(type);
    expect(role).toContain('不能替代、复制伪造 Runtime 私有执行回执');
    const boundaries = verifier.split('# Boundaries')[1]?.split('# Required Output')[0] ?? '';
    for (const type of ['verification_report', 'evidence_manifest', 'verification_evidence', 'sf_artifact_write']) {
      expect(boundaries, 'The restrictive Boundaries list must preserve SPS §6.6 ownership').toContain(type);
    }
    expect(boundaries).toContain('合同要求的独立原始观测');
    expect(boundaries).toContain('不能替代、复制伪造 Runtime 私有执行回执');
    expect(boundaries).toContain('不得**通过 edit/shell 修改任何文件');
  });
  it('keeps D24 owner boundaries and published timing examples consistent with the real compiler', () => {
    const current = targetMarkdownFiles().filter(file => readFileSync(file,'utf8').includes('### D18 / D23 verification ownership'));
    expect(current.length).toBeGreaterThan(10);
    for(const file of current){
      const body=contractBody(readFileSync(file,'utf8'));
      for(const token of ['SPS §9.2.5 / D24','readonly-node-command/v2','single-file-bounded-monotonic-observation/v1','Legacy no-clock commands retain v1','not_executed is never passed'])expect(body,relativeToRepo(file)).toContain(token);
    }
    const examples=['agents/sf-task-planner.md','skills/superpowers-writing-plans/SKILL.md'].map(file=>{
      const text=readFileSync(path.join(USERLEVEL_ROOT,file),'utf8');
      const example=text.split('<!-- SPECFORGE_D24_TIMING_EXAMPLE:START -->')[1]?.split('<!-- SPECFORGE_D24_TIMING_EXAMPLE:END -->')[0]?.match(/```javascript\s*([\s\S]*?)```/)?.[1];
      expect(example,file).toBeDefined();return example!;
    });
    expect(examples[0]).toBe(examples[1]);
    const input=(name:string,content:string)=>({path:name,content,sha256:createHash('sha256').update(content).digest('hex')});
    const plan=compileNodeCommand('node --test example.cjs',[input('example.cjs',examples[0]!),input('core.cjs','function operation(n){return n+1;}module.exports={operation};')]);
    expect(plan.contract).toBe('readonly-node-command/v2');
    expect(plan.semanticProof.rule).toBe('single-file-bounded-monotonic-observation/v1');
  });
  it('keeps the base completion workflow on independent D23 owners without role-local shell execution', () => {
    const base = read('setup/userlevel-opencode/agents/_AGENT_BASE.md');
    const workflow = base.split('# 执行流程')[1]?.split('# 文档硬规则')[0] ?? '';
    for (const token of ['D18', 'D23', 'sf_verification_plan', 'sf_verification_run', 'sf-orchestrator', 'sf-verifier', 'not_executed', 'blocked']) {
      expect(base, token).toContain(token);
    }
    expect(workflow).not.toContain('代码 agent**：跑 verification_command');
    expect(workflow).not.toContain('我手跑了验证');
    expect(workflow).not.toContain('看不到真实副作用 → 回 Step 4');
    expect(workflow).toContain('partial');
    expect(base).not.toContain('D18 不允许借验证任务执行脚本、测试或构建');
    expect(base).not.toContain('verification_commands 中每条命令都必须执行');
    expect(base).not.toContain('.specforge/agents/AGENT_BASE.md');
    expect(base).not.toContain('当一个 agent 完成当前阶段的工作后，产出一份 Candidate');
    expect(base).toContain('Executor/Debugger');
  });

  it('aligns all current verification participants and their loaded debugging skill with the same owners', () => {
    const participants = ['agents/_AGENT_BASE.md', 'AGENTS.md', 'agents/sf-executor.md',
      'agents/sf-debugger.md', 'agents/sf-reviewer.md', 'agents/sf-task-planner.md',
      'agents/sf-orchestrator.md', 'agents/sf-verifier.md',
      'skills/superpowers-systematic-debugging/SKILL.md',
      'skills/superpowers-writing-plans/SKILL.md',
      'skills/superpowers-verification-before-completion/SKILL.md',
      'skills/sf-workflow-feature-spec/SKILL.md'];
    for (const file of participants) {
      const text = read('setup/userlevel-opencode/' + file);
      for (const token of ['D23', 'sf_verification_plan', 'sf_verification_run', 'sf-orchestrator', 'sf-verifier', 'blocked']) {
        expect(text, file + ' / ' + token).toContain(token);
      }
    }
  });

  it('covers the SPS current role inventory and informational shared boundaries without enabling future roles', () => {
    const sps = readFileSync(path.join(REPO_ROOT, 'docs/product-specification/specforge-product-specification.md'), 'utf8');
    const projection = JSON.parse(sps.split('<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->')[1]!.split('```json')[1]!.split('```')[0]!);
    const current: string[] = projection.itemGroups.filter((g: {classification: string}) => g.classification.startsWith('CURRENT_RELEASE'))
      .flatMap((g: {ids: string[]}) => g.ids).filter((id: string) => id.startsWith('agent:') || id.startsWith('agent-template:'));
    expect(current.length).toBeGreaterThan(0);
    for (const id of current) {
      const text = readFileSync(path.join(USERLEVEL_ROOT, 'agents', id.split(':')[1] + '.md'), 'utf8');
      const body = contractBody(text);
      expect(body, id).toContain('D18 / D23 verification ownership');
      expect(body, id).toContain('Other roles hand off');
      expect(body, id).toContain('does not reopen code permission or advance state');
    }
  });

  it('makes every current release Skill discoverable by its actual declared loader identity', () => {
    const sps = readFileSync(path.join(REPO_ROOT, 'docs/product-specification/specforge-product-specification.md'), 'utf8');
    const projection = JSON.parse(sps.split('<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->')[1]!.split('```json')[1]!.split('```')[0]!);
    const skills: string[] = projection.itemGroups.filter((g: {classification: string}) => g.classification.startsWith('CURRENT_RELEASE'))
      .flatMap((g: {ids: string[]}) => g.ids).filter((id: string) => id.startsWith('skill:'));
    expect(skills.length).toBeGreaterThan(0);
    for (const id of skills) {
      const name = id.slice('skill:'.length), text = readFileSync(path.join(USERLEVEL_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1];
      expect(frontmatter, name + ' must have real Skill metadata').toBeDefined();
      expect(frontmatter, name).toMatch(new RegExp('^name: ' + name + '\\s*$', 'm'));
      expect(frontmatter, name).toMatch(/^description: \S.+$/m);
    }
  });

  it('allows implementation handoff before verifier-owned evidence without claiming verified completion', () => {
    const executor = read('setup/userlevel-opencode/agents/sf-executor.md');
    const handoff = executor.split('## Implementation Handoff')[1]?.split('---')[0] ?? '';
    expect(handoff).toContain('sf_handoff');
    expect(handoff).toContain('not_executed');
    expect(handoff).toContain('sf-verifier');
    expect(executor).not.toContain('未通过验证不产出 Candidate');
    expect(executor).not.toContain('verification_command 真跑通且产生预期副作用');
    expect(executor).not.toContain('blocked_write_attempts 必须计入 violations');
  });

  it('keeps debugger reproduction, repair confirmation and examples from impersonating verifier execution', () => {
    const debuggerText = read('setup/userlevel-opencode/agents/sf-debugger.md');
    expect(debuggerText).not.toContain('修复后必须跑 verification_command');
    expect(debuggerText).not.toContain('修复后必须重新跑 verification_command');
    expect(debuggerText).not.toContain('失败的 task 重新跑 verification_command 真通过');
    const report = debuggerText.split('## Debugger Candidate Format')[1] ?? '';
    expect(report).toContain('not_executed');
    expect(report).not.toMatch(/"exit_code"\s*:\s*0/);
    expect(report).not.toMatch(/"passed"\s*:\s*true/);
  });

  it('keeps every shared audit paragraph consistent with resolved-history Runtime verdicts', () => {
    const audit = [
      '# Changed Files Audit', 'Contract: changed-files-audit/v1', 'Work Item: WI-0001',
      '## Result: PASS', '- Out of scope: 0', '- Violations: 0',
      '- Blocked write attempts: 1', '- Historical/resolved blocked write attempts: 1',
      '- Unresolved blocked write attempts: 0',
    ].join('\n');
    const accepted = evaluateChangedFilesAuditVerdict(audit, { expectedWorkItemId: 'WI-0001' });
    expect(accepted.passed).toBe(true);
    expect(accepted.blocked_write_attempts).toBe(1);
    expect(accepted.unresolved_blocked_write_attempts).toBe(0);
    expect(evaluateChangedFilesAuditVerdict(audit.replace('Unresolved blocked write attempts: 0',
      'Unresolved blocked write attempts: 1')).passed).toBe(false);
    const consumers = targetMarkdownFiles().map(file => ({
      file, body: contractBody(readFileSync(file, 'utf8')),
    })).filter(({ body }) => body.includes('sf_changed_files_audit'));
    expect(consumers.length).toBeGreaterThan(0);
    for (const { file, body } of consumers) {
      expect(body, relativeToRepo(file)).toMatch(/\bunresolved_blocked_write_attempts\s*=\s*0\b/);
      expect(body, relativeToRepo(file)).not.toMatch(/\bblocked_write_attempts\s*=\s*0\b/);
    }
  });

  it('compiles positive planning command examples with the real finite execution grammar', () => {
    const planner = readFileSync(path.join(USERLEVEL_ROOT, 'agents/sf-task-planner.md'), 'utf8');
    const writing = readFileSync(path.join(USERLEVEL_ROOT, 'skills/superpowers-writing-plans/SKILL.md'), 'utf8');
    const section = planner.split('## verification_commands Format')[1]?.split('<!-- SpecForge V7')[0];
    expect(section).toBeDefined();
    const commands = [...(section! + '\n' + writing).matchAll(/^\s*- `([^`\r\n]+)`[ \t]*$/gm)].map(m => m[1]!);
    commands.push(...[...section!.matchAll(/^\|[^|\r\n]+\|[ \t]*`([^`\r\n]+)`[ \t]*\|/gm)].map(m => m[1]!));
    commands.push(...[...section!.matchAll(/"command"\s*:\s*"([^"\r\n]+)"/g)].map(m => m[1]!));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      const entry = command.match(/ ([A-Za-z0-9_.\/-]+)$/)?.[1];
      const content = command.startsWith('node --test ')
        ? "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('example', () => { assert.equal(1, 1); });"
        : 'export function foo() { return 1; }\n';
      const sources = entry ? [{ path: entry, content, sha256: createHash('sha256').update(content).digest('hex') }] : [];
      expect(() => compileNodeCommand(command, sources), command).not.toThrow();
    }
    for (const command of ['bun test tests/unit/example.test.ts', 'tsc --noEmit',
      'node src/server.mjs &; sleep 1; curl -sf localhost:3000/health']) {
      expect(() => compileNodeCommand(command, []), command).toThrow('NODE_COMMAND_UNSUPPORTED');
    }
  });

  it('makes planning consumers state the current independent execution owners and unsupported boundary', () => {
    for (const file of ['setup/userlevel-opencode/agents/sf-task-planner.md',
      'setup/userlevel-opencode/skills/superpowers-writing-plans/SKILL.md']) {
      const text = read(file);
      expect(text, file).toContain('sf_verification_plan');
      expect(text, file).toContain('sf_verification_run');
      expect(text, file).toContain('not_executed');
      expect(text, file).toContain('blocked');
      expect(text, file).toContain('D23');
    }
  });

  it('keeps positive formal-verification delegation aligned with the D23 entry and consumer prerequisites', () => {
    expect(isValidV11TransitionForWorkflow('implementation_done', 'verification_running', 'feature_spec')).toBe(true);
    const skill = read('setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md');
    const section = skill.match(/### 阶段 10：[\s\S]*?(?=### 阶段 11：)/)?.[0];
    expect(section).toBeDefined();
    expect(section).toContain('sf_verification_plan');
    expect(section).toContain('sf_verification_run');
    expect(section!.indexOf('sf_code_permission')).toBeLessThan(section!.indexOf('sf_verification_plan'));
    expect(section).toContain('contract_reviews');
    expect(section).not.toContain('D18 禁止脚本、测试和构建执行');
    expect(section!.indexOf('sf_changed_files_audit')).toBeGreaterThanOrEqual(0);
    expect(section!.indexOf('sf_changed_files_audit')).toBeLessThan(section!.indexOf('sf_semantic_closure_run'));
  });

  it('keeps the orchestrator positive closure sequence on the same D23 and audit owners', () => {
    const orchestrator = readFileSync(path.join(REPO_ROOT, 'setup/userlevel-opencode/agents/sf-orchestrator.md'), 'utf8').replace(/\r\n/g, '\n');
    const sequence = orchestrator.match(/实现后的收口顺序是：[\s\S]*?```text\n([\s\S]*?)```/)?.[1];
    expect(sequence).toBeDefined();
    expect(sequence).toContain('sf_verification_plan');
    expect(sequence).toContain('sf_verification_run');
    expect(sequence!.indexOf('sf_code_permission')).toBeLessThan(sequence!.indexOf('sf_verification_plan'));
    expect(sequence!.indexOf('sf_changed_files_audit')).toBeGreaterThanOrEqual(0);
    expect(sequence!.indexOf('sf_changed_files_audit')).toBeLessThan(sequence!.indexOf('sf_semantic_closure_run'));
  });

  it('keeps the positive feature workflow Close steps owned by Close Gate', () => {
    const skill = read('setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md');
    const section = skill.match(/### 阶段 11：[\s\S]*?(?=<!-- SPECFORGE_V11_GOVERNANCE_POLICY_START -->)/)?.[0];
    expect(section, 'current positive Close instructions must exist').toBeDefined();
    expect(section).toContain('sf_close_gate');
    expect(section).toContain('sf_state_read');
    expect(section, 'Close Gate owns the closed event; no extra manual transition').not.toContain('sf_state_transition');
    expect(section).not.toMatch(/to_state\s*[:=]\s*["']closed["']/);
    expect(section, 'dedicated invalid-closure recovery must remain possible').not.toContain('一旦进入不可回退');
  });

  it('has target Agent/Skill markdown files to govern', () => {
    const files = targetMarkdownFiles().map(relativeToRepo);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('setup/userlevel-opencode/agents/sf-orchestrator.md'))).toBe(
      true
    );
    expect(
      files.some(f => f.includes('setup/userlevel-opencode/skills/sf-workflow-feature-spec/'))
    ).toBe(true);
  });

  it('task planning examples use typed verification_commands', () => {
    const planner = read('setup/userlevel-opencode/agents/sf-task-planner.md');
    const requirements = read('setup/userlevel-opencode/agents/sf-requirements.md');
    const design = read('setup/userlevel-opencode/agents/sf-design.md');
    const writingPlans = read(
      'setup/userlevel-opencode/skills/superpowers-writing-plans/SKILL.md'
    );
    for (const text of [planner, writingPlans]) {
      expect(text).toContain('- unit:');
      expect(text).toContain('- integration:');
      expect(text).toContain('property');
      expect(text).toContain('CP-<MODULE_CODE>-<NNN>');
    }
    expect(planner).not.toContain('- 检查 server.mjs 文件存在');
    expect(requirements).toContain('REQ-<MODULE_CODE>-<NNN>');
    expect(design).toContain('DD-<MODULE_CODE>-<NNN>');
    expect(planner).toContain('TASK-WI-NNNN-NNN');
    expect(planner).toContain('- **refs**: [DD-WEB-001, REQ-WEB-001]');
  });

  it('injects the final governance contract into every userlevel SpecForge Agent and Skill markdown file', () => {
    const required = [
      'StateManager/events.jsonl',
      'runtime/state.json',
      'workflow_type',
      'workflow_path',
      'sf_user_decision_record',
      'sf_code_permission',
      'AUTHORITATIVE_STATE_MISMATCH',
      'closed',
      'sf_hard_stop_resolve',
    ];

    for (const file of targetMarkdownFiles()) {
      const rel = relativeToRepo(file);
      const text = normalizeText(readFileSync(file, 'utf8'));
      expect(text, `${rel} missing contract start`).toContain(CONTRACT_START);
      expect(text, `${rel} missing contract end`).toContain(CONTRACT_END);

      const body = contractBody(text);
      for (const needle of required) {
        expect(body, `${rel} contract missing ${needle}`).toContain(needle);
      }

      expect(
        body.includes('work_item.json is metadata only') ||
          body.includes('work_item.json 只保存元数据'),
        `${rel} contract missing work_item metadata-only rule`
      ).toBe(true);
    }
  });

  it('does not leave explicit legacy mainline transition instructions in governed Agent/Skill prose outside the contract block', () => {
    const forbiddenPatterns = [
      /\bdevelopment\s*[-=]+>\s*review\b/i,
      /\breview\s*[-=]+>\s*implementation\b/i,
      /\bimplementation\s*[-=]+>\s*done\b/i,
      /\bto_state\s*[:=]\s*['"]development['"]/i,
      /\bto_state\s*[:=]\s*['"]review['"]/i,
      /\bto_state\s*[:=]\s*['"]implementation['"]/i,
      /\bto_state\s*[:=]\s*['"]done['"]/i,
      /\bmanual(?:ly)?\s+advance\s+approved\s*[-=]+>\s*merge_ready\b/i,
      /\bwork_item\.json\.status\s+is\s+the\s+(?:source of truth|authoritative state)\b/i,
      /\bcomments\s+as\s+user_response_quote\b/i,
      /\breason\s+as\s+user_response_quote\b/i,
    ];

    for (const file of targetMarkdownFiles()) {
      const rel = relativeToRepo(file);
      const text = withoutContract(normalizeText(readFileSync(file, 'utf8')));
      for (const pattern of forbiddenPatterns) {
        expect(text, `${rel} contains forbidden legacy instruction ${pattern}`).not.toMatch(
          pattern
        );
      }
    }
  });

  it('keeps professional Candidate writers on controlled Tools and Runtime-owned Manifest materialization', () => {
    const design = read('setup/userlevel-opencode/agents/sf-design.md');
    const requirements = read('setup/userlevel-opencode/agents/sf-requirements.md');
    const taskPlanner = read('setup/userlevel-opencode/agents/sf-task-planner.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const featureSkill = read(
      'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md'
    );

    expect(design).toContain('本 Agent 不得调用 sf_safe_bash');
    expect(design).toContain('Candidate 写入只能调用 sf_artifact_write');
    expect(design).toContain('candidate_manifest.json 由 Runtime');
    expect(featureSkill).toContain('candidate_manifest.entries');
    expect(featureSkill).toContain('candidate_preparing → candidate_prepared');
    expect(featureSkill).not.toContain(
      '主编排代理在正确阶段通过受控写入形成 candidate_manifest.json'
    );
    for (const professional of [requirements, design, taskPlanner]) {
      expect(professional).toContain('sf_handoff(action=write)');
    }
    expect(orchestrator).toContain('sf_handoff(action=validate_all, expected_agent=');
  });

  it('keeps sf-orchestrator on read-only evidence tools in restricted states', () => {
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');

    expect(orchestrator).toContain('只能使用 read/debug 工具');
    expect(orchestrator).toContain('不得调用 sf_safe_bash');
    expect(orchestrator).toContain('certutil -hashfile');
    expect(orchestrator).toContain('Get-FileHash');
    expect(orchestrator).toContain('HASH_EVIDENCE_UNAVAILABLE');
    expect(orchestrator).toContain('完整内容快照');
    expect(orchestrator).toContain('用户提示中的“记录哈希”不能覆盖 Runtime 的 Tool 边界');
    expect(orchestrator).toContain('子任务必须显式重复以下工具边界');
    expect(orchestrator).toContain('不得把“只读验证”作为省略该边界的理由');
  });

  it('keeps setup wrappers aligned with final governance fields', () => {
    const transitionWrapper = read('setup/userlevel-opencode/tools/sf_state_transition.ts');
    expect(transitionWrapper).toContain('workflow_type');
    expect(transitionWrapper).toContain('workflow_path');

    const decisionWrapper = read('setup/userlevel-opencode/tools/sf_user_decision_record.ts');
    expect(decisionWrapper).toContain('user_response_quote');
    expect(decisionWrapper).toContain('auto_approval_policy_id');
    expect(decisionWrapper).toContain('comments');
    expect(decisionWrapper).toContain('reason');

    const mergeWrapper = read('setup/userlevel-opencode/tools/sf_merge_run.ts');
    expect(mergeWrapper).toContain('work_item_id');

    const permissionWrapper = read('setup/userlevel-opencode/tools/sf_code_permission.ts');
    expect(permissionWrapper).toContain('allowed_write_files');
    expect(permissionWrapper).toContain('recover_legacy_filesystem_mode');
    expect(permissionWrapper).toContain('confirm_legacy_filesystem_recovery');
    expect(permissionWrapper).toContain('recovery_reason');

    const closeWrapper = read('setup/userlevel-opencode/tools/sf_close_gate.ts');
    expect(closeWrapper).toContain('work_item_id');

    const handoffWrapper = read('setup/userlevel-opencode/tools/sf_handoff.ts');
    expect(handoffWrapper).toContain('daemon.invokeTool("sf_handoff"');
    expect(handoffWrapper).toContain('"write"');
    expect(handoffWrapper).toContain('"validate_all"');
  });

  it('keeps daemon handlers aligned with the contract-enforced workflow', () => {
    const stateTransition = read('packages/daemon-core/src/tools/handlers/sf-state-transition.ts');
    expect(stateTransition).not.toMatch(/workflowEngine\.transitionFull\s*\(/);
    expect(stateTransition).toContain('workflow_engine_transition_full_used: false');
    expect(stateTransition).toContain('WORKFLOW_TYPE_PATH_CONFLICT');

    const merge = read('packages/daemon-core/src/tools/handlers/sf-v11-merge.ts');
    expect(merge).toContain('merge_not_applicable');
    expect(merge).toContain('approved');
    expect(merge).toContain('merge_ready');
    expect(merge).toContain('merging');
    expect(merge).toContain('merged');

    const decision = read('packages/daemon-core/src/tools/handlers/sf-v11-decision.ts');
    expect(decision).toContain('USER_APPROVED_REQUIRES_EXPLICIT_USER_RESPONSE_QUOTE');
    expect(decision).toContain('AUTO_APPROVED_REQUIRES_POLICY_ID');

    const metadataContract = read('packages/types/src/work-item-metadata-contract.ts');
    expect(metadataContract).toContain('WORK_ITEM_CANNOT_CARRY_USER_DECISION');
    expect(metadataContract).toContain('WORK_ITEM_STATUS_MUTATION_FORBIDDEN');

    const artifactSchemaAdapter = read(
      'packages/daemon-core/src/tools/lib/artifact-schema-validation.ts'
    );
    expect(artifactSchemaAdapter).toContain('validateCurrentWorkItemMetadataJson');
    expect(artifactSchemaAdapter).toContain(
      'return validateCurrentWorkItemMetadataJson(content, expectedWorkItemId)'
    );

    const closeGate = read('packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts');
    expect(closeGate).toContain('AUTHORITATIVE_STATE_MISMATCH');
    expect(closeGate).toContain('current_state_not_verification_done');

    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    expect(orchestrator).toContain('recover_legacy_filesystem_mode');
    expect(orchestrator).toContain('不得调用 sf_git_branch_create');
    expect(orchestrator).toContain('filesystem 或 legacy-recovered filesystem WI 不进入 Git 交付链');
  });

  it('keeps Contract consumer truth-source and manual-review rules aligned in Agents and Skills', () => {
    const design = read('setup/userlevel-opencode/agents/sf-design.md');
    const planner = read('setup/userlevel-opencode/agents/sf-task-planner.md');
    const verifier = read('setup/userlevel-opencode/agents/sf-verifier.md');
    const feature = read('setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md');

    expect(design).toContain('DD-* constrained_by Contract-ID');
    expect(design).toContain('Trace 唯一真相源');
    const traceOwnerSection = design.split('# Contract 消费者与 Trace 唯一真相源')[1]?.split(/\n# /)[0] ?? '';
    expect(traceOwnerSection).toContain('sf-task-planner');
    expect(traceOwnerSection).toContain('candidates/trace_delta.md');
    expect(traceOwnerSection).toMatch(/\bADD\b/);
    expect(traceOwnerSection).toMatch(/\bREMOVE\b/);
    expect(planner).toContain('全部消费 DD');
    expect(planner).toContain('allowed_write_files');
    expect(verifier).toContain('verification_report.contract_reviews');
    expect(verifier).toContain('NO_CONTRACT_USAGE');
    expect(verifier).toContain('Fail Closed');
    expect(feature).toContain('Current Governance Relations + ADD - REMOVE');
    expect(feature).toContain('Module trace.md');
  });

  it('aligns detached bootstrap fields across actual wrappers, handlers, orchestrator and workflow', () => {
    const plan = read('setup/userlevel-opencode/tools/sf_git_branch_plan.ts');
    const create = read('setup/userlevel-opencode/tools/sf_git_branch_create.ts');
    const planHandler = read('packages/daemon-core/src/tools/handlers/sf-git-branch-plan.ts');
    const createHandler = read('packages/daemon-core/src/tools/handlers/sf-git-branch-create.ts');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const workflow = read('setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md');
    for (const field of ['bootstrap_from_detached', 'expected_head', 'base_branch', 'branch_name']) {
      expect(plan).toContain(field + ': tool.schema.'); expect(planHandler).toContain("args['" + field + "']");
      expect(orchestrator).toContain(field); expect(workflow).toContain(field);
    }
    for (const field of ['bootstrap_plan_sha256', 'bootstrap_confirmation_quote']) {
      expect(create).toContain(field + ': tool.schema.'); expect(createHandler).toContain("args['" + field + "']");
      expect(orchestrator).toContain(field); expect(workflow).toContain(field);
    }
  });

});

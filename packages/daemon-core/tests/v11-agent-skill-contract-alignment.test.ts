import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
    new RegExp(`${CONTRACT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CONTRACT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
    '',
  );
}

describe('v1.1.5 Agent/Skill final governance contract alignment', () => {
  it('has target Agent/Skill markdown files to govern', () => {
    const files = targetMarkdownFiles().map(relativeToRepo);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('setup/userlevel-opencode/agents/sf-orchestrator.md'))).toBe(true);
    expect(files.some((f) => f.includes('setup/userlevel-opencode/skills/sf-workflow-quick-change/'))).toBe(true);
  });

  it('injects the final governance contract into every userlevel SpecForge Agent and Skill markdown file', () => {
    const required = [
      'StateManager/events.jsonl',
      'runtime/state.json',
      'work_item.json is metadata only',
      'workflowEngine.transitionFull()',
      'development',
      'review',
      'implementation',
      'done',
      'workflow_type',
      'workflow_path',
      'quick_change',
      'code_only_fast_path',
      'bugfix_spec',
      'sf_user_decision_record',
      'user_response_quote',
      'auto_approval_policy_id',
      'comments',
      'reason',
      'candidate_manifest.entries',
      'merge_report.status=not_applicable',
      'sf_merge_run',
      'approved -> merge_ready -> merging -> merged',
      'sf_code_permission',
      'sf_changed_files_audit',
      'blocked_write_attempts=0',
      'AUTHORITATIVE_STATE_MISMATCH',
      'closed',
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
        expect(text, `${rel} contains forbidden legacy instruction ${pattern}`).not.toMatch(pattern);
      }
    }
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

    const closeWrapper = read('setup/userlevel-opencode/tools/sf_close_gate.ts');
    expect(closeWrapper).toContain('work_item_id');
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

    const artifactWrite = read('packages/daemon-core/src/tools/lib/artifact-schema-validation.ts');
    expect(artifactWrite).toContain('WORK_ITEM_CANNOT_CARRY_USER_DECISION');
    expect(artifactWrite).toContain('WORK_ITEM_STATUS_MUTATION_FORBIDDEN');

    const closeGate = read('packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts');
    expect(closeGate).toContain('AUTHORITATIVE_STATE_MISMATCH');
    expect(closeGate).toContain('current_state_not_verification_done');
  });
});

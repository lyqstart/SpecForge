import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function daemonRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'src', 'tools'))) return cwd;
  const fromRepo = path.join(cwd, 'packages', 'daemon-core');
  if (existsSync(path.join(fromRepo, 'src', 'tools'))) return fromRepo;
  throw new Error(`Cannot locate packages/daemon-core from cwd=${cwd}`);
}

const DAEMON_ROOT = daemonRoot();
const REPO_ROOT = path.resolve(DAEMON_ROOT, '..', '..');
const SETUP_ROOT = path.join(REPO_ROOT, 'setup', 'userlevel-opencode');

function read(relativePath: string): string {
  const filePath = path.join(REPO_ROOT, relativePath);
  expect(existsSync(filePath), `missing file: ${relativePath}`).toBe(true);
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(REPO_ROOT, relativePath));
}

function shouldSkipDir(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/node_modules/') ||
    normalized.includes('/.git/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/coverage/') ||
    normalized.includes('/.specforge/work-items/') ||
    normalized.includes('/.specforge/logs/')
  );
}

function walkFiles(dir: string, predicate: (filePath: string) => boolean = () => true): string[] {
  if (!existsSync(dir) || shouldSkipDir(dir)) return [];
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (shouldSkipDir(full)) continue;

    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      out.push(...walkFiles(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function relativeToRepo(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

describe('v1.1.6 install/deployment consistency', () => {
  it('keeps userlevel setup source layout complete', () => {
    expect(exists('setup/userlevel-opencode')).toBe(true);
    expect(exists('setup/userlevel-opencode/agents')).toBe(true);
    expect(exists('setup/userlevel-opencode/skills')).toBe(true);
    expect(exists('setup/userlevel-opencode/tools')).toBe(true);
    expect(exists('setup/userlevel-opencode/templates')).toBe(true);

    const agentFiles = walkFiles(path.join(SETUP_ROOT, 'agents'), (f) => f.endsWith('.md'));
    const skillFiles = walkFiles(path.join(SETUP_ROOT, 'skills'), (f) => f.endsWith('.md'));
    const toolFiles = walkFiles(path.join(SETUP_ROOT, 'tools'), (f) => f.endsWith('.ts'));
    const templateFiles = walkFiles(path.join(SETUP_ROOT, 'templates'));

    expect(agentFiles.length).toBeGreaterThanOrEqual(5);
    expect(skillFiles.length).toBeGreaterThanOrEqual(5);
    expect(toolFiles.length).toBeGreaterThanOrEqual(8);
    expect(templateFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps required final-governance tool wrappers present and schema-aligned', () => {
    const requiredTools = [
      'sf_state_transition.ts',
      'sf_user_decision_record.ts',
      'sf_merge_run.ts',
      'sf_code_permission.ts',
      'sf_changed_files_audit.ts',
      'sf_close_gate.ts',
      'sf_artifact_write.ts',
      'sf_gate_run.ts',
    ];

    for (const tool of requiredTools) {
      expect(exists(`setup/userlevel-opencode/tools/${tool}`), `missing setup wrapper ${tool}`).toBe(true);
    }

    const transition = read('setup/userlevel-opencode/tools/sf_state_transition.ts');
    expect(transition).toContain('workflow_type');
    expect(transition).toContain('workflow_path');
    expect(transition).toContain('from_state');
    expect(transition).toContain('to_state');

    const decision = read('setup/userlevel-opencode/tools/sf_user_decision_record.ts');
    expect(decision).toContain('user_response_quote');
    expect(decision).toContain('auto_approval_policy_id');
    expect(decision).toContain('comments');
    expect(decision).toContain('reason');

    const permission = read('setup/userlevel-opencode/tools/sf_code_permission.ts');
    expect(permission).toContain('allowed_write_files');

    const closeGate = read('setup/userlevel-opencode/tools/sf_close_gate.ts');
    expect(closeGate).toContain('work_item_id');
  });

  it('keeps Agent/Skill final governance contract block installed in userlevel sources', () => {
    const contractStart = '<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:START -->';
    const contractEnd = '<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->';

    const targets: string[] = [];
    const rootAgents = path.join(SETUP_ROOT, 'AGENTS.md');
    if (existsSync(rootAgents)) targets.push(rootAgents);
    targets.push(...walkFiles(path.join(SETUP_ROOT, 'agents'), (f) => f.endsWith('.md')));

    const skillsDir = path.join(SETUP_ROOT, 'skills');
    for (const entry of existsSync(skillsDir) ? readdirSync(skillsDir) : []) {
      if (!entry.startsWith('sf-')) continue;
      const full = path.join(skillsDir, entry);
      if (statSync(full).isDirectory()) targets.push(...walkFiles(full, (f) => f.endsWith('.md')));
    }

    expect(targets.length).toBeGreaterThan(0);

    for (const filePath of targets) {
      const rel = relativeToRepo(filePath);
      const text = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
      expect(text, `${rel} missing contract start`).toContain(contractStart);
      expect(text, `${rel} missing contract end`).toContain(contractEnd);
      expect(text.replace(/`/g, ''), `${rel} missing state authority`).toContain('StateManager/events.jsonl');
      expect(text.replace(/`/g, ''), `${rel} missing work_item metadata rule`).toContain('work_item.json is metadata only');
      expect(text.replace(/`/g, ''), `${rel} missing close-gate mismatch rule`).toContain('AUTHORITATIVE_STATE_MISMATCH');
    }
  });

  it('keeps observability template available for project initialization and userlevel deployment', () => {
    const candidates = [
      'templates/.specforge/config/observability.json',
      'setup/userlevel-opencode/templates/.specforge/config/observability.json',
    ];

    for (const candidate of candidates) {
      expect(exists(candidate), `missing observability template ${candidate}`).toBe(true);
      const parsed = JSON.parse(read(candidate));
      expect(parsed.schema_version).toBe('1.1');
      expect(parsed.enabled).toBe(true);
    }
  });

  it('keeps installer commands and userlevel deployment entry points available', () => {
    const installer = read('scripts/sf-installer.ts');
    for (const word of ['install', 'upgrade', 'verify', 'uninstall']) {
      expect(installer, `installer missing command ${word}`).toContain(word);
    }

    expect(installer).toContain('setup');
    expect(installer).toContain('userlevel-opencode');
    expect(installer).toContain('plugins');
    expect(installer).toContain('agents');
    expect(installer).toContain('tools');
  });

  it('keeps handshake path aligned to the userlevel sf-user runtime location', () => {
    const sourceRoots = [
      path.join(REPO_ROOT, 'packages'),
      path.join(REPO_ROOT, 'setup'),
      path.join(REPO_ROOT, 'scripts'),
      path.join(REPO_ROOT, 'docs'),
    ];

    const sourceFiles = sourceRoots.flatMap((root) =>
      walkFiles(root, (filePath) => /\.(ts|md|json)$/.test(filePath)),
    );

    const matches = sourceFiles
      .map((filePath) => ({ filePath, text: readFileSync(filePath, 'utf8') }))
      .filter(({ text }) => text.includes('sf-user') && text.includes('handshake'));

    expect(
      matches.length,
      'expected at least one source file to reference sf-user handshake runtime path',
    ).toBeGreaterThan(0);
  });

  it('keeps final governance regression tests present before deployment release', () => {
    expect(exists('packages/daemon-core/tests/v11-final-governance-regression.test.ts')).toBe(true);
    expect(exists('packages/daemon-core/tests/v11-agent-skill-contract-alignment.test.ts')).toBe(true);
  });
});

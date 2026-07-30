import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { changedFilesFromFacts } from '../../src/tools/handlers/sf-changed-files-audit.js';
import { inspectFormalGitBinding } from '../../src/tools/lib/project-governance-v2.js';
import { saveBaseline, takeSnapshot } from '../../src/tools/lib/filesystem-diff.js';
import { transitionWithEvidence } from '../../src/tools/lib/state-coordinator-v11.js';
import { runRequiredGates } from '../../src/tools/lib/gate-runner-v11.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root });
  return String(stdout ?? '').trim();
}

describe('formal version Git closure regressions', () => {
  let projectRoot: string;
  let workItemDir: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-formal-git-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0002');
    await fs.mkdir(path.join(workItemDir, 'gates'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('uses the filesystem baseline when successful Write Guard facts are absent', async () => {
    saveBaseline(workItemDir, takeSnapshot(projectRoot));
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.ts'), 'export const value = 1;\n');

    const facts = changedFilesFromFacts({
      projectRoot,
      workItemDir,
      wiJson: {},
      actualChangedFiles: undefined,
    });

    expect(facts.dataSource).toContain('filesystem_baseline.json');
    expect(facts.changedFiles).toEqual([{ path: 'src/main.ts', operation: 'create' }]);
  });

  it('fails closed when neither a filesystem baseline nor trusted write facts exist', async () => {
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        work_item_id: 'WI-0002',
        code_permission_revoked: true,
        allowed_write_files_snapshot: [{ path: 'src/main.ts', operation: 'create' }],
      }),
    );
    const handler = getHandler('sf_changed_files_audit')!;

    const missingEvidence = await handler(
      { work_item_id: 'WI-0002' },
      { directory: projectRoot },
      {},
    );
    expect((missingEvidence as any).success).toBe(true);
    expect((missingEvidence as any).passed).toBe(false);
    expect((missingEvidence as any).violations).toContain(
      'changed_file_evidence_unavailable: filesystem_baseline.json or trusted Write Guard facts required',
    );

    saveBaseline(workItemDir, takeSnapshot(projectRoot));
    const provenNoChanges = await handler(
      { work_item_id: 'WI-0002' },
      { directory: projectRoot },
      {},
    );
    expect((provenNoChanges as any).passed).toBe(true);
    expect((provenNoChanges as any).data_source).toContain('0 observed project changes');
  });

  it('rejects observed implementation files until they are committed on the WI branch', async () => {
    await git(projectRoot, ['init', '-b', 'main']);
    await git(projectRoot, ['config', 'user.name', 'SpecForge Test']);
    await git(projectRoot, ['config', 'user.email', 'specforge-test@example.invalid']);
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n');
    await git(projectRoot, ['add', '--', 'README.md']);
    await git(projectRoot, ['commit', '-m', 'chore: baseline']);
    const baseCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    await git(projectRoot, ['switch', '-c', 'feature/workdesk-wi-0002']);
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.ts'), 'export const value = 1;\n');

    const gitContext = {
      git_enabled: true,
      branch_name: 'feature/workdesk-wi-0002',
      base_commit: baseCommit,
    };
    const beforeCommit = await inspectFormalGitBinding({
      projectRoot,
      gitContext,
      implementationFiles: ['src/main.ts'],
    });
    expect(beforeCommit.missing_from_commit).toEqual(['src/main.ts']);
    expect(beforeCommit.uncommitted_implementation_files).toEqual(['src/main.ts']);

    await git(projectRoot, ['add', '--', 'src/main.ts']);
    await git(projectRoot, ['commit', '-m', 'feat: implement workdesk']);
    const afterCommit = await inspectFormalGitBinding({
      projectRoot,
      gitContext,
      implementationFiles: ['src/main.ts'],
    });
    expect(afterCommit.base_is_ancestor).toBe(true);
    expect(afterCommit.missing_from_commit).toEqual([]);
    expect(afterCommit.uncommitted_implementation_files).toEqual([]);
  });

  it('does not skip the formal-version close guard when trigger_result lacks impact_scope', async () => {
    await fs.writeFile(
      path.join(workItemDir, 'trigger_result.json'),
      JSON.stringify({ impact_summary: { scope: 'greenfield' } })
    );
    await fs.writeFile(
      path.join(workItemDir, 'governance_scope.json'),
      JSON.stringify({ active: true })
    );
    await fs.writeFile(path.join(workItemDir, 'close_gate.md'), '# Close Gate Evidence\n');
    await fs.writeFile(
      path.join(workItemDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify({ status: 'failed' })
    );
    const deps = {
      projectManager: {
        getProjectStateManager: async () => ({
          transition: async () => undefined,
        }),
      },
    };

    await expect(
      transitionWithEvidence({
        deps,
        projectRoot,
        workItemId: 'WI-0002',
        workItemDir,
        fromState: 'verification_done',
        toState: 'closed',
        workflowType: 'architecture_change',
        actorRole: 'close_gate',
        evidence: 'close gate passed',
      })
    ).rejects.toThrow('formal_version_gate must pass');
  });

  it('rebuilding gate_summary preserves current Gate reports and removes summary self-dependency', async () => {
    const report = (gateId: string) => ({
      schema_version: '1.0',
      work_item_id: 'WI-0002',
      gate_id: gateId,
      gate_type: 'hard_gate',
      required: true,
      status: 'passed',
      input_files: [],
      checks: [],
      blocking_issues: [],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      runner: 'gate_runner',
    });
    await fs.writeFile(
      path.join(workItemDir, 'gates', 'verification_gate.json'),
      JSON.stringify(report('verification_gate'))
    );
    await fs.writeFile(
      path.join(workItemDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify(report('formal_version_gate'))
    );
    await fs.writeFile(
      path.join(workItemDir, 'gate_summary.md'),
      '# Gate Summary\n\nOverall Status: passed\n'
    );

    await runRequiredGates(['gate_summary_gate'], {
      projectRoot,
      workItemDir,
      workItemId: 'WI-0002',
      workflowPath: 'architecture_change_path',
      workflowType: 'architecture_change',
      candidatePhase: 'full',
    });

    const summary = await fs.readFile(path.join(workItemDir, 'gate_summary.md'), 'utf-8');
    expect(summary).toContain('### verification_gate');
    expect(summary).toContain('### formal_version_gate');
    expect(summary).toContain('### gate_summary_gate');
  });

  it('routes implementation checkpoint and invalid-closure recovery through controlled tools', async () => {
    const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const instructionFiles = [
      path.join(repositoryRoot, 'setup', 'userlevel-opencode', 'agents', 'sf-orchestrator.md'),
      path.join(
        repositoryRoot,
        'setup',
        'userlevel-opencode',
        'skills',
        'sf-workflow-architecture-change',
        'SKILL.md',
      ),
    ];

    for (const instructionFile of instructionFiles) {
      const content = await fs.readFile(instructionFile, 'utf-8');
      expect(content).toContain('sf_git_checkpoint_commit');
      expect(content).toContain('recover_invalid_closure');
      expect(content).toContain('closure_recovery.json');
    }

    const rbacModel = await fs.readFile(
      path.join(repositoryRoot, 'docs', 'design', 'workflow-runtime-rbac-model.md'),
      'utf-8',
    );
    expect(rbacModel).toContain('terminal for normal workflow transitions');
    expect(rbacModel).toContain('closed → implementation_ready');
  });
});

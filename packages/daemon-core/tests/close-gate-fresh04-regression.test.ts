import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCloseGate } from '../src/tools/lib/close-gate.js';
import { runChangedFilesAudit } from '../src/tools/lib/changed-files-audit.js';
import {
  readTrustedGitGovernanceProjectWrites,
  recordGitGovernanceProjectWrites,
} from '../src/tools/lib/git-governance-write-provenance.js';

describe('Fresh-04 Close Gate regressions', () => {
  let projectRoot: string;
  let workItemDir: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-fresh04-close-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-TEST');
    await mkdir(workItemDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('treats official Git-governance metadata as trusted control-plane writes', async () => {
    const projectDir = path.join(projectRoot, '.specforge', 'project');
    await mkdir(projectDir, { recursive: true });
    const metadata = [
      '.specforge/project/git_policy.json',
      '.specforge/project/git_adoption_report.md',
      '.specforge/project/git_ignore_decisions.json',
    ];

    await writeFile(path.join(projectDir, 'git_policy.json'), '{"mode":"governed"}\n', 'utf-8');
    await writeFile(path.join(projectDir, 'git_adoption_report.md'), '# Adoption\n', 'utf-8');
    await writeFile(path.join(projectDir, 'git_ignore_decisions.json'), '{"decisions":[]}\n', 'utf-8');

    recordGitGovernanceProjectWrites(projectRoot, 'sf_git_project_adopt', metadata.slice(0, 2));
    recordGitGovernanceProjectWrites(projectRoot, 'sf_git_ignore_decision_record', metadata.slice(2));

    const trusted = readTrustedGitGovernanceProjectWrites(projectRoot);
    expect(trusted.map(entry => entry.path).sort()).toEqual(metadata.slice().sort());

    const result = runChangedFilesAudit(
      metadata.map(file => ({ path: file, operation: 'modify' as const })),
      [],
      'agent',
      trusted,
    );

    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.trusted_control_plane_files).toBe(3);
  });

  it('uses GateContext workflow_path fallback when work_item metadata is absent', async () => {
    await writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-TEST',
        status: 'verification_done',
        workflow_type: null,
        workflow_path: null,
        allowed_write_files: [],
        code_permission_revoked: true,
      }) + '\n',
      'utf-8',
    );

    const result = await runCloseGate({
      workItemId: 'WI-TEST',
      workItemDir,
      projectRoot,
      workflowPath: 'requirement_change_path',
      workflowType: 'feature_spec',
    } as any);

    const check = result.report.checks.find(item => item.check_id === 'close_workflow_path_valid');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
    expect(check?.details).toContain('effective_workflow_path=requirement_change_path');
    expect(check?.details).toContain('work_item.workflow_path=(none)');
  });

  it('wires Close re-audits to canonical Git-governance provenance', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = await readFile(
      path.join(here, '../src/tools/handlers/sf-v11-close-gate.ts'),
      'utf-8',
    );

    expect(source.match(/readTrustedGitGovernanceProjectWrites\(projectRoot\)/g)?.length).toBe(2);
    expect(source.match(/trustedGitGovernanceWrites,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('workflowPath: effectiveWorkflowPath');
    expect(source).toContain('workflowType: effectiveWorkflowType');
  });

  it('persists selected workflow metadata during Work Item creation', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = await readFile(
      path.join(here, '../src/tools/handlers/sf-v11-work-item-create.ts'),
      'utf-8',
    );

    expect(source).toContain("await updateWorkItemStatus(wiDir, 'intake_ready', {");
    expect(source).toContain('workflow_path: workflowPath');
    expect(source).toContain('workflow_type: workflowType');
  });
});

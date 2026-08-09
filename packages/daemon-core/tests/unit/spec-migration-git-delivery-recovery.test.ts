import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

import {
  captureSpecMigrationProjectSpecGitDiff,
  assertSpecMigrationProjectSpecGitDiffUnchanged,
  verifyLegacyClosedSpecMigrationGitDeliveryRecovery,
} from '../../src/tools/lib/project-governance-v2.js';
import { worktreeStatusForWorkItemMerge } from '../../src/tools/lib/git-governance-stage2.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root });
  return String(stdout ?? '').trim();
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe('spec_migration Git delivery recovery', () => {
  it('binds legacy closed recovery to the latest passed Verification Attempt Project Spec inputs', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-spec-migration-git-'),
    );
    roots.push(root);

    await git(root, ['init', '-b', 'main']);
    await git(root, ['config', 'user.name', 'SpecForge Test']);
    await git(root, ['config', 'user.email', 'specforge-test@example.invalid']);
    await fs.writeFile(path.join(root, 'README.md'), '# baseline\n');
    await git(root, ['add', '--', 'README.md']);
    await git(root, ['commit', '-m', 'chore: baseline']);
    const baseCommit = await git(root, ['rev-parse', 'HEAD']);

    const projectFile = path.join(
      root,
      '.specforge',
      'project',
      'spec_manifest.json',
    );
    await fs.mkdir(path.dirname(projectFile), { recursive: true });
    await fs.writeFile(
      projectFile,
      '{"project_spec_version":"PSV-0004"}\n',
    );
    const projectHash = createHash('sha256')
      .update(await fs.readFile(projectFile))
      .digest('hex');

    const attemptsDir = path.join(
      root,
      '.specforge',
      'work-items',
      'WI-0004',
      'gate_attempts',
    );
    const attemptDir = path.join(attemptsDir, 'attempt-0006');
    await fs.mkdir(attemptDir, { recursive: true });

    await fs.writeFile(
      path.join(attemptDir, 'attempt-result.json'),
      JSON.stringify(
        {
          attempt_id: 'attempt-0006',
          work_item_id: 'WI-0004',
          source: 'gate_run',
          summary_status: 'passed',
          requested_gate_ids: [
            'verification_gate',
            'formal_version_gate',
          ],
        },
        null,
        2,
      ) + '\n',
    );
    await fs.writeFile(
      path.join(attemptDir, 'input-snapshot.json'),
      JSON.stringify(
        {
          schema_version: '1.0',
          attempt_id: 'attempt-0006',
          work_item_id: 'WI-0004',
          inputs: [
            {
              path: '.specforge/project/spec_manifest.json',
              exists: true,
              kind: 'file',
              sha256: projectHash,
            },
          ],
        },
        null,
        2,
      ) + '\n',
    );

    const recovery =
      await verifyLegacyClosedSpecMigrationGitDeliveryRecovery({
        projectRoot: root,
        workItemId: 'WI-0004',
        attemptId: 'attempt-0006',
        baseCommit,
      });

    expect(recovery.project_spec_files).toEqual([
      '.specforge/project/spec_manifest.json',
    ]);
    await expect(
      assertSpecMigrationProjectSpecGitDiffUnchanged({
        projectRoot: root,
        baseCommit,
        expectedFingerprint:
          recovery.project_spec_git_diff_fingerprint,
      }),
    ).resolves.toBeUndefined();

    await fs.writeFile(
      projectFile,
      '{"project_spec_version":"PSV-9999"}\n',
    );
    await expect(
      verifyLegacyClosedSpecMigrationGitDeliveryRecovery({
        projectRoot: root,
        workItemId: 'WI-0004',
        attemptId: 'attempt-0006',
        baseCommit,
      }),
    ).rejects.toThrow(
      'SPEC_MIGRATION_GIT_RECOVERY_FORMAL_INPUT_CHANGED',
    );
  });

  it('rejects a non-latest attempt even if it is passed', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-spec-migration-git-latest-'),
    );
    roots.push(root);

    await git(root, ['init', '-b', 'main']);
    await git(root, ['config', 'user.name', 'SpecForge Test']);
    await git(root, ['config', 'user.email', 'specforge-test@example.invalid']);
    await fs.writeFile(path.join(root, 'README.md'), '# baseline\n');
    await git(root, ['add', '--', 'README.md']);
    await git(root, ['commit', '-m', 'chore: baseline']);
    const baseCommit = await git(root, ['rev-parse', 'HEAD']);

    const projectFile = path.join(root, '.specforge', 'project', 'a.md');
    await fs.mkdir(path.dirname(projectFile), { recursive: true });
    await fs.writeFile(projectFile, 'A\n');

    for (const attemptId of ['attempt-0005', 'attempt-0006']) {
      const dir = path.join(
        root,
        '.specforge',
        'work-items',
        'WI-0004',
        'gate_attempts',
        attemptId,
      );
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'attempt-result.json'),
        JSON.stringify({
          source: 'gate_run',
          summary_status: 'passed',
          requested_gate_ids: [
            'verification_gate',
            'formal_version_gate',
          ],
        }),
      );
      await fs.writeFile(
        path.join(dir, 'input-snapshot.json'),
        JSON.stringify({
          schema_version: '1.0',
          attempt_id: attemptId,
          work_item_id: 'WI-0004',
          inputs: [],
        }),
      );
    }

    await expect(
      verifyLegacyClosedSpecMigrationGitDeliveryRecovery({
        projectRoot: root,
        workItemId: 'WI-0004',
        attemptId: 'attempt-0005',
        baseCommit,
      }),
    ).rejects.toThrow(
      'SPEC_MIGRATION_GIT_RECOVERY_LATEST_ATTEMPT_REQUIRED',
    );
  });

  it('ignores only unrelated Work Item governance artifacts for current-WI merge cleanliness', () => {
    const scoped = worktreeStatusForWorkItemMerge(
      [
        { path: '.specforge/work-items/WI-0003/close_gate.md' },
        { path: '.specforge/work-items/WI-0004/close_gate.md' },
        { path: '.specforge/project/spec_manifest.json' },
        { path: 'src/main.ts' },
      ],
      'WI-0004',
    );

    expect(scoped.ignored_unrelated_work_item_files).toEqual([
      '.specforge/work-items/WI-0003/close_gate.md',
    ]);
    expect(scoped.blocking.map(entry => entry.path)).toEqual([
      '.specforge/work-items/WI-0004/close_gate.md',
      '.specforge/project/spec_manifest.json',
      'src/main.ts',
    ]);
  });

  it('captures a stable Project Spec diff fingerprint', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-spec-migration-fingerprint-'),
    );
    roots.push(root);

    await git(root, ['init', '-b', 'main']);
    await git(root, ['config', 'user.name', 'SpecForge Test']);
    await git(root, ['config', 'user.email', 'specforge-test@example.invalid']);
    await fs.writeFile(path.join(root, 'README.md'), '# baseline\n');
    await git(root, ['add', '--', 'README.md']);
    await git(root, ['commit', '-m', 'chore: baseline']);
    const baseCommit = await git(root, ['rev-parse', 'HEAD']);

    const projectFile = path.join(
      root,
      '.specforge',
      'project',
      'trace_matrix.md',
    );
    await fs.mkdir(path.dirname(projectFile), { recursive: true });
    await fs.writeFile(projectFile, 'trace\n');

    const first =
      await captureSpecMigrationProjectSpecGitDiff(root, baseCommit);
    const second =
      await captureSpecMigrationProjectSpecGitDiff(root, baseCommit);
    expect(second).toEqual(first);
  });
});

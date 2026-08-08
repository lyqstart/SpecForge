import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getHandler } from '../../../../src/tools/ToolDispatcher';
import '../../../../src/tools/handlers/sf-v11-spec-migration';
import { getRequiredGates } from '../../../../src/tools/lib/required-gates';

const WORK_ITEM_ID = 'WI-0004';
const STALE_ISSUE =
  'project_spec_repair_plan candidate manifest hash is stale';

const roots: string[] = [];
let handler: (...args: any[]) => Promise<any>;

function sha256Prefixed(value: Buffer | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Raw(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeDeps(state = 'gates_failed') {
  return {
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => ({ replayed: true }),
        getState: async () => ({ current_state: state }),
      }),
    },
  } as any;
}

type Fixture = {
  root: string;
  workItemDir: string;
  candidateManifestPath: string;
  repairPlanPath: string;
  candidateRaw: Buffer;
  repairPlanBefore: Record<string, unknown>;
  requiredGates: string[];
};

function gateReport(
  gateId: string,
  status: 'passed' | 'failed',
  description: string,
) {
  const passed = status === 'passed';
  return {
    schema_version: '1.0',
    work_item_id: WORK_ITEM_ID,
    gate_id: gateId,
    gate_type: 'hard_gate',
    required: true,
    status,
    input_files: [],
    checks: [
      {
        check_id: `${gateId}_test`,
        description,
        passed,
        severity: passed ? undefined : 'error',
      },
    ],
    blocking_issues: passed ? [] : [description],
    warnings: [],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-08-08T00:00:00.000Z',
    finished_at: '2026-08-08T00:00:01.000Z',
    runner: 'sf-gate-runner',
  };
}

async function writeFailedAttempt(
  fixture: Fixture,
  options: {
    candidateSnapshotSha?: string;
    otherFailedGate?: string;
  } = {},
): Promise<void> {
  const attemptPath = join(
    fixture.workItemDir,
    'gate_attempts',
    'attempt-0002',
  );
  const gatesPath = join(attemptPath, 'gates');
  await mkdir(gatesPath, { recursive: true });

  for (const gateId of fixture.requiredGates) {
    if (gateId === 'workflow_specific_gate') {
      await writeFile(
        join(gatesPath, `${gateId}.json`),
        `${JSON.stringify(gateReport(gateId, 'failed', STALE_ISSUE), null, 2)}\n`,
        'utf8',
      );
      continue;
    }
    if (gateId === options.otherFailedGate) {
      await writeFile(
        join(gatesPath, `${gateId}.json`),
        `${JSON.stringify(
          gateReport(gateId, 'failed', 'unexpected second gate failure'),
          null,
          2,
        )}\n`,
        'utf8',
      );
      continue;
    }
    await writeFile(
      join(gatesPath, `${gateId}.json`),
      `${JSON.stringify(gateReport(gateId, 'passed', `${gateId} passed`), null, 2)}\n`,
      'utf8',
    );
  }

  await writeFile(
    join(attemptPath, 'input-snapshot.json'),
    `${JSON.stringify(
      {
        schema_version: '1.0',
        attempt_id: 'attempt-0002',
        work_item_id: WORK_ITEM_ID,
        captured_at: '2026-08-08T00:00:02.000Z',
        inputs: [
          {
            path: fixture.candidateManifestPath,
            exists: true,
            kind: 'file',
            sha256:
              options.candidateSnapshotSha ?? sha256Raw(fixture.candidateRaw),
            size: fixture.candidateRaw.length,
            mtime_ms: 1,
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeFile(
    join(attemptPath, 'attempt-result.json'),
    `${JSON.stringify(
      {
        schema_version: '1.0',
        attempt_id: 'attempt-0002',
        work_item_id: WORK_ITEM_ID,
        source: 'gate_run',
        started_at: '2026-08-08T00:00:00.000Z',
        completed_at: '2026-08-08T00:00:03.000Z',
        requested_gate_ids: fixture.requiredGates,
        current_report_gate_ids: fixture.requiredGates,
        summary_report_gate_ids: fixture.requiredGates,
        summary_status: 'failed',
        input_snapshot: 'input-snapshot.json',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function createFixture(
  options: {
    candidateSnapshotSha?: string;
    otherFailedGate?: string;
  } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-err222-'));
  roots.push(root);
  const projectRoot = join(root, '.specforge', 'project');
  const workItemDir = join(
    root,
    '.specforge',
    'work-items',
    WORK_ITEM_ID,
  );
  await mkdir(join(projectRoot, 'modules', 'REPORTING'), {
    recursive: true,
  });
  await mkdir(join(projectRoot, 'modules', 'CLI'), {
    recursive: true,
  });
  await mkdir(workItemDir, { recursive: true });

  const projectManifestText = `${JSON.stringify(
    {
      schema_version: '1.0',
      project_spec_version: 'PSV-0002',
    },
    null,
    2,
  )}\n`;
  await writeFile(
    join(projectRoot, 'spec_manifest.json'),
    projectManifestText,
    'utf8',
  );
  await writeFile(
    join(projectRoot, 'architecture.md'),
    '# Architecture\n',
    'utf8',
  );
  await writeFile(
    join(projectRoot, 'modules', 'REPORTING', 'design.md'),
    '# REPORTING Design\n',
    'utf8',
  );
  await writeFile(
    join(projectRoot, 'modules', 'CLI', 'design.md'),
    '# CLI Design\n',
    'utf8',
  );

  await writeFile(
    join(workItemDir, 'work_item.json'),
    `${JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: WORK_ITEM_ID,
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const projectHash = sha256Prefixed(projectManifestText);
  const evidencePaths = [
    '.specforge/project/architecture.md',
    '.specforge/project/modules/REPORTING/design.md',
    '.specforge/project/modules/CLI/design.md',
  ];
  const candidate = {
    schema_version: '1.1',
    work_item_id: WORK_ITEM_ID,
    workflow_type: 'spec_migration',
    workflow_path: 'spec_migration_path',
    base_spec_version: 'PSV-0002',
    project_spec_precondition_sha256: projectHash,
    repair_evidence_paths: evidencePaths,
    merge_required: true,
    entries: [
      {
        type: 'design',
        module_id: 'REPORTING',
        candidate_path:
          'candidates/project/modules/REPORTING/design.candidate.md',
        target_path: '.specforge/project/modules/REPORTING/design.md',
        operation: 'replace',
      },
      {
        type: 'design',
        module_id: 'CLI',
        candidate_path:
          'candidates/project/modules/CLI/design.candidate.md',
        target_path: '.specforge/project/modules/CLI/design.md',
        operation: 'replace',
      },
    ],
  };
  const candidateText = `${JSON.stringify(candidate, null, 2)}\n`;
  const candidateManifestPath = join(
    workItemDir,
    'candidate_manifest.json',
  );
  await writeFile(candidateManifestPath, candidateText, 'utf8');
  const candidateRaw = Buffer.from(candidateText, 'utf8');

  const repairPlanBefore = {
    schema_version: '1.0',
    work_item_id: WORK_ITEM_ID,
    action: 'project_spec_repair',
    manifest_sha256_before: projectHash,
    project_spec_version_before: 'PSV-0002',
    modules: ['REPORTING', 'CLI'],
    evidence_paths: evidencePaths,
    candidate_manifest_sha256: 'sha256:historical-stale-binding',
    prepared_at: '2026-08-07T00:00:00.000Z',
  };
  const repairPlanPath = join(
    workItemDir,
    'project_spec_repair_plan.json',
  );
  await writeFile(
    repairPlanPath,
    `${JSON.stringify(repairPlanBefore, null, 2)}\n`,
    'utf8',
  );

  const requiredGates = getRequiredGates(
    'spec_migration_path',
    'candidate',
    'full',
    'spec_migration',
  ).map(String);

  const fixture: Fixture = {
    root,
    workItemDir,
    candidateManifestPath,
    repairPlanPath,
    candidateRaw,
    repairPlanBefore,
    requiredGates,
  };
  await writeFailedAttempt(fixture, options);
  return fixture;
}

beforeAll(() => {
  handler = getHandler('sf_v11_spec_migration')!;
  expect(handler).toBeDefined();
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe('ERR-222 controlled Project Spec repair binding recovery', () => {
  it('recovers only the stale binding proven by the immutable failed Gate Attempt', async () => {
    const fixture = await createFixture();
    const candidateBefore = await readFile(
      fixture.candidateManifestPath,
      'utf8',
    );

    const result = await handler(
      {
        work_item_id: WORK_ITEM_ID,
        action: 'recover_repair_binding',
      },
      { directory: fixture.root },
      makeDeps('gates_failed'),
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe('recover_repair_binding');
    expect(result.failed_attempt_id).toBe('attempt-0002');
    expect(result.state_advanced).toBe(false);
    expect(result.previous_candidate_manifest_sha256).toBe(
      'sha256:historical-stale-binding',
    );
    expect(result.recovered_candidate_manifest_sha256).toBe(
      sha256Prefixed(fixture.candidateRaw),
    );

    const planAfter = JSON.parse(
      await readFile(fixture.repairPlanPath, 'utf8'),
    );
    expect({
      ...planAfter,
      candidate_manifest_sha256:
        fixture.repairPlanBefore.candidate_manifest_sha256,
    }).toEqual(fixture.repairPlanBefore);
    expect(planAfter.candidate_manifest_sha256).toBe(
      sha256Prefixed(fixture.candidateRaw),
    );
    expect(
      await readFile(fixture.candidateManifestPath, 'utf8'),
    ).toBe(candidateBefore);
  });

  it('rejects recovery outside authoritative gates_failed state', async () => {
    const fixture = await createFixture();
    const planBefore = await readFile(fixture.repairPlanPath, 'utf8');

    const result = await handler(
      {
        work_item_id: WORK_ITEM_ID,
        action: 'recover_repair_binding',
      },
      { directory: fixture.root },
      makeDeps('candidate_preparing'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'PROJECT_SPEC_REPAIR_BINDING_RECOVERY_REQUIRES_GATES_FAILED',
    );
    expect(await readFile(fixture.repairPlanPath, 'utf8')).toBe(
      planBefore,
    );
  });

  it('rejects recovery when the Candidate changed after the failed Attempt snapshot', async () => {
    const fixture = await createFixture({
      candidateSnapshotSha: '0'.repeat(64),
    });
    const planBefore = await readFile(fixture.repairPlanPath, 'utf8');

    const result = await handler(
      {
        work_item_id: WORK_ITEM_ID,
        action: 'recover_repair_binding',
      },
      { directory: fixture.root },
      makeDeps('gates_failed'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'PROJECT_SPEC_REPAIR_BINDING_RECOVERY_CANDIDATE_CHANGED_AFTER_ATTEMPT',
    );
    expect(await readFile(fixture.repairPlanPath, 'utf8')).toBe(
      planBefore,
    );
  });

  it('rejects recovery when any other required Gate also failed', async () => {
    const fixture = await createFixture({
      otherFailedGate: 'trace_gate',
    });
    const planBefore = await readFile(fixture.repairPlanPath, 'utf8');

    const result = await handler(
      {
        work_item_id: WORK_ITEM_ID,
        action: 'recover_repair_binding',
      },
      { directory: fixture.root },
      makeDeps('gates_failed'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'PROJECT_SPEC_REPAIR_BINDING_RECOVERY_ATTEMPT_NOT_EXCLUSIVELY_STALE_BINDING',
    );
    expect(await readFile(fixture.repairPlanPath, 'utf8')).toBe(
      planBefore,
    );
  });
});

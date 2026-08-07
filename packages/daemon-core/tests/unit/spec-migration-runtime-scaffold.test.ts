import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareProjectSpecRepairCandidates } from '../../src/tools/lib/spec-migration-v11.js';

const workItemId = 'WI-ERR215';
const projectSpecVersion = 'PSV-0003';

function sha256(content: Buffer | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

type Fixture = {
  root: string;
  workItemDir: string;
  preparation: {
    expected_manifest_sha256: string;
    expected_project_spec_version: string;
    evidence_paths: string[];
    modules: Array<{
      module_code: string;
      requirements_source: string;
      design_source: string;
      trace_source: string;
    }>;
  };
};

const createdRoots: string[] = [];

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-err215-'));
  createdRoots.push(root);

  const projectRoot = join(root, '.specforge', 'project');
  const reportingRoot = join(projectRoot, 'modules', 'REPORTING');
  const workItemDir = join(root, '.specforge', 'work-items', workItemId);

  await mkdir(reportingRoot, { recursive: true });
  await mkdir(workItemDir, { recursive: true });

  const manifestContent = `${JSON.stringify({
    schema_version: '1.0',
    project_spec_version: projectSpecVersion,
  }, null, 2)}\n`;

  await writeFile(
    join(projectRoot, 'spec_manifest.json'),
    manifestContent,
    'utf8',
  );
  await writeFile(
    join(projectRoot, 'architecture.md'),
    '# Architecture\nARCH-TEST-001\n',
    'utf8',
  );
  await writeFile(
    join(reportingRoot, 'requirements.md'),
    '# REPORTING Requirements\n',
    'utf8',
  );
  await writeFile(
    join(reportingRoot, 'design.md'),
    '# REPORTING Design\nDD-REPORTING-002\n',
    'utf8',
  );
  await writeFile(
    join(reportingRoot, 'trace.md'),
    '# REPORTING Trace\n',
    'utf8',
  );
  await writeFile(
    join(workItemDir, 'work_item.json'),
    `${JSON.stringify({
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'spec_migration',
      workflow_path: 'spec_migration_path',
    }, null, 2)}\n`,
    'utf8',
  );

  return {
    root,
    workItemDir,
    preparation: {
      expected_manifest_sha256: sha256(manifestContent),
      expected_project_spec_version: projectSpecVersion,
      evidence_paths: ['.specforge/project/architecture.md'],
      modules: [
        {
          module_code: 'REPORTING',
          requirements_source:
            '.specforge/project/modules/REPORTING/requirements.md',
          design_source:
            '.specforge/project/modules/REPORTING/design.md',
          trace_source:
            '.specforge/project/modules/REPORTING/trace.md',
        },
      ],
    },
  };
}

async function writeRuntimeScaffold(
  fixture: Fixture,
  overrides: Record<string, unknown> = {},
  createCandidateRoot = true,
): Promise<string> {
  if (createCandidateRoot) {
    await mkdir(join(fixture.workItemDir, 'candidates'), {
      recursive: true,
    });
  }
  const manifest = {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: 'spec_migration_path',
    base_spec_version: projectSpecVersion,
    merge_required: true,
    entries: [],
    ...overrides,
  };
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(
    join(fixture.workItemDir, 'candidate_manifest.json'),
    content,
    'utf8',
  );
  return content;
}

async function expectOverwriteRefusal(fixture: Fixture): Promise<void> {
  await expect(
    prepareProjectSpecRepairCandidates({
      projectRoot: fixture.root,
      workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    }),
  ).rejects.toThrow(
    'PROJECT_SPEC_REPAIR_REFUSES_TO_OVERWRITE_EXISTING_CANDIDATES',
  );
}

afterEach(async () => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop()!;
    await rm(root, { recursive: true, force: true });
  }
});

describe('ERR-215 Runtime empty Candidate scaffold adoption', () => {
  it('adopts the canonical Runtime empty manifest plus empty candidates directory', async () => {
    const fixture = await createFixture();
    await writeRuntimeScaffold(fixture);

    const result = await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.root,
      workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });

    const manifest = JSON.parse(
      await readFile(result.candidate_manifest_path, 'utf8'),
    );
    expect(manifest.schema_version).toBe('1.1');
    expect(manifest.project_spec_precondition_sha256).toBe(
      fixture.preparation.expected_manifest_sha256,
    );
    expect(manifest.entries.length).toBe(4);
    expect(
      await readdir(join(fixture.workItemDir, 'candidates')),
    ).not.toHaveLength(0);
    expect(
      JSON.parse(await readFile(result.repair_plan_path, 'utf8')).action,
    ).toBe('project_spec_repair');
  });

  it('adopts the canonical Runtime empty manifest when candidates directory is absent', async () => {
    const fixture = await createFixture();
    await writeRuntimeScaffold(fixture, {}, false);

    const result = await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.root,
      workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });

    const manifest = JSON.parse(
      await readFile(result.candidate_manifest_path, 'utf8'),
    );
    expect(manifest.entries.length).toBe(4);
  });

  it('adopts an empty Runtime candidates directory when manifest is absent', async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.workItemDir, 'candidates'), {
      recursive: true,
    });

    const result = await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.root,
      workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });

    expect(
      JSON.parse(await readFile(result.candidate_manifest_path, 'utf8'))
        .entries.length,
    ).toBe(4);
  });

  it('fails closed when candidates directory contains any file or subdirectory', async () => {
    const fixtureWithFile = await createFixture();
    await writeRuntimeScaffold(fixtureWithFile);
    await writeFile(
      join(fixtureWithFile.workItemDir, 'candidates', 'real.md'),
      'real candidate\n',
      'utf8',
    );
    await expectOverwriteRefusal(fixtureWithFile);

    const fixtureWithDirectory = await createFixture();
    await writeRuntimeScaffold(fixtureWithDirectory);
    await mkdir(
      join(fixtureWithDirectory.workItemDir, 'candidates', 'project'),
      { recursive: true },
    );
    await expectOverwriteRefusal(fixtureWithDirectory);
  });

  it('fails closed for a non-empty manifest', async () => {
    const fixture = await createFixture();
    await writeRuntimeScaffold(fixture, {
      entries: [
        {
          candidate_path: 'candidates/real.md',
          target_path: '.specforge/project/real.md',
          operation: 'replace',
        },
      ],
    });
    await expectOverwriteRefusal(fixture);
  });

  it('fails closed for mismatched or noncanonical Runtime scaffold manifests', async () => {
    const variants: Array<Record<string, unknown>> = [
      { work_item_id: 'WI-OTHER' },
      { workflow_path: 'architecture_change_path' },
      { base_spec_version: 'PSV-9999' },
      { schema_version: '1.1' },
      { merge_required: false },
      { unexpected_authored_field: true },
      { project_spec_precondition_sha256: 'sha256:authored' },
    ];

    for (const overrides of variants) {
      const fixture = await createFixture();
      await writeRuntimeScaffold(fixture, overrides);
      await expectOverwriteRefusal(fixture);
    }
  });

  it('fails closed when a repair plan already exists', async () => {
    const fixture = await createFixture();
    await writeRuntimeScaffold(fixture);
    await writeFile(
      join(fixture.workItemDir, 'project_spec_repair_plan.json'),
      '{}\n',
      'utf8',
    );
    await expectOverwriteRefusal(fixture);
  });

  it('fails closed on a second prepare_repair after real candidates exist', async () => {
    const fixture = await createFixture();
    await writeRuntimeScaffold(fixture);

    await prepareProjectSpecRepairCandidates({
      projectRoot: fixture.root,
      workItemId,
      workItemDir: fixture.workItemDir,
      preparation: fixture.preparation,
    });

    await expectOverwriteRefusal(fixture);
  });
});

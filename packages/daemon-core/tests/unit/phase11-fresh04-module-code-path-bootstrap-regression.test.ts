import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { materializeCandidateManifestEntries } from '../../src/tools/lib/governance-invariants-v11';

const roots: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

async function createCase(input: {
  moduleCode?: string;
  formalModule?: Record<string, unknown> | null;
  candidateModule: Record<string, unknown>;
}) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-fresh04-module-bootstrap-'));
  roots.push(projectRoot);
  const moduleCode = input.moduleCode ?? 'CORE';
  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
  const formalPath = path.join(
    projectRoot,
    '.specforge',
    'project',
    'modules',
    moduleCode,
    'module.json',
  );
  if (input.formalModule !== null) {
    await writeJson(formalPath, input.formalModule ?? { module_code: moduleCode, status: 'active' });
  }
  await writeJson(
    path.join(
      workItemDir,
      'candidates',
      'project',
      'modules',
      moduleCode,
      'module.candidate.json',
    ),
    input.candidateModule,
  );
  return { projectRoot, workItemDir, moduleCode };
}

function noBoundaryClassification() {
  return {
    requirement_changed: false,
    acceptance_criteria_changed: false,
    business_rule_changed: false,
    architecture_changed: false,
    data_model_changed: false,
    design_changed: false,
    module_contract_changed: false,
    module_boundary_changed: false,
    project_contract_changed: false,
    api_contract_changed: false,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('Phase 11 Fresh-04 first-WI module/code_paths bootstrap regression', () => {
  it('materializes module_definition when an existing default module receives code_paths for the first time', async () => {
    const { workItemDir } = await createCase({
      formalModule: { module_code: 'CORE', status: 'active' },
      candidateModule: {
        module_code: 'CORE',
        status: 'active',
        code_paths: ['src/**', 'package.json'],
      },
    });

    const result = materializeCandidateManifestEntries(
      { workflow_path: 'requirement_change_path', entries: [] },
      workItemDir,
      noBoundaryClassification(),
    );

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'module_definition',
          module_id: 'CORE',
          candidate_path: 'candidates/project/modules/CORE/module.candidate.json',
          target_path: '.specforge/project/modules/CORE/module.json',
        }),
      ]),
    );
    expect(result.required_candidate_types).toContain('module_definition');
    expect(result.required_candidate_types).not.toContain('module_trace');
    expect(result.ignored_candidate_paths).not.toContain(
      'candidates/project/modules/CORE/module.candidate.json',
    );
  });

  it('does not manufacture a module_definition Candidate when code_paths are semantically unchanged', async () => {
    const { workItemDir } = await createCase({
      formalModule: {
        module_code: 'CORE',
        status: 'active',
        code_paths: ['src/b/**', 'src/a/**'],
      },
      candidateModule: {
        module_code: 'CORE',
        status: 'active',
        code_paths: ['src/a/**', 'src/b/**'],
      },
    });

    const result = materializeCandidateManifestEntries(
      { workflow_path: 'requirement_change_path', entries: [] },
      workItemDir,
      noBoundaryClassification(),
    );

    expect(result.entries.some(entry => entry.type === 'module_definition')).toBe(false);
    expect(result.required_candidate_types).not.toContain('module_definition');
    expect(result.required_candidate_types).not.toContain('module_trace');
    expect(result.ignored_candidate_paths).toContain(
      'candidates/project/modules/CORE/module.candidate.json',
    );
  });

  it('fails safe by materializing a genuine new-module definition even if boundary classification is false', async () => {
    const { workItemDir } = await createCase({
      moduleCode: 'DOMAIN',
      formalModule: null,
      candidateModule: {
        module_code: 'DOMAIN',
        status: 'active',
        code_paths: ['src/domain/**'],
      },
    });

    const result = materializeCandidateManifestEntries(
      { workflow_path: 'requirement_change_path', entries: [] },
      workItemDir,
      noBoundaryClassification(),
    );

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'module_definition', module_id: 'DOMAIN' }),
      ]),
    );
    expect(result.required_candidate_types).toContain('module_definition');
    expect(result.required_candidate_types).not.toContain('module_trace');
  });

  it('does not silently ignore an invalid code_paths shape', async () => {
    const { workItemDir } = await createCase({
      formalModule: { module_code: 'CORE', status: 'active', code_paths: [] },
      candidateModule: {
        module_code: 'CORE',
        status: 'active',
        code_paths: 'src/**',
      },
    });

    const result = materializeCandidateManifestEntries(
      { workflow_path: 'requirement_change_path', entries: [] },
      workItemDir,
      noBoundaryClassification(),
    );

    expect(result.entries.some(entry => entry.type === 'module_definition')).toBe(true);
    expect(result.required_candidate_types).toContain('module_definition');
    expect(result.required_candidate_types).not.toContain('module_trace');
  });
});

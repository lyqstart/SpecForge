import { afterEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('@specforge/host-profile', () => ({
  scanHostProfile: vi.fn(async () => ({})),
  loadHostProfile: vi.fn(async () => null),
  getHostProfilePath: () => path.join(os.tmpdir(), 'sf-bootstrap-host-profile-does-not-exist.json'),
  PROFILE_TTL_MS: 3_600_000,
  SCANNER_VERSION: 'test',
}));

import { getHandler } from '../ToolDispatcher';
import '../handlers/sf-artifact-write';
import { checkContractIntegrity } from './contract-integrity';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceContracts,
  checkProjectGovernanceTrace,
} from './project-governance-v2';
import { ensureProjectInit } from './sf_project_init_core';

const roots: string[] = [];
const WI = 'WI-0001';

function runtimeDeps() {
  const stateManager = {
    rebuildFromEventsFile: vi.fn(async () => ({ replayed: false })),
    getState: vi.fn(async () => 'candidate_preparing'),
  };
  return {
    projectManager: {
      getProjectStateManager: vi.fn(async () => stateManager),
    },
  } as any;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('new project governance bootstrap', () => {
  test('controlled first-project Candidates can establish active Architecture/Data/Module/Contract/Trace governance', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-new-project-bootstrap-'));
    roots.push(projectRoot);

    const init = await ensureProjectInit(projectRoot, 'bootstrap-project');
    expect(init.success).toBe(true);

    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', WI);
    await fs.mkdir(workItemDir, { recursive: true });
    await writeJson(path.join(workItemDir, 'work_item.json'), {
      schema_version: '1.1',
      work_item_id: WI,
      workflow_type: 'feature',
      workflow_path: 'requirement_change_path',
    });

    const writer = getHandler('sf_artifact_write');
    expect(writer).toBeDefined();
    const deps = runtimeDeps();

    async function writeCandidate(fileType: string, content: string, agent = 'sf-design') {
      const result = (await writer!(
        {
          work_item_id: WI,
          file_type: fileType,
          content,
        },
        {
          directory: projectRoot,
          agent,
        },
        deps
      )) as any;
      expect(result?.success, JSON.stringify(result)).toBe(true);
      return result;
    }

    await writeCandidate(
      'candidate_architecture',
      '# Project Architecture\n\nARCH-CORE-001 defines the initial project boundary.\n'
    );
    await writeCandidate(
      'candidate_data_model',
      '# Project Data Model\n\nDATA_MODEL_NOT_APPLICABLE\n'
    );
    await writeCandidate(
      'candidate_module_definition',
      JSON.stringify(
        {
          module_code: 'CORE',
          status: 'active',
          code_paths: ['src/**'],
        },
        null,
        2
      )
    );
    await writeCandidate(
      'candidate_module_contract',
      JSON.stringify(
        {
          schema_version: '1.0',
          owner_module: 'CORE',
          contracts: {
            shared_enums: [
              {
                id: 'MCON-CORE-001',
                owner_module: 'CORE',
                values: ['ready', 'blocked'],
                source_refs: ['DD-CORE-001'],
                enforcement: 'unit_test',
              },
            ],
            invariants: [],
            public_interfaces: [],
            extension_points: [],
          },
        },
        null,
        2
      )
    );

    const manifestWrite = (await writer!(
      {
        work_item_id: WI,
        file_type: 'candidate_manifest',
        content: JSON.stringify(
          {
            schema_version: '1.1',
            work_item_id: WI,
            workflow_type: 'feature',
            workflow_path: 'requirement_change_path',
            merge_applicable: true,
            merge_required: true,
            entries: [],
          },
          null,
          2
        ),
      },
      {
        directory: projectRoot,
        agent: 'sf-orchestrator',
      },
      deps
    )) as any;
    expect(manifestWrite?.success, JSON.stringify(manifestWrite)).toBe(true);

    const candidateManifest = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'candidate_manifest.json'), 'utf-8')
    );
    const targets = new Set(
      candidateManifest.entries.map((entry: any) => String(entry.target_path ?? ''))
    );
    expect(targets).toContain('.specforge/project/architecture.md');
    expect(targets).toContain('.specforge/project/data_model.md');
    expect(targets).toContain('.specforge/project/modules/CORE/module.json');
    expect(targets).toContain('.specforge/project/modules/CORE/contracts.json');

    const contractPreMerge = await checkContractIntegrity({ projectRoot, workItemDir });
    expect(contractPreMerge.checks.every(check => check.passed)).toBe(true);

    const projectDir = path.join(projectRoot, '.specforge', 'project');
    const candidateRoot = path.join(workItemDir, 'candidates', 'project');
    await fs.copyFile(
      path.join(candidateRoot, 'architecture.candidate.md'),
      path.join(projectDir, 'architecture.md')
    );
    await fs.copyFile(
      path.join(candidateRoot, 'data_model.candidate.md'),
      path.join(projectDir, 'data_model.md')
    );
    await fs.copyFile(
      path.join(candidateRoot, 'modules', 'CORE', 'module.candidate.json'),
      path.join(projectDir, 'modules', 'CORE', 'module.json')
    );
    await fs.copyFile(
      path.join(candidateRoot, 'modules', 'CORE', 'contracts.candidate.json'),
      path.join(projectDir, 'modules', 'CORE', 'contracts.json')
    );

    await fs.writeFile(
      path.join(projectDir, 'modules', 'CORE', 'design.md'),
      '# Module Design\n\nDD-CORE-001 implements the initial CORE boundary.\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(projectDir, 'modules', 'CORE', 'trace.md'),
      [
        '| From | Relation | To |',
        '| --- | --- | --- |',
        '| DD-CORE-001 | constrained_by | ARCH-CORE-001 |',
        '| MCON-CORE-001 | enforces | DD-CORE-001 |',
        '',
      ].join('\n'),
      'utf-8'
    );

    const specManifestPath = path.join(projectDir, 'spec_manifest.json');
    const specManifest = JSON.parse(await fs.readFile(specManifestPath, 'utf-8'));
    specManifest.project = {
      ...(specManifest.project ?? {}),
      data_model: '.specforge/project/data_model.md',
    };
    specManifest.modules = specManifest.modules.map((entry: any) =>
      entry.module_code === 'CORE'
        ? {
            ...entry,
            contracts: '.specforge/project/modules/CORE/contracts.json',
            code_paths: ['src/**'],
          }
        : entry
    );
    await writeJson(specManifestPath, specManifest);

    await writeJson(path.join(workItemDir, 'trigger_result.json'), {
      schema_version: '1.1',
      work_item_id: WI,
      workflow_type: 'feature',
      workflow_path: 'requirement_change_path',
      status: 'triggered',
      classification: {
        requirement_changed: true,
        acceptance_criteria_changed: false,
        business_rule_changed: false,
        user_visible_behavior_changed: true,
        data_semantics_changed: false,
        design_changed: false,
        module_boundary_changed: false,
        api_contract_changed: false,
        architecture_changed: true,
        data_model_changed: true,
        module_contract_changed: true,
        unknowns: [],
      },
      impact_scope: {
        affected_modules: ['CORE'],
        architecture_refs: ['ARCH-CORE-001'],
        data_model_refs: [],
        design_refs: ['DD-CORE-001'],
        project_contract_refs: [],
        module_contract_refs: ['MCON-CORE-001'],
        planned_code_paths: ['src/index.ts'],
      },
    });

    const input = { projectRoot, workItemDir, workItemId: WI };
    const consistency = await checkProjectGovernanceConsistency(input);
    const contracts = await checkProjectGovernanceContracts(input);
    const trace = await checkProjectGovernanceTrace(input);

    expect(consistency.active).toBe(true);
    expect(consistency.passed, JSON.stringify(consistency.checks, null, 2)).toBe(true);
    expect(contracts.active).toBe(true);
    expect(contracts.passed, JSON.stringify(contracts.checks, null, 2)).toBe(true);
    expect(trace.active).toBe(true);
    expect(trace.passed, JSON.stringify(trace.checks, null, 2)).toBe(true);
  });
});

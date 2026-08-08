import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { authorContractCandidate } from '../../src/tools/lib/contract-authoring';

describe('ERR-218 repair relocation consumer proof in compatibility mode', () => {
  let projectRoot: string;
  const workItemId = 'WI-ERR218';

  const wiDir = () =>
    path.join(projectRoot, '.specforge', 'work-items', workItemId);

  beforeEach(async () => {
    projectRoot = path.join(
      os.tmpdir(),
      `sf-err218-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await prepareFixture();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function writeTrace(rows: string[]): Promise<void> {
    await fs.writeFile(
      path.join(projectRoot, '.specforge', 'project', 'trace_matrix.md'),
      [
        '# Project Trace Matrix',
        '',
        '<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->',
        '## Governance Relations',
        '',
        '| From | Relation | To |',
        '|---|---|---|',
        ...rows,
        '<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  async function prepareFixture(): Promise<void> {
    const project = path.join(projectRoot, '.specforge', 'project');
    const reporting = path.join(project, 'modules', 'REPORTING');
    const cli = path.join(project, 'modules', 'CLI');

    await fs.mkdir(reporting, { recursive: true });
    await fs.mkdir(cli, { recursive: true });
    await fs.mkdir(
      path.join(wiDir(), 'candidates', 'project', 'modules', 'REPORTING'),
      { recursive: true },
    );

    // Compatibility mode on purpose: no ARCH-* and no DATA-* /
    // DATA_MODEL_NOT_APPLICABLE.
    await fs.writeFile(
      path.join(project, 'architecture.md'),
      '# Legacy Architecture\n\nNo canonical ARCH IDs yet.\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(project, 'data_model.md'),
      '# Legacy Data Model\n\nNo canonical DATA IDs yet.\n',
      'utf8',
    );
    await writeTrace([]);

    await fs.writeFile(
      path.join(project, 'extension_registry.json'),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0003',
        namespaces: {
          requirement_types: [],
          design_types: [],
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        contracts: {
          shared_enums: [{
            id: 'ReportFormat',
            owner_module: 'REPORTING',
            value_type: 'string',
            values: ['text', 'json'],
            source_refs: ['DD-REPORTING-002'],
            scope: 'Module Contract (REPORTING-internal)',
          }],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      }, null, 2),
      'utf8',
    );

    for (const [moduleCode, moduleRoot, designId] of [
      ['REPORTING', reporting, 'DD-REPORTING-002'],
      ['CLI', cli, 'DD-CLI-001'],
    ] as const) {
      await fs.writeFile(
        path.join(moduleRoot, 'module.json'),
        JSON.stringify({ module_code: moduleCode, status: 'active' }, null, 2),
        'utf8',
      );
      await fs.writeFile(
        path.join(moduleRoot, 'design.md'),
        `# ${moduleCode} Design\n\n${designId}\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(moduleRoot, 'trace.md'),
        `# ${moduleCode} Trace\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(moduleRoot, 'contracts.json'),
        JSON.stringify({
          schema_version: '1.0',
          owner_module: moduleCode,
          contracts: {
            shared_enums: [],
            invariants: [],
            public_interfaces: [],
            extension_points: [],
          },
        }, null, 2),
        'utf8',
      );
    }

    await fs.writeFile(
      path.join(project, 'spec_manifest.json'),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0003',
        project: {
          architecture: '.specforge/project/architecture.md',
          data_model: '.specforge/project/data_model.md',
          extension_registry: '.specforge/project/extension_registry.json',
          trace_matrix: '.specforge/project/trace_matrix.md',
        },
        modules: [
          {
            module_code: 'REPORTING',
            module_file: '.specforge/project/modules/REPORTING/module.json',
            design: '.specforge/project/modules/REPORTING/design.md',
            contracts: '.specforge/project/modules/REPORTING/contracts.json',
            trace: '.specforge/project/modules/REPORTING/trace.md',
            code_paths: ['src/reporting/**'],
          },
          {
            module_code: 'CLI',
            module_file: '.specforge/project/modules/CLI/module.json',
            design: '.specforge/project/modules/CLI/design.md',
            contracts: '.specforge/project/modules/CLI/contracts.json',
            trace: '.specforge/project/modules/CLI/trace.md',
            code_paths: ['src/cli/**'],
          },
        ],
      }, null, 2),
      'utf8',
    );

    await fs.writeFile(
      path.join(wiDir(), 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: workItemId,
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
      }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(wiDir(), 'trigger_result.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: workItemId,
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
        classification: {
          requirement_changed: false,
          acceptance_criteria_changed: false,
          business_rule_changed: false,
          user_visible_behavior_changed: false,
          data_semantics_changed: false,
          design_changed: true,
          module_boundary_changed: false,
          api_contract_changed: false,
          architecture_changed: false,
          data_model_changed: false,
          module_contract_changed: true,
          project_contract_changed: true,
          unknowns: [],
        },
      }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(wiDir(), 'candidate_manifest.json'),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
        base_spec_version: 'PSV-0003',
        merge_required: true,
        entries: [],
      }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(
        wiDir(),
        'candidates',
        'project',
        'modules',
        'REPORTING',
        'design.candidate.md',
      ),
      '# REPORTING Design Candidate\n\nDD-REPORTING-002\n',
      'utf8',
    );
  }

  function repairArgs() {
    return {
      projectRoot,
      workItemId,
      action: 'repair_relocate_to_module' as const,
      workflowPath: 'spec_migration_path',
      kind: 'shared_enum' as const,
      sourceModule: 'REPORTING',
      fromContractId: 'ReportFormat',
      migrationConclusion:
        'normalize legacy Project placement into REPORTING Module Contract truth',
      compatibility:
        'pure-spec relocation; values and runtime behavior remain unchanged',
      entry: {
        id: 'ReportFormat',
        owner_module: 'REPORTING',
        value_type: 'string',
        values: ['text', 'json'],
        source_refs: ['DD-REPORTING-002'],
        enforcement:
          'src/reporting/formatter.js REPORT_FORMATS + assertReportFormat',
        scope: 'Module Contract (REPORTING-internal)',
      },
    };
  }

  it('relocates in compatibility mode when the formal Trace has no consumer edge', async () => {
    const result = await authorContractCandidate(repairArgs());

    expect(result.success, result.error).toBe(true);

    const projectCandidate = JSON.parse(
      await fs.readFile(
        path.join(wiDir(), 'candidates', 'project', 'extension_registry.json'),
        'utf8',
      ),
    );
    expect(
      projectCandidate.contracts.shared_enums.map((item: any) => item.id),
    ).not.toContain('ReportFormat');

    const moduleCandidate = JSON.parse(
      await fs.readFile(
        path.join(
          wiDir(),
          'candidates',
          'project',
          'modules',
          'REPORTING',
          'contracts.candidate.json',
        ),
        'utf8',
      ),
    );
    expect(
      moduleCandidate.contracts.shared_enums.map((item: any) => item.id),
    ).toContain('ReportFormat');
  });

  it('allows a resolved same-module formal consumer in compatibility mode', async () => {
    await writeTrace([
      '| DD-REPORTING-002 | constrained_by | ReportFormat |',
    ]);

    const result = await authorContractCandidate(repairArgs());

    expect(result.success, result.error).toBe(true);
  });

  it('fails closed for a resolved cross-module formal consumer in compatibility mode', async () => {
    await writeTrace([
      '| DD-CLI-001 | constrained_by | ReportFormat |',
    ]);

    const result = await authorContractCandidate(repairArgs());

    expect(result.success).toBe(false);
    expect(result.error).toContain('cross-module consumers');
  });

  it('fails closed when a formal consumer edge cannot be resolved to a Module', async () => {
    await writeTrace([
      '| DD-UNKNOWN-001 | constrained_by | ReportFormat |',
    ]);

    const result = await authorContractCandidate(repairArgs());

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'cannot resolve every current formal consumer edge',
    );

    await expect(
      fs.access(
        path.join(wiDir(), 'candidates', 'project', 'extension_registry.json'),
      ),
    ).rejects.toThrow();
    await expect(
      fs.access(
        path.join(
          wiDir(),
          'candidates',
          'project',
          'modules',
          'REPORTING',
          'contracts.candidate.json',
        ),
      ),
    ).rejects.toThrow();
  });
});

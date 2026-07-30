import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolDispatcher } from '../src/tools/ToolDispatcher.js';
import { buildContext } from '../src/tools/lib/sf_context_build_core.js';
import '../src/tools/handlers/sf-context-build.js';

const roots: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, 'utf8');
}

async function makeProject(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('sf_context_build runtime contract', () => {
  it('uses frozen governance_scope for a legacy impact_summary Work Item with an empty graph', async () => {
    const projectRoot = await makeProject('sf-context-governance-');
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0002');

    await writeJson(path.join(wiDir, 'trigger_result.json'), {
      schema_version: '1.0',
      work_item_id: 'WI-0002',
      workflow_type: 'architecture_change',
      impact_summary: {
        existing_modules: ['CORE'],
        new_modules: ['DOMAIN'],
      },
    });
    await writeJson(path.join(wiDir, 'governance_scope.json'), {
      schema_version: '1.0',
      work_item_id: 'WI-0002',
      active: true,
      affected_modules: ['DOMAIN'],
      allowed_write_files: ['src/domain/types.ts'],
      architecture_refs: ['ARCH-WD-001'],
      data_model_refs: [],
      design_refs: [],
      project_contract_refs: [],
      module_contract_refs: [],
    });
    await writeJson(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project: {
        architecture: '.specforge/project/architecture.md',
      },
      modules: [
        {
          module_code: 'DOMAIN',
          requirements: '.specforge/project/modules/DOMAIN/requirements.md',
        },
      ],
    });
    await writeText(
      path.join(projectRoot, '.specforge', 'project', 'architecture.md'),
      '# Formal Architecture\n\nARCH-WD-001 is authoritative after merge.\n',
    );
    await writeText(
      path.join(projectRoot, '.specforge', 'project', 'modules', 'DOMAIN', 'requirements.md'),
      '# DOMAIN requirements\n\nFormal module requirement.\n',
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      entries: [
        {
          candidate_path: 'candidates/project/architecture.candidate.md',
          target_path: '.specforge/project/architecture.md',
        },
      ],
    });
    await writeText(
      path.join(wiDir, 'candidates', 'project', 'architecture.candidate.md'),
      '# Candidate Architecture\n\nARCH-WD-001 is stale candidate content.\n',
    );
    await writeJson(path.join(projectRoot, '.specforge', 'knowledge', 'graph.json'), {
      version: '1.0',
      nodes: [],
      edges: [],
    });

    const result = await buildContext(
      'WI-0002',
      'TASK-WI-0002-001',
      undefined,
      false,
      projectRoot,
    );

    expect(result.task_context.context).toContain('## 治理约束');
    expect(result.task_context.context).toContain('modules=DOMAIN');
    expect(result.task_context.context).toContain('src/domain/types.ts');
    expect(result.task_context.context).toContain('authoritative after merge');
    expect(result.task_context.context).not.toContain('stale candidate content');
    expect(result.task_context.sources).toContainEqual({
      type: 'project_governance',
      id: '.specforge/work-items/WI-0002/governance_scope.json',
    });
  });

  it('parses and forwards target_files from the daemon handler to ArchiveSource', async () => {
    const projectRoot = await makeProject('sf-context-handler-');
    const runDir = path.join(
      projectRoot,
      '.specforge',
      'runtime',
      'archive',
      'agent_runs',
      'run-001',
    );
    await writeJson(path.join(projectRoot, '.specforge', 'knowledge', 'graph.json'), {
      version: '1.0',
      nodes: [],
      edges: [],
    });
    await writeJson(path.join(runDir, 'files_changed.json'), {
      files: [{ path: 'src/domain/types.ts' }],
    });
    await writeJson(path.join(runDir, 'result.json'), {
      status: 'success',
      task_description: 'Implemented the domain model',
    });

    const dispatcher = new ToolDispatcher({} as any);
    const result = (await dispatcher.dispatch({
      tool: 'sf_context_build',
      args: {
        work_item_id: 'WI-0002',
        task_id: 'TASK-WI-0002-001',
        target_files: JSON.stringify(['src/domain/types.ts']),
      },
      context: { directory: projectRoot, agent: 'sf-orchestrator' },
    })) as any;

    expect(result.task_context.context).toContain('Implemented the domain model');
    expect(result.task_context.sources).toContainEqual({
      type: 'archive',
      id: 'run-001',
    });
  });

  it('forwards task_description from the daemon handler to the Capability Broker', async () => {
    const projectRoot = await makeProject('sf-context-capability-');
    await writeJson(
      path.join(projectRoot, '.specforge', 'config', 'skill_fragments.json'),
      {
        version: '1.0',
        fragments: [
          {
            fragment_id: 'domain-tdd',
            skill_file: 'skills/domain-tdd.md',
            section_heading: 'Domain TDD',
            triggers: ['domain model'],
            description: 'Domain modeling test guidance',
          },
        ],
      },
    );
    await writeText(
      path.join(projectRoot, 'skills', 'domain-tdd.md'),
      '# Skill\n\n## Domain TDD\n\nWrite transition tests before implementation.\n',
    );
    await writeJson(path.join(projectRoot, '.specforge', 'knowledge', 'graph.json'), {
      version: '1.0',
      nodes: [],
      edges: [],
    });

    const dispatcher = new ToolDispatcher({} as any);
    const result = (await dispatcher.dispatch({
      tool: 'sf_context_build',
      args: {
        work_item_id: 'WI-0002',
        task_description: 'Implement the domain model',
        include_capabilities: true,
      },
      context: { directory: projectRoot, agent: 'sf-orchestrator' },
    })) as any;

    expect(result.capabilities.recommended_fragments).toContainEqual(
      expect.objectContaining({
        fragment_id: 'domain-tdd',
        content: expect.stringContaining('Write transition tests'),
      }),
    );
  });

  it('rejects malformed target_files instead of silently returning empty context', async () => {
    const projectRoot = await makeProject('sf-context-invalid-targets-');
    const dispatcher = new ToolDispatcher({} as any);

    const result = (await dispatcher.dispatch({
      tool: 'sf_context_build',
      args: {
        work_item_id: 'WI-0002',
        target_files: 'not-json',
      },
      context: { directory: projectRoot, agent: 'sf-orchestrator' },
    })) as any;

    expect(result).toEqual({
      success: false,
      error: 'target_files must be valid JSON',
    });
  });

  it('resolves task target files from candidates/tasks.md before legacy paths', async () => {
    const projectRoot = await makeProject('sf-context-candidate-tasks-');
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0002');
    const runDir = path.join(
      projectRoot,
      '.specforge',
      'runtime',
      'archive',
      'agent_runs',
      'run-002',
    );
    await writeText(
      path.join(wiDir, 'tasks.md'),
      '# Tasks\n\nWork Item: WI-0002\n\n> TODO: 由 Agent 填充\n',
    );
    await writeText(
      path.join(wiDir, 'candidates', 'tasks.md'),
      '# Tasks\n\n### TASK-WI-0002-001\n\n- **files**: [src/domain/types.ts]\n',
    );
    await writeJson(path.join(projectRoot, '.specforge', 'knowledge', 'graph.json'), {
      version: '1.0',
      nodes: [],
      edges: [],
    });
    await writeJson(path.join(runDir, 'files_changed.json'), {
      files: [{ path: 'src/domain/types.ts' }],
    });
    await writeJson(path.join(runDir, 'result.json'), {
      status: 'success',
      task_description: 'Candidate task path was authoritative',
    });

    const result = await buildContext(
      'WI-0002',
      'TASK-WI-0002-001',
      undefined,
      false,
      projectRoot,
    );

    expect(result.task_context.context).toContain('Candidate task path was authoritative');
    expect(result.task_context.sources).toContainEqual({
      type: 'archive',
      id: 'run-002',
    });
  });
});

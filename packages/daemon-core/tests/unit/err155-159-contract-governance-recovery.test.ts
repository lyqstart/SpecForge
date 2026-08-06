import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { authorContractCandidate } from '../../src/tools/lib/contract-authoring';
import {
  hasProjectContractSemanticChange,
  projectContractSemanticProjection,
} from '../../src/tools/lib/contract-integrity';
import { resolveTaskRequirementArtifacts } from '../../src/tools/lib/sf_tasks_gate_core';

const roots: string[] = [];

function repositoryRoot(): string {
  const cwd = process.cwd();
  const normalized = cwd.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('/packages/daemon-core') ? path.resolve(cwd, '../..') : cwd;
}

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-err155-159-'));
  roots.push(root);
  return root;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

const liveRegistry = {
  schema_version: '1.0',
  project_spec_version: 'PSV-0001',
  namespaces: { requirement_types: ['functional'] },
  contracts: {
    shared_enums: [
      {
        id: 'WorkItemStatus',
        owner_module: 'workflow',
        value_type: 'string',
        values: ['created', 'gates_failed'],
        source_refs: ['ARCH-001'],
        enforcement: 'gate',
      },
      {
        id: 'OtherEnum',
        owner_module: 'workflow',
        value_type: 'string',
        values: ['a'],
        source_refs: ['ARCH-001'],
        enforcement: 'gate',
      },
    ],
    invariants: [],
    public_interfaces: [],
    extension_points: [],
  },
  updated_at: 'old',
  updated_by_work_item: 'WI-0000',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('ERR-155 controlled Project Contract update', () => {
  it('updates only the same-kind same-ID WI Candidate and preserves the live Registry', async () => {
    const root = await tempRoot();
    const livePath = path.join(root, '.specforge', 'project', 'extension_registry.json');
    await writeJson(livePath, liveRegistry);
    const before = await fs.readFile(livePath, 'utf-8');

    const result = await authorContractCandidate({
      projectRoot: root,
      workItemId: 'WI-0002',
      action: 'update',
      kind: 'shared_enum',
      entry: {
        ...liveRegistry.contracts.shared_enums[0],
        values: ['created', 'gates_failed', 'closed'],
      },
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('update');
    expect(await fs.readFile(livePath, 'utf-8')).toBe(before);
    const candidate = result.registry_after as typeof liveRegistry;
    expect(candidate.contracts.shared_enums).toHaveLength(2);
    expect(candidate.contracts.shared_enums[0].id).toBe('WorkItemStatus');
    expect(candidate.contracts.shared_enums[0].values).toContain('closed');
    expect(candidate.contracts.shared_enums[1]).toEqual(liveRegistry.contracts.shared_enums[1]);
  });

  it('fails when the Contract ID does not exist', async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, '.specforge', 'project', 'extension_registry.json'), liveRegistry);
    const result = await authorContractCandidate({
      projectRoot: root,
      workItemId: 'WI-0002',
      action: 'update',
      kind: 'shared_enum',
      entry: { id: 'Missing', owner_module: 'workflow', value_type: 'string', values: ['x'] },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist in live registry');
  });

  it('fails when the existing Contract kind differs', async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, '.specforge', 'project', 'extension_registry.json'), liveRegistry);
    const result = await authorContractCandidate({
      projectRoot: root,
      workItemId: 'WI-0002',
      action: 'update',
      kind: 'invariant',
      entry: { id: 'WorkItemStatus', owner_module: 'workflow', rule: 'x' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('kind mismatch');
  });
});

describe('ERR-156 classification-driven Requirements source', () => {
  it('reads formal Module Requirements when all three change flags are false', async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, '.specforge', 'work-items', 'WI-0002', 'trigger_result.json'), {
      classification: {
        requirement_changed: false,
        acceptance_criteria_changed: false,
        business_rule_changed: false,
      },
    });
    const formal = path.join(root, '.specforge', 'project', 'modules', 'workflow', 'requirements.md');
    await fs.mkdir(path.dirname(formal), { recursive: true });
    await fs.writeFile(formal, '# Requirements\n\nREQ-WORKFLOW-001\n', 'utf-8');
    const result = await resolveTaskRequirementArtifacts(root, 'WI-0002');
    expect(result.source).toBe('formal_module_requirements');
    expect(result.classification_status).toBe('unchanged');
    expect(result.artifacts.map(item => item.path)).toEqual([formal]);
  });

  it('requires the Requirements Candidate when any change flag is true', async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, '.specforge', 'work-items', 'WI-0002', 'trigger_result.json'), {
      classification: {
        requirement_changed: true,
        acceptance_criteria_changed: false,
        business_rule_changed: false,
      },
    });
    const result = await resolveTaskRequirementArtifacts(root, 'WI-0002');
    expect(result.source).toBe('candidate');
    expect(result.classification_status).toBe('changed');
  });
});

describe('ERR-159 semantic Project Contract delta', () => {
  it('ignores Registry metadata and object/array ordering', () => {
    const after = {
      ...liveRegistry,
      contracts: {
        ...liveRegistry.contracts,
        shared_enums: [...liveRegistry.contracts.shared_enums].reverse(),
      },
      updated_at: 'new',
      updated_by_work_item: 'WI-0002',
    };
    expect(projectContractSemanticProjection(after)).toEqual(projectContractSemanticProjection(liveRegistry));
    expect(hasProjectContractSemanticChange(liveRegistry, after)).toBe(false);
  });

  it('detects a real namespaces/contracts change', () => {
    const after = JSON.parse(JSON.stringify(liveRegistry));
    after.contracts.shared_enums[0].values.push('closed');
    expect(hasProjectContractSemanticChange(liveRegistry, after)).toBe(true);
  });
});

describe('ERR-157 and ERR-158 installed-source contracts', () => {
  it('keeps Planner relation operations restricted to ADD/REMOVE', async () => {
    const content = await fs.readFile(
      path.resolve(repositoryRoot(), 'setup/userlevel-opencode/agents/sf-task-planner.md'),
      'utf-8',
    );
    expect(content).toContain('ERR-157_GOVERNANCE_RELATION_DELTA_CONTRACT:START');
    expect(content).toContain('只允许 `ADD` 和 `REMOVE`');
    expect(content).toContain('`REMOVE` 旧关系和 `ADD` 新关系');
  });

  it('keeps the Orchestrator operation boundary fail-closed', async () => {
    const content = await fs.readFile(
      path.resolve(repositoryRoot(), 'setup/userlevel-opencode/agents/sf-orchestrator.md'),
      'utf-8',
    );
    expect(content).toContain('ERR-158_OPERATION_BOUNDARY:START');
    expect(content).toContain('OPERATION_BOUNDARY');
    expect(content).toContain('等待新的用户消息');
  });

  it('keeps daemon and user-level action schemas aligned', async () => {
    const [handler, userTool] = await Promise.all([
      fs.readFile(
        path.resolve(repositoryRoot(), 'packages/daemon-core/src/tools/handlers/sf-contract-register.ts'),
        'utf-8',
      ),
      fs.readFile(
        path.resolve(repositoryRoot(), 'setup/userlevel-opencode/tools/sf_contract_register.ts'),
        'utf-8',
      ),
    ]);
    expect(handler).toContain("'add', 'update', 'reset'");
    expect(userTool).toContain('["add", "update", "reset"]');
  });
});

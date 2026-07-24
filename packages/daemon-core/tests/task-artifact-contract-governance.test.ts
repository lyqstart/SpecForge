import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TASK_ARTIFACT_CONTRACT_VERSION,
  TaskArtifactDocumentSchema,
  isValidCorrectnessPropertyId,
} from '@specforge/types';
import {
  parseRefsFields,
  parseTaskVerification,
  validateTaskArtifactContract,
} from '../src/tools/lib/sf_markdown_verification_parser';
import {
  isValidNodeId,
  loadGraphStore,
  syncFromSpec,
} from '../src/tools/lib/sf_knowledge_graph_core';
import { getHandler } from '../src/tools/ToolDispatcher';
import { crossValidateTask } from '../src/tools/lib/sf_tasks_gate_core';
import '../src/tools/handlers/sf-artifact-write';

const tempRoots: string[] = [];

async function tempProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-task-contract-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function canonicalTask(refsField = '- **refs**: [DD-AUTH-001, REQ-AUTH-001]'): string {
  return `### TASK-WI-0001-001 Implement authentication

${refsField}
- files: [src/auth.ts]
- **verification_commands**:
  - unit:
    - \`node --test tests/auth.test.mjs\`
  - integration:
    - \`node scripts/verify-auth.mjs\`
`;
}

describe('task-document/v1 producer and consumer governance', () => {
  it('normalizes plain and bold refs fields to the same semantic value', () => {
    const plain = parseTaskVerification(canonicalTask('- refs: [DD-AUTH-001, REQ-AUTH-001]'));
    const bold = parseTaskVerification(canonicalTask());

    expect(plain.format).toBe('typed');
    expect(plain.refs).toEqual(['DD-AUTH-001', 'REQ-AUTH-001']);
    expect(plain.refs).toEqual(bold.refs);
    expect(parseRefsFields(canonicalTask())).toEqual(['DD-AUTH-001', 'REQ-AUTH-001']);
  });

  it('validates the semantic contract and makes legacy aliases read-only', () => {
    const valid = validateTaskArtifactContract(canonicalTask());
    expect(valid.valid).toBe(true);
    expect(valid.contract_version).toBe(TASK_ARTIFACT_CONTRACT_VERSION);
    expect(
      TaskArtifactDocumentSchema.safeParse({
        contract_version: valid.contract_version,
        tasks: valid.tasks,
      }).success
    ).toBe(true);

    const legacy = canonicalTask()
      .replace('TASK-WI-0001-001', 'TASK-1')
      .replaceAll('DD-AUTH-001', 'DD-1')
      .replaceAll('REQ-AUTH-001', 'REQ-1');
    expect(validateTaskArtifactContract(legacy).valid).toBe(false);

    const compatibilityRead = validateTaskArtifactContract(legacy, {
      allowLegacyCommands: true,
      allowLegacyIds: true,
    });
    expect(compatibilityRead.valid).toBe(true);
    expect(compatibilityRead.issues.every(issue => issue.severity === 'warning')).toBe(true);

    const canonicalProperty = canonicalTask(
      '- **refs**: [REQ-AUTH-001, DD-AUTH-001, CP-AUTH-001]'
    ).replace(
      '  - integration:\n    - `node scripts/verify-auth.mjs`',
      '  - property:\n    - `node --test tests/auth.property.test.mjs`'
    );
    expect(isValidCorrectnessPropertyId('CP-AUTH-001')).toBe(true);
    expect(isValidCorrectnessPropertyId('CP-1')).toBe(false);
    expect(validateTaskArtifactContract(canonicalProperty).valid).toBe(true);

    const legacyProperty = canonicalProperty.replace('CP-AUTH-001', 'CP-1');
    expect(validateTaskArtifactContract(legacyProperty).valid).toBe(false);
    expect(
      validateTaskArtifactContract(legacyProperty, {
        allowLegacyCommands: true,
        allowLegacyIds: true,
      }).valid
    ).toBe(true);
  });

  it('keeps the Task Planner example executable against the runtime contract', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const planner = await readFile(
      path.join(repoRoot, 'setup', 'userlevel-opencode', 'agents', 'sf-task-planner.md'),
      'utf8'
    );
    const example = /✅ 正确格式：\s*```markdown\s*([\s\S]*?)```/.exec(planner)?.[1];
    expect(example).toBeDefined();
    const validation = validateTaskArtifactContract(example!);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('rejects an invalid task contract before creating a candidate file', async () => {
    const root = await tempProject();
    const handler = getHandler('sf_artifact_write');
    expect(handler).toBeDefined();

    const result = (await handler!(
      {
        work_item_id: 'WI-0001',
        file_type: 'candidate_tasks',
        content: canonicalTask().replace(
          '- **refs**: [DD-AUTH-001, REQ-AUTH-001]',
          '- **refs**: [DD-AUTH-001]'
        ),
      },
      { directory: root, agent: 'sf-task-planner' },
      {} as any
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_TASK_ARTIFACT_CONTRACT');
    expect(result.contract_version).toBe(TASK_ARTIFACT_CONTRACT_VERSION);
    await expect(
      readFile(
        path.join(root, '.specforge', 'work-items', 'WI-0001', 'candidates', 'tasks.md'),
        'utf8'
      )
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('feeds canonical bold refs consistently into Gate parsing and Knowledge Graph sync', async () => {
    const root = await tempProject();
    const specDir = path.join(root, '.specforge', 'specs', 'WI-0001');
    const requirements =
      '### REQ-AUTH-001 Authentication\n\n- verification_strategy: [unit, integration]\n';
    const taskVerification = parseTaskVerification(canonicalTask());
    const crossValidation = crossValidateTask(
      'TASK-WI-0001-001',
      taskVerification,
      requirements,
      '### DD-AUTH-001 Authentication design\n'
    );
    expect(crossValidation.blockingIssues).toEqual([]);

    await mkdir(specDir, { recursive: true });
    await writeFile(path.join(specDir, 'requirements.md'), requirements);
    await writeFile(
      path.join(specDir, 'design.md'),
      '### DD-AUTH-001 Authentication design\n\n- **refs**: [REQ-AUTH-001]\n'
    );
    await writeFile(path.join(specDir, 'tasks.md'), canonicalTask());

    const result = await syncFromSpec('WI-0001', root, 'verification');
    expect(result.success).toBe(true);

    const graph = await loadGraphStore(root);
    expect(graph.success).toBe(true);
    expect(
      graph.store?.nodes.some(
        node => node.type === 'requirement' && node.metadata?.req_id === 'REQ-AUTH-001'
      )
    ).toBe(true);
    expect(
      graph.store?.nodes.some(
        node => node.type === 'task' && node.metadata?.task_id === 'TASK-WI-0001-001'
      )
    ).toBe(true);
    expect(graph.store?.edges.some(edge => edge.type === 'traces_to')).toBe(true);
    expect(graph.store?.edges.some(edge => edge.type === 'decomposes_to')).toBe(true);
    expect(isValidNodeId('WI-0001:requirement:AUTH-001')).toBe(true);
    expect(isValidNodeId('WI-0001:task:WI-0001-001')).toBe(true);
  });
});

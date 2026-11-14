import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  inspectRequirementsGeneration,
  parseRequirementDocument,
  requirementDefinitionContent,
} from './requirements-generation';
import {
  resolveRequirementsAuthority,
  captureRequirementsInputBinding,
  assertRequirementsInputBinding,
} from './requirements-authority';
import { extractRequirementIds } from './sf_trace_matrix_core';
import { checkTasksGate } from './sf_tasks_gate_core';

const body = (id: string, refs = '') =>
  `# Requirements\n\n## ${id} Read\nUser Story: read the approved record.\n### Acceptance Criteria\nThe record is returned.\n${refs}\n\n## Glossary\nRecord: approved data.\n`;
const context = (refs: string) =>
  `---\nrequirements_role: reference_context\n---\n# Index\n${refs}\n`;
const docs = () => [
  { path: 'AA/requirements.md', moduleCode: 'AA', content: body('REQ-AA-001', 'Uses REQ-BB-001.') },
  { path: 'BB/requirements.md', moduleCode: 'BB', content: body('REQ-BB-001') },
  {
    path: 'CORE/requirements.md',
    moduleCode: 'CORE',
    content: context('REQ-AA-001 and REQ-BB-001'),
  },
];

describe('D28 Requirements generation semantics', () => {
  it('allows explanatory prose but refuses context-owned acceptance declarations', () => {
    expect(
      parseRequirementDocument({
        path: 'index',
        content: context('This file does not define Acceptance Criteria or verification_strategy.'),
      }).errors
    ).toEqual([]);
    for (const declaration of [
      '## 验收标准',
      '## Acceptance Criteria',
      '- 验收标准：返回记录',
      '**Acceptance Criteria**: return the record',
      '## AC-AA-001',
    ]) {
      expect(
        parseRequirementDocument({ path: 'index', content: context(declaration) }).errors
      ).toContain('REFERENCE_CONTEXT_ACCEPTANCE_OR_STRATEGY_FORBIDDEN');
    }
  });
  it('resolves unique cross-file bodies independently of enumeration order and excludes context from coverage', () => {
    for (const documents of [docs(), docs().reverse()]) {
      const result = inspectRequirementsGeneration(documents);
      expect(result.errors).toEqual([]);
      expect(result.declaredIds).toEqual(['REQ-AA-001', 'REQ-BB-001']);
      expect(extractRequirementIds(context('REQ-AA-001'))).toEqual([]);
      expect(requirementDefinitionContent(documents)).not.toContain('requirements_role');
    }
  });
  it.each([
    ['dangling', () => [docs()[0]], 'formal requirement body missing'],
    ['duplicate', () => [...docs(), { ...docs()[0], path: 'copy' }], 'must be unique'],
    ['owner', () => [{ ...docs()[0], moduleCode: 'CC' }, docs()[1]], 'WRONG_OWNER'],
    ['width', () => [{ path: 'AA', content: body('REQ-AA-0001') }], 'canonical'],
    [
      'context body',
      () => [{ path: 'CORE', content: context(body('REQ-AA-001')) }],
      'DEFINITION_FORBIDDEN',
    ],
    [
      'context strategy',
      () => [{ path: 'CORE', content: context('verification_strategy: unit') }],
      'STRATEGY_FORBIDDEN',
    ],
    [
      'missing AC',
      () => [
        {
          path: 'AA',
          content:
            '## REQ-AA-001\nA real body.\n## Other\nAcceptance Criteria\nNot owned by this requirement.',
        },
      ],
      'acceptance criteria missing',
    ],
  ] as const)('rejects %s', (_name, make, expected) => {
    expect(inspectRequirementsGeneration(make()).errors.join('\n')).toContain(expected);
  });
  it.each([
    'requirements_role: reference_context\n# Index',
    '---\nrequirements_role: unknown\n---\n# Index',
    '---\nrequirements_role: reference_context\nrequirements_role: requirements\n---',
    '---\nrequirements_role: reference_context\n---\nrequirements_role: reference_context',
  ])('rejects invalid role declaration', content => {
    expect(parseRequirementDocument({ path: 'index', content }).errors.join('\n')).toContain(
      'REQUIREMENTS_ROLE_INVALID'
    );
  });
  it('does not infer a context exemption from absent headings', () => {
    const result = inspectRequirementsGeneration([{ path: 'index', content: 'REQ-AA-001' }]);
    expect(result.documents[0].role).toBe('requirements');
    expect(result.errors.join('\n')).toContain('body missing');
  });
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-req-generation-'));
  roots.push(root);
  const put = async (file: string, value: unknown) => {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, typeof value === 'string' ? value : JSON.stringify(value));
    return absolute;
  };
  await put('.specforge/project/spec_manifest.json', {
    modules: [{ module_code: 'AA' }, { module_code: 'BB' }],
  });
  await put('.specforge/project/modules/AA/requirements.md', body('REQ-AA-001', 'Old'));
  await put('.specforge/project/modules/BB/requirements.md', body('REQ-BB-001'));
  const candidate = await put(
    '.specforge/work-items/WI-0001/candidates/project/modules/AA/requirements.candidate.md',
    body('REQ-AA-001', 'New REQ-BB-001')
  );
  const entry = {
    type: 'requirements',
    module_id: 'AA',
    candidate_path: 'candidates/project/modules/AA/requirements.candidate.md',
    target_path: '.specforge/project/modules/AA/requirements.md',
    operation: 'replace',
  };
  const seal = (entries: unknown[]) =>
    put('.specforge/work-items/WI-0001/candidate_manifest.json', { entries });
  await seal([entry]);
  return {
    root,
    put,
    candidate,
    entry,
    seal,
    resolve: () => resolveRequirementsAuthority({ projectRoot: root, workItemId: 'WI-0001' }),
  };
}

describe('D28 registered prospective authority', () => {
  it('rejects unresolved requirement references through the direct Task Gate consumer', async () => {
    const f = await fixture();
    await f.put(
      '.specforge/work-items/WI-0001/candidates/tasks.md',
      '# Tasks\n\n## TASK-001\nImplement REQ-AA-001.\n'
    );
    await f.put('.specforge/work-items/WI-0001/trigger_result.json', {
      classification: { requirement_changed: true },
    });
    await f.put(
      '.specforge/project/modules/BB/requirements.md',
      body('REQ-BB-001', 'Uses REQ-ZZ-001.')
    );
    const result = await checkTasksGate('WI-0001', f.root);
    expect(result.status).not.toBe('pass');
    expect(result.blocking_issues.join('\n')).toContain(
      'REQ-ZZ-001: formal requirement body missing'
    );
  });
  it('rejects non-string paths and traversal instead of coercing or reading them', async () => {
    const f = await fixture();
    await f.seal([{ ...f.entry, candidate_path: { path: f.entry.candidate_path } }]);
    await expect(f.resolve()).rejects.toThrow('STRING_REQUIRED');
    await f.seal([{ ...f.entry, candidate_path: 'candidates/../../outside.md' }]);
    await expect(f.resolve()).rejects.toThrow('CANDIDATE_PATH_INVALID');
  });
  it('rejects a directory alias in a registered formal source', async () => {
    const f = await fixture();
    const original = path.join(f.root, '.specforge/project/modules/BB');
    const moved = path.join(f.root, 'owned-alias-target');
    await rename(original, moved);
    await symlink(moved, original, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(f.resolve()).rejects.toThrow('AUTHORITY_ALIAS');
  });
  it('invalidates the generation when an unchanged formal input or module registration changes', async () => {
    const f = await fixture();
    const input = { projectRoot: f.root, workItemId: 'WI-0001' };
    const initial = await captureRequirementsInputBinding(input);
    await f.put(
      '.specforge/project/modules/BB/requirements.md',
      body('REQ-BB-001', 'Changed after validation')
    );
    await expect(assertRequirementsInputBinding(input, initial)).rejects.toThrow('INPUT_DRIFT');
    const next = await captureRequirementsInputBinding(input);
    await f.put('.specforge/project/spec_manifest.json', { modules: [{ module_code: 'AA' }] });
    await expect(assertRequirementsInputBinding(input, next)).rejects.toThrow('INPUT_DRIFT');
  });
  it('checks a frozen requirements_index replacement before merge, including dangling references', async () => {
    const f = await fixture();
    await f.put(
      '.specforge/work-items/WI-0001/candidates/project/requirements_index.md',
      context('REQ-AA-001 and REQ-ZZ-001')
    );
    await f.seal([
      f.entry,
      {
        type: 'requirements_index',
        candidate_path: 'candidates/project/requirements_index.md',
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
      },
    ]);
    const result = await f.resolve();
    expect(inspectRequirementsGeneration(result.artifacts).errors.join('\n')).toContain(
      'REQ-ZZ-001: formal requirement body missing'
    );
  });
  it('overlays one frozen replacement and binds unchanged formal body and both manifests', async () => {
    const f = await fixture();
    await f.put('.specforge/project/modules/ZZ/requirements.md', body('REQ-ZZ-001'));
    await f.put(
      '.specforge/work-items/WI-0001/candidates/project/modules/ZZ/requirements.candidate.md',
      body('REQ-ZZ-001')
    );
    const result = await f.resolve();
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts.find(d => d.moduleCode === 'AA')?.path).toBe(f.candidate);
    expect(inspectRequirementsGeneration(result.artifacts).errors).toEqual([]);
    expect(result.inputFiles).toContain(
      path.join(f.root, '.specforge/project/modules/BB/requirements.md')
    );
    expect(result.inputFiles.filter(file => file.endsWith('manifest.json'))).toHaveLength(2);
    expect(result.inputFiles.some(file => file.includes('/ZZ/'))).toBe(false);
  });
  it('rejects an unregistered target, duplicate target and wrong explicit owner', async () => {
    const f = await fixture();
    await f.seal([{ ...f.entry, target_path: '.specforge/project/modules/ZZ/requirements.md' }]);
    await expect(f.resolve()).rejects.toThrow('UNREGISTERED');
    await f.seal([f.entry, { ...f.entry, candidate_path: 'candidates/other.md' }]);
    await expect(f.resolve()).rejects.toThrow('TARGET_DUPLICATE');
    await f.seal([{ ...f.entry, module_id: 'BB' }]);
    await expect(f.resolve()).rejects.toThrow('OWNER_INVALID');
  });
  it('deduplicates the same authority entry while preserving its first spelling', async () => {
    const f = await fixture();
    const alias =
      process.platform === 'win32'
        ? {
            ...f.entry,
            candidate_path: f.entry.candidate_path.toUpperCase(),
            target_path: f.entry.target_path.toUpperCase(),
          }
        : f.entry;
    await f.seal([f.entry, alias]);
    const result = await f.resolve();
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts.find(document => document.moduleCode === 'AA')?.path).toBe(f.candidate);
    expect(inspectRequirementsGeneration(result.artifacts).errors).toEqual([]);
  });
  it('refuses missing frozen body without falling back to formal bytes', async () => {
    const f = await fixture();
    await rm(f.candidate);
    await expect(f.resolve()).rejects.toThrow();
  });
  it('allows a new module only through its frozen valid module definition', async () => {
    const f = await fixture();
    await f.put('.specforge/work-items/WI-0001/candidates/project/modules/CC/module.json', {
      module_code: 'CC',
    });
    await f.put(
      '.specforge/work-items/WI-0001/candidates/project/modules/CC/requirements.candidate.md',
      body('REQ-CC-001')
    );
    await f.seal([
      f.entry,
      {
        type: 'module_definition',
        module_id: 'CC',
        candidate_path: 'candidates/project/modules/CC/module.json',
        target_path: '.specforge/project/modules/CC/module.json',
      },
      {
        type: 'requirements',
        module_id: 'CC',
        candidate_path: 'candidates/project/modules/CC/requirements.candidate.md',
        target_path: '.specforge/project/modules/CC/requirements.md',
      },
    ]);
    const result = await f.resolve();
    expect(result.artifacts).toHaveLength(3);
    expect(inspectRequirementsGeneration(result.artifacts).errors).toEqual([]);
    if (process.platform === 'win32') {
      const definition = {
        type: 'module_definition',
        module_id: 'CC',
        candidate_path: 'CANDIDATES/PROJECT/MODULES/CC/MODULE.JSON',
        target_path: '.SPECFORGE/PROJECT/MODULES/cc/MODULE.JSON',
      };
      await f.seal([
        f.entry,
        definition,
        { ...definition, candidate_path: definition.candidate_path.toLowerCase() },
        {
          type: 'requirements',
          module_id: 'CC',
          candidate_path: 'candidates/project/modules/CC/requirements.candidate.md',
          target_path: '.specforge/project/modules/CC/requirements.md',
        },
      ]);
      expect(inspectRequirementsGeneration((await f.resolve()).artifacts).errors).toEqual([]);
    }
  });
});

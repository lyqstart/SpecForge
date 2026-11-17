import { describe, expect, test } from 'vitest';
import {
  declaredDesignBodies,
  inspectDocumentationTaskReferences,
  inspectModuleImplementationKind,
  isDocumentationFilePath,
  type DocumentationModuleView,
} from './documentation-module-policy';

function fixture() {
  const modules: DocumentationModuleView[] = [
    {
      module_code: 'DOCS',
      implementation_kind: 'documentation_context',
      code_paths: ['docs/readiness.md'],
      design_ids: [],
      design_text: '# Overview\nReference DD-AA-001.',
      contract_entries: [],
    },
    {
      module_code: 'AA',
      implementation_kind: 'implementation',
      code_paths: ['src/**'],
      design_ids: ['DD-AA-001'],
      design_text: '#### DD-AA-001 Readiness\nA real design body.\n',
      contract_entries: [],
    },
  ];
  const tasks = [
    {
      task_id: 'TASK-WI-0001-001',
      refs: ['REQ-AA-001', 'DD-AA-001'],
      allowed_write_files: ['docs/readiness.md'],
    },
  ];
  return { modules, tasks, tasksValid: true };
}

describe('finite documentation module policy', () => {
  test('does not infer a role from Markdown paths', () => {
    expect(inspectModuleImplementationKind({ code_paths: ['docs/a.md'] })).toEqual({
      kind: 'implementation',
      errors: [],
    });
    expect(
      inspectModuleImplementationKind({ implementation_kind: 'reference_context' }).errors
    ).not.toEqual([]);
  });
  test.each([
    'docs/**',
    'docs',
    '../a.md',
    '.specforge/a.md',
    'docs/.git/a.md',
    'docs/a.ts',
    '/docs/a.md',
    'docs\\a.md',
    'docs/a.md:stream',
    'docs/NUL.md',
    'docs/a.md ',
  ])('rejects non-finite documentation path %s', file => {
    expect(isDocumentationFilePath(file)).toBe(false);
    expect(
      inspectModuleImplementationKind({
        implementation_kind: 'documentation_context',
        code_paths: [file],
      }).errors
    ).not.toEqual([]);
  });
  test('binds exact Task files to external owned bodies without transferring ownership', () => {
    const input = fixture();
    const result = inspectDocumentationTaskReferences(input);
    expect(result.valid).toBe(true);
    expect(result.files).toEqual([
      {
        module: 'DOCS',
        path: 'docs/readiness.md',
        task: 'TASK-WI-0001-001',
        design_refs: ['DD-AA-001'],
      },
    ]);
    expect(input.modules[0].design_ids).toEqual([]);
  });
  test.each([
    'missing-task',
    'missing-ref',
    'mention-only',
    'empty-body',
    'duplicate-body',
    'wrong-owner',
    'invalid-task',
    'owned-object',
    'internal-contract',
  ])('rejects %s', variant => {
    const input = fixture();
    if (variant === 'missing-task') input.tasks = [];
    if (variant === 'missing-ref') input.tasks[0].refs = ['REQ-AA-001'];
    if (variant === 'mention-only') input.modules[1].design_text = 'Reference DD-AA-001.\n';
    if (variant === 'empty-body') input.modules[1].design_text = '#### DD-AA-001\n';
    if (variant === 'duplicate-body')
      input.modules[1].design_text += '\n#### DD-AA-001 Duplicate\nAnother body.\n';
    if (variant === 'wrong-owner') input.modules[1].module_code = 'BB';
    if (variant === 'invalid-task') input.tasksValid = false;
    if (variant === 'owned-object') input.modules[0].design_ids = ['DD-DOCS-001'];
    if (variant === 'internal-contract') input.modules[0].contract_entries = [{}];
    expect(inspectDocumentationTaskReferences(input).valid).toBe(false);
  });
  test('fenced examples and quoted headings cannot supply a missing definition', () => {
    expect(
      declaredDesignBodies('```md\n#### DD-AA-001\nExample\n```\n> #### DD-AA-002\nQuoted\n').size
    ).toBe(0);
  });
  test('an unrelated work item does not inherit another documentation module Task obligations', () => {
    expect(
      inspectDocumentationTaskReferences({ ...fixture(), tasks: [], paths: ['src/a.ts'] }).valid
    ).toBe(true);
  });
});

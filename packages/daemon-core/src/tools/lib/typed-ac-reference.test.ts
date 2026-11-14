import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { inspectRequirementsGeneration } from './requirements-generation';
import { validateCandidateRequirementReferences } from './candidate-requirement-reference-integrity';

const requirement = (ac = '- AC-AA-001-1: Return the approved record.') => ({
  path: 'AA/requirements.md',
  moduleCode: 'AA',
  content: `## REQ-AA-001\nUser Story: read.\n### Acceptance Criteria\n${ac}\n`,
});
const context = (reference: string) => ({
  path: 'index.md',
  content: `---\nrequirements_role: reference_context\n---\n${reference}\n`,
});
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('D29 typed AC references with exact same-generation ownership', () => {
  it.each(['REQ-AA-001-1', 'AC-AA-001-1'])(
    'resolves %s without adding a Requirement',
    reference => {
      const result = inspectRequirementsGeneration([requirement(), context(reference)]);
      expect(result.errors).toEqual([]);
      expect(result.declaredIds).toEqual(['REQ-AA-001']);
    }
  );
  it.each([
    'REQ-AA-001-2',
    'AC-AA-001-2',
    'REQ-AA-01-1',
    'REQ-AA-001-01',
    'REQ-AA-001-0',
    'REQ-AA-001-1-2',
    'REQ-AA-002-1',
  ])('rejects missing or noncanonical %s', reference => {
    expect(
      inspectRequirementsGeneration([requirement(), context(reference)]).errors.length
    ).toBeGreaterThan(0);
  });
  it('rejects a duplicate AC even without an external reference', () => {
    const result = inspectRequirementsGeneration([
      requirement('- AC-AA-001-1: First.\n- AC-AA-001-1: Second.'),
    ]);
    expect(result.errors.join('\n')).toContain('AC_DEFINITION_DUPLICATE');
  });
  it('rejects wrong-parent and empty definitions instead of falling back to parent REQ', () => {
    expect(
      inspectRequirementsGeneration([
        requirement('- AC-AA-002-1: Wrong parent.'),
        context('REQ-AA-002-1'),
      ]).errors.join('\n')
    ).toContain('AC_PARENT_MISMATCH');
    expect(
      inspectRequirementsGeneration([
        requirement('- AC-AA-001-1:'),
        context('REQ-AA-001-1'),
      ]).errors.join('\n')
    ).toContain('AC_BODY_EMPTY');
    expect(
      inspectRequirementsGeneration([
        requirement('- AC-AA-001-1:\nUnrelated paragraph.'),
        context('REQ-AA-001-1'),
      ]).errors.join('\n')
    ).toContain('AC_BODY_EMPTY');
  });
  it('does not accept a legacy AC reference as a Requirement definition', () => {
    const result = inspectRequirementsGeneration([
      requirement(),
      { path: 'bad.md', content: '## REQ-AA-001-1\nAcceptance Criteria: forged requirement.' },
    ]);
    expect(result.errors.join('\n')).toContain('REQUIREMENT_DEFINITION_NONCANONICAL');
  });
  it('forbids AC definitions in reference context', () => {
    expect(
      inspectRequirementsGeneration([
        requirement(),
        context('- AC-AA-001-2: Hidden obligation.'),
      ]).errors.join('\n')
    ).toContain('REFERENCE_CONTEXT_ACCEPTANCE_OR_STRATEGY_FORBIDDEN');
  });
  it('allows a context bullet reference but rejects an AC definition outside its parent body', () => {
    expect(inspectRequirementsGeneration([requirement(), context('- AC-AA-001-1')]).errors).toEqual(
      []
    );
    expect(
      inspectRequirementsGeneration([
        { ...requirement(), content: '- AC-AA-001-1: Outside.\n' + requirement().content },
      ]).errors.join('\n')
    ).toContain('AC_DEFINITION_OUTSIDE_REQUIREMENT');
  });
  it('requires the current generation, not an AC from the previous inputs', () => {
    expect(inspectRequirementsGeneration([requirement(), context('REQ-AA-001-1')]).errors).toEqual(
      []
    );
    const next = inspectRequirementsGeneration([
      requirement('- AC-AA-001-2: Revised obligation.'),
      context('REQ-AA-001-1'),
    ]);
    expect(next.errors.join('\n')).toContain('AC_REFERENCE_UNRESOLVED');
  });
  it('validates a frozen Task through the actual consumer without rewriting bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sf-typed-ac-'));
    roots.push(root);
    await mkdir(path.join(root, 'candidates'));
    const file = path.join(root, 'candidates', 'tasks.md');
    const original = Buffer.from('Frozen task: REQ-AA-001 and REQ-AA-001-1.\r\n');
    await writeFile(file, original);
    const good = await validateCandidateRequirementReferences({
      workItemDir: root,
      requirementArtifacts: [requirement()],
    });
    expect(good.errors).toEqual([]);
    expect(good.declared_requirement_ids).toEqual(['REQ-AA-001']);
    expect(good.input_files).toContain(file);
    const bad = await validateCandidateRequirementReferences({
      workItemDir: root,
      requirementArtifacts: [requirement('- AC-AA-001-2: Different criterion.')],
    });
    expect(bad.valid).toBe(false);
    expect(await readFile(file)).toEqual(original);
  });
});

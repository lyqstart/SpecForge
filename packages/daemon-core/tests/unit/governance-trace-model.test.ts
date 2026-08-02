import { describe, expect, it } from 'vitest';
import {
  applyGovernanceTraceDelta,
  getGovernanceContractConsumers,
  parseGovernanceTrace,
  parseGovernanceTraceDelta,
  renderGovernanceModuleTrace,
  renderGovernanceTraceDocument,
  validateGovernanceTraceSemantics,
} from '../../src/tools/lib/governance-trace-model';

describe('governance Trace prospective model', () => {
  const current = parseGovernanceTrace(
    [
      '| From | Relation | To |',
      '|---|---|---|',
      '| DATA-001 | constrained_by | ARCH-001 |',
      '| DD-ORDER-001 | constrained_by | PCON-001 |',
      '| PCON-001 | enforces | DD-ORDER-001 |',
    ].join('\n'),
    'trace_matrix.md',
  ).edges;


  it('ignores the legacy REQ-to-evidence matrix when reading governance relations', () => {
    const parsed = parseGovernanceTrace(
      [
        '# Project Trace Matrix',
        '',
        '| REQ | AC | DD | TASK | FILE | TEST | EVIDENCE |',
        '|-----|----|----|------|------|------|----------|',
        '| REQ-001 | AC-001 | DD-ORDER-001 | TASK-001 | src/order.ts | TEST-001 | EVIDENCE-001 |',
      ].join('\n'),
      'trace_matrix.md',
    );
    expect(parsed.edges).toEqual([]);
    expect(parsed.issues).toEqual([]);
  });

  it('preserves the legacy Trace matrix while replacing only the governance relation section', () => {
    const legacy = [
      '# Project Trace Matrix',
      '',
      '| REQ | AC | DD | TASK | FILE | TEST | EVIDENCE |',
      '|-----|----|----|------|------|------|----------|',
      '| REQ-001 | AC-001 | DD-ORDER-001 | TASK-001 | src/order.ts | TEST-001 | EVIDENCE-001 |',
      '',
      '<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->',
      '## Governance Relations',
      '',
      '| From | Relation | To |',
      '|---|---|---|',
      '| DD-ORDER-OLD | constrained_by | PCON-001 |',
      '<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->',
      '',
    ].join('\n');
    const rendered = renderGovernanceTraceDocument(legacy, [
      { from: 'DD-ORDER-NEW', relation: 'constrained_by', to: 'PCON-001', source: 'test' },
    ]);
    expect(rendered).toContain('REQ-001 | AC-001 | DD-ORDER-001');
    expect(rendered).toContain('DD-ORDER-NEW | constrained_by | PCON-001');
    expect(rendered).not.toContain('DD-ORDER-OLD | constrained_by | PCON-001');
    expect(rendered.match(/SPECFORGE_GOVERNANCE_RELATIONS_START/g)).toHaveLength(1);
  });

  it('reads governance ADD/REMOVE only from the marked delta section and retains legacy payload', () => {
    const delta = parseGovernanceTraceDelta(
      [
        '# Trace Delta: WI-0001',
        '',
        '## 追溯矩阵',
        '',
        '| REQ ID | AC ID | DD ID | TASK ID | 目标文件 | 验证方式 |',
        '|---|---|---|---|---|---|',
        '| REQ-001 | AC-001 | DD-ORDER-001 | TASK-001 | src/order.ts | test |',
        '',
        '<!-- SPECFORGE_GOVERNANCE_DELTA_START -->',
        '## Governance Relation Delta',
        '',
        '| Operation | From | Relation | To |',
        '|---|---|---|---|',
        '| ADD | DD-ORDER-001 | constrained_by | PCON-001 |',
        '<!-- SPECFORGE_GOVERNANCE_DELTA_END -->',
      ].join('\n'),
      'trace_delta.md',
    );
    expect(delta.issues).toEqual([]);
    expect(delta.operations).toHaveLength(1);
    expect(delta.marked_section).toBe(true);
    expect(delta.has_legacy_trace_payload).toBe(true);
    expect(delta.content_without_governance_delta).toContain('REQ-001 | AC-001');
    expect(delta.content_without_governance_delta).not.toContain('Governance Relation Delta');
  });

  it('applies ADD and REMOVE without losing unchanged formal edges', () => {
    const delta = parseGovernanceTraceDelta(
      [
        '| Operation | From | Relation | To |',
        '|---|---|---|---|',
        '| REMOVE | DD-ORDER-001 | constrained_by | PCON-001 |',
        '| ADD | DD-ORDER-002 | constrained_by | PCON-001 |',
      ].join('\n'),
      'trace_delta.md',
    );
    const projection = applyGovernanceTraceDelta({ current, operations: delta.operations });
    expect(projection.issues).toEqual([]);
    expect(projection.prospective).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'DATA-001', to: 'ARCH-001' }),
        expect.objectContaining({ from: 'PCON-001', to: 'DD-ORDER-001' }),
        expect.objectContaining({ from: 'DD-ORDER-002', to: 'PCON-001' }),
      ]),
    );
    expect(projection.prospective).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'DD-ORDER-001', to: 'PCON-001' }),
      ]),
    );
  });

  it('fails closed for malformed formal Trace rows instead of silently dropping them', () => {
    const malformed = parseGovernanceTrace(
      [
        '| From | Relation | To |',
        '|---|---|---|',
        '| DD-ORDER-001 | depends_on | PCON-001 |',
        '| DD-ORDER-002 | constrained_by | |',
      ].join('\n'),
      'trace_matrix.md',
    );
    expect(malformed.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['TRACE_RELATION_INVALID', 'TRACE_ROW_INCOMPLETE']),
    );
  });

  it('fails closed for duplicate ADD, duplicate REMOVE, conflict, and missing REMOVE', () => {
    const duplicate = parseGovernanceTraceDelta(
      [
        'ADD | DD-ORDER-002 | constrained_by | PCON-001',
        'ADD | DD-ORDER-002 | constrained_by | PCON-001',
        'REMOVE | DD-ORDER-003 | constrained_by | PCON-001',
        'REMOVE | DD-ORDER-003 | constrained_by | PCON-001',
        'ADD | DD-ORDER-004 | constrained_by | PCON-001',
        'REMOVE | DD-ORDER-004 | constrained_by | PCON-001',
      ].join('\n'),
      'trace_delta.md',
    );
    expect(duplicate.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'TRACE_DELTA_DUPLICATE_ADD',
        'TRACE_DELTA_DUPLICATE_REMOVE',
        'TRACE_DELTA_CONFLICTING_OPERATIONS',
      ]),
    );

    const projection = applyGovernanceTraceDelta({
      current,
      operations: parseGovernanceTraceDelta(
        'REMOVE | DD-ORDER-999 | constrained_by | PCON-001',
        'trace_delta.md',
      ).operations,
    });
    expect(projection.issues.map(issue => issue.code)).toContain('TRACE_DELTA_REMOVE_MISSING_EDGE');

    const repeatedAdd = applyGovernanceTraceDelta({
      current,
      operations: parseGovernanceTraceDelta(
        'ADD | DD-ORDER-001 | constrained_by | PCON-001',
        'trace_delta.md',
      ).operations,
    });
    expect(repeatedAdd.issues.map(issue => issue.code)).toContain(
      'TRACE_DELTA_ADD_EXISTING_EDGE',
    );
  });

  it('allows DD constrained_by Project Contract and blocks cross-Module internal consumption', () => {
    const projectIssues = validateGovernanceTraceSemantics({
      edges: [{ from: 'DD-ORDER-001', relation: 'constrained_by', to: 'PCON-001', source: 'x' }],
      context: {
        architecture_ids: ['ARCH-001'],
        data_model_ids: ['DATA-001'],
        design_owners: { 'DD-ORDER-001': 'ORDER' },
        contracts: [{ id: 'PCON-001', owner_module: 'CORE', module_internal: false }],
      },
    });
    expect(projectIssues).toEqual([]);

    const internalIssues = validateGovernanceTraceSemantics({
      edges: [{ from: 'DD-ORDER-001', relation: 'constrained_by', to: 'MCON-CORE-001', source: 'x' }],
      context: {
        architecture_ids: ['ARCH-001'],
        data_model_ids: ['DATA-001'],
        design_owners: { 'DD-ORDER-001': 'ORDER' },
        contracts: [{ id: 'MCON-CORE-001', owner_module: 'CORE', module_internal: true }],
      },
    });
    expect(internalIssues.map(issue => issue.code)).toContain('TRACE_INTERNAL_CONTRACT_CROSS_MODULE');
  });

  it('derives consumers only by reverse-querying formal Trace', () => {
    const consumers = getGovernanceContractConsumers({
      edges: current,
      design_owners: { 'DD-ORDER-001': 'ORDER' },
      contract_ids: ['PCON-001'],
    });
    expect(consumers).toEqual([
      expect.objectContaining({
        contract_id: 'PCON-001',
        design_id: 'DD-ORDER-001',
        module_code: 'ORDER',
      }),
    ]);
  });

  it('renders Module Trace as a generated projection rather than a second authority', () => {
    const rendered = renderGovernanceModuleTrace({
      edges: current,
      module_code: 'ORDER',
      design_owners: { 'DD-ORDER-001': 'ORDER' },
      contract_owners: { 'PCON-001': 'CORE' },
    });
    expect(rendered).toContain('GENERATED_FROM_PROJECT_TRACE: module projection');
    expect(rendered).toContain('DD-ORDER-001 | constrained_by | PCON-001');
  });
});

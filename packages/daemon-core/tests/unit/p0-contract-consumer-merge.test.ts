import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeMerge } from '../../src/tools/lib/merge-runner-v11';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

async function approvalArtifacts(root: string, wiDir: string, workItemId: string): Promise<void> {
  await writeJson(path.join(wiDir, 'work_item.json'), {
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
    status: 'approval_required',
  });
  await writeJson(path.join(wiDir, 'trigger_result.json'), {
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
  });
  await writeJson(path.join(wiDir, 'user_decision.json'), {
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
    decision_status: 'approved',
    decision_type: 'user_approved',
    decided_by: 'human user',
    user_response_quote: '批准',
  });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
  await fs.writeFile(path.join(wiDir, 'gate_summary.md'), 'Overall Status: passed\n');
  for (const gate of ['required_files_gate', 'candidate_manifest_gate', 'path_policy_gate']) {
    await writeJson(path.join(wiDir, 'gates', `${gate}.json`), { status: 'passed' });
  }
  await fs.mkdir(path.join(root, '.specforge', 'project'), { recursive: true });
}

describe('P0 Contract consumer atomic merge', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('materializes Current + ADD - REMOVE instead of copying trace_delta over formal Trace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-trace-merge-'));
    roots.push(root);
    const workItemId = 'WI-0001';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    await writeJson(path.join(root, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project: {
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [
        {
          module_code: 'ORDER',
          contracts: '.specforge/project/modules/ORDER/contracts.json',
          trace: '.specforge/project/modules/ORDER/trace.md',
          code_paths: ['src/order/**'],
        },
      ],
    });
    await writeJson(
      path.join(root, '.specforge', 'project', 'modules', 'ORDER', 'contracts.json'),
      {
        schema_version: '1.0',
        owner_module: 'ORDER',
        contracts: {
          shared_enums: [],
          invariants: [],
          public_interfaces: [],
          extension_points: [],
        },
      },
    );
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'modules', 'ORDER', 'trace.md'),
      'OLD MODULE TRACE\n',
    );
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'trace_matrix.md'),
      [
        '# Project Trace Matrix',
        '',
        '| REQ | AC | DD | TASK | FILE | TEST | EVIDENCE |',
        '|-----|----|----|------|------|------|----------|',
        '| REQ-OLD | AC-OLD | DD-ORDER-OLD | TASK-OLD | old.ts | TEST-OLD | EVIDENCE-OLD |',
        '',
        '| From | Relation | To |',
        '|---|---|---|',
        '| DATA-001 | constrained_by | ARCH-001 |',
        '',
      ].join('\n'),
    );
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'trace_delta.md'),
      [
        '# Trace Delta: WI-0001',
        '',
        '## Trace Entries',
        '',
        '| REQ | AC | DD | TASK | FILE | TEST | EVIDENCE |',
        '|-----|----|----|------|------|------|----------|',
        '| REQ-NEW | AC-NEW | DD-ORDER-001 | TASK-NEW | src/order.ts | TEST-NEW | EVIDENCE-NEW |',
        '',
        '<!-- SPECFORGE_GOVERNANCE_DELTA_START -->',
        '## Governance Relation Delta',
        '',
        '| Operation | From | Relation | To |',
        '|---|---|---|---|',
        '| ADD | DD-ORDER-001 | constrained_by | PCON-001 |',
        '<!-- SPECFORGE_GOVERNANCE_DELTA_END -->',
        '',
      ].join('\n'),
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    const formalTrace = await fs.readFile(
      path.join(root, '.specforge', 'project', 'trace_matrix.md'),
      'utf-8',
    );
    expect(formalTrace).toContain('REQ-NEW | AC-NEW | DD-ORDER-001');
    expect(formalTrace).not.toContain('REQ-OLD | AC-OLD | DD-ORDER-OLD');
    expect(formalTrace).toContain('DATA-001 | constrained_by | ARCH-001');
    expect(formalTrace).toContain('DD-ORDER-001 | constrained_by | PCON-001');
    expect(formalTrace).toContain('SPECFORGE_GOVERNANCE_RELATIONS_START');
    expect(formalTrace).not.toContain('ADD |');
    const moduleTrace = await fs.readFile(
      path.join(root, '.specforge', 'project', 'modules', 'ORDER', 'trace.md'),
      'utf-8',
    );
    expect(moduleTrace).toContain('GENERATED_FROM_PROJECT_TRACE: module projection');
    expect(moduleTrace).toContain('DD-ORDER-001 | constrained_by | PCON-001');
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, '.specforge', 'project', 'spec_manifest.json'), 'utf-8'),
    );
    expect(manifest.last_merged_targets).toContain(
      '.specforge/project/modules/ORDER/trace.md',
    );
  });

  it('restores every previously written formal file when a later projection step fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-atomic-rollback-'));
    roots.push(root);
    const workItemId = 'WI-0002';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    const project = path.join(root, '.specforge', 'project');
    const moduleRoot = path.join(project, 'modules', 'PHOTO');
    await fs.mkdir(moduleRoot, { recursive: true });
    await writeJson(path.join(project, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project: {
        requirements_index: '.specforge/project/requirements_index.md',
        trace_matrix: '.specforge/project/trace_matrix.md',
      },
      modules: [
        {
          module_code: 'PHOTO',
          module_file: '.specforge/project/modules/PHOTO/module.json',
          design: '.specforge/project/modules/PHOTO/design.md',
          contracts: '.specforge/project/modules/PHOTO/contracts.json',
          trace: '.specforge/project/modules/PHOTO/trace.md',
          code_paths: ['src/photo/**'],
        },
      ],
    });
    await writeJson(path.join(moduleRoot, 'module.json'), {
      module_code: 'PHOTO',
      code_paths: ['src/photo/**'],
    });
    await fs.writeFile(path.join(moduleRoot, 'design.md'), 'DD-PHOTO-001\n');
    await fs.writeFile(path.join(moduleRoot, 'trace.md'), 'OLD MODULE TRACE\n');
    // contracts.json is deliberately missing so generated Module Trace fails
    // after entry writes and spec_manifest update, forcing transaction rollback.
    await fs.writeFile(path.join(project, 'requirements_index.md'), 'OLD REQUIREMENTS\n');
    await fs.writeFile(
      path.join(project, 'trace_matrix.md'),
      '| From | Relation | To |\n|---|---|---|\n| DATA-001 | constrained_by | ARCH-001 |\n',
    );

    await fs.mkdir(path.join(wiDir, 'candidates', 'project'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'requirements_index.md'),
      'NEW REQUIREMENTS\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'trace_delta.md'),
      'ADD | DD-PHOTO-001 | constrained_by | PCON-001\n',
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/requirements_index.md',
          target_path: '.specforge/project/requirements_index.md',
          operation: 'replace',
          type: 'requirements',
        },
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(false);
    expect(result.rolled_back).toBe(true);
    expect(result.spec_manifest_updated).toBe(false);
    expect(result.project_spec_version).toBe('PSV-0001');
    expect(await fs.readFile(path.join(project, 'requirements_index.md'), 'utf-8'))
      .toBe('OLD REQUIREMENTS\n');
    expect(await fs.readFile(path.join(project, 'trace_matrix.md'), 'utf-8'))
      .not.toContain('DD-PHOTO-001');
    expect(await fs.readFile(path.join(moduleRoot, 'trace.md'), 'utf-8'))
      .toBe('OLD MODULE TRACE\n');
    const manifest = JSON.parse(await fs.readFile(path.join(project, 'spec_manifest.json'), 'utf-8'));
    expect(manifest.project_spec_version).toBe('PSV-0001');
    expect(manifest.last_merged_work_item).toBeUndefined();
  });

  it('rejects a full Trace matrix masquerading as Trace Delta', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-trace-full-copy-'));
    roots.push(root);
    const workItemId = 'WI-0003';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    await writeJson(path.join(root, '.specforge', 'project', 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project: { trace_matrix: '.specforge/project/trace_matrix.md' },
      modules: [],
    });
    await fs.writeFile(
      path.join(root, '.specforge', 'project', 'trace_matrix.md'),
      '| From | Relation | To |\n|---|---|---|\n| DATA-001 | constrained_by | ARCH-001 |\n',
    );
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'trace_delta.md'),
      '| From | Relation | To |\n|---|---|---|\n| DD-ORDER-001 | constrained_by | PCON-001 |\n',
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('cannot replace Governance Relations with a full');
  });

  it('rejects an independently maintained Module trace.md candidate', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-module-trace-authority-'));
    roots.push(root);
    const workItemId = 'WI-0004';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project: { trace_matrix: '.specforge/project/trace_matrix.md' },
      modules: [
        {
          module_code: 'ORDER',
          trace: '.specforge/project/modules/ORDER/trace.md',
          code_paths: ['src/order/**'],
        },
      ],
    });
    await fs.writeFile(
      path.join(project, 'trace_matrix.md'),
      '| From | Relation | To |\n|---|---|---|\n| DATA-001 | constrained_by | ARCH-001 |\n',
    );
    await fs.mkdir(path.join(project, 'modules', 'ORDER'), { recursive: true });
    await fs.writeFile(path.join(project, 'modules', 'ORDER', 'trace.md'), 'OLD\n');
    await fs.mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'ORDER'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'ORDER', 'trace.md'),
      'INDEPENDENT MODULE TRACE\n',
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/modules/ORDER/trace.md',
          target_path: '.specforge/project/modules/ORDER/trace.md',
          operation: 'replace',
          type: 'module_trace',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('generated projection');
    expect(await fs.readFile(path.join(project, 'modules', 'ORDER', 'trace.md'), 'utf-8'))
      .toBe('OLD\n');
  });

  it('preserves the established legacy Trace Delta merge path when no governance relation graph exists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-legacy-trace-'));
    roots.push(root);
    const workItemId = 'WI-0005';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project: { trace_matrix: '.specforge/project/trace_matrix.md' },
      modules: [],
    });
    await fs.writeFile(path.join(project, 'trace_matrix.md'), 'OLD LEGACY TRACE\n');
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    const legacyCandidate = [
      '# Trace Delta: WI-0005',
      '',
      '## 追溯矩阵',
      '',
      '| REQ ID | AC ID | DD ID | TASK ID | 目标文件 | 验证方式 |',
      '|---|---|---|---|---|---|',
      '| REQ-001 | AC-001 | DD-ORDER-001 | TASK-001 | src/order.ts | test |',
      '',
    ].join('\n');
    await fs.writeFile(path.join(wiDir, 'candidates', 'trace_delta.md'), legacyCandidate);
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(project, 'trace_matrix.md'), 'utf-8')).toBe(
      legacyCandidate,
    );
  });

  it('allows legacy Module trace candidates before governance relations are activated', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-legacy-module-trace-'));
    roots.push(root);
    const workItemId = 'WI-0006';
    const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
    await approvalArtifacts(root, wiDir, workItemId);
    const project = path.join(root, '.specforge', 'project');
    await writeJson(path.join(project, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [
        {
          module_code: 'ORDER',
          trace: '.specforge/project/modules/ORDER/trace.md',
          code_paths: ['src/order/**'],
        },
      ],
    });
    await fs.mkdir(path.join(project, 'modules', 'ORDER'), { recursive: true });
    await fs.writeFile(path.join(project, 'modules', 'ORDER', 'trace.md'), 'OLD\n');
    await fs.mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'ORDER'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'project', 'modules', 'ORDER', 'trace.md'),
      'LEGACY MODULE TRACE\n',
    );
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      merge_required: true,
      entries: [
        {
          candidate_path: 'candidates/project/modules/ORDER/trace.md',
          target_path: '.specforge/project/modules/ORDER/trace.md',
          operation: 'replace',
          type: 'module_trace',
        },
      ],
    });

    const result = await executeMerge({
      projectRoot: root,
      workItemId,
      workItemDir: wiDir,
      candidateManifestPath: path.join(wiDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(wiDir, 'user_decision.json'),
    });

    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(project, 'modules', 'ORDER', 'trace.md'), 'utf-8')).toBe(
      'LEGACY MODULE TRACE\n',
    );
  });

});

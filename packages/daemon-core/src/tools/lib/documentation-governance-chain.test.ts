/** Product owner integration, synthetic upstream approval/Merge; not a business acceptance claim. */
import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceContracts,
  checkProjectGovernanceTrace,
  freezeGovernanceScopeForCodePermission,
  persistGovernanceScope,
  auditActualGovernanceScope,
  assertDocumentationBindingCurrent,
} from './project-governance-v2';
import {
  computeCandidateHash,
  materializeCandidateManifestEntries,
} from './governance-invariants-v11';
import { captureVerificationAuthority } from '../../verification/authority-snapshot';
import { StateManager } from '../../state/StateManager';
import { PersonalPathResolver } from '../../daemon/path-resolver';

const roots: string[] = [];
const id = 'WI-9502';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-documentation-chain-'));
  roots.push(root);
  const wi = path.join(root, '.specforge/work-items', id),
    project = path.join(root, '.specforge/project');
  async function write(relative: string, value: string | object) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'
    );
  }
  const p = (file: string) => '.specforge/project/' + file;
  const w = (file: string) => `.specforge/work-items/${id}/` + file;
  const modules = ['CTX', 'AA', 'BB'];
  await write(p('spec_manifest.json'), {
    schema_version: '1.0',
    project_spec_version: 'PSV-0002',
    last_merged_work_item: id,
    default_module: 'CTX',
    project: {},
    modules: modules.map(module_code => ({
      module_code,
      code_paths: module_code === 'CTX' ? ['docs/readiness.md'] : [`src/${module_code}/**`],
      contracts: p(`modules/${module_code}/contracts.json`),
    })),
  });
  await write(
    p('architecture.md'),
    '# Architecture\n### ARCH-ROOT-001 Boundary\nSeparate modules.\n'
  );
  await write(p('data_model.md'), '# Data\n### DATA-ROOT-001 Model\nRespect ARCH-ROOT-001.\n');
  await write(p('extension_registry.json'), {
    schema_version: '1.0',
    project_spec_version: 'PSV-0002',
    contracts: {},
  });
  const trace =
    '| From | Relation | To |\n|---|---|---|\n| DATA-ROOT-001 | constrained_by | ARCH-ROOT-001 |\n| DD-AA-001 | constrained_by | DATA-ROOT-001 |\n| DD-BB-001 | constrained_by | ARCH-ROOT-001 |\n';
  await write(p('trace_matrix.md'), trace);
  for (const module of modules) {
    await write(p(`modules/${module}/module.json`), {
      schema_version: '1.0',
      module_code: module,
      status: 'active',
      ...(module === 'CTX' ? { implementation_kind: 'documentation_context' } : {}),
      code_paths: module === 'CTX' ? ['docs/readiness.md'] : [`src/${module}/**`],
      contracts: p(`modules/${module}/contracts.json`),
    });
    await write(
      p(`modules/${module}/design.md`),
      module === 'CTX'
        ? '# Context\nReferences DD-AA-001 and DD-BB-001.\n'
        : `# Design\n### DD-${module}-001 Decision\nA substantive ${module} decision.\n`
    );
    await write(
      p(`modules/${module}/requirements.md`),
      module === 'CTX'
        ? '---\nrequirements_role: reference_context\n---\n# Index\nREQ-AA-001 and REQ-BB-001.\n'
        : `## REQ-${module}-001 Requirement\nDeliver ${module}.\n### Acceptance Criteria\nThe contract is observed.\n`
    );
    await write(p(`modules/${module}/contracts.json`), {
      schema_version: '1.0',
      owner_module: module,
      contracts: {
        shared_enums: [],
        invariants: [],
        public_interfaces: [],
        extension_points: [],
        internal_contracts: [],
      },
    });
    await write(
      p(`modules/${module}/trace.md`),
      '<!-- GENERATED_FROM_PROJECT_TRACE: module projection; do not edit independently -->\n| From | Relation | To |\n|---|---|---|\n' +
        (module === 'CTX'
          ? ''
          : trace
              .split('\n')
              .filter(line => line.includes('DD-' + module + '-'))
              .join('\n'))
    );
  }
  await write(w('work_item.json'), {
    schema_version: '1.1',
    work_item_id: id,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    code_change_allowed: false,
    allowed_write_files: [],
  });
  await write(w('trigger_result.json'), {
    workflow_path: 'requirement_change_path',
    classification: { design_changed: true },
    impact_scope: {
      affected_modules: ['CTX'],
      design_refs: [],
      planned_code_paths: ['docs/readiness.md'],
    },
  });
  const task = `### TASK-${id}-001 Documentation\n- **refs**: [REQ-AA-001, DD-AA-001, DD-BB-001]\n- **allowed_write_files**: [docs/readiness.md]\n- **verification_commands**:\n  - unit:\n    - \`node -e "console.log('ok')"\`\n`;
  await write(w('candidates/tasks.md'), task);
  const moduleBytes = await fs.readFile(path.join(project, 'modules/CTX/module.json'), 'utf8');
  await write(w('candidates/project/modules/CTX/module.candidate.json'), moduleBytes);
  await write(
    w('candidates/project/modules/CTX/design.candidate.md'),
    await fs.readFile(path.join(project, 'modules/CTX/design.md'), 'utf8')
  );
  const manifest = {
    schema_version: '1.0',
    work_item_id: id,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    merge_required: true,
    entries: [
      {
        candidate_path: 'candidates/project/modules/CTX/module.candidate.json',
        target_path: p('modules/CTX/module.json'),
        operation: 'replace',
        type: 'module_definition',
        module_id: 'CTX',
      },
      {
        candidate_path: 'candidates/project/modules/CTX/design.candidate.md',
        target_path: p('modules/CTX/design.md'),
        operation: 'replace',
        type: 'design',
        module_id: 'CTX',
      },
    ],
  };
  await write(w('candidate_manifest.json'), manifest);
  await write(w('user_decision.json'), {
    schema_version: '1.0',
    decision_id: 'UD-' + id + '-synthetic',
    work_item_id: id,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    candidate_manifest_path: 'candidate_manifest.json',
    manifest_hash:
      'sha256:' + hash(await fs.readFile(path.join(wi, 'candidate_manifest.json'), 'utf8')),
    candidate_hash: await computeCandidateHash(wi),
    gate_summary_path: 'gate_summary.md',
    gate_summary_hash: 'sha256:' + 'a'.repeat(64),
    decision_status: 'approved',
    decision_type: 'user_approved',
    decided_by: 'synthetic-human',
    decided_at: new Date().toISOString(),
    decision_scope: 'test only',
    waivers: [],
    user_response_quote: 'synthetic upstream fixture',
  });
  await write(
    w('merge_report.md'),
    `# Merge Report\nContract: merge-report/v1\nWork Item: ${id}\nStatus: success\n\n- Total entries: 1\n- Successful: 1\n- Failed: 0\n- Spec Manifest Updated: true\n- Project Spec Version: PSV-0002\n\n| Status | Operation | Candidate | Target | Hash Match |\n|---|---|---|---|---|\n| success | replace | candidates/project/modules/CTX/module.candidate.json | ${p('modules/CTX/module.json')} | true |\n`
  );
  const input = {
    projectRoot: root,
    workItemDir: wi,
    workItemId: id,
    allowedWriteFiles: [{ path: 'docs/readiness.md', operation: 'create' as const }],
  };
  return { root, wi, project, write, p, w, task, input };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('sf-documentation-chain-')
    )
      throw Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe('finite documentation governance chain', () => {
  test('role-only Candidate remains governed and prospective Gate does not mutate formal scope or Task', async () => {
    const f = await fixture();
    const formalFile = path.join(f.project, 'modules/CTX/module.json');
    const formal = JSON.parse(await fs.readFile(formalFile, 'utf8')) as Record<string, unknown>;
    delete formal.implementation_kind;
    await f.write(f.p('modules/CTX/module.json'), formal);
    const beforeFormal = await fs.readFile(formalFile);
    const decision = JSON.parse(
      await fs.readFile(path.join(f.wi, 'user_decision.json'), 'utf8')
    ) as Record<string, unknown>;
    await f.write(f.w('user_decision.json'), { ...decision, decision_status: 'invalidated' });
    const manifest = JSON.parse(
      await fs.readFile(path.join(f.wi, 'candidate_manifest.json'), 'utf8')
    ) as Record<string, unknown>;
    manifest.base_spec_version = 'PSV-0002';
    await f.write(f.w('candidate_manifest.json'), manifest);
    const materialized = materializeCandidateManifestEntries(manifest, f.wi, {
      design_changed: true,
    });
    expect(JSON.stringify(materialized)).toContain('module.candidate.json');
    const result = await checkProjectGovernanceConsistency(f.input);
    expect(result.passed, JSON.stringify(result.checks.filter(c => !c.passed))).toBe(true);
    expect(await fs.readFile(formalFile)).toEqual(beforeFormal);
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(f.task);
    expect((await freezeGovernanceScopeForCodePermission(f.input)).passed).toBe(false);
  });
  test('verification authority refuses a stale referenced design before a new run or evidence reuse', async () => {
    const f = await fixture();
    const scope = await freezeGovernanceScopeForCodePermission(f.input);
    expect(scope.passed).toBe(true);
    await persistGovernanceScope(f.wi, scope.snapshot);
    await f.write(f.w('filesystem_baseline.json'), {});
    const metadata = JSON.parse(
      await fs.readFile(path.join(f.wi, 'work_item.json'), 'utf8')
    ) as Record<string, unknown>;
    await f.write(f.w('work_item.json'), {
      ...metadata,
      project_spec_version_at_permission: 'PSV-0002',
    });
    const sm = new StateManager(new PersonalPathResolver(), f.root);
    await sm.initialize();
    await sm.transition(id, '', 'implementation_running', 'synthetic-upstream', 'feature_spec');
    const selector = {
      projectRoot: f.root,
      workItemId: id,
      taskId: `TASK-${id}-001`,
      verificationType: 'unit',
      commandIndex: 0,
      deps: { projectManager: { getProjectStateManager: () => Promise.resolve(sm) } },
    };
    expect((await captureVerificationAuthority(selector)).command).toContain('console.log');
    await fs.appendFile(
      path.join(f.project, 'modules/AA/design.md'),
      '\nChanged requirement for verification.\n'
    );
    await expect(captureVerificationAuthority(selector)).rejects.toThrow(
      'DOCUMENTATION_BINDING_STALE'
    );
    await expect(
      captureVerificationAuthority({ ...selector, consumePurpose: 'implementation' })
    ).rejects.toThrow('DOCUMENTATION_BINDING_STALE');
  });
  test('Gate, permission and audit retain external DD ownership and constraints', async () => {
    const f = await fixture();
    for (const check of [
      checkProjectGovernanceConsistency,
      checkProjectGovernanceContracts,
      checkProjectGovernanceTrace,
    ]) {
      const result = await check(f.input);
      expect(result.passed, JSON.stringify(result.checks.filter(c => !c.passed))).toBe(true);
    }
    const result = await freezeGovernanceScopeForCodePermission(f.input);
    expect(result.passed, JSON.stringify(result.checks.filter(c => !c.passed))).toBe(true);
    expect(result.snapshot.affected_modules).toEqual(['CTX']);
    expect(result.snapshot.design_refs).toEqual(['DD-AA-001', 'DD-BB-001']);
    expect(result.snapshot.architecture_refs).toEqual(['ARCH-ROOT-001']);
    expect(result.snapshot.data_model_refs).toEqual(['DATA-ROOT-001']);
    expect(result.snapshot.allowed_write_files).toEqual(['docs/readiness.md']);
    await persistGovernanceScope(f.wi, result.snapshot);
    await f.write('docs/readiness.md', '# Actual synthetic delivery\n');
    const audit = await auditActualGovernanceScope({
      ...f.input,
      changedFiles: ['docs/readiness.md'],
    });
    expect(audit.passed, audit.violations.join(';')).toBe(true);
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(f.task);
    expect(
      (await auditActualGovernanceScope({ ...f.input, changedFiles: ['src/AA/code.ts'] })).passed
    ).toBe(false);
  });
  test.each([
    'design',
    'requirements',
    'trace',
    'role',
    'approval',
    'task',
    'merge',
    'missing-proof',
    'inactive-proof',
  ])('rejects %s drift after permission', async variant => {
    const f = await fixture();
    const result = await freezeGovernanceScopeForCodePermission(f.input);
    expect(result.passed, JSON.stringify(result.checks.filter(c => !c.passed))).toBe(true);
    if (variant === 'missing-proof') delete result.snapshot.documentation_binding;
    else if (variant === 'inactive-proof') result.snapshot.active = false;
    else {
      const relative = (
        {
          design: f.p('modules/AA/design.md'),
          requirements: f.p('modules/AA/requirements.md'),
          trace: f.p('trace_matrix.md'),
          role: f.p('modules/CTX/module.json'),
          approval: f.w('user_decision.json'),
          task: f.w('candidates/tasks.md'),
          merge: f.w('merge_report.md'),
        } as Record<string, string>
      )[variant];
      await fs.appendFile(path.join(f.root, relative), '\n');
      await expect(assertDocumentationBindingCurrent(f.root, result.snapshot)).rejects.toThrow(
        'DOCUMENTATION_BINDING_STALE'
      );
    }
    await persistGovernanceScope(f.wi, result.snapshot);
    expect(
      (await auditActualGovernanceScope({ ...f.input, changedFiles: ['docs/readiness.md'] })).passed
    ).toBe(false);
  });
  test.each([
    'implicit-role',
    'owned-requirement',
    'missing-body',
    'duplicate-body',
    'non-markdown',
    'stale-approval',
    'own-decision',
  ])('refuses %s instead of bypassing ordinary governance', async variant => {
    const f = await fixture();
    const modulePath = f.p('modules/CTX/module.json');
    if (variant === 'implicit-role' || variant === 'non-markdown') {
      const definition = JSON.parse(
        await fs.readFile(path.join(f.root, modulePath), 'utf8')
      ) as Record<string, unknown>;
      if (variant === 'implicit-role') delete definition.implementation_kind;
      else definition.code_paths = ['docs/run.js'];
      await f.write(modulePath, definition);
    }
    if (variant === 'owned-requirement')
      await f.write(
        f.p('modules/CTX/requirements.md'),
        '## REQ-CTX-001 Own requirement\nA body.\n### Acceptance Criteria\nVerified.\n'
      );
    if (variant === 'missing-body')
      await f.write(f.p('modules/AA/design.md'), '# References\nDD-AA-001 only mentioned.\n');
    if (variant === 'duplicate-body')
      await fs.appendFile(
        path.join(f.project, 'modules/AA/design.md'),
        '\n### DD-AA-001 Duplicate\nAnother body.\n'
      );
    if (variant === 'own-decision')
      await fs.appendFile(
        path.join(f.project, 'modules/CTX/design.md'),
        '\n### DD-CTX-001 Forbidden\nOwn decision.\n'
      );
    if (variant === 'stale-approval')
      await fs.appendFile(path.join(f.wi, 'candidates/tasks.md'), '\nChanged approved Task.\n');
    expect((await freezeGovernanceScopeForCodePermission(f.input)).passed).toBe(false);
  });
});

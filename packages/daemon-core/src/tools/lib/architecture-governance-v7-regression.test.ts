import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Architecture governance v7 closure', () => {
  it('makes formal_version_gate a registered first-class Gate sequenced after verification', () => {
    const runner = source('src/tools/lib/gate-runner-v11.ts');
    const chain = source('src/tools/lib/gate-chain.ts');

    expect(runner).toContain("| 'formal_version_gate'");
    expect(runner).toContain("registerGate('formal_version_gate', 'hard_gate', true");
    expect(chain).toContain("runAndWrite('formal_version_gate', ctx)");
    expect(chain).not.toContain("'formal_version_gate' as GateIdV11");
  });

  it('requires new Modules to ship contracts.json and code_paths before merge', () => {
    const gateRunner = source('src/tools/lib/gate-runner-v11.ts');
    const mergeRunner = source('src/tools/lib/merge-runner-v11.ts');
    const invariants = source('src/tools/lib/governance-invariants-v11.ts');

    expect(gateRunner).toContain(
      "['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']"
    );
    expect(gateRunner).toContain('declares non-empty code_paths');
    expect(gateRunner).toContain('contracts.json has matching owner_module');
    expect(mergeRunner).toContain(
      "['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']"
    );
    expect(mergeRunner).toContain('module.json must declare non-empty code_paths');
    expect(mergeRunner).toContain('contracts.json must declare schema_version=1.0');
    expect(invariants).toContain('contracts.candidate.json');
  });

  it('promotes contracts and code_paths into spec_manifest without breaking legacy initialization', () => {
    const moduleModel = source('../types/src/project-spec-module.ts');
    const mergeRunner = source('src/tools/lib/merge-runner-v11.ts');
    const governance = source('src/tools/lib/project-governance-v2.ts');

    expect(moduleModel).toContain('include_governance?: boolean');
    expect(moduleModel).toContain('contracts: `${root}/contracts.json`');
    expect(moduleModel).toContain('code_paths: Array.from');
    expect(mergeRunner).toContain('include_governance: governanceReady');
    expect(governance).toContain('modules.length > 0');
    expect(governance).toContain('module.contracts_declared');
    expect(governance).toContain('module.code_paths.length > 0');
  });

  it('injects Impact Scope and authoritative upper-layer constraints into runtime context', () => {
    const context = source('src/tools/lib/sf_context_build_core.ts');

    expect(context).toContain('class ProjectGovernanceContextSource');
    expect(context).toContain('rawScope = trigger?.impact_scope');
    expect(context).toContain('Architecture [');
    expect(context).toContain('Data Model [');
    expect(context).toContain('Project Contracts');
    expect(context).toContain('Module Contracts');
    expect(context).toContain('Requirement ${moduleCode}');
    expect(context).toContain('new ProjectGovernanceContextSource(baseDir)');
    expect(context).toContain('{ heading: "## 治理约束", items: governance, priority: 5 }');
  });

  it('audits actual implementation ownership during Verification and Formal Version Gate', () => {
    const governance = source('src/tools/lib/project-governance-v2.ts');

    expect(governance).toContain('deriveActualChangedFiles');
    expect(governance).toContain('getFactualChangedFiles(workItemDir)');
    expect(governance).toContain("source: 'write_guard_log.jsonl'");
    expect(governance).toContain('ACTUAL_FILE_MODULE_OWNERSHIP_INVALID');
    expect(governance).toContain('ACTUAL_SCOPE_EXCEEDS_APPROVED_MODULES');
    expect(governance).toContain("'actual_scope_audit_passed'");
    expect(governance).toContain("'formal_actual_governance_scope'");
    expect(governance).toContain("execFileAsync('git', ['ls-files', '--others', '--exclude-standard']");
  });
});

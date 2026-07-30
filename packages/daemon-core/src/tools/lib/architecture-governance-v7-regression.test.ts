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
    expect(mergeRunner).toContain('governanceOnlyDefault');
    expect(governance).toContain('modules.length > 0');
    expect(governance).toContain('module.contracts_declared');
    expect(governance).toContain('module.code_paths.length > 0');
  });
  it('injects Impact Scope and authoritative upper-layer constraints into runtime context', () => {
    const context = source('src/tools/lib/sf_context_build_core.ts');
    expect(context).toContain('class ProjectGovernanceContextSource');
    expect(context).toContain('resolveContextScope');
    expect(context).toContain('governance_scope.json');
    expect(context).toContain('trigger?.impact_scope');
    expect(context).toContain('trigger?.impact_summary');
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
  it('exposes controlled first-project bootstrap Candidates only through sf-design', () => {
    const writer = source('src/tools/handlers/sf-artifact-write.ts');
    const userTool = source('../../setup/userlevel-opencode/tools/sf_artifact_write.ts');
    expect(writer).toContain("fileType === 'candidate_architecture'");
    expect(writer).toContain('candidates/project/architecture.candidate.md');
    expect(writer).toContain("fileType === 'candidate_data_model'");
    expect(writer).toContain('candidates/project/data_model.candidate.md');
    expect(writer).toContain("fileType === 'candidate_module_contract'");
    expect(writer).toContain('contracts.candidate.json');
    expect(writer).toContain("['candidate_architecture', 'sf-design']");
    expect(writer).toContain("['candidate_data_model', 'sf-design']");
    expect(writer).toContain("['candidate_module_contract', 'sf-design']");
    expect(writer).toContain('augmentGovernanceCandidateEntries(rawEntries, wiDir)');
    expect(writer).toContain("'candidates/project/architecture.candidate.md'");
    expect(writer).toContain("'candidates/project/data_model.candidate.md'");
    expect(writer).toContain('`${root}/contracts.candidate.json`');
    expect(userTool).toContain('"candidate_architecture"');
    expect(userTool).toContain('"candidate_data_model"');
    expect(userTool).toContain('"candidate_module_contract"');
  });
  it('treats contracts.json as a declared governance target for every declared Module', () => {
    const pathPolicy = source('src/tools/lib/path-policy.ts');
    expect(pathPolicy).toContain("import { resolveSpecModuleIdentity } from '@specforge/types';");
    expect(pathPolicy).toContain(
      'declared.add(`.specforge/project/modules/${identity.moduleCode}/contracts.json`);'
    );
  });
  it('validates Module Contract provenance in the existing hard contract integrity Gate', () => {
    const integrity = source('src/tools/lib/contract-integrity.ts');
    expect(integrity).toContain('ContractRegistrySchema');
    expect(integrity).toContain('extractModuleFromDdId');
    expect(integrity).toContain('moduleCodeFromProjectSpecPath');
    expect(integrity).toContain('source_refs must contain at least one DD-* reference');
    expect(integrity).toContain('.enforcement is required');
    expect(integrity).toContain('owner_module must equal target module');
    expect(integrity).toContain('Project Contract delta check is not applicable');
  });
});

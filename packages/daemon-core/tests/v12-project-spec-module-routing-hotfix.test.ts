import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const sourcePath = join(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-artifact-write.ts');

function source(): string {
  expect(existsSync(sourcePath), 'sf-artifact-write.ts should exist').toBe(true);
  return readFileSync(sourcePath, 'utf8');
}

describe('当前项目规格模块路由契约', () => {
  it('使用共享 MODULE_CODE 解析，并且只允许架构变更显式建立新模块', () => {
    const text = source();
    expect(text).toContain('resolveDeclaredCandidateModuleId');
    expect(text).toContain('readModuleOwnership');
    expect(text).toContain('resolveSpecModuleIdentity');
    expect(text).toContain('normalizeModuleCodeReference');
    expect(text).toContain('isGovernedModuleAdmission');
    expect(text).toContain("workItem?.workflow_path === 'architecture_change_path'");
    expect(text).toContain("workItem?.workflow_path === 'spec_migration_path'");
    expect(text).toContain('MODULE_OWNERSHIP_UNRESOLVED');
    expect(text).toContain('MODULE_OWNERSHIP_AMBIGUOUS');
    expect(text).toContain('MODULE_NOT_DECLARED');
    expect(text).toContain(
      "candidateModuleRelativePath(baseDir, workItemId, moduleId, 'requirements')"
    );
    expect(text).toContain("candidateModuleRelativePath(baseDir, workItemId, moduleId, 'design')");
    expect(text).not.toContain('candidates/project/modules/core/requirements.candidate.md');
    expect(text).not.toContain('candidates/project/modules/core/design.candidate.md');
  });

  it('规范化 Candidate Manifest 路径并校验模块所有权', () => {
    const text = source();
    expect(text).toContain('inferCandidateModuleIdFromEntry');
    expect(text).toContain('validateCandidateManifestModuleOwnership');
    expect(text).toContain("projectModuleTargetPath(baseDir, moduleId, 'requirements')");
    expect(text).toContain("projectModuleTargetPath(baseDir, moduleId, 'design')");
    expect(text).toContain('rawEntries');
    expect(text).toContain(
      'rawEntries.map((entry: any) => canonicalizeCandidateEntry(entry, baseDir, workItemId))'
    );
  });
});

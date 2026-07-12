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
  it('只把 Candidate 路由到 spec_manifest 已声明模块，不静默回退 core', () => {
    const text = source();
    expect(text).toContain('resolveDeclaredCandidateModuleId');
    expect(text).toContain('readModuleOwnership');
    expect(text).toContain("readFrontMatterField(content, ['target_module_path'])");
    expect(text).toContain("readFrontMatterField(content, ['module_id', 'module'])");
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

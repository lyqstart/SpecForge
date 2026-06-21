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

describe('v1.2 project spec module routing hotfix', () => {
  it('routes candidate requirements/design from module front-matter instead of hard-coded core', () => {
    const text = source();
    expect(text).toContain('inferCandidateModuleIdFromContent');
    expect(text).toContain("readFrontMatterField(content, ['target_module_path'])");
    expect(text).toContain("readFrontMatterField(content, ['module_id', 'module'])");
    expect(text).toContain("candidateModulePath(inferCandidateModuleIdFromContent(content), 'requirements')");
    expect(text).toContain("candidateModulePath(inferCandidateModuleIdFromContent(content), 'design')");
    expect(text).not.toContain('candidates/project/modules/core/requirements.candidate.md');
    expect(text).not.toContain('candidates/project/modules/core/design.candidate.md');
  });

  it('normalizes candidate manifest target paths by module_id/module/target path', () => {
    const text = source();
    expect(text).toContain('inferCandidateModuleIdFromEntry');
    expect(text).toContain("projectModuleTargetPath(moduleId, 'requirements')");
    expect(text).toContain("projectModuleTargetPath(moduleId, 'design')");
    expect(text).toContain('rawEntries');
    expect(text).toContain('rawEntries.map(canonicalizeCandidateEntry)');
  });
});
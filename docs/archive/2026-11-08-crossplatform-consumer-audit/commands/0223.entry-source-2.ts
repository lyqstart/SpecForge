import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workItemCandidateDesign } from '@specforge/types/directory-layout';
import { lintDocument } from '../src/tools/lib/sf_doc_lint_core';

const repoRoot = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8');

const decision = read('docs/adr/ADR-013-current-release-boundary-and-no-legacy-compatibility.md');
const recoveryDecision = read('docs/adr/ADR-014-authority-model-recovery-freeze.md');
const governance = read('docs/design/SpecForge架构一致性治理最终实施方案.md');
const registry = read('docs/product-specification/authority-registry.md');
const productSpecification = read('docs/product-specification/specforge-product-specification.md');
const projectStatus = read('docs/project-status.md');
const daemonLint = read('packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts');
const userlevelLint = read('setup/userlevel-opencode/tools/lib/sf_doc_lint_core.ts');
const rootLintFixtures = [
  'tests/unit/tools/sf_doc_lint_v6_architecture.test.ts',
  'tests/unit/tools/sf_doc_lint_debug.test.ts',
  'tests/unit/tools/sf_doc_lint.test.ts',
].map(read).join('\n');

describe('authority recovery consumer alignment', () => {
  it('binds current consumers to the established product authority and project status', () => {
    expect(recoveryDecision).toContain('`.kiro/` 不是 SpecForge 当前产品需求或产品架构的权威根目录');
    expect(recoveryDecision).toContain('本 ADR 不创建新的产品需求或产品架构事实源');
    expect(decision).toContain('ADR-014 的 authority recovery 已建立正式 Registry 与 SPS-1.0');
    expect(governance).toContain('SUBORDINATE_TECHNICAL_GOVERNANCE_CONTRACT');
    expect(registry).toContain('docs/product-specification/specforge-product-specification.md');
    expect(registry).toContain('docs/project-status.md');
    expect(productSpecification).toContain('SPECFORGE_RELEASE_AUTHORITY_ITEMS:START');
    expect(projectStatus).toContain('PROJECT_STATUS_DECLARATION=ACTIVE');
    expect(projectStatus).toContain('AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS');
  });

  it('projects the current Observability principle into both active Doc Lint implementations', () => {
    const principle = '可观测性是一级能力，不是第二套状态系统';

    expect(daemonLint).toContain(`"${principle}"`);
    expect(userlevelLint).toContain(`"${principle}"`);
    expect(rootLintFixtures).toContain(principle);
    expect(rootLintFixtures).not.toContain('可观测性是一级组件，不是附加能力');
  });

  it('accepts the bounded design fixture through the Daemon Doc Lint entry', async () => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), 'specforge-v6-authority-'));
    const workItemId = 'WI-V6-AUTHORITY';
    const designPath = workItemCandidateDesign(projectRoot, workItemId, 'V6-ARCHITECTURE');

    try {
      await mkdir(resolve(designPath, '..'), { recursive: true });
      await writeFile(designPath, `# V6 Architecture\n\n**可观测性是一级能力，不是第二套状态系统**\n`, 'utf8');
      const result = await lintDocument(workItemId, 'design', projectRoot);

      expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

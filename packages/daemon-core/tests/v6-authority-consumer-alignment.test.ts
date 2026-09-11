import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workItemCandidateDesign } from '@specforge/types/directory-layout';
import { lintDocument } from '../src/tools/lib/sf_doc_lint_core';

const repoRoot = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8');

const requirements = read('.kiro/specs/v6-architecture-overview/requirements.md');
const design = read('.kiro/specs/v6-architecture-overview/design.md');
const decision = read('docs/adr/ADR-013-current-release-boundary-and-no-legacy-compatibility.md');
const governance = read('docs/design/SpecForge架构一致性治理最终实施方案.md');
const daemonLint = read('packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts');
const userlevelLint = read('setup/userlevel-opencode/tools/lib/sf_doc_lint_core.ts');
const rootLintFixtures = [
  'tests/unit/tools/sf_doc_lint_v6_architecture.test.ts',
  'tests/unit/tools/sf_doc_lint_debug.test.ts',
  'tests/unit/tools/sf_doc_lint.test.ts',
].map(read).join('\n');

describe('V6 authority and governance consumer alignment', () => {
  it('keeps the four document roles directional instead of creating parallel authorities', () => {
    expect(requirements).toContain('本文档作为它们的权威参考');
    expect(requirements).toContain('requirements → design → governance/module specs → implementation/deployment → tests/documents');
    expect(design).toContain('`requirements.md` 决定当前发布做什么与不做什么；本文决定这些能力由哪些模块');
    expect(decision).toContain('本 ADR 记录“为什么作出决定”和“决定了什么”，但不取代 V6 产品架构');
    expect(governance).toContain('本文件自身是 V6 产品权威的治理消费者');
    expect(governance).toContain('.kiro/specs/v6-architecture-overview/requirements.md（当前产品范围）');
    expect(governance).toContain('→ .kiro/specs/v6-architecture-overview/design.md（当前产品架构）');
    expect(governance).toContain('→ 本文件（治理子系统如何执行和阻断）');
  });

  it('projects the current Observability principle into both active Doc Lint implementations', () => {
    const principle = '可观测性是一级能力，不是第二套状态系统';

    expect(requirements).toContain(`原则 4：${principle}`);
    expect(design).toContain(`**${principle}**`);
    expect(daemonLint).toContain(`"${principle}"`);
    expect(userlevelLint).toContain(`"${principle}"`);
    expect(rootLintFixtures).toContain(principle);
    expect(rootLintFixtures).not.toContain('可观测性是一级组件，不是附加能力');
  });

  it('accepts the authoritative V6 design through the Daemon Doc Lint entry', async () => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), 'specforge-v6-authority-'));
    const workItemId = 'WI-V6-AUTHORITY';
    const designPath = workItemCandidateDesign(projectRoot, workItemId, 'V6-ARCHITECTURE');

    try {
      await mkdir(resolve(designPath, '..'), { recursive: true });
      await writeFile(designPath, design, 'utf8');
      const result = await lintDocument(workItemId, 'design', projectRoot);

      expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

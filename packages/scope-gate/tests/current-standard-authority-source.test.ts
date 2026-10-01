import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

const CURRENT_CONSUMERS = [
  'packages/types/src/index.ts',
  'packages/types/src/directory-layout.ts',
  'packages/types/src/meta-schema.ts',
  'packages/workflow-runtime/src/types/gate-definition.ts',
  'packages/workflow-runtime/src/types/state-machine.ts',
  'packages/daemon-core/src/tools/lib/gate-runner-v11.ts',
  'packages/daemon-core/src/tools/lib/state-machine-v11.ts',
  'packages/daemon-core/src/tools/lib/user-decision-recorder-v11.ts',
  'packages/daemon-core/src/tools/lib/work-item-lifecycle-v11.ts',
  'packages/daemon-core/src/tools/lib/workflow-path-selector-v11.ts',
  'packages/daemon-core/src/tools/lib/write-guard-v11.ts',
  'setup/userlevel-opencode/agents/sf-design.md',
] as const;

describe('current standard authority source', () => {
  it('does not present the archived fused standard as current authority', async () => {
    for (const relativePath of CURRENT_CONSUMERS) {
      const content = await readFile(resolve(ROOT, relativePath), 'utf8');
      expect(content, relativePath).not.toContain('依据：SpecForge 最终融合标准');
      expect(content, relativePath).not.toContain('specforge_final_fused_standard_v1_1_patch1_zh.md');
      expect(content, relativePath).not.toContain('标准依据:');
    }
  });

  it('binds current product and executable-contract ownership explicitly', async () => {
    const contents = await Promise.all(
      CURRENT_CONSUMERS.map(relativePath => readFile(resolve(ROOT, relativePath), 'utf8')),
    );

    for (const [index, content] of contents.entries()) {
      expect(content, CURRENT_CONSUMERS[index]).toContain('SPS-1.0');
      expect(content, CURRENT_CONSUMERS[index]).toContain('当前可执行合同');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

function expectRepoFile(relativePath: string): string {
  const full = join(repoRoot, relativePath);
  expect(existsSync(full), `${relativePath} should exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

describe('current implementation boundary with preserved v1.2 evidence', () => {
  it('keeps the current control plane free of duplicate Project Registry and local write-guard owners', () => {
    expect(existsSync(join(repoRoot, 'packages/daemon-core/src/project/ProjectSpecStore.ts'))).toBe(false);
    expect(existsSync(join(repoRoot, 'packages/daemon-core/src/tools/lib/write-guard-preflight-v12.ts'))).toBe(false);
  });

  it('keeps only current userlevel tool wrappers registered for installer deployment', () => {
    const registry = expectRepoFile('scripts/lib/registry.ts');

    expect(registry).not.toContain('tools/sf_write_guard_preflight.ts');
    expect(registry).toContain('tools/sf_contract_register.ts');

    expect(existsSync(join(repoRoot, 'setup/userlevel-opencode/tools/sf_write_guard_preflight.ts'))).toBe(false);
    expectRepoFile('setup/userlevel-opencode/tools/sf_contract_register.ts');
  });

  it('preserves v1.2 design and disposition files strictly as historical evidence', () => {
    const matrix = expectRepoFile('docs/archive/design/specforge-v1.2-acceptance-matrix.md');
    const projectSpec = expectRepoFile('docs/archive/design/specforge-v1.2-project-spec-architecture.md');
    const extension = expectRepoFile('docs/archive/design/specforge-v1.2-extension-subflow-design.md');
    const historicalDisposition = expectRepoFile(
      'docs/archive/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
    );
    const authorityRegistry = expectRepoFile(
      'docs/product-specification/authority-registry.md',
    );

    expect(matrix).toContain('PSA-P1');
    expect(matrix).toContain('WG-N3');
    expect(matrix).toContain('EXT-N2');
    expect(projectSpec).toContain('.specforge/project/**');
    expect(extension).toContain('extension_registry.json');
    expect(historicalDisposition).toContain('sf_write_guard_preflight');
    expect(authorityRegistry).toContain(
      '测试若读取归档文件，只能验证历史证据未丢失，不能据此约束当前产品行为',
    );
  });

  it('keeps the v1.2 slice reports present as release evidence', () => {
    const projectReport = expectRepoFile('docs/archive/reports/specforge-v1.2-project-spec-store-slice-report.md');
    const writeGuardReport = expectRepoFile('docs/archive/reports/specforge-v1.2-write-guard-preflight-slice-report.md');
    const extensionReport = expectRepoFile('docs/archive/reports/specforge-v1.2-extension-subflow-slice-report.md');

    expect(projectReport).toMatch(/PASSED|Result/i);
    expect(writeGuardReport).toContain('PASSED');
    expect(extensionReport).toContain('PASSED');
  });
});

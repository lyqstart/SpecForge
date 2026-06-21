import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCloseGateWriteGuard,
  sfWriteGuardPreflight,
} from '../src/tools/lib/write-guard-preflight-v12';
import {
  createEmptyExtensionRegistry,
  createExtensionProposal,
  createExtensionRequest,
  createParentResumeToken,
  mergeExtensionRegistry,
} from '../src/tools/lib/extension-subflow-v12';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function expectRepoFile(relativePath: string): string {
  const full = join(repoRoot, relativePath);
  expect(existsSync(full), `${relativePath} should exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

describe('v1.2 integration RC hardening', () => {
  it('keeps the three v1.2 core slice source files present', () => {
    const projectStore = expectRepoFile('packages/daemon-core/src/project/ProjectSpecStore.ts');
    const writeGuard = expectRepoFile('packages/daemon-core/src/tools/lib/write-guard-preflight-v12.ts');
    const extension = expectRepoFile('packages/daemon-core/src/tools/lib/extension-subflow-v12.ts');

    expect(projectStore).toContain('ProjectSpecStore');
    expect(writeGuard).toContain('sfWriteGuardPreflight');
    expect(extension).toContain('createExtensionRequest');
  });

  it('keeps userlevel tool wrappers registered for installer deployment', () => {
    const registry = expectRepoFile('scripts/lib/registry.ts');

    expect(registry).toContain('tools/sf_write_guard_preflight.ts');
    expect(registry).toContain('tools/sf_extension_subflow.ts');

    expectRepoFile('setup/userlevel-opencode/tools/sf_write_guard_preflight.ts');
    expectRepoFile('setup/userlevel-opencode/tools/sf_extension_subflow.ts');
  });

  it('keeps v1.2 design freeze and acceptance matrix aligned with implementation', () => {
    const matrix = expectRepoFile('docs/design/specforge-v1.2-acceptance-matrix.md');
    const projectSpec = expectRepoFile('docs/design/specforge-v1.2-project-spec-architecture.md');
    const writeGuard = expectRepoFile('docs/design/specforge-v1.2-write-guard-control-plane.md');
    const extension = expectRepoFile('docs/design/specforge-v1.2-extension-subflow-design.md');

    expect(matrix).toContain('PSA-P1');
    expect(matrix).toContain('WG-N3');
    expect(matrix).toContain('EXT-N2');
    expect(projectSpec).toContain('.specforge/project/**');
    expect(writeGuard).toContain('sf_write_guard_preflight');
    expect(extension).toContain('extension_registry.json');
  });

  it('proves Write Guard blocks direct project spec writes and close after violations', () => {
    const directProjectSpecWrite = sfWriteGuardPreflight({
      work_item_id: 'WI-INTEGRATION',
      tool_name: 'edit',
      operation: 'modify',
      current_state: 'implementation_running',
      code_permission_enabled: true,
      allowed_write_dirs: ['.specforge/project'],
      target_paths: ['.specforge/project/requirements/requirements.md'],
    });

    expect(directProjectSpecWrite.allowed).toBe(false);
    expect(directProjectSpecWrite.decision).toBe('DIRECT_PROJECT_SPEC_WRITE');

    const close = checkCloseGateWriteGuard({
      blocked_write_attempts: directProjectSpecWrite.blocked_write_attempts,
      violations: directProjectSpecWrite.violations,
    });

    expect(close.allowed).toBe(false);
    expect(close.decision).toBe('CLOSE_BLOCKED_BY_WRITE_GUARD');
  });

  it('proves Extension Subflow can create, approve, merge, and resume parent workflow', () => {
    const request = createExtensionRequest({
      parent_work_item_id: 'WI-INTEGRATION',
      missing_kind: 'artifact_type',
      missing_name: 'security_review',
      reason: 'integration acceptance requires controlled extension request',
      return_state: 'candidate_preparing',
    });

    const proposal = createExtensionProposal({ request });
    const merged = mergeExtensionRegistry({
      registry: createEmptyExtensionRegistry('EXT-0000'),
      proposal,
      expected_registry_version: 'EXT-0000',
      user_approved: true,
    });

    expect(merged.allowed).toBe(true);
    expect(merged.decision).toBe('EXTENSION_MERGED');
    expect(merged.registry.registry_version).toBe('EXT-0001');

    const resume = createParentResumeToken(proposal, merged.registry.registry_version);
    expect(resume.parent_work_item_id).toBe('WI-INTEGRATION');
    expect(resume.extension_id).toBe('artifact_type.security_review');
    expect(resume.return_state).toBe('candidate_preparing');
    expect(resume.next_action).toBe('resume_parent_workflow');
  });

  it('keeps the v1.2 slice reports present as release evidence', () => {
    const projectReport = expectRepoFile('docs/reports/specforge-v1.2-project-spec-store-slice-report.md');
    const writeGuardReport = expectRepoFile('docs/reports/specforge-v1.2-write-guard-preflight-slice-report.md');
    const extensionReport = expectRepoFile('docs/reports/specforge-v1.2-extension-subflow-slice-report.md');

    expect(projectReport).toMatch(/PASSED|Result/i);
    expect(writeGuardReport).toContain('PASSED');
    expect(extensionReport).toContain('PASSED');
  });
});

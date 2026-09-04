import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import '../../src/tools/index';
import { ToolDispatcher } from '../../src/tools/ToolDispatcher';

const dispatcher = new ToolDispatcher({
  stateManager: undefined,
  workflowEngine: undefined,
  projectManager: undefined,
  eventLogger: undefined,
  eventBus: undefined,
  permissionEngine: undefined,
  cas: undefined,
  sessionRegistry: undefined,
});

describe('current release daemon tool registry', () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  it('registers the current public governance names', () => {
    expect(dispatcher.listRegisteredTools()).toEqual(expect.arrayContaining([
      'sf_work_item_create',
      'sf_handoff',
      'sf_rollback',
      'sf_verification',
    ]));
  });

  it('does not expose legacy v1.1 implementation names', () => {
    expect(dispatcher.listRegisteredTools().filter((name) => name.startsWith('sf_v11_')))
      .toEqual([]);
  });

  it('does not register capabilities excluded from the current release', () => {
    const excluded = [
      'sf_context_build',
      'sf_continuity',
      'sf_cost_report',
      'sf_knowledge_graph',
      'sf_knowledge_query',
      'sf_git_changed_files_audit',
      'sf_git_project_adopt',
      'sf_git_pr_plan',
      'sf_git_stacked_branch_plan',
      'sf_git_worktree_create',
      'sf_git_worktree_plan',
      'sf_spec_migration',
      'sf_v11_spec_migration',
      'sf_work_item_repair_closure',
    ];

    expect(dispatcher.listRegisteredTools().filter((name) => excluded.includes(name)))
      .toEqual([]);
  });

  it('physically excludes the legacy Work Item repair compatibility audit', () => {
    for (const relativePath of [
      'packages/daemon-core/src/tools/handlers/sf-work-item-repair-closure.ts',
      'setup/userlevel-opencode/tools/sf_work_item_repair_closure.ts',
    ]) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
    for (const relativePath of [
      'packages/daemon-core/src/tools/index.ts',
      'scripts/lib/registry.ts',
      'packages/types/src/directory-layout.ts',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toContain('sf_work_item_repair_closure');
    }
  });

  it('physically excludes the legacy Project Spec migration tool surfaces', () => {
    for (const relativePath of [
      'packages/daemon-core/src/tools/handlers/sf-v11-spec-migration.ts',
      'packages/daemon-core/src/tools/lib/spec-migration-v11.ts',
      'setup/userlevel-opencode/tools/sf_spec_migration.ts',
    ]) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }

    const httpServer = readFileSync(
      resolve(repositoryRoot, 'packages/daemon-core/src/http/HTTPServer.ts'),
      'utf8',
    );
    const contractAuthoring = readFileSync(
      resolve(repositoryRoot, 'packages/daemon-core/src/tools/lib/contract-authoring.ts'),
      'utf8',
    );
    expect(httpServer).not.toContain('handleV11SpecMigration');
    expect(httpServer).not.toContain("tool: 'sf_v11_spec_migration'");
    expect(contractAuthoring).not.toContain('run sf_spec_migration(action=prepare_repair) first');
  });

  it('physically excludes the five P1 context, continuity, cost and graph capabilities', () => {
    const removedFiles = [
      'packages/daemon-core/src/tools/handlers/sf-context-build.ts',
      'packages/daemon-core/src/tools/handlers/sf-continuity.ts',
      'packages/daemon-core/src/tools/handlers/sf-cost-report.ts',
      'packages/daemon-core/src/tools/handlers/sf-knowledge-graph.ts',
      'packages/daemon-core/src/tools/handlers/sf-knowledge-query.ts',
      'packages/daemon-core/src/tools/lib/sf_context_build_core.ts',
      'packages/daemon-core/src/tools/lib/sf_continuity_core.ts',
      'packages/daemon-core/src/tools/lib/sf_cost_report_core.ts',
      'packages/daemon-core/src/tools/lib/sf_knowledge_graph_core.ts',
      'packages/daemon-core/src/tools/lib/sf_knowledge_query_core.ts',
      'setup/userlevel-opencode/tools/sf_context_build.ts',
      'setup/userlevel-opencode/tools/sf_continuity.ts',
      'setup/userlevel-opencode/tools/sf_cost_report.ts',
      'setup/userlevel-opencode/tools/sf_knowledge_graph.ts',
      'setup/userlevel-opencode/tools/sf_knowledge_query.ts',
      'setup/userlevel-opencode/tools/lib/sf_context_build_core.ts',
      'setup/userlevel-opencode/tools/lib/sf_continuity_core.ts',
      'setup/userlevel-opencode/tools/lib/sf_cost_report_core.ts',
      'setup/userlevel-opencode/tools/lib/sf_knowledge_graph_core.ts',
      'setup/userlevel-opencode/tools/lib/sf_knowledge_query_core.ts',
    ];
    for (const relativePath of removedFiles) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }

    for (const relativePath of [
      'packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts',
      'packages/daemon-core/src/tools/lib/sf_design_gate_core.ts',
      'packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts',
      'packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts',
      'scripts/lib/registry.ts',
      'setup/userlevel-scripts-lib/registry.ts',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /sf_(?:context_build|continuity|cost_report|knowledge_graph|knowledge_query)/,
      );
    }

    for (const relativePath of [
      'packages/types/src/directory-layout.ts',
      'packages/daemon-core/src/tools/lib/sf_project_init_core.ts',
      'scripts/render-layout.ts',
      'setup/userlevel-opencode/AGENTS.md',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /skill_fragments\.json|knowledge\/graph\.json|knowledgeFiles|kg_sync/,
      );
    }
  });

  it('physically excludes the duplicate user-level write guard preflight surface', () => {
    for (const relativePath of [
      'packages/daemon-core/src/tools/lib/write-guard-preflight-v12.ts',
      'setup/userlevel-opencode/tools/sf_write_guard_preflight.ts',
      'scripts/run-v12-write-guard-preflight-slice.ps1',
    ]) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }

    const daemonExports = readFileSync(
      resolve(repositoryRoot, 'packages/daemon-core/src/index.ts'),
      'utf8',
    );
    expect(daemonExports).not.toContain('sfWriteGuardPreflight');
    expect(daemonExports).not.toContain('checkCloseGateWriteGuard');

    for (const relativePath of [
      'scripts/lib/registry.ts',
      'setup/userlevel-scripts-lib/registry.ts',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toContain('tools/sf_write_guard_preflight.ts');
    }
  });

  it('physically excludes closed Spec Migration Git recovery compatibility', () => {
    for (const relativePath of [
      'packages/daemon-core/src/tools/handlers/sf-git-branch-create.ts',
      'packages/daemon-core/src/tools/lib/project-governance-v2.ts',
      'setup/userlevel-opencode/tools/sf_git_branch_create.ts',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /closed_spec_migration|SPEC_MIGRATION_GIT_RECOVERY|git_delivery_recovery\.json|verifyLegacyClosedSpecMigrationGitDeliveryRecovery|isClosedSpecMigrationGitRecoveryRequired/,
      );
    }
  });
});

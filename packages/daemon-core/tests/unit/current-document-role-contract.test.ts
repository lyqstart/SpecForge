import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  CURRENT_FEATURE_SPEC_PATHS,
  FINAL_STATES,
} from '../../src/tools/lib/state_machine';

const root = resolve(import.meta.dirname, '../../../..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('current document roles and authority consumers', () => {
  it('binds the SPS release version to the root package identity', () => {
    const product = JSON.parse(read('package.json')) as { version: string };
    const specification = read(
      'docs/product-specification/specforge-product-specification.md',
    );

    expect(specification).toContain(`> Product release version: ${product.version}`);
    expect(specification).toContain('> Status: ACTIVE / AUTHORITATIVE');
  });

  it('registers derived and historical document roles without creating parallel authority', () => {
    const registry = read('docs/product-specification/authority-registry.md');

    for (const token of [
      'docs/conventions/**',
      'NO（DERIVED REFERENCE）',
      'docs/user/**, docs/cli/**',
      'NO（DERIVED OPERATING DOCUMENTATION）',
      'docs/archive/**',
      'HISTORICAL EVIDENCE',
    ]) {
      expect(registry, token).toContain(token);
    }
    expect(registry).toContain(
      '测试若读取归档文件，只能验证历史证据未丢失，不能据此约束当前产品行为',
    );
  });

  it('keeps current operating documents explicitly derived from current contracts', () => {
    for (const relativePath of [
      'docs/conventions/README.md',
      'docs/conventions/agent-roles.md',
      'docs/user/install.md',
      'docs/cli/command-reference.md',
    ]) {
      expect(read(relativePath), relativePath).toMatch(/Role: DERIVED (?:REFERENCE|OPERATING DOCUMENTATION)/);
    }
  });

  it('keeps workflow and lifecycle summaries aligned with the executable contract', () => {
    const workflowTypes = read('docs/conventions/workflow-types.md');
    const lifecycle = read('docs/conventions/wi-lifecycle.md');
    const workflowRuntimeStates = read(
      'packages/workflow-runtime/src/types/state-machine.ts',
    );

    expect(workflowTypes).toContain('workflow_type=feature_spec');
    for (const workflowPath of CURRENT_FEATURE_SPEC_PATHS) {
      expect(workflowTypes, workflowPath).toContain(`\`${workflowPath}\``);
    }
    for (const state of FINAL_STATES) {
      expect(lifecycle, state).toContain(state);
    }
    expect(lifecycle).not.toContain('decision_recorded');
    expect(lifecycle).toContain('`not_applicable` 是报告字段值，不是 workflow state');
    expect(workflowRuntimeStates).not.toMatch(
      /^\s*['"](?:decision_recorded|merge_not_applicable)['"],?\s*$/m,
    );
  });

  it('moves dynamic history and retired incident rules out of active authority surfaces', () => {
    expect(
      existsSync(resolve(root, 'docs/rule/specforge_script_failure_review_and_batch_rules.md')),
    ).toBe(false);
    expect(
      read('docs/archive/rule/specforge_script_failure_review_and_batch_rules.md'),
    ).toContain('HISTORICAL_EVIDENCE_ONLY');
    expect(
      read('docs/archive/product-specification/sps-1.0-conformance-gap-history-20261011.md'),
    ).toContain('HISTORICAL_EVIDENCE_ONLY');
    expect(read('docs/product-specification/specforge-product-specification.md')).toContain(
      '# 20. Conformance Gap 管理规则',
    );
  });

  it('does not expose self-healing through the current CLI surface', () => {
    const utility = read('packages/cli/src/commands/utility.ts');
    const help = read('packages/cli/src/help/HelpSystem.ts');
    const packageReadme = read('packages/cli/README.md');

    for (const source of [utility, help, packageReadme]) {
      expect(source).not.toContain('commandHeal');
      expect(source).not.toContain("'/api/heal'");
      expect(source).not.toContain('heal <workItemId>');
      expect(source).not.toContain('specforge heal');
    }
  });

  it('does not expose built-not-enabled capabilities as current event categories', () => {
    const observabilityTypes = read('packages/observability/src/types/index.ts');
    const observabilityValidation = read(
      'packages/observability/src/types/event-utils.ts',
    );
    const daemonTypes = read('packages/daemon-core/src/types.ts');
    const api = read('packages/observability/docs/api.md');

    for (const source of [
      observabilityTypes,
      observabilityValidation,
      daemonTypes,
      api,
    ]) {
      expect(source).not.toMatch(/['"](?:heal|modality)['"]/);
      expect(source).toContain("'migration'");
    }
  });

  it('keeps removed metadata and user-root contracts out of current shared types', () => {
    expect(existsSync(resolve(root, 'packages/types/src/meta-schema.ts'))).toBe(false);
    expect(read('packages/types/src/index.ts')).not.toContain('meta-schema');
    expect(read('packages/types/src/directory-layout.ts')).not.toContain(
      'SPEC_USER_DIR_NAME',
    );
    expect(read('packages/types/src/user-level-paths.ts')).toContain('"sf-user"');
  });

  it('keeps current installed Agent instructions free of built-not-enabled routes', () => {
    const currentAgents = [
      'sf-orchestrator',
      'sf-requirements',
      'sf-design',
      'sf-task-planner',
      'sf-executor',
      'sf-debugger',
      'sf-reviewer',
      'sf-verifier',
      'sf-knowledge',
      'sf-analyst',
    ];

    for (const agent of currentAgents) {
      const source = read(`setup/userlevel-opencode/agents/${agent}.md`);
      expect(source, agent).not.toMatch(
        /sf-(?:investigator|evidence-collector|extension)|\bops_task\b|root_cause_investigation/,
      );
      expect(source, agent).not.toContain('v1.1 governance transitions');
    }
  });

  it('classifies Investigation-only root tests as historical evidence', () => {
    const registry = JSON.parse(read('tests/root-test-role-registry.json')) as {
      roles: {
        CURRENT_HERMETIC: { paths: string[] };
        HISTORICAL_EVIDENCE: { paths: string[] };
      };
    };
    const current = registry.roles.CURRENT_HERMETIC.paths;
    const historical = registry.roles.HISTORICAL_EVIDENCE.paths;

    expect(current.some((path) => path.includes('investigation-gate-'))).toBe(false);
    expect(historical).toContain(
      'tests/property/investigation-gate-orchestration-success-preservation.property.test.ts',
    );
  });
});

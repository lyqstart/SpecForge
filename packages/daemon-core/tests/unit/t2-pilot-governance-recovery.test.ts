import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { getHandler, type ToolDeps } from '../../src/tools/ToolDispatcher';
import '../../src/tools/index';
import { validateChangeClassification } from '../../src/tools/lib/change-classification';
import { requiredGreenfieldClassificationFields } from '../../src/tools/handlers/sf-v11-work-item-create';
import {
  isExplicitUserApprovalQuote,
  validateUserApprovalBoundary,
} from '../../src/tools/handlers/sf-v11-decision';
import {
  readUnresolvedHandoffValidationFailures,
  recordHandoffValidationState,
} from '../../src/tools/lib/agent-handoff-v11';

let projectRoot: string;
let currentState: string;

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

function deps(): ToolDeps {
  return {
    stateManager: {},
    workflowEngine: {},
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => ({ replayed: false }),
        getState: async () => ({ current_state: currentState }),
      }),
    },
    eventLogger: {},
    eventBus: {},
    permissionEngine: {},
    cas: {},
    sessionRegistry: {},
  };
}

async function seedWorkItem(workItemId = 'WI-0001'): Promise<void> {
  await writeJson(
    path.join(projectRoot, '.specforge', 'work-items', workItemId, 'work_item.json'),
    {
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    },
  );
}

describe('t2 pilot governance recovery contracts', () => {
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-t2-recovery-'));
    currentState = 'intake_ready';
    await seedWorkItem();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('requires all eleven classification booleans', () => {
    const classification: Record<string, unknown> = {
      requirement_changed: true,
      acceptance_criteria_changed: true,
      business_rule_changed: false,
      user_visible_behavior_changed: true,
      data_semantics_changed: false,
      design_changed: true,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: true,
      unknowns: [],
    };
    expect(validateChangeClassification(classification)).toEqual([
      'data_model_changed must be boolean',
      'module_contract_changed must be boolean',
    ]);
    classification.data_model_changed = true;
    classification.module_contract_changed = true;
    expect(validateChangeClassification(classification)).toEqual([]);
  });

  it('rejects task instructions and standing authorization as Candidate approval', () => {
    expect(isExplicitUserApprovalQuote('批准')).toBe(true);
    expect(isExplicitUserApprovalQuote('我同意当前候选')).toBe(true);
    expect(isExplicitUserApprovalQuote('重新封存 Candidate、运行 Gate，并重新取得 code permission。')).toBe(false);
    expect(isExplicitUserApprovalQuote('不批准')).toBe(false);

    expect(
      validateUserApprovalBoundary(
        {
          user_response_quote: '重新封存 Candidate、运行 Gate，并重新取得 code permission。',
          comments: 'standing instruction authorizes this repair loop',
        },
        { decisionStatus: 'approved', decisionType: 'user_approved' },
      ),
    ).toMatchObject({
      ok: false,
      error: 'USER_APPROVAL_QUOTE_NOT_EXPLICIT',
      code: 'USER_APPROVAL_TRUST_BOUNDARY',
    });
  });

  it('classifies first formal project truth sources as changes', async () => {
    const projectDir = path.join(projectRoot, '.specforge', 'project');
    await writeJson(path.join(projectDir, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      default_module: 'CORE',
      modules: [{ module_code: 'CORE' }],
    });
    await fs.mkdir(path.join(projectDir, 'modules', 'CORE'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'architecture.md'), '> TODO: fill\n', 'utf-8');
    await fs.writeFile(path.join(projectDir, 'modules', 'CORE', 'design.md'), '> TODO: fill\n', 'utf-8');
    expect(await requiredGreenfieldClassificationFields(projectRoot)).toEqual([
      'architecture_changed',
      'design_changed',
    ]);
  });

  it('writes project configuration only through the intake owner and legal state', async () => {
    const handler = getHandler('sf_artifact_write')!;
    const allowed = await handler(
      {
        work_item_id: 'WI-0001',
        file_type: 'project_prod_environment',
        content: '# Production\n\nruntime: browser\n',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(allowed.success).toBe(true);
    expect(allowed.controlled_project_config).toBe(true);
    expect(
      await fs.readFile(
        path.join(projectRoot, '.specforge', 'config', 'prod-environment.md'),
        'utf-8',
      ),
    ).toContain('runtime: browser');

    const wrongOwner = await handler(
      {
        work_item_id: 'WI-0001',
        file_type: 'project_rules',
        content: '# Rules\n',
      },
      { directory: projectRoot, agent: 'sf-design' },
      deps(),
    );
    expect(wrongOwner.error).toBe('PROJECT_CONFIG_OWNER_MISMATCH');

    currentState = 'candidate_preparing';
    const wrongState = await handler(
      {
        work_item_id: 'WI-0001',
        file_type: 'project_rules',
        content: '# Rules\n',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(wrongState.error).toBe('PROJECT_CONFIG_WRITE_STATE_INVALID');
  });

  it('persists an owner-bound handoff and validates the collection', async () => {
    const handler = getHandler('sf_handoff')!;
    const handoff = {
      schema_version: '1.0',
      agent: 'sf-design',
      work_item_id: 'WI-0001',
      stage: 'candidate-design',
      timestamp: '2026-10-07T10:00:00.000Z',
      inputs_read: ['requirements candidate'],
      outputs_written: ['design candidate'],
      findings: ['architecture constraint traced'],
      unknowns: [],
      escalation_signals: [],
      next_step_recommendation: 'dispatch sf-task-planner',
      boundary_statement: 'did not approve, merge, or implement',
    };
    const mismatch = await handler(
      { action: 'write', work_item_id: 'WI-0001', handoff },
      { directory: projectRoot, agent: 'sf-requirements' },
      deps(),
    );
    expect(mismatch.error).toBe('HANDOFF_AGENT_OWNER_MISMATCH');

    const written = await handler(
      { action: 'write', work_item_id: 'WI-0001', handoff },
      { directory: projectRoot, agent: 'sf-design' },
      deps(),
    );
    expect(written.success).toBe(true);
    expect(written.path).toContain('handoff_sf-design_candidate-design_');

    const validated = await handler(
      { action: 'validate_all', work_item_id: 'WI-0001' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(validated).toMatchObject({ success: true, total: 1, valid: 1, invalid: 0 });

    const freshlyRecorded = await handler(
      {
        action: 'validate_all',
        work_item_id: 'WI-0001',
        expected_agent: 'sf-design',
        expected_stage: 'candidate-design',
        created_after: new Date(Date.now() - 5_000).toISOString(),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(freshlyRecorded).toMatchObject({ success: true, matching: 1 });

    const stale = await handler(
      {
        action: 'validate_all',
        work_item_id: 'WI-0001',
        expected_agent: 'sf-design',
        expected_stage: 'candidate-design',
        created_after: '2026-10-08T00:00:00.000Z',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(stale).toMatchObject({
      success: false,
      matching: 0,
      error: 'HANDOFF_EXPECTATION_NOT_MET',
    });
    expect(
      await readUnresolvedHandoffValidationFailures(
        path.join(projectRoot, '.specforge', 'work-items', 'WI-0001'),
      ),
    ).toHaveLength(1);

    const futureRecordedAt = new Date('2026-10-09T00:00:00.000Z');
    await fs.utimes(written.path, futureRecordedAt, futureRecordedAt);
    const correctedRetry = await handler(
      {
        action: 'validate_all',
        work_item_id: 'WI-0001',
        expected_agent: 'sf-design',
        expected_stage: 'candidate-design',
        created_after: '2026-10-08T00:00:00.000Z',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(correctedRetry).toMatchObject({
      success: true,
      matching: 1,
    });
    expect(
      await readUnresolvedHandoffValidationFailures(
        path.join(projectRoot, '.specforge', 'work-items', 'WI-0001'),
      ),
    ).toHaveLength(0);
  });

  it('records protected-path shell denials in both governance and shell audit logs', async () => {
    const handler = getHandler('sf_safe_bash')!;
    const result = await handler(
      {
        work_item_id: 'WI-0001',
        command: 'Set-Content .specforge/config/project-rules.md forbidden',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('SPEC_FORGE_PROTECTED_PATH_WRITE_REQUIRES_CONTROLLED_TOOL');
    expect(result.error).toContain('project_rules');

    const shellHistory = await fs.readFile(
      path.join(projectRoot, '.specforge', 'runtime', 'logs', 'shell-history.jsonl'),
      'utf-8',
    );
    expect(JSON.parse(shellHistory.trim())).toMatchObject({
      rejected: true,
      success: false,
      rule: 'SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN',
    });
    const guardLog = await fs.readFile(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0001', 'write_guard_log.jsonl'),
      'utf-8',
    );
    expect(JSON.parse(guardLog.trim())).toMatchObject({ allowed: false, tool: 'sf_safe_bash' });
  });

  it('blocks Candidate sealing while a handoff validation failure is unresolved', async () => {
    currentState = 'candidate_preparing';
    const wiDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');
    await recordHandoffValidationState(
      wiDir,
      {
        expectedAgent: 'sf-design',
        expectedStage: 'candidate-design',
        createdAfter: '2026-10-07T00:00:00.000Z',
      },
      {
        success: false,
        total: 1,
        valid: 1,
        invalid: 0,
        matching: 0,
        error: 'HANDOFF_EXPECTATION_NOT_MET',
      },
    );

    const result = await getHandler('sf_state_transition')!(
      {
        work_item_id: 'WI-0001',
        from_state: 'candidate_preparing',
        to_state: 'candidate_prepared',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps(),
    );

    expect(result).toMatchObject({
      success: false,
      error: 'HANDOFF_VALIDATION_UNRESOLVED',
      state_advanced: false,
      retry_allowed: true,
    });
  });
});

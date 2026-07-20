import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/tools/handlers/sf-hard-stop-resolve.js';
import { getHandler } from '../src/tools/ToolDispatcher.js';
import { checkHardStop, guardHardStop, setHardStop } from '../src/tools/lib/hard-stop-latch.js';
import { classifyProtectedSpecForgePathBashAccess } from '../src/tools/handlers/sf-safe-bash.js';

describe('Recoverable HardStop protocol', () => {
  let projectRoot: string;
  const workItemId = 'WI-0001';

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-hard-stop-recovery-'));
    await mkdir(path.join(projectRoot, '.specforge', 'runtime'), { recursive: true });
    await mkdir(path.join(projectRoot, '.specforge', 'work-items', workItemId), {
      recursive: true,
    });
    await writeFile(
      path.join(projectRoot, '.specforge', 'runtime', 'state.json'),
      JSON.stringify(
        {
          workItems: [
            {
              work_item_id: workItemId,
              current_state: 'candidate_preparing',
            },
          ],
        },
        null,
        2
      )
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('recognizes a nested PowerShell Get-Content probe as read-only', () => {
    const command =
      "powershell -Command \"[byte[]](Get-Content -Path 'D:\\project\\.specforge\\work-items\\WI-0001\\investigation_plan.md' -Encoding Byte -TotalCount 10) -join ','\"";
    expect(classifyProtectedSpecForgePathBashAccess(command)).toBe('read');

    const writeCommand =
      'powershell -Command "Get-Content .specforge/work-items/WI-0001/a.md; Set-Content .specforge/work-items/WI-0001/a.md bad"';
    expect(classifyProtectedSpecForgePathBashAccess(writeCommand)).toBe('write');
  });

  it('persists recovery metadata and blocks dependent governance actions only for the affected WI', () => {
    const record = setHardStop(
      projectRoot,
      workItemId,
      'SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN',
      'sf_safe_bash',
      'work_item',
      {
        triggering_agent: 'sf-investigator',
        blocked_action: 'powershell Set-Content .specforge/work-items/WI-0001/a.md',
        blocked_target: '.specforge/work-items/WI-0001/a.md',
        last_successful_step: 'investigation_plan_written',
        blocked_step: 'read_plan_bytes',
        resume_step: 'read plan with controlled read tool',
        retry_original_action: false,
        safe_alternative_tool: 'read',
      }
    );

    expect(record.recovery_status).toBe('pending');
    expect(record.triggering_agent).toBe('sf-investigator');
    expect(guardHardStop(projectRoot, workItemId, 'sf_artifact_write').allowed).toBe(false);
    expect(guardHardStop(projectRoot, workItemId, 'sf_state_read').allowed).toBe(true);
    expect(guardHardStop(projectRoot, 'WI-0002', 'sf_artifact_write').allowed).toBe(true);
  });

  it('resolves operator_error without user approval and returns a resumable checkpoint', async () => {
    const record = setHardStop(
      projectRoot,
      workItemId,
      'SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN',
      'sf_safe_bash',
      'work_item',
      {
        triggering_agent: 'sf-investigator',
        blocked_action: 'unknown shell probe of .specforge/work-items',
        blocked_target: '.specforge/work-items/WI-0001',
        last_successful_step: 'plan_gate_passed',
        blocked_step: 'collect runtime evidence',
        resume_step: 'collect runtime evidence with read/glob',
        retry_original_action: false,
        safe_alternative_tool: 'read/glob',
      }
    );

    const handler = getHandler('sf_hard_stop_resolve');
    expect(handler).toBeDefined();
    const result = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: record.hard_stop_id,
        resolution_type: 'operator_error',
        reason: 'The Agent chose an unknown shell probe for a protected governance path.',
        evidence: [
          'hard_stop.json records sf_safe_bash and the blocked protected path',
          'read/glob can obtain the same evidence without permission expansion',
        ],
        blocked_action_disposition: 'abandon',
        allowed_next_action: 'read the original artifact with controlled read tools',
        last_successful_step: 'plan_gate_passed',
        resume_from_step: 'collect runtime evidence with read/glob',
        retry_original_action: false,
        safe_alternative_tool: 'read/glob',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;

    expect(result.success).toBe(true);
    expect(result.user_decision_required).toBe(false);
    expect(result.authorization_installed).toBe(false);
    expect(result.resume_context.authoritative_state).toBe('candidate_preparing');
    expect(result.resume_context.resume_from_step).toBe('collect runtime evidence with read/glob');
    expect(result.resume_context.must_not_repeat_completed_steps).toBe(true);
    expect(checkHardStop(projectRoot, workItemId).blocked).toBe(false);

    const resolution = JSON.parse(
      readFileSync(
        path.join(
          projectRoot,
          '.specforge',
          'work-items',
          workItemId,
          'hard_stop_resolution.jsonl'
        ),
        'utf8'
      ).trim()
    );
    expect(resolution.resolution_type).toBe('operator_error');
    expect(resolution.decision_source).toBe('sf-orchestrator_system_safe_recovery');
    expect(resolution.retry_original_action).toBe(false);
    expect(resolution.original_hard_stop.blocked_step).toBe('collect runtime evidence');
  });

  it('rejects unsafe or incomplete operator-error recovery plans', async () => {
    const handler = getHandler('sf_hard_stop_resolve');
    expect(handler).toBeDefined();

    const first = setHardStop(projectRoot, workItemId, 'blocked', 'sf_safe_bash');
    const missingPlan = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: first.hard_stop_id,
        resolution_type: 'operator_error',
        reason: 'wrong tool',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(missingPlan.success).toBe(false);
    expect(missingPlan.error).toBe('HARD_STOP_RECOVERY_PLAN_REQUIRED');

    const retryOriginal = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: first.hard_stop_id,
        resolution_type: 'operator_error',
        reason: 'The wrong tool was used and the original action must not be retried.',
        evidence: ['hard_stop.json'],
        blocked_action_disposition: 'abandon',
        allowed_next_action: 'use read',
        resume_from_step: 'read evidence',
        retry_original_action: true,
        safe_alternative_tool: 'read',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(retryOriginal.success).toBe(false);
    expect(retryOriginal.error).toBe('OPERATOR_ERROR_CANNOT_RETRY_ORIGINAL_ACTION');

    const missingAlternative = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: first.hard_stop_id,
        resolution_type: 'operator_error',
        reason: 'The wrong tool was used and must be replaced by a controlled read path.',
        evidence: ['hard_stop.json'],
        blocked_action_disposition: 'abandon',
        allowed_next_action: 'use a controlled read path',
        resume_from_step: 'read evidence',
        retry_original_action: false,
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(missingAlternative.success).toBe(false);
    expect(missingAlternative.error).toBe('SAFE_ALTERNATIVE_TOOL_REQUIRED');

    const expansion = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: first.hard_stop_id,
        resolution_type: 'operator_error',
        reason: 'The wrong tool was used and must be abandoned.',
        evidence: ['hard_stop.json'],
        blocked_action_disposition: 'abandon',
        allowed_next_action: 'use read',
        resume_from_step: 'read evidence',
        retry_original_action: false,
        install_authorization: true,
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(expansion.success).toBe(false);
    expect(expansion.error).toBe('USER_RESPONSE_QUOTE_REQUIRED');
  });

  it('still requires a real user quote for permission expansion or risk acceptance', async () => {
    const record = setHardStop(
      projectRoot,
      workItemId,
      'external operation not authorized',
      'sf_safe_bash'
    );
    const handler = getHandler('sf_hard_stop_resolve');
    const result = (await handler!(
      {
        work_item_id: workItemId,
        hard_stop_id: record.hard_stop_id,
        resolution_type: 'scope_expanded',
        reason: 'Need access outside the current authorized scope.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    )) as any;
    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_RESPONSE_QUOTE_REQUIRED');
  });
});

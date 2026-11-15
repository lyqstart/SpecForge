import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runRequiredGates } from '../../src/tools/lib/gate-runner-v11';
import { getRequiredGates } from '../../src/tools/lib/required-gates';
import { readGateRepairStatus, GATE_REPAIR_ACTION } from '../../src/tools/lib/gate-repair-stop';
import { guardHardStop, readWorkItemHardStop } from '../../src/tools/lib/hard-stop-latch';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-hard-stop-resolve';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'sf-repair-stop-'));
  roots.push(projectRoot);
  const workItemId = 'WI-0001',
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(workItemDir, { recursive: true });
  await fs.writeFile(
    path.join(workItemDir, 'work_item.json'),
    JSON.stringify({ work_item_id: 'BROKEN' })
  );
  return {
    projectRoot,
    workItemId,
    workItemDir,
    workflowPath: 'requirement_change_path',
    workflowType: 'feature_spec',
    candidatePhase: 'full' as const,
  };
}
async function stopped() {
  const ctx = await fixture();
  expect((await runRequiredGates(['entry_gate'], ctx)).summaryStatus).toBe('failed');
  expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').allowed).toBe(true);
  expect((await runRequiredGates(['entry_gate'], ctx)).summaryStatus).toBe('failed');
  expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').allowed).toBe(false);
  return ctx;
}
function request(ctx: Awaited<ReturnType<typeof fixture>>) {
  const status = readGateRepairStatus(ctx.projectRoot, ctx.workItemId);
  const latch = readWorkItemHardStop(ctx.projectRoot, ctx.workItemId)!;
  const quote = `Authorize one diagnosed repair.\ngate_owner_repair_once ${ctx.workItemId} ${status.attemptId} ${status.historySha256}`;
  const args = {
    work_item_id: ctx.workItemId,
    hard_stop_id: latch.hard_stop_id,
    resolution_type: 'user_authorized_retry',
    user_response_quote: quote,
    diagnostic_user_message_id: 'msg_user',
    allowed_next_action: GATE_REPAIR_ACTION,
    resume_from_step: GATE_REPAIR_ACTION,
    blocked_action_disposition: 'retry_after_authorization',
    retry_original_action: true,
    reason: 'Diagnosed the frozen failure without changing scope.',
  };
  const context = {
    directory: ctx.projectRoot,
    agent: 'sf-orchestrator',
    sessionID: 'ses_actual',
    messageID: 'msg_actual',
  };
  const proof = {
    source: 'gate-repair-diagnostic/v1',
    attemptId: status.attemptId,
    historySha256: status.historySha256,
    userMessageId: 'msg_user',
    userTextSha256: createHash('sha256').update(quote).digest('hex'),
    userCreatedAt: Date.now(),
    invocation: {
      source: 'runtime-tool-invocation/v1',
      sessionId: context.sessionID,
      messageId: context.messageID,
      callId: 'call_actual',
      agent: context.agent,
      directory: ctx.projectRoot,
      tool: 'sf_hard_stop_resolve',
      inputSha256: 'a'.repeat(64),
      runtimeProjectionSha256: 'b'.repeat(64),
      startedAt: Date.now(),
      observedAt: new Date().toISOString(),
    },
  };
  return { args, context, proof };
}
describe('durable Gate repair stop from actual immutable producer', () => {
  it('allows one repair then blocks aliases, writes, state, seal and retry after process-local state is discarded', async () => {
    const ctx = await stopped();
    for (const tool of [
      'sf_artifact_write',
      'sf_state_transition',
      'sf_v11_gate_run',
      'sf-v11-gate-run',
      'sf_user_decision_record',
      'sf_merge',
    ])
      expect(guardHardStop(ctx.projectRoot, ctx.workItemId, tool).allowed).toBe(false);
    expect(guardHardStop(ctx.projectRoot, 'WI-0002', 'sf_artifact_write').allowed).toBe(true);
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_state_read').allowed).toBe(true);
    await expect(runRequiredGates(['entry_gate'], ctx)).rejects.toThrow('HARD_STOP_ACTIVE');
    expect(await fs.readdir(path.join(ctx.workItemDir, 'gate_attempts'))).toHaveLength(2);
    await fs.unlink(path.join(ctx.workItemDir, 'hard_stop.json')); // synthetic crash/lost projection
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').allowed).toBe(false);
  });
  it('a partial pass between failures does not replenish repair budget', async () => {
    const ctx = await fixture();
    await runRequiredGates(['entry_gate'], ctx);
    await fs.writeFile(
      path.join(ctx.workItemDir, 'work_item.json'),
      JSON.stringify({ work_item_id: ctx.workItemId })
    );
    expect((await runRequiredGates(['entry_gate'], ctx)).summaryStatus).toBe('passed');
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(1);
    await fs.writeFile(
      path.join(ctx.workItemDir, 'work_item.json'),
      JSON.stringify({ work_item_id: 'BROKEN' })
    );
    await runRequiredGates(['entry_gate'], ctx);
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).blocked).toBe(true);
  });
  it.each(['repaired', 'false_positive', 'operator_error', 'policy_corrected'])(
    'cannot clear with ordinary %s claims',
    async resolution_type => {
      const ctx = await stopped(),
        input = request(ctx);
      const response = await getHandler('sf_hard_stop_resolve')!(
        { ...input.args, resolution_type },
        input.context,
        {} as any
      );
      expect(response.success).toBe(false);
      expect(readWorkItemHardStop(ctx.projectRoot, ctx.workItemId)).not.toBeNull();
      await expect(
        fs.stat(path.join(ctx.workItemDir, 'hard_stop_resolution.jsonl'))
      ).rejects.toThrow();
    }
  );
  it('rejects invented user quotes without configured Runtime proof', async () => {
    const ctx = await stopped(),
      input = request(ctx);
    const response = await getHandler('sf_hard_stop_resolve')!(
      input.args,
      input.context,
      {} as any
    );
    expect(response.error).toBe('GATE_REPAIR_RUNTIME_PROVENANCE_REQUIRED');
  });
  it('authorizes exactly one round, preserves both failures, and stops on its next failure', async () => {
    const ctx = await stopped(),
      input = request(ctx);
    const response = await getHandler('sf_hard_stop_resolve')!(input.args, input.context, {
      toolInvocationVerifier: { verifyGateRepairAuthorization: async () => input.proof },
    } as any);
    expect(response.success).toBe(true);
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(1);
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').allowed).toBe(true);
    await runRequiredGates(['entry_gate'], ctx);
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').allowed).toBe(false);
    expect(await fs.readdir(path.join(ctx.workItemDir, 'gate_attempts'))).toHaveLength(3);
  });
  it('rejects concurrent replay after one request commits the grant', async () => {
    const ctx = await stopped(),
      input = request(ctx);
    const handler = getHandler('sf_hard_stop_resolve')!;
    const deps = {
      toolInvocationVerifier: { verifyGateRepairAuthorization: async () => input.proof },
    } as any;
    const results = await Promise.all([
      handler(input.args, input.context, deps),
      handler(input.args, input.context, deps),
    ]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(
      (await fs.readFile(path.join(ctx.workItemDir, 'hard_stop_resolution.jsonl'), 'utf8'))
        .trim()
        .split('\n')
    ).toHaveLength(1);
  });
  it('reconciles a committed grant whose latch unlink was interrupted without issuing a second grant', async () => {
    const ctx = await stopped(),
      input = request(ctx);
    const latchPath = path.join(ctx.workItemDir, 'hard_stop.json'),
      latch = await fs.readFile(latchPath);
    const handler = getHandler('sf_hard_stop_resolve')!;
    expect(
      (
        await handler(input.args, input.context, {
          toolInvocationVerifier: { verifyGateRepairAuthorization: async () => input.proof },
        } as any)
      ).success
    ).toBe(true);
    await fs.writeFile(latchPath, latch); // synthetic crash window after append, before unlink
    expect((await handler(input.args, input.context, {} as any)).existing_grant_reconciled).toBe(
      true
    );
    expect(
      (await fs.readFile(path.join(ctx.workItemDir, 'hard_stop_resolution.jsonl'), 'utf8'))
        .trim()
        .split('\n')
    ).toHaveLength(1);
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(1);
  });
  it('rejects history drift while obtaining Runtime proof', async () => {
    const ctx = await stopped(),
      input = request(ctx);
    const response = await getHandler('sf_hard_stop_resolve')!(input.args, input.context, {
      toolInvocationVerifier: {
        verifyGateRepairAuthorization: async () => {
          await fs.appendFile(
            path.join(ctx.workItemDir, 'gate_attempts', 'attempt-0001', 'gate_summary.md'),
            '\n'
          );
          return input.proof;
        },
      },
    } as any);
    expect(response.error).toBe('GATE_REPAIR_AUTHORIZATION_DRIFT');
    expect(readWorkItemHardStop(ctx.projectRoot, ctx.workItemId)).not.toBeNull();
  });
  it('only a complete all-passed context resets a failure cycle; skipped and legacy passes do not', async () => {
    const ctx = await fixture();
    await runRequiredGates(['entry_gate'], ctx);
    const full = getRequiredGates(ctx.workflowPath, 'candidate', 'full', ctx.workflowType);
    await runRequiredGates(full, ctx);
    const dir = path.join(ctx.workItemDir, 'gate_attempts', 'attempt-0002');
    // Explicit synthetic all-pass evidence fixture, never a business acceptance claim.
    const resultPath = path.join(dir, 'attempt-result.json'),
      result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
    result.summary_status = 'passed';
    await fs.writeFile(resultPath, JSON.stringify(result));
    for (const gate of full) {
      const file = path.join(dir, 'gates', gate + '.json'),
        report = JSON.parse(await fs.readFile(file, 'utf8'));
      report.status = 'passed';
      report.checks = [];
      report.blocking_issues = [];
      report.waiver_required = false;
      await fs.writeFile(file, JSON.stringify(report));
    }
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(0);
    const entryPath = path.join(dir, 'gates', 'entry_gate.json'),
      entry = JSON.parse(await fs.readFile(entryPath, 'utf8'));
    entry.status = 'skipped';
    await fs.writeFile(entryPath, JSON.stringify(entry));
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(1);
    entry.status = 'passed';
    await fs.writeFile(entryPath, JSON.stringify(entry));
    await fs.unlink(path.join(dir, 'candidate-repair-context.json'));
    expect(readGateRepairStatus(ctx.projectRoot, ctx.workItemId).failures).toBe(1);
  });
  it('rejects incomplete and contradictory history before any business mutation', async () => {
    const ctx = await fixture();
    await runRequiredGates(['entry_gate'], ctx);
    const file = path.join(ctx.workItemDir, 'gate_attempts', 'attempt-0001', 'attempt-result.json');
    const original = await fs.readFile(file, 'utf8');
    await fs.writeFile(
      file,
      original.replace('"summary_status": "failed"', '"summary_status": "passed"')
    );
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_artifact_write').error).toContain(
      'summary disagrees'
    );
    await fs.unlink(file);
    expect(guardHardStop(ctx.projectRoot, ctx.workItemId, 'sf_state_transition').allowed).toBe(
      false
    );
  });
});

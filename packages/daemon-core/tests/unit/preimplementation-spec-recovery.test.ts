/** Real files, StateManager and WAL; upstream merge and host identities are synthetic unit fixtures. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { ensureProjectInit } from '../../src/tools/lib/sf_project_init_core';
import { computeCandidateHash } from '../../src/tools/lib/governance-invariants-v11';
import { materializeImplementationBaseline } from '../../src/tools/lib/implementation-baseline';
import {
  handlePreimplementationSpecRecovery,
  assertPreservedRecoveryTask,
} from '../../src/tools/lib/preimplementation-spec-recovery';
import {
  canonicalVerificationJson as json,
  verificationId as hash,
} from '../../src/verification/owner-store';
import { validateCandidateProjectSpecBinding } from '../../src/tools/lib/candidate-generation-integrity';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';
import { withGateOperationBarrier } from '../../src/tools/lib/gate-operation-barrier';

const roots: string[] = [];
const id = 'WI-9501';
async function write(file: string, value: string | object) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'
  );
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-preimplementation-'));
  roots.push(root);
  await ensureProjectInit(root, 'Synthetic preimplementation recovery fixture');
  const wi = path.join(root, '.specforge/work-items', id);
  const project = path.join(root, '.specforge/project');
  const manifestFile = path.join(project, 'spec_manifest.json');
  const projectManifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  projectManifest.project_spec_version = 'PSV-0002';
  projectManifest.last_merged_work_item = id;
  await write(manifestFile, projectManifest);
  await write(path.join(project, 'architecture.md'), '# Architecture\nARCH-ROOT-001\n');
  await write(path.join(project, 'data_model.md'), '# Data\nDATA-ROOT-001\n');
  await write(path.join(project, 'modules/CORE/module.json'), {
    schema_version: '1.0',
    module_code: 'CORE',
    status: 'active',
    code_paths: ['docs/readiness.md'],
  });
  await write(
    path.join(project, 'modules/CORE/design.md'),
    '# Global context\nReferences DD-AA-001 but owns no decision.\n'
  );
  await write(path.join(wi, 'work_item.json'), {
    schema_version: '1.1',
    work_item_id: id,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    code_change_allowed: false,
    allowed_write_files: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await write(path.join(wi, 'trigger_result.json'), {
    schema_version: '1.1',
    work_item_id: id,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    classification: { design_changed: true },
    impact_scope: {
      affected_modules: ['CORE'],
      planned_code_paths: ['docs/readiness.md'],
      design_refs: [],
    },
  });
  await materializeImplementationBaseline(root, id);
  const task = `### TASK-${id}-001 Readiness\n- **refs**: [REQ-AA-001, DD-AA-001]\n- **allowed_write_files**: [docs/readiness.md]\n- **verification_commands**:\n  - unit:\n    - \`node -e "console.log('ok')"\`\n`;
  await write(path.join(wi, 'candidates/tasks.md'), task);
  await write(
    path.join(wi, 'candidates/project/modules/CORE/design.candidate.md'),
    '# Context\nReferences DD-AA-001.\n'
  );
  const candidate = {
    schema_version: '1.0',
    work_item_id: id,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    project_spec_precondition_sha256: 'sha256:' + 'b'.repeat(64),
    merge_required: true,
    entries: [
      {
        candidate_path: 'candidates/project/modules/CORE/design.candidate.md',
        target_path: '.specforge/project/modules/CORE/design.md',
        operation: 'replace',
        type: 'design',
        module_id: 'CORE',
      },
    ],
  };
  await write(path.join(wi, 'candidate_manifest.json'), candidate);
  await write(path.join(wi, 'user_decision.json'), {
    schema_version: '1.0',
    decision_id: 'UD-' + id + '-synthetic',
    work_item_id: id,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    candidate_manifest_path: 'candidate_manifest.json',
    manifest_hash:
      'sha256:' + hash(await fs.readFile(path.join(wi, 'candidate_manifest.json'), 'utf8')),
    candidate_hash: await computeCandidateHash(wi),
    gate_summary_path: 'gate_summary.md',
    gate_summary_hash: 'sha256:' + 'a'.repeat(64),
    decision_status: 'approved',
    decision_type: 'user_approved',
    decided_by: 'synthetic-human-fixture',
    decided_at: new Date().toISOString(),
    decision_scope: 'unit fixture only',
    waivers: [],
    user_response_quote: 'synthetic upstream approval',
  });
  await write(
    path.join(wi, 'merge_report.md'),
    `# Merge Report\nContract: merge-report/v1\nWork Item: ${id}\nStatus: success\n\n- Total entries: 1\n- Successful: 1\n- Failed: 0\n- Spec Manifest Updated: true\n- Project Spec Version: PSV-0002\n\n| Status | Operation | Candidate | Target | Hash Match |\n|---|---|---|---|---|\n| success | replace | candidates/project/modules/CORE/design.candidate.md | .specforge/project/modules/CORE/design.md | true |\n`
  );
  const sm = new StateManager(new PersonalPathResolver(), root);
  await sm.initialize();
  await sm.transition(id, '', 'merging', 'synthetic-upstream', 'feature_spec');
  await sm.transition(id, 'merging', 'merged', 'merge_runner', 'feature_spec');
  await sm.transition(id, 'merged', 'implementation_ready', 'synthetic-upstream', 'feature_spec');
  await sm.transition(id, 'implementation_ready', 'blocked', 'sf-orchestrator', 'feature_spec');
  const args: Record<string, unknown> = {
    work_item_id: id,
    from_state: 'blocked',
    to_state: 'candidate_preparing',
    preimplementation_recovery: 'inspect',
  };
  const context = {
    agent: 'sf-orchestrator',
    directory: root,
    sessionID: 'ses_fixture',
    messageID: 'msg_fixture',
    callID: 'call-fixture',
  };
  const verifier = {
    verifyToolInvocation: vi.fn(async (request: any) => ({
      source: 'runtime-tool-invocation/v1',
      sessionId: request.sessionId,
      messageId: request.messageId,
      callId: context.callID,
      agent: 'sf-orchestrator',
      directory: root,
      tool: request.tool,
      inputSha256: hash(json(request.args)),
      startedAt: Date.now(),
      observedAt: new Date().toISOString(),
      runtimeProjectionSha256: 'a'.repeat(64),
    })),
    readRequiredVerificationSource: vi.fn(async (request: any) => ({
      source: 'required-verification-source/v1',
      sessionId: request.sessionId,
      messageId: request.messageId,
      callId: request.callId,
      tool: request.tool,
      inputSha256: hash(json(request.args)),
      agent: 'sf-orchestrator',
      directory: root,
      userSessionId: 'ses_fixture',
      userMessageId: 'msg_user',
      userTextSha256: hash(String(request.args.user_authorization_text)),
      userCreatedAt: Date.now(),
      observedAt: new Date().toISOString(),
      declaration: null,
      chainSha256: 'b'.repeat(64),
    })),
  };
  const input = {
    deps: {
      projectManager: { getProjectStateManager: async () => sm },
      toolInvocationVerifier: verifier,
    },
    context,
    args,
    projectRoot: root,
    workItemId: id,
  };
  return {
    root,
    wi,
    sm,
    input,
    verifier,
    task,
    events: path.join(root, '.specforge/runtime/events.jsonl'),
    manifestFile,
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('sf-preimplementation-')
    )
      throw Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('preimplementation merged specification recovery', () => {
  test('inspection is read-only; recovery archives, invalidates, rebases and preserves Task', async () => {
    const f = await fixture();
    const beforeEvents = await fs.readFile(f.events);
    const result = await handlePreimplementationSpecRecovery(f.input);
    expect(result.state_advanced).toBe(false);
    expect(await fs.readFile(f.events)).toEqual(beforeEvents);
    expect(await fs.stat(path.join(f.wi, 'recovery_generations')).catch(() => null)).toBeNull();
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = result.authorization_line;
    const recovered = await handlePreimplementationSpecRecovery(f.input);
    expect(recovered.state_advanced).toBe(true);
    expect((await f.sm.getState(id))?.current_state).toBe('candidate_preparing');
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(f.task);
    expect(
      JSON.parse(await fs.readFile(path.join(f.wi, 'user_decision.json'), 'utf8')).decision_status
    ).toBe('invalidated');
    const manifest = JSON.parse(
      await fs.readFile(path.join(f.wi, 'candidate_manifest.json'), 'utf8')
    );
    expect(manifest.base_spec_version).toBe('PSV-0002');
    expect(
      (await validateCandidateProjectSpecBinding({ projectRoot: f.root, manifest })).valid
    ).toBe(true);
    const afterEvents = await fs.readFile(f.events);
    expect((await handlePreimplementationSpecRecovery(f.input)).idempotent).toBe(true);
    expect(await fs.readFile(f.events)).toEqual(afterEvents);
    await expect(assertPreservedRecoveryTask(f.wi, f.task + '\nchanged')).rejects.toThrow(
      'FROZEN_TASK_CHANGED'
    );
  });
  test.each([
    'no-confirmation',
    'wrong-owner',
    'drift',
    'already-written',
    'later-merge',
    'wrong-source',
    'active-permission',
    'hard-stop',
    'stale-invocation',
    'forged-invocation',
    'previous-implementation',
  ])('rejects %s before state or approval changes', async variant => {
    const f = await fixture();
    const inspected = await handlePreimplementationSpecRecovery(f.input);
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = inspected.authorization_line;
    if (variant === 'no-confirmation') f.input.args.user_authorization_text = 'continue';
    if (variant === 'wrong-owner') f.input.context.agent = 'sf-design';
    if (variant === 'drift')
      await fs.appendFile(path.join(f.wi, 'candidates/tasks.md'), '\nchanged');
    if (variant === 'already-written')
      await write(path.join(f.root, 'docs/readiness.md'), 'unexpected implementation');
    if (variant === 'later-merge') {
      const spec = JSON.parse(await fs.readFile(f.manifestFile, 'utf8'));
      spec.last_merged_work_item = 'WI-9999';
      await write(f.manifestFile, spec);
    }
    if (variant === 'wrong-source')
      f.verifier.readRequiredVerificationSource.mockImplementationOnce(async () => ({}) as any);
    if (variant === 'active-permission') {
      const metadataPath = path.join(f.wi, 'work_item.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      metadata.code_change_allowed = true;
      await write(metadataPath, metadata);
    }
    if (variant === 'hard-stop')
      setHardStop(f.root, id, 'Synthetic active safety stop', 'sf_artifact_write');
    if (variant === 'stale-invocation') {
      const real = f.verifier.verifyToolInvocation.getMockImplementation()!;
      f.verifier.verifyToolInvocation.mockImplementationOnce(async request => ({
        ...(await real(request)),
        startedAt: Date.now() - 600000,
      }));
    }
    if (variant === 'forged-invocation') {
      const real = f.verifier.verifyToolInvocation.getMockImplementation()!;
      f.verifier.verifyToolInvocation.mockImplementationOnce(async request => ({
        ...(await real(request)),
        callId: 'not-current-call',
      }));
    }
    if (variant === 'previous-implementation') {
      await f.sm.transition(
        id,
        'blocked',
        'implementation_running',
        'synthetic-upstream',
        'feature_spec'
      );
      await f.sm.transition(
        id,
        'implementation_running',
        'implementation_ready',
        'synthetic-upstream',
        'feature_spec'
      );
      await f.sm.transition(
        id,
        'implementation_ready',
        'blocked',
        'synthetic-upstream',
        'feature_spec'
      );
    }
    const events = await fs.readFile(f.events),
      decision = await fs.readFile(path.join(f.wi, 'user_decision.json'));
    await expect(handlePreimplementationSpecRecovery(f.input)).rejects.toThrow();
    expect(await fs.readFile(f.events)).toEqual(events);
    expect(await fs.readFile(path.join(f.wi, 'user_decision.json'))).toEqual(decision);
  });
  test('ordinary state persistence rejects bypassing the recovery proof', async () => {
    const f = await fixture();
    const before = await fs.readFile(f.events);
    await expect(
      f.sm.transition(id, 'blocked', 'candidate_preparing', 'sf-orchestrator', 'feature_spec')
    ).rejects.toThrow('PREIMPLEMENTATION_RECOVERY_PROVENANCE_REQUIRED');
    expect(await fs.readFile(f.events)).toEqual(before);
  });
  test('resumes the prepared owner transaction after restart without rewriting Task', async () => {
    const f = await fixture();
    const inspected = await handlePreimplementationSpecRecovery(f.input);
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = inspected.authorization_line;
    const injected = vi
      .spyOn(f.sm, 'transition')
      .mockRejectedValueOnce(new Error('SYNTHETIC_PRE_WAL_INTERRUPTION'));
    await expect(handlePreimplementationSpecRecovery(f.input)).rejects.toThrow(
      'SYNTHETIC_PRE_WAL_INTERRUPTION'
    );
    expect(
      JSON.parse(await fs.readFile(path.join(f.wi, 'user_decision.json'), 'utf8')).decision_status
    ).toBe('invalidated');
    expect(
      JSON.parse(await fs.readFile(path.join(f.wi, 'preimplementation_spec_recovery.json'), 'utf8'))
        .status
    ).toBe('prepared');
    injected.mockRestore();
    const restarted = new StateManager(new PersonalPathResolver(), f.root);
    await restarted.initialize();
    f.input.deps.projectManager.getProjectStateManager = async () => restarted;
    expect((await handlePreimplementationSpecRecovery(f.input)).state_advanced).toBe(true);
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(f.task);
  });
  test('a failed checkpoint after committed WAL does not duplicate the recovery event', async () => {
    const f = await fixture();
    const inspected = await handlePreimplementationSpecRecovery(f.input);
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = inspected.authorization_line;
    vi.spyOn(f.sm as any, 'persistState').mockRejectedValueOnce(
      new Error('SYNTHETIC_CHECKPOINT_FAILURE')
    );
    expect((await handlePreimplementationSpecRecovery(f.input)).state_advanced).toBe(true);
    expect((await handlePreimplementationSpecRecovery(f.input)).idempotent).toBe(true);
    expect(
      (await f.sm.readWorkItemTransitionHistory(id)).filter(
        event => event.payload.to_state === 'candidate_preparing'
      )
    ).toHaveLength(1);
  });
  test('the production mutation barrier excludes a second recovery and candidate writes', async () => {
    const f = await fixture();
    const inspected = await handlePreimplementationSpecRecovery(f.input);
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = inspected.authorization_line;
    const real = f.verifier.readRequiredVerificationSource.getMockImplementation()!;
    let resume!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => {
      entered = resolve;
    });
    f.verifier.readRequiredVerificationSource.mockImplementationOnce(async request => {
      entered();
      await new Promise<void>(resolve => {
        resume = resolve;
      });
      return real(request);
    });
    const running = withGateOperationBarrier(f.root, 'sf_state_transition', false, () =>
      handlePreimplementationSpecRecovery(f.input)
    );
    await ready;
    try {
      const duplicate = vi.fn(() => handlePreimplementationSpecRecovery(f.input));
      expect(
        await withGateOperationBarrier(f.root, 'sf_state_transition', false, duplicate)
      ).toMatchObject({ success: false });
      expect(
        await withGateOperationBarrier(f.root, 'sf_artifact_write', false, duplicate)
      ).toMatchObject({ success: false });
      expect(duplicate).not.toHaveBeenCalled();
    } finally {
      resume();
    }
    expect(await running).toMatchObject({ success: true });
    expect(
      (await f.sm.readWorkItemTransitionHistory(id)).filter(
        event => event.payload.to_state === 'candidate_preparing'
      )
    ).toHaveLength(1);
  });
  test('damaged archive prevents resuming a partially committed owner transaction', async () => {
    const f = await fixture();
    const inspected = await handlePreimplementationSpecRecovery(f.input);
    f.input.args.preimplementation_recovery = 'recover';
    f.input.args.user_authorization_text = inspected.authorization_line;
    const injected = vi
      .spyOn(f.sm, 'transition')
      .mockRejectedValueOnce(new Error('SYNTHETIC_PRE_WAL_INTERRUPTION'));
    await expect(handlePreimplementationSpecRecovery(f.input)).rejects.toThrow(
      'SYNTHETIC_PRE_WAL_INTERRUPTION'
    );
    injected.mockRestore();
    const record = JSON.parse(
      await fs.readFile(path.join(f.wi, 'preimplementation_spec_recovery.json'), 'utf8')
    );
    await fs.appendFile(
      path.join(
        f.wi,
        record.archive,
        'snapshot',
        `.specforge/work-items/${id}/candidates/tasks.md`
      ),
      'changed'
    );
    const events = await fs.readFile(f.events);
    await expect(handlePreimplementationSpecRecovery(f.input)).rejects.toThrow(
      'ARCHIVE_BYTES_CHANGED'
    );
    expect(await fs.readFile(f.events)).toEqual(events);
  });
});

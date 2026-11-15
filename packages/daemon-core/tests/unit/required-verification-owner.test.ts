import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type { RequiredVerificationDeclaration } from '@specforge/types/required-verification-contract';
import type { RequiredVerificationSourceRequest } from '@specforge/types/trusted-tool-invocation';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { RequiredVerificationOwner } from '../../src/tools/lib/required-verification-owner';
import { readRequiredVerificationBinding } from '../../src/tools/lib/required-verification-binding';
import { canonicalVerificationJson, verificationId } from '../../src/verification/owner-store';
import { executeMerge } from '../../src/tools/lib/merge-runner-v11';
import { recordUserDecision } from '../../src/tools/lib/user-decision-recorder-v11';
import { runRequiredGates } from '../../src/tools/lib/gate-runner-v11';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith('sf-required-owner-')
    )
      throw new Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-required-owner-'));
  roots.push(root);
  const wi = path.join(root, SPEC_DIR_NAME, 'work-items', 'WI-0001'),
    project = path.join(root, SPEC_DIR_NAME, 'project');
  await fs.mkdir(path.join(wi, 'candidates'), { recursive: true });
  await fs.mkdir(project, { recursive: true });
  const spec = JSON.stringify({ project_spec_version: 'PSV-0001' });
  await fs.writeFile(path.join(project, 'spec_manifest.json'), spec);
  await fs.writeFile(
    path.join(wi, 'candidate_manifest.json'),
    JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      merge_required: true,
      project_spec_precondition_sha256: 'sha256:' + verificationId(spec),
      entries: [
        {
          candidate_path: 'candidates/trace_delta.md',
          target_path: '.specforge/project/trace_matrix.md',
          operation: 'replace',
          type: 'trace_delta',
        },
      ],
    })
  );
  await fs.writeFile(
    path.join(wi, 'implementation_baseline.json'),
    JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0001',
      snapshot_id: 'sha256:' + 'b'.repeat(64),
    })
  );
  for (const name of ['change_classification.md', 'impact_analysis.md', 'trigger_result.json'])
    await fs.writeFile(path.join(wi, name), 'finite scope');
  const file = path.join(wi, 'candidates/trace_delta.md');
  await fs.writeFile(file, 'expected bytes\n');
  await fs.writeFile(path.join(wi, 'candidates/tasks.md'), 'frozen task sentinel');
  const resolver = new PersonalPathResolver();
  let manager = new StateManager(resolver, root);
  await manager.initialize();
  await manager.transition('WI-0001', '', 'candidate_preparing', 'test');
  const binding = await readRequiredVerificationBinding(root, 'WI-0001');
  let declaration: RequiredVerificationDeclaration | null = {
    schema_version: '1.0',
    profile: 'candidate-exact-file-sha256/v1',
    work_item_id: 'WI-0001',
    candidate_generation: binding.generation,
    project_spec_manifest_sha256: binding.specSha256,
    requirements: [
      {
        id: 'RV-trace',
        path: 'candidates/trace_delta.md',
        owner: 'sf-task-planner',
        expected_sha256: verificationId('expected bytes\n'),
      },
    ],
  };
  let user = 0,
    agentOverride: string | undefined;
  const userTime = Date.now() - 1000;
  const deps = {
    projectManager: { getProjectStateManager: async () => manager },
    toolInvocationVerifier: {
      verifyToolInvocation: async () => {
        throw new Error('WRONG_VERIFIER_PATH');
      },
      readRequiredVerificationSource: async (input: RequiredVerificationSourceRequest) => ({
        source: 'required-verification-source/v1' as const,
        sessionId: input.sessionId,
        messageId: 'msg_call',
        callId: input.callId,
        tool: input.tool,
        inputSha256: verificationId(canonicalVerificationJson(input.args)),
        agent: agentOverride ?? (input.tool === 'task' ? 'sf-orchestrator' : 'sf-task-planner'),
        directory: root,
        userSessionId: 'ses_root',
        userMessageId: 'msg_user' + user,
        userTextSha256: verificationId(canonicalVerificationJson(declaration)),
        userCreatedAt: userTime + user,
        observedAt: new Date().toISOString(),
        declaration,
        chainSha256: 'f'.repeat(64),
      }),
    },
  };
  const owner = new RequiredVerificationOwner(deps);
  const request = (): RequiredVerificationSourceRequest => ({
    sessionId: 'ses_root',
    callId: 'call_register',
    directory: root,
    tool: 'task',
    args: { subagent_type: 'sf-task-planner' },
  });
  const verify = async (key: string) =>
    owner.verify(
      root,
      {
        sessionId: 'ses_root',
        callId: 'call_verify',
        directory: root,
        tool: 'sf_handoff',
        args: { action: 'verify_required', work_item_id: 'WI-0001', requirement_key: key },
      },
      'WI-0001',
      key
    );
  return {
    root,
    wi,
    file,
    owner,
    request,
    verify,
    manager: () => manager,
    restart: async () => {
      manager = new StateManager(resolver, root);
      await manager.initialize();
    },
    setDeclaration: (next: RequiredVerificationDeclaration | null, fresh = true) => {
      declaration = next;
      if (fresh) user++;
    },
    declaration: () => declaration!,
    setAgent: (value: string) => {
      agentOverride = value;
    },
  };
}
describe('required verification owner with actual persistent state and files', () => {
  it('keeps case-distinct POSIX registrations independent and rejects Windows aliases without appending', async () => {
    const f = await fixture();
    const manifestFile = path.join(f.wi, 'candidate_manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    // On Windows scope binding itself rejects aliases. On POSIX both finite entries exist.
    manifest.entries.push({ ...manifest.entries[0], candidate_path: 'candidates/TRACE_DELTA.md' });
    await fs.writeFile(manifestFile, JSON.stringify(manifest));
    const binding = await readRequiredVerificationBinding(f.root, 'WI-0001');
    f.setDeclaration({ ...f.declaration(), candidate_generation: binding.generation });
    if (process.platform === 'win32') {
      await expect(f.owner.captureSource(f.root, f.request())).rejects.toThrow('SCOPE_OR_OWNER');
      expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(0);
    } else {
      await f.owner.captureSource(f.root, f.request());
      const first = f.declaration();
      f.setDeclaration({ ...first, requirements: [{ ...first.requirements[0]!, id: 'RV-upper', path: 'candidates/TRACE_DELTA.md', expected_sha256: verificationId('separate bytes\n') }] });
      await f.owner.captureSource(f.root, f.request());
      await f.restart();
      const status = await f.owner.inspect(f.root, 'WI-0001');
      expect(status.requirements).toHaveLength(2);
      // Registration is not proof of either file, including on case-insensitive POSIX volumes.
      await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('PENDING_OR_FAILED');
    }
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe('frozen task sentinel');
  });
  it('does not append a declaration or a proof through an existing HardStop', async () => {
    const first = await fixture();
    setHardStop(first.root, 'WI-0001', 'synthetic safety stop', 'sf_test');
    await expect(first.owner.captureSource(first.root, first.request())).rejects.toThrow(
      'HARD_STOP_ACTIVE'
    );
    expect(await first.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(0);
    const second = await fixture();
    await second.owner.captureSource(second.root, second.request());
    const key = (await second.owner.inspect(second.root, 'WI-0001')).requirements[0]!.key;
    setHardStop(second.root, 'WI-0001', 'synthetic safety stop', 'sf_test');
    await expect(second.verify(key)).rejects.toThrow('HARD_STOP_ACTIVE');
    expect(await second.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(1);
  });
  it('archives a passed requirement only against a bound successful Merge transition and recovers once after restart', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const key = (await f.owner.inspect(f.root, 'WI-0001')).requirements[0]!.key;
    await f.verify(key);
    const receipt = await f.owner.assertReady(f.root, 'WI-0001');
    await expect(f.owner.consumeMerged(f.root, 'WI-0001')).rejects.toThrow(
      'MERGE_RECEIPT_REQUIRED'
    );
    // Synthetic lifecycle fixture: no business Merge or approval is performed here.
    const report =
      'Contract: merge-report/v1\nWork Item: WI-0001\nStatus: success\nTotal entries: 1\nSuccessful: 1\nFailed: 0\n';
    const spec = JSON.stringify({ project_spec_version: 'PSV-0002' });
    await fs.writeFile(path.join(f.wi, 'merge_report.md'), report);
    await fs.writeFile(path.join(f.root, SPEC_DIR_NAME, 'project', 'spec_manifest.json'), spec);
    await f.manager().transition('WI-0001', 'candidate_preparing', 'merging', 'test');
    await f.manager().transition('WI-0001', 'merging', 'merged', 'merge_runner', 'feature_spec', {
      transition_context: {
        source: 'sf_v11_merge',
        merge_status: 'success',
        merged_count: 1,
        required_verification_merge: {
          history_sha256: receipt.history_sha256,
          merge_report_sha256: verificationId(report),
          resulting_spec_sha256: verificationId(spec),
        },
      },
    });
    await f.restart();
    await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('BASELINE_MISMATCH');
    const consumed = await f.owner.consumeMerged(f.root, 'WI-0001');
    expect(consumed).not.toBeNull();
    await f.restart();
    expect(await f.owner.consumeMerged(f.root, 'WI-0001')).toEqual(consumed);
    expect((await f.owner.assertReady(f.root, 'WI-0001')).required).toBe(0);
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(3);
    expect(f.manager().getState('WI-0001')?.current_state).toBe('merged');
  });
  it('does not allow a synthetic consumed record to erase a pending stop without Merge provenance', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const history = await f.manager().readRequiredVerificationHistory('WI-0001');
    await expect(
      f.manager().appendRequiredVerificationEvent(
        'WI-0001',
        'consumed',
        {
          contract: 'required-verification-record/v1',
          prior_history_sha256: verificationId(canonicalVerificationJson(history)),
          merge_transition_event_id: 'invented',
          merge_report_sha256: 'a'.repeat(64),
          resulting_spec_sha256: 'b'.repeat(64),
        },
        history[0]!.eventId
      )
    ).rejects.toThrow('CONSUMPTION_PROVENANCE_INVALID');
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(1);
  });
  it.each(['report', 'spec', 'candidate_identity'])(
    'retains the stop after restart when the bound Merge %s has drifted',
    async drift => {
      const f = await fixture();
      await f.owner.captureSource(f.root, f.request());
      const key = (await f.owner.inspect(f.root, 'WI-0001')).requirements[0]!.key;
      await f.verify(key);
      const receipt = await f.owner.assertReady(f.root, 'WI-0001');
      // Synthetic lifecycle setup; no original business Candidate approval.
      const report =
        'Contract: merge-report/v1\nWork Item: WI-0001\nStatus: success\nTotal entries: 1\nSuccessful: 1\nFailed: 0\n';
      const spec = JSON.stringify({ project_spec_version: 'PSV-0002' });
      const reportFile = path.join(f.wi, 'merge_report.md');
      const specFile = path.join(f.root, SPEC_DIR_NAME, 'project', 'spec_manifest.json');
      await fs.writeFile(reportFile, report);
      await fs.writeFile(specFile, spec);
      await f.manager().transition('WI-0001', 'candidate_preparing', 'merging', 'test');
      await f.manager().transition('WI-0001', 'merging', 'merged', 'merge_runner', 'feature_spec', {
        transition_context: {
          source: 'sf_v11_merge',
          merge_status: 'success',
          merged_count: 1,
          required_verification_merge: {
            history_sha256: receipt.history_sha256,
            merge_report_sha256: verificationId(report),
            resulting_spec_sha256: verificationId(spec),
          },
        },
      });
      if (drift === 'report')
        await fs.writeFile(reportFile, report.replace('Status: success', 'Status: failed'));
      else if (drift === 'spec') await fs.writeFile(specFile, spec + '\n');
      else {
        await fs.writeFile(f.file + '.replacement', await fs.readFile(f.file));
        await fs.rename(f.file + '.replacement', f.file);
      }
      await f.restart();
      await expect(f.owner.consumeMerged(f.root, 'WI-0001')).rejects.toThrow(
        drift === 'candidate_identity' ? 'PROOF_STALE' : 'MERGE_RECEIPT_STALE'
      );
      expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(2);
      expect(f.manager().getState('WI-0001')?.current_state).toBe('merged');
      expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(
        'frozen task sentinel'
      );
    }
  );
  it('blocks direct Gate, Decision and Merge primitives before dependent artifacts are created', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const common = {
      projectRoot: f.root,
      workItemId: 'WI-0001',
      workItemDir: f.wi,
      requiredVerification: f.owner,
    };
    const before = (await fs.readdir(f.wi)).sort();
    await expect(runRequiredGates([], common)).rejects.toThrow('PENDING_OR_FAILED');
    await expect(
      recordUserDecision({
        ...common,
        workflowPath: 'requirement_change_path',
        baseSpecVersion: 'PSV-0001',
        candidateManifestPath: 'candidate_manifest.json',
        gateSummaryPath: 'gate_summary.md',
        decisionStatus: 'approved',
        decisionType: 'user_approved',
        decidedBy: 'user',
        decisionScope: 'current candidate',
      })
    ).rejects.toThrow('PENDING_OR_FAILED');
    await expect(
      executeMerge({
        ...common,
        candidateManifestPath: path.join(f.wi, 'candidate_manifest.json'),
        userDecisionPath: path.join(f.wi, 'user_decision.json'),
      })
    ).rejects.toThrow('PENDING_OR_FAILED');
    expect((await fs.readdir(f.wi)).sort()).toEqual(before);
    expect(f.manager().getState('WI-0001')?.current_state).toBe('candidate_preparing');
  });
  it('fails closed when a direct consumer omits the Runtime owner', async () => {
    const f = await fixture();
    const common = { projectRoot: f.root, workItemId: 'WI-0001', workItemDir: f.wi };
    await expect(runRequiredGates([], common)).rejects.toThrow('OWNER_UNAVAILABLE');
    await expect(
      executeMerge({
        ...common,
        candidateManifestPath: path.join(f.wi, 'candidate_manifest.json'),
        userDecisionPath: path.join(f.wi, 'user_decision.json'),
      })
    ).rejects.toThrow('OWNER_UNAVAILABLE');
    await expect(
      recordUserDecision({
        ...common,
        workflowPath: 'requirement_change_path',
        baseSpecVersion: 'PSV-0001',
        candidateManifestPath: 'candidate_manifest.json',
        gateSummaryPath: 'gate_summary.md',
        decisionStatus: 'approved',
        decisionType: 'user_approved',
        decidedBy: 'user',
        decisionScope: 'current candidate',
      })
    ).rejects.toThrow('OWNER_UNAVAILABLE');
  });
  it('registers the complete source once and preserves a pending stop across restart', async () => {
    const f = await fixture();
    const first = await f.owner.captureSource(f.root, f.request());
    expect((await f.owner.captureSource(f.root, f.request())).registration_event_id).toBe(
      first.registration_event_id
    );
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(1);
    await f.restart();
    await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('PENDING_OR_FAILED');
    expect(f.manager().getState('WI-0001')?.current_state).toBe('candidate_preparing');
  });
  it('records genuine byte proof and rejects later drift without changing the frozen Task', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const key = (await f.owner.inspect(f.root, 'WI-0001')).requirements[0]!.key;
    expect((await f.verify(key)).outcome).toBe('passed');
    expect((await f.owner.assertReady(f.root, 'WI-0001')).required).toBe(1);
    await fs.writeFile(f.file, 'drift');
    await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('PROOF_STALE');
    expect((await f.verify(key)).outcome).toBe('failed');
    await f.restart();
    await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('PENDING_OR_FAILED');
    expect(await fs.readFile(path.join(f.wi, 'candidates/tasks.md'), 'utf8')).toBe(
      'frozen task sentinel'
    );
  });
  it('retains unavailable evidence and permits only the original professional owner to prove it', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const key = (await f.owner.inspect(f.root, 'WI-0001')).requirements[0]!.key;
    f.setAgent('sf-design');
    await expect(f.verify(key)).rejects.toThrow('OWNER_MISMATCH');
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(1);
    f.setAgent('sf-task-planner');
    await fs.unlink(f.file);
    expect((await f.verify(key)).outcome).toBe('unavailable');
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(2);
    await expect(f.owner.assertReady(f.root, 'WI-0001')).rejects.toThrow('PENDING_OR_FAILED');
  });
  it('allows source-bound cancellation and preserves both the old registration and the cancellation', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const status = await f.owner.inspect(f.root, 'WI-0001');
    f.setDeclaration({
      ...f.declaration(),
      requirements: [],
      replacement: { prior_history_sha256: status.history_sha256 },
    });
    await f.owner.captureSource(f.root, f.request());
    expect((await f.owner.assertReady(f.root, 'WI-0001')).required).toBe(0);
    await f.owner.captureSource(f.root, f.request());
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(2);
  });
  it('rejects altered text under the same user identity before appending invalid history', async () => {
    const f = await fixture();
    await f.owner.captureSource(f.root, f.request());
    const status = await f.owner.inspect(f.root, 'WI-0001');
    f.setDeclaration(
      {
        ...f.declaration(),
        requirements: [],
        replacement: { prior_history_sha256: status.history_sha256 },
      },
      false
    );
    await expect(f.owner.captureSource(f.root, f.request())).rejects.toThrow();
    expect(await f.manager().readRequiredVerificationHistory('WI-0001')).toHaveLength(1);
  });
});

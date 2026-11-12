/** Real state/WAL and filesystem guards; only upstream approval and Runtime call proof are synthetic. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { WAL } from '../../src/wal/WAL';
import { ensureProjectInit } from '../../src/tools/lib/sf_project_init_core';
import { computeCandidateHash } from '../../src/tools/lib/governance-invariants-v11';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';
import {
  transitionWithEvidence,
  type TransitionWithEvidenceInput,
} from '../../src/tools/lib/state-coordinator-v11';
import {
  canonicalVerificationJson as json,
  verificationId as hash,
} from '../../src/verification/owner-store';
import { takeSnapshot } from '../../src/tools/lib/filesystem-diff';
import { inspectBlockedVerificationRecovery } from '../../src/tools/lib/blocked-verification-recovery';

const roots: string[] = [],
  wi = 'WI-9401';
async function write(file: string, value: string | object) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value) + '\n');
}
async function fixture(prior = 'verification_running') {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-blocked-verification-'));
  roots.push(project);
  await ensureProjectInit(project, 'Synthetic recovery unit fixture');
  const wiRoot = path.join(project, '.specforge/work-items', wi),
    now = new Date().toISOString();
  const baseline = takeSnapshot(project);
  await write(path.join(project, 'src/value.cjs'), 'module.exports={value:1};\n');
  const manifestFile = path.join(project, '.specforge/project/spec_manifest.json');
  const psv = JSON.parse(await fs.readFile(manifestFile, 'utf8')).project_spec_version;
  await write(path.join(wiRoot, 'work_item.json'), {
    schema_version: '1.1',
    work_item_id: wi,
    workflow_type: 'feature_spec',
    workflow_path: 'code_only_fast_path',
    project_spec_version_at_permission: psv,
    code_change_allowed: false,
    allowed_write_files: [],
    code_permission_revoked_at: now,
    created_at: now,
    updated_at: now,
  });
  await write(path.join(wiRoot, 'governance_scope.json'), {
    schema_version: '1.0',
    work_item_id: wi,
    active: false,
    project_spec_version: psv,
    version_control_mode: 'filesystem',
    frozen_at: now,
    allowed_write_files: ['src/value.cjs'],
  });
  await write(path.join(wiRoot, 'filesystem_baseline.json'), baseline);
  await write(
    path.join(wiRoot, 'candidates/tasks.md'),
    `### TASK-${wi}-001 Verify\n\n- **refs**: [DD-TEST-001, REQ-TEST-001]\n- **allowed_write_files**: [src/value.cjs]\n- **verification_commands**:\n  - unit:\n    - \`node -e "require('./src/value.cjs')"\`\n`
  );
  const manifest = {
    schema_version: '1.0',
    work_item_id: wi,
    workflow_path: 'code_only_fast_path',
    workflow_type: 'feature_spec',
    base_spec_version: psv,
    merge_required: false,
    entries: [],
  };
  await write(path.join(wiRoot, 'candidate_manifest.json'), manifest);
  await write(path.join(wiRoot, 'user_decision.json'), {
    schema_version: '1.0',
    decision_id: 'UD-' + wi + '-synthetic',
    work_item_id: wi,
    workflow_path: 'code_only_fast_path',
    base_spec_version: psv,
    candidate_manifest_path: 'candidate_manifest.json',
    manifest_hash: 'sha256:' + hash(json(manifest)),
    candidate_hash: await computeCandidateHash(wiRoot),
    gate_summary_path: 'gate_summary.md',
    gate_summary_hash: 'sha256:' + 'a'.repeat(64),
    decision_status: 'approved',
    decision_type: 'auto_approved',
    decided_by: 'synthetic-unit-policy',
    decided_at: now,
    decision_scope: 'fixture',
    waivers: [],
    auto_approval_policy_id: 'SELF_OWNED_UNIT_ONLY',
  });
  await write(
    path.join(wiRoot, 'merge_report.md'),
    `Contract: merge-report/v1\nWork Item: ${wi}\nStatus: not_applicable\nTotal entries: 0\nSuccessful: 0\nFailed: 0\n`
  );
  await write(
    path.join(wiRoot, 'changed_files_audit.md'),
    `# Changed Files Audit\n\nContract: changed-files-audit/v1\nWork Item: ${wi}\nCommand: N/A\nTimestamp: ${now}\n\n## Result: PASS\n\n- Total files: 1\n- In scope: 1\n- Out of scope: 0\n- Violations: 0\n- Blocked write attempts: 0\n- Unresolved blocked write attempts: 0\n\n## Entries\n\n- [modify] src/value.cjs → in_scope\n`
  );
  const sm = new StateManager(new PersonalPathResolver(), project);
  await sm.initialize();
  // Seeded upstream phase is explicit; this is not approval/implementation business acceptance.
  await sm.transition(wi, '', prior, 'synthetic-upstream-fixture', 'feature_spec');
  await sm.transition(wi, prior, 'blocked', 'sf-orchestrator', 'feature_spec', {
    evidence: 'synthetic external verifier unavailable',
  });
  const args = {
    work_item_id: wi,
    from_state: 'blocked',
    to_state: 'verification_running',
    evidence: 'Owner repair independently qualified',
  };
  const input: TransitionWithEvidenceInput = {
    projectRoot: project,
    workItemDir: wiRoot,
    workItemId: wi,
    fromState: 'blocked',
    toState: 'verification_running',
    workflowType: 'feature_spec',
    actorRole: 'sf-orchestrator',
    evidence: args.evidence,
    invocationArgs: args,
    transitionContext: { source: 'sf_state_transition' },
    context: {
      directory: project,
      sessionID: 'ses_fixture',
      messageID: 'msg_fixture',
      agent: 'sf-orchestrator',
    },
    deps: {
      projectManager: { getProjectStateManager: async () => sm },
      toolInvocationVerifier: {
        verifyToolInvocation: vi.fn(async (request: any) => ({
          source: 'runtime-tool-invocation/v1',
          sessionId: request.sessionId,
          messageId: request.messageId,
          callId: 'call-fixture',
          agent: 'sf-orchestrator',
          directory: request.directory,
          tool: request.tool,
          inputSha256: hash(json(request.args)),
          startedAt: Date.now() - 10,
          observedAt: new Date().toISOString(),
          runtimeProjectionSha256: 'b'.repeat(64),
        })),
      },
    },
  };
  return {
    project,
    wiRoot,
    sm,
    input,
    events: path.join(project, '.specforge/runtime/events.jsonl'),
    manifestFile,
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    const absolute = path.resolve(root);
    if (
      path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
      !path.basename(absolute).startsWith('sf-blocked-verification-')
    )
      throw Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(absolute, { recursive: true, force: true });
  }
});

describe('bounded blocked verification recovery', () => {
  it.each([false, true])(
    'validates the actual Git implementation binding (dirty=%s)',
    async dirty => {
      const f = await fixture();
      const git = (args: string[]) =>
        execFileSync(
          'git',
          ['-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), ...args],
          { cwd: f.project, encoding: 'utf8', windowsHide: true }
        );
      git(['init', '-q', '-b', 'main']);
      const identity = [
        '-c',
        'user.name=Synthetic',
        '-c',
        'user.email=synthetic@localhost.invalid',
      ];
      git([...identity, 'commit', '--allow-empty', '-q', '-m', 'owned baseline']);
      const base = git(['rev-parse', 'HEAD']).trim();
      git(['add', 'src/value.cjs']);
      git([...identity, 'commit', '-q', '-m', 'owned implementation']);
      const scopePath = path.join(f.wiRoot, 'governance_scope.json'),
        scope = JSON.parse(await fs.readFile(scopePath, 'utf8'));
      scope.version_control_mode = 'git';
      await write(scopePath, scope);
      await write(path.join(f.wiRoot, 'git_context.json'), {
        schema_version: '1.0',
        work_item_id: wi,
        git_enabled: true,
        branch_name: 'main',
        base_commit: base,
      });
      if (dirty) await fs.appendFile(path.join(f.project, 'src/value.cjs'), '// uncommitted\n');
      const before = await fs.readFile(f.events);
      if (dirty) {
        await expect(transitionWithEvidence(f.input)).rejects.toThrow('GIT_BINDING_INVALID');
        expect(await fs.readFile(f.events)).toEqual(before);
      } else {
        expect((await transitionWithEvidence(f.input)).advanced).toBe(true);
        const event = JSON.parse((await fs.readFile(f.events, 'utf8')).trim().split('\n').at(-1)!);
        expect(event.payload.transition_context.verification_recovery.git_binding.head_commit).toBe(
          git(['rev-parse', 'HEAD']).trim()
        );
      }
    }
  );
  it('preserves original events and revoked metadata, appending a bound recovery only', async () => {
    const f = await fixture(),
      before = await fs.readFile(f.events),
      metadata = await fs.readFile(path.join(f.wiRoot, 'work_item.json'));
    expect((await transitionWithEvidence(f.input)).advanced).toBe(true);
    const after = await fs.readFile(f.events);
    expect(after.subarray(0, before.length)).toEqual(before);
    const event = JSON.parse(after.toString().trim().split('\n').at(-1)!);
    const proof = event.payload.transition_context.verification_recovery;
    expect(proof.contract).toBe('blocked-verification-recovery/v1');
    expect(proof.blocked_event_id).toBe(
      JSON.parse(before.toString().trim().split('\n').at(-1)!).eventId
    );
    expect(proof.files['src/value.cjs']).toBe(
      hash(await fs.readFile(path.join(f.project, 'src/value.cjs')))
    );
    expect(proof.code_permission_granted).toBe(false);
    expect(proof.application_executed).toBe(false);
    expect(await fs.readFile(path.join(f.wiRoot, 'work_item.json'))).toEqual(metadata);
    await expect(transitionWithEvidence(f.input)).rejects.toThrow('PRIOR_VERIFICATION_REQUIRED');
    expect(await fs.readFile(f.events)).toEqual(after);
  });
  it.each(['candidate_preparing', 'implementation_running', 'implementation_done'])(
    'rejects blocking from %s',
    async prior => {
      const f = await fixture(prior),
        before = await fs.readFile(f.events);
      await expect(transitionWithEvidence(f.input)).rejects.toThrow('PRIOR_VERIFICATION_REQUIRED');
      expect(await fs.readFile(f.events)).toEqual(before);
    }
  );
  it.each([
    'owner',
    'invocation',
    'caller-proof',
    'permission',
    'approval',
    'candidate',
    'psv',
    'scope',
    'scope-path-type',
    'audit',
    'audit-binding',
    'hard-stop',
    'runtime-owner',
    'future-invocation',
    'filesystem-git',
    'baseline-schema',
    'baseline-root',
    'hardlink',
  ])('rejects %s without state writes', async kind => {
    const f = await fixture(),
      before = await fs.readFile(f.events);
    const edit = async (name: string, mutate: (v: any) => void) => {
      const file = path.join(f.wiRoot, name),
        value = JSON.parse(await fs.readFile(file, 'utf8'));
      mutate(value);
      await write(file, value);
    };
    if (kind === 'owner') f.input.actorRole = 'sf-verifier';
    if (kind === 'invocation') delete f.input.deps.toolInvocationVerifier;
    if (kind === 'caller-proof')
      f.input.transitionContext!.verification_recovery = { blocked_event_id: 'forged' };
    if (kind === 'permission')
      await edit('work_item.json', v => {
        v.code_change_allowed = true;
        v.allowed_write_files = ['src/value.cjs'];
      });
    if (kind === 'approval')
      await edit('user_decision.json', v => {
        v.decision_status = 'rejected';
      });
    if (kind === 'candidate')
      await fs.appendFile(path.join(f.wiRoot, 'candidates/tasks.md'), 'Unapproved change\n');
    if (kind === 'psv') {
      const value = JSON.parse(await fs.readFile(f.manifestFile, 'utf8'));
      value.project_spec_version = 'PSV-9999';
      await write(f.manifestFile, value);
    }
    if (kind === 'scope')
      await edit('governance_scope.json', v => {
        v.allowed_write_files = [];
      });
    if (kind === 'scope-path-type')
      await edit('governance_scope.json', v => {
        v.allowed_write_files = ['src/value.cjs', 42];
      });
    if (kind === 'audit')
      await fs.writeFile(path.join(f.wiRoot, 'changed_files_audit.md'), 'not an audit');
    if (kind === 'audit-binding')
      await write(
        path.join(f.wiRoot, 'write_guard_log.jsonl'),
        JSON.stringify({ path: 'src/value.cjs', allowed: false }) + '\n'
      );
    if (kind === 'hard-stop') setHardStop(f.project, wi, 'SYNTHETIC_STOP', 'owned unit denial');
    if (kind === 'runtime-owner' || kind === 'future-invocation') {
      const original = f.input.deps.toolInvocationVerifier.verifyToolInvocation;
      f.input.deps.toolInvocationVerifier.verifyToolInvocation = async (request: unknown) => {
        const proof = await original(request);
        return kind === 'runtime-owner'
          ? { ...proof, agent: 'sf-verifier' }
          : { ...proof, startedAt: Date.now() + 60000 };
      };
    }
    if (kind === 'filesystem-git') await fs.mkdir(path.join(f.project, '.git'));
    if (kind === 'baseline-schema')
      await edit('filesystem_baseline.json', v => {
        v.schema_version = 'unknown';
      });
    if (kind === 'baseline-root')
      await edit('filesystem_baseline.json', v => {
        v.root = path.join(f.project, 'wrong');
      });
    if (kind === 'hardlink')
      await fs.link(path.join(f.project, 'src/value.cjs'), path.join(f.project, 'alias.cjs'));
    await expect(transitionWithEvidence(f.input)).rejects.toThrow();
    expect(await fs.readFile(f.events)).toEqual(before);
    expect((await f.sm.getState(wi))?.current_state).toBe('blocked');
  });
  it('reads retained segments and rejects a missing segment instead of trusting the checkpoint', async () => {
    const f = await fixture(),
      lines = (await fs.readFile(f.events, 'utf8')).trim().split('\n'),
      archive = path.join(path.dirname(f.events), 'events-2026-11-12T00-00-00-000Z.jsonl.bak');
    await fs.writeFile(archive, lines[0] + '\n');
    await fs.writeFile(f.events, lines.slice(1).join('\n') + '\n');
    expect((await f.sm.readLastWorkItemTransition(wi))?.payload.to_state).toBe('blocked');
    await fs.rename(archive, archive + '.retained-test-removal');
    await expect(transitionWithEvidence(f.input)).rejects.toThrow('WAL_HISTORY_SEQUENCE_INVALID');
  });
  it('rejects an old recovery proof after a later blocking event', async () => {
    const f = await fixture(),
      proof = await inspectBlockedVerificationRecovery(f.input);
    await f.sm.transition(wi, 'blocked', 'implementation_ready', 'synthetic-fixture');
    await f.sm.transition(wi, 'implementation_ready', 'implementation_done', 'synthetic-fixture');
    await f.sm.transition(wi, 'implementation_done', 'verification_running', 'synthetic-fixture');
    await f.sm.transition(wi, 'verification_running', 'blocked', 'synthetic-fixture');
    const before = await fs.readFile(f.events);
    await expect(
      f.sm.transition(wi, 'blocked', 'verification_running', 'sf-orchestrator', 'feature_spec', {
        transition_context: { source: 'sf_state_transition', verification_recovery: proof },
      })
    ).rejects.toThrow('BLOCKED_VERIFICATION_RECOVERY_PROVENANCE_REQUIRED');
    expect(await fs.readFile(f.events)).toEqual(before);
  });
  it('replays a committed recovery when checkpoint persistence fails, without duplicating it', async () => {
    const f = await fixture();
    vi.spyOn(f.sm as any, 'persistState').mockRejectedValueOnce(
      new Error('SYNTHETIC_CHECKPOINT_FAILURE')
    );
    await expect(transitionWithEvidence(f.input)).rejects.toThrow('SYNTHETIC_CHECKPOINT_FAILURE');
    const after = await fs.readFile(f.events),
      cold = new StateManager(new PersonalPathResolver(), f.project);
    await cold.rebuildState();
    expect((await cold.getState(wi))?.current_state).toBe('verification_running');
    await expect(transitionWithEvidence(f.input)).rejects.toThrow('PRIOR_VERIFICATION_REQUIRED');
    expect(await fs.readFile(f.events)).toEqual(after);
  });
  it('allows only one of two concurrent recovery calls', async () => {
    const f = await fixture(),
      result = await Promise.allSettled([
        transitionWithEvidence(f.input),
        transitionWithEvidence(f.input),
      ]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await fs.readFile(f.events, 'utf8')).trim().split('\n')).toHaveLength(3);
    await expect(f.sm.rebuildState()).resolves.toBeDefined();
  });
  it('rejects concurrent stale appends inside the real serialized WAL owner', async () => {
    const f = await fixture(),
      other = new StateManager(new PersonalPathResolver(), f.project),
      original = WAL.prototype.appendEvent;
    let release!: () => void;
    const barrier = new Promise<void>(r => {
      release = r;
    });
    let count = 0;
    vi.spyOn(WAL.prototype, 'appendEvent').mockImplementation(async function (event, previous) {
      count++;
      if (count === 2) release();
      await barrier;
      return original.call(this, event, previous);
    });
    const outcomes = await Promise.allSettled([
      f.sm.transition(wi, 'blocked', 'implementation_ready', 'sf-orchestrator', 'feature_spec'),
      other.transition(wi, 'blocked', 'candidate_preparing', 'sf-orchestrator', 'feature_spec'),
    ]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1);
    const failure = outcomes.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(failure.reason)).toContain('WAL_STATE_TRANSITION_CONFLICT');
    await expect(f.sm.rebuildState()).resolves.toBeDefined();
    expect((await fs.readFile(f.events, 'utf8')).trim().split('\n')).toHaveLength(3);
  });
});

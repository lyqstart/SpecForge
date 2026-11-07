/** Fixed first-party broker. Application output never supplies control facts. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertVerificationPath, canonicalVerificationJson as json, readVerificationFile, verificationId as hash } from './owner-store';
import { verificationRecord as record, verificationRequire as requireFact } from './verification-schema';
import type { VerificationAttempt, VerificationPlan } from './verification-plan';

export async function writeVerificationPrivate(file: string, bytes: string | Buffer): Promise<void> {
  await assertVerificationPath(file, true);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await assertVerificationPath(path.dirname(file));
  await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
}
export function nativeConfigPath(owner: string, attempt: VerificationAttempt): string {
  return path.join(owner, 'native-plans', attempt.attemptId + '.json');
}
export function nativeRunRoot(owner: string, attempt: VerificationAttempt): string { return path.join(owner, 'runs', attempt.attemptId); }
export async function requestVerificationCancellation(owner: string, attempt: VerificationAttempt): Promise<void> {
  const file = path.join(owner, 'cancellations', attempt.attemptId + '.json');
  const value = json({ plan_id: attempt.planId, attempt_id: attempt.attemptId }) + '\n';
  try { await writeVerificationPrivate(file, value); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readVerificationFile(file, 1024)).equals(Buffer.from(value))) throw error; }
}

interface BrokerTransport {
  startedAt: string; finishedAt: string; exitCode: number | null; signal: string | null;
  stdout: Buffer; stderr: Buffer; outputComplete: boolean; failure: string | null;
}
export interface NativeInspection {
  sha256: string; cleanupProved: boolean; processesEnded: boolean;
  eventsSha256: string | null;
}
export interface NativeExecutionFacts {
  processStarted: boolean; processResumed: boolean; exitCode: number | null;
  launcherExitCode: number | null; jobEnded: boolean; cleanupProved: boolean;
  outputComplete: boolean; stdoutSha256: string; stderrSha256: string;
  nativeReceiptSha256: string | null; nativeEventsSha256: string | null;
  inspectionSha256: string | null; outcome: 'passed'|'failed'|'not_executed'|'cancelled'|'interrupted'; failure: string | null;
}

export class VerificationNativeExecutor {
  constructor(readonly ownerRoot: string) {}

  private async broker(plan: VerificationPlan, attempt: VerificationAttempt, mode: '--verification-plan'|'--verification-inspect'|'--verification-recover', signal?: AbortSignal): Promise<BrokerTransport> {
    const startedAt = new Date().toISOString(), config = nativeConfigPath(this.ownerRoot, attempt);
    requireFact(hash(await readVerificationFile(config, 4194304)) === attempt.nativeConfigSha256, 'NATIVE_CONFIG_DRIFT');
    requireFact(hash(await readVerificationFile(plan.assets.launcherPath, 268435456)) === plan.assets.launcherSha256, 'LAUNCHER_DRIFT');
    const env: NodeJS.ProcessEnv = { OPENCODE_CONFIG_DIR: path.resolve(this.ownerRoot, '../../..') };
    for (const key of ['SystemRoot','WINDIR','LOCALAPPDATA','USERPROFILE','SYSTEMDRIVE']) if (process.env[key] !== undefined) env[key] = process.env[key];
    return new Promise<BrokerTransport>((resolve) => {
      const out: Buffer[] = [], err: Buffer[] = []; let outBytes = 0, errBytes = 0, complete = true, failure: string | null = null;
      const child = spawn(plan.assets.launcherPath, [mode, config, attempt.nativeConfigSha256], {
        cwd: this.ownerRoot, env, windowsHide: true, detached: true, stdio: ['ignore','pipe','pipe'], shell: false,
      });
      const cancel = () => { void requestVerificationCancellation(this.ownerRoot, attempt).catch(() => { failure = 'CANCEL_INTENT_WRITE_FAILED'; child.kill('SIGKILL'); }); };
      signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
      const wall = setTimeout(() => { failure = 'BROKER_WALL_LIMIT'; cancel(); }, mode === '--verification-plan' ? plan.budget.wallMs + 15000 : 30000);
      const final = setTimeout(() => { failure = 'BROKER_TERMINATION_REQUIRED'; child.kill('SIGKILL'); }, mode === '--verification-plan' ? plan.budget.wallMs + 30000 : 45000);
      child.stdout.on('data', (data: Buffer) => { outBytes += data.length; if (outBytes <= 1048576) out.push(Buffer.from(data)); else { complete = false; failure = 'BROKER_CONTROL_OUTPUT_LIMIT'; child.kill('SIGKILL'); } });
      child.stderr.on('data', (data: Buffer) => { errBytes += data.length; if (errBytes <= 65536) err.push(Buffer.from(data)); else { complete = false; failure = 'BROKER_DIAGNOSTIC_LIMIT'; child.kill('SIGKILL'); } });
      child.on('error', () => { failure = 'BROKER_SPAWN_FAILED'; });
      child.once('close', (code, killedSignal) => {
        clearTimeout(wall); clearTimeout(final); signal?.removeEventListener('abort', cancel);
        resolve({ startedAt, finishedAt: new Date().toISOString(), exitCode: Number.isInteger(code) ? code! >>> 0 : null,
          signal: killedSignal, stdout: Buffer.concat(out), stderr: Buffer.concat(err), outputComplete: complete, failure });
      });
    });
  }

  async inspect(plan: VerificationPlan, attempt: VerificationAttempt, recover = false): Promise<NativeInspection> {
    const transport = await this.broker(plan, attempt, recover ? '--verification-recover' : '--verification-inspect');
    const raw = transport.stdout, id = hash(raw), target = path.join(this.ownerRoot, 'inspections', id + '.json');
    try { await writeVerificationPrivate(target, raw); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readVerificationFile(target, 1048576)).equals(raw)) throw error; }
    const { stdout: _stdout, stderr: _stderr, ...facts } = transport;
    const transportRaw = json({ ...facts, stdoutSha256: id, stderrSha256: hash(transport.stderr), stderrBase64: transport.stderr.toString('base64') }) + '\n';
    const transportFile = path.join(this.ownerRoot, 'inspection-transports', attempt.attemptId + '-' + randomUUID().replace(/-/g,'') + '.json');
    try { await writeVerificationPrivate(transportFile, transportRaw); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readVerificationFile(transportFile, 1048576)).equals(Buffer.from(transportRaw))) throw error; }
    // Inspect has its own channel and validates the closed fixed-plan shape, including refusal of an active owner.
    requireFact(transport.exitCode === 0 && transport.signal === null && transport.outputComplete && transport.failure === null && transport.stderr.length === 0, 'NATIVE_INSPECTION_FAILED');
    const value = record(JSON.parse(raw.toString('utf8')), ['contract','utc','plan_id','attempt_id','config_sha256','events_sha256','root_created','profile_present','storage_present','job_absent','processes','processes_ended','cleanup_proved','recovery_requested','application_passed']);
    requireFact(value.contract === 'verification-native-inspection/v1' && value.plan_id === attempt.planId && value.attempt_id === attempt.attemptId && value.config_sha256 === attempt.nativeConfigSha256 &&
      value.recovery_requested === recover && value.application_passed === false && value.processes_ended === true && value.cleanup_proved === true && value.profile_present === false && value.storage_present === false &&
      Array.isArray(value.processes) && typeof value.root_created === 'boolean' && typeof value.job_absent === 'boolean' && typeof value.utc === 'string' &&
      Date.parse(value.utc) >= Date.parse(transport.startedAt) && Date.parse(value.utc) <= Date.parse(transport.finishedAt), 'NATIVE_INSPECTION_INVALID');
    requireFact(value.events_sha256 === null || typeof value.events_sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.events_sha256), 'INSPECTION_EVENTS_INVALID');
    return { sha256: id, cleanupProved: true, processesEnded: true, eventsSha256: value.events_sha256 as string | null };
  }

  async execute(plan: VerificationPlan, attempt: VerificationAttempt, signal?: AbortSignal): Promise<NativeExecutionFacts> {
    const transport = await this.broker(plan, attempt, '--verification-plan', signal);
    const controlRoot = path.join(this.ownerRoot, 'control', attempt.attemptId);
    await writeVerificationPrivate(path.join(controlRoot, 'launcher.stdout.bin'), transport.stdout);
    await writeVerificationPrivate(path.join(controlRoot, 'launcher.stderr.bin'), transport.stderr);
    const { stdout: _stdout, stderr: _stderr, ...transportFacts } = transport;
    await writeVerificationPrivate(path.join(controlRoot, 'launcher-result.json'), json({ ...transportFacts,
      stdoutSha256: hash(transport.stdout), stderrSha256: hash(transport.stderr) }) + '\n');
    const root = nativeRunRoot(this.ownerRoot, attempt);
    const result: NativeExecutionFacts = { processStarted: false, processResumed: false, exitCode: null, launcherExitCode: transport.exitCode,
      jobEnded: false, cleanupProved: false, outputComplete: false, stdoutSha256: hash(Buffer.alloc(0)), stderrSha256: hash(Buffer.alloc(0)),
      nativeReceiptSha256: null, nativeEventsSha256: null, inspectionSha256: null, outcome: 'interrupted', failure: transport.failure ?? 'NATIVE_EXECUTION_UNPROVED' };
    try {
      const stdout = await readVerificationFile(path.join(root, 'stdout.bin'), 1048576), stderr = await readVerificationFile(path.join(root, 'stderr.bin'), 1048576);
      result.stdoutSha256 = hash(stdout); result.stderrSha256 = hash(stderr);
      const raw = await readVerificationFile(path.join(root, 'receipt.json'), 65536), eventsRaw = await readVerificationFile(path.join(root, 'events.jsonl'), 16777216);
      result.nativeReceiptSha256 = hash(raw); result.nativeEventsSha256 = hash(eventsRaw);
      const native = record(JSON.parse(raw.toString('utf8')));
      const events = eventsRaw.toString('utf8').split('\n').filter(Boolean).map(line => record(JSON.parse(line), ['utc','name','data']));
      const named = (name: string) => events.filter(e => e.name === name).map(e => record(e.data));
      const one = (name: string) => { const rows = named(name); requireFact(rows.length === 1, 'NATIVE_EVENT_REQUIRED:' + name); return rows[0]!; };
      requireFact(native.schema === 'synthetic-lpac-startup/1' && native.root === root && native.moniker === 'specforge.regread.' + attempt.attemptId && native.profile_id === plan.profile && native.execution_kind === 'product_' + plan.command.kind && native.debug_observer === false, 'NATIVE_RECEIPT_IDENTITY_INVALID');
      requireFact(typeof native.process_started === 'boolean' && typeof native.process_resumed === 'boolean' && typeof native.job_all_ended === 'boolean' && (native.application_exit_code === null || Number.isSafeInteger(native.application_exit_code)), 'NATIVE_EXIT_INVALID');
      result.processStarted = native.process_started; result.processResumed = native.process_resumed; result.exitCode = native.application_exit_code as number | null; result.jobEnded = native.job_all_ended;
      result.outcome = result.processResumed ? 'failed' : 'not_executed';
      const output = one('product_output_status'); result.outputComplete = output.stdout_complete === true && output.stderr_complete === true && output.stdout_overflow === false && output.stderr_overflow === false;
      const bound = one('product_plan_bound'); requireFact(bound.plan_id === attempt.planId && bound.attempt_id === attempt.attemptId && bound.config_sha256 === attempt.nativeConfigSha256 && json(bound.argv) === json(plan.command.argv), 'NATIVE_PLAN_BINDING_INVALID');
      const inspection = await this.inspect(plan, attempt); result.inspectionSha256 = inspection.sha256; result.cleanupProved = inspection.cleanupProved;
      requireFact(inspection.eventsSha256 === result.nativeEventsSha256, 'NATIVE_EVENTS_DRIFT');
      const cancelled = named('owner_cancel').length > 0;
      if (cancelled) { result.outcome = 'cancelled'; result.failure = 'CANCELLED'; return result; }
      result.outcome = result.processResumed ? 'failed' : 'not_executed'; result.failure = 'NATIVE_EXECUTION_FAILED';
      requireFact(transport.exitCode === 0 && transport.signal === null && transport.outputComplete && transport.failure === null && native.inner_exit_code === 0 && native.application_exit_code === 0 && native.startup_result === 'D23_EXECUTION_OBSERVED' && native.isolation_acceptance === 'D23_PROFILE_ENFORCED' && native.error === null && native.timed_out === false && result.processStarted && result.processResumed && result.jobEnded && result.outputComplete, 'NATIVE_SUCCESS_UNPROVED');
      const tokens = named('actual_token'); requireFact(tokens.length === 2 && tokens.some(t => t.lpac_effective_check === false && t.all_application_packages === true) && tokens.some(t => t.lpac_effective_check === true && t.all_application_packages === false) && tokens.every(t => t.is_appcontainer === 1 && t.capability_count === 1 && t.capability_sid === native.capability_sid && t.sid === native.sid && t.package_read === true && t.everyone_only === false), 'NATIVE_LPAC_UNPROVED');
      const capability = one('experiment_capability_derived'); requireFact(capability.name === 'registryRead' && capability.count === 1 && capability.sid === native.capability_sid, 'NATIVE_CAPABILITY_UNPROVED');
      const limits = one('job_limits'); requireFact(limits.processes === 1 && limits.memory === plan.budget.memoryBytes && limits.breakaway === false && limits.flags === 8712, 'NATIVE_JOB_LIMITS_UNPROVED');
      const atomic = named('job_at_creation_observed'), policy = named('child_creation_policy_actual');
      requireFact(atomic.length === 2 && atomic.every(v => v.associated === true) && policy.length === 2 && policy.every(v => v.query_succeeded === true && v.flags === 1 && v.error === 0), 'NATIVE_CREATION_POLICY_UNPROVED');
      requireFact(one('single_input_identity_after').unchanged === true && one('single_storage_after').unchanged === true && one('profile_cleanup').hresult === 0 && one('profile_cleanup').profile_path_exists === false && named('job_empty').length === 1 && named('product_execution_observed').length === 1 && named('failure').length === 0, 'NATIVE_TERMINATION_UNPROVED');
      result.outcome = 'passed'; result.failure = null;
    } catch (error) {
      result.failure = error instanceof Error && /^VERIFICATION_[A-Z_]+/.test(error.message) ? error.message : 'NATIVE_RECEIPT_UNAVAILABLE_OR_INVALID';
      try { const inspection = await this.inspect(plan, attempt); result.inspectionSha256 = inspection.sha256; result.cleanupProved = inspection.cleanupProved; }
      catch { /* Explicit false/unknown remains; recovery is a separate authenticated action. */ }
      if (signal?.aborted || transport.exitCode === 130) { result.outcome = 'cancelled'; result.failure = 'CANCELLED'; }
    }
    return result;
  }
}

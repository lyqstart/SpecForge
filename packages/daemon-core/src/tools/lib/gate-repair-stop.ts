/** Durable repair budget. Immutable Gate evidence is authoritative, never a caller counter. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  SPEC_DIR_NAME,
  GATE_IDS,
  validateCurrentGateAttemptStartValue,
  validateCurrentGateAttemptResultValue,
  validateCurrentGateAttemptInputSnapshotValue,
  validateCurrentGateReportValue,
  GateRepairContextSchema,
} from '@specforge/types';
import { readHardStopResolutionLog } from './hard-stop-resolution-log';
import { getRequiredGates } from './required-gates';

export const GATE_REPAIR_STOP = 'GATE_REPAIR_STOP';
export const GATE_REPAIR_ACTION = 'gate_owner_repair_once';
const postCandidate = new Set([
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'formal_version_gate',
  'close_gate',
  'gate_summary_gate',
]);
export interface GateRepairStatus {
  blocked: boolean;
  failures: number;
  attemptId: string | null;
  completedAt: string | null;
  historySha256: string;
}
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const fail = (reason: string): never => {
  throw new Error(`GATE_REPAIR_HISTORY_INVALID: ${reason}`);
};

/** Synchronous so a final check and latch/log mutation cannot interleave in the daemon. */
export function readGateRepairStatus(projectRoot: string, workItemId: string): GateRepairStatus {
  try {
    return inspectGateRepairStatus(projectRoot, workItemId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GATE_REPAIR_HISTORY_INVALID:'))
      throw error;
    return fail(
      `evidence unavailable or invalid (${(error as NodeJS.ErrnoException).code ?? 'CONTRACT'})`
    );
  }
}

function inspectGateRepairStatus(projectRoot: string, workItemId: string): GateRepairStatus {
  const wi = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const root = path.join(wi, 'gate_attempts');
  const result: GateRepairStatus = {
    blocked: false,
    failures: 0,
    attemptId: null,
    completedAt: null,
    historySha256: sha(''),
  };
  if (!fs.existsSync(root)) return result;
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('unsafe history directory');
  let bytes = 0;
  const read = (file: string): Buffer => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024)
      fail('unsafe or oversized evidence');
    bytes += stat.size;
    if (bytes > 32 * 1024 * 1024) fail('history budget exceeded');
    return fs.readFileSync(file);
  };
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 9999) fail('sequence exhausted');
  const logFile = path.join(wi, 'hard_stop_resolution.jsonl');
  if (fs.existsSync(logFile)) read(logFile);
  const resolutions = readHardStopResolutionLog(wi);
  const history = createHash('sha256');
  let unresolvedExecutionError = false;
  for (const [index, entry] of entries.entries()) {
    const id = `attempt-${String(index + 1).padStart(4, '0')}`;
    if (entry.name !== id || !entry.isDirectory() || entry.isSymbolicLink())
      fail('non-contiguous sequence');
    const dir = path.join(root, id);
    const document = (name: string): unknown => {
      const raw = read(path.join(dir, name));
      history.update(`${id}/${name}:${sha(raw)}\n`);
      return JSON.parse(raw.toString('utf8')) as unknown;
    };
    const start = validateCurrentGateAttemptStartValue(document('attempt-start.json')).value;
    const end = validateCurrentGateAttemptResultValue(document('attempt-result.json')).value;
    if (
      !start ||
      !end ||
      start.work_item_id !== workItemId ||
      end.work_item_id !== workItemId ||
      start.attempt_id !== id ||
      end.attempt_id !== id
    )
      fail('identity');
    if (!start || !end) throw new Error('unreachable');
    if (
      start.started_at !== end.started_at ||
      JSON.stringify(start.requested_gate_ids) !== JSON.stringify(end.requested_gate_ids) ||
      Date.parse(end.completed_at) < Date.parse(start.started_at)
    )
      fail('transaction mismatch');
    if (new Set(end.current_report_gate_ids).size !== end.current_report_gate_ids.length)
      fail('duplicate report');
    const reports = end.current_report_gate_ids.map(gate => {
      const report = validateCurrentGateReportValue(document(`gates/${gate}.json`)).value;
      if (!report || report.work_item_id !== workItemId || report.gate_id !== gate)
        fail('report identity');
      return report!;
    });
    const candidate = start.requested_gate_ids.some(gate => !postCandidate.has(gate));
    const terminalError = 'execution_status' in end;
    if (!terminalError || fs.existsSync(path.join(dir, 'input-snapshot.json'))) {
      const snapshot = validateCurrentGateAttemptInputSnapshotValue(
        document('input-snapshot.json')
      ).value;
      if (!snapshot || snapshot.work_item_id !== workItemId || snapshot.attempt_id !== id)
        fail('snapshot identity');
    }
    if (!terminalError || fs.existsSync(path.join(dir, 'gate_summary.md'))) {
      const summary = read(path.join(dir, 'gate_summary.md'));
      history.update(`${id}/gate_summary.md:${sha(summary)}\n`);
    }
    const expected = new Set(start.requested_gate_ids);
    if (
      reports.some(report => report.gate_id === 'verification_gate' && report.status === 'passed')
    )
      expected.add('formal_version_gate');
    if (terminalError) {
      if (end.current_report_gate_ids.some(gate => !expected.has(gate)))
        fail('error report coverage');
    } else if (
      [...expected].sort().join() !== [...end.current_report_gate_ids].sort().join() ||
      [...end.summary_report_gate_ids].sort().join() !==
        [...end.current_report_gate_ids].sort().join()
    )
      fail('report coverage');
    const failed = reports.some(report => report.required && report.status === 'failed');
    if (!terminalError && failed !== (end.summary_status === 'failed'))
      fail('summary disagrees with reports');
    // New Attempts freeze the applicable gate set alongside their start evidence.
    // Legacy reset requires the conservative union, never today's mutable WI context.
    let full: string[] = GATE_IDS.filter(gate => !postCandidate.has(gate));
    if (fs.existsSync(path.join(dir, 'candidate-repair-context.json'))) {
      const context = GateRepairContextSchema.parse(document('candidate-repair-context.json'));
      if (context.work_item_id !== workItemId || context.attempt_id !== id)
        fail('repair context identity');
      full = getRequiredGates(
        context.workflow_path,
        'candidate',
        context.candidate_phase,
        context.workflow_type
      );
      if (JSON.stringify(full) !== JSON.stringify(context.required_candidate_gate_ids))
        fail('repair context gate set');
    }
    if (
      candidate &&
      (terminalError ||
        reports.some(
          report =>
            !postCandidate.has(report.gate_id) && report.required && report.status === 'failed'
        ))
    ) {
      result.failures += 1;
      unresolvedExecutionError ||= terminalError;
      result.attemptId = id;
      result.completedAt = end.completed_at;
    } else if (
      candidate &&
      !terminalError &&
      end.summary_status === 'passed' &&
      full.length > 0 &&
      full.every(gate =>
        reports.some(report => report.gate_id === gate && report.status === 'passed')
      )
    ) {
      result.failures = 0;
      unresolvedExecutionError = false;
      result.attemptId = null;
      result.completedAt = null;
    }
    result.historySha256 = history.copy().digest('hex');
    const grants = resolutions.filter(
      resolution =>
        resolution.original_hard_stop.policy_code === GATE_REPAIR_STOP &&
        resolution.original_hard_stop.blocked_target ===
          `${result.attemptId}:${result.historySha256}`
    );
    if (grants.length > 1) fail('duplicate diagnostic grant');
    if (grants.length === 1) {
      const grant = grants[0];
      const evidence = grant.evidence.filter(
        (item: any) => item?.source === 'gate-repair-diagnostic/v1'
      ) as Array<{
        source: string;
        historySha256: string;
        attemptId: string;
        userMessageId: string;
        userTextSha256: string;
        invocation: { tool: string; agent: string; source: string };
      }>;
      const proof = evidence[0];
      if (
        (result.failures < 2 && !unresolvedExecutionError) ||
        grant.resolution_type !== 'user_authorized_retry' ||
        !grant.user_decision_required ||
        grant.allowed_next_action !== GATE_REPAIR_ACTION ||
        grant.blocked_action_disposition !== 'retry_after_authorization' ||
        evidence.length !== 1 ||
        !proof ||
        proof.historySha256 !== result.historySha256 ||
        proof.attemptId !== result.attemptId ||
        !/^msg_[A-Za-z0-9]+$/.test(proof.userMessageId) ||
        proof.userTextSha256 !== sha(grant.user_response_quote ?? '') ||
        proof.invocation?.tool !== 'sf_hard_stop_resolve' ||
        proof.invocation.agent !== 'sf-orchestrator' ||
        proof.invocation.source !== 'runtime-tool-invocation/v1' ||
        !result.completedAt ||
        Date.parse(grant.resolved_at) < Date.parse(result.completedAt)
      )
        fail('unproved diagnostic grant');
      result.failures = 1;
      unresolvedExecutionError = false;
    }
  }
  result.blocked = result.failures >= 2 || unresolvedExecutionError;
  return result;
}

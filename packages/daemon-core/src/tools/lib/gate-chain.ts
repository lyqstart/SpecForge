/**
 * gate-chain.ts — Gate registry and chain execution.
 *
 * Architecture/Data/Module governance is layered onto the existing gates here
 * so the existing gate implementations remain reusable and migration-safe.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { GateIdV11, GateStrictness } from './gate-runner-v11.js';
import {
  runGate,
  __injectRegistry,
  makeReport,
  type GateReportV11,
  type GateContext,
  type GateCheckFn,
  type GateReportCheck,
} from './gate-report.js';
import { generateGateSummaryMd, type GateSummaryStatus } from './gate-summary.js';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceContracts,
  checkProjectGovernanceTrace,
  verifyProjectGovernanceAfterImplementation,
  type GovernanceCheckResult,
} from './project-governance-v2.js';
interface GateMeta {
  gateId: GateIdV11;
  gateType: GateStrictness;
  required: boolean;
  checkFn: GateCheckFn;
}
const gateRegistry = new Map<GateIdV11, GateMeta>();
__injectRegistry(id => gateRegistry.get(id as GateIdV11));
export function registerGate(gateId: GateIdV11, gateType: GateStrictness, required: boolean, checkFn: GateCheckFn): void {
  gateRegistry.set(gateId, { gateId, gateType, required, checkFn });
}
export function getRegisteredGateIds(): GateIdV11[] { return Array.from(gateRegistry.keys()); }
export function isRegisteredGate(gateId: string): gateId is GateIdV11 { return gateRegistry.has(gateId as GateIdV11); }
export function computeGateSummaryStatus(reports: GateReportV11[]): GateSummaryStatus {
  if (reports.some(report => report.status === 'failed' && report.required)) return 'failed';
  if (reports.some(report => (report as GateReportV11 & { waiver_required?: boolean }).waiver_required === true)) {
    return 'passed_with_waiver_required';
  }
  if (reports.every(report => report.status === 'passed' || report.status === 'skipped')) return 'passed';
  return 'blocked';
}
type GateAttemptContext = {
  attemptId: string;
  attemptPath: string;
  gatesPath: string;
  startedAt: string;
  requestedGateIds: GateIdV11[];
};

function gateAttemptsRoot(ctx: GateContext): string {
  return path.join(ctx.workItemDir, 'gate_attempts');
}

function gateAttemptId(sequence: number): string {
  return `attempt-${String(sequence).padStart(4, '0')}`;
}

async function writeExclusive(
  filePath: string,
  value: string | Uint8Array,
): Promise<void> {
  await fs.writeFile(filePath, value, { flag: 'wx' });
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  await writeExclusive(filePath, JSON.stringify(value, null, 2));
}

async function existingAttemptNumbers(ctx: GateContext): Promise<number[]> {
  const root = gateAttemptsRoot(ctx);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && /^attempt-\d{4}$/.test(entry.name))
      .map(entry => Number(entry.name.slice('attempt-'.length)))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function summaryStatusFromMarkdown(content: string): string {
  return content.match(/^Overall Status:\s*(\S+)\s*$/m)?.[1] ?? 'unknown';
}

async function snapshotLegacyLatest(ctx: GateContext): Promise<void> {
  if ((await existingAttemptNumbers(ctx)).length > 0) return;

  const canonicalGatesPath = path.join(ctx.workItemDir, 'gates');
  let gateNames: string[] = [];
  try {
    gateNames = (await fs.readdir(canonicalGatesPath))
      .filter(name => name.endsWith('.json'))
      .sort();
  } catch {
    gateNames = [];
  }

  const canonicalSummaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  let summary: string | null = null;
  try {
    summary = await fs.readFile(canonicalSummaryPath, 'utf-8');
  } catch {
    summary = null;
  }

  if (gateNames.length === 0 && summary === null) return;

  const root = gateAttemptsRoot(ctx);
  await fs.mkdir(root, { recursive: true });
  const attemptId = gateAttemptId(1);
  const attemptPath = path.join(root, attemptId);
  try {
    await fs.mkdir(attemptPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw error;
  }
  const gatesPath = path.join(attemptPath, 'gates');
  await fs.mkdir(gatesPath);

  const capturedAt = new Date().toISOString();
  await writeExclusiveJson(path.join(attemptPath, 'attempt-start.json'), {
    schema_version: '1.0',
    attempt_id: attemptId,
    work_item_id: ctx.workItemId,
    source: 'legacy_latest_snapshot',
    started_at: capturedAt,
    requested_gate_ids: [],
  });

  for (const name of gateNames) {
    const bytes = await fs.readFile(path.join(canonicalGatesPath, name));
    await writeExclusive(path.join(gatesPath, name), bytes);
  }
  if (summary !== null) {
    await writeExclusive(path.join(attemptPath, 'gate_summary.md'), summary);
  }
  await writeExclusiveJson(path.join(attemptPath, 'attempt-result.json'), {
    schema_version: '1.0',
    attempt_id: attemptId,
    work_item_id: ctx.workItemId,
    source: 'legacy_latest_snapshot',
    completed_at: capturedAt,
    summary_status: summary === null ? 'unknown' : summaryStatusFromMarkdown(summary),
    report_gate_ids: gateNames.map(name => name.replace(/\.json$/, '')),
  });
}

async function createGateAttempt(
  ctx: GateContext,
  requestedGateIds: GateIdV11[],
): Promise<GateAttemptContext> {
  await snapshotLegacyLatest(ctx);
  const root = gateAttemptsRoot(ctx);
  await fs.mkdir(root, { recursive: true });

  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const attemptId = gateAttemptId(sequence);
    const attemptPath = path.join(root, attemptId);
    try {
      await fs.mkdir(attemptPath);
      const gatesPath = path.join(attemptPath, 'gates');
      await fs.mkdir(gatesPath);
      const startedAt = new Date().toISOString();
      await writeExclusiveJson(path.join(attemptPath, 'attempt-start.json'), {
        schema_version: '1.0',
        attempt_id: attemptId,
        work_item_id: ctx.workItemId,
        source: 'gate_run',
        started_at: startedAt,
        requested_gate_ids: requestedGateIds,
      });
      return {
        attemptId,
        attemptPath,
        gatesPath,
        startedAt,
        requestedGateIds,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('GATE_ATTEMPT_SEQUENCE_EXHAUSTED');
}

async function writeGateReport(
  ctx: GateContext,
  report: GateReportV11,
  attempt: GateAttemptContext,
): Promise<void> {
  const gatesDir = path.join(ctx.workItemDir, 'gates');
  await fs.mkdir(gatesDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  await fs.writeFile(path.join(gatesDir, `${report.gate_id}.json`), serialized, 'utf-8');
  await writeExclusive(path.join(attempt.gatesPath, `${report.gate_id}.json`), serialized);
}
async function latestGateReports(
  ctx: GateContext,
  currentReports: GateReportV11[],
): Promise<GateReportV11[]> {
  const byId = new Map<string, GateReportV11>();
  const gatesDir = path.join(ctx.workItemDir, 'gates');
  try {
    for (const name of await fs.readdir(gatesDir)) {
      if (!name.endsWith('.json') || name === 'close_gate.json') continue;
      try {
        const report = JSON.parse(
          await fs.readFile(path.join(gatesDir, name), 'utf-8'),
        ) as GateReportV11;
        if (report?.gate_id) byId.set(report.gate_id, report);
      } catch {
        // Invalid Gate JSON remains the responsibility of its owning Gate.
      }
    }
  } catch {
    // The current run may be creating the first Gate reports.
  }
  for (const report of currentReports) byId.set(report.gate_id, report);
  return Array.from(byId.values()).sort((left, right) =>
    left.gate_id.localeCompare(right.gate_id),
  );
}
async function writeGateSummary(
  ctx: GateContext,
  reports: GateReportV11[],
): Promise<{
  summaryStatus: GateSummaryStatus;
  summaryPath: string;
  summaryContent: string;
  summaryReports: GateReportV11[];
}> {
  const summaryReports = await latestGateReports(ctx, reports);
  const summaryStatus = computeGateSummaryStatus(summaryReports);
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  const summaryContent = generateGateSummaryMd(
    ctx.workItemId,
    summaryReports,
    summaryStatus,
  );
  await fs.writeFile(summaryPath, summaryContent, 'utf-8');
  return { summaryStatus, summaryPath, summaryContent, summaryReports };
}

export type GateAttemptInputSnapshotEntry = {
  path: string;
  exists: boolean;
  kind: 'file' | 'directory' | 'other' | 'missing';
  sha256?: string;
  size?: number;
  mtime_ms?: number;
};

function resolveGateAttemptInputPath(projectRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(projectRoot, inputPath);
}

export async function buildGateAttemptInputSnapshot(
  projectRoot: string,
  reports: GateReportV11[],
): Promise<GateAttemptInputSnapshotEntry[]> {
  const inputPaths = Array.from(
    new Set(
      reports.flatMap(report =>
        Array.isArray(report.input_files)
          ? report.input_files.map(value => String(value ?? '').trim()).filter(Boolean)
          : [],
      ),
    ),
  ).sort();

  const snapshot: GateAttemptInputSnapshotEntry[] = [];
  for (const inputPath of inputPaths) {
    const resolvedInputPath = resolveGateAttemptInputPath(projectRoot, inputPath);
    try {
      const stats = await fs.stat(resolvedInputPath);
      if (stats.isFile()) {
        const bytes = await fs.readFile(resolvedInputPath);
        snapshot.push({
          path: inputPath,
          exists: true,
          kind: 'file',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          size: stats.size,
          mtime_ms: stats.mtimeMs,
        });
      } else if (stats.isDirectory()) {
        snapshot.push({
          path: inputPath,
          exists: true,
          kind: 'directory',
          mtime_ms: stats.mtimeMs,
        });
      } else {
        snapshot.push({
          path: inputPath,
          exists: true,
          kind: 'other',
          mtime_ms: stats.mtimeMs,
        });
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        snapshot.push({
          path: inputPath,
          exists: false,
          kind: 'missing',
        });
        continue;
      }
      throw new Error(
        `GATE_ATTEMPT_INPUT_SNAPSHOT_FAILED: ${inputPath}: ${error?.message ?? String(error)}`,
      );
    }
  }
  return snapshot;
}

// GATE_ATTEMPT_INPUT_SNAPSHOT_V29
async function finalizeGateAttempt(input: {
  ctx: GateContext;
  attempt: GateAttemptContext;
  reports: GateReportV11[];
  summaryStatus: GateSummaryStatus;
  summaryContent: string;
  summaryReports: GateReportV11[];
}): Promise<void> {
  const inputSnapshot = await buildGateAttemptInputSnapshot(input.ctx.projectRoot, input.summaryReports);
  await writeExclusiveJson(path.join(input.attempt.attemptPath, 'input-snapshot.json'), {
    schema_version: '1.0',
    attempt_id: input.attempt.attemptId,
    work_item_id: input.ctx.workItemId,
    captured_at: new Date().toISOString(),
    inputs: inputSnapshot,
  });
  await writeExclusive(
    path.join(input.attempt.attemptPath, 'gate_summary.md'),
    input.summaryContent,
  );
  await writeExclusiveJson(
    path.join(input.attempt.attemptPath, 'attempt-result.json'),
    {
      schema_version: '1.0',
      attempt_id: input.attempt.attemptId,
      work_item_id: input.ctx.workItemId,
      source: 'gate_run',
      started_at: input.attempt.startedAt,
      completed_at: new Date().toISOString(),
      requested_gate_ids: input.attempt.requestedGateIds,
      current_report_gate_ids: input.reports.map(report => report.gate_id),
      summary_report_gate_ids: input.summaryReports.map(report => report.gate_id),
      summary_status: input.summaryStatus,
      input_snapshot: 'input-snapshot.json',
    },
  );
}

async function failGateAttempt(
  ctx: GateContext,
  attempt: GateAttemptContext,
  reports: GateReportV11[],
  error: unknown,
): Promise<void> {
  try {
    await writeExclusiveJson(
      path.join(attempt.attemptPath, 'attempt-result.json'),
      {
        schema_version: '1.0',
        attempt_id: attempt.attemptId,
        work_item_id: ctx.workItemId,
        source: 'gate_run',
        started_at: attempt.startedAt,
        completed_at: new Date().toISOString(),
        requested_gate_ids: attempt.requestedGateIds,
        current_report_gate_ids: reports.map(report => report.gate_id),
        execution_status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    );
  } catch (writeError) {
    if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
  }
}
function combineWithGovernance(
  ctx: GateContext,
  gateId: GateIdV11,
  base: GateReportV11,
  governance: GovernanceCheckResult,
  options: { replaceBase?: boolean } = {},
): GateReportV11 {
  if (!governance.active && !options.replaceBase) return base;
  const baseChecks: GateReportCheck[] = options.replaceBase ? [] : base.checks;
  const checks: GateReportCheck[] = [...baseChecks, ...governance.checks];
  return makeReport(
    ctx.workItemId,
    gateId,
    base.gate_type,
    true,
    checks,
    Array.from(new Set([...base.input_files, ...governance.inputFiles])),
  );
}
async function applyGovernanceOverlay(gateId: GateIdV11, base: GateReportV11, ctx: GateContext): Promise<GateReportV11> {
  const input = { projectRoot: ctx.projectRoot, workItemDir: ctx.workItemDir, workItemId: ctx.workItemId };
  if (gateId === 'spec_consistency_gate') {
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceConsistency(input));
  }
  if (gateId === 'contract_integrity_gate') {
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceContracts(input));
  }
  if (gateId === 'trace_gate') {
    // Governance trace is semantic. Absence of a trace_delta is valid when no
    // formal relation changed, so the old existence/non-empty trace check is replaced.
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceTrace(input), { replaceBase: true });
  }
  if (gateId === 'verification_gate') {
    return combineWithGovernance(ctx, gateId, base, await verifyProjectGovernanceAfterImplementation(input));
  }
  if (gateId === 'close_gate') {
    // close-gate.ts owns workflow-specific Close applicability because the
    // formal sf_close_gate handler calls runCloseGate() directly.
    return base;
  }
  return base;
}
async function runAndWrite(
  gateId: GateIdV11,
  ctx: GateContext,
  attempt: GateAttemptContext,
): Promise<GateReportV11> {
  const base = await runGate(gateId, ctx);
  const report = await applyGovernanceOverlay(gateId, base, ctx);
  await writeGateReport(ctx, report, attempt);
  return report;
}
export async function runRequiredGates(
  gateIds: GateIdV11[],
  ctx: GateContext,
): Promise<{
  reports: GateReportV11[];
  summaryStatus: GateSummaryStatus;
  summaryPath: string;
  attemptId: string;
  attemptPath: string;
}> {
  const unknownGateIds = gateIds.filter(gateId => !gateRegistry.has(gateId));
  if (unknownGateIds.length > 0) {
    throw new Error(
      `UNKNOWN_GATE_ID: ${unknownGateIds.join(', ')}. Registered Gate IDs: ${getRegisteredGateIds()
        .sort()
        .join(', ')}`,
    );
  }

  const attempt = await createGateAttempt(ctx, gateIds);
  const wantsSummaryGate = gateIds.includes('gate_summary_gate');
  const wantsFormalVersionGate = gateIds.includes('formal_version_gate');
  const primaryGateIds = gateIds.filter(
    gateId => gateId !== 'gate_summary_gate' && gateId !== 'formal_version_gate',
  );
  const reports: GateReportV11[] = [];

  try {
    for (const gateId of primaryGateIds) {
      const report = await runAndWrite(gateId, ctx, attempt);
      reports.push(report);
      if (gateId === 'verification_gate' && report.status === 'passed') {
        const formal = await runAndWrite('formal_version_gate', ctx, attempt);
        reports.push(formal);
      }
    }

    if (
      wantsFormalVersionGate &&
      !reports.some(report => report.gate_id === 'formal_version_gate')
    ) {
      reports.push(await runAndWrite('formal_version_gate', ctx, attempt));
    }

    await writeGateSummary(ctx, reports);
    if (wantsSummaryGate) {
      const summaryReport = await runAndWrite('gate_summary_gate', ctx, attempt);
      reports.push(summaryReport);
    }

    const finalSummary = await writeGateSummary(ctx, reports);
    await finalizeGateAttempt({
      ctx,
      attempt,
      reports,
      summaryStatus: finalSummary.summaryStatus,
      summaryContent: finalSummary.summaryContent,
      summaryReports: finalSummary.summaryReports,
    });
    return {
      reports,
      summaryStatus: finalSummary.summaryStatus,
      summaryPath: finalSummary.summaryPath,
      attemptId: attempt.attemptId,
      attemptPath: attempt.attemptPath,
    };
  } catch (error) {
    await failGateAttempt(ctx, attempt, reports, error);
    throw error;
  }
}

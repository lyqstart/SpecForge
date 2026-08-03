/**
 * gate-chain.ts — Gate registry and chain execution.
 *
 * Architecture/Data/Module governance is layered onto the existing gates here
 * so the existing gate implementations remain reusable and migration-safe.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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
async function writeGateReport(ctx: GateContext, report: GateReportV11): Promise<void> {
  const gatesDir = path.join(ctx.workItemDir, 'gates');
  await fs.mkdir(gatesDir, { recursive: true });
  await fs.writeFile(path.join(gatesDir, `${report.gate_id}.json`), JSON.stringify(report, null, 2), 'utf-8');
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
async function writeGateSummary(ctx: GateContext, reports: GateReportV11[]): Promise<{ summaryStatus: GateSummaryStatus; summaryPath: string }> {
  const latestReports = await latestGateReports(ctx, reports);
  const summaryStatus = computeGateSummaryStatus(latestReports);
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  await fs.writeFile(
    summaryPath,
    generateGateSummaryMd(ctx.workItemId, latestReports, summaryStatus),
    'utf-8',
  );
  return { summaryStatus, summaryPath };
}
function combineWithGovernance(
  ctx: GateContext,
  gateId: GateIdV11,
  base: GateReportV11,
  governance: GovernanceCheckResult,
  options: { replaceBase?: boolean; forceHardWhenActive?: boolean } = {},
): GateReportV11 {
  if (!governance.active && !options.replaceBase) return base;
  const baseChecks: GateReportCheck[] = options.replaceBase ? [] : base.checks;
  const checks: GateReportCheck[] = [...baseChecks, ...governance.checks];
  const gateType: GateStrictness = governance.active && options.forceHardWhenActive !== false ? 'hard_gate' : base.gate_type;
  return makeReport(
    ctx.workItemId,
    gateId,
    gateType,
    true,
    checks,
    Array.from(new Set([...base.input_files, ...governance.inputFiles])),
  );
}
async function applyGovernanceOverlay(gateId: GateIdV11, base: GateReportV11, ctx: GateContext): Promise<GateReportV11> {
  const input = { projectRoot: ctx.projectRoot, workItemDir: ctx.workItemDir, workItemId: ctx.workItemId };
  if (gateId === 'spec_consistency_gate') {
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceConsistency(input), { forceHardWhenActive: true });
  }
  if (gateId === 'contract_integrity_gate') {
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceContracts(input), { forceHardWhenActive: true });
  }
  if (gateId === 'trace_gate') {
    // Governance trace is semantic. Absence of a trace_delta is valid when no
    // formal relation changed, so the old existence/non-empty trace check is replaced.
    return combineWithGovernance(ctx, gateId, base, await checkProjectGovernanceTrace(input), { replaceBase: true, forceHardWhenActive: true });
  }
  if (gateId === 'verification_gate') {
    return combineWithGovernance(ctx, gateId, base, await verifyProjectGovernanceAfterImplementation(input), { forceHardWhenActive: true });
  }
  if (gateId === 'close_gate') {
    // close-gate.ts owns workflow-specific Close applicability because the
    // formal sf_close_gate handler calls runCloseGate() directly.
    return base;
  }
  return base;
}
async function runAndWrite(gateId: GateIdV11, ctx: GateContext): Promise<GateReportV11> {
  const base = await runGate(gateId, ctx);
  const report = await applyGovernanceOverlay(gateId, base, ctx);
  await writeGateReport(ctx, report);
  return report;
}
export async function runRequiredGates(
  gateIds: GateIdV11[],
  ctx: GateContext,
): Promise<{ reports: GateReportV11[]; summaryStatus: GateSummaryStatus; summaryPath: string }> {
  const unknownGateIds = gateIds.filter(gateId => !gateRegistry.has(gateId));
  if (unknownGateIds.length > 0) {
    throw new Error(`UNKNOWN_GATE_ID: ${unknownGateIds.join(', ')}. Registered Gate IDs: ${getRegisteredGateIds().sort().join(', ')}`);
  }
  const wantsSummaryGate = gateIds.includes('gate_summary_gate');
  const wantsFormalVersionGate = gateIds.includes('formal_version_gate');
  const primaryGateIds = gateIds.filter(
    gateId => gateId !== 'gate_summary_gate' && gateId !== 'formal_version_gate'
  );
  const reports: GateReportV11[] = [];

  for (const gateId of primaryGateIds) {
    const report = await runAndWrite(gateId, ctx);
    reports.push(report);
    // Formal Version is a first-class Gate, but Verification owns its normal
    // sequencing so callers do not have to create a second workflow branch.
    if (gateId === 'verification_gate' && report.status === 'passed') {
      const formal = await runAndWrite('formal_version_gate', ctx);
      reports.push(formal);
    }
  }
  if (
    wantsFormalVersionGate &&
    !reports.some(report => report.gate_id === 'formal_version_gate')
  ) {
    reports.push(await runAndWrite('formal_version_gate', ctx));
  }
  await writeGateSummary(ctx, reports);
  if (wantsSummaryGate) {
    const summaryReport = await runAndWrite('gate_summary_gate', ctx);
    reports.push(summaryReport);
  }
  const finalSummary = await writeGateSummary(ctx, reports);
  return { reports, summaryStatus: finalSummary.summaryStatus, summaryPath: finalSummary.summaryPath };
}

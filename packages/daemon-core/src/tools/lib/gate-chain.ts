/**
 * gate-chain.ts — Gate registry and chain execution.
 *
 * V8.1 gate_summary_gate scheduling fix:
 * - gate_summary_gate checks gate_summary.md.
 * - gate_summary.md is produced by runRequiredGates().
 * - Therefore gate_summary_gate cannot be executed before the summary exists.
 *
 * The chain now runs all non-summary gates first, writes an initial summary,
 * runs gate_summary_gate against that initial summary, writes its report,
 * then writes the final summary including gate_summary_gate.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GateIdV11, GateStrictness } from './gate-runner-v11.js';
import {
  runGate,
  __injectRegistry,
  type GateReportV11,
  type GateContext,
  type GateCheckFn,
} from './gate-report.js';
import { generateGateSummaryMd, type GateSummaryStatus } from './gate-summary.js';

interface GateMeta {
  gateId: GateIdV11;
  gateType: GateStrictness;
  required: boolean;
  checkFn: GateCheckFn;
}

const gateRegistry = new Map<GateIdV11, GateMeta>();

// Inject registry accessor into gate-report.ts (late-binding to avoid circular dep)
__injectRegistry((id) => gateRegistry.get(id as GateIdV11));

export function registerGate(
  gateId: GateIdV11,
  gateType: GateStrictness,
  required: boolean,
  checkFn: GateCheckFn,
): void {
  gateRegistry.set(gateId, { gateId, gateType, required, checkFn });
}

export function getRegisteredGateIds(): GateIdV11[] {
  return Array.from(gateRegistry.keys());
}

export function isRegisteredGate(gateId: string): gateId is GateIdV11 {
  return gateRegistry.has(gateId as GateIdV11);
}

function computeSummaryStatus(reports: GateReportV11[]): GateSummaryStatus {
  const hasFailed = reports.some((r) => r.status === 'failed' && r.required);
  const hasWarnings = reports.some(
    (r) => (r.status === 'failed' && !r.required) || r.warnings.length > 0,
  );
  const allPassed = reports.every((r) => r.status === 'passed' || r.status === 'skipped');

  if (hasFailed) return 'failed';
  if (hasWarnings) return 'passed_with_waiver_required';
  if (allPassed) return 'passed';
  return 'blocked';
}

async function writeGateReport(ctx: GateContext, report: GateReportV11): Promise<void> {
  const gatesDir = path.join(ctx.workItemDir, 'gates');
  await fs.mkdir(gatesDir, { recursive: true });
  await fs.writeFile(
    path.join(gatesDir, `${report.gate_id}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}

async function writeGateSummary(
  ctx: GateContext,
  reports: GateReportV11[],
): Promise<{ summaryStatus: GateSummaryStatus; summaryPath: string }> {
  const summaryStatus = computeSummaryStatus(reports);
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  const summaryContent = generateGateSummaryMd(ctx.workItemId, reports, summaryStatus);
  await fs.writeFile(summaryPath, summaryContent, 'utf-8');
  return { summaryStatus, summaryPath };
}

/**
 * 运行指定 Gate 链，生成 Gate Reports 和 Gate Summary（§9.4-§9.5）。
 *
 * V8.1 rule:
 * gate_summary_gate is a meta gate over the generated summary.
 * If requested, it is intentionally run after the first summary has been written.
 */
export async function runRequiredGates(
  gateIds: GateIdV11[],
  ctx: GateContext,
): Promise<{ reports: GateReportV11[]; summaryStatus: GateSummaryStatus; summaryPath: string }> {
  const unknownGateIds = gateIds.filter((gateId) => !gateRegistry.has(gateId));
  if (unknownGateIds.length > 0) {
    throw new Error(
      `UNKNOWN_GATE_ID: ${unknownGateIds.join(', ')}. Registered Gate IDs: ${getRegisteredGateIds()
        .sort()
        .join(', ')}`,
    );
  }

  const wantsSummaryGate = gateIds.includes('gate_summary_gate');
  const primaryGateIds = gateIds.filter((gateId) => gateId !== 'gate_summary_gate');

  const reports: GateReportV11[] = [];

  for (const gateId of primaryGateIds) {
    const report = await runGate(gateId, ctx);
    reports.push(report);
    await writeGateReport(ctx, report);
  }

  // Write a summary before gate_summary_gate runs, because that gate validates
  // gate_summary.md itself. This prevents first-run self-reference failure.
  await writeGateSummary(ctx, reports);

  if (wantsSummaryGate) {
    const summaryReport = await runGate('gate_summary_gate', ctx);
    reports.push(summaryReport);
    await writeGateReport(ctx, summaryReport);
  }

  const finalSummary = await writeGateSummary(ctx, reports);
  return {
    reports,
    summaryStatus: finalSummary.summaryStatus,
    summaryPath: finalSummary.summaryPath,
  };
}

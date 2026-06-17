/**
 * gate-chain.ts — Gate registry and chain execution.
 *
 * Patch A:
 * - Unknown gate IDs fail-closed before any report is written.
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

/**
 * 运行指定 workflow_path 的所有必需 Gate，生成 Gate Reports 和 Gate Summary（§9.4-§9.5）。
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

  const reports: GateReportV11[] = [];

  for (const gateId of gateIds) {
    const report = await runGate(gateId, ctx);
    reports.push(report);

    const gatesDir = path.join(ctx.workItemDir, 'gates');
    await fs.mkdir(gatesDir, { recursive: true });
    await fs.writeFile(
      path.join(gatesDir, `${gateId}.json`),
      JSON.stringify(report, null, 2),
      'utf-8',
    );
  }

  const hasFailed = reports.some((r) => r.status === 'failed' && r.required);
  const hasWarnings = reports.some((r) => (r.status === 'failed' && !r.required) || r.warnings.length > 0);
  const allPassed = reports.every((r) => r.status === 'passed' || r.status === 'skipped');

  let summaryStatus: GateSummaryStatus;
  if (hasFailed) {
    summaryStatus = 'failed';
  } else if (hasWarnings) {
    summaryStatus = 'passed_with_waiver_required';
  } else if (allPassed) {
    summaryStatus = 'passed';
  } else {
    summaryStatus = 'blocked';
  }

  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  const summaryContent = generateGateSummaryMd(ctx.workItemId, reports, summaryStatus);
  await fs.writeFile(summaryPath, summaryContent, 'utf-8');

  return { reports, summaryStatus, summaryPath };
}

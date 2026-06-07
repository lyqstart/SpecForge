/**
 * gate-chain.ts — Gate registry and chain execution
 *
 * Extracted from gate-runner-v11.ts (TASK-3).
 *
 * Imports: gate-report, gate-summary.
 * Consumers: gate-runner-v11.ts (re-export).
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

// ---------------------------------------------------------------------------
// Gate Registry
// ---------------------------------------------------------------------------

/**
 * 每个 Gate 的元数据。
 */
interface GateMeta {
  gateId: GateIdV11;
  gateType: GateStrictness;
  required: boolean;
  checkFn: GateCheckFn;
}

const gateRegistry = new Map<GateIdV11, GateMeta>();

// Inject registry accessor into gate-report.ts (late-binding to avoid circular dep)
__injectRegistry((id) => gateRegistry.get(id));

/**
 * 注册一个 Gate 检查函数。
 */
export function registerGate(
  gateId: GateIdV11,
  gateType: GateStrictness,
  required: boolean,
  checkFn: GateCheckFn,
): void {
  gateRegistry.set(gateId, { gateId, gateType, required, checkFn });
}

/**
 * 运行指定 workflow_path 的所有必需 Gate，生成 Gate Reports 和 Gate Summary（§9.4-§9.5）。
 */
export async function runRequiredGates(
  gateIds: GateIdV11[],
  ctx: GateContext,
): Promise<{ reports: GateReportV11[]; summaryStatus: GateSummaryStatus; summaryPath: string }> {
  const reports: GateReportV11[] = [];

  for (const gateId of gateIds) {
    const report = await runGate(gateId, ctx);
    reports.push(report);

    // 写 Gate Report 文件
    const gatesDir = path.join(ctx.workItemDir, 'gates');
    await fs.mkdir(gatesDir, { recursive: true });
    await fs.writeFile(
      path.join(gatesDir, `${gateId}.json`),
      JSON.stringify(report, null, 2),
      'utf-8',
    );
  }

  // 计算 Gate Summary
  const hasFailed = reports.some(r => r.status === 'failed' && r.required);
  const hasWarnings = reports.some(r => r.status === 'failed' && !r.required || r.warnings.length > 0);
  const allPassed = reports.every(r => r.status === 'passed' || r.status === 'skipped');

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

  // 生成 Gate Summary（§9.5）
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  const summaryContent = generateGateSummaryMd(ctx.workItemId, reports, summaryStatus);
  await fs.writeFile(summaryPath, summaryContent, 'utf-8');

  return { reports, summaryStatus, summaryPath };
}

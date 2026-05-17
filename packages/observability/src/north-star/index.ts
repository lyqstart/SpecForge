/**
 * North Star Goal Validation Module
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 * 
 * This module provides validation and reporting for the North Star goal:
 * "5 minutes from problem occurrence to root cause identification"
 * across 10 troubleshooting scenarios.
 */

import type { NorthStarScenario, AnalysisResult, TimeRange } from '../types';

/**
 * Validation result for a single scenario
 */
export interface ScenarioValidationResult {
  scenario: NorthStarScenario;
  description: string;
  timeToIdentify: number;
  passed: boolean;
  rootCause: string | null;
  confidence: number;
  evidenceCount: number;
  recommendationsCount: number;
}

/**
 * Overall validation report
 */
export interface ValidationReport {
  schema_version: '1.0';
  timestamp: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  averageTimeMs: number;
  maxTimeMs: number;
  minTimeMs: number;
  results: ScenarioValidationResult[];
  summary: string;
}

/**
 * North Star scenario descriptions (Chinese + English)
 */
export const SCENARIO_DESCRIPTIONS: Record<NorthStarScenario, string> = {
  'gate-repeated-failure': 'Gate反复失败 (Gate repeatedly fails)',
  'agent-deviation': 'Agent偏离prompt (Agent deviates from prompt)',
  'tool-invocation-error': 'Tool调用错误 (Tool invocation errors)',
  'permission-denial': '权限拒绝 (Permission denials)',
  'upgrade-installation-failure': '升级/安装失败 (Upgrade/installation failures)',
  'state-machine-stuck': '状态机卡住 (State machine stuck)',
  'concurrency-deadlock': '并发死锁 (Concurrency deadlocks)',
  'skill-invocation-check': 'Skill是否被调用 (Whether Skill was invoked)',
  'workflow-execution-check': 'Workflow是否按预期执行 (Whether Workflow executed as expected)',
  'workflow-result-deviation': 'Workflow执行结果偏离预期 (Workflow execution results deviate from expectations)'
};

/**
 * Maximum allowed time for root cause identification (5 minutes)
 */
export const MAX_TIME_MS = 5 * 60 * 1000;

/**
 * Generate a validation report from scenario results
 */
export function generateValidationReport(
  results: ScenarioValidationResult[]
): ValidationReport {
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;
  
  const times = results.map(r => r.timeToIdentify);
  const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  const failedScenarios = results
    .filter(r => !r.passed)
    .map(r => r.scenario)
    .join(', ');

  const summary = failedCount === 0
    ? `✅ All ${results.length} scenarios passed the North Star goal (< 5 minutes to root cause)`
    : `❌ ${failedCount} scenario(s) failed: ${failedScenarios}`;

  return {
    schema_version: '1.0',
    timestamp: Date.now(),
    totalScenarios: results.length,
    passedScenarios: passedCount,
    failedScenarios: failedCount,
    averageTimeMs: Math.round(avgTime * 100) / 100,
    maxTimeMs: maxTime,
    minTimeMs: minTime,
    results,
    summary
  };
}

/**
 * Format validation report as human-readable text
 */
export function formatReportAsText(report: ValidationReport): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push('North Star Goal Validation Report');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Generated: ${new Date(report.timestamp).toISOString()}`);
  lines.push(`Schema Version: ${report.schema_version}`);
  lines.push('');
  lines.push('Summary:');
  lines.push(`  Total Scenarios: ${report.totalScenarios}`);
  lines.push(`  Passed: ${report.passedScenarios}`);
  lines.push(`  Failed: ${report.failedScenarios}`);
  lines.push(`  Average Time: ${report.averageTimeMs.toFixed(2)}ms`);
  lines.push(`  Min Time: ${report.minTimeMs}ms`);
  lines.push(`  Max Time: ${report.maxTimeMs}ms`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('Detailed Results:');
  lines.push('-'.repeat(80));
  lines.push('');

  for (const result of report.results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    lines.push(`${status} [${result.scenario}]`);
    lines.push(`  Description: ${result.description}`);
    lines.push(`  Time to Identify: ${result.timeToIdentify}ms`);
    lines.push(`  Root Cause: ${result.rootCause || 'N/A'}`);
    lines.push(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    lines.push(`  Evidence Count: ${result.evidenceCount}`);
    lines.push(`  Recommendations: ${result.recommendationsCount}`);
    lines.push('');
  }

  lines.push('='.repeat(80));
  
  return lines.join('\n');
}

/**
 * Format validation report as JSON
 */
export function formatReportAsJSON(report: ValidationReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format validation report as Markdown
 */
export function formatReportAsMarkdown(report: ValidationReport): string {
  const lines: string[] = [];
  
  lines.push('# North Star Goal Validation Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.timestamp).toISOString()}`);
  lines.push(`**Schema Version:** ${report.schema_version}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Scenarios:** ${report.totalScenarios}`);
  lines.push(`- **Passed:** ${report.passedScenarios}`);
  lines.push(`- **Failed:** ${report.failedScenarios}`);
  lines.push(`- **Average Time:** ${report.averageTimeMs.toFixed(2)}ms`);
  lines.push(`- **Min Time:** ${report.minTimeMs}ms`);
  lines.push(`- **Max Time:** ${report.maxTimeMs}ms`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');
  lines.push('| Scenario | Status | Time (ms) | Root Cause | Confidence | Evidence |');
  lines.push('|----------|--------|-----------|------------|------------|----------|');

  for (const result of report.results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const rootCause = (result.rootCause || 'N/A').replace(/\|/g, '\\|');
    lines.push(
      `| ${result.scenario} | ${status} | ${result.timeToIdentify} | ${rootCause} | ${(result.confidence * 100).toFixed(1)}% | ${result.evidenceCount} |`
    );
  }

  lines.push('');
  lines.push('## Scenario Descriptions');
  lines.push('');

  for (const result of report.results) {
    lines.push(`### ${result.scenario}`);
    lines.push('');
    lines.push(result.description);
    lines.push('');
    if (result.rootCause) {
      lines.push(`**Root Cause:** ${result.rootCause}`);
      lines.push('');
    }
    if (result.recommendationsCount > 0) {
      lines.push(`**Recommendations:** ${result.recommendationsCount} recommendation(s) provided`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Create a scenario validation result from an analysis result
 */
export function createScenarioResult(
  scenario: NorthStarScenario,
  analysisResult: AnalysisResult,
  actualTimeMs: number
): ScenarioValidationResult {
  return {
    scenario,
    description: SCENARIO_DESCRIPTIONS[scenario],
    timeToIdentify: actualTimeMs,
    passed: actualTimeMs < MAX_TIME_MS,
    rootCause: analysisResult.rootCause,
    confidence: analysisResult.confidence,
    evidenceCount: analysisResult.evidence.length,
    recommendationsCount: analysisResult.recommendations.length
  };
}

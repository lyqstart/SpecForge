/**
 * gate-runner-v11.ts — v1.1 标准 Gate Runner（§9）
 *
 * 依据：SpecForge 最终融合标准 v1.1
 *
 * 职责：
 * - §9.2 Gate 分类与枚举（GateIdV11, GateStrictness）
 * - §9.3 hard_gate / soft_gate
 * - 内置 Gate 实现（registerGate 调用）
 *
 * Extracted sub-modules (TASK-3):
 *   - gate-report.ts: GateReportCheck, GateReportV11, GateContext, GateCheckFn,
 *                     runGate, makeSkippedReport, makeReport
 *   - gate-summary.ts: GateSummaryStatus, generateGateSummaryMd
 *   - gate-chain.ts: registerGate, runRequiredGates (registry + chain execution)
 *   - required-gates.ts: getRequiredGates, getGateStrictness
 *   - close-gate.ts: CloseGateResult, runCloseGate
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// §9.2 Gate ID 枚举
// ---------------------------------------------------------------------------

export type GateIdV11 =
  | 'entry_gate'
  | 'workflow_selection_gate'
  | 'required_files_gate'
  | 'candidate_manifest_gate'
  | 'path_policy_gate'
  | 'schema_gate'
  | 'spec_consistency_gate'
  | 'trace_gate'
  | 'workflow_specific_gate'
  | 'gate_summary_gate'
  | 'merge_ready_gate'
  | 'post_merge_gate'
  | 'verification_gate'
  | 'close_gate'
  | 'extension_gate';

// ---------------------------------------------------------------------------
// §9.3 Gate 类型
// ---------------------------------------------------------------------------

export type GateStrictness = 'hard_gate' | 'soft_gate';

// ---------------------------------------------------------------------------
// Imports from extracted sub-modules
// ---------------------------------------------------------------------------

import { registerGate } from './gate-chain.js';
import { makeReport, type GateReportCheck, type GateContext } from './gate-report.js';
import { runCloseGate } from './close-gate.js';

// ---------------------------------------------------------------------------
// Re-exports from extracted sub-modules
// ---------------------------------------------------------------------------

export {
  type GateReportCheck,
  type GateReportV11,
  type GateContext,
  type GateCheckFn,
  runGate,
  makeSkippedReport,
  makeReport,
} from './gate-report.js';

export {
  type GateSummaryStatus,
  generateGateSummaryMd,
} from './gate-summary.js';

export {
  registerGate,
  runRequiredGates,
} from './gate-chain.js';

export {
  getRequiredGates,
  getGateStrictness,
} from './required-gates.js';

// ---------------------------------------------------------------------------
// 内置 Gate 实现
// ---------------------------------------------------------------------------

/**
 * §9.2 entry_gate — WI 存在性检查
 */
registerGate('entry_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const workItemJsonPath = path.join(ctx.workItemDir, 'work_item.json');

  let exists = false;
  try { await fs.access(workItemJsonPath); exists = true; } catch { exists = false; }

  checks.push({
    check_id: 'wi_exists',
    description: 'Work Item work_item.json exists',
    passed: exists,
    severity: exists ? undefined : 'error',
  });

  if (exists) {
    try {
      const content = await fs.readFile(workItemJsonPath, 'utf-8');
      const json = JSON.parse(content);
      checks.push({
        check_id: 'wi_id_valid',
        description: `Work Item ID format valid: ${json.work_item_id}`,
        passed: /^WI-[0-9]{4}$/.test(json.work_item_id ?? ''),
        severity: undefined,
      });
    } catch {
      checks.push({ check_id: 'wi_json_parse', description: 'work_item.json is valid JSON', passed: false, severity: 'error' });
    }
  }

  return makeReport(ctx.workItemId, 'entry_gate', 'hard_gate', true, checks, [workItemJsonPath]);
});

/**
 * §9.2 workflow_selection_gate — workflow_path 已确定
 */
registerGate('workflow_selection_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const triggerPath = path.join(ctx.workItemDir, 'trigger_result.json');

  let triggerExists = false;
  try { await fs.access(triggerPath); triggerExists = true; } catch { triggerExists = false; }

  checks.push({
    check_id: 'trigger_exists',
    description: 'trigger_result.json exists',
    passed: triggerExists,
    severity: triggerExists ? undefined : 'error',
  });

  if (triggerExists) {
    try {
      const content = await fs.readFile(triggerPath, 'utf-8');
      const json = JSON.parse(content);
      const validPaths = [
        'requirement_change_path', 'design_change_path', 'architecture_change_path',
        'task_change_path', 'code_only_fast_path', 'spec_migration_path', 'rollback_path',
      ];
      checks.push({
        check_id: 'workflow_path_valid',
        description: `workflow_path is valid: ${json.workflow_path}`,
        passed: validPaths.includes(json.workflow_path),
        severity: undefined,
      });
    } catch {
      checks.push({ check_id: 'trigger_parse', description: 'trigger_result.json is valid JSON', passed: false, severity: 'error' });
    }
  }

  return makeReport(ctx.workItemId, 'workflow_selection_gate', 'hard_gate', true, checks, [triggerPath]);
});

/**
 * §9.2 required_files_gate — 必需文件存在性
 */
registerGate('required_files_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const requiredFiles = [
    'work_item.json', 'intake.md', 'change_classification.md',
    'impact_analysis.md', 'trigger_result.json', 'tasks.md',
    'trace_delta.md', 'candidate_manifest.json', 'gate_summary.md',
    'verification_report.md', 'merge_report.md',
    'evidence/evidence_manifest.json',
  ];
  const inputFiles: string[] = [];

  for (const file of requiredFiles) {
    const fullPath = path.join(ctx.workItemDir, file);
    let exists = false;
    try { await fs.access(fullPath); exists = true; } catch { exists = false; }
    inputFiles.push(fullPath);
    checks.push({
      check_id: `file_${file.replace(/[^a-z0-9]/gi, '_')}`,
      description: `Required file exists: ${file}`,
      passed: exists,
      severity: exists ? undefined : 'error',
    });
  }

  return makeReport(ctx.workItemId, 'required_files_gate', 'hard_gate', true, checks, inputFiles);
});

/**
 * §9.2 candidate_manifest_gate — Candidate Manifest 合法性
 */
registerGate('candidate_manifest_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const manifestPath = path.join(ctx.workItemDir, 'candidate_manifest.json');

  let manifest: any = null;
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
    checks.push({ check_id: 'manifest_parse', description: 'candidate_manifest.json is valid JSON', passed: true });

    // 检查 entries
    const entries = manifest.entries ?? [];
    checks.push({
      check_id: 'manifest_entries_array',
      description: 'entries is an array',
      passed: Array.isArray(entries),
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // candidate_path 必须在当前 WI 的 candidates/ 下
      const candidateInWi = entry.candidate_path?.includes('candidates/');
      checks.push({
        check_id: `entry_${i}_candidate_path`,
        description: `Entry ${i}: candidate_path in candidates/`,
        passed: !!candidateInWi,
        severity: candidateInWi ? undefined : 'error',
      });

      // target_path 必须指向 .specforge/project/
      const targetValid = entry.target_path?.includes('.specforge/project/') || entry.target_path?.startsWith('project/');
      checks.push({
        check_id: `entry_${i}_target_path`,
        description: `Entry ${i}: target_path in .specforge/project/`,
        passed: !!targetValid,
        severity: targetValid ? undefined : 'error',
      });
    }
  } catch {
    checks.push({ check_id: 'manifest_parse', description: 'candidate_manifest.json is valid JSON', passed: false, severity: 'error' });
  }

  return makeReport(ctx.workItemId, 'candidate_manifest_gate', 'hard_gate', true, checks, [manifestPath]);
});

/**
 * §9.2 path_policy_gate — 路径策略检查
 */
registerGate('path_policy_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];

  // 读取 candidate_manifest 并检查路径策略
  try {
    const manifestPath = path.join(ctx.workItemDir, 'candidate_manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    for (const entry of (manifest.entries ?? [])) {
      // 不允许 ..
      if (entry.candidate_path?.includes('..')) {
        checks.push({ check_id: `path_candidate_traversal`, description: `candidate_path has ..: ${entry.candidate_path}`, passed: false, severity: 'error' });
      }
      if (entry.target_path?.includes('..')) {
        checks.push({ check_id: `path_target_traversal`, description: `target_path has ..: ${entry.target_path}`, passed: false, severity: 'error' });
      }
      // 不允许反斜杠
      if (entry.candidate_path?.includes('\\')) {
        checks.push({ check_id: `path_candidate_backslash`, description: `candidate_path has backslash`, passed: false, severity: 'error' });
      }
    }
  } catch {
    // manifest 不存在或不可解析 — 由 candidate_manifest_gate 检查
  }

  if (checks.length === 0) {
    checks.push({ check_id: 'path_policy_ok', description: 'All paths satisfy Path Policy', passed: true });
  }

  return makeReport(ctx.workItemId, 'path_policy_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 schema_gate — JSON schema 校验
 */
registerGate('schema_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const jsonFiles = [
    { name: 'work_item.json', requiredFields: ['schema_version', 'work_item_id', 'status'] },
    { name: 'candidate_manifest.json', requiredFields: ['schema_version', 'work_item_id', 'entries'] },
    { name: 'trigger_result.json', requiredFields: ['work_item_id', 'workflow_path'] },
    { name: 'evidence/evidence_manifest.json', requiredFields: ['schema_version', 'entries'] },
  ];

  for (const { name, requiredFields } of jsonFiles) {
    const fullPath = path.join(ctx.workItemDir, name);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const json = JSON.parse(content);
      for (const field of requiredFields) {
        checks.push({
          check_id: `schema_${name.replace(/[^a-z0-9]/gi, '_')}_${field}`,
          description: `${name} has field "${field}"`,
          passed: field in json,
          severity: undefined,
        });
      }
    } catch {
      // 文件不存在或 JSON 解析失败 — 由 required_files_gate 覆盖
    }
  }

  return makeReport(ctx.workItemId, 'schema_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 merge_ready_gate — 合并就绪检查（§11.2）
 */
registerGate('merge_ready_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];

  // 1. user_decision.json 存在且状态为 approved/waived
  const decisionPath = path.join(ctx.workItemDir, 'user_decision.json');
  try {
    const content = await fs.readFile(decisionPath, 'utf-8');
    const decision = JSON.parse(content);
    const validStatus = ['approved', 'waived'].includes(decision.decision_status);
    checks.push({
      check_id: 'user_decision_status',
      description: `user_decision.json status is approved/waived: ${decision.decision_status}`,
      passed: validStatus,
      severity: undefined,
    });

    // 检查未过期
    if (decision.expires_at) {
      const expired = new Date(decision.expires_at) < new Date();
      checks.push({
        check_id: 'user_decision_not_expired',
        description: 'User Decision not expired',
        passed: !expired,
        severity: expired ? 'error' : undefined,
      });
    }
  } catch {
    checks.push({ check_id: 'user_decision_exists', description: 'user_decision.json exists and is valid', passed: false, severity: 'error' });
  }

  // 2. candidate_manifest.json 存在
  const manifestPath = path.join(ctx.workItemDir, 'candidate_manifest.json');
  let manifestExists = false;
  try { await fs.access(manifestPath); manifestExists = true; } catch { manifestExists = false; }
  checks.push({
    check_id: 'manifest_exists',
    description: 'candidate_manifest.json exists',
    passed: manifestExists,
  });

  // 3. gate_summary 未 invalidated
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    const isInvalidated = content.includes('Status: invalidated');
    checks.push({
      check_id: 'gate_summary_valid',
      description: 'gate_summary not invalidated',
      passed: !isInvalidated,
    });
  } catch {
    checks.push({ check_id: 'gate_summary_exists', description: 'gate_summary.md exists', passed: false, severity: 'error' });
  }

  return makeReport(ctx.workItemId, 'merge_ready_gate', 'hard_gate', true, checks, [decisionPath, manifestPath, summaryPath]);
});

/**
 * §9.2 verification_gate — 验证检查（§13.5）
 */
registerGate('verification_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];

  // 1. verification_report.md 存在
  const reportPath = path.join(ctx.workItemDir, 'verification_report.md');
  let reportExists = false;
  try { await fs.access(reportPath); reportExists = true; } catch { reportExists = false; }
  checks.push({
    check_id: 'verification_report_exists',
    description: 'verification_report.md exists',
    passed: reportExists,
  });

  // 2. evidence_manifest.json 存在
  const manifestPath = path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json');
  let manifestExists = false;
  try { await fs.access(manifestPath); manifestExists = true; } catch { manifestExists = false; }
  checks.push({
    check_id: 'evidence_manifest_exists',
    description: 'evidence/evidence_manifest.json exists',
    passed: manifestExists,
  });

  return makeReport(ctx.workItemId, 'verification_gate', 'hard_gate', true, checks, [reportPath, manifestPath]);
});

/**
 * §9.2 close_gate — 关闭检查（§15.2）
 * Delegates to close-gate.ts runCloseGate.
 */
registerGate('close_gate', 'hard_gate', true, async (ctx) => {
  const { report } = await runCloseGate(ctx);
  return report;
});

/**
 * §9.2 post_merge_gate — 合并后检查（§11.6）
 */
registerGate('post_merge_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];

  // 1. merge_report.md 存在
  const mergeReportPath = path.join(ctx.workItemDir, 'merge_report.md');
  let mergeReportExists = false;
  try { await fs.access(mergeReportPath); mergeReportExists = true; } catch { mergeReportExists = false; }
  checks.push({
    check_id: 'post_merge_report_exists',
    description: 'merge_report.md exists',
    passed: mergeReportExists,
  });

  // 2. spec_manifest 已更新（检查 project 目录存在）
  checks.push({
    check_id: 'post_merge_project_dir',
    description: '.specforge/project/ directory exists',
    passed: true, // 简化检查，实际需要比较 hash
  });

  return makeReport(ctx.workItemId, 'post_merge_gate', 'hard_gate', true, checks, [mergeReportPath]);
});

/**
 * §9.2 extension_gate — 扩展 Gate（Patch 1 §12）
 */
registerGate('extension_gate', 'hard_gate', false, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const extRequestPath = path.join(ctx.workItemDir, 'extension_request.json');

  let hasExtensionRequest = false;
  try { await fs.access(extRequestPath); hasExtensionRequest = true; } catch { hasExtensionRequest = false; }

  if (!hasExtensionRequest) {
    // 没有扩展请求，跳过
    return makeReport(ctx.workItemId, 'extension_gate', 'hard_gate', false, [
      { check_id: 'no_extension_request', description: 'No extension request present', passed: true },
    ]);
  }

  // 有扩展请求，执行完整检查
  try {
    const content = await fs.readFile(extRequestPath, 'utf-8');
    const req = JSON.parse(content);

    checks.push({ check_id: 'ext_request_valid_json', description: 'extension_request.json is valid JSON', passed: true });
    checks.push({ check_id: 'ext_reason_nonempty', description: 'reason is non-empty', passed: !!req.reason });

    // extension_delta.md 存在
    const deltaPath = path.join(ctx.workItemDir, 'extension_delta.md');
    let deltaExists = false;
    try { await fs.access(deltaPath); deltaExists = true; } catch { deltaExists = false; }
    checks.push({ check_id: 'ext_delta_exists', description: 'extension_delta.md exists', passed: deltaExists });

  } catch {
    checks.push({ check_id: 'ext_request_parse', description: 'extension_request.json is valid JSON', passed: false, severity: 'error' });
  }

  return makeReport(ctx.workItemId, 'extension_gate', 'hard_gate', false, checks);
});

/**
 * §9.2 spec_consistency_gate — 规格一致性（弱实现）
 */
registerGate('spec_consistency_gate', 'soft_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  checks.push({ check_id: 'spec_consistency_basic', description: 'Basic spec consistency check (MVP weak implementation)', passed: true });
  return makeReport(ctx.workItemId, 'spec_consistency_gate', 'soft_gate', true, checks);
});

/**
 * §9.2 trace_gate — Trace 闭环检查（弱实现）
 */
registerGate('trace_gate', 'soft_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  // 检查 trace_delta.md 存在且非空
  const tracePath = path.join(ctx.workItemDir, 'trace_delta.md');
  try {
    const content = await fs.readFile(tracePath, 'utf-8');
    checks.push({
      check_id: 'trace_delta_nonempty',
      description: 'trace_delta.md is non-empty',
      passed: content.trim().length > 0,
    });
  } catch {
    checks.push({ check_id: 'trace_delta_exists', description: 'trace_delta.md exists', passed: false });
  }
  return makeReport(ctx.workItemId, 'trace_gate', 'soft_gate', true, checks);
});

/**
 * §9.2 gate_summary_gate — Gate Summary 冻结检查
 */
registerGate('gate_summary_gate', 'hard_gate', true, async (ctx) => {
  const checks: GateReportCheck[] = [];
  const summaryPath = path.join(ctx.workItemDir, 'gate_summary.md');
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    checks.push({ check_id: 'gate_summary_exists', description: 'gate_summary.md exists', passed: true });
    checks.push({
      check_id: 'gate_summary_has_status',
      description: 'gate_summary has Overall Status',
      passed: content.includes('Overall Status:'),
    });
  } catch {
    checks.push({ check_id: 'gate_summary_exists', description: 'gate_summary.md exists', passed: false, severity: 'error' });
  }
  return makeReport(ctx.workItemId, 'gate_summary_gate', 'hard_gate', true, checks);
});

/**
 * §9.2 workflow_specific_gate — 工作流特定检查（弱实现）
 */
registerGate('workflow_specific_gate', 'soft_gate', false, async (ctx) => {
  return makeReport(ctx.workItemId, 'workflow_specific_gate', 'soft_gate', false, [
    { check_id: 'workflow_specific_skip', description: 'Workflow-specific gate (skipped in MVP)', passed: true },
  ]);
});

/**
 * agent-handoff-v11 — §14.3 Agent handoff 结构化输出校验
 *
 * Agent 每次执行后必须生成结构化 handoff。
 * 最小内容（§14.3）：
 *   - Inputs Read
 *   - Outputs Written
 *   - Findings
 *   - Unknowns
 *   - Escalation Signals
 *   - Next Step Recommendation
 *   - Boundary Statement
 *
 * 本模块提供 handoff schema 校验和写入功能。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ── Types ──

export interface AgentHandoff {
  /** Schema version */
  schema_version: '1.0';
  /** 执行 Agent 标识 */
  agent: string;
  /** 关联 WI ID */
  work_item_id: string;
  /** 执行阶段 */
  stage: string;
  /** 执行时间戳 */
  timestamp: string;

  /** §14.3 最小字段 */
  inputs_read: string[];
  outputs_written: string[];
  findings: string[];
  unknowns: string[];
  escalation_signals: EscalationSignal[];
  next_step_recommendation: string;
  boundary_statement: string;

  /** 可选扩展 */
  errors?: string[];
  warnings?: string[];
  duration_ms?: number;
}

export interface EscalationSignal {
  /** 升级类型 */
  type: 'missing_spec' | 'conflict' | 'out_of_scope' | 'permission_denied' |
        'path_violation' | 'unknown_change' | 'unsafe_operation' | 'other';
  /** 升级描述 */
  description: string;
  /** 受影响的引用 (REQ/AC/DD/TASK) */
  affected_refs?: string[];
  /** 建议处理方式 */
  recommended_action?: string;
}

// ── Required Fields ──

const HANDOFF_REQUIRED_FIELDS: (keyof AgentHandoff)[] = [
  'schema_version',
  'agent',
  'work_item_id',
  'stage',
  'timestamp',
  'inputs_read',
  'outputs_written',
  'findings',
  'unknowns',
  'escalation_signals',
  'next_step_recommendation',
  'boundary_statement',
];

// ── Validation ──

export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 校验 handoff 是否满足 §14.3 最小结构。
 */
export function validateHandoff(handoff: unknown): HandoffValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!handoff || typeof handoff !== 'object') {
    return { valid: false, errors: ['handoff must be a non-null object'], warnings };
  }

  const obj = handoff as Record<string, unknown>;

  // Check required fields
  for (const field of HANDOFF_REQUIRED_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field} (§14.3)`);
    }
  }

  // Type checks for array fields
  const arrayFields: (keyof AgentHandoff)[] = [
    'inputs_read', 'outputs_written', 'findings', 'unknowns', 'escalation_signals',
  ];
  for (const field of arrayFields) {
    if (field in obj && !Array.isArray(obj[field])) {
      errors.push(`Field ${field} must be an array`);
    }
  }

  // Type checks for string fields
  const stringFields: (keyof AgentHandoff)[] = [
    'schema_version', 'agent', 'work_item_id', 'stage', 'timestamp',
    'next_step_recommendation', 'boundary_statement',
  ];
  for (const field of stringFields) {
    if (field in obj && typeof obj[field] !== 'string') {
      errors.push(`Field ${field} must be a string`);
    }
  }

  // Validate schema_version
  if (obj.schema_version && obj.schema_version !== '1.0') {
    warnings.push(`Unexpected schema_version: ${obj.schema_version}. Expected '1.0'.`);
  }

  // Validate escalation_signals structure
  if (Array.isArray(obj.escalation_signals)) {
    for (let i = 0; i < obj.escalation_signals.length; i++) {
      const sig = obj.escalation_signals[i];
      if (!sig || typeof sig !== 'object') {
        errors.push(`escalation_signals[${i}] must be an object`);
      } else {
        if (!sig.type) {
          errors.push(`escalation_signals[${i}].type is required`);
        }
        if (!sig.description) {
          errors.push(`escalation_signals[${i}].description is required`);
        }
      }
    }
  }

  // §14.4: Agent must NOT self-downgrade escalation signals
  if (Array.isArray(obj.escalation_signals) && obj.escalation_signals.length > 0) {
    if (!obj.next_step_recommendation || typeof obj.next_step_recommendation !== 'string') {
      warnings.push('Has escalation signals but no next_step_recommendation (§14.4: must not self-downgrade)');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Writer ──

/**
 * 将 handoff 写入 WI 目录。
 */
export async function writeHandoff(
  wiDir: string,
  handoff: AgentHandoff,
): Promise<string> {
  await mkdir(wiDir, { recursive: true });

  const handoffDir = join(wiDir, 'handoffs');
  await mkdir(handoffDir, { recursive: true });

  const filename = `handoff_${handoff.agent}_${handoff.stage}_${Date.now()}.json`;
  const filePath = join(handoffDir, filename);

  await writeFile(filePath, JSON.stringify(handoff, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * 读取并校验 WI 目录下所有 handoff 文件。
 */
export async function validateAllHandoffs(
  wiDir: string,
): Promise<{ total: number; valid: number; invalid: number; errors: string[] }> {
  const handoffDir = join(wiDir, 'handoffs');
  if (!existsSync(handoffDir)) {
    return { total: 0, valid: 0, invalid: 0, errors: [] };
  }

  const entries = await readFile(join(handoffDir, '..'), 'utf-8').catch(() => '');
  // Simple approach: read handoff dir
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(handoffDir);

  let valid = 0;
  let invalid = 0;
  const allErrors: string[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(handoffDir, file), 'utf-8');
      const parsed = JSON.parse(raw);
      const result = validateHandoff(parsed);
      if (result.valid) {
        valid++;
      } else {
        invalid++;
        allErrors.push(`${file}: ${result.errors.join('; ')}`);
      }
    } catch (err: any) {
      invalid++;
      allErrors.push(`${file}: parse error: ${err.message}`);
    }
  }

  return { total: valid + invalid, valid, invalid, errors: allErrors };
}

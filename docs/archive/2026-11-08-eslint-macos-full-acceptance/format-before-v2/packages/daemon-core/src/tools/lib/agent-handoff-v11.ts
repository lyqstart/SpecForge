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

import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

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
const ESCALATION_TYPES = new Set([
  'missing_spec', 'conflict', 'out_of_scope', 'permission_denied',
  'path_violation', 'unknown_change', 'unsafe_operation', 'other',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeFilenameSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Validation ──

export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface HandoffValidationFilters {
  expectedAgent?: string;
  expectedStage?: string;
  createdAfter?: string;
}

interface HandoffValidationStateEntry {
  key: string;
  status: 'passed' | 'failed';
  filters: HandoffValidationFilters;
  total: number;
  valid: number;
  invalid: number;
  matching: number;
  error?: string;
  validated_at: string;
}

interface HandoffValidationState {
  schema_version: '1.0';
  validations: Record<string, HandoffValidationStateEntry>;
}

const HANDOFF_VALIDATION_STATE_FILE = 'handoff_validation_state.json';

function validationStateKey(filters: HandoffValidationFilters): string {
  return createHash('sha256')
    .update(JSON.stringify({
      expected_agent: filters.expectedAgent ?? null,
      expected_stage: filters.expectedStage ?? null,
      created_after: filters.createdAfter ?? null,
    }))
    .digest('hex');
}

async function readHandoffValidationState(wiDir: string): Promise<HandoffValidationState> {
  try {
    const parsed = JSON.parse(
      await readFile(join(wiDir, HANDOFF_VALIDATION_STATE_FILE), 'utf-8'),
    ) as Partial<HandoffValidationState>;
    return {
      schema_version: '1.0',
      validations: parsed.validations && typeof parsed.validations === 'object'
        ? parsed.validations
        : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { schema_version: '1.0', validations: {} };
  }
}

export async function recordHandoffValidationState(
  wiDir: string,
  filters: HandoffValidationFilters,
  result: {
    success: boolean;
    total: number;
    valid: number;
    invalid: number;
    matching: number;
    error?: string;
  },
): Promise<void> {
  const state = await readHandoffValidationState(wiDir);
  const key = validationStateKey(filters);
  state.validations[key] = {
    key,
    status: result.success ? 'passed' : 'failed',
    filters,
    total: result.total,
    valid: result.valid,
    invalid: result.invalid,
    matching: result.matching,
    error: result.error,
    validated_at: new Date().toISOString(),
  };
  const statePath = join(wiDir, HANDOFF_VALIDATION_STATE_FILE);
  const temporaryPath = `${statePath}.writing-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  await rename(temporaryPath, statePath);
}

export async function readUnresolvedHandoffValidationFailures(
  wiDir: string,
): Promise<HandoffValidationStateEntry[]> {
  const state = await readHandoffValidationState(wiDir);
  return Object.values(state.validations).filter(entry => entry.status === 'failed');
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
    if (field in obj && !isNonEmptyString(obj[field])) {
      errors.push(`Field ${field} must be a non-empty string`);
    }
  }

  for (const field of ['inputs_read', 'outputs_written', 'findings', 'unknowns'] as const) {
    if (Array.isArray(obj[field]) && obj[field].some(value => !isNonEmptyString(value))) {
      errors.push(`Field ${field} must contain only non-empty strings`);
    }
  }

  if (isNonEmptyString(obj.timestamp) && Number.isNaN(Date.parse(obj.timestamp))) {
    errors.push('Field timestamp must be a valid ISO-8601 timestamp');
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
        if (!isNonEmptyString(sig.type) || !ESCALATION_TYPES.has(sig.type)) {
          errors.push(`escalation_signals[${i}].type is required`);
        }
        if (!isNonEmptyString(sig.description)) {
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

  const content = JSON.stringify(handoff, null, 2) + '\n';
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const agent = safeFilenameSegment(handoff.agent);
  const stage = safeFilenameSegment(handoff.stage);
  if (!agent || !stage) throw new Error('HANDOFF_FILENAME_SEGMENT_INVALID');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const filename = `handoff_${agent}_${stage}_${Date.now()}_${digest}_${attempt}.json`;
    const filePath = join(handoffDir, filename);
    try {
      await writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
      return filePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('HANDOFF_WRITE_COLLISION');
}

/**
 * 读取并校验 WI 目录下所有 handoff 文件。
 */
export async function validateAllHandoffs(
  wiDir: string,
  filters: HandoffValidationFilters = {},
): Promise<{
  total: number;
  valid: number;
  invalid: number;
  matching: number;
  records: Array<{
    file: string;
    valid: boolean;
    agent?: string;
    stage?: string;
    timestamp?: string;
    recorded_at?: string;
    work_item_id?: string;
  }>;
  errors: string[];
}> {
  const handoffDir = join(wiDir, 'handoffs');
  if (!existsSync(handoffDir)) {
    return { total: 0, valid: 0, invalid: 0, matching: 0, records: [], errors: [] };
  }

  const files = await readdir(handoffDir);

  let valid = 0;
  let invalid = 0;
  const allErrors: string[] = [];
  const records: Array<{
    file: string;
    valid: boolean;
    agent?: string;
    stage?: string;
    timestamp?: string;
    recorded_at?: string;
    work_item_id?: string;
  }> = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(handoffDir, file), 'utf-8');
      const parsed = JSON.parse(raw);
      const result = validateHandoff(parsed);
      const fileStat = await stat(join(handoffDir, file));
      records.push({
        file,
        valid: result.valid,
        agent: parsed?.agent,
        stage: parsed?.stage,
        timestamp: parsed?.timestamp,
        recorded_at: fileStat.mtime.toISOString(),
        work_item_id: parsed?.work_item_id,
      });
      if (result.valid) {
        valid++;
      } else {
        invalid++;
        allErrors.push(`${file}: ${result.errors.join('; ')}`);
      }
    } catch (err: any) {
      invalid++;
      records.push({ file, valid: false });
      allErrors.push(`${file}: parse error: ${err.message}`);
    }
  }

  const createdAfterMs = filters.createdAfter ? Date.parse(filters.createdAfter) : Number.NaN;
  const matching = records.filter(record => {
    if (!record.valid) return false;
    if (
      filters.expectedAgent &&
      String(record.agent ?? '').trim().toLowerCase().replace(/_/g, '-') !== filters.expectedAgent
    ) return false;
    if (filters.expectedStage && record.stage !== filters.expectedStage) return false;
    if (filters.createdAfter) {
      const timestampMs = Date.parse(String(record.recorded_at ?? ''));
      if (Number.isNaN(createdAfterMs) || Number.isNaN(timestampMs) || timestampMs < createdAfterMs) {
        return false;
      }
    }
    return true;
  }).length;
  return { total: valid + invalid, valid, invalid, matching, records, errors: allErrors };
}

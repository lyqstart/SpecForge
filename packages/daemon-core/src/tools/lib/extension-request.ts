/**
 * extension-request.ts — Extension Request types and helpers
 *
 * Extracted from extension-subflow-v11.ts (TASK-7).
 *
 * No internal dependencies (leaf module).
 * Consumers: extension-gate.ts, extension-subflow-v11.ts (re-export).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ── Types ──

export interface ExtensionRequest {
  schema_version: '1.0';
  work_item_id: string;
  requested_by_agent: string;
  requested_namespace: string;
  requested_key: string;
  reason: string;
  blocking_current_flow: boolean;
  created_at: string;
}

// ── Extension Request ──

/**
 * 校验 extension_request.json 结构。
 */
export function validateExtensionRequest(request: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!request || typeof request !== 'object') {
    return { valid: false, errors: ['request must be an object'] };
  }

  const obj = request as Record<string, unknown>;
  const required: (keyof ExtensionRequest)[] = [
    'schema_version', 'work_item_id', 'requested_by_agent',
    'requested_namespace', 'requested_key', 'reason', 'blocking_current_flow', 'created_at',
  ];

  for (const field of required) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (obj.schema_version && obj.schema_version !== '1.0') {
    errors.push(`Invalid schema_version: ${obj.schema_version}. Expected '1.0'.`);
  }

  if (obj.blocking_current_flow !== undefined && typeof obj.blocking_current_flow !== 'boolean') {
    errors.push('blocking_current_flow must be boolean');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 写入 extension_request.json 到 WI 目录。
 */
export async function writeExtensionRequest(
  wiDir: string,
  request: ExtensionRequest,
): Promise<string> {
  await mkdir(wiDir, { recursive: true });
  const filePath = join(wiDir, 'extension_request.json');
  await writeFile(filePath, JSON.stringify(request, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * 读取 extension_request.json。
 */
export async function readExtensionRequest(wiDir: string): Promise<ExtensionRequest | null> {
  const filePath = join(wiDir, 'extension_request.json');
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

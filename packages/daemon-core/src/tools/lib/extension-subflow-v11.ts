/**
 * extension-subflow-v11 — Patch 1 §6-15 Extension Subflow Runtime
 *
 * Extension Subflow 触发条件（Patch 1 §6）：
 *   Agent 发现扩展缺口 → 写 extension_request.json → handoff 报告 extension_required
 *   → sf-orchestrator 标记主 WI 为 blocked/extension_required
 *   → sf-orchestrator 调度 sf-extension Agent
 *
 * 本模块提供：
 *   - extension_request.json 校验与写入  → extension-request.ts
 *   - extension_delta.md 生成            → extension-registry.ts
 *   - Extension Candidate 生成           → extension-registry.ts
 *   - Extension Gate 检查                → extension-gate.ts
 *   - Extension Subflow 与主流程恢复逻辑 → 本文件
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Re-export from extracted modules
export * from './extension-registry.js'
export * from './extension-request.js'
export * from './extension-gate.js'

// ── Main Flow Recovery ──

/**
 * Extension Subflow 完成后恢复主流程（Patch 1 §15）。
 *
 * 规则：
 * 1. Extension Candidate 通过 Extension Gate。
 * 2. Extension User Decision approved。
 * 3. Extension Merge 完成（extension_registry.json 写入 project/）。
 * 4. 主 WI 状态从 blocked → 恢复到 Extension 前的状态。
 * 5. 主流程继续。
 */
export async function recoverMainFlow(params: {
  wiDir: string;
  extensionCompleted: boolean;
  previousStatus: string;
}): Promise<{
  canRecover: boolean;
  newStatus: string;
  actions: string[];
}> {
  const { wiDir, extensionCompleted, previousStatus } = params;

  if (!extensionCompleted) {
    return {
      canRecover: false,
      newStatus: 'blocked',
      actions: ['Extension Subflow not completed. Main flow remains blocked.'],
    };
  }

  // Verify extension_request.json is resolved
  const requestPath = join(wiDir, 'extension_request.json');
  if (existsSync(requestPath)) {
    // Extension request still exists — check if it's been resolved
    const raw = await readFile(requestPath, 'utf-8');
    const request = JSON.parse(raw);
    if (request.blocking_current_flow) {
      return {
        canRecover: false,
        newStatus: 'blocked',
        actions: ['Extension request is still blocking. Cannot recover main flow.'],
      };
    }
  }

  return {
    canRecover: true,
    newStatus: previousStatus,
    actions: [
      'Extension Subflow completed successfully.',
      `Main WI status recovered to ${previousStatus}.`,
      'Main flow can continue.',
    ],
  };
}

/**
 * extension-registry.ts — Extension Registry types and helpers
 *
 * Extracted from extension-subflow-v11.ts (TASK-7).
 *
 * No internal dependencies (leaf module).
 * Consumers: extension-gate.ts, extension-subflow-v11.ts (re-export).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ── Types ──

export interface ExtensionDelta {
  /** 扩展 delta 内容 */
  currentRegistryState: Record<string, unknown>;
  proposedExtension: {
    namespace: string;
    key: string;
    value: unknown;
  };
  reason: string;
  impactedStandards: string[];
  compatibility: 'backward_compatible' | 'breaking';
  risks: string[];
}

export interface ExtensionCandidate {
  /** 新的 extension_registry.json 完整内容 */
  content: Record<string, unknown>;
  /** hash */
  hash: string;
}

// ── Extension Delta ──

/**
 * 生成 extension_delta.md。
 */
export async function generateExtensionDelta(params: {
  wiDir: string;
  currentRegistry: Record<string, unknown>;
  proposedNamespace: string;
  proposedKey: string;
  proposedValue: unknown;
  reason: string;
}): Promise<{ delta: ExtensionDelta; filePath: string }> {
  const { wiDir, currentRegistry, proposedNamespace, proposedKey, proposedValue, reason } = params;

  const delta: ExtensionDelta = {
    currentRegistryState: currentRegistry,
    proposedExtension: {
      namespace: proposedNamespace,
      key: proposedKey,
      value: proposedValue,
    },
    reason,
    impactedStandards: [`${proposedNamespace}.${proposedKey}`],
    compatibility: 'backward_compatible',
    risks: [],
  };

  // Write extension_delta.md
  const lines: string[] = [
    '# Extension Delta',
    '',
    `**Namespace**: ${proposedNamespace}`,
    `**Key**: ${proposedKey}`,
    '',
    '## Current Registry State',
    '',
    '```json',
    JSON.stringify(currentRegistry, null, 2),
    '```',
    '',
    '## Proposed Extension',
    '',
    '```json',
    JSON.stringify({ [proposedNamespace]: { [proposedKey]: proposedValue } }, null, 2),
    '```',
    '',
    '## Reason',
    '',
    reason,
    '',
    '## Compatibility',
    '',
    `**Type**: ${delta.compatibility}`,
    '',
    '## Risks',
    '',
    ...(delta.risks.length > 0 ? delta.risks.map(r => `- ${r}`) : ['None identified.']),
    '',
  ];

  await mkdir(wiDir, { recursive: true });
  const filePath = join(wiDir, 'extension_delta.md');
  await writeFile(filePath, lines.join('\n'), 'utf-8');

  return { delta, filePath };
}

// ── Extension Candidate ──

/**
 * 生成 Extension Candidate（新的 extension_registry.json 完整文件）。
 * Candidate 写入 candidates/ 子目录，不直接写 project/。
 */
export async function generateExtensionCandidate(params: {
  wiDir: string;
  currentRegistry: Record<string, unknown>;
  namespace: string;
  key: string;
  value: unknown;
}): Promise<{ candidate: ExtensionCandidate; candidatePath: string }> {
  const { wiDir, currentRegistry, namespace, key, value } = params;

  // Clone and extend registry
  const newRegistry = JSON.parse(JSON.stringify(currentRegistry));
  if (!newRegistry.namespaces) {
    newRegistry.namespaces = {};
  }
  if (!newRegistry.namespaces[namespace]) {
    newRegistry.namespaces[namespace] = [];
  }
  // Add the new extension
  const nsArray = newRegistry.namespaces[namespace];
  if (Array.isArray(nsArray)) {
    nsArray.push(key);
  }

  const content = newRegistry;
  const hash = computeSimpleHash(JSON.stringify(content));

  const candidate: ExtensionCandidate = { content, hash };

  // Write to candidates/ subdirectory (not project/)
  const candidatesDir = join(wiDir, 'candidates', 'project');
  await mkdir(candidatesDir, { recursive: true });
  const candidatePath = join(candidatesDir, 'extension_registry.json');
  await writeFile(candidatePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');

  return { candidate, candidatePath };
}

// ── Utility ──

function computeSimpleHash(content: string): string {
  // Simple hash for MVP; production should use crypto
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `sha256:simple:${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

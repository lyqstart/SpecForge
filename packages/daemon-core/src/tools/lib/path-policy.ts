/** Path policy enforcement for SpecForge. */
import * as fs from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { projectSpecManifest } from '@specforge/types/directory-layout';
import { MVP_FORBIDDEN_DIRS } from './project-layout.js';
import {
  enforceWritePolicy as canonicalEnforceWritePolicy,
  type WritePolicyResult,
} from './write-guard-v11.js';

export interface PathPolicyResult { valid: boolean; violations: string[]; }

const MODULE_SPEC_TARGET_KEYS = new Set([
  'module_file', 'requirements', 'requirements_file', 'design', 'design_file',
  'contracts', 'contracts_file', 'trace', 'trace_file', 'tasks', 'tasks_file',
]);

export function normalizeProjectSpecTargetPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('.specforge/project/')) return normalized;
  if (normalized.startsWith('project/')) return `.specforge/${normalized}`;
  return normalized;
}

function isCanonicalGovernanceTarget(target: string): boolean {
  if (target === '.specforge/project/data_model.md') return true;
  return /^\.specforge\/project\/modules\/[A-Z][A-Z0-9]{1,11}\/(?:module\.json|requirements\.md|design\.md|contracts\.json|trace\.md)$/.test(target);
}

export async function readDeclaredProjectSpecTargetPaths(projectRoot: string): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(projectSpecManifest(projectRoot), 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set();
    const manifest = parsed as Record<string, unknown>;
    const declared = new Set<string>(['.specforge/project/data_model.md']);
    const projectValue = manifest['project'];
    if (projectValue && typeof projectValue === 'object' && !Array.isArray(projectValue)) {
      for (const target of Object.values(projectValue as Record<string, unknown>)) {
        const normalized = normalizeProjectSpecTargetPath(target);
        if (normalized) declared.add(normalized);
      }
    }
    const modules: unknown[] = Array.isArray(manifest['modules']) ? manifest['modules'] as unknown[] : [];
    for (const moduleEntry of modules) {
      if (!moduleEntry || typeof moduleEntry !== 'object' || Array.isArray(moduleEntry)) continue;
      for (const [key, target] of Object.entries(moduleEntry as Record<string, unknown>)) {
        if (!MODULE_SPEC_TARGET_KEYS.has(key)) continue;
        const normalized = normalizeProjectSpecTargetPath(target);
        if (normalized) declared.add(normalized);
      }
    }
    return declared;
  } catch {
    return new Set(['.specforge/project/data_model.md']);
  }
}

export async function isDeclaredProjectSpecTargetPath(projectRoot: string, targetPath: unknown): Promise<boolean> {
  const normalized = normalizeProjectSpecTargetPath(targetPath);
  if (!normalized) return false;
  if (isCanonicalGovernanceTarget(normalized)) return true;
  const declared = await readDeclaredProjectSpecTargetPaths(projectRoot);
  return declared.has(normalized);
}

export function enforcePathPolicy(filePath: string): PathPolicyResult {
  const violations: string[] = [];
  if (filePath.includes('\\')) violations.push('backslash not allowed');
  if (isAbsolute(filePath)) violations.push('absolute paths not allowed');
  if (filePath.includes('..')) violations.push('parent traversal not allowed');
  if (filePath.includes('~')) violations.push('home expansion not allowed');
  if (!filePath.includes('.specforge/')) violations.push('must have .specforge/ prefix');
  for (const dir of MVP_FORBIDDEN_DIRS) {
    if (filePath.includes(dir)) violations.push(`forbidden dir: ${dir}`);
  }
  return { valid: violations.length === 0, violations };
}

export type { WritePolicyResult } from './write-guard-v11.js';
export const enforceWritePolicy = canonicalEnforceWritePolicy;

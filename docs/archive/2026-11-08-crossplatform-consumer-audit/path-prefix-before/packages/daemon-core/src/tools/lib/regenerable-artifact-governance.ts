import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import {
  classifyRegenerableArtifactPath,
  normalizeRelativePath,
  validateProjectRelativePath,
  type RegenerableArtifactClass,
} from './git-governance-core';
import { readTrustedGitGovernanceProjectWrites } from './git-governance-write-provenance';

const execFileAsync = promisify(execFile);

export interface GovernedRegenerableArtifact {
  path: string;
  artifact_class: RegenerableArtifactClass;
  decision: 'ignore';
  reason: string;
  policy_source: '.specforge/project/git_ignore_decisions.json';
  enforcement_source: '.gitignore';
}

async function gitExitCode(projectRoot: string, args: string[]): Promise<number> {
  try {
    await execFileAsync('git', args, { cwd: projectRoot, maxBuffer: 1024 * 1024 });
    return 0;
  } catch (error: any) {
    return Number(error?.code ?? 1);
  }
}

function projectRelativePath(projectRoot: string, value: string): string | null {
  const raw = String(value ?? '').trim();
  const relative = path.isAbsolute(raw) ? path.relative(projectRoot, raw) : raw;
  const validation = validateProjectRelativePath(relative);
  return validation.valid && validation.path
    ? normalizeRelativePath(validation.path)
    : null;
}

/**
 * Resolve the narrow class of changed files that may be excluded from business
 * code scope. A recorded preference alone is never enough: both policy files
 * must have current hash provenance, the path must be a known regenerable
 * artifact, Git must actively ignore it, and it must not be tracked.
 */
export async function readGovernedRegenerableArtifacts(
  projectRoot: string,
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
): Promise<GovernedRegenerableArtifact[]> {
  const trustedPaths = new Set(
    readTrustedGitGovernanceProjectWrites(projectRoot).map(entry => entry.path),
  );
  if (
    !trustedPaths.has('.specforge/project/git_ignore_decisions.json') ||
    !trustedPaths.has('.gitignore')
  ) {
    return [];
  }

  const decisionPath = path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'project',
    'git_ignore_decisions.json',
  );
  const parsed = JSON.parse(await fs.readFile(decisionPath, 'utf-8')) as {
    schema_version?: unknown;
    decisions?: unknown;
  };
  if (parsed.schema_version !== 'git_ignore_decisions.v1' || !Array.isArray(parsed.decisions)) {
    throw new Error('GIT_IGNORE_DECISIONS_INVALID');
  }

  const ignoredDecisionByPath = new Map<string, { reason: string }>();
  for (const raw of parsed.decisions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const decision = raw as Record<string, unknown>;
    if (decision.decision !== 'ignore' || typeof decision.path !== 'string') continue;
    const validation = validateProjectRelativePath(decision.path);
    if (!validation.valid || !validation.path) continue;
    ignoredDecisionByPath.set(normalizeRelativePath(validation.path), {
      reason: String(decision.reason ?? 'confirmed ignore decision'),
    });
  }

  const governed: GovernedRegenerableArtifact[] = [];
  for (const changed of changedFiles) {
    if (changed.operation === 'delete') continue;
    const relative = projectRelativePath(projectRoot, changed.path);
    if (!relative) continue;
    const decision = ignoredDecisionByPath.get(relative);
    const artifactClass = classifyRegenerableArtifactPath(relative);
    if (!decision || !artifactClass) continue;

    const tracked = await gitExitCode(projectRoot, ['ls-files', '--error-unmatch', '--', relative]);
    const ignored = await gitExitCode(projectRoot, ['check-ignore', '--quiet', '--', relative]);
    if (tracked === 0 || ignored !== 0) continue;

    governed.push({
      path: relative,
      artifact_class: artifactClass,
      decision: 'ignore',
      reason: decision.reason,
      policy_source: '.specforge/project/git_ignore_decisions.json',
      enforcement_source: '.gitignore',
    });
  }
  return governed;
}

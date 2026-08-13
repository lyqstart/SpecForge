import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export const GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA = 'git_governance_controlled_writes.v1';

export const GIT_GOVERNANCE_PROJECT_METADATA_PATHS = new Set([
  '.specforge/project/git_policy.json',
  '.specforge/project/git_ignore_decisions.json',
  '.specforge/project/git_adoption_report.md',
]);

export interface TrustedGitGovernanceWrite {
  path: string;
  producer: string;
  sha256: string;
}

interface GitGovernanceWriteProvenance {
  schema_version: string;
  updated_at: string;
  writes: TrustedGitGovernanceWrite[];
}

function normalizeRelative(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

function provenancePath(projectRoot: string): string {
  return path.join(
    projectRoot,
    SPEC_DIR_NAME,
    'runtime',
    'git_governance_controlled_writes.json',
  );
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readProvenance(projectRoot: string): GitGovernanceWriteProvenance {
  try {
    const parsed = JSON.parse(fs.readFileSync(provenancePath(projectRoot), 'utf-8'));
    if (
      parsed?.schema_version !== GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA ||
      !Array.isArray(parsed?.writes)
    ) {
      return {
        schema_version: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA,
        updated_at: new Date(0).toISOString(),
        writes: [],
      };
    }
    return parsed as GitGovernanceWriteProvenance;
  } catch {
    return {
      schema_version: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA,
      updated_at: new Date(0).toISOString(),
      writes: [],
    };
  }
}

export function recordGitGovernanceProjectWrites(
  projectRoot: string,
  producer: 'sf_git_project_adopt' | 'sf_git_ignore_decision_record',
  relativePaths: string[],
): TrustedGitGovernanceWrite[] {
  const previous = readProvenance(projectRoot);
  const byPath = new Map(
    previous.writes.map(entry => [normalizeRelative(entry.path), entry] as const),
  );

  for (const candidate of relativePaths) {
    const relative = normalizeRelative(candidate);
    if (!GIT_GOVERNANCE_PROJECT_METADATA_PATHS.has(relative)) {
      throw new Error(`GIT_GOVERNANCE_PROVENANCE_PATH_FORBIDDEN: ${relative}`);
    }
    const absolute = path.join(projectRoot, ...relative.split('/'));
    if (!fs.existsSync(absolute)) {
      throw new Error(`GIT_GOVERNANCE_PROVENANCE_TARGET_MISSING: ${relative}`);
    }
    byPath.set(relative, {
      path: relative,
      producer,
      sha256: sha256File(absolute),
    });
  }

  const next: GitGovernanceWriteProvenance = {
    schema_version: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA,
    updated_at: new Date().toISOString(),
    writes: Array.from(byPath.values()).sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
  const output = provenancePath(projectRoot);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return next.writes;
}

export function readTrustedGitGovernanceProjectWrites(
  projectRoot: string,
): TrustedGitGovernanceWrite[] {
  const provenance = readProvenance(projectRoot);
  return provenance.writes.filter(entry => {
    const relative = normalizeRelative(entry?.path);
    if (!GIT_GOVERNANCE_PROJECT_METADATA_PATHS.has(relative)) return false;
    if (
      entry?.producer !== 'sf_git_project_adopt' &&
      entry?.producer !== 'sf_git_ignore_decision_record'
    ) {
      return false;
    }
    if (!/^[a-f0-9]{64}$/i.test(String(entry?.sha256 ?? ''))) return false;
    const absolute = path.join(projectRoot, ...relative.split('/'));
    if (!fs.existsSync(absolute)) return false;
    return sha256File(absolute) === String(entry.sha256).toLowerCase();
  });
}

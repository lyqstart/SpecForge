import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION,
  SPEC_DIR_NAME,
  type GitGovernanceTrustedWrite,
  type GitGovernanceWriteProvenance,
} from '@specforge/types';
import { createGitGovernanceWriteProvenanceSchemaDescriptor } from '@specforge/migration';

export const GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA =
  GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION;

export const GIT_GOVERNANCE_PROJECT_METADATA_PATHS = new Set([
  '.specforge/project/git_policy.json',
  '.specforge/project/git_ignore_decisions.json',
  '.specforge/project/git_adoption_report.md',
]);

export type TrustedGitGovernanceWrite = GitGovernanceTrustedWrite;

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

function writeAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, 'utf-8');
  fs.renameSync(temp, filePath);
}

function readProvenance(projectRoot: string): GitGovernanceWriteProvenance {
  const filePath = provenancePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return {
      schema_version: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA,
      updated_at: new Date(0).toISOString(),
      writes: [],
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    const descriptor = createGitGovernanceWriteProvenanceSchemaDescriptor();
    if (!descriptor.validateCurrent(parsed)) {
      throw new Error('VALIDATION_FAILED');
    }
    return parsed as GitGovernanceWriteProvenance;
  } catch (error) {
    throw new Error(
      `GIT_GOVERNANCE_PROVENANCE_INVALID: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function assertGitGovernanceWriteProvenanceCurrent(projectRoot: string): void {
  const provenance = readProvenance(projectRoot);
  for (const entry of provenance.writes) {
    const relative = normalizeRelative(entry.path);
    const absolute = path.join(projectRoot, ...relative.split('/'));
    if (!fs.existsSync(absolute) || sha256File(absolute) !== entry.sha256.toLowerCase()) {
      throw new Error(`GIT_GOVERNANCE_PROVENANCE_INVALID: CURRENT_HASH_MISMATCH: ${relative}`);
    }
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
      path: relative as GitGovernanceTrustedWrite['path'],
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
  const descriptor = createGitGovernanceWriteProvenanceSchemaDescriptor();
  if (!descriptor.validateCurrent(next)) {
    throw new Error('GIT_GOVERNANCE_PROVENANCE_RECORD_INVALID');
  }
  writeAtomically(output, JSON.stringify(next, null, 2) + '\n');
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

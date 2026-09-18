import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION,
  type AtomicSpecMergeTrustedWrite,
  type AtomicSpecMergeWriteProvenance,
} from '@specforge/types';
import { createAtomicSpecMergeWriteProvenanceSchemaDescriptor } from '@specforge/types/schema-contract';

export const ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA =
  ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION;

export type TrustedAtomicSpecMergeWrite = AtomicSpecMergeTrustedWrite;

const SPEC_ROOT = '.specforge/project/';

function normalizeRelative(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

function provenancePath(projectRoot: string): string {
  return path.join(
    projectRoot,
    '.specforge',
    'runtime',
    'atomic_spec_merge_controlled_writes.json',
  );
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readStructuredProvenance(projectRoot: string): AtomicSpecMergeWriteProvenance {
  const filePath = provenancePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return {
      schema_version: ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA,
      updated_at: new Date(0).toISOString(),
      writes: [],
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    const descriptor = createAtomicSpecMergeWriteProvenanceSchemaDescriptor();
    if (!descriptor.validateCurrent(parsed)) throw new Error('VALIDATION_FAILED');
    return parsed as AtomicSpecMergeWriteProvenance;
  } catch (error) {
    throw new Error(
      `ATOMIC_SPEC_MERGE_PROVENANCE_INVALID: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function currentHashMatches(projectRoot: string, entry: TrustedAtomicSpecMergeWrite): boolean {
  const relative = normalizeRelative(entry.path);
  if (!relative.startsWith(SPEC_ROOT) || relative.split('/').includes('..')) return false;
  if (!/^WI-\d+$/i.test(String(entry.work_item_id ?? ''))) return false;
  if (!/^PSV-\d+$/i.test(String(entry.project_spec_version ?? ''))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(entry.sha256 ?? ''))) return false;
  if (entry.producer !== 'sf_v11_merge') return false;
  const absolute = path.join(projectRoot, ...relative.split('/'));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;
  return sha256File(absolute) === String(entry.sha256).toLowerCase();
}

export function assertAtomicSpecMergeWriteProvenanceCurrent(projectRoot: string): void {
  const provenance = readStructuredProvenance(projectRoot);
  for (const entry of provenance.writes) {
    if (!currentHashMatches(projectRoot, entry)) {
      throw new Error(`ATOMIC_SPEC_MERGE_PROVENANCE_INVALID: CURRENT_HASH_MISMATCH: ${entry.path}`);
    }
  }
}

function writeAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, 'utf-8');
  fs.renameSync(temp, filePath);
}

export function recordAtomicSpecMergeProjectWrites(input: {
  projectRoot: string;
  workItemId: string;
  projectSpecVersion: string;
  relativePaths: string[];
}): TrustedAtomicSpecMergeWrite[] {
  if (!/^WI-\d+$/i.test(input.workItemId)) {
    throw new Error(`ATOMIC_SPEC_MERGE_PROVENANCE_INVALID_WORK_ITEM: ${input.workItemId}`);
  }
  if (!/^PSV-\d+$/i.test(input.projectSpecVersion)) {
    throw new Error(
      `ATOMIC_SPEC_MERGE_PROVENANCE_INVALID_PROJECT_SPEC_VERSION: ${input.projectSpecVersion}`,
    );
  }

  const previous = readStructuredProvenance(input.projectRoot);
  const byPath = new Map(
    previous.writes
      .filter(entry => entry?.producer === 'sf_v11_merge')
      .map(entry => [normalizeRelative(entry.path), entry] as const),
  );

  const now = new Date().toISOString();
  for (const candidate of Array.from(new Set(input.relativePaths.map(normalizeRelative)))) {
    if (!candidate.startsWith(SPEC_ROOT) || candidate.split('/').includes('..')) {
      throw new Error(`ATOMIC_SPEC_MERGE_PROVENANCE_PATH_FORBIDDEN: ${candidate}`);
    }
    const absolute = path.join(input.projectRoot, ...candidate.split('/'));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      continue;
    }
    byPath.set(candidate, {
      path: candidate,
      producer: 'sf_v11_merge',
      work_item_id: input.workItemId,
      project_spec_version: input.projectSpecVersion,
      sha256: sha256File(absolute),
      recorded_at: now,
    });
  }

  const next: AtomicSpecMergeWriteProvenance = {
    schema_version: ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA,
    updated_at: now,
    writes: Array.from(byPath.values()).sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
  const descriptor = createAtomicSpecMergeWriteProvenanceSchemaDescriptor();
  if (!descriptor.validateCurrent(next)) {
    throw new Error('ATOMIC_SPEC_MERGE_PROVENANCE_RECORD_INVALID');
  }
  writeAtomically(provenancePath(input.projectRoot), JSON.stringify(next, null, 2) + '\n');
  return next.writes;
}

export function readTrustedAtomicSpecMergeProjectWrites(
  projectRoot: string,
): TrustedAtomicSpecMergeWrite[] {
  return readStructuredProvenance(projectRoot).writes.filter(entry =>
    currentHashMatches(projectRoot, entry),
  ).sort((left, right) => left.path.localeCompare(right.path));
}

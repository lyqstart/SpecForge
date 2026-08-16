import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export const ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA =
  'atomic_spec_merge_controlled_writes.v1';

export interface TrustedAtomicSpecMergeWrite {
  path: string;
  producer: 'sf_v11_merge' | 'sf_v11_merge:legacy_reconstructed';
  work_item_id: string;
  project_spec_version: string;
  sha256: string;
  recorded_at: string;
}

interface AtomicSpecMergeWriteProvenance {
  schema_version: string;
  updated_at: string;
  writes: TrustedAtomicSpecMergeWrite[];
}

const SPEC_ROOT = '.specforge/project/';
const SPEC_MANIFEST = '.specforge/project/spec_manifest.json';

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

function readJson(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readStructuredProvenance(projectRoot: string): AtomicSpecMergeWriteProvenance {
  const parsed = readJson(provenancePath(projectRoot));
  if (
    parsed?.schema_version !== ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA ||
    !Array.isArray(parsed?.writes)
  ) {
    return {
      schema_version: ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA,
      updated_at: new Date(0).toISOString(),
      writes: [],
    };
  }
  return parsed as AtomicSpecMergeWriteProvenance;
}

function currentHashMatches(projectRoot: string, entry: TrustedAtomicSpecMergeWrite): boolean {
  const relative = normalizeRelative(entry.path);
  if (!relative.startsWith(SPEC_ROOT)) return false;
  if (!/^WI-\d+$/i.test(String(entry.work_item_id ?? ''))) return false;
  if (!/^PSV-\d+$/i.test(String(entry.project_spec_version ?? ''))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(entry.sha256 ?? ''))) return false;
  if (entry.producer !== 'sf_v11_merge') return false;
  const absolute = path.join(projectRoot, ...relative.split('/'));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;
  return sha256File(absolute) === String(entry.sha256).toLowerCase();
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
    if (!candidate.startsWith(SPEC_ROOT)) {
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
  writeAtomically(provenancePath(input.projectRoot), JSON.stringify(next, null, 2) + '\n');
  return next.writes;
}

function parseSuccessfulMergeTargets(report: string): string[] {
  const targets: string[] = [];
  for (const raw of report.split(/\r?\n/)) {
    if (!/^\|\s*success\s*\|/i.test(raw)) continue;
    const cells = raw.split('|').map(cell => cell.trim());
    const target = normalizeRelative(cells[4] ?? '');
    if (target) targets.push(target);
  }
  return Array.from(new Set(targets)).sort();
}

function reconstructLegacySpecManifestWrite(
  projectRoot: string,
): TrustedAtomicSpecMergeWrite | null {
  const relative = SPEC_MANIFEST;
  const absolute = path.join(projectRoot, ...relative.split('/'));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;

  const manifest = readJson(absolute);
  const workItemId = String(manifest?.last_merged_work_item ?? '');
  const projectSpecVersion = String(manifest?.project_spec_version ?? '');
  const lastMergedTargets = Array.isArray(manifest?.last_merged_targets)
    ? manifest.last_merged_targets.map(normalizeRelative).sort()
    : [];
  if (!/^WI-\d+$/i.test(workItemId) || !/^PSV-\d+$/i.test(projectSpecVersion)) return null;

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  const reportPath = path.join(workItemDir, 'merge_report.md');
  const decisionPath = path.join(workItemDir, 'user_decision.json');
  const candidatePath = path.join(workItemDir, 'candidate_manifest.json');
  if (
    !fs.existsSync(reportPath) ||
    !fs.existsSync(decisionPath) ||
    !fs.existsSync(candidatePath)
  ) {
    return null;
  }

  const report = fs.readFileSync(reportPath, 'utf-8');
  const decision = readJson(decisionPath);
  const candidate = readJson(candidatePath);
  if (!new RegExp(`^Work Item:\\s*${workItemId}\\s*$`, 'im').test(report)) return null;
  if (!/^Status:\s*success\s*$/im.test(report)) return null;
  if (!/^- Spec Manifest Updated:\s*true\s*$/im.test(report)) return null;
  const versionMatch = report.match(/^- Project Spec Version:\s*(\S+)\s*$/im);
  if (String(versionMatch?.[1] ?? '') !== projectSpecVersion) return null;
  if (String(decision?.work_item_id ?? '') !== workItemId) return null;
  if (!['approved', 'waived'].includes(String(decision?.decision_status ?? ''))) return null;
  if (String(candidate?.work_item_id ?? '') !== workItemId) return null;

  const reportTargets = parseSuccessfulMergeTargets(report);
  if (
    reportTargets.length !== lastMergedTargets.length ||
    reportTargets.some((target, index) => target !== lastMergedTargets[index])
  ) {
    return null;
  }

  return {
    path: relative,
    producer: 'sf_v11_merge:legacy_reconstructed',
    work_item_id: workItemId,
    project_spec_version: projectSpecVersion,
    sha256: sha256File(absolute),
    recorded_at: String(manifest?.last_merged_at ?? new Date(0).toISOString()),
  };
}

export function readTrustedAtomicSpecMergeProjectWrites(
  projectRoot: string,
): TrustedAtomicSpecMergeWrite[] {
  const trusted = readStructuredProvenance(projectRoot).writes.filter(entry =>
    currentHashMatches(projectRoot, entry),
  );

  if (!trusted.some(entry => normalizeRelative(entry.path) === SPEC_MANIFEST)) {
    const legacy = reconstructLegacySpecManifestWrite(projectRoot);
    if (legacy) trusted.push(legacy);
  }

  return trusted.sort((left, right) => left.path.localeCompare(right.path));
}

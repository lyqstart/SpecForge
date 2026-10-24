import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { extractStructuredVerificationReport } from './verification-report-contract.js';
import { WAL } from '../../wal/WAL.js';

export interface VerificationEvidenceIntegrity {
  invalidity_reasons: string[];
  report_sha256: string | null;
  manifest_sha256: string | null;
  close_event_at: string | null;
}

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const samePath = (left: string, right: string): boolean => {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
};

function parseDeclaredTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readCloseEventAt(projectRoot: string, workItemId: string): Promise<string | null> {
  let events;
  try {
    events = (await new WAL(path.join(projectRoot, '.specforge', 'runtime', 'events.jsonl')).readAllEvents()).events;
  } catch {
    return null;
  }
  for (let index = events.length - 1; index >= 0; index--) {
    try {
      const event = events[index]!;
      if (event.projectId !== workItemId || event.action !== 'state.transition' ||
          event.payload?.to_state !== 'closed') continue;
      const milliseconds = Number(event.ts);
      return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
    } catch {
      // A malformed unrelated event cannot be used as a timestamp proof.
    }
  }
  return null;
}

export async function inspectVerificationEvidenceIntegrity(input: {
  projectRoot: string;
  workItemDir: string;
  workItemId: string;
  closed?: boolean;
  now?: Date;
}): Promise<VerificationEvidenceIntegrity> {
  const reportPath = path.join(input.workItemDir, 'verification_report.md');
  const manifestPath = path.join(input.workItemDir, 'evidence', 'evidence_manifest.json');
  const reasons: string[] = [];
  const reportBytes = await fs.readFile(reportPath).catch(() => null);
  const manifestBytes = await fs.readFile(manifestPath).catch(() => null);
  const result: VerificationEvidenceIntegrity = {
    invalidity_reasons: reasons,
    report_sha256: reportBytes ? hash(reportBytes) : null,
    manifest_sha256: manifestBytes ? hash(manifestBytes) : null,
    close_event_at: input.closed ? await readCloseEventAt(input.projectRoot, input.workItemId) : null,
  };
  if (input.closed && !result.close_event_at) reasons.push('authoritative_close_event_unavailable');
  if (!reportBytes || !manifestBytes) {
    reasons.push('verification_evidence_missing');
    return result;
  }
  const report = extractStructuredVerificationReport(reportBytes.toString('utf-8'));
  let manifest: Record<string, any>;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf-8'));
  } catch {
    reasons.push('evidence_manifest_invalid_json');
    return result;
  }
  const latestAllowed = result.close_event_at
    ? Date.parse(result.close_event_at)
    : (input.now ?? new Date()).getTime();
  for (const [name, value] of [
    ['verification_report', report?.timestamp],
    ['evidence_manifest', manifest.timestamp],
  ] as const) {
    if (value === undefined) continue;
    const time = parseDeclaredTime(value);
    if (time === null) reasons.push(`${name}_timestamp_invalid`);
    else if (time > latestAllowed) reasons.push(`${name}_timestamp_after_${input.closed && result.close_event_at ? 'close' : 'runtime'}`);
  }
  if (!Array.isArray(manifest.entries)) reasons.push('evidence_manifest_entries_missing');
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const entryId = String(entry.evidence_id ?? entry.id ?? 'unknown');
      for (const field of ['timestamp', 'created_at', 'recorded_at']) {
        if (entry[field] === undefined) continue;
        const time = parseDeclaredTime(entry[field]);
        if (time === null) reasons.push(`evidence_entry_${field}_invalid:${entryId}`);
        else if (time > latestAllowed) reasons.push(`evidence_entry_${field}_after_${input.closed && result.close_event_at ? 'close' : 'runtime'}:${entryId}`);
      }
    }
    if (!entry || typeof entry !== 'object' || entry.status !== 'passed' ||
        entry.level !== 'L5' || entry.evidence_type !== 'manual_acceptance') continue;
    const id = String(entry.evidence_id ?? entry.id ?? 'unknown');
    const relative = String(entry.path ?? '').replace(/\\/g, '/');
    const parts = relative.split('/');
    if (!relative || path.isAbsolute(relative) || parts.includes('..') || parts.includes('.') ||
        !relative.startsWith('.specforge/work-items/') && !relative.startsWith('evidence/')) {
      reasons.push(`manual_acceptance_source_invalid:${id}`);
      continue;
    }
    const source = relative.startsWith('evidence/')
      ? path.join(input.workItemDir, relative)
      : path.join(input.projectRoot, relative);
    const resolved = path.resolve(source);
    const projectRelative = path.relative(path.resolve(input.projectRoot), resolved);
    if (projectRelative.startsWith('..') || path.isAbsolute(projectRelative) ||
        [reportPath, manifestPath].some(candidate => samePath(candidate, resolved))) {
      reasons.push(`manual_acceptance_source_self_referential_or_outside:${id}`);
      continue;
    }
    try {
      const stat = await fs.lstat(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
      const real = await fs.realpath(resolved);
      const realRelative = path.relative(path.resolve(input.projectRoot), real);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        reasons.push(`manual_acceptance_source_outside_project:${id}`);
        continue;
      }
      if ([reportPath, manifestPath].some(candidate => samePath(candidate, real))) {
        reasons.push(`manual_acceptance_source_self_referential_or_outside:${id}`);
        continue;
      }
      const declared = [entry.sha256, entry.hash]
        .filter(value => value !== undefined)
        .map(value => String(value).replace(/^sha256:/i, '').toLowerCase());
      const actual = hash(await fs.readFile(resolved));
      if (declared.length === 0 || declared.some(expected =>
        !/^[0-9a-f]{64}$/.test(expected) || expected !== actual)) {
        reasons.push(`manual_acceptance_source_hash_mismatch:${id}`);
      }
    } catch {
      reasons.push(`manual_acceptance_source_missing:${id}`);
    }
  }
  return result;
}

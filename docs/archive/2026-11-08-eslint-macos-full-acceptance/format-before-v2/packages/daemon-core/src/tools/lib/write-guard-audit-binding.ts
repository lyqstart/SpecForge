import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { readHardStopResolutionLog } from './hard-stop-resolution-log';
import { readWriteGuardAuthorizations, writeGuardAuthorizationLogPath } from './write-guard-authorization-log';

const LABEL = 'Write Guard Evidence SHA256';

/** Raw-byte binding: no timestamp, report text, or caller-provided counters are trusted. */
export function readWriteGuardAuditBinding(projectRoot: string, workItemDir: string) {
  const files = [path.join(workItemDir, 'write_guard_log.jsonl'),
    path.join(workItemDir, 'hard_stop_resolution.jsonl'), writeGuardAuthorizationLogPath(projectRoot)];
  const inputs = files.map(file => {
    try {
      if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('not a regular file');
      return fs.readFileSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('WRITE_GUARD_AUDIT_SOURCE_UNREADABLE');
    }
  });
  const entries = (inputs[0]?.toString('utf8') ?? '').split(/\r?\n/).filter(line => line.trim()).map(line => {
    let entry: any;
    try { entry = JSON.parse(line); } catch { throw new Error('WRITE_GUARD_AUDIT_LOG_INVALID'); }
    if (!entry || typeof entry.path !== 'string' || typeof entry.allowed !== 'boolean') throw new Error('WRITE_GUARD_AUDIT_LOG_INVALID');
    return entry;
  });
  // These owners validate their current schemas; corrupt policy evidence must not look absent.
  readHardStopResolutionLog(workItemDir);
  readWriteGuardAuthorizations(projectRoot);
  const sha256 = createHash('sha256').update(JSON.stringify(inputs.map(bytes => bytes === null
    ? null : createHash('sha256').update(bytes).digest('hex')))).digest('hex');
  return { sha256, hasEvidence: inputs.some(bytes => bytes !== null), blocked: entries.filter(entry => !entry.allowed).length };
}

export function bindWriteGuardAudit(text: string, projectRoot: string, workItemDir: string, expectedHash?: string): string {
  const current = readWriteGuardAuditBinding(projectRoot, workItemDir);
  if (expectedHash && expectedHash !== current.sha256) throw new Error('WRITE_GUARD_AUDIT_SOURCE_CHANGED');
  return `${text}\n${LABEL}: ${current.sha256}\n`;
}

export function inspectWriteGuardAuditBinding(projectRoot: string, workItemDir: string, text: string | null) {
  try {
    const current = readWriteGuardAuditBinding(projectRoot, workItemDir);
    const matches = [...(text ?? '').matchAll(/^Write Guard Evidence SHA256: ([a-f0-9]{64})$/gm)];
    // Legacy reports with no underlying guard/policy evidence are still meaningful.
    const bound = matches.length === 1 ? matches[0][1] === current.sha256 : matches.length === 0 && !current.hasEvidence;
    const reportedBlocked = /-\s*Blocked write attempts:\s*(\d+)/i.exec(text ?? '');
    const passed = bound && (current.blocked === 0 || (reportedBlocked !== null && Number(reportedBlocked[1]) >= current.blocked));
    return { passed, reason: passed ? undefined : 'WRITE_GUARD_AUDIT_STALE: rerun sf_changed_files_audit and verification; preserve and resolve blocked attempts', ...current };
  } catch (error) {
    return { passed: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** A new binding requirement alone does not invalidate a historical closure. Prove an omission at its actual event time. */
export function inspectClosedWriteGuardAudit(workItemDir: string, closeEventAt: string | null) {
  if (!closeEventAt || !Number.isFinite(Date.parse(closeEventAt))) return null;
  try {
    const audit = fs.readFileSync(path.join(workItemDir, 'changed_files_audit.md'));
    const log = fs.readFileSync(path.join(workItemDir, 'write_guard_log.jsonl'));
    const entries = log.toString('utf8').split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
    const blockedAtClose = entries.filter(entry => entry.allowed === false &&
      typeof entry.timestamp === 'string' && Date.parse(entry.timestamp) <= Date.parse(closeEventAt)).length;
    const count = /-\s*Blocked write attempts:\s*(\d+)/i.exec(audit.toString('utf8'));
    if (!count || Number(count[1]) >= blockedAtClose) return null;
    return { reason: `WRITE_GUARD_AUDIT_OMITTED_PRE_CLOSE_DENIALS: reported=${count[1]}, factual=${blockedAtClose}`,
      audit_sha256: createHash('sha256').update(audit).digest('hex'),
      log_sha256: createHash('sha256').update(log).digest('hex'), close_event_at: closeEventAt };
  } catch { return null; } // Missing/unreadable evidence is not proof of invalidity.
}

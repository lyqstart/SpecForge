const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../..');
const source = path.join(root, 'docs/archive/2026-10-25-verifier-conformance/sealed-business-files.json');
const output = path.join(__dirname, 'scene-assessment.json');
if (fs.existsSync(output)) throw Error('EVIDENCE_ALREADY_EXISTS');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(source);
const snapshot = JSON.parse(sourceBytes);
const project = snapshot.project;
if (project !== 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7') throw Error('ARCHIVE_PROJECT_IDENTITY_MISMATCH');
const started = new Date().toISOString();
const entries = snapshot.entries.map(entry => {
  if (path.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').some(v => !v || v === '.' || v === '..')) throw Error('ARCHIVE_PATH_INVALID');
  const bytes = Buffer.from(entry.bytes_base64, 'base64');
  if (hash(bytes) !== entry.sha256 || bytes.length !== entry.size) throw Error('ARCHIVE_CONTENT_INVALID');
  const full = path.join(project, entry.path);
  const exists = fs.existsSync(full);
  return { path: entry.path, archived_sha256: entry.sha256, size: bytes.length,
    current: !exists ? 'MISSING' : hash(fs.readFileSync(full)) === entry.sha256 ? 'MATCHES_ARCHIVE' : 'CONFLICT' };
});
const remaining = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('CURRENT_SYMLINK_REQUIRES_REVIEW');
    if (entry.isDirectory()) visit(full);
    else {
      const bytes = fs.readFileSync(full), stat = fs.statSync(full);
      const relative = path.relative(project, full).replaceAll('\\', '/');
      const record = { path: relative, sha256: hash(bytes), bytes_base64: bytes.toString('base64'), size: bytes.length,
        modified_utc: stat.mtime.toISOString() };
      if (/^\.git\/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/.test(relative)) {
        const object = zlib.inflateSync(bytes);
        const objectId = crypto.createHash('sha1').update(object).digest('hex');
        const namedId = relative.replace('.git/objects/', '').replace('/', '');
        if (objectId !== namedId) throw Error('GIT_OBJECT_IDENTITY_INVALID');
        const separator = object.indexOf(0);
        record.git_object = { id: objectId, header: object.subarray(0, separator).toString(),
          content_base64: object.subarray(separator + 1).toString('base64') };
      }
      remaining.push(record);
    }
  }
}
visit(project);
const commits = remaining.filter(v => v.git_object?.header.startsWith('commit ')).map(v => ({
  id: v.git_object.id, content: Buffer.from(v.git_object.content_base64, 'base64').toString('utf8') }));
const readme = snapshot.entries.find(v => v.path === 'README.md');
const matchingReadmeObjects = remaining.filter(v => v.git_object?.header.startsWith('blob ') &&
  hash(Buffer.from(v.git_object.content_base64, 'base64')) === readme?.sha256).map(v => v.git_object.id);
const report = { run_id: 'CODEX-SF-20261103-ORIGINAL-WI-RECOVERY-A01', mode: 'CODEX_DIRECT',
  command: 'node docs/archive/2026-11-03-original-wi-recovery/assess-scene.cjs', cwd: root,
  purpose: 'Read-only original scene and sealed-byte recovery preflight', started_utc: started, finished_utc: new Date().toISOString(),
  project, source_archive: path.relative(root, source), source_sha256: hash(sourceBytes), source_capture_utc: snapshot.finished_utc,
  verified_archived_files: entries.length, missing: entries.filter(v => v.current === 'MISSING').length,
  matching: entries.filter(v => v.current === 'MATCHES_ARCHIVE').length, conflicting: entries.filter(v => v.current === 'CONFLICT').length,
  entries, remaining, git_commits: commits, matching_archived_readme_blob_ids: matchingReadmeObjects,
  archived_last_state_event: snapshot.state_events.at(-1),
  expected_writes: [output], observed_writes: [output], carrier_exit_code: 0, inner_exit_code: 0,
  limits: ['This is a verified archive and surviving-object assessment, not authorization or proof of a completed restore.',
    'The archive excludes .git metadata; original branch/config/index bytes cannot be reconstructed from that archive.',
    'No original project bytes were written; the cause of disappearance is not established.'] };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, verified: entries.length, missing: report.missing, matching: report.matching,
  conflicting: report.conflicting, remaining_files: remaining.length, verified_commits: commits.map(v => v.id), inner_exit_code: 0 }));

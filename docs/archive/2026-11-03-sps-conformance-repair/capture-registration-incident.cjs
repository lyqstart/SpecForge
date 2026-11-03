const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const output = path.join(__dirname, 'registration-incident-snapshot.json');
const files = [
  '.specforge/config/project.json', '.specforge/project/spec_manifest.json',
  '.specforge/project/modules/CORE/module.json', '.specforge/project/modules/CORE/requirements.md',
  '.specforge/project/modules/CORE/design.md', '.specforge/project/modules/CORE/trace.md',
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => cp.execFileSync('git', args, { cwd: root, windowsHide: true });
const started = new Date().toISOString();
const head = git(['rev-parse', 'HEAD']).toString().trim();
const status = git(['status', '--porcelain=v1', '--untracked-files=all', '--', '.specforge']).toString();
const entries = files.map(file => {
  const absolute = path.join(root, file);
  const bytes = fs.readFileSync(absolute);
  const stat = fs.statSync(absolute);
  const tracked = git(['ls-files', '--', file]).toString().trim().length > 0;
  const baseline = tracked ? git(['show', `${head}:${file}`]) : null;
  return { file, classification: 'CORROBORATED_PROBE_INITIALIZATION_WRITE',
    sha256: hash(bytes), bytes_base64: bytes.toString('base64'), size: bytes.length,
    created_utc: stat.birthtime.toISOString(), modified_utc: stat.mtime.toISOString(),
    baseline_kind: tracked ? 'GIT_BLOB_NOT_PREPROBE_RAW_BYTES' : 'UNTRACKED_NO_PREPROBE_BYTE_SNAPSHOT',
    baseline_sha256: baseline ? hash(baseline) : null,
    baseline_bytes_base64: baseline ? baseline.toString('base64') : null };
});
const inventory = [];
function visit(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) visit(absolute);
    else {
      const stat = fs.statSync(absolute);
      if (stat.mtimeMs >= Date.parse('2026-11-02T17:18:00Z')) inventory.push({
        file: path.relative(root, absolute).replaceAll('\\', '/'), size: stat.size,
        modified_utc: stat.mtime.toISOString(), sha256: hash(fs.readFileSync(absolute)),
      });
    }
  }
}
visit(path.join(root, '.specforge'));
const document = { run_id: 'CODEX-SF-20261103-SPS-GAP-REPAIR-A01', mode: 'CODEX_DIRECT',
  command: 'node docs/archive/2026-11-03-sps-conformance-repair/capture-registration-incident.cjs',
  cwd: root, purpose: 'Preserve initialization incident evidence without changing live governance files',
  started_utc: started, head, status, entries, recent_specforge_inventory: inventory,
  limits: ['Recent-file inventory uses modification time, not a causal process audit.',
    'Git blob is a semantic baseline; it does not prove original CRLF/LF bytes.',
    'This snapshot is not authority to restore or delete live governance files.'],
  expected_writes: [output], observed_writes: [output], carrier_exit_code: 0, inner_exit_code: 0 };
fs.writeFileSync(output, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
const check = JSON.parse(fs.readFileSync(output, 'utf8'));
for (const entry of check.entries) {
  if (hash(Buffer.from(entry.bytes_base64, 'base64')) !== entry.sha256) throw new Error(`Snapshot hash mismatch: ${entry.file}`);
  if (hash(fs.readFileSync(path.join(root, entry.file))) !== entry.sha256) throw new Error(`Live file changed during capture: ${entry.file}`);
}
console.log(JSON.stringify({ output, sha256: hash(fs.readFileSync(output)), entries: entries.length,
  recent_files: inventory.length, verified: true, utc: new Date().toISOString(), inner_exit_code: 0 }));

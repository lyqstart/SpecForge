// Console-only verification after commit/merge; does not mutate sealed evidence.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const prefix = path.relative(process.cwd(), __dirname).replaceAll('\\', '/') + '/';
const manifest = fs.readFileSync(path.join(__dirname, 'manifest.sha256'));
const seal = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest-check.json')));
if (sha(manifest) !== seal.manifest_sha256) throw Error('MANIFEST_BINDING_DRIFT');
const entries = manifest.toString().trimEnd().split('\n').map(line => ({ file: line.slice(66), sha256: line.slice(0, 64) }));
if (entries.length !== seal.files) throw Error('MANIFEST_COVERAGE_DRIFT');
for (const entry of entries) if (sha(fs.readFileSync(path.join(__dirname, entry.file))) !== entry.sha256) throw Error('WORKTREE_EVIDENCE_DRIFT:' + entry.file);
const objects = [...entries, { file: 'manifest.sha256', sha256: sha(manifest) }, { file: 'manifest-check.json', sha256: sha(fs.readFileSync(path.join(__dirname, 'manifest-check.json'))) }];
const batch = cp.execFileSync('git', ['cat-file', '--batch'], { input: objects.map(entry => 'HEAD:' + prefix + entry.file + '\n').join(''), windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
let offset = 0;
for (const entry of objects) {
  const end = batch.indexOf(10, offset), header = batch.subarray(offset, end).toString();
  const match = header.match(/^[a-f0-9]+ blob (\d+)$/); if (!match) throw Error('COMMITTED_MEMBER_MISSING:' + entry.file);
  const size = Number(match[1]), bytes = batch.subarray(end + 1, end + 1 + size);
  if (sha(bytes) !== entry.sha256) throw Error('COMMITTED_BYTES_DRIFT:' + entry.file); offset = end + 1 + size + 1;
}
const git = args => cp.execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const result = { utc: new Date().toISOString(), head: git(['rev-parse', 'HEAD']), sealed_files: entries.length, committed_members_verified: objects.length,
  status: git(['status', '--porcelain=v1']), self_check: 'PASS', inner_exit_code: 0 };
if (result.status) throw Error('FINAL_WORKTREE_NOT_CLEAN');
if (process.argv.includes('--require-remote')) {
  result.remote_main = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  if (result.head !== result.remote_main || git(['branch', '--show-current']) !== 'main') throw Error('FINAL_MAIN_REMOTE_DRIFT');
}
console.log(JSON.stringify(result));

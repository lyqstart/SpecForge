// Seal publishable evidence only; private raw sources remain local and excluded by Git.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const prefix = path.relative(process.cwd(), __dirname).replaceAll('\\', '/') + '/';
const names = [...new Set(cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { maxBuffer: 128 * 1024 * 1024 })
  .toString().split('\0').filter(name => name.startsWith(prefix)))];
const entries = names.map(name => name.slice(prefix.length)).filter(name => name && !['manifest.sha256', 'manifest-check.json'].includes(name)).sort();
const manifestPath = path.join(__dirname, 'manifest.sha256');
for (const file of ['manifest.sha256', 'manifest-check.json']) if (fs.existsSync(path.join(__dirname, file))) throw Error('SEAL_ALREADY_EXISTS');
const manifest = entries.map(name => `${sha(fs.readFileSync(path.join(__dirname, name)))}  ${name}\n`).join('');
fs.writeFileSync(manifestPath, manifest, { flag: 'wx' });
for (const line of fs.readFileSync(manifestPath, 'utf8').trimEnd().split('\n')) {
  if (sha(fs.readFileSync(path.join(__dirname, line.slice(66)))) !== line.slice(0, 64)) throw Error('FINAL_MANIFEST_MISMATCH');
}
const result = { utc: new Date().toISOString(), run_id: 'CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01',
  manifest_sha256: sha(fs.readFileSync(manifestPath)), files: entries.length, self_check: 'PASS', inner_exit_code: 0,
  exclusions: 'Git-ignored private native reasoning/raw Cookie source; manifest and this check receipt cannot recursively contain their own hashes.' };
fs.writeFileSync(path.join(__dirname, 'manifest-check.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));

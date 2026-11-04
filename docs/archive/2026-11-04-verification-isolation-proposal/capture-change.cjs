const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => cp.execFileSync('git', args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const base = git(['rev-parse', 'HEAD']).toString().trim();
const names = [...new Set(Buffer.concat([git(['diff', '--name-only', '-z']), git(['ls-files', '--others', '--exclude-standard', '-z'])]).toString().split('\0').filter(Boolean))].sort();
const entries = names.map(file => {
  const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
  let prior = null;
  try { prior = git(['show', `${base}:${file}`]); } catch {}
  return { file, current_sha256: current && sha(current), current_base64: current && current.toString('base64'),
    baseline_sha256: prior && sha(prior), baseline_base64: prior && prior.toString('base64') };
});
const out = path.join(__dirname, process.argv[2] || 'implementation');
fs.mkdirSync(out, { recursive: false });
fs.writeFileSync(path.join(out, 'change-set.json'), JSON.stringify({ utc: new Date().toISOString(), base, entries }, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'tracked.diff'), git(['diff', '--binary']), { flag: 'wx' });
const files = fs.readdirSync(out).sort();
const manifest = files.map(file => `${sha(fs.readFileSync(path.join(out, file)))}  ${file}\n`).join('');
fs.writeFileSync(path.join(out, 'manifest.sha256'), manifest, { flag: 'wx' });
for (const line of manifest.trimEnd().split('\n')) if (sha(fs.readFileSync(path.join(out, line.slice(66)))) !== line.slice(0, 64)) throw Error('SNAPSHOT_HASH_MISMATCH');
console.log(JSON.stringify({ files: entries.length, base, manifest_sha256: sha(Buffer.from(manifest)), self_check: 'PASS', inner_exit_code: 0 }));

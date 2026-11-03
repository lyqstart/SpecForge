const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = path.join(__dirname, 'manifest.sha256');
const names = fs.readdirSync(__dirname).filter(name => name !== 'manifest.sha256').sort();
if (names.some(name => !fs.statSync(path.join(__dirname, name)).isFile())) throw Error('UNEXPECTED_EVIDENCE_DIRECTORY');
fs.writeFileSync(manifest, names.map(name => `${sha(path.join(__dirname, name))}  ${name}\n`).join(''), { flag: 'wx' });
for (const line of fs.readFileSync(manifest, 'utf8').trimEnd().split('\n')) {
  const expected = line.slice(0, 64), name = line.slice(66);
  if (sha(path.join(__dirname, name)) !== expected) throw Error(`EVIDENCE_HASH_MISMATCH:${name}`);
}
console.log(JSON.stringify({ utc: new Date().toISOString(), manifest, files: names.length,
  manifest_sha256: sha(manifest), self_check: 'PASS', inner_exit_code: 0 }));

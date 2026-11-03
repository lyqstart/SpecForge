const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = path.join(__dirname, 'manifest.sha256');
const names = fs.readdirSync(__dirname).filter(name => name !== 'manifest.sha256').sort();
if (names.some(name => !fs.statSync(path.join(__dirname, name)).isFile())) throw Error('UNEXPECTED_EVIDENCE_DIRECTORY');
fs.writeFileSync(manifest, names.map(name => `${sha(path.join(__dirname, name))}  ${name}\n`).join(''), { flag: 'wx' });
for (const line of fs.readFileSync(manifest, 'utf8').trimEnd().split('\n')) {
  if (sha(path.join(__dirname, line.slice(66))) !== line.slice(0, 64)) throw Error('EVIDENCE_HASH_MISMATCH');
}
console.log(JSON.stringify({ utc: new Date().toISOString(), manifest_sha256: sha(manifest), files: names.length, self_check: 'PASS', inner_exit_code: 0 }));

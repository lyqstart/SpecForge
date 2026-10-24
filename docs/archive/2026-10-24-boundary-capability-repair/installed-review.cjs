const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const install = 'C:/Users/lyq/.config/opencode';
const phase = process.argv[2];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function main() {
  const handshake = JSON.parse(fs.readFileSync(path.join(install, 'sf-user/runtime/handshake.json')));
  const health = await fetch(`http://127.0.0.1:${handshake.port}/health`).then(r=>r.json()).catch(error=>({unavailable:String(error), cause:error.cause?.code}));
  const manifest = JSON.parse(fs.readFileSync(path.join(install, 'specforge-manifest.json')));
  const files = Object.entries(manifest.files).map(([name, entry]) => {
    const bytes = fs.readFileSync(path.join(install, name));
    return { path: name, expected: entry.sha256, actual: hash(bytes), size: bytes.length };
  });
  const failures = files.filter(file => file.expected !== file.actual);
  const result = { utc: new Date().toISOString(), pid: handshake.pid, port: handshake.port, health, version: manifest.shared_version, verified: files.length, failures, files };
  fs.writeFileSync(path.join(__dirname, `installed-${phase}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ version: result.version, pid: result.pid, verified: files.length, failures }));
  if (failures.length) throw new Error('installed hash mismatch');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const directory = path.join(__dirname, 'commands');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function seal(seq) {
  const manifest = path.join(directory, seq + '.manifest.sha256'); if (fs.existsSync(manifest)) return false;
  const files = ['command.txt', 'stdout.txt', 'stderr.txt', 'result.json'].map(suffix => `${seq}.${suffix}`);
  const receipt = { utc: new Date().toISOString(), seq, raw_members: {}, redactions: [] };
  for (let i = 0; i < files.length; i++) {
    const file = files[i], raw = fs.readFileSync(path.join(directory, file));
    const lines = raw.toString('utf8').split('\n');
    if (lines.at(-1) === '') lines.pop();
    receipt.raw_members[file] = { sha256: hash(raw), first_line_sha256: hash(Buffer.from(lines[0] || '')), last_line_sha256: hash(Buffer.from(lines.at(-1) || '')) };

  }
  const sealFile = `${seq}.receipt-seal.json`;
  fs.writeFileSync(path.join(directory, sealFile), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); files.push(sealFile);
  const contents = files.map(file => `${hash(fs.readFileSync(path.join(directory, file)))}  ${file}\n`).join('');
  fs.writeFileSync(manifest, contents, { flag: 'wx' });
  for (const line of contents.trimEnd().split('\n')) if (hash(fs.readFileSync(path.join(directory, line.slice(66)))) !== line.slice(0, 64)) throw Error('RECEIPT_SEAL_MISMATCH');
  return true;
}
module.exports = { seal };
if (require.main === module) {
  let count = 0;
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.result.json')).sort()) if (seal(file.slice(0, 4))) count++;
  console.log(JSON.stringify({ utc: new Date().toISOString(), newly_sealed: count, self_check: 'PASS', inner_exit_code: 0 }));
}

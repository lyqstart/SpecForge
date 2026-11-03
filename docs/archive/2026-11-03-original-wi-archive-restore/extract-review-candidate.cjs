const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = 'original-audit-approval-filesystem.json', audit = JSON.parse(fs.readFileSync(path.join(__dirname, source)));
const prefix = '.specforge/work-items/WI-0001/';
const files = audit.files.filter(file => file.path.startsWith(prefix + 'candidates/') || file.path === prefix + 'candidate_manifest.json');
if (files.length !== 10) throw Error('UNEXPECTED_CANDIDATE_COUNT');
const root = path.join(__dirname, 'review-candidate'); fs.mkdirSync(root);
for (const file of files) {
  const relative = file.path.slice(prefix.length); if (relative.split('/').some(item => !item || item === '..' || item === '.')) throw Error('UNSAFE_MEMBER');
  const raw = Buffer.from(file.bytes_base64, 'base64'); if (sha(raw) !== file.sha256) throw Error('SOURCE_HASH_MISMATCH');
  const destination = path.join(root, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, raw, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== file.sha256) throw Error('EXTRACTION_MISMATCH');
}
fs.writeFileSync(path.join(root, 'manifest.sha256'), files.map(file => file.sha256 + '  ' + file.path.slice(prefix.length) + '\n').join(''), { flag: 'wx' });
console.log(JSON.stringify({ utc: new Date().toISOString(), source, source_sha256: sha(fs.readFileSync(path.join(__dirname, source))), files: files.length, self_check: 'PASS', inner_exit_code: 0 }));

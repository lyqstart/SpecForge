// Native reasoning is not factual product evidence. Retain source locally and publish a hash-bound derivative.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const directoryName = process.argv[2] || 'native-resume';
if (!/^native-resume(?:-[a-z0-9-]+)?$/.test(directoryName)) throw Error('UNSAFE_NATIVE_DIRECTORY');
const dir = path.join(__dirname, directoryName), records = [];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const failedStdout = path.join(__dirname, 'commands/0048.stdout.txt');
const redactedStdout = path.join(__dirname, 'commands/0048.stdout-redacted.txt');
if (fs.existsSync(failedStdout) && !fs.existsSync(redactedStdout)) {
  const raw = fs.readFileSync(failedStdout);
  const safe = raw.toString().replace(/("set-cookie"\s*:\s*")[^"\r\n]*(")/gi, '$1[REDACTED]$2');
  if (safe.includes('acw_tc=')) throw Error('COOKIE_REDACTION_INCOMPLETE');
  fs.writeFileSync(redactedStdout, `Source SHA-256: ${sha(raw)}\nRedaction: response Cookie omitted; source retained locally and excluded from Git.\n${safe}`, { flag: 'wx' });
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  if (result.type === 'reasoning' && typeof result.text === 'string') {
    result.text_sha256 = sha(Buffer.from(result.text)); result.original_text_length = result.text.length;
    result.text = '[Model reasoning omitted; not factual evidence]';
  }
  return result;
}
for (const name of fs.readdirSync(dir).filter(name => (/^inspection-.+\.json$/.test(name) || name === 'new-messages.json') && !name.endsWith('-redacted.json'))) {
  const destination = name.replace(/\.json$/, '-redacted.json');
  if (fs.existsSync(path.join(dir, destination))) continue;
  const raw = fs.readFileSync(path.join(dir, name)), value = JSON.parse(raw);
  fs.writeFileSync(path.join(dir, destination), JSON.stringify({ source_sha256: sha(raw), source_file: name,
    redaction: 'Model reasoning text omitted; source retained locally and excluded from Git. Tool calls/results and document content retained.', data: redact(value) }, null, 2), { flag: 'wx' });
  records.push({ source: name, source_sha256: sha(raw), derivative: destination });
}
console.log(JSON.stringify({ utc: new Date().toISOString(), derivatives: records, inner_exit_code: 0 }));

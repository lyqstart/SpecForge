// Scan actual publication candidates, including nested Base64 snapshots, without printing the sensitive value.
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const secretSource = fs.readFileSync(path.join(__dirname, 'commands/0048.stdout.txt'), 'utf8');
const secret = secretSource.match(/acw_tc=[a-f0-9]+/i)?.[0]; if (!secret) throw Error('EXPECTED_LOCAL_SOURCE_NOT_FOUND');
const staged = process.argv.includes('--staged');
const git = args => cp.execFileSync('git', args, { windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
const names = staged ? git(['diff', '--cached', '--name-only', '-z']).toString().split('\0').filter(Boolean)
  : [...new Set(Buffer.concat([git(['diff', '--name-only', '-z']), git(['ls-files', '--others', '--exclude-standard', '-z'])]).toString().split('\0').filter(Boolean))];
let decoded = 0;
function check(raw, file, depth = 0) {
  if (depth > 16) throw Error('EVIDENCE_NESTING_LIMIT');
  const text = raw.toString('utf8');
  if (text.includes(secret) || /\bacw_tc=[a-f0-9]{20,}/i.test(text)) throw Error('SENSITIVE_VALUE_IN_PUBLICATION:' + file);
  let value; try { value = JSON.parse(text); } catch { return; }
  const visit = object => {
    if (!object || typeof object !== 'object') return;
    for (const [key, item] of Object.entries(object)) {
      if (typeof item === 'string' && /(?:_base64|Base64)$/.test(key)) { decoded++; check(Buffer.from(item, 'base64'), file + ':' + key, depth + 1); }
      else if (typeof item === 'object') visit(item);
    }
  };
  visit(value);
}
for (const file of names) {
  const raw = staged ? git(['show', ':' + file]) : fs.readFileSync(file);
  check(raw, file);
}
const result = { utc: new Date().toISOString(), mode: staged ? 'staged' : 'working-publication-candidates', files: names.length, decoded_base64_members: decoded,
  sensitive_source_retained_locally: true, sensitive_value_published: false, inner_exit_code: 0 };
const suffix = process.argv.find(arg => arg.startsWith('--suffix='))?.slice(9) || '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw Error('INVALID_OUTPUT_SUFFIX');
const out = path.join(__dirname, (staged ? 'staged-privacy-check' : 'publication-privacy-check') + (suffix ? '-' + suffix : '') + '.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(result));

// Evidence carrier: argv-only process invocation, immutable command receipts.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = __dirname, cwd = process.cwd();
const [purpose, expected, executable, ...args] = process.argv.slice(2);
if (!executable) throw new Error('purpose expected executable argv required');
const dir = path.join(root, 'commands'); fs.mkdirSync(dir, { recursive: true });
let number = 1, seq, base;
const started = new Date().toISOString();
const command = { executable, args, cwd, purpose, expected_writes: expected, started_utc: started };
for (;;) {
  seq = String(number++).padStart(4, '0'); base = path.join(dir, seq);
  try { fs.writeFileSync(base + '.command.txt', JSON.stringify(command, null, 2) + '\n', { flag: 'wx' }); break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const snapshot = () => cp.spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd, encoding: 'utf8', windowsHide: true }).stdout;
const before = snapshot();
fs.appendFileSync(path.join(root, 'journal.jsonl'), JSON.stringify({ event: 'command_started', seq, ...command }) + '\n');
const result = cp.spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const stdout = result.stdout || '', stderr = (result.stderr || '') + (result.error ? String(result.error) : '');
fs.writeFileSync(base + '.stdout.txt', stdout, { flag: 'wx' });
fs.writeFileSync(base + '.stderr.txt', stderr, { flag: 'wx' });
const receipt = { ...command, finished_utc: new Date().toISOString(), carrier_exit_code: Number.isInteger(result.status) ? result.status : 1,
  inner_exit_code: Number.isInteger(result.status) ? result.status : 1, signal: result.signal,
  observed_writes: { repository_status_before: before, repository_status_after: snapshot(), other: 'See expected writes and owner-specific receipt; status does not enumerate external runtime writes.' } };
fs.writeFileSync(base + '.result.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.appendFileSync(path.join(root, 'journal.jsonl'), JSON.stringify({ event: 'command_finished', seq, ...receipt }) + '\n');
process.stdout.write(stdout); process.stderr.write(stderr);
console.log(JSON.stringify({ receipt: seq, inner_exit_code: receipt.inner_exit_code, finished_utc: receipt.finished_utc }));
process.exitCode = receipt.inner_exit_code;

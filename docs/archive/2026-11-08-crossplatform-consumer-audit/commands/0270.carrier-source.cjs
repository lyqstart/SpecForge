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
const crypto = require('node:crypto'), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const carrierBytes = fs.readFileSync(__filename);
const entrySources = args.flatMap((arg,index) => {
  if (!/\.(?:[cm]?js|ts|ps1)$/i.test(arg)) return [];
  const file = path.resolve(cwd,arg);
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return [];
  const bytes = fs.readFileSync(file);
  return [{ argument_index:index,path:file,sha256:hash(bytes),size:bytes.length,extension:path.extname(file),bytes }];
});
const command = { run_id: "CODEX-SF-20261108-CROSSPLATFORM-CONSUMER-A01", mode: "CODEX_DIRECT", executable, args, cwd, purpose, expected_writes: expected, started_utc: started,
  carrier_source_sha256:hash(carrierBytes),entry_sources:entrySources.map(({bytes,...value})=>value) };
for (;;) {
  seq = String(number++).padStart(4, '0'); base = path.join(dir, seq);
  try { fs.writeFileSync(base + '.command.txt', JSON.stringify(command, null, 2) + '\n', { flag: 'wx' }); break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
fs.writeFileSync(base+'.carrier-source.cjs',carrierBytes,{flag:'wx'});
for (const [index,source] of entrySources.entries()) fs.writeFileSync(base+'.entry-source-'+index+source.extension,source.bytes,{flag:'wx'});
const snapshot = () => {
  const observed=cp.spawnSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  if(observed.error||observed.status!==0)throw Error('EVIDENCE_GIT_STATUS_UNAVAILABLE:'+String(observed.error?.code??observed.status));
  return observed.stdout;
};
const before = snapshot();
fs.appendFileSync(path.join(root, 'journal.jsonl'), JSON.stringify({ event: 'command_started', seq, ...command }) + '\n');
const result = cp.spawnSync(executable, args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
// Preserve raw pipes independently of the display code page from this revision onward.
fs.writeFileSync(base + '.stdout.raw.bin', result.stdout || Buffer.alloc(0), { flag: 'wx' });
fs.writeFileSync(base + '.stderr.raw.bin', result.stderr || Buffer.alloc(0), { flag: 'wx' });
const stdout = (result.stdout || Buffer.alloc(0)).toString('utf8'), stderr = (result.stderr || Buffer.alloc(0)).toString('utf8') + (result.error ? String(result.error) : '');
fs.writeFileSync(base + '.stdout.txt', stdout, { flag: 'wx' });
fs.writeFileSync(base + '.stderr.txt', stderr, { flag: 'wx' });
const actualInnerExitAvailable = Number.isInteger(result.status);
const receipt = { ...command, finished_utc: new Date().toISOString(), carrier_exit_code: actualInnerExitAvailable ? result.status : 1,
  inner_exit_code: actualInnerExitAvailable ? result.status : null, numeric_inner_exit_code_available: actualInnerExitAvailable,
  process_started: Number.isInteger(result.pid) && result.pid > 0, child_pid: Number.isInteger(result.pid) && result.pid > 0 ? result.pid : null,
  spawn_error: result.error ? { name: result.error.name, code: result.error.code ?? null } : null, signal: result.signal,
  observed_writes: { repository_status_before: before, repository_status_after: snapshot(), other: 'See expected writes and owner-specific receipt; status does not enumerate external runtime writes.' } };
fs.writeFileSync(base + '.result.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
// Keep complete before/after status in the immutable raw receipt, once. The
// append-only journal binds that receipt instead of duplicating megabytes of
// growing untracked evidence on every command. Earlier journal bytes stay intact.
const receiptBytes=fs.readFileSync(base+'.result.json');
fs.appendFileSync(path.join(root, 'journal.jsonl'), JSON.stringify({ event: 'command_finished', seq, ...receipt,
  observed_writes: { raw_receipt: seq+'.result.json', raw_receipt_sha256: require('node:crypto').createHash('sha256').update(receiptBytes).digest('hex'),
    repository_status_fields: ['observed_writes.repository_status_before','observed_writes.repository_status_after'], other: receipt.observed_writes.other } }) + '\n');
require('./seal-receipts.cjs').seal(seq);
process.stdout.write(stdout); process.stderr.write(stderr);
console.log(JSON.stringify({ receipt: seq, inner_exit_code: receipt.inner_exit_code, finished_utc: receipt.finished_utc }));
process.exitCode = receipt.carrier_exit_code;

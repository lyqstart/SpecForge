const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const bun = process.argv[2];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-activation-http-review-'));
const config = path.join(root, '.specforge/config/project.json');
const activation = path.join(root, '.specforge/runtime/configuration-activation.json');
fs.mkdirSync(path.dirname(config), { recursive: true });
const original = JSON.stringify({ schema_version: '1.0', timeoutMs: 2000 });
fs.writeFileSync(config, original);
const records = []; let child, port, sequence = 0;
async function start(initial = false) {
  const id = ++sequence; let text = '';
  child = cp.spawn(bun, [path.join(__dirname, 'http-fixture.ts'), root, ...(initial ? ['--initial'] : [])], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = fs.createWriteStream(path.join(__dirname, `http-${id}.stdout.txt`), { flags: 'wx' });
  const stderr = fs.createWriteStream(path.join(__dirname, `http-${id}.stderr.txt`), { flags: 'wx' });
  child.stdout.on('data', b => { text += b; stdout.write(b); }); child.stderr.pipe(stderr);
  child.once('exit', () => stdout.end());
  for (let i = 0; i < 100; i++) {
    const match = text.match(/READY=(.+)/);
    if (match) { const ready = JSON.parse(match[1]); port = ready.port; records.push({ start: ready, utc: new Date().toISOString() }); return ready.pid; }
    if (child.exitCode !== null) throw new Error('fixture exited before readiness');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('readiness timeout');
}
async function stop() {
  if (child && child.exitCode === null) {
    const done = new Promise(resolve => child.once('exit', (code, signal) => { records.push({ stopped: child.pid, code, signal }); resolve(); }));
    child.kill(); await done;
  }
}
async function read(label) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/tool/invoke`, { method: 'POST', headers: { Authorization: 'Bearer isolated-activation-test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'sf_state_read', args: { work_item_id: 'all' }, context: { directory: root, agent: 'sf-orchestrator' } }) });
  const body = await response.json(); records.push({ label, utc: new Date().toISOString(), status: response.status, body });
  assert.equal(response.status, 200); return body.data;
}
async function main() {
  const firstPid = await start(true);
  const accepted = fs.readFileSync(activation);
  assert.equal((await read('normal accepted configuration')).success, true);
  fs.renameSync(activation, activation + '.original-evidence');
  assert.match((await read('missing record, unchanged config, existing process')).error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
  assert.equal(fs.existsSync(activation), false);
  fs.writeFileSync(config, JSON.stringify({ schema_version: '1.0', timeoutMs: 10000 }));
  assert.match((await read('missing record, changed config, existing process')).error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
  await stop(); const nextPid = await start(); assert.notEqual(firstPid, nextPid);
  assert.match((await read('missing record, changed config, restarted process')).error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
  assert.equal(fs.existsSync(activation), false);
  // Restore exact evidence in this isolated fault-injection fixture only.
  fs.renameSync(activation + '.original-evidence', activation); fs.writeFileSync(config, original);
  assert.equal((await read('original evidence and configuration restored')).success, true);
  assert.deepEqual(fs.readFileSync(activation), accepted);
  records.push({ verdict: 'PASS', source: 'fresh processes loading built dist via real HTTP', original_activation_sha256: crypto.createHash('sha256').update(accepted).digest('hex') });
}
main().catch(error => { records.push({ failure: String(error) }); process.exitCode = 1; }).finally(async () => {
  await stop();
  fs.writeFileSync(path.join(__dirname, 'http-review.json'), JSON.stringify({ root, finished: new Date().toISOString(), exit_code: process.exitCode ?? 0, records }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ root, exit_code: process.exitCode ?? 0 }));
});

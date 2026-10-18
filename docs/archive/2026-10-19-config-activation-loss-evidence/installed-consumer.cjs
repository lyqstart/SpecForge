const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-installed-activation-loss-'));
const records = [];
async function main() {
  const config = path.join(root, '.specforge/config/project.json');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ schema_version: '1.0', timeoutMs: 2000 }));
  const fixture = path.resolve('packages/daemon-core/tests/fixtures/configuration-activation-process.ts');
  const child = cp.spawnSync(process.argv[2], [fixture, root, 'initialize-active'], { encoding: 'utf8', windowsHide: true });
  records.push({ fixture_exit_code: child.status, stdout: child.stdout, stderr: child.stderr });
  assert.equal(child.status, 0);
  const handshake = JSON.parse(fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/runtime/handshake.json'));
  const base = `http://127.0.0.1:${handshake.port}`;
  const health = await (await fetch(base + '/health')).json();
  records.push({ pid: handshake.pid, health }); assert.equal(health.data.version, '1.0.17');
  const read = async label => {
    const response = await fetch(base + '/api/v1/tool/invoke', { method: 'POST', headers: { Authorization: 'Bearer ' + handshake.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'sf_state_read', args: { work_item_id: 'all' }, context: { directory: root, agent: 'sf-orchestrator' } }) });
    const body = await response.json(); records.push({ label, utc: new Date().toISOString(), status: response.status, body });
    assert.equal(response.status, 200); return body.data;
  };
  assert.equal((await read('normal active configuration')).success, true);
  const activation = path.join(root, '.specforge/runtime/configuration-activation.json');
  fs.renameSync(activation, activation + '.original');
  assert.match((await read('lost record unchanged configuration')).error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
  fs.writeFileSync(config, JSON.stringify({ schema_version: '1.0', timeoutMs: 10000 }));
  assert.match((await read('lost record changed configuration')).error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
  assert.equal(fs.existsSync(activation), false);
  records.push({ verdict: 'PASS', activationRecreated: false });
}
main().catch(error => { records.push({ error: String(error) }); process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(__dirname, 'installed-consumer.json'), JSON.stringify({ root, utc: new Date().toISOString(), exit_code: process.exitCode ?? 0, records }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ root, exit_code: process.exitCode ?? 0 }));
});

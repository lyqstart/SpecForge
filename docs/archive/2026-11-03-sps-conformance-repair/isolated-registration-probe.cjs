const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const out = path.join(__dirname, 'isolated-registration-result.json');
if (fs.existsSync(out)) throw Error('RECEIPT_ALREADY_EXISTS');
const started = new Date().toISOString();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-registration-acceptance-'));
const handshake = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json'), 'utf8'));
const daemonBase = `http://127.0.0.1:${handshake.port}`;
const record = { started_utc: started, fixture, daemon_pid: handshake.pid, observations: [] };
let child, output = '';
async function request(base, method, endpoint, body, daemon = false) {
  const response = await fetch(base + endpoint, { method,
    headers: { ...(daemon ? { authorization: `Bearer ${handshake.token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const value = await response.json();
  record.observations.push({ utc: new Date().toISOString(), method, endpoint, status: response.status, response: value });
  if (!response.ok) throw Error(`${endpoint}: HTTP ${response.status}`);
  return value;
}
(async () => {
  try {
    const init = await request(daemonBase, 'POST', '/api/v1/project/ensure', { projectPath: fixture }, true);
    if (!init.data?.success) throw Error('INITIALIZATION_FAILED');
    const before = await request(daemonBase, 'GET', '/api/v1/session/list', undefined, true);
    const ids = new Set(before.data.sessions.map(s => s.sessionId));
    child = cp.spawn(path.join(os.homedir(), 'AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe'),
      ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: fixture, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output += bytes.toString(); });
    let base;
    for (let i = 0; i < 150; i++) {
      base = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (base) break;
      if (child.exitCode !== null) throw Error('OPENCODE_HOST_EXIT');
      await new Promise(r => setTimeout(r, 100));
    }
    if (!base) throw Error('OPENCODE_HOST_TIMEOUT');
    const session = await request(base, 'POST', '/session', { title: 'Independent SpecForge registration acceptance' });
    await request(base, 'PATCH', `/session/${session.id}`, { title: 'Independent event emitted' });
    await new Promise(r => setTimeout(r, 1500));
    const after = await request(daemonBase, 'GET', '/api/v1/session/list', undefined, true);
    const added = after.data.sessions.filter(s => !ids.has(s.sessionId));
    if (!output.includes('Daemon connected.') || added.length === 0) throw Error('PLUGIN_REGISTRATION_NOT_PROVEN');
    record.registration = 'CONFIRMED_HOST_PLUGIN_AND_DAEMON_SESSION_REGISTRY';
    record.event_handling = 'INSUFFICIENT_EVIDENCE_OF_PERSISTED_EVENT_EFFECT_FROM_THIS_PROBE';
    record.new_sessions = added;
    record.inner_exit_code = 0;
  } catch (error) {
    record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1;
  } finally {
    if (child) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]); }
    record.host_output = output;
    record.finished_utc = new Date().toISOString();
    record.observer_writes = ['Retained isolated fixture', 'OpenCode session database/logs', 'Daemon session registration/runtime records'];
    fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ receipt: out, registration: record.registration, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();

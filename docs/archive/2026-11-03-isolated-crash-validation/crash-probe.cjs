const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const attempt = process.argv[2] || 'attempt01';
if (!/^attempt\d{2}$/.test(attempt)) throw Error('INVALID_ATTEMPT_ID');
const output = path.join(__dirname, attempt === 'attempt01' ? 'crash-result.json' : `crash-result-${attempt}.json`);
if (fs.existsSync(output)) throw Error('RECEIPT_ALREADY_EXISTS');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-isolated-crash-'));
const project = path.join(scratch, 'project');
const config = path.join(scratch, 'opencode-config');
fs.mkdirSync(project); fs.mkdirSync(config);
const executable = path.join(os.homedir(), '.config/opencode/sf-user/bin/specforged.exe');
const sharedPath = path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json');
const sharedBytes = fs.readFileSync(sharedPath);
const shared = JSON.parse(sharedBytes);
const isolatedPath = path.join(config, 'sf-user/runtime/handshake.json');
const record = { run_id: 'CODEX-SF-20261103-ISOLATED-CRASH-VALIDATION-A01',
  command: `node docs/archive/2026-11-03-isolated-crash-validation/crash-probe.cjs ${attempt}`,
  cwd: process.cwd(), purpose: 'Isolated post-acknowledged-checkpoint process crash and startup classification',
  started_utc: new Date().toISOString(), scratch, project, config,
  executable, executable_sha256: sha(fs.readFileSync(executable)), shared_pid: shared.pid,
  expected_writes: 'Isolated temp project/configuration/runtime, this evidence directory logs and receipt',
  observations: [], processes: [], limits: ['Crash occurs after the checkpoint owner returned and disk bytes were verified; not a mid-write crash or power-loss test.'] };
let child, current, log;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(handshake, method, endpoint, body, save = true) {
  const response = await fetch(`http://127.0.0.1:${handshake.port}${endpoint}`, { method,
    headers: { authorization: `Bearer ${handshake.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const value = await response.json();
  if (save) record.observations.push({ utc: new Date().toISOString(), pid: handshake.pid, method, endpoint, status: response.status, response: value });
  if (!response.ok) throw Error(`${endpoint}: HTTP ${response.status}`);
  return value;
}
async function waitExit(process) {
  if (process.exitCode !== null || process.signalCode !== null) return;
  let timer;
  try { await Promise.race([new Promise(resolve => process.once('exit', resolve)), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CHILD_EXIT_TIMEOUT')), 10000); })]); }
  finally { clearTimeout(timer); }
}
async function launch(label) {
  log = fs.createWriteStream(path.join(__dirname, `${attempt}-${label}.log`), { flags: 'wx' });
  child = cp.spawn(executable, ['start', '--foreground'], { cwd: project,
    env: { ...process.env, OPENCODE_CONFIG_DIR: config }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const own = child;
  for (const stream of [own.stdout, own.stderr]) stream.on('data', bytes => log.write(bytes));
  if (!own.pid || own.pid === shared.pid) throw Error('CHILD_IDENTITY_INVALID');
  record.processes.push({ label, pid: own.pid, started_utc: new Date().toISOString() });
  for (let i = 0; i < 150; i++) {
    if (own.exitCode !== null) throw Error(`ISOLATED_DAEMON_EXITED:${own.exitCode}`);
    try {
      const candidate = JSON.parse(fs.readFileSync(isolatedPath));
      if (candidate.pid === own.pid) {
        const health = await request(candidate, 'GET', '/api/v1/healthz', undefined, false);
        if (health.pid === own.pid && health.status === 'ok') { current = candidate; return; }
      }
    } catch {}
    await delay(100);
  }
  throw Error('ISOLATED_HANDSHAKE_TIMEOUT');
}
(async () => {
  try {
    record.shared_health_before = await request(shared, 'GET', '/api/v1/healthz', undefined, false);
    if (record.shared_health_before.pid !== shared.pid) throw Error('SHARED_IDENTITY_MISMATCH');
    await launch('before-crash');
    const initialized = await request(current, 'POST', '/api/v1/project/ensure', { projectPath: project });
    if (!initialized.data?.success) throw Error('FIXTURE_INIT_FAILED');
    const registration = await request(current, 'POST', '/api/v1/ingest/register', { projectPath: project });
    if (registration.data?.mode !== 'personal') throw Error('ISOLATED_PERSONAL_MODE_NOT_CONFIRMED');
    const sessionId = registration.data.sessionId;
    const payload = { schema_version: '1.0', source: 'isolated.crash.acceptance', projectPath: project,
      marker: crypto.randomUUID(), capturedAt: new Date().toISOString() };
    await request(current, 'POST', '/api/v1/ingest/event', { sessionId, type: 'session.compacting', data: payload, ts: Date.now() });
    const checkpointPath = path.join(project, '.specforge/runtime/checkpoints', `${sessionId}.json`);
    const before = fs.readFileSync(checkpointPath);
    if (JSON.parse(before).marker !== payload.marker) throw Error('CHECKPOINT_NOT_WRITTEN');
    record.checkpoint = { path: checkpointPath, sessionId, before_sha256: sha(before), before_bytes_base64: before.toString('base64') };
    record.sessions_before = await request(current, 'GET', '/api/v1/session/list');
    if (!(record.sessions_before.data?.sessions ?? []).some(s => s.sessionId === sessionId)) throw Error('INITIAL_SESSION_NOT_REGISTERED');
    // Only this harness's direct child is ever forcefully terminated.
    if (child.pid === shared.pid || current.pid !== child.pid) throw Error('REFUSING_UNVERIFIED_PID');
    const crashed = child;
    record.crash_utc = new Date().toISOString();
    if (!crashed.kill('SIGKILL')) throw Error('ISOLATED_KILL_FAILED');
    await waitExit(crashed);
    record.crashed_process = { pid: crashed.pid, exit_code: crashed.exitCode, signal: crashed.signalCode };
    log.end();
    await launch('after-crash');
    record.sessions_immediately_after_startup = await request(current, 'GET', '/api/v1/session/list');
    const after = fs.readFileSync(checkpointPath);
    if (!before.equals(after)) throw Error('CHECKPOINT_CHANGED_AFTER_CRASH');
    record.checkpoint.after_sha256 = sha(after);
    record.checkpoint_survival = 'CONFIRMED_POST_ACKNOWLEDGED_WRITE';
    record.prior_session_restored_at_startup = (record.sessions_immediately_after_startup.data?.sessions ?? []).some(s => s.sessionId === sessionId);
    record.reregistration = await request(current, 'POST', '/api/v1/ingest/register', { projectPath: project });
    record.reregistration_same_session = record.reregistration.data?.sessionId === sessionId;
    record.sessions_after_explicit_reregistration = await request(current, 'GET', '/api/v1/session/list');
    record.shared_health_after = await request(shared, 'GET', '/api/v1/healthz', undefined, false);
    record.shared_handshake_unchanged = sharedBytes.equals(fs.readFileSync(sharedPath));
    if (!record.shared_handshake_unchanged || record.shared_health_after.pid !== shared.pid) throw Error('SHARED_DAEMON_IDENTITY_CHANGED');
    record.inner_exit_code = 0;
  } catch (error) { record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1; }
  finally {
    if (child?.pid && child.pid !== shared.pid && child.exitCode === null && child.signalCode === null) {
      try { if (current?.pid === child.pid) await request(current, 'POST', '/api/v1/admin/stop', {}); await waitExit(child); }
      catch (error) { record.cleanup_error = String(error); child.kill('SIGKILL'); await waitExit(child).catch(() => {}); record.inner_exit_code = 1; process.exitCode = 1; }
    }
    log?.end();
    record.finished_utc = new Date().toISOString(); record.carrier_exit_code = record.inner_exit_code;
    record.observed_writes = { retained_fixture: scratch, logs: record.processes.map(p => `${attempt}-${p.label}.log`), receipt: output };
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, checkpoint_survival: record.checkpoint_survival,
      prior_session_restored_at_startup: record.prior_session_restored_at_startup, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const attempt = process.argv[2] || 'attempt01';
if (!/^attempt\d{2}$/.test(attempt)) throw Error('INVALID_ATTEMPT_ID');
const receipt = path.join(__dirname, attempt === 'attempt01' ? 'state-replay-result.json' : `state-replay-result-${attempt}.json`);
if (fs.existsSync(receipt)) throw Error('RECEIPT_ALREADY_EXISTS');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-state-replay-'));
const project = path.join(scratch, 'project'), config = path.join(scratch, 'opencode-config');
fs.mkdirSync(project); fs.mkdirSync(config);
const executable = path.join(os.homedir(), '.config/opencode/sf-user/bin/specforged.exe');
const sharedPath = path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json');
const sharedBytes = fs.readFileSync(sharedPath), shared = JSON.parse(sharedBytes);
const isolatedPath = path.join(config, 'sf-user/runtime/handshake.json');
const record = { run_id: 'CODEX-SF-20261103-ISOLATED-STATE-REPLAY-A01',
  command: `node docs/archive/2026-11-03-isolated-state-replay/state-replay-probe.cjs ${attempt}`, cwd: process.cwd(),
  purpose: 'Real formal-tool business state replay after isolated daemon crash and projection loss',
  started_utc: new Date().toISOString(), scratch, project, config, executable,
  executable_sha256: sha(fs.readFileSync(executable)), shared_pid: shared.pid,
  expected_writes: 'Official-owner synthetic project/WI artifacts and WAL; retained projection backup; isolated daemon logs/config/runtime; receipt',
  observations: [], processes: [] };
let child, handshake, log;
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
async function request(target, method, endpoint, body, save = true) {
  const response = await fetch(`http://127.0.0.1:${target.port}${endpoint}`, { method,
    headers: { authorization: `Bearer ${target.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (save) record.observations.push({ utc: new Date().toISOString(), pid: target.pid, method, endpoint, status: response.status, response: result });
  if (!response.ok) throw Error(`${endpoint}: HTTP ${response.status}`);
  return result;
}
async function invoke(tool, args) {
  const result = await request(handshake, 'POST', '/api/v1/tool/invoke', { tool, args,
    context: { directory: project, worktree: project, agent: 'sf-orchestrator' } });
  if (!result.success || !result.data?.success) throw Error(`FORMAL_TOOL_REJECTED:${tool}:${JSON.stringify(result.data)}`);
  return result.data;
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
  if (!child.pid || child.pid === shared.pid) throw Error('INVALID_CHILD_IDENTITY');
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => log.write(bytes));
  record.processes.push({ label, pid: child.pid, utc: new Date().toISOString() });
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw Error('CHILD_START_FAILED');
    try {
      const candidate = JSON.parse(fs.readFileSync(isolatedPath));
      if (candidate.pid === child.pid) {
        const health = await request(candidate, 'GET', '/api/v1/healthz', undefined, false);
        if (health.pid === child.pid && health.status === 'ok') { handshake = candidate; return; }
      }
    } catch {}
    await pause();
  }
  throw Error('ISOLATED_HANDSHAKE_TIMEOUT');
}
function historySnapshot() {
  const runtime = path.join(project, '.specforge/runtime');
  const entries = fs.readdirSync(runtime).filter(name => /^events(?:\.|-)/.test(name)).sort();
  return entries.map(name => { const bytes = fs.readFileSync(path.join(runtime, name)); return { file: name, sha256: sha(bytes), bytes_base64: bytes.toString('base64') }; });
}
(async () => {
  try {
    record.shared_before = await request(shared, 'GET', '/api/v1/healthz', undefined, false);
    if (record.shared_before.pid !== shared.pid) throw Error('SHARED_IDENTITY_MISMATCH');
    await launch('before-crash');
    const init = await request(handshake, 'POST', '/api/v1/project/ensure', { projectPath: project });
    if (!init.data?.success) throw Error('FIXTURE_INIT_FAILED');
    await request(handshake, 'POST', '/api/v1/ingest/register', { projectPath: project });
    const classification = { requirement_changed: true, acceptance_criteria_changed: true, business_rule_changed: true,
      user_visible_behavior_changed: true, data_semantics_changed: true, design_changed: true, module_boundary_changed: true,
      api_contract_changed: true, architecture_changed: true, data_model_changed: true, module_contract_changed: true, unknowns: [] };
    const first = await invoke('sf_work_item_create', { user_request: 'Synthetic acceptance fixture A: establish the first architecture, module/data/interface contracts and greet(name) behavior in this isolated new greeting-library project. Only exercise intake/state replay; do not implement or approve anything.', classification });
    await invoke('sf_state_transition', { work_item_id: first.work_item_id, from_state: 'intake_ready', to_state: 'impact_analyzing',
      evidence: 'User-authorized isolated business-state replay acceptance; no original business project is involved.' });
    const second = await invoke('sf_work_item_create', { user_request: 'Synthetic acceptance fixture B: independently establish first architecture/module/data/interface contracts for a farewell(name) behavior. Only exercise intake/state replay; no implementation or approval.', classification });
    record.fixture_work_items = [first.work_item_id, second.work_item_id];
    record.before_read = await invoke('sf_state_read', { work_item_id: 'all' });
    const states = record.before_read.work_items;
    if (!record.before_read.rebuilt_from_events || states[first.work_item_id]?.current_state !== 'impact_analyzing' || states[second.work_item_id]?.current_state !== 'intake_ready') throw Error('UNEXPECTED_BEFORE_AUTHORITY');
    record.history_before = historySnapshot();
    if (!record.history_before.length) throw Error('NO_AUTHORITATIVE_HISTORY');
    const projectionPath = path.join(project, '.specforge/runtime/state.json');
    const projectionBefore = fs.readFileSync(projectionPath);
    record.projection_before = { sha256: sha(projectionBefore), content: JSON.parse(projectionBefore) };
    if (handshake.pid !== child.pid || child.pid === shared.pid) throw Error('REFUSING_UNVERIFIED_CRASH');
    const crashed = child;
    record.crash_utc = new Date().toISOString();
    if (!crashed.kill('SIGKILL')) throw Error('ISOLATED_KILL_FAILED');
    await waitExit(crashed); log.end();
    record.crashed_process = { pid: crashed.pid, exit_code: crashed.exitCode, signal: crashed.signalCode };
    const projectionBackup = path.join(scratch, 'retained-state-before-crash.json');
    if (!fs.readFileSync(projectionPath).equals(projectionBefore) || fs.lstatSync(projectionPath).nlink !== 1) throw Error('PROJECTION_CHANGED_BEFORE_FAULT_INJECTION');
    fs.renameSync(projectionPath, projectionBackup);
    record.projection_backup = projectionBackup;
    record.projection_absent_before_restart = !fs.existsSync(projectionPath);
    await launch('after-crash');
    record.after_read = await invoke('sf_state_read', { work_item_id: 'all' });
    if (!record.after_read.rebuilt_from_events || JSON.stringify(record.after_read.work_items) !== JSON.stringify(states)) throw Error('REPLAY_STATE_MISMATCH');
    record.history_after = historySnapshot();
    if (JSON.stringify(record.history_before) !== JSON.stringify(record.history_after)) throw Error('REPLAY_CHANGED_AUTHORITATIVE_HISTORY');
    const afterProjection = JSON.parse(fs.readFileSync(projectionPath));
    record.projection_after = { sha256: sha(fs.readFileSync(projectionPath)), content: afterProjection };
    const beforeProjection = record.projection_before.content;
    for (const key of ['lastEventId', 'lastEventTs']) if (afterProjection[key] !== beforeProjection[key]) throw Error(`PROJECTION_CURSOR_MISMATCH:${key}`);
    if (!Number.isInteger(afterProjection.stateVersion) || afterProjection.stateVersion < 1) throw Error('INVALID_REBUILT_PROJECTION_VERSION');
    record.projection_version_observation = { before: beforeProjection.stateVersion, after_missing_projection: afterProjection.stateVersion,
      explanation: 'Projection concurrency counter is seeded from disk and resets when the projection is absent; not the authoritative WAL cursor.' };
    record.replay = 'CONFIRMED_FROM_UNCHANGED_EVENTS_WITH_MISSING_PROJECTION';
    await request(handshake, 'POST', '/api/v1/admin/stop', {});
    await waitExit(child); log.end();
    await launch('after-clean-restart');
    record.after_clean_restart_read = await invoke('sf_state_read', { work_item_id: 'all' });
    if (!record.after_clean_restart_read.rebuilt_from_events || JSON.stringify(record.after_clean_restart_read.work_items) !== JSON.stringify(states)) throw Error('CLEAN_RESTART_STATE_MISMATCH');
    const cleanProjection = JSON.parse(fs.readFileSync(projectionPath));
    if (cleanProjection.stateVersion <= afterProjection.stateVersion) throw Error('RETAINED_PROJECTION_VERSION_NOT_ADVANCED');
    for (const key of ['lastEventId', 'lastEventTs']) if (cleanProjection[key] !== beforeProjection[key]) throw Error(`CLEAN_RESTART_CURSOR_MISMATCH:${key}`);
    if (JSON.stringify(record.history_before) !== JSON.stringify(historySnapshot())) throw Error('CLEAN_RESTART_CHANGED_HISTORY');
    record.after_clean_restart_projection = cleanProjection;
    record.shared_after = await request(shared, 'GET', '/api/v1/healthz', undefined, false);
    record.shared_handshake_unchanged = sharedBytes.equals(fs.readFileSync(sharedPath));
    if (!record.shared_handshake_unchanged || record.shared_after.pid !== shared.pid) throw Error('SHARED_DAEMON_CHANGED');
    record.inner_exit_code = 0;
  } catch (error) { record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1; }
  finally {
    if (child?.pid && child.pid !== shared.pid && child.exitCode === null && child.signalCode === null) {
      try { if (handshake?.pid === child.pid) await request(handshake, 'POST', '/api/v1/admin/stop', {}); await waitExit(child); }
      catch (error) { record.cleanup_error = String(error); child.kill('SIGKILL'); await waitExit(child).catch(() => {}); record.inner_exit_code = 1; process.exitCode = 1; }
    }
    log?.end();
    record.finished_utc = new Date().toISOString(); record.carrier_exit_code = record.inner_exit_code;
    record.observed_writes = { retained_scratch: scratch, logs: record.processes.map(p => `${attempt}-${p.label}.log`), receipt };
    fs.writeFileSync(receipt, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ receipt, replay: record.replay, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();

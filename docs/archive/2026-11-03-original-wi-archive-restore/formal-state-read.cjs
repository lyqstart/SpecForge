const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const out = path.join(__dirname, 'formal-state-read.json'); if (fs.existsSync(out)) throw Error('RECEIPT_EXISTS');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7';
const handshake = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const events = path.join(target, '.specforge/runtime/events.jsonl'), projection = path.join(target, '.specforge/runtime/state.json');
const record = { utc: new Date().toISOString(), run_id: 'CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01', project: target,
  expected_writes: 'StateManager first-load projection and daemon audit logs; original event history must stay unchanged',
  before_events_sha256: hash(fs.readFileSync(events)), before_projection_base64: fs.readFileSync(projection).toString('base64'), observations: [] };
(async () => {
  try {
    for (const id of ['WI-0001', 'all']) {
      const response = await fetch(`http://127.0.0.1:${handshake.port}/api/v1/tool/invoke`, { method: 'POST', headers: { authorization: `Bearer ${handshake.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tool: 'sf_state_read', args: { work_item_id: id }, context: { directory: target, worktree: target, agent: 'sf-orchestrator', sessionID: 'ses_e8e849253ffeo8tI9ZIOUEjSZ5' } }) });
      const value = await response.json(); record.observations.push({ utc: new Date().toISOString(), tool: 'sf_state_read', work_item_id: id, http_status: response.status, response: value });
      if (!response.ok || !value.success || !value.data?.success || !value.data.rebuilt_from_events) throw Error('FORMAL_REPLAY_NOT_CONFIRMED');
      if (id === 'WI-0001' && value.data.current_state !== 'candidate_preparing') throw Error('UNEXPECTED_STATE');
    }
    record.after_events_sha256 = hash(fs.readFileSync(events));
    record.after_projection_base64 = fs.readFileSync(projection).toString('base64');
    if (record.after_events_sha256 !== record.before_events_sha256) throw Error('EVENT_HISTORY_CHANGED');
    record.inner_exit_code = 0;
  } catch (error) { record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1; }
  finally {
    record.finished_utc = new Date().toISOString(); fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ receipt: out, state: record.observations[0]?.response?.data?.current_state, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();

// Read-only observation of the original project, plus formal StateManager read.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', suffix = process.argv[2];
if (!suffix || !/^[a-z0-9-]+$/.test(suffix)) throw Error('snapshot suffix required');
const out = path.join(__dirname, `original-audit-${suffix}.json`); if (fs.existsSync(out)) throw Error('RECEIPT_EXISTS');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const record = { run_id: 'CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01', utc: new Date().toISOString(), target, files: [],
  observer_effects: 'Formal sf_state_read rebuilds existing in-memory authority; daemon tool audit logs may append.' };
function walk(dir, prefix) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name), relative = prefix + name, stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw Error('LINK');
    if (stat.isDirectory()) walk(full, relative + '/');
    else { const raw = fs.readFileSync(full); record.files.push({ path: relative, size: raw.length, sha256: hash(raw), bytes_base64: raw.toString('base64') }); }
  }
}
(async () => {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json')));
    const r = await fetch(`http://127.0.0.1:${h.port}/api/v1/tool/invoke`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${h.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tool: 'sf_state_read', args: { work_item_id: 'all' }, context: { directory: target, worktree: target, agent: 'sf-orchestrator', sessionID: 'ses_e8e849253ffeo8tI9ZIOUEjSZ5' } }) });
    record.formal_state_http_status = r.status; record.formal_state = await r.json();
    if (!r.ok || !record.formal_state.data?.success || !record.formal_state.data?.rebuilt_from_events) throw Error('FORMAL_STATE_FAILED');
    walk(path.join(target, '.specforge/work-items/WI-0001'), '.specforge/work-items/WI-0001/');
    for (const file of ['.specforge/runtime/events.jsonl', '.specforge/runtime/state.json']) {
      const raw = fs.readFileSync(path.join(target, file)); record.files.push({ path: file, sha256: hash(raw), bytes_base64: raw.toString('base64') });
    }
    record.inner_exit_code = 0;
  } catch (error) { record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1; }
  finally { record.finished_utc = new Date().toISOString(); fs.writeFileSync(out, JSON.stringify(record, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ out, state: record.formal_state?.data?.work_items, files: record.files.length, error: record.error, inner_exit_code: record.inner_exit_code })); }
})();

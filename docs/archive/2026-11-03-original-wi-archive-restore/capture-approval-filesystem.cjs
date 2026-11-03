// Read-only fallback: inspect original Runtime files and immutable Gate reports.
// No API call, projection rebuild, workflow transition or target write.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const target = 'C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const record = { utc: new Date().toISOString(), target, source_method: 'read-only original filesystem plus actual StateManager WAL/projection cursor; no new formal API read', files: [],
  observer_effects: 'Evidence files only; no original project writes. Last formal API attempt 0107 failed fetch in sandbox; two elevated launches did not start because approval review timed out.' };
function file(relative) {
  const raw = fs.readFileSync(path.join(target, relative));
  record.files.push({ path: relative, size: raw.length, sha256: hash(raw), bytes_base64: raw.toString('base64') }); return raw;
}
function walk(relative) {
  for (const name of fs.readdirSync(path.join(target, relative)).sort()) {
    const child = relative + '/' + name, stat = fs.lstatSync(path.join(target, child));
    if (stat.isSymbolicLink()) throw Error('LINK'); if (stat.isDirectory()) walk(child); else file(child);
  }
}
walk('.specforge/work-items/WI-0001');
const events = file('.specforge/runtime/events.jsonl').toString().trim().split('\n').map(line => JSON.parse(line));
const projection = JSON.parse(file('.specforge/runtime/state.json'));
const last = events.at(-1), stateEvent = events.filter(event => event.action === 'state.transition' && event.payload.work_item_id === 'WI-0001').at(-1);
const wi = projection.workItems.find(item => item.work_item_id === 'WI-0001');
if (projection.lastEventId !== last.eventId || wi.current_state !== stateEvent.payload.to_state || projection.workItems.length !== 1) throw Error('WAL_PROJECTION_MISMATCH');
record.authority_observation = { current_state: wi.current_state, last_event_id: last.eventId, last_event_ts: last.ts, transition_event: stateEvent, projection_cursor_matches_wal: true };
record.inner_exit_code = 0;
fs.writeFileSync(path.join(__dirname, 'original-audit-approval-filesystem.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ utc: record.utc, files: record.files.length, authority: record.authority_observation, inner_exit_code: 0 }));

const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const projection = path.resolve('packages/daemon-core/.specforge/runtime/state.json'), bytes = fs.readFileSync(projection), value = JSON.parse(bytes), stat = fs.statSync(projection);
const result = { utc: new Date().toISOString(), path: projection, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes_base64: bytes.toString('base64'),
  birthtime: stat.birthtime.toISOString(), mtime: stat.mtime.toISOString(), projectPath: value.projectPath, stateVersion: value.stateVersion,
  lastEventId: value.lastEventId, work_item_count: value.workItems.length, active_event_file_exists: fs.existsSync(path.join(path.dirname(projection), 'events.jsonl')),
  runtime_entries: fs.readdirSync(path.dirname(projection)), classification: 'RUNTIME_OBSERVER_WRITES: test-induced StateManager projection from legacy service-cwd resolver',
  pre_probe_bytes: 'INSUFFICIENT_EVIDENCE: no pre-probe raw snapshot for this ignored runtime directory',
  disposition: 'Preserved; no manual deletion or invented byte-perfect rollback. Fixture now binds the resolver to owned temp root.', inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'test-observer-projection.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ path: result.path, sha256: result.sha256, work_item_count: result.work_item_count, active_event_file_exists: result.active_event_file_exists, inner_exit_code: 0 }));

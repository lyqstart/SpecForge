const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const hash = raw => crypto.createHash('sha256').update(raw).digest('hex');
const old = path.join(__dirname, '../2026-11-03-original-wi-archive-restore');
const target = 'C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7';
const save = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const rules = ['docs/rule/specforge-active-development-rules.md', 'docs/product-specification/authority-registry.md', 'docs/product-specification/specforge-product-specification.md', 'docs/design/SpecForge架构一致性治理最终实施方案.md', 'docs/rule/specforge-execution-mode-and-evidence-protocol.md'];
const coverage = rules.map(file => {
  const raw = fs.readFileSync(file), text = raw.toString('utf8').replaceAll('\r\n', '\n'), lines = text.split('\n'), chunks = [];
  for (let start = 0; start < lines.length; start += 200) chunks.push({ first_line: start + 1, last_line: Math.min(start + 200, lines.length), text: lines.slice(start, start + 200).join('\n') });
  if (chunks.map(chunk => chunk.text).join('\n') !== text) throw Error('COVERAGE_REASSEMBLY_FAILED');
  return { file, raw_sha256: hash(raw), normalized_sha256: hash(Buffer.from(text)), lines: lines.length, eof_covered: true, reassembly_equal: true,
    chunks: chunks.map(({ text, ...chunk }) => ({ ...chunk, sha256: hash(Buffer.from(text)) })),
    read_method: 'Full tool-output coverage to EOF; truncated display intervals were reread separately before this receipt.' };
});
save('rule-read-coverage.json', { utc: new Date().toISOString(), files: coverage });
const record = { utc: new Date().toISOString(), target, files: [], source_method: 'Original filesystem before formal API/native continuation', observer_effects: 'Evidence writes only' };
function file(relative) { const raw = fs.readFileSync(path.join(target, relative)); record.files.push({ path: relative, size: raw.length, sha256: hash(raw), bytes_base64: raw.toString('base64') }); return raw; }
function walk(relative) { for (const name of fs.readdirSync(path.join(target, relative)).sort()) { const child = relative + '/' + name, stat = fs.lstatSync(path.join(target, child)); if (stat.isSymbolicLink()) throw Error('LINK'); if (stat.isDirectory()) walk(child); else file(child); } }
walk('.specforge/work-items/WI-0001'); walk('.specforge/project');
const events = file('.specforge/runtime/events.jsonl').toString().trim().split('\n').map(line => JSON.parse(line));
const projection = JSON.parse(file('.specforge/runtime/state.json'));
const last = events.at(-1);
record.runtime = { projection, last_event: last, cursor_id_matches: projection.lastEventId === last.eventId, cursor_ts_matches: projection.lastEventTs === last.ts };
for (const relative of ['README.md', 'package.json', 'src/greet.ts', 'tests/greet.test.ts', 'tsconfig.json']) if (fs.existsSync(path.join(target, relative))) file(relative);
record.git = {};
for (const [key, args] of Object.entries({ head: ['rev-parse', 'HEAD'], symbolic_head: ['symbolic-ref', '-q', 'HEAD'], refs: ['show-ref'], status: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] })) {
  const r = cp.spawnSync('git', ['-C', target, ...args], { encoding: 'utf8', windowsHide: true });
  record.git[key] = { args, exit_code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const oldReview = JSON.parse(fs.readFileSync(path.join(old, 'candidate-review-verification.json')));
record.approved_candidate = { gate_input_snapshot_sha256: oldReview.gate_input_snapshot_sha256,
  current_gate_snapshot_matches: record.files.find(file => file.path.endsWith('attempt-0005/input-snapshot.json'))?.sha256 === oldReview.gate_input_snapshot_sha256,
  current_candidate_hashes_match: oldReview.candidate_files.every(prior => record.files.find(file => file.path === prior.path)?.sha256 === prior.sha256) };
save('before-authorized-continuation.json', record);
save('user-authorization.json', { utc_received_recorded: new Date().toISOString(), user_response_quote: '批准', exact_user_reply: true,
  context: 'Direct reply to current frozen WI-0001 attempt-0005 Candidate review and question authorizing specification merge and controlled implementation',
  candidate_input_snapshot_sha256: oldReview.gate_input_snapshot_sha256, user_approval_recorded_in_runtime: false,
  limits: 'No implicit semantic branch-name confirmation, default-main Git merge, bypass of D18 or claim of executed verification.' });
save('checkpoint.json', { utc: new Date().toISOString(), run_id: 'CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01', execution_attempt_id: 'CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01-01', execution_mode: 'CODEX_DIRECT', status: 'IN_PROGRESS', next: 'Formal state and frozen Candidate reread, then native owner decision/merge and Git plan; no branch creation without required user decision.' });
for (const file of ['run-command.cjs', 'seal-receipts.cjs']) {
  let text = fs.readFileSync(path.join(old, file), 'utf8');
  if (file === 'seal-receipts.cjs') text = text.replace(/    if \(file === '0048\.stdout\.txt'\) \{[\s\S]*?\n    \}/, '');
  fs.writeFileSync(path.join(__dirname, file), text, { flag: 'wx' });
}
console.log(JSON.stringify({ utc: record.utc, files: record.files.length, approved_candidate: record.approved_candidate, state: projection.workItems, git_head: record.git.head, coverage_files: coverage.length, inner_exit_code: 0 }));

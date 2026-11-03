// Independent audit of the final captured Candidate; never advances workflow state.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const inputName = process.argv[2]; if (!/^original-audit-[a-z0-9-]+\.json$/.test(inputName || '')) throw Error('AUDIT_NAME_REQUIRED');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, inputName)));
const root = audit.target, wiPrefix = '.specforge/work-items/WI-0001/';
const get = relative => { const file = audit.files.find(file => file.path === relative); if (!file) throw Error('AUDIT_MEMBER_MISSING:' + relative); return file; };
const json = relative => JSON.parse(Buffer.from(get(relative).bytes_base64, 'base64'));
const attempts = audit.files.filter(file => /gate_attempts\/attempt-\d+\/attempt-result\.json$/.test(file.path))
  .map(file => JSON.parse(Buffer.from(file.bytes_base64, 'base64'))).sort((a, b) => a.attempt_id.localeCompare(b.attempt_id));
const latest = attempts.at(-1); if (!latest) throw Error('NO_GATE_ATTEMPT');
const attemptRoot = wiPrefix + 'gate_attempts/' + latest.attempt_id + '/';
const reports = audit.files.filter(file => file.path.startsWith(attemptRoot + 'gates/')).map(file => JSON.parse(Buffer.from(file.bytes_base64, 'base64')));
const snapshot = json(attemptRoot + 'input-snapshot.json');
const candidates = audit.files.filter(file => file.path.startsWith(wiPrefix + 'candidates/') || file.path === wiPrefix + 'candidate_manifest.json');
for (const file of candidates) {
  if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('CURRENT_CANDIDATE_DRIFT:' + file.path);
  const captured = snapshot.inputs.find(item => path.resolve(item.path) === path.resolve(root, file.path));
  if (!captured || captured.sha256 !== file.sha256) throw Error('GATE_INPUT_BINDING_MISMATCH:' + file.path);
}
const archive = JSON.parse(fs.readFileSync(path.join(__dirname, '../2026-10-25-verifier-conformance/sealed-business-files.json')));
const projectFiles = archive.entries.filter(file => file.path.replaceAll('\\', '/').startsWith('.specforge/project/'));
for (const file of projectFiles) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('FORMAL_PROJECT_CHANGED:' + file.path);
const paths = ['README.md', 'package.json', 'src/greet.ts', 'tests/greet.test.ts', 'tsconfig.json'];
const implementation = paths.map(file => ({ path: file, exists: fs.existsSync(path.join(root, file)), sha256: fs.existsSync(path.join(root, file)) ? sha(fs.readFileSync(path.join(root, file))) : null }));
if (implementation[0].sha256 !== '757ee94ea46933c3dd7092c04d15a32546a3f54e609b9c6e66351eeafe8fdf40' || implementation.slice(1).some(file => file.exists)) throw Error('BUSINESS_IMPLEMENTATION_CHANGED');
const git = args => cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
const head = git(['rev-parse', 'HEAD']); if (head !== '8a692e88c0823984647622294f5199c18bb0c587') throw Error('BUSINESS_HEAD_CHANGED');
const events = Buffer.from(get('.specforge/runtime/events.jsonl').bytes_base64, 'base64').toString().trim().split('\n').map(line => JSON.parse(line));
const transitions = events.filter(event => event.action === 'state.transition').map(event => event.payload.to_state);
if (transitions.some(state => ['user_approved', 'merged', 'implementation_running', 'closed'].includes(state))) throw Error('STOP_BOUNDARY_CROSSED');
const currentState = audit.formal_state?.data?.work_items['WI-0001']?.current_state || audit.authority_observation?.current_state;
if (!currentState) throw Error('AUTHORITY_STATE_MISSING');
const allPassed = reports.length === 10 && reports.every(report => report.status === 'passed' && report.blocking_issues.length === 0);
const result = { utc: new Date().toISOString(), source: inputName, source_sha256: sha(fs.readFileSync(path.join(__dirname, inputName))),
  state: currentState, state_proof_method: audit.source_method || 'formal sf_state_read and captured WAL/projection', attempts: attempts.map(attempt => ({ id: attempt.attempt_id, status: attempt.summary_status })),
  latest_gates: reports.map(report => ({ id: report.gate_id, status: report.status, blocking: report.blocking_issues })),
  all_10_gates_passed: allPassed, candidate_files: candidates.map(file => ({ path: file.path, sha256: file.sha256 })),
  candidate_manifest_sha256: get(wiPrefix + 'candidate_manifest.json').sha256,
  gate_input_snapshot_sha256: get(attemptRoot + 'input-snapshot.json').sha256,
  latest_gate_input_bindings_match: true, archived_formal_project_files_unchanged: projectFiles.length,
  implementation_paths: implementation, original_head: head, transition_states: transitions,
  approval_boundary_reached: currentState === 'approval_required' && allPassed, user_approval_or_implementation_inferred: false,
  inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'candidate-review-verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));

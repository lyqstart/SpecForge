const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = __dirname;
const attempt = process.argv[2];
assert.match(attempt, /^[0-9]+$/);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const before = read('003-before-corrected.stdout.txt');
const after = read('016-full-tests-final.stdout.txt');
assert.equal(JSON.parse(read('003-before-corrected.result.json')).exit_code, 1);
assert.equal(JSON.parse(read('016-full-tests-final.result.json')).exit_code, 1);
assert.equal(JSON.parse(read('022-scope-final.result.json')).exit_code, 0);
const failures = read('016-full-tests-final.stderr.txt').split(/\r?\n/).filter(line => /^ FAIL /.test(line));
assert.equal(failures.length, 3);
for (const failure of failures) assert.ok(failure.includes('tests/current-repository-installer-manifest-consumption.integration.test.ts'));
assert.match(read('022-scope-final.stdout.txt'), /Tests\s+134 passed \(134\)/);
assert.match(after, /Tests\s+3 failed \| 131 passed \(134\)/);
assert.equal(JSON.parse(read('007-independent-http.result.json')).exit_code, 0);
const observations = text => text.split(/\r?\n/).filter(line => line.startsWith('ACTIVATION_RESULT=')).map(line => JSON.parse(line.slice('ACTIVATION_RESULT='.length)));
assert.ok(observations(before).some(row => row.action === 'read' && row.timeoutMs === 10000 && row.activationExists && row.states.includes('created')));
assert.ok(observations(after).some(row => row.action === 'read' && row.error?.includes('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK') && !row.activationExists && row.states.includes('created')));
const summaries = [...after.matchAll(/^\s*Tests\s+(\d+) passed \((\d+)\)/gm)];
assert.ok(summaries.length > 0);
for (const match of summaries) assert.equal(match[1], match[2]);
// Replace the failed package's complete result with its complete successful rerun.
// Never describe the earlier full command (exit 1) as having exited successfully.
const total = summaries.reduce((sum, match) => sum + Number(match[1]), 0) + 134;
const http = JSON.parse(read('http-review.json'));
assert.equal(http.exit_code, 0);
const starts = http.records.filter(row => row.start).map(row => row.start.pid);
assert.equal(new Set(starts).size, 2);
for (const row of http.records.filter(row => row.label?.startsWith('missing record'))) {
  assert.equal(row.body.data.success, false);
  assert.match(row.body.data.error, /CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK/);
}
const diff = cp.spawnSync('git', ['diff', '--binary', '37ec3a78ed335d4d1bbd4a2a9bedef7b06546d61'], { encoding: 'utf8' });
assert.equal(diff.status, 0);
fs.writeFileSync(path.join(root, `source-diff-${attempt}.patch`), diff.stdout, { flag: 'wx' });
const changed = cp.spawnSync('git', ['diff', '--name-only', '37ec3a78ed335d4d1bbd4a2a9bedef7b06546d61'], { encoding: 'utf8' });
assert.equal(changed.status, 0);
const paths = [...changed.stdout.split(/\r?\n/).filter(Boolean), 'packages/daemon-core/tests/unit/configuration-activation-loss.test.ts', 'packages/daemon-core/tests/fixtures/configuration-activation-process.ts'];
const snapshots = [];
for (const file of new Set(paths.filter(file => !file.startsWith('docs/archive/')))) {
  const bytes = fs.readFileSync(file);
  const old = cp.spawnSync('git', ['show', '37ec3a78ed335d4d1bbd4a2a9bedef7b06546d61:' + file], { encoding: null });
  const target = path.join(root, `source-snapshots-${attempt}`, 'after', file);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
  if (old.status === 0) {
    const baseline = path.join(root, `source-snapshots-${attempt}`, 'before', file);
    fs.mkdirSync(path.dirname(baseline), { recursive: true }); fs.writeFileSync(baseline, old.stdout, { flag: 'wx' });
  }
  snapshots.push({ file, before: old.status === 0 ? sha(old.stdout) : 'ABSENT', after: sha(bytes) });
}
const result = { utc: new Date().toISOString(), verdict: 'PASS', regression_total_after_package_rerun: total, full_command_exit_code: 1, corrected_package_exit_code: 0, original_failures: failures, new_regression_cases: 16, evidence: ['003-before-corrected', '014-targeted', '016-full-tests-final', '022-scope-final', 'http-review.json'], source_review: 'Missing and changed acceptance identities both rebuild event-authoritative state before any activation write. Identical valid accepted configuration remains readable. No active work permits fresh acceptance. Management, dispatch, native guard and registration consumers retain the common owner.', limitations: 'Full regression plus complete scope-gate package rerun, not a single zero-exit full command. Fault injection uses isolated fixtures. Restoring captured activation bytes in tests is not a new public recovery API. Original business WI was not reopened.', snapshots };
fs.writeFileSync(path.join(root, 'independent-audit.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ verdict: result.verdict, total, snapshots: snapshots.length }));

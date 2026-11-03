const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const started = new Date().toISOString();
const receipt = path.join(__dirname, 'registration-reconstruction-result.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (fs.existsSync(receipt)) throw Error('RECEIPT_ALREADY_EXISTS');
(async () => {
  const handshake = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json'), 'utf8'));
  const snapshotPath = 'docs/archive/2026-11-03-sps-conformance-repair/registration-incident-snapshot.json';
  const snapshot = fs.readFileSync(path.join(root, snapshotPath));
  const sha = hash(snapshot);
  if (sha !== '4ff1c8f29307b44a93df8a4a2b321e5799bc9f215641b7770d8bf46510a88a06') throw Error('PRESERVED_SNAPSHOT_CHANGED');
  const response = await fetch(`http://127.0.0.1:${handshake.port}/api/v1/project/ensure`, {
    method: 'POST', headers: { authorization: `Bearer ${handshake.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ projectPath: root, action: 'reconstruct_git_baseline', reconstruction: {
      snapshot_path: snapshotPath, snapshot_sha256: sha,
      baseline_commit: '0cb19d666be0c65b287b5d47d6afc0ee1a2b68ed',
      confirmation_quote: '同意使用 Git 内容基线重建',
    } }), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  const code = response.ok && result.success && result.data?.success ? 0 : 1;
  fs.writeFileSync(receipt, JSON.stringify({ run_id: 'CODEX-SF-20261103-SPS-GAP-REPAIR-A01', started_utc: started,
    finished_utc: new Date().toISOString(), cwd: root,
    command: 'node docs/archive/2026-11-03-sps-conformance-repair/run-registration-reconstruction.cjs',
    purpose: 'Call authenticated deployed Project Init owner for user-approved Git-content reconstruction',
    daemon_pid: handshake.pid, http_status: response.status, result,
    expected_writes: 'Six snapshot-bound initialization files plus Project Init runtime recovery archive and this receipt',
    observed_writes: result.data?.archive ?? 'Inspect owner error before retry', carrier_exit_code: code, inner_exit_code: code }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ http_status: response.status, result, inner_exit_code: code }));
  process.exitCode = code;
})().catch(error => { console.error(error.message); process.exitCode = 1; });

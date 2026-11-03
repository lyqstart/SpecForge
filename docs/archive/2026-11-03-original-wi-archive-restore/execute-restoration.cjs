// The carrier makes no project writes: only the deployed Recovery owner may import.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), crypto = require('node:crypto');
const suffix = process.argv[2] || '';
if (suffix && !/^-[a-z0-9-]+$/.test(suffix)) throw Error('UNSAFE_RECEIPT_SUFFIX');
const expectedDaemon = process.argv[3] || 'b182980215a7edbfb06404a9225c082edab0879ad4aacf2a40f1ec9ee0181362';
const priorPid = Number(process.argv[4] || 35652);
const output = path.join(__dirname, `deployed-restoration${suffix}.json`);
if (fs.existsSync(output)) throw Error('RECEIPT_ALREADY_EXISTS');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7';
const archivePath = path.resolve('docs/archive/2026-10-25-verifier-conformance/sealed-business-files.json');
const input = { project_path: target, archive_path: archivePath,
  archive_sha256: '65b2257fc90354a6349f1df5be1d8d01c6e9f5aa13f8a4feafc67698363f103a',
  original_commit: '8a692e88c0823984647622294f5199c18bb0c587', confirmation_quote: '同意按封存归档恢复原项目' };
const record = { run_id: 'CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01', started_utc: new Date().toISOString(), input, observations: [] };
const handshake = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json'), 'utf8'));
async function request(method, endpoint, body) {
  const response = await fetch(`http://127.0.0.1:${handshake.port}${endpoint}`, { method,
    headers: { authorization: `Bearer ${handshake.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const value = await response.json();
  record.observations.push({ utc: new Date().toISOString(), method, endpoint, status: response.status, response: value });
  if (!response.ok || value.success === false) throw Error(`OWNER_REJECTED:${response.status}:${value.error?.message || ''}`);
  return value;
}
(async () => {
  try {
    const release = fs.readFileSync('release/bin/specforged.exe');
    const deployed = fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/bin/specforged.exe'));
    record.release_daemon_sha256 = sha(release); record.deployed_daemon_sha256 = sha(deployed);
    if (record.release_daemon_sha256 !== expectedDaemon || sha(release) !== sha(deployed)) throw Error('DEPLOYED_IDENTITY_DRIFT');
    record.prior_pid = priorPid;
    try { process.kill(priorPid, 0); record.prior_pid_alive = true; } catch { record.prior_pid_alive = false; }
    if (record.prior_pid_alive) throw Error('PRIOR_DAEMON_STILL_ALIVE');
    record.health = await request('GET', '/api/v1/healthz');
    if (sha(fs.readFileSync(archivePath)) !== input.archive_sha256) throw Error('ARCHIVE_DRIFT');
    const result = await request('POST', '/api/v1/recovery/project-archive/restore', input);
    if (!result.data?.success || result.data.restored_files !== 319) throw Error('RESTORE_NOT_CONFIRMED');
    const archive = JSON.parse(fs.readFileSync(archivePath));
    record.files = archive.entries.map(entry => {
      const bytes = fs.readFileSync(path.join(target, entry.path));
      if (sha(bytes) !== entry.sha256 || bytes.length !== entry.size) throw Error(`RESTORED_HASH_DRIFT:${entry.path}`);
      return { path: entry.path, size: bytes.length, sha256: sha(bytes), matches_archive: true };
    });
    const runGit = args => {
      const result = cp.spawnSync('git', args, { cwd: target, encoding: 'utf8', windowsHide: true });
      record.observations.push({ utc: new Date().toISOString(), method: 'git', args, cwd: target, inner_exit_code: result.status, stdout: result.stdout, stderr: result.stderr });
      return result;
    };
    if (runGit(['rev-parse', 'HEAD']).stdout.trim() !== input.original_commit) throw Error('HEAD_DRIFT');
    if (runGit(['symbolic-ref', '-q', 'HEAD']).status !== 1) throw Error('HEAD_NOT_DETACHED');
    if (runGit(['ls-files']).stdout.trim() !== 'README.md') throw Error('INDEX_DRIFT');
    if (runGit(['fsck', '--full', '--strict', '--no-reflogs']).status !== 0) throw Error('GIT_GRAPH_INVALID');
    const copyRoot = path.join(__dirname, 'owner-audit'); fs.mkdirSync(copyRoot);
    for (const name of fs.readdirSync(result.data.audit_path)) {
      const file = path.join(result.data.audit_path, name);
      if (fs.statSync(file).isFile()) fs.writeFileSync(path.join(copyRoot, name), fs.readFileSync(file), { flag: 'wx' });
    }
    record.restored_exact_files = record.files.length;
    record.archived_authority = result.data.state;
    if (record.archived_authority.workItems.length !== 1 || record.archived_authority.workItems[0].work_item_id !== 'WI-0001' || record.archived_authority.workItems[0].current_state !== 'candidate_preparing' ||
        record.archived_authority.lastEventId !== '01a17183-a895-77e9-afd9-a9d0ed28da00' || record.archived_authority.lastEventTs !== 1792905816213) throw Error('ORIGINAL_AUTHORITY_MISMATCH');
    record.inner_exit_code = 0;
  } catch (error) { record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1; }
  finally {
    record.finished_utc = new Date().toISOString(); record.carrier_exit_code = record.inner_exit_code;
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ receipt: output, restored_files: record.restored_exact_files, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();

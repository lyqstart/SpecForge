import fs from 'node:fs';
import { qualifyTemporaryEnvironment } from './lib/qualification-environment.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phases = Object.freeze({
  build: ['scripts/prepare-current-release.ts'],
  lint: ['run', 'lint'],
  workspace: ['scripts/test-workspace.ts'],
  root: ['run', 'test:root'],
});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function run(executable, args, environment = process.env) {
  const result = spawnSync(executable, args, { cwd: root, env: environment, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return { ...result, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
}
function gitStatus() {
  const result = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (result.error || result.status !== 0) throw new Error('CI_GIT_STATUS_UNAVAILABLE');
  return result.stdout;
}
async function main() {
  if (process.version !== 'v24.19.0') throw new Error('CI_NODE_VERSION_MISMATCH');
  const phase = process.argv[2];
  const runnerTemporaryRoot = process.env.RUNNER_TEMP;
  if (typeof runnerTemporaryRoot !== 'string' || !runnerTemporaryRoot.trim()) throw new Error('CI_RUNNER_TEMP_REQUIRED');
  const temporary = qualifyTemporaryEnvironment(runnerTemporaryRoot);
  if (!Object.hasOwn(phases, phase) || process.argv.length !== 3) throw new Error('CI_UNKNOWN_REGRESSION_PHASE');
  const reportRoot = process.env.SPECFORGE_CI_REPORT_DIR;
  if (!reportRoot || !path.isAbsolute(reportRoot)) throw new Error('CI_ABSOLUTE_REPORT_ROOT_REQUIRED');
  const directory = path.join(reportRoot, phase);
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.mkdirSync(directory); // Immutable one attempt per CI phase; reruns get a new job workspace.
  const head = run('git', ['rev-parse', 'HEAD']);
  if (head.status !== 0 || !/^[a-f0-9]{40}\s*$/.test(head.stdout.toString())) throw new Error('CI_SOURCE_IDENTITY_UNAVAILABLE');
  const bunProbe = run(process.platform === 'win32' ? 'bun.exe' : 'bun', ['-e', 'process.stdout.write(process.execPath)']);
  if (bunProbe.status !== 0 || bunProbe.error) throw new Error('CI_BUN_IDENTITY_UNAVAILABLE');
  const bun = bunProbe.stdout.toString();
  if (!path.isAbsolute(bun) || !fs.statSync(bun).isFile()) throw new Error('CI_BUN_IDENTITY_INVALID');
  const version = run(bun, ['--version']);
  if (version.status !== 0 || version.stdout.toString().trim() !== '1.3.14') throw new Error('CI_BUN_VERSION_MISMATCH');
  const context = { lock_sha256: hash(fs.readFileSync(path.join(root, 'bun.lock'))), temporary_directory: { selection_source: 'RUNNER_TEMP', requested: temporary.requested, canonical: temporary.canonical, ancestors: temporary.ancestors }, source_commit: head.stdout.toString().trim(), platform: process.platform, arch: process.arch, os_release: os.release(), node: process.version, node_path: process.execPath, node_sha256: hash(fs.readFileSync(process.execPath)), bun: version.stdout.toString().trim(), bun_path: bun, bun_sha256: hash(fs.readFileSync(bun)) };
  const contextFile = path.join(reportRoot, 'context.json');
  if (fs.existsSync(contextFile)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(contextFile))) !== JSON.stringify(context)) throw new Error('CI_CONTEXT_DRIFT');
  } else fs.writeFileSync(contextFile, JSON.stringify(context, null, 2) + '\n', { flag: 'wx' });
  const before = gitStatus();
  if (before.length) throw new Error('CI_SOURCE_DIRTY_BEFORE_PHASE');
  const command = { phase, cwd: root, executable: bun, args: phases[phase], started_utc: new Date().toISOString(), context_sha256: hash(fs.readFileSync(contextFile)), expected_writes: 'RUNTIME_OBSERVER_WRITES:build/test outputs;EXTERNAL_EVIDENCE_WRITES:owned runner-temp report;no tracked source changes' };
  fs.writeFileSync(path.join(directory, 'command.json'), JSON.stringify(command, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'entry-source.mjs'), fs.readFileSync(fileURLToPath(import.meta.url)), { flag: 'wx' });
  const result = run(bun, phases[phase], { ...process.env, ...temporary.environment });
  fs.writeFileSync(path.join(directory, 'stdout.raw.log'), result.stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'stderr.raw.log'), result.stderr, { flag: 'wx' });
  const after = gitStatus();
  fs.writeFileSync(path.join(directory, 'status-before.raw.nul'), before, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'status-after.raw.nul'), after, { flag: 'wx' });
  const success = Number.isInteger(result.status) && result.status === 0 && !result.error && !after.length;
  const receipt = { ...command, finished_utc: new Date().toISOString(), inner_exit_code: Number.isInteger(result.status) ? result.status : null, carrier_exit_code: success ? 0 : 1, success, signal: result.signal, spawn_error: result.error ? { code: result.error.code, message: result.error.message } : null, source_unchanged: !after.length, stdout_sha256: hash(result.stdout), stderr_sha256: hash(result.stderr) };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  const manifest = fs.readdirSync(directory).sort().map(name => hash(fs.readFileSync(path.join(directory, name))) + '  ' + name + '\n').join('');
  fs.writeFileSync(path.join(directory, 'manifest.sha256'), manifest, { flag: 'wx' });
  for (const line of manifest.trimEnd().split('\n')) if (hash(fs.readFileSync(path.join(directory, line.slice(66)))) !== line.slice(0, 64)) throw new Error('CI_RECEIPT_SEAL_DRIFT');
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  console.log(JSON.stringify({ ...receipt, receipt_manifest_sha256: hash(manifest) }));
  process.exitCode = receipt.carrier_exit_code;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

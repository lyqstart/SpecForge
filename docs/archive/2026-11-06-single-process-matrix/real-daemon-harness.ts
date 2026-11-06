// Private synthetic integration harness. Starts the real Daemon; no product execution tool.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Daemon } from '../../../packages/daemon-core/src/daemon/Daemon';
async function main() {
const [mode, nonce] = process.argv.slice(2);
if (!['serve', 'restart'].includes(mode) || !/^[a-f0-9]{32}$/.test(nonce ?? '')) throw Error('FIXED_MODE_NONCE');
const workspace = path.resolve(process.cwd());
const fixture = path.join(workspace, '.tmp/verification-lpac-daemon', nonce);
if (!fs.existsSync(path.join(fixture, 'reservation.json'))) throw Error('OWNER_RESERVATION_REQUIRED');
const reservation = JSON.parse(fs.readFileSync(path.join(fixture, 'reservation.json'), 'utf8'));
if (reservation.nonce !== nonce || typeof reservation.broker_local_appdata !== 'string' || typeof reservation.broker_user_profile !== 'string' || !path.isAbsolute(reservation.broker_local_appdata) || !path.isAbsolute(reservation.broker_user_profile)) throw Error('BROKER_PROFILE_PATH_PROVENANCE');
const configurationRoot = path.join(fixture, 'opencode');
if (process.env.OPENCODE_CONFIG_DIR !== configurationRoot || process.env.HOME !== path.join(fixture, 'home')) throw Error('ENVIRONMENT_NOT_ISOLATED');
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save = (file: string, value: unknown) => fs.writeFileSync(path.join(fixture, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const daemon = new Daemon();
await daemon.start();
const handshakeFile = path.join(configurationRoot, 'sf-user/runtime/handshake.json');
const handshake = JSON.parse(fs.readFileSync(handshakeFile, 'utf8'));
if (handshake.pid !== process.pid || handshake.bound_to !== '127.0.0.1') throw Error('REAL_HANDSHAKE_IDENTITY');
const response = await fetch(`http://127.0.0.1:${handshake.port}/health`, { signal: AbortSignal.timeout(2000) });
const health = await response.json() as { success?: boolean; data?: { status?: string; service?: string; version?: string } };
if (!response.ok || health.data?.status !== 'ok' || health.data?.service !== 'daemon-core') throw Error('REAL_HEALTH_FAILED');
save(mode === 'serve' ? 'daemon-ready.json' : 'daemon-restarted.json', {
  utc: new Date().toISOString(), mode, nonce, pid: process.pid, port: handshake.port,
  real_daemon_class: true, actual_http_health: response.status, version: health.data.version,
  handshake_sha256: hash(handshakeFile), no_project_registered: true, no_model_requested: true,
});
if (mode === 'serve') {
  const launcher = path.join(workspace, '.tmp/verification-lpac-build/LpacRegistryReadPoc.exe');
  const frozen = path.join(workspace, 'docs/archive/2026-11-06-single-process-matrix/build-single-resource-06/LpacRegistryReadPoc.exe');
  if (hash(launcher) !== hash(frozen)) throw Error('LAUNCHER_DRIFT');
  const attempt = path.join(workspace, '.tmp/verification-lpac', nonce);
  const worker = spawn(launcher, ['--synthetic-single-resource-daemon-crash', attempt, 'C:\\Program Files\\nodejs\\node.exe'], {
    cwd: workspace, env: { ...process.env, LOCALAPPDATA: reservation.broker_local_appdata, USERPROFILE: reservation.broker_user_profile }, stdio: ['ignore', 'inherit', 'inherit'], detached: true, windowsHide: true,
  });
  const exited = new Promise<number>((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', (code) => resolve(code ?? 1));
  });
  if (!worker.pid) throw Error('BROKER_PID_MISSING');
  save('worker-spawned.json', { utc: new Date().toISOString(), pid: worker.pid, daemon_pid: process.pid, launcher_sha256: hash(launcher), attempt });
  await exited;
  // Reached only if the harness is not killed. No successful crash proof is emitted here.
  await daemon.stop();
  process.exitCode = 1;
}
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

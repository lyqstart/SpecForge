// Private synthetic integration harness. Starts the real Daemon; no product execution tool.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Daemon } from '../../../packages/daemon-core/src/daemon/Daemon';
async function main() {
const [mode, nonce] = process.argv.slice(2);
if (!['serve', 'restart'].includes(mode) || !/^[a-f0-9]{32}$/.test(nonce ?? '')) throw Error('FIXED_MODE_NONCE');
const workspace = path.resolve(process.cwd());
const fixture = path.join(workspace, '.tmp/verification-lpac-daemon', nonce);
if (!fs.existsSync(path.join(fixture, 'reservation.json'))) throw Error('OWNER_RESERVATION_REQUIRED');
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
  const frozen = path.join(workspace, 'docs/archive/2026-11-05-synthetic-boundary-matrix/build-daemon-owner-22/LpacRegistryReadPoc.exe');
  if (hash(launcher) !== hash(frozen)) throw Error('LAUNCHER_DRIFT');
  const attempt = path.join(workspace, '.tmp/verification-lpac', nonce);
  const worker = Bun.spawn([launcher, '--synthetic-resource-daemon-crash', attempt, 'C:\\Program Files\\nodejs\\node.exe'], {
    cwd: workspace, env: process.env, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit',
  });
  save('worker-spawned.json', { utc: new Date().toISOString(), pid: worker.pid, daemon_pid: process.pid, launcher_sha256: hash(launcher), attempt });
  await worker.exited;
  // Reached only if the harness is not killed. No successful crash proof is emitted here.
  await daemon.stop();
  process.exitCode = 1;
}
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

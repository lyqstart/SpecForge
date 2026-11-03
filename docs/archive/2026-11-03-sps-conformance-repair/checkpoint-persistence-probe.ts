import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const evidence = import.meta.dirname;
const receiptPath = path.join(evidence, 'checkpoint-persistence-result.json');
const started = new Date().toISOString();
const notes: string[] = [];
const record: Record<string, unknown> = { run_id: 'CODEX-SF-20261103-SPS-GAP-REPAIR-A01',
  started_utc: started, method: 'Controlled invocation of installed pre-compaction callback, not real OpenCode compaction',
  command: 'bun docs/archive/2026-11-03-sps-conformance-repair/checkpoint-persistence-probe.ts',
  cwd: process.cwd(), purpose: 'Verify actual deployed plugin callback to daemon to durable checkpoint file',
  expected_writes: 'Isolated fixture runtime checkpoint, installed plugin bridge diagnostic log, evidence receipt' };
let client: any;
try {
  await fs.access(receiptPath).then(() => { throw Error('RECEIPT_ALREADY_EXISTS'); }, () => undefined);
  const previous = JSON.parse(await fs.readFile(path.join(evidence, 'isolated-registration-result.json'), 'utf8'));
  const fixture = previous.fixture;
  const nativeSession = previous.observations.find((o: any) => o.method === 'POST' && o.endpoint === '/session')?.response?.id;
  if (!nativeSession) throw Error('NATIVE_SESSION_ID_EVIDENCE_MISSING');
  const privateRoot = path.join(homedir(), '.config/opencode/sf-user');
  const { createSpecForgeThinPlugin } = await import(pathToFileURL(path.join(privateRoot, 'lib/sf_thin_plugin.ts')).href);
  const { createReconnectingDaemonClient } = await import(pathToFileURL(path.join(privateRoot, 'lib/sf_plugin_client.ts')).href);
  client = createReconnectingDaemonClient({ initialDelayMs: 250, maxCumulativeBackoffMs: 5000, backoffFactor: 2 });
  const registration = await client.register(fixture);
  if (registration.mode !== 'personal') throw Error('PROBE_REQUIRES_CONFIRMED_PERSONAL_RUNTIME');
  const checkpointPath = path.join(fixture, '.specforge/runtime/checkpoints', `${registration.sessionId}.json`);
  const existed = await fs.access(checkpointPath).then(() => true, () => false);
  if (existed) throw Error('CHECKPOINT_ALREADY_EXISTS');
  const hooks = await createSpecForgeThinPlugin({ directory: fixture }, { client, notify: (value: string) => notes.push(value) });
  await hooks['experimental.session.compacting']({ sessionID: nativeSession }, {});
  const bytes = await fs.readFile(checkpointPath);
  const checkpoint = JSON.parse(bytes.toString('utf8'));
  if (checkpoint.projectPath !== fixture || checkpoint.opencodeSessionId !== nativeSession ||
      checkpoint.source !== 'opencode.experimental.session.compacting' || checkpoint.phase !== 'pre-compaction') throw Error('CHECKPOINT_IDENTITY_MISMATCH');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { stdout } = await promisify(execFile)('node', ['-e',
    "const f=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex'))", checkpointPath], { windowsHide: true });
  if (stdout !== sha256) throw Error('INDEPENDENT_PROCESS_HASH_MISMATCH');
  Object.assign(record, { fixture, registration: { sessionId: registration.sessionId, projectId: registration.projectId, mode: registration.mode },
    checkpoint_path: checkpointPath, checkpoint_sha256: sha256, checkpoint,
    independent_process_sha256: stdout, persisted_checkpoint: 'CONFIRMED',
    real_opencode_triggered_compaction: 'NOT_EXECUTED', carrier_exit_code: 0, inner_exit_code: 0 });
} catch (error) {
  record.error = String(error); record.carrier_exit_code = 1; record.inner_exit_code = 1; process.exitCode = 1;
} finally {
  client?.dispose?.();
  record.notes = notes; record.finished_utc = new Date().toISOString();
  await fs.writeFile(receiptPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ receipt: receiptPath, persisted_checkpoint: record.persisted_checkpoint, error: record.error, inner_exit_code: record.inner_exit_code }));
}

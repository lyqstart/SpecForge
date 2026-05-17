/**
 * Crash Recovery Worker
 *
 * Spawned by the integration test harness. Runs an aggressive WAL append loop
 * so the parent process can SIGKILL it mid-write to validate that
 * `events.jsonl` survives a hard crash and that `rebuildState()` produces
 * exactly the events that were claimed durable before the kill.
 *
 * Protocol (stdout, line-delimited):
 *   READY <basePath>             // emitted once after init
 *   WROTE <eventId> <seq>        // emitted AFTER fsync of events.jsonl
 *   BLOB <eventId> <blobRef>     // emitted AFTER a CAS blob is fsynced (subset of events)
 *
 * Args:
 *   argv[2] = basePath for events.jsonl/state.json
 *   argv[3] = casPath for CAS blobs
 *   argv[4] = projectId (16 hex chars)
 *
 * Termination contract:
 *   - On SIGKILL (used by the test) the loop is interrupted at an arbitrary
 *     point. Anything emitted as `WROTE` MUST already be present on disk.
 *   - On SIGTERM we exit cleanly so the worker can also be used outside the
 *     "kill" path if needed.
 */

import { EventLogger } from '../../../src/event-logger/index.js';
import { CAS } from '../../../src/cas/index.js';
import { generateEventId } from '../../../src/types/event-utils.js';
import type { Event } from '../../../src/types/index.js';

function nextNanoTs(seq: number): number {
  // Stable monotonic-ish ts, in nanoseconds, unique per seq.
  return Date.now() * 1_000_000 + seq;
}

async function main(): Promise<void> {
  const basePath = process.argv[2];
  const casPath = process.argv[3];
  const projectId = process.argv[4] ?? '0123456789abcdef';

  if (!basePath || !casPath) {
    process.stderr.write('crash-worker: missing basePath or casPath argv\n');
    process.exit(2);
  }

  const logger = new EventLogger(basePath);
  await logger.initialize();

  const cas = new CAS(casPath);
  await cas.initialize();

  process.stdout.write(`READY ${basePath}\n`);

  let cleanExit = false;
  const handleTerm = (): void => {
    cleanExit = true;
  };
  process.on('SIGTERM', handleTerm);
  process.on('SIGINT', handleTerm);

  let seq = 0;
  // Run until the parent SIGKILLs us, or until SIGTERM is seen, or we hit a
  // generous safety cap so a stuck test never leaks the process forever.
  const MAX_EVENTS = 10_000;
  while (!cleanExit && seq < MAX_EVENTS) {
    seq += 1;

    // Every 3rd event embeds a large payload via CAS to validate that
    // recovery includes blob references too.
    const useBlob = seq % 3 === 0;
    let payloadBlobRef: string | undefined;
    let payload: unknown = { seq, kind: 'small', ts: Date.now() };

    if (useBlob) {
      const big = `crash-worker-blob-${seq}-` + 'X'.repeat(70_000);
      payloadBlobRef = await cas.store(big);
      payload = { seq, kind: 'large', via: 'cas' };
    }

    const event: Event = {
      schema_version: '1.0',
      eventId: generateEventId(),
      ts: nextNanoTs(seq),
      monotonicSeq: seq,
      projectId,
      workItemId: `work-${seq}`,
      actor: { id: 'crash-worker', name: 'CrashWorker', type: 'test' },
      category: 'system',
      action: `crash.worker.event.${seq}`,
      payload,
      ...(payloadBlobRef !== undefined ? { payloadBlobRef } : {}),
    };

    // EventLogger.append performs fsync before returning, so by the time we
    // emit WROTE the event MUST be durable on disk.
    await logger.append(event);

    if (payloadBlobRef !== undefined) {
      process.stdout.write(`BLOB ${event.eventId} ${payloadBlobRef}\n`);
    }
    process.stdout.write(`WROTE ${event.eventId} ${seq}\n`);
  }

  if (cleanExit) {
    process.exit(0);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`crash-worker: fatal ${(err as Error).message}\n`);
  process.exit(1);
});

/**
 * Crash Recovery: Subprocess SIGKILL Integration Test
 *
 * **Validates: Requirements 2.2, 2.5**
 *
 * Unlike the in-process tests in `crash-recovery.test.ts` (which simulate a
 * crash by dropping the EventLogger/CAS instance), this test forks a worker
 * and **hard-kills** it with SIGKILL while it is mid-write. That is the only
 * way to validate the WAL hard judgement:
 *
 *   - events.jsonl is append-only and fsync'd before EventLogger.append()
 *     resolves, so every "WROTE" line the worker printed must be visible on
 *     disk after the kill (no acknowledged event is lost).
 *   - state.json is a derived checkpoint; rebuildState() must reconstruct the
 *     same events from events.jsonl after the crash.
 *   - CAS blobs are content-addressed and survive the kill: every "BLOB"
 *     reference the worker emitted is still retrievable by the recovered CAS
 *     instance.
 *
 * This is the W1-exit hard check: "WAL ordering verified".
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAS } from '../../src/cas/index.js';
import { EventLogger } from '../../src/event-logger/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const WORKER_PATH = resolve(here, 'fixtures', 'crash-worker.ts');
const BUN_BIN = process.execPath; // tests are invoked through bun

interface AcknowledgedEvent {
  eventId: string;
  seq: number;
}

interface AcknowledgedBlob {
  eventId: string;
  blobRef: string;
}

interface WorkerObservations {
  events: AcknowledgedEvent[];
  blobs: AcknowledgedBlob[];
}

/**
 * Spawn the crash worker, let it write at least `minEvents` events, then
 * SIGKILL it. Returns the events the worker claimed durable BEFORE the kill.
 */
async function runUntilKilled(
  basePath: string,
  casPath: string,
  projectId: string,
  minEvents: number,
): Promise<WorkerObservations> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child: ChildProcess = spawn(
      BUN_BIN,
      ['run', WORKER_PATH, basePath, casPath, projectId],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const events: AcknowledgedEvent[] = [];
    const blobs: AcknowledgedBlob[] = [];
    let stdoutBuf = '';
    let killed = false;
    let settled = false;
    const stderrLines: string[] = [];

    const safetyTimer = setTimeout(() => {
      if (!killed) {
        killed = true;
        child.kill('SIGKILL');
      }
    }, 15_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;

        if (line.startsWith('WROTE ')) {
          const [, eventId, seqStr] = line.split(' ');
          events.push({ eventId, seq: Number(seqStr) });
          if (!killed && events.length >= minEvents) {
            killed = true;
            // SIGKILL is the whole point: no graceful shutdown allowed.
            child.kill('SIGKILL');
          }
        } else if (line.startsWith('BLOB ')) {
          const [, eventId, blobRef] = line.split(' ');
          blobs.push({ eventId, blobRef });
        }
        // READY and other lines are informational
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrLines.push(chunk.toString('utf8'));
    });

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      fn();
    };

    child.on('error', (err) => {
      settle(() => rejectPromise(err));
    });

    child.on('exit', () => {
      // Drain any remaining buffered line that didn't end in \n.
      if (stdoutBuf.trim().startsWith('WROTE ')) {
        // We deliberately DROP the trailing partial WROTE line if any: only
        // events whose ack reached the parent before the kill count as
        // "claimed durable". In practice the kernel keeps newline-terminated
        // writes flushed, so this branch is rarely hit; the test still needs
        // to be robust either way.
      }

      if (events.length < minEvents) {
        rejectPromise(
          new Error(
            `crash-worker exited before producing ${minEvents} acknowledged events ` +
              `(got ${events.length}). stderr=${stderrLines.join('')}`,
          ),
        );
        return;
      }
      settle(() => resolvePromise({ events, blobs }));
    });
  });
}

describe('Crash Recovery: Subprocess SIGKILL', () => {
  let tempDir: string;
  let basePath: string;
  let casPath: string;
  const projectId = 'aabbccddeeff0011';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crash-subproc-'));
    basePath = join(tempDir, 'events');
    casPath = join(tempDir, 'cas');
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it(
    'preserves every fsync-acknowledged event after SIGKILL (WAL durability)',
    async () => {
      // Let the worker push at least 12 events through the WAL, then SIGKILL
      // it. The 12 threshold is small enough to be fast but large enough to
      // include several CAS blobs (every 3rd event).
      const observed = await runUntilKilled(basePath, casPath, projectId, 12);

      expect(observed.events.length).toBeGreaterThanOrEqual(12);

      // ---- Recovery: open fresh instances pointing at the SAME on-disk state.
      const recoveredLogger = new EventLogger(basePath);
      await recoveredLogger.initialize();

      const recoveredCas = new CAS(casPath);
      await recoveredCas.initialize();

      // Pull all events back from events.jsonl directly (no rebuildState yet).
      const replayed: { eventId: string; monotonicSeq: number }[] = [];
      for await (const ev of recoveredLogger.getEvents()) {
        replayed.push({ eventId: ev.eventId, monotonicSeq: ev.monotonicSeq });
      }

      // Hard WAL guarantee: every event the worker claimed durable BEFORE the
      // kill must be on disk. The on-disk log MAY contain additional events
      // whose fsync completed but whose stdout ack didn't make it back before
      // SIGKILL — that's still WAL-correct. So we check inclusion, not equality.
      const replayedIds = new Set(replayed.map((e) => e.eventId));
      for (const acked of observed.events) {
        expect(
          replayedIds.has(acked.eventId),
          `acknowledged event ${acked.eventId} (seq=${acked.seq}) was lost after SIGKILL`,
        ).toBe(true);
      }

      // monotonicSeq is strictly increasing in the worker, so the replayed
      // sequence must also be sorted ascending — i.e., events.jsonl is an
      // append-only WAL, no reordering on recovery.
      const seqs = replayed.map((e) => e.monotonicSeq);
      const sorted = [...seqs].sort((a, b) => a - b);
      expect(seqs).toEqual(sorted);
    },
    30_000,
  );

  it(
    'rebuilds state.json from events.jsonl after crash (state reconstruction)',
    async () => {
      const observed = await runUntilKilled(basePath, casPath, projectId, 9);

      const recovered = new EventLogger(basePath);
      await recovered.initialize();

      // Before rebuild, lastEventId should already point at the tail of the
      // WAL because initialize() reads the last line.
      expect(recovered.getLastEventId()).not.toBeNull();

      const state = await recovered.rebuildState();
      expect(state.events.length).toBeGreaterThanOrEqual(observed.events.length);
      expect(state.eventCount).toBe(state.events.length);

      // Categories derived from events: worker only emits 'system'.
      const systemCount = state.events.filter((e) => e.category === 'system').length;
      expect(systemCount).toBe(state.events.length);

      // Project counts derived from events.
      const projectCount = state.events.filter((e) => e.projectId === projectId).length;
      expect(projectCount).toBe(state.events.length);
    },
    30_000,
  );

  it(
    'recovers every CAS blob referenced by an acknowledged event',
    async () => {
      // Ask for 15 events so we are guaranteed several blob events (every 3rd).
      const observed = await runUntilKilled(basePath, casPath, projectId, 15);
      expect(observed.blobs.length).toBeGreaterThan(0);

      const recoveredCas = new CAS(casPath);
      await recoveredCas.initialize();

      for (const blob of observed.blobs) {
        const exists = await recoveredCas.exists(blob.blobRef);
        expect(exists, `blob ${blob.blobRef} missing after SIGKILL`).toBe(true);

        const content = await recoveredCas.retrieve(blob.blobRef);
        expect(content, `blob ${blob.blobRef} unreadable after SIGKILL`).not.toBeNull();
        // Worker's blob payload starts with a known prefix — verify integrity.
        expect(typeof content).toBe('string');
        expect((content as string).startsWith('crash-worker-blob-')).toBe(true);
      }
    },
    30_000,
  );
});

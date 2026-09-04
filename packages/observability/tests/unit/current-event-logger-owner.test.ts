import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventLogger } from '../../src/event-logger/index.js';
import type { Event } from '../../src/types/index.js';

const event: Event = {
  schema_version: '1.0',
  eventId: '00000000-0000-4000-8000-000000000001',
  ts: 1,
  monotonicSeq: 1,
  projectId: '0123456789abcdef',
  category: 'system',
  action: 'system.started',
  payload: { source: 'daemon-wal' },
};

describe('EventLogger current WAL ownership boundary', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'observability-current-owner-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('does not create an empty events.jsonl during initialization', async () => {
    const logger = new EventLogger(root);
    await logger.initialize();

    await expect(stat(join(root, 'events.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('tracks an acknowledged Daemon event without becoming a second WAL writer', async () => {
    const logger = new EventLogger(root);
    await logger.initialize();
    await logger.trackEvent(event);

    expect(await logger.getProjectStats(event.projectId)).toMatchObject({ eventCount: 1 });
    await expect(stat(join(root, 'events.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('queries a valid events.jsonl prewritten by the Daemon WAL owner', async () => {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');

    const logger = new EventLogger(root);
    await logger.initialize();
    const events: Event[] = [];
    for await (const persisted of logger.getEvents()) events.push(persisted);

    expect(events).toEqual([event]);
  });
});

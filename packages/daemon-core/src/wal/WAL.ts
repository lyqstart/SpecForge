/** Authoritative append-only event history, including retained rotation segments. */
import * as fs from 'fs/promises';
import * as path from 'path';
import { v7 as uuidv7 } from 'uuid';
import { Event } from '../types';
import { isCurrentRuntimeEvent, RUNTIME_SCHEMA_DESCRIPTORS } from '../state/runtime-schema-descriptors';

const WAL_MAX_SIZE = 5 * 1024 * 1024;
const ARCHIVE_NAME = /^events-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z(?:-[a-f0-9-]+)?\.jsonl\.bak$/;
const operations = new Map<string, Promise<unknown>>();

export interface ReadAllEventsResult {
  events: Event[];
  corruptedLines: Array<{ lineNumber: number; content: string; error: string }>;
}

export class WAL {
  private schemaVersion = '1.0';
  private _lastSeq = 0;
  private lastObservedId = '';
  private supportedCategories = new Set(['state', 'session', 'system']);
  constructor(private eventsPath: string) {}

  private async serialized<T>(action: () => Promise<T>): Promise<T> {
    const resolved = path.resolve(this.eventsPath);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const previous = operations.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(action);
    operations.set(key, pending);
    try { return await pending; }
    finally { if (operations.get(key) === pending) operations.delete(key); }
  }

  registerCategory(category: string): void { this.supportedCategories.add(category); }

  async initialize(): Promise<void> {
    await this.serialized(async () => {
      const { events } = await this.readHistory();
      this._lastSeq = events.at(-1)?.monotonicSeq ?? 0;
      await fs.mkdir(path.dirname(this.eventsPath), { recursive: true });
    });
  }

  async appendEvent(event: Event): Promise<void> {
    if (!isCurrentRuntimeEvent(event)) throw new Error('WAL_EVENT_SCHEMA_INVALID');
    await this.serialized(async () => {
      const { events } = await this.readHistory();
      if (events.some(previous => previous.eventId === event.eventId)) throw new Error('WAL_DUPLICATE_EVENT');
      // Sequence belongs to durable insertion order, not reservation/caller order.
      event.monotonicSeq = (events.at(-1)?.monotonicSeq ?? 0) + 1;
      const line = JSON.stringify(event) + '\n';
      await this.rotateIfNeeded();
      await fs.appendFile(this.eventsPath, line, 'utf-8');
      const handle = await fs.open(this.eventsPath, 'a');
      try { await handle.sync(); } finally { await handle.close(); }
      this._lastSeq = Math.max(this._lastSeq, event.monotonicSeq);
      this.lastObservedId = event.eventId;
    });
  }

  createEvent(projectId: string, category: string, action: string,
    payload: Record<string, unknown>, actor = 'system',
    source: 'daemon' | 'client' | 'adapter' = 'daemon'): Event {
    this._lastSeq++;
    if (!this.supportedCategories.has(category)) console.warn(`[WAL] Unknown category '${category}' — event will be written but may not be replayed`);
    return { schema_version: '1.0', eventId: uuidv7(), ts: Date.now(),
      monotonicSeq: this._lastSeq, projectId, actor, category, action, payload,
      metadata: { schemaVersion: this.schemaVersion, source } };
  }

  /** Every read validates every segment; no malformed record is silently skipped. */
  async readAllEvents(): Promise<ReadAllEventsResult> {
    return this.serialized(() => this.readHistory());
  }

  private async readHistory(): Promise<ReadAllEventsResult> {
    const dir = path.dirname(this.eventsPath);
    const names = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [] as string[];
      throw error;
    });
    const archives = names.filter(name => ARCHIVE_NAME.test(name)).sort();
    const hasCurrent = names.includes(path.basename(this.eventsPath));
    if (!hasCurrent && (archives.length > 0 || this.lastObservedId)) throw new Error('WAL_HISTORY_MISSING');
    const events: Event[] = [];
    const ids = new Set<string>();
    for (const file of [...archives, ...(hasCurrent ? [path.basename(this.eventsPath)] : [])]) {
      const bytes = await fs.readFile(path.join(dir, file), 'utf-8');
      if (!bytes.trim()) throw new Error('WAL_EMPTY_INPUT');
      const lines = bytes.split('\n');
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!;
        if (!line.trim()) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); }
        catch { throw new Error(`WAL_CORRUPT_INPUT:file=${file}:line=${index + 1}`); }
        if (!isCurrentRuntimeEvent(parsed)) throw new Error(`WAL_EVENT_SCHEMA_INVALID:file=${file}:line=${index + 1}`);
        const event = parsed as Event;
        if (ids.has(event.eventId)) throw new Error('WAL_DUPLICATE_EVENT');
        if (event.monotonicSeq !== events.length + 1) throw new Error('WAL_HISTORY_SEQUENCE_INVALID');
        ids.add(event.eventId);
        events.push(event);
      }
    }
    if (this.lastObservedId && !ids.has(this.lastObservedId)) throw new Error('WAL_HISTORY_TRUNCATED');
    // A persisted cursor proves this is not a fresh project, including when
    // read/append is invoked by recovery or session owners without StateManager.
    try {
      const checkpoint = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf-8'));
      if (!RUNTIME_SCHEMA_DESCRIPTORS[0]!.validateCurrent!(checkpoint)) throw new Error('WAL_CHECKPOINT_INVALID');
      if (checkpoint.lastEventId) {
        const witnessed = events.find(event => event.eventId === checkpoint.lastEventId);
        if (!witnessed || witnessed.ts !== checkpoint.lastEventTs) throw new Error('WAL_HISTORY_TRUNCATED');
      } else if (checkpoint.workItems.length > 0 && events.length === 0) throw new Error('WAL_HISTORY_MISSING');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (events.length) this.lastObservedId = events.at(-1)!.eventId;
    return { events, corruptedLines: [] };
  }

  async readEventsByCategory(category: string): Promise<Event[]> {
    return (await this.readAllEvents()).events.filter(event => event.category === category);
  }
  async getLastEvent(): Promise<Event | null> { return (await this.readAllEvents()).events.at(-1) ?? null; }
  getCurrentSeq(): number { return this._lastSeq; }
  getEventsPath(): string { return this.eventsPath; }
  getSchemaVersion(): string { return this.schemaVersion; }

  private async rotateIfNeeded(): Promise<void> {
    const stat = await fs.stat(this.eventsPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat || stat.size < WAL_MAX_SIZE) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(path.dirname(this.eventsPath), `events-${timestamp}-${uuidv7()}.jsonl.bak`);
    await fs.rename(this.eventsPath, archivePath);
    // Segments are authoritative history, not disposable observability logs.
    // Retain every segment; interrupted rotation is rejected, never treated as new.
  }
}

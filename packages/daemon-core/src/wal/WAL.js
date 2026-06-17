/**
 * Write-Ahead Log (WAL) implementation
 *
 * Implements events.jsonl file format with append + fsync semantics.
 * Ensures WAL ordering: events.jsonl fsync before state.json update.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { v7 as uuidv7 } from 'uuid';
const WAL_MAX_SIZE = 5 * 1024 * 1024; // 5MB threshold
const WAL_MAX_ARCHIVE_FILES = 3; // Keep at most 3 archive files
export class WAL {
    eventsPath;
    schemaVersion = '1.0';
    _lastSeq = 0;
    supportedCategories;
    constructor(eventsPath) {
        this.eventsPath = eventsPath;
        this.supportedCategories = new Set(['state', 'session', 'system']);
    }
    /**
     * Register a new event category for the WAL.
     * Future extensibility point — allows plugins to define custom categories.
     */
    registerCategory(category) {
        this.supportedCategories.add(category);
    }
    /**
     * Initialize WAL directory and file.
     * Reads last event from disk to seed the monotonicSeq counter.
     */
    async initialize() {
        const dir = path.dirname(this.eventsPath);
        await fs.mkdir(dir, { recursive: true });
        try {
            await fs.access(this.eventsPath);
            // Seed monotonicSeq from last event
            const lastEvent = await this.getLastEvent();
            if (lastEvent && typeof lastEvent.monotonicSeq === 'number') {
                this._lastSeq = lastEvent.monotonicSeq;
            }
        }
        catch (error) {
            // File doesn't exist, create empty file
            await fs.writeFile(this.eventsPath, '');
        }
    }
    /**
     * Append an event to the WAL with fsync semantics
     *
     * This method ensures that the event is written to disk and fsynced
     * before returning, guaranteeing durability.
     * WAL ordering: events.jsonl is fsynced BEFORE any state.json update.
     */
    async appendEvent(event) {
        // Serialise to JSONL line
        const line = JSON.stringify(event) + '\n';
        // Rotate if WAL file exceeds threshold (non-blocking — failures are silently logged)
        await this.rotateIfNeeded();
        // Step 1: Append event to events.jsonl
        await fs.appendFile(this.eventsPath, line, 'utf-8');
        // Step 2: fsync to ensure data is flushed to disk
        const handle = await fs.open(this.eventsPath, 'a');
        try {
            await handle.sync();
        }
        finally {
            await handle.close();
        }
    }
    /**
     * Create a new event with UUIDv7 eventId and monotonically increasing seq number.
     *
     * The returned Event conforms to the unified event schema:
     * schema_version, eventId, ts, monotonicSeq, projectId, actor, category, action, payload.
     *
     * @param projectId - Project or Work Item identifier
     * @param category  - Event category for routing (e.g. 'state', 'session', 'system')
     * @param action    - Event action verb (e.g. 'state.transition')
     * @param payload   - Arbitrary structured payload data
     * @param actor     - Actor that triggered the event (default 'system')
     * @param source    - Event source (default 'daemon')
     */
    createEvent(projectId, category, action, payload, actor = 'system', source = 'daemon') {
        // Auto-increment monotonicSeq (strictly increasing, never rolls back)
        this._lastSeq += 1;
        // Soft validation: warn on unknown categories but do NOT block writing
        if (!this.supportedCategories.has(category)) {
            console.warn(`[WAL] Unknown category '${category}' — event will be written but may not be replayed`);
        }
        const event = {
            schema_version: '1.0',
            eventId: uuidv7(),
            ts: Date.now(),
            monotonicSeq: this._lastSeq,
            projectId,
            actor,
            category,
            action,
            payload,
            // Legacy metadata kept for backward compat
            metadata: {
                schemaVersion: this.schemaVersion,
                source,
            },
        };
        return event;
    }
    /**
     * Read all events from the WAL in insertion order.
     * Returns { events, corruptedLines } — corrupted/invalid lines are skipped
     * and reported in corruptedLines for diagnostics.
     */
    async readAllEvents() {
        const events = [];
        const corruptedLines = [];
        try {
            const content = await fs.readFile(this.eventsPath, 'utf-8');
            if (!content)
                return { events, corruptedLines };
            const lines = content.split('\n').filter(line => line.trim().length > 0);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                try {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                    events.push(JSON.parse(line));
                }
                catch (parseError) {
                    const lineNumber = i + 1;
                    const truncated = line.substring(0, 100);
                    console.warn(`[WAL] Skipping corrupted line ${lineNumber}: ${truncated}`);
                    corruptedLines.push({
                        lineNumber,
                        content: truncated,
                        error: parseError instanceof Error ? parseError.message : String(parseError),
                    });
                }
            }
        }
        catch (error) {
            // File doesn't exist or is unreadable — both are normal
        }
        return { events, corruptedLines };
    }
    /**
     * Read events from the WAL filtered by category.
     * Events without a `category` field default to `'state'` for backward compat.
     */
    async readEventsByCategory(category) {
        const { events } = await this.readAllEvents();
        return events.filter(event => {
            const eventCategory = event.category ?? 'state';
            return eventCategory === category;
        });
    }
    /**
     * Get the last event from the WAL.
     * Returns null if the WAL is empty.
     */
    async getLastEvent() {
        const { events } = await this.readAllEvents();
        return events.length > 0 ? events[events.length - 1] : null;
    }
    /**
     * Get the current monotonic sequence number (without incrementing).
     * Useful for diagnostics and verification.
     */
    getCurrentSeq() {
        return this._lastSeq;
    }
    /**
     * Get the path to the events.jsonl file
     */
    getEventsPath() {
        return this.eventsPath;
    }
    /**
     * Get the schema version
     */
    getSchemaVersion() {
        return this.schemaVersion;
    }
    /**
     * Rotate events.jsonl to an archive file if it exceeds WAL_MAX_SIZE.
     *
     * Archives are named events-ISO-8601-timestamp.jsonl.bak.
     * Failed rotation is silently logged — event write proceeds regardless.
     */
    async rotateIfNeeded() {
        try {
            const stat = await fs.stat(this.eventsPath);
            if (stat.size < WAL_MAX_SIZE)
                return;
        }
        catch {
            return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = `events-${timestamp}.jsonl.bak`;
        const archiveDir = path.dirname(this.eventsPath);
        const archivePath = path.join(archiveDir, archiveName);
        await fs.rename(this.eventsPath, archivePath);
        await fs.writeFile(this.eventsPath, '');
        await this.cleanupOldArchives();
        console.log(`[WAL] Rotated events.jsonl → ${archivePath}`);
    }
    /**
     * Clean up old archive files, keeping at most WAL_MAX_ARCHIVE_FILES.
     * Archives are sorted alphabetically; oldest are removed first.
     */
    async cleanupOldArchives() {
        const archiveDir = path.dirname(this.eventsPath);
        const files = await fs.readdir(archiveDir);
        const archives = files
            .filter(f => f.startsWith('events-') && f.endsWith('.jsonl.bak'))
            .sort();
        while (archives.length > WAL_MAX_ARCHIVE_FILES) {
            const oldest = archives.shift();
            await fs.unlink(path.join(archiveDir, oldest)).catch(() => { });
        }
    }
}
//# sourceMappingURL=WAL.js.map
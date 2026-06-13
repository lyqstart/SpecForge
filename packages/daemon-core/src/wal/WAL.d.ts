/**
 * Write-Ahead Log (WAL) implementation
 *
 * Implements events.jsonl file format with append + fsync semantics.
 * Ensures WAL ordering: events.jsonl fsync before state.json update.
 */
import { Event } from '../types';
export interface ReadAllEventsResult {
    events: Event[];
    corruptedLines: Array<{
        lineNumber: number;
        content: string;
        error: string;
    }>;
}
export declare class WAL {
    private eventsPath;
    private schemaVersion;
    private _lastSeq;
    private supportedCategories;
    constructor(eventsPath: string);
    /**
     * Register a new event category for the WAL.
     * Future extensibility point — allows plugins to define custom categories.
     */
    registerCategory(category: string): void;
    /**
     * Initialize WAL directory and file.
     * Reads last event from disk to seed the monotonicSeq counter.
     */
    initialize(): Promise<void>;
    /**
     * Append an event to the WAL with fsync semantics
     *
     * This method ensures that the event is written to disk and fsynced
     * before returning, guaranteeing durability.
     * WAL ordering: events.jsonl is fsynced BEFORE any state.json update.
     */
    appendEvent(event: Event): Promise<void>;
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
    createEvent(projectId: string, category: string, action: string, payload: Record<string, unknown>, actor?: string, source?: 'daemon' | 'client' | 'adapter'): Event;
    /**
     * Read all events from the WAL in insertion order.
     * Returns { events, corruptedLines } — corrupted/invalid lines are skipped
     * and reported in corruptedLines for diagnostics.
     */
    readAllEvents(): Promise<ReadAllEventsResult>;
    /**
     * Read events from the WAL filtered by category.
     * Events without a `category` field default to `'state'` for backward compat.
     */
    readEventsByCategory(category: string): Promise<Event[]>;
    /**
     * Get the last event from the WAL.
     * Returns null if the WAL is empty.
     */
    getLastEvent(): Promise<Event | null>;
    /**
     * Get the current monotonic sequence number (without incrementing).
     * Useful for diagnostics and verification.
     */
    getCurrentSeq(): number;
    /**
     * Get the path to the events.jsonl file
     */
    getEventsPath(): string;
    /**
     * Get the schema version
     */
    getSchemaVersion(): string;
    /**
     * Rotate events.jsonl to an archive file if it exceeds WAL_MAX_SIZE.
     *
     * Archives are named events-ISO-8601-timestamp.jsonl.bak.
     * Failed rotation is silently logged — event write proceeds regardless.
     */
    private rotateIfNeeded;
    /**
     * Clean up old archive files, keeping at most WAL_MAX_ARCHIVE_FILES.
     * Archives are sorted alphabetically; oldest are removed first.
     */
    private cleanupOldArchives;
}
//# sourceMappingURL=WAL.d.ts.map
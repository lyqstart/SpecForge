import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EventLogger } from '../../src/event-logger/index.js';
import type { Event } from '../../src/types/index.js';

/**
 * Test fixture for the current producer-consumer order. The Daemon owns the
 * WAL write; Observability only tracks/indexes the acknowledged event.
 */
export class DaemonWalFixtureEventLogger extends EventLogger {
  override async append(event: Event): Promise<void> {
    const eventsPath = this.getEventsPath();
    await mkdir(dirname(eventsPath), { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    await this.trackEvent(event);
  }
}

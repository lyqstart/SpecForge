import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('Workflow Runtime and Daemon dependency direction', () => {
  it('keeps Workflow Runtime production integration behind its IEventBus port', async () => {
    const integration = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/src/event-integration.ts'),
      'utf8',
    );

    expect(integration).not.toContain('@specforge/daemon-core');
    expect(integration).not.toContain('new EventBus(');
    expect(integration).toContain('eventBus: IEventBus;');
    expect(integration).toContain('const eventBus = config.eventBus;');
  });
});

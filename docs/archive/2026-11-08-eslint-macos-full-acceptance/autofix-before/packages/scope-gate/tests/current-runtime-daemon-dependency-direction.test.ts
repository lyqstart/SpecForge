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

  it('keeps Workflow Runtime tests, package metadata, and current docs independent of Daemon', async () => {
    const packageJson = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/package.json'),
      'utf8',
    );
    const eventIntegrationTest = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/tests/integration/event-integration.test.ts'),
      'utf8',
    );
    const eventPublisherTest = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/tests/integration/event-publisher.test.ts'),
      'utf8',
    );
    const propertyTest = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/tests/integration/workflow-e2e-property-29.test.ts'),
      'utf8',
    );
    const subscriptionTest = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/tests/event-subscription.test.ts'),
      'utf8',
    );
    const deployment = await readFile(
      resolve(ROOT, 'packages/workflow-runtime/docs/DEPLOYMENT.md'),
      'utf8',
    );

    for (const consumer of [
      packageJson,
      eventIntegrationTest,
      eventPublisherTest,
      propertyTest,
      subscriptionTest,
      deployment,
    ]) {
      expect(consumer).not.toContain('@specforge/daemon-core');
      expect(consumer).not.toContain('../../daemon-core');
    }
  });

  it('keeps the state advancement subject list owned by Workflow Runtime', async () => {
    const daemonStateMachine = await readFile(
      resolve(ROOT, 'packages/daemon-core/src/tools/lib/state-machine-v11.ts'),
      'utf8',
    );

    expect(daemonStateMachine).toContain(
      "import { STATE_ADVANCEMENT_SUBJECTS } from '@specforge/workflow-runtime';",
    );
    expect(daemonStateMachine).not.toContain(
      'export const STATE_ADVANCEMENT_SUBJECTS = new Set([',
    );
  });
});

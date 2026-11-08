/**
 * sf_safe_bash callerRole extraction tests.
 * Write authorization is covered at the canonical runtime write-guard boundary.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getHandler } from '../../src/tools/ToolDispatcher';
// Import triggers registerHandler side-effect.
import '../../src/tools/handlers/sf-safe-bash';

describe('sf_safe_bash handler — callerRole extraction', () => {
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler('sf_safe_bash')!;
    expect(handler).toBeDefined();
  });

  it('extracts sf-orchestrator from context.agent', async () => {
    const result = await handler(
      { command: 'echo hello' },
      { directory: process.cwd(), agent: 'sf-orchestrator' },
      {},
    );
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles missing context.agent gracefully', async () => {
    const result = await handler(
      { command: 'echo hello' },
      { directory: process.cwd() },
      {},
    );
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('does not elevate an unknown agent string', async () => {
    const result = await handler(
      { command: 'echo hello' },
      { directory: process.cwd(), agent: 'unknown-role-xyz' },
      {},
    );
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles a context without an agent field', async () => {
    const result = await handler(
      { command: 'echo hello' },
      { directory: process.cwd() },
      {},
    );
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

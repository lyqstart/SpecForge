import { describe, expect, it, vi } from 'vitest';
import { CompositeGateRunner, DefaultGateRunnerLogger } from '../../src/GateRunner';
import { createRetryDecorator } from '../../src/retry';
import type { CompositeGateDefinition } from '../../src/types';

describe('production async and diagnostics contracts', () => {
  const gate: CompositeGateDefinition = { schema_version: '1.0', type: 'composite', id: 'cancel', name: 'Cancel', mode: 'parallel', failPolicy: 'collect_all', children: [] };
  it('awaits an injected asynchronous publisher and preserves its receiver', async () => {
    let release: (() => void) | undefined;
    const receivers: unknown[] = [];
    const pending = new Promise<void>(resolve => { release = resolve; });
    const publisher = { publish(this: object): Promise<void> { receivers.push(this); return pending; } };
    const runner = new CompositeGateRunner(gate, { eventPublisher: publisher });
    let settled = false;
    const cancellation = runner.cancel('test').then(() => { settled = true; });
    await Promise.resolve();
    expect(receivers).toEqual([publisher]);
    expect(settled).toBe(false);
    if (!release) throw new Error('publisher release not initialized');
    release();
    await cancellation;
    expect(settled).toBe(true);
  });
  it('propagates publisher failure instead of leaking a detached rejection', async () => {
    const failure = new Error('publisher failure');
    const runner = new CompositeGateRunner(gate, { eventPublisher: { publish: (): Promise<void> => Promise.reject(failure) } });
    await expect(runner.cancel()).rejects.toBe(failure);
  });
  it('returns real promises for both synchronous and asynchronous retry producers', async () => {
    const decorate = createRetryDecorator({ maxAttempts: 1 });
    const synchronous = decorate((value: number): number => value + 1);
    const asynchronous = decorate((value: string): Promise<string> => Promise.resolve(value.toUpperCase()));
    const result: Promise<number> = synchronous(2);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(3);
    await expect(asynchronous('ok')).resolves.toBe('OK');
  });
  it('keeps default info and debug diagnostics off stdout', () => {
    const writes: string[] = [];
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { writes.push(String(chunk)); return true; });
    const stdout = vi.spyOn(process.stdout, 'write');
    try {
      const logger = new DefaultGateRunnerLogger();
      logger.info('info', { count: 1 }); logger.debug('debug');
      expect(writes.join('')).toContain('[GateRunner INFO] info {"count":1}');
      expect(writes.join('')).toContain('[GateRunner DEBUG] debug');
      expect(stdout).not.toHaveBeenCalled();
    } finally { stderr.mockRestore(); stdout.mockRestore(); }
  });
});

import { promiseFromSync } from '@specforge/types';
import { describe, expect, it } from 'vitest';

describe('promise-producing callback contract', () => {
  it('runs the operation synchronously and delivers fulfillment in a microtask', async () => {
    const events: string[] = [];
    const result = promiseFromSync(() => { events.push('operation'); return 17; });
    events.push('caller');
    const completion = result.then(value => { events.push('fulfilled'); return value; });
    expect(events).toEqual(['operation', 'caller']);
    await expect(completion).resolves.toBe(17);
    expect(events).toEqual(['operation', 'caller', 'fulfilled']);
  });
  it('converts a synchronous throw to a rejection without throwing at the call site', async () => {
    const failure = new Error('operation failed');
    let result: Promise<never> | undefined;
    expect(() => { result = promiseFromSync(() => { throw failure; }); }).not.toThrow();
    if (!result) throw new Error('PROMISE_RESULT_MISSING');
    await expect(result).rejects.toBe(failure);
  });
  it('adopts promises, thenables and void return values', async () => {
    await expect(promiseFromSync(() => Promise.resolve(7))).resolves.toBe(7);
    const thenable = { then(resolve: (value: number) => void): void { resolve(9); } };
    await expect(promiseFromSync(() => thenable)).resolves.toBe(9);
    await expect(promiseFromSync(() => undefined)).resolves.toBeUndefined();
  });
  it('rejects a throwing then getter and preserves lexical receiver/arguments through the callback', async () => {
    const failure = new Error('then access');
    const thenable = { get then(): undefined { throw failure; } };
    await expect(promiseFromSync(() => thenable)).rejects.toBe(failure);
    const receiver = { base: 4, calculate(value: number): Promise<number> { return promiseFromSync(() => this.base + value); } };
    await expect(receiver.calculate(3)).resolves.toBe(7);
  });
});

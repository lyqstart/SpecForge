import { describe, expect, it, vi } from 'vitest';

import { LLMKernelIntegration } from '../../src/agent/LLMKernelIntegration';

describe('delay timer ownership', () => {
  it('keeps the timer registered across microtasks until it actually fires', async () => {
    vi.useFakeTimers();
    const integration = new LLMKernelIntegration();
    try {
      const pending = integration['delay'](100);
      await Promise.resolve();
      expect(integration['pendingTimers'].size).toBe(1);
      await vi.advanceTimersByTimeAsync(100);
      await pending;
      expect(integration['pendingTimers'].size).toBe(0);
    } finally { await integration.dispose(); vi.useRealTimers(); }
  });
  it('lets disposal cancel a delay that has not fired', async () => {
    vi.useFakeTimers();
    const integration = new LLMKernelIntegration();
    try {
      let completed = false;
      const pending = integration['delay'](100);
      const observed = pending.then(() => { completed = true; });
      await Promise.resolve();
      await integration.dispose();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(100);
      expect(completed).toBe(false);
      void observed; // Intentionally pending after its owned timer is cancelled; no live handle remains.
    } finally { await integration.dispose(); vi.useRealTimers(); }
  });
});

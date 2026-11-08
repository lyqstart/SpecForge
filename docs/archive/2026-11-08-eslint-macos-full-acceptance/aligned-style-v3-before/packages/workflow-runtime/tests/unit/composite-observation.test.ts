import { describe, expect, it } from 'vitest';
import { requireCompositeObservation } from '../composite-observation';

describe('composite test observation guard', () => {
  it('retains the actual object and child identities after checking observed fields', () => {
    const child = { passed: false, reason: 'blocked', details: { gateId: 'child' } };
    const details = { results: [child], total: 1, passed: 0, failed: 1, failPolicy: 'fail_fast', cancelledGates: ['pending'], extension: { opaque: true } };
    const observed = requireCompositeObservation(details);
    expect(observed).toBe(details);
    expect(observed.results[0]).toBe(child);
    expect(observed.failed).toBe(1);
  });
  it('fails rather than manufacturing missing or incorrectly typed observations', () => {
    const invalid: unknown[] = [undefined, null, {}, { results: [{}] }, { results: [{ passed: 1 }] }, { results: [{ passed: true, reason: {} }] }, { results: [], failPolicy: {} }, { results: [], cancelledGates: [1] }, { results: [], total: -1 }, { results: [], passed: NaN }];
    for (const value of invalid) expect(() => requireCompositeObservation(value)).toThrow();
  });
});

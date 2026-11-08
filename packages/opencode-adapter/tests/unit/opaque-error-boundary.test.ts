import { describe, expect, it } from 'vitest';
import { classifyError } from '../../src/errors/ErrorClassifier';

describe('unknown error diagnostic boundary', () => {
  it('never invokes user object coercion while classifying an unknown error', () => {
    const opaque = { toString(): never { throw new Error('COERCION_MUST_NOT_RUN'); } };
    const result = classifyError(opaque);
    expect(result.retryable).toBe(false);
    expect(result.message).toContain('unknown error');
    expect(result.message).not.toContain('COERCION_MUST_NOT_RUN');
  });
  it('retains timeout classification for supported string and Error inputs', () => {
    expect(classifyError('request timeout').retryable).toBe(true);
    expect(classifyError(new Error('request timeout')).retryable).toBe(true);
  });
});

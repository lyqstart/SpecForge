import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    userInfo: vi.fn(() => {
      throw new Error('uv_os_get_passwd failed');
    }),
  };
});

import { resolveHostUsername } from './scanner.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveHostUsername', () => {
  it('falls back to USERNAME when OS user lookup is unavailable', () => {
    vi.stubEnv('USERNAME', 'specforge-test-user');
    vi.stubEnv('USER', '');

    expect(resolveHostUsername()).toBe('specforge-test-user');
  });

  it('uses an explicit unknown marker when no fallback identity exists', () => {
    vi.stubEnv('USERNAME', '');
    vi.stubEnv('USER', '');

    expect(resolveHostUsername()).toBe('unknown');
  });
});

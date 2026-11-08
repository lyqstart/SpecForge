import { hasAsciiControl } from '@specforge/types';
import { describe, expect, it } from 'vitest';

describe('ASCII control contract', () => {
  it('preserves each exact ASCII boundary and optional space/DEL rejection', () => {
    for (let code = 0; code <= 255; code++) {
      const input = 'prefix' + String.fromCharCode(code) + 'suffix';
      expect(hasAsciiControl(input)).toBe(code <= 31);
      expect(hasAsciiControl(input, { includeSpace: true })).toBe(code <= 32);
      expect(hasAsciiControl(input, { includeDelete: true })).toBe(code <= 31 || code === 127);
    }
    expect(hasAsciiControl('')).toBe(false);
    expect(hasAsciiControl('中文😀/path')).toBe(false);
  });
});

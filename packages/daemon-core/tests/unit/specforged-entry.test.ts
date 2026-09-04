import { describe, expect, it } from 'vitest';

import { parseSpecforgedArgs } from '../../src/specforged';

describe('specforged runtime entry', () => {
  it('accepts the service start contract', () => {
    expect(parseSpecforgedArgs(['start', '--foreground'])).toEqual({
      command: 'start',
      foreground: true,
    });
  });

  it('supports a side-effect-free version probe', () => {
    expect(parseSpecforgedArgs(['--version'])).toEqual({ command: 'version' });
  });

  it('rejects unsupported commands instead of silently starting', () => {
    expect(() => parseSpecforgedArgs(['legacy-start'])).toThrow('UNSUPPORTED_SPECFORGED_COMMAND');
  });
});

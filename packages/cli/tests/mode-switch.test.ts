/**
 * Unit tests for ModeSwitch (packages/cli/src/mode-switch.ts).
 *
 * Coverage:
 *  - default human mode when no --json
 *  - --json flag triggers json mode
 *  - error formatting differs cleanly between modes
 *  - success / data formatting differ between modes
 *
 * Validates: Requirements 1.1, 1.2 (cli spec).
 */

import { describe, it, expect } from 'bun:test';
import {
  ModeSwitch,
  detectMode,
  formatError,
  formatData,
  formatSuccess,
} from '../src/mode-switch';

describe('detectMode', () => {
  it('defaults to "human" when argv is empty', () => {
    expect(detectMode([])).toBe('human');
  });

  it('returns "human" when no --json flag is present', () => {
    expect(detectMode(['daemon', 'status'])).toBe('human');
    expect(detectMode(['--verbose', 'spec', 'start'])).toBe('human');
    expect(detectMode(['workflow', 'list', '-v'])).toBe('human');
  });

  it('returns "json" when --json flag is present anywhere in argv', () => {
    expect(detectMode(['--json'])).toBe('json');
    expect(detectMode(['daemon', 'status', '--json'])).toBe('json');
    expect(detectMode(['--json', 'workflow', 'list'])).toBe('json');
    expect(detectMode(['spec', '--json', 'start'])).toBe('json');
  });

  it('returns "json" for the short alias -j', () => {
    expect(detectMode(['-j'])).toBe('json');
    expect(detectMode(['daemon', 'status', '-j'])).toBe('json');
  });

  it('returns "json" for assignment form --json=true', () => {
    expect(detectMode(['--json=true'])).toBe('json');
  });

  it('does not confuse --json with substring tokens', () => {
    // tokens that contain "json" but are not the flag must not flip the mode
    expect(detectMode(['--no-json'])).toBe('human');
    expect(detectMode(['workflow', 'json-output'])).toBe('human');
  });
});

describe('ModeSwitch', () => {
  it('defaults to human mode when given no argv', () => {
    const ms = new ModeSwitch([]);
    expect(ms.mode).toBe('human');
    expect(ms.isHuman()).toBe(true);
    expect(ms.isJson()).toBe(false);
  });

  it('switches to json mode when argv contains --json', () => {
    const ms = new ModeSwitch(['daemon', 'status', '--json']);
    expect(ms.mode).toBe('json');
    expect(ms.isJson()).toBe(true);
    expect(ms.isHuman()).toBe(false);
  });

  it('accepts an explicit literal mode', () => {
    expect(new ModeSwitch('json').mode).toBe('json');
    expect(new ModeSwitch('human').mode).toBe('human');
  });
});

describe('formatError', () => {
  const err = {
    message: 'Daemon unreachable',
    code: 'daemon_unreachable',
    hint: "Is the Daemon running? Try 'specforge daemon start'",
  };

  it('produces a plain-text Error/Hint block in human mode', () => {
    const out = formatError(err, 'human');
    expect(out).toContain('Error: Daemon unreachable');
    expect(out).toContain("Hint: Is the Daemon running?");
    // Human mode is not valid JSON — that is the contract.
    expect(() => JSON.parse(out)).toThrow();
  });

  it('produces stable, parseable JSON in json mode', () => {
    const out = formatError(err, 'json');
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      error: true,
      code: 'daemon_unreachable',
      message: 'Daemon unreachable',
      hint: "Is the Daemon running? Try 'specforge daemon start'",
    });
  });

  it('omits hint key when no hint is provided (json mode)', () => {
    const out = formatError({ message: 'boom', code: 'kaboom' }, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.hint).toBeUndefined();
    expect(parsed.code).toBe('kaboom');
  });

  it('falls back to "unknown_error" when no code is provided (json mode)', () => {
    const parsed = JSON.parse(formatError({ message: 'boom' }, 'json'));
    expect(parsed.code).toBe('unknown_error');
  });

  it('produces materially different output between modes', () => {
    const human = formatError(err, 'human');
    const json = formatError(err, 'json');
    expect(human).not.toBe(json);
    // The "Hint:" prose lives only in human mode (json uses a hint key).
    expect(human.startsWith('Error:')).toBe(true);
    expect(json.startsWith('{')).toBe(true);
  });
});

describe('formatData', () => {
  it('emits compact JSON in json mode for objects', () => {
    expect(formatData({ a: 1, b: 'x' }, 'json')).toBe('{"a":1,"b":"x"}');
  });

  it('JSON-encodes strings in json mode', () => {
    expect(formatData('hello', 'json')).toBe('"hello"');
  });

  it('returns strings as-is in human mode', () => {
    expect(formatData('hello', 'human')).toBe('hello');
  });

  it('pretty-prints objects in human mode', () => {
    const out = formatData({ a: 1 }, 'human');
    expect(out).toContain('\n');
    expect(out).toContain('"a": 1');
  });
});

describe('formatSuccess', () => {
  it('uses a checkmark prefix in human mode', () => {
    expect(formatSuccess('done', 'human')).toBe('✓ done');
  });

  it('emits a structured object in json mode', () => {
    const parsed = JSON.parse(formatSuccess('done', 'json'));
    expect(parsed).toEqual({ success: true, message: 'done' });
  });

  it('produces materially different output between modes', () => {
    expect(formatSuccess('ok', 'human')).not.toBe(formatSuccess('ok', 'json'));
  });
});

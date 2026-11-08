import { describe, expect, it } from 'vitest';
import { sanitizeForJson, stripAnsi } from '../../src/commands/services/json-payload';

describe('JSON output terminal control boundary', () => {
  it('removes styling and terminal hyperlinks while preserving ordinary Unicode', () => {
    expect(stripAnsi('\u001b[31m中文 red\u001b[0m')).toBe('中文 red');
    expect(stripAnsi('\u001b]8;;https://example.invalid\u0007link\u001b]8;;\u0007')).toBe('link');
    expect(stripAnsi('array[0] (text) /path')).toBe('array[0] (text) /path');
  });
  it('keeps the machine-readable nested JSON shape and primitive values', () => {
    const input = { items: ['\u001b[32mok\u001b[0m', 0, false, null], note: '中文' };
    const result = sanitizeForJson(input);
    expect(result).toEqual({ items: ['ok', 0, false, null], note: '中文' });
    expect(input.items[0]).toContain('\u001b');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

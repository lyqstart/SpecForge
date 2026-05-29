import { describe, test, expect } from 'bun:test';
import { VIOLATION_PATTERNS, shouldSkipLine } from '../check-hardcoded-paths';

describe('VIOLATION_PATTERNS[1] (specforge/ 路径前缀)', () => {
  const pattern = VIOLATION_PATTERNS[1];

  test('T1: specforge/ 匹配（向后兼容）', () => {
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test(`'specforge/'`)).toBe(true);
  });

  test('T2: specforge/config 匹配', () => {
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test(`'specforge/config'`)).toBe(true);
  });

  test('T3: specforge/runtime/state.json 匹配', () => {
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test(`'specforge/runtime/state.json'`)).toBe(true);
  });

  test('T4: @specforge/types 不匹配（npm scope）', () => {
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test(`'@specforge/types'`)).toBe(false);
  });

  test('T5: @specforge/observability 不匹配（npm scope）', () => {
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test(`'@specforge/observability'`)).toBe(false);
  });
});

describe('shouldSkipLine', () => {
  test('T6: 行注释被跳过', () => {
    expect(shouldSkipLine('// some specforge/foo', '.ts')).toBe(true);
  });
});

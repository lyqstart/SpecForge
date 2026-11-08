import { diagnosticScalarText, parseJsonObject, scalarText } from '@specforge/types';
import { describe, expect, it } from 'vitest';

describe('scalar text and JSON object boundaries', () => {
  it('preserves supported scalar representations, including empty and false values', () => {
    const cases: [unknown, string][] = [['中文', '中文'], ['', ''], [0, '0'], [-0, '0'], [false, 'false'], [true, 'true'], [null, 'null'], [undefined, 'undefined'], [12n, '12'], [Symbol('id'), 'Symbol(id)'], [NaN, 'NaN'], [Infinity, 'Infinity']];
    for (const [input, expected] of cases) {
      expect(scalarText(input)).toBe(expected);
      expect(diagnosticScalarText(input)).toBe(expected);
    }
  });
  it('rejects semantic objects without invoking coercion or exposing their fields', () => {
    let coercions = 0;
    const opaque = { secret: 'MUST_NOT_APPEAR', toString(): never { coercions++; throw new Error('COERCION'); } };
    for (const value of [opaque, {}, [], new Date(), (): void => undefined]) {
      expect(() => scalarText(value)).toThrow('TEXT_VALUE_MUST_BE_SCALAR');
      expect(diagnosticScalarText(value)).not.toContain('MUST_NOT_APPEAR');
    }
    expect(coercions).toBe(0);
    expect(diagnosticScalarText(opaque)).toBe('[invalid object]');
  });
  it('requires an object after actual JSON parsing and preserves data without prototype mutation', () => {
    for (const input of ['null', '[]', 'true', '17', '"text"']) expect(() => parseJsonObject(input)).toThrow('JSON_OBJECT_REQUIRED');
    expect(() => parseJsonObject('{')).toThrow(SyntaxError);
    const result = parseJsonObject('{"__proto__":{"polluted":true},"status":"passed","nested":[0,false,null]}');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(result.status).toBe('passed');
    expect(result.nested).toEqual([0, false, null]);
  });
});

/** Convert JSON scalar text without invoking an object's user-defined coercion. */
export function scalarText(value: unknown): string {
  switch (typeof value) {
    case 'string': return value;
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
    case 'undefined': return String(value);
    case 'object': if (value === null) return 'null';
  }
  throw new TypeError('TEXT_VALUE_MUST_BE_SCALAR');
}

/** Diagnostics may describe malformed input, but never invoke or print an object. */
export function diagnosticScalarText(value: unknown): string {
  if (typeof value === 'object' && value !== null) return '[invalid object]';
  if (typeof value === 'function') return '[invalid function]';
  return scalarText(value);
}

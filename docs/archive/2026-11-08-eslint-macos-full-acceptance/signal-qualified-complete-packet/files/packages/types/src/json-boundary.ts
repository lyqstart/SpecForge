/** JSON object boundary. Schema/field validation remains the caller's responsibility. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('JSON_OBJECT_REQUIRED');
  return { ...value };
}

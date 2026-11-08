export function permissionRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(code);
  }
  return value as Record<string, unknown>;
}

type PermissionTextField = 'agentRole' | 'id' | 'type' | 'path' | 'effect' | 'action' | 'resource';

export function optionalPermissionText(value: unknown, field: PermissionTextField): string {
  if (value === null || value === undefined) return '';
  const object = permissionRecord(value, 'PERMISSION_INPUT_OBJECT_REQUIRED');
  const text = object[field];
  if (text === null || text === undefined) return '';
  if (typeof text !== 'string') throw new TypeError(`PERMISSION_STRING_FIELD_REQUIRED:${field}`);
  return text;
}

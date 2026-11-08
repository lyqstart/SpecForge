/** A test fixture must exist before its fields or methods can be inspected. */
export function requiredTestValue<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) throw new Error('TEST_FIXTURE_VALUE_REQUIRED');
  return value;
}

/** Test observations validate only fields they inspect; this is not a Gate schema validator. */
interface ChildObservation {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}
export interface CompositeObservation extends Record<string, unknown> {
  results: ChildObservation[];
  failPolicy?: 'fail_fast' | 'collect_all';
  cancelledGates?: string[];
  total?: number;
  passed?: number;
  failed?: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isChild(value: unknown): value is ChildObservation {
  return isRecord(value) && typeof value.passed === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.details === undefined || isRecord(value.details));
}
export function requireCompositeObservation(value: unknown): CompositeObservation {
  if (!isRecord(value) || !Array.isArray(value.results) || !value.results.every(isChild)) throw new Error('Composite observation must contain real child results');
  if (value.failPolicy !== undefined && value.failPolicy !== 'fail_fast' && value.failPolicy !== 'collect_all') throw new Error('Invalid observed fail policy');
  if (value.cancelledGates !== undefined && (!Array.isArray(value.cancelledGates) || !value.cancelledGates.every((item: unknown) => typeof item === 'string'))) throw new Error('Invalid observed cancelled gates');
  for (const name of ['total', 'passed', 'failed']) {
    const count = value[name];
    if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) throw new Error('Invalid observed composite count');
  }
  // Every declared field is checked above; extension fields retain unknown values.
  return value as CompositeObservation;
}

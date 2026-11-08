/** Preserve the result, rejection and synchronous side effects of a promise-producing callback. */
export function promiseFromSync<T>(operation: () => T): Promise<Awaited<T>> {
  // The Promise resolution procedure adopts returned promises/thenables and catches synchronous throws.
  // Awaited<T> describes that runtime resolution; the constructor's generic alone does not unwrap T.
  return new Promise<T>(resolve => resolve(operation())) as Promise<Awaited<T>>;
}

/**
 * tool-wrapper.ts — ToolInvocation type & wrapToolCall utility
 *
 * Standalone new module for the write-guard domain.
 * Provides a generic wrapper for recording tool invocations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolInvocation {
  toolName: string;
  args: Record<string, unknown>;
  startedAt: number;
  finishedAt: number | null;
  result: unknown;
  error: string | null;
}

// ---------------------------------------------------------------------------
// wrapToolCall
// ---------------------------------------------------------------------------

/**
 * Wrap a tool call to record invocation metadata.
 *
 * The wrapper captures start/finish timestamps, the result, and any error
 * that occurs during execution.  It does NOT impose write-guard checks;
 * that responsibility belongs to the caller.
 */
export async function wrapToolCall<T>(
  toolName: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<{ invocation: ToolInvocation; result: T }> {
  const startedAt = Date.now();
  let finishedAt: number | null = null;
  let error: string | null = null;
  let result: unknown;

  try {
    result = await fn();
    finishedAt = Date.now();
  } catch (err: unknown) {
    finishedAt = Date.now();
    error = err instanceof Error ? err.message : String(err);
    throw err;
  }

  const invocation: ToolInvocation = {
    toolName,
    args,
    startedAt,
    finishedAt,
    result,
    error,
  };

  return { invocation, result: result as T };
}

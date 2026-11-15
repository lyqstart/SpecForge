import * as fs from 'node:fs';
import * as path from 'node:path';

// Gate evidence and its stop must become visible before another mutation starts.
// Ordinary independent owner writes retain their existing concurrency behavior.
const operations = new Map<string, { gate: boolean; writers: number }>();
export async function withGateOperationBarrier<T>(
  projectRoot: string,
  tool: string,
  readOnly: boolean,
  action: () => Promise<T>
): Promise<T | { success: false; error: string; retry_allowed: boolean }> {
  if (readOnly) return action();
  const resolved = fs.existsSync(projectRoot)
    ? fs.realpathSync.native(projectRoot)
    : path.resolve(projectRoot);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const gate = ['sf_gate_run', 'sf_v11_gate_run'].includes(tool.toLowerCase().replace(/-/g, '_'));
  const current = operations.get(key) ?? { gate: false, writers: 0 };
  if (current.gate || (gate && current.writers > 0))
    return {
      success: false,
      error: 'GATE_OPERATION_IN_PROGRESS: re-read authoritative state before retry',
      retry_allowed: true,
    };
  current.gate = gate;
  current.writers += 1;
  operations.set(key, current);
  try {
    return await action();
  } finally {
    current.writers -= 1;
    if (gate) current.gate = false;
    if (current.writers === 0) operations.delete(key);
  }
}

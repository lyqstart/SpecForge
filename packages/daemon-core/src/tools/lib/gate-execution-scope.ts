import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

type Scope = { directory: string; start: string; context: string; active: boolean };
const storage = new AsyncLocalStorage<Scope>();
const digest = (file: string): string => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2097152)
    throw new Error('GATE_EXECUTION_SCOPE_UNSAFE_INPUT');
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
};
const canonical = (directory: string): string => {
  const value = fs.realpathSync.native(directory);
  return process.platform === 'win32' ? value.toLowerCase() : value;
};

/** Only the actual Gate chain creates this process-local, bounded read context. */
export async function withGateExecutionScope<T>(
  directory: string,
  action: () => Promise<T>
): Promise<T> {
  const scope: Scope = {
    directory: canonical(directory),
    start: digest(path.join(directory, 'attempt-start.json')),
    context: digest(path.join(directory, 'candidate-repair-context.json')),
    active: true,
  };
  try {
    return await storage.run(scope, action);
  } finally {
    scope.active = false;
  }
}

/** Not a mutation exemption. The caller must be the internal evidence-consumption path. */
export function isCurrentGateEvidenceAttempt(directory: string): boolean {
  const scope = storage.getStore();
  if (!scope?.active || canonical(directory) !== scope.directory) return false;
  if (fs.existsSync(path.join(directory, 'attempt-result.json'))) return false;
  if (
    digest(path.join(directory, 'attempt-start.json')) !== scope.start ||
    digest(path.join(directory, 'candidate-repair-context.json')) !== scope.context
  )
    throw new Error('GATE_EXECUTION_SCOPE_INPUT_DRIFT');
  return true;
}

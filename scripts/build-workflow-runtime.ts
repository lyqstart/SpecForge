import { unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/workflow-runtime');
const output = resolve(root, 'dist/src');
// tsc preserves obsolete output. Remove only these retired, package-owned files;
// never recursively clean a supplied path or touch a project's runtime state.
for (const stem of [
  'WorkflowPersistence', 'StateRecoveryManager', 'events/EventLogReader',
  'storage/WorkflowInstanceStorage', 'storage/AtomicWorkflowInstanceStorage', 'storage/index',
]) {
  for (const extension of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
    const file = resolve(output, stem + extension);
    const local = relative(output, file);
    if (local.startsWith('..') || resolve(output, local) !== file) throw new Error('BUILD_OUTPUT_PATH_ESCAPE');
    try { unlinkSync(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
const require = createRequire(resolve(root, 'package.json'));
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc')], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

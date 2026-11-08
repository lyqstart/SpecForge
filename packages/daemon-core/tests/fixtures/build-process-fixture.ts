import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

/** Exercise an isolated Bun process with the same bundled module boundary as release. */
export function buildProcessFixture(source: string, root: string): string {
  const target = path.join(root, 'process-fixture.js');
  const result = spawnSync(process.env.npm_execpath!, ['build', source, '--target=bun', `--outdir=${root}`, '--entry-naming=process-fixture.js'],
    { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`PROCESS_FIXTURE_BUILD_FAILED:${result.status}:${result.error?.message ?? result.stderr}`);
  if (!existsSync(target)) throw new Error('PROCESS_FIXTURE_ENTRY_MISSING');
  return target;
}

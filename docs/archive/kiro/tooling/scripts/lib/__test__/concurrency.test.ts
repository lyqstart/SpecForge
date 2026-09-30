/**
 * Quick self-test: 10 concurrent writers to the same meta file must
 * all succeed and produce a final count of 10 tasks in the file.
 *
 * Run with: bun run scripts/lib/__test__/concurrency.test.ts
 *
 * schema_version: 1.0
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { updateMetaFile, readMetaFile } from '../meta-store';

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), `sync-task-status-test-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const metaPath = path.join(dir, 'spec.meta.json');
  await fs.writeFile(metaPath, JSON.stringify({ tasks: {} }, null, 2));

  const N = 10;
  const writers = Array.from({ length: N }, (_, i) =>
    updateMetaFile(metaPath, (cur) => ({
      tasks: {
        ...cur.tasks,
        [`task-${i}`]: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          taskId: `task-${i}`,
          specUri: 'file:///tmp/test',
          executionHistory: [],
          executionStatus: 'succeed',
        },
      },
    })),
  );

  const t0 = performance.now();
  await Promise.all(writers);
  const elapsed = performance.now() - t0;

  const final = await readMetaFile(metaPath);
  const got = Object.keys(final.tasks).length;

  await fs.rm(dir, { recursive: true, force: true });

  if (got !== N) {
    console.error(`FAIL: expected ${N} tasks, got ${got}`);
    process.exit(1);
  }
  console.log(`ok  ${N} concurrent writers in ${elapsed.toFixed(0)}ms  final tasks=${got}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

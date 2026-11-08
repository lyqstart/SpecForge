import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as runtime from '../../src/index.js';

const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const retired = [
  'WorkflowPersistence', 'createWorkflowPersistence',
  'createWorkflowInstanceStorage', 'StateRecoveryManager', 'createStateRecoveryManager',
];

describe('SPS §8: Daemon owns workflow-state persistence', () => {
  it('keeps orchestration public without exporting independent persistence owners', () => {
    expect(runtime.WorkflowEngine).toBeTypeOf('function');
    expect(runtime.WorkflowLoader).toBeTypeOf('function');
    for (const name of retired) expect(runtime, name).not.toHaveProperty(name);
  });

  it('closes package deep imports of retired owners rather than merely hiding root names', () => {
    expect(manifest.exports?.['.']?.import).toBe('./dist/src/index.js');
    const require = createRequire(resolve(root, 'package.json'));
    for (const subpath of ['WorkflowPersistence', 'dist/src/WorkflowPersistence.js', 'storage', 'dist/src/storage/index.js']) {
      expect(() => require.resolve('@specforge/workflow-runtime/' + subpath)).toThrow(
        expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
      );
    }
  });

  it('excludes legacy physical persistence from the current source/build input set', () => {
    for (const name of [
      'WorkflowPersistence.ts', 'StateRecoveryManager.ts', 'events/EventLogReader.ts',
      'storage/WorkflowInstanceStorage.ts', 'storage/AtomicWorkflowInstanceStorage.ts', 'storage/index.ts',
    ]) expect(existsSync(resolve(root, 'src', name)), name).toBe(false);
  });
});

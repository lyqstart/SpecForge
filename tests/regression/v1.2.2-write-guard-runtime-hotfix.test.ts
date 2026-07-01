import { describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extractShellWriteTargets } from '../../packages/daemon-core/src/tools/lib/write-guard-runtime-v12';
import { releaseCodePermission } from '../../packages/daemon-core/src/tools/lib/code-permission-service-v11';

describe('v1.2.2 write guard runtime hotfix', () => {
  test('ignores file descriptor and null-sink redirections', () => {
    expect(extractShellWriteTargets('ls missing 2>&1')).toEqual([]);
    expect(extractShellWriteTargets('test -f package.json >/dev/null 2>&1')).toEqual([]);
    expect(extractShellWriteTargets('cmd /c dir 1>NUL 2>NUL')).toEqual([]);
  });

  test('still detects real shell redirection writes', () => {
    expect(extractShellWriteTargets('echo hello > packages/backend/src/a.ts')).toContainEqual({
      path: 'packages/backend/src/a.ts',
      operation: 'modify',
    });
    expect(extractShellWriteTargets('node run.js 2> logs/errors.txt')).toContainEqual({
      path: 'logs/errors.txt',
      operation: 'modify',
    });
  });

  test('extends existing allowed_write_files instead of overwriting them', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sf-v122-permission-'));
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0001');

    try {
      await mkdir(workItemDir, { recursive: true });
      await writeFile(
        path.join(workItemDir, 'work_item.json'),
        JSON.stringify(
          {
            schema_version: '1.0',
            work_item_id: 'WI-0001',
            status: 'implementation_running',
            workflow_path: 'code_only_fast_path',
            code_change_allowed: false,
            allowed_write_files: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      );

      await releaseCodePermission({
        workItemDir,
        workItemId: 'WI-0001',
        allowedWriteFiles: [{ path: 'packages/backend/src/a.ts', operation: 'modify' }],
      });
      await releaseCodePermission({
        workItemDir,
        workItemId: 'WI-0001',
        allowedWriteFiles: [{ path: 'packages/backend/src/b.ts', operation: 'modify' }],
      });

      const wi = JSON.parse(await readFile(path.join(workItemDir, 'work_item.json'), 'utf-8'));
      const paths = wi.allowed_write_files.map((entry: { path: string }) => entry.path);

      expect(paths).toContain('packages/backend/src/a.ts');
      expect(paths).toContain('packages/backend/src/b.ts');
      expect(wi.code_permission_release_count).toBe(2);
      expect(wi.code_permission_last_release_mode).toBe('extend');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

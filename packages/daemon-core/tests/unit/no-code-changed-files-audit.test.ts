/**
 * no-code-changed-files-audit.test.ts
 *
 * Regression for v1.3.2: investigation/no-code Work Items must be able to
 * produce a truthful changed_files_audit.md without enabling code_permission.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import '../../src/tools/handlers/sf-changed-files-audit.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

async function createNoCodeWorkItem(projectRoot: string, workItemId = 'WI-0001'): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.specforge', 'runtime'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, '.specforge', 'manifest.json'), '{}\n');
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'implementation_running',
        workflow_type: 'investigation',
        workflow_path: 'requirement_change_path',
        code_change_allowed: false,
        allowed_write_files: [],
      },
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({ work_item_id: workItemId, workflow_type: 'investigation', workflow_path: 'requirement_change_path' }) + '\n',
  );
  return wiDir;
}

describe('sf_changed_files_audit no_code_change mode', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-no-code-audit-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a PASS not_applicable audit for investigation WI without code_permission', async () => {
    const wiDir = await createNoCodeWorkItem(tmpDir);
    const handler = getHandler('sf_changed_files_audit')!;

    const result = await handler(
      { work_item_id: 'WI-0001', mode: 'no_code_change', command: 'investigation review with no business writes' },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(true);
    expect((result as any).passed).toBe(true);
    expect((result as any).status).toBe('not_applicable');
    expect((result as any).code_permission_was_never_enabled).toBe(true);

    const audit = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(audit).toContain('Mode: no_code_change / not_applicable');
    expect(audit).toContain('## Result: PASS');
    expect(audit).toContain('not_applicable / no_code_change / PASS');
  });

  it('clears a CODE_PERMISSION_NOT_ENABLED hard_stop only after no-code audit passes', async () => {
    const wiDir = await createNoCodeWorkItem(tmpDir);
    await fs.writeFile(
      path.join(wiDir, 'hard_stop.json'),
      JSON.stringify(
        {
          schema_version: '1.2',
          hard_stop_id: 'HS-TEST',
          scope: 'work_item',
          work_item_id: 'WI-0001',
          blocked: true,
          reason: 'CODE_PERMISSION_NOT_ENABLED: code_permission was never enabled for this WI.',
          source_tool: 'sf_changed_files_audit',
          created_at: new Date().toISOString(),
          resolved: false,
        },
        null,
        2,
      ) + '\n',
    );

    const handler = getHandler('sf_changed_files_audit')!;
    const result = await handler(
      { work_item_id: 'WI-0001', mode: 'no_code_change' },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(true);
    expect((result as any).passed).toBe(true);
    expect((result as any).cleared_code_permission_hard_stop).toBe(true);
    await expect(fs.access(path.join(wiDir, 'hard_stop.json'))).rejects.toThrow();
  });

  it('rejects no_code_change mode for normal feature_spec implementation WI', async () => {
    const wiDir = await createNoCodeWorkItem(tmpDir);
    const wiPath = path.join(wiDir, 'work_item.json');
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    wi.workflow_type = 'feature_spec';
    await fs.writeFile(wiPath, JSON.stringify(wi, null, 2) + '\n');

    const handler = getHandler('sf_changed_files_audit')!;
    const result = await handler(
      { work_item_id: 'WI-0001', mode: 'no_code_change' },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(true);
    expect((result as any).passed).toBe(false);
    expect((result as any).violations.join('\n')).toContain('workflow_type/workflow_path is not allowed');
    const audit = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(audit).toContain('## Result: FAIL');
  });
});

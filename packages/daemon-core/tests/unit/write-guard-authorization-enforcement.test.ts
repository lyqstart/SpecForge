import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHandler } from '../../src/tools/ToolDispatcher';
import { appendWriteGuardAuthorization } from '../../src/tools/lib/write-guard-authorization-log';
import '../../src/tools/handlers/sf-safe-bash';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-write-auth-enforcement-'));
  fs.mkdirSync(path.join(root, '.specforge', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specforge', 'work-items', 'WI-0001'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specforge', 'runtime', 'state.json'),
    JSON.stringify({
      workItems: [
        { work_item_id: 'WI-0001', current_state: 'implementation_running' },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(root, '.specforge', 'work-items', 'WI-0001', 'work_item.json'),
    JSON.stringify({
      schema_version: '1.1',
      work_item_id: 'WI-0001',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      code_change_allowed: true,
      code_permission_revoked: false,
      allowed_write_files: [{ path: 'src/allowed.ts', operation: 'modify' }],
    }),
  );
  appendWriteGuardAuthorization(root, {
    authorization_id: 'AUTH-DOCKER-WI-0001',
    source_hard_stop_id: 'HS-DOCKER-WI-0001',
    work_item_id: 'WI-0001',
    authorization_type: 'user_accepted_external_ops',
    scope: 'work_item',
    tool: 'sf_safe_bash',
    command_family: 'docker_run',
    image: 'example/build:latest',
    expires_when: 'work_item_closed',
    user_response_quote: '用户明确授权当前工作项中的 Docker 构建操作',
    reason: 'The user authorized this bounded external build operation.',
    created_by: 'sf-orchestrator',
  });
  return root;
}

describe('sf_safe_bash write-guard authorization enforcement', () => {
  const roots: string[] = [];
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    const registered = getHandler('sf_safe_bash');
    if (!registered) throw new Error('sf_safe_bash handler not registered');
    handler = registered;
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not let a matching external-operation authorization bypass a local out-of-scope write', async () => {
    const root = makeProject();
    roots.push(root);

    const result = await handler(
      {
        command:
          'docker run --rm example/build:latest build; Set-Content -Path src/denied.ts -Value denied',
        work_item_id: 'WI-0001',
      },
      { directory: root, agent: 'agent' },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WRITE_GUARD_RUNTIME_BLOCKED');
    expect(result.error).toContain('file+operation not in allowed_write_files');
    expect(result.write_guard_authorized).not.toBe(true);
    expect(fs.existsSync(path.join(root, 'src', 'denied.ts'))).toBe(false);
  });

  it('preserves matching authorization metadata after runtime enforcement allows the command', async () => {
    const root = makeProject();
    roots.push(root);
    appendWriteGuardAuthorization(root, {
      authorization_id: 'AUTH-READ-WI-0001',
      source_hard_stop_id: 'HS-READ-WI-0001',
      work_item_id: 'WI-0001',
      authorization_type: 'user_authorized_retry',
      scope: 'work_item',
      tool: 'sf_safe_bash',
      command_family: 'write-output',
      expires_when: 'work_item_closed',
      user_response_quote: '用户明确授权当前工作项中的只读重试操作',
      reason: 'The user authorized this bounded retry operation.',
      created_by: 'sf-orchestrator',
    });

    const result = await handler(
      {
        command: 'Write-Output authorized',
        work_item_id: 'WI-0001',
        cwd: path.join(root, 'does-not-exist'),
      },
      { directory: root, agent: 'agent' },
      {},
    );

    expect(result.write_guard_authorized).toBe(true);
    expect(result.write_guard_authorization_id).toBe('AUTH-READ-WI-0001');
    expect(result.write_guard_authorization_type).toBe('user_authorized_retry');
    expect(result.write_guard_authorization_scope).toBe('work_item');
  });
});
